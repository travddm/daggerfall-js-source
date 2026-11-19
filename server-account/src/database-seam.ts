// The account service's one door to its database: Kysely builds the statements, this module runs them.
//
// An atomic write is a LIST of statements. D1 refuses BEGIN and runs a list atomically only through batch(), so
// `atomic` sends one batch; a later SQLite or Postgres backend runs the same list as a transaction. While modules are
// converted one at a time, a list may mix Kysely queries with `db.prepare(...).bind(...)` statements.
//
// Kysely only compiles here (a DummyDriver), so one instance serves every request and no D1 dialect package is needed.

import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from 'kysely';
import type { Database } from './database-types.ts';

/** A statement made by D1's own `prepare(...).bind(...)`, or by the test fake that mimics it. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first(): Promise<unknown>;
  all(): Promise<D1Result>;
  run(): Promise<D1Result>;
}

/** The part of D1's answer the seam reads. */
export interface D1Result {
  results?: Record<string, unknown>[];
  meta?: { changes?: number; [field: string]: unknown };
}

/** The part of a D1 binding (or a D1 session) the seam uses. */
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}

/** Something that compiles to SQL and its bound values: a Kysely query builder. */
export interface Compilable {
  compile(): CompiledQuery;
}

/** One entry of an atomic list. */
export type Statement = Compilable | CompiledQuery | D1Statement;

/** A statement's answer, the same shape on every backend. */
export interface StatementResult {
  rows: Record<string, unknown>[];
  changes: number;
}

export interface SqlDb {
  dialect: 'sqlite';
  /** The compiler for this database's dialect. Build queries with it; run them with `run` or `atomic`. */
  kysely: Kysely<Database>;
  run(statement: Compilable | CompiledQuery): Promise<StatementResult>;
  /** A query as a D1 statement, for a caller that still sends `db.batch([...])` itself. */
  statement(query: Compilable | CompiledQuery): D1Statement;
  atomic(statements: Statement[]): Promise<StatementResult[]>;
}

const sqliteCompiler = new Kysely<Database>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

function isCompilable(statement: Statement): statement is Compilable {
  return typeof (statement as Partial<Compilable>).compile === 'function';
}

function isD1Statement(statement: Statement): statement is D1Statement {
  return typeof (statement as Partial<D1Statement>).bind === 'function';
}

function resultOf(answer: D1Result | undefined): StatementResult {
  return { rows: answer?.results ?? [], changes: Number(answer?.meta?.changes ?? 0) };
}

/** The seam over a D1 binding, a D1 session, the self-host D1 service or the test fake. */
export function d1Db(binding: D1Like): SqlDb {
  const statementOf = (statement: Statement): D1Statement => {
    if (isD1Statement(statement)) return statement;
    const compiled = isCompilable(statement) ? statement.compile() : statement;
    return binding.prepare(compiled.sql).bind(...compiled.parameters);
  };
  return {
    dialect: 'sqlite',
    kysely: sqliteCompiler,
    run: async (statement) => resultOf(await statementOf(statement).all()),
    statement: statementOf,
    atomic: async (statements) => (await binding.batch(statements.map(statementOf))).map(resultOf),
  };
}

const seams = new WeakMap<D1Like, SqlDb>();

/**
 * The seam for a module that is handed `ctx.db`: a seam passes through, a D1 binding gets its cached seam, so callers
 * need no new wiring.
 */
export function sqlOf(db: D1Like | SqlDb): SqlDb {
  if ('atomic' in db) return db;
  let seam = seams.get(db);
  if (!seam) {
    seam = d1Db(db);
    seams.set(db, seam);
  }
  return seam;
}
