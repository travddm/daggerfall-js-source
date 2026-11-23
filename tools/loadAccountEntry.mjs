// SCALE3: THE ACCOUNT SERVICE AS THE LOAD HARNESS RUNS IT. Never deployed -
// tools/loadHarness.mjs hands this file to `wrangler dev` as the entry, over server-account/wrangler.toml's own bindings.
//
// It is the real Worker (server-account/src/index.js), unchanged, with two things kept in the isolate that a deploy sends
// elsewhere, so the harness can read them back at /__load/stats (each read drains what it answers):
//   - the service's own metrics point a request (metrics.js `measured`: the route as a template, the status, wall ms and
//     the D1 statements it ran) - where the deploy writes them to Analytics Engine, and miniflare's local dataset drops
//     every one;
//   - D1's own count of the ROWS each statement read and wrote (`meta.rows_read`, `meta.rows_written`), by its SQL - the
//     figure the database is billed and throttled by, the one `wrangler d1 insights` read in YARD-SHED and STORM-SHED.
//
// THE DATABASE IS WRAPPED ONCE AN ISOLATE, never a request: the service keys its kept answers by the binding
// (service.js DB_ROOT - the yards, the homes' layouts, the seats' rows), and this answers DB_ROOT with the binding itself,
// so a kept answer is kept here exactly as it is in the deploy. A `first()` is asked as `all()` and its first row
// returned - the same row, and the only door D1 opens on a statement's meta.
import service from '../server-account/src/index.js';
import { DB_ROOT } from '../server-account/src/service.js';
// AUDIT SCALE II L2: AND EVERY DURABLE OBJECT CLASS
// THE SERVICE'S ENTRY EXPORTS. wrangler.toml binds them by class name from the entry it runs - this file, here - and
// `wrangler dev` refuses an entry that does not export one ("Your Worker depends on the following Durable Objects, which
// are not exported in your entrypoint file: AdmitGate"): from ADMIT-LINE on, the harness could not boot the service at
// all. Every named export of the service's entry is passed through, so the next object it binds comes with it.
export * from '../server-account/src/index.js';

/** The points and statements kept between two reads of /__load/stats - bounded, so a long run cannot grow the isolate. */
const POINTS_MAX = 500_000;
const points = [];
/** @type {Map<string, { n: number, rowsRead: number, rowsWritten: number, ms: number }>} */
const bySql = new Map();
// each point with its moment (AUDIT SCALE C5: the storm's seconds are bucketed by when a request ended, not by when the
// harness happened to read)
const sink = { writeDataPoint(/** @type {any} */ p) { if (points.length < POINTS_MAX) points.push({ ...p, t: Date.now() }); } };

const note = (/** @type {string} */ sql, /** @type {any} */ meta) => {
  const key = sql.replace(/\s+/g, ' ').trim().slice(0, 240);
  const row = bySql.get(key) ?? { n: 0, rowsRead: 0, rowsWritten: 0, ms: 0 };
  row.n += 1;
  row.rowsRead += Number(meta?.rows_read ?? 0);
  row.rowsWritten += Number(meta?.rows_written ?? 0);
  row.ms += Number(meta?.duration ?? 0);
  bySql.set(key, row);
};

/** The real statement behind each one this wrapper handed out - a batch is given the real ones. */
const realOf = new WeakMap();
const sqlOf = new WeakMap();

