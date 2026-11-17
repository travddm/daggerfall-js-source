// Study prototype: the market's guarded order post, sent many times at once to a real Postgres, at each isolation
// level. The guards (enough Marks for the escrow; fewer than `ordersMax` open orders) hold under SQLite and D1 because
// they run one writer at a time. This counts what gets through when Postgres runs the lists in parallel.
// Usage: PG_URL=postgres://postgres@localhost:55432/postgres node server-account/proto/pg-race.mjs
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { postgresDb } from '../src/sql/db.js';
import { orderPostStatements } from '../src/market-orders-kysely.js';

const base = process.env.PG_URL ?? 'postgres://postgres@localhost:55432/postgres';
const PARALLEL = 20;
const ROUNDS = 5;
const NOW = 1_800_000_000;

const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS race');
await admin.query('CREATE DATABASE race');
await admin.end();
const url = base.replace(/\/[^/]*$/, '/race');
const setup = new pg.Client({ connectionString: url });
await setup.connect();
await setup.query(readFileSync(new URL('./pg-slice-schema.sql', import.meta.url), 'utf8'));
await setup.end();

const pool = new pg.Pool({ connectionString: url, max: PARALLEL });

/** One round: a fresh poster with `marks`, then PARALLEL posts of `cost` each at once. */
async function round(isolation, { marks, units, price, ordersMax }, tag) {
  let retried = 0;
  const seam = postgresDb({ pool, isolation, onRetry: () => { retried++; } });
  const poster = `p-${tag}`;
  await pool.query('INSERT INTO players (id, guest_name, created_at, last_seen) VALUES ($1, $1, 1, 1)', [poster]);
  await pool.query(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
    VALUES ('mint', NULL, 'account', $1, 'test', $2, 1, 1, $1, NULL, 'seed')`, [poster, marks]);
  const posts = Array.from({ length: PARALLEL }, (_, i) => seam.atomic(orderPostStatements(seam, {
    poster, character: 'c1', id: `${tag}-o${i}`, region: 5, material: 'iron', units, price,
    nowS: NOW, expiresAt: NOW + 86400, rid: `${tag}-r${i}`, nonce: `n${i}`, ordersMax,
  })));
  const settled = await Promise.allSettled(posts);
  const failed = settled.filter((s) => s.status === 'rejected').map((s) => /** @type {any} */ (s).reason?.code ?? 'error');
  const open = Number((await pool.query("SELECT COUNT(*) AS n FROM market_orders WHERE poster = $1 AND state = 'open'", [poster])).rows[0].n);
  const balance = Number((await pool.query('SELECT balance FROM marks WHERE account = $1', [poster])).rows[0]?.balance ?? 0);
  const escrowed = Number((await pool.query("SELECT COALESCE(SUM(amount), 0) AS s FROM marks_ledger WHERE actor = $1 AND kind = 'order-escrow'", [poster])).rows[0].s);
  return { open, balance, escrowed, failed, retried };
}

const scenarios = {
  // Plenty of Marks; the guard under test is the open-order cap of 3
  'order cap (3)': { marks: 1_000_000, units: 1, price: 10, ordersMax: 3 },
  // Marks for exactly one order; the guard under test is the escrow check
  'escrow (Marks for 1)': { marks: 100, units: 1, price: 100, ordersMax: 50 },
};

for (const isolation of ['read committed', 'repeatable read', 'serializable']) {
  for (const [name, s] of Object.entries(scenarios)) {
    const results = [];
    for (let r = 0; r < ROUNDS; r++) results.push(await round(isolation, s, `${isolation.replace(' ', '')}-${name.split(' ')[0]}-${r}`));
    const fmt = (k) => results.map((x) => x[k]).join(',');
    const codes = {};
    for (const x of results) for (const c of x.failed) codes[c] = (codes[c] ?? 0) + 1;
    console.log(`${isolation} | ${name} | open orders ${fmt('open')} | balance ${fmt('balance')} | escrowed ${fmt('escrowed')} | failed ${JSON.stringify(codes)} | retries ${fmt('retried')}`);
  }
}
await pool.end();
