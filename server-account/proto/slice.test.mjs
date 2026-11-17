// Study prototype: the converted slice (broker sales, buy orders) driven directly on three backends, once per library.
// - D1: the test fake over node:sqlite (test/accountDb.mjs), every migration applied, statements through batch().
// - node:sqlite: the same migrations, no D1 shim, the seam's BEGIN/COMMIT.
// - Postgres: PGlite with the slice's tables ported by hand (pg-slice-schema.sql), a SERIALIZABLE transaction.
// The service's own tests stand the whole Worker, whose other 100 modules are still SQLite-only SQL, so they cannot
// run on Postgres yet; these cases lift their assertions for the slice alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';

import { d1 } from '../../test/accountDb.mjs';
import { d1Db, nodeSqliteDb, postgresDb } from '../src/sql/db.js';
import * as kyselyOrders from '../src/market-orders-kysely.js';
import * as drizzleOrders from '../src/market-orders-drizzle.js';
import * as kyselyBroker from '../src/broker-sales-kysely.js';
import * as drizzleBroker from '../src/broker-sales-drizzle.js';
import { MARKS_MAX } from '../../src/net/marksLaw.js';

const here = (p) => new URL(p, import.meta.url);
const migrations = readdirSync(here('../migrations')).filter((f) => f.endsWith('.sql')).sort();

async function freshD1() {
  const fake = d1();
  return { seam: d1Db(fake), close: async () => fake._raw.close() };
}
async function freshNodeSqlite() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const f of migrations) database.exec(readFileSync(here(`../migrations/${f}`), 'utf8'));
  return { seam: nodeSqliteDb(database), close: async () => database.close() };
}
async function freshPglite() {
  const pglite = new PGlite();
  await pglite.exec(readFileSync(here('./pg-slice-schema.sql'), 'utf8'));
  return { seam: postgresDb({ pglite }), close: async () => pglite.close() };
}

/** @param {import('../src/sql/db.js').SqlDb} seam @param {string} sqlText @param {unknown[]} params */
const raw = (seam, sqlText, params = []) => {
  const text = seam.dialect === 'postgres' ? sqlText.replace(/\?(\d+)/g, '$$$1') : sqlText;
  return seam.run({ sql: text, parameters: params });
};
const balance = async (seam, account) => Number((await raw(seam, 'SELECT balance FROM marks WHERE account = ?1', [account])).rows[0]?.balance ?? 0);

async function seedPlayer(seam, id, marks) {
  await raw(seam, 'INSERT INTO players (id, guest_name, created_at, last_seen) VALUES (?1, ?2, 1, 1)', [id, `guest-${id}`]);
  if (marks > 0) {
    await raw(seam, `INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      VALUES ('mint', NULL, 'account', ?1, 'test', ?2, 1, 1, ?1, NULL, ?3)`, [id, marks, `seed-${id}`]);
  }
}

const NOW = 1_800_000_000;
const post = (over = {}) => ({
  poster: 'p1', character: 'c1', id: 'o1', region: 5, material: 'iron', units: 5, price: 10,
  nowS: NOW, expiresAt: NOW + 7 * 86400, rid: 'rid-1', nonce: 'n1', ordersMax: 3, ...over,
});

const backends = { d1: freshD1, 'node:sqlite': freshNodeSqlite, postgres: freshPglite };
const libraries = { kysely: { orders: kyselyOrders, broker: kyselyBroker }, drizzle: { orders: drizzleOrders, broker: drizzleBroker } };

