// @ts-check
// Study prototype: one database seam over D1, node:sqlite and Postgres.
//
// The service's writes stay atomic as a LIST of statements, because D1 refuses BEGIN and runs a list atomically only
// through batch(). The same list runs as BEGIN/COMMIT on node:sqlite and as a real transaction on Postgres, so code
// written against `atomic` keeps one shape on every backend. A query library is only the compiler here: Kysely
// queries go in as `.compile()` output, Drizzle queries as `.toSQL()` output, and on D1 an unconverted
// `db.prepare(...).bind(...)` statement may ride the same list while a module is half converted.
//
// On D1 and SQLite Kysely never executes anything: one compile-only instance per dialect (a DummyDriver) builds the
// SQL, and the seam runs it. So no D1 dialect package is needed, and no Kysely object is built per request.

import {
  Kysely, DummyDriver, PostgresDialect, PGliteDialect,
  SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler,
} from 'kysely';

/**
 * @typedef {{ sql: string, parameters?: readonly unknown[], params?: readonly unknown[] }} Compiled
 *   A statement compiled by a query library: Kysely's `{ sql, parameters }` or Drizzle's `{ sql, params }`.
 * @typedef {{ bind: Function, first: Function, all: Function, run: Function }} D1Statement
 * @typedef {{ rows: any[], changes: number }} Result
 * @typedef {'sqlite' | 'postgres'} Dialect
 * @typedef {{
 *   dialect: Dialect,
 *   backend: 'd1' | 'node-sqlite' | 'postgres',
 *   kysely: Kysely<any>,
 *   run: (q: Compiled | { compile: () => Compiled }) => Promise<Result>,
 *   atomic: (list: Array<Compiled | { compile: () => Compiled } | D1Statement>) => Promise<Result[]>,
 * }} SqlDb
 */

/** The SQLite compiler with no connection: shared by every D1 and node:sqlite seam. */
const sqliteCompiler = new Kysely({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

/** @param {any} q @returns {Compiled} */
const compiledOf = (q) => (typeof q?.compile === 'function' ? q.compile() : q);
/** @param {Compiled} c */
const paramsOf = (c) => c.parameters ?? c.params ?? [];
/** @param {any} q */
const isD1Statement = (q) => typeof q?.bind === 'function' && typeof q?.first === 'function';

/**
 * The seam over a D1 binding (or anything with D1's prepare/bind/batch surface: the test fake, a D1 session, the
 * self-host `d1` service).
 * @param {any} binding
 * @returns {SqlDb}
 */
export function d1Db(binding) {
  /** @param {any} q */
  const statementOf = (q) => {
    if (isD1Statement(q)) return q;
    const c = compiledOf(q);
    return binding.prepare(c.sql).bind(...paramsOf(c));
  };
  /** @param {any} r @returns {Result} */
  const resultOf = (r) => ({ rows: r?.results ?? [], changes: Number(r?.meta?.changes ?? 0) });
  return {
    dialect: 'sqlite',
    backend: 'd1',
    kysely: sqliteCompiler,
    run: async (q) => resultOf(await statementOf(q).all()),
    atomic: async (list) => (await binding.batch(list.map(statementOf))).map(resultOf),
  };
}

/**
 * The seam over Node's built-in SQLite (`node:sqlite` DatabaseSync), for a Node host or a tool. workerd has no
 * node:sqlite; there the D1 shim serves SQLite.
 * @param {import('node:sqlite').DatabaseSync} database
 * @returns {SqlDb}
 */
export function nodeSqliteDb(database) {
  /** @param {any} q @returns {Result} */
  const runSync = (q) => {
    const c = compiledOf(q);
    const stmt = database.prepare(c.sql);
    const params = /** @type {any[]} */ (paramsOf(c));
    if (stmt.columns().length > 0) {
      const rows = stmt.all(...params);
      return { rows, changes: Number(database.prepare('SELECT changes() AS n').get()?.n ?? 0) };
    }
    return { rows: [], changes: Number(stmt.run(...params).changes) };
  };
  return {
    dialect: 'sqlite',
    backend: 'node-sqlite',
    kysely: sqliteCompiler,
    run: async (q) => runSync(q),
    async atomic(list) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const out = list.map(runSync);
        database.exec('COMMIT');
        return out;
      } catch (e) {
        database.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

/**
 * The seam over Postgres: a `pg` Pool (PostgresDialect) or PGlite. `atomic` is a real transaction. Its isolation level
 * decides whether the service's guarded writes stay safe under concurrency (see the study's risks). Under SERIALIZABLE
 * Postgres aborts one of two conflicting transactions (40001) or breaks a deadlock (40P01); the list is then run again
 * from the start, up to `retries` times.
 * @param {{
 *   pool?: any, pglite?: any, isolation?: 'serializable' | 'repeatable read' | 'read committed',
 *   retries?: number, onRetry?: (code: string) => void,
 * }} opts
 * @returns {SqlDb}
 */
export function postgresDb({ pool, pglite, isolation = 'serializable', retries = 8, onRetry = () => {} }) {
  const dialect = pglite ? new PGliteDialect({ pglite }) : new PostgresDialect({ pool });
  const kysely = new Kysely({ dialect });
  /** @param {any} r @returns {Result} */
  const resultOf = (r) => ({ rows: r.rows ?? [], changes: Number(r.numAffectedRows ?? r.numUpdatedOrDeletedRows ?? 0) });
  /** @param {any} exec @param {any} q */
  const runOn = async (exec, q) => {
    const c = compiledOf(q);
    // A Drizzle statement has no Kysely operation node; Kysely's executor needs one only to pick its result shape
    if (!('query' in c)) return resultOf(await exec.executeQuery({ ...c, parameters: paramsOf(c), query: { kind: 'RawNode' } }));
    return resultOf(await exec.executeQuery(c));
  };
  return {
    dialect: 'postgres',
    backend: 'postgres',
    kysely,
    run: (q) => runOn(kysely, q),
    async atomic(list) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await kysely.transaction().setIsolationLevel(isolation).execute(async (trx) => {
            const out = [];
            for (const q of list) {
              if (isD1Statement(q)) throw new Error('A raw D1 statement cannot run on Postgres: convert it first.');
              out.push(await runOn(trx, q));
            }
            return out;
          });
        } catch (e) {
          const code = /** @type {any} */ (e)?.code;
          if ((code !== '40001' && code !== '40P01') || attempt >= retries) throw e;
          onRetry(code);
        }
      }
    },
  };
}

/** One seam per D1 binding, so a module that is handed `ctx.db` can ask for its seam without new wiring. */
const seams = new WeakMap();
/**
 * The seam for a database handle: a seam passes through, a D1 binding gets its cached seam.
 * @param {any} db
 * @returns {SqlDb}
 */
export function sqlOf(db) {
  if (db && typeof db.atomic === 'function' && db.kysely) return db;
  let seam = seams.get(db);
  if (!seam) {
    seam = d1Db(db);
    seams.set(db, seam);
  }
  return seam;
}