function statement(/** @type {any} */ real, /** @type {string} */ sql) {
  const st = new Proxy(real, {
    get(target, key) {
      if (key === 'bind') return (/** @type {any[]} */ ...a) => statement(target.bind(...a), sql);
      if (key === 'first') {
        return async (/** @type {string|undefined} */ col) => {
          const r = await target.all();
          note(sql, r?.meta);
          const row = r?.results?.[0] ?? null;
          if (col === undefined || row === null) return row;
          // AUDIT SCALE C13: as workerd's binding answers a column the row has not - a throw, never a quiet null
          if (!(col in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${col})`);
          return row[col];
        };
      }
      if (key === 'all' || key === 'run') return async () => { const r = await target[key](); note(sql, r?.meta); return r; };
      // raw() answers no meta: counted as a statement, its rows unknown (the service asks none today) - never run twice
      if (key === 'raw') return async (/** @type {any} */ opts) => { const r = await target.raw(opts); note(sql, null); return r; };
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  realOf.set(st, real);
  sqlOf.set(st, sql);
  return st;
}

let wrapped = null, wrappedOf = null;
function database(/** @type {any} */ db) {
  if (!db) return db;
  if (wrappedOf === db) return wrapped;
  wrappedOf = db;
  wrapped = new Proxy(db, {
    get(target, key) {
      if (key === DB_ROOT) return Reflect.get(target, DB_ROOT) ?? target;
      if (key === 'prepare') return (/** @type {string} */ sql) => statement(target.prepare(sql), String(sql));
      if (key === 'batch') {
        return async (/** @type {any[]} */ list) => {
          const out = await target.batch(list.map((st) => realOf.get(st) ?? st));
          list.forEach((st, i) => note(sqlOf.get(st) ?? '(batch)', out?.[i]?.meta));
          return out;
        };
      }
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return wrapped;
}

const withLoad = (/** @type {any} */ env) => ({ ...env, DB: database(env.DB), METRICS: sink });

export default {
  async fetch(/** @type {Request} */ request, /** @type {any} */ env, /** @type {any} */ ctx) {
    const url = new URL(request.url);
    // EVERY READ DRAINS: the points and the statements since the last read, never a running total - a reader that
    // folds each read into its own sum (the storm's every second) counts each statement once
    if (url.pathname === '/__load/stats') {
      const body = JSON.stringify({ points: points.splice(0), statements: [...bySql].map(([sql, s]) => ({ sql, ...s })) });
      bySql.clear();
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/__load/probe') return Response.json(await bindingProbe(env, url.searchParams));
    return service.fetch(request, withLoad(env), ctx);
  },
  async scheduled(/** @type {any} */ event, /** @type {any} */ env, /** @type {any} */ ctx) {
    const s = /** @type {any} */ (service);
    if (typeof s.scheduled === 'function') return s.scheduled(event, withLoad(env), ctx);
  },
};

/**
 * The cost of one trip through each storage binding, timed inside the isolate: `n` statements one after another
 * (`SELECT 1`, which measures the trip alone, and one indexed read of the players table), one batch of `n`, the same
 * for a one-row write, and `n` puts, gets and deletes of a `kb` object in the save bucket. The isolate's clock moves only across I/O, so each figure
 * is a total over `n` trips divided by `n`. Never on a deploy: this entry is the harness's own.
 * @returns {Promise<Record<string, number>>} milliseconds a trip, by operation
 */
async function bindingProbe(/** @type {any} */ env, /** @type {URLSearchParams} */ params) {
  const n = Math.min(2000, Math.max(1, Number(params.get('n') ?? 200)));
  const kb = Math.min(4096, Math.max(1, Number(params.get('kb') ?? 900)));
  const timed = async (/** @type {() => Promise<unknown>} */ trip) => {
    const startedAt = Date.now();
    for (let i = 0; i < n; i++) await trip();
    return (Date.now() - startedAt) / n;
  };
  /** @type {Record<string, number>} */
  const out = { n, kb };
  out.select1 = await timed(() => env.DB.prepare('SELECT 1').all());
  out.playerRead = await timed(() => env.DB.prepare('SELECT id FROM players WHERE id = ?').bind('nobody').first());
  const batchStart = Date.now();
  await env.DB.batch(Array.from({ length: n }, () => env.DB.prepare('SELECT 1')));
  out.batchOfNEach = (Date.now() - batchStart) / n;
  // Writes go to a table of the probe's own: a write may wait on its commit, which a read never does.
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS load_probe (k INTEGER PRIMARY KEY, v INTEGER)').run();
  let w = 0;
  out.write = await timed(() => env.DB.prepare('INSERT OR REPLACE INTO load_probe (k, v) VALUES (?, ?)').bind(w++ % 64, w).run());
  const writeBatchStart = Date.now();
  await env.DB.batch(Array.from({ length: n }, (_, k) => env.DB.prepare('INSERT OR REPLACE INTO load_probe (k, v) VALUES (?, ?)').bind(k % 64, k)));
  out.writeBatchOfNEach = (Date.now() - writeBatchStart) / n;
  // Bytes that do not compress, so no layer can shrink the object a trip carries.
  const body = crypto.getRandomValues(new Uint8Array(kb * 1024 > 65536 ? 65536 : kb * 1024));
  const object = new Uint8Array(kb * 1024);
  for (let at = 0; at < object.length; at += body.length) object.set(body.subarray(0, Math.min(body.length, object.length - at)), at);
  let i = 0;
  out.r2Put = await timed(() => env.SAVES.put(`__probe/${i++ % 8}`, object));
  out.r2Get = await timed(async () => (await env.SAVES.get(`__probe/${i++ % 8}`))?.arrayBuffer());
  out.r2Delete = await timed(() => env.SAVES.delete(`__probe/${i++ % 8}`));
  return out;
}