for (const [libName, lib] of Object.entries(libraries)) {
  for (const [backendName, fresh] of Object.entries(backends)) {
    test(`${libName} on ${backendName}: an order escrows once, refuses short and returns once`, async () => {
      const { seam, close } = await fresh();
      try {
        await seedPlayer(seam, 'p1', 1000);
        await seam.atomic(lib.orders.orderPostStatements(seam, post()));
        const row = await lib.orders.orderByRid(seam, 'p1', 'rid-1');
        assert.equal(row.n, 'n1');
        assert.equal(Number(row.escrow), 50);
        assert.equal(await balance(seam, 'p1'), 950, 'the escrow left the balance');

        // the same request again: the row stands, no second escrow
        await seam.atomic(lib.orders.orderPostStatements(seam, post({ id: 'o1b', nonce: 'n1b' })));
        assert.equal((await lib.orders.orderByRid(seam, 'p1', 'rid-1')).n, 'n1');
        assert.equal(await balance(seam, 'p1'), 950);

        // short of Marks: no row, no line
        await seam.atomic(lib.orders.orderPostStatements(seam, post({ id: 'o2', rid: 'rid-2', nonce: 'n2', units: 100, price: 100 })));
        assert.equal(await lib.orders.orderByRid(seam, 'p1', 'rid-2'), null);
        assert.equal(await balance(seam, 'p1'), 950);

        // cancelled and returned, as marketUnorder does
        await seam.atomic([lib.orders.orderCancelStatement(seam, { id: 'o1', poster: 'p1', nowS: NOW + 5 }), ...lib.orders.orderReturnStatements(seam, 'o1', NOW + 5)]);
        const back = await lib.orders.orderById(seam, 'o1');
        assert.equal(back.state, 'cancelled');
        assert.equal(Number(back.returned), 1);
        assert.equal(Number(back.escrow), 0);
        assert.equal(await balance(seam, 'p1'), 1000);

        // returned again: nothing moves
        await seam.atomic(lib.orders.orderReturnStatements(seam, 'o1', NOW + 6));
        assert.equal(await balance(seam, 'p1'), 1000);
      } finally {
        await close();
      }
    });

    test(`${libName} on ${backendName}: a return past the Marks cap waits`, async () => {
      const { seam, close } = await fresh();
      try {
        await seedPlayer(seam, 'p1', 1000);
        await seam.atomic(lib.orders.orderPostStatements(seam, post()));
        await raw(seam, `INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
          VALUES ('mint', NULL, 'account', 'p1', 'test', ?1, 1, 1, 'p1', NULL, 'top-up')`, [MARKS_MAX - 960]);
        await seam.atomic([lib.orders.orderCancelStatement(seam, { id: 'o1', poster: 'p1', nowS: NOW }), ...lib.orders.orderReturnStatements(seam, 'o1', NOW)]);
        const held = await lib.orders.orderById(seam, 'o1');
        assert.equal(held.state, 'cancelled');
        assert.equal(Number(held.returned), 0, 'the escrow waits under the cap');
        assert.equal(Number(held.escrow), 50);
      } finally {
        await close();
      }
    });

    test(`${libName} on ${backendName}: a broker settle fences an unknown id and keeps the first ask`, async () => {
      const { seam, close } = await fresh();
      try {
        await seedPlayer(seam, 'p1', 0);
        const player = { id: 'p1', handle: 'Ada' };
        const fenced = await lib.broker.settleBrokerSale({ db: seam, nowS: NOW }, player, { rid: ('b' + 'a'.repeat(15)), nonce: ('b' + 'b'.repeat(15)) });
        assert.deepEqual(fenced, { held: false });
        assert.equal((await lib.broker.brokerSaleOf(seam, 'p1', ('b' + 'a'.repeat(15))))?.kind, 'fence');

        await raw(seam, "INSERT INTO broker_sales (account, rid, kind, item, at) VALUES ('p1', ?1, 'insignia', 'wolf', ?2)", [('b' + 'c'.repeat(15)), NOW]);
        const first = await lib.broker.settleBrokerSale({ db: seam, nowS: NOW }, player, { rid: ('b' + 'c'.repeat(15)), nonce: ('b' + 'd'.repeat(15)) });
        assert.deepEqual(first, { held: true, kind: 'insignia', item: 'wolf', by: ('b' + 'd'.repeat(15)) });
        const second = await lib.broker.settleBrokerSale({ db: seam, nowS: NOW }, player, { rid: ('b' + 'c'.repeat(15)), nonce: ('b' + 'e'.repeat(15)) });
        assert.equal(second.by, ('b' + 'd'.repeat(15)), 'the first ask keeps the piece');

        if (seam.dialect === 'postgres') {
          assert.throws(() => lib.broker.brokerSaleWrite(seam, { account: 'p1', rid: 'x', kind: 'insignia', item: 'wolf', nowS: NOW }), /changes\(\)/);
        }
      } finally {
        await close();
      }
    });
  }
}
