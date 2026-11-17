// @ts-check
// Study prototype: the converted modules' tables for Drizzle. Drizzle binds a table to its dialect at definition
// (sqliteTable or pgTable), so every table is written twice, and `tablesFor` hands a module the set that matches its
// database. Drizzle is used only as a compiler here (`.toSQL()`); the seam in db.js runs the statements, because
// Drizzle's own batch exists on D1 and libSQL only and its transaction sends BEGIN, which D1 refuses.
// marks_ledger leaves out `seq`: Drizzle's insert-select must name every column it knows, and the key is the
// database's to number.

import { drizzle as sqliteProxy } from 'drizzle-orm/sqlite-proxy';
import { drizzle as pgProxy } from 'drizzle-orm/pg-proxy';
import * as s from 'drizzle-orm/sqlite-core';
import * as p from 'drizzle-orm/pg-core';

const sqliteTables = {
  brokerSales: s.sqliteTable('broker_sales', {
    account: s.text('account').notNull(),
    rid: s.text('rid').notNull(),
    kind: s.text('kind').notNull(),
    item: s.text('item'),
    at: s.integer('at').notNull(),
    settled: s.integer('settled').notNull().default(0),
    askedBy: s.text('asked_by'),
  }, (t) => [s.primaryKey({ columns: [t.account, t.rid] })]),
  marketOrders: s.sqliteTable('market_orders', {
    id: s.text('id').primaryKey(),
    poster: s.text('poster').notNull(),
    charId: s.text('char_id').notNull(),
    region: s.integer('region').notNull(),
    material: s.text('material').notNull(),
    units: s.integer('units').notNull(),
    leftUnits: s.integer('left_units').notNull(),
    price: s.integer('price').notNull(),
    escrow: s.integer('escrow').notNull(),
    at: s.integer('at').notNull(),
    expiresAt: s.integer('expires_at').notNull(),
    state: s.text('state').notNull().default('open'),
    closedAt: s.integer('closed_at'),
    returned: s.integer('returned').notNull().default(0),
    rid: s.text('rid').notNull(),
    n: s.text('n').notNull(),
  }),
  marksLedger: s.sqliteTable('marks_ledger', {
    srcKind: s.text('src_kind').notNull(),
    srcId: s.text('src_id'),
    dstKind: s.text('dst_kind').notNull(),
    dstId: s.text('dst_id'),
    kind: s.text('kind').notNull(),
    amount: s.integer('amount').notNull(),
    day: s.integer('day').notNull(),
    at: s.integer('at').notNull(),
    actor: s.text('actor').notNull(),
    who: s.text('who'),
    rid: s.text('rid').notNull(),
  }),
  marks: s.sqliteTable('marks', {
    account: s.text('account').primaryKey(),
    balance: s.integer('balance').notNull().default(0),
  }),
};

const pgTables = {
  brokerSales: p.pgTable('broker_sales', {
    account: p.text('account').notNull(),
    rid: p.text('rid').notNull(),
    kind: p.text('kind').notNull(),
    item: p.text('item'),
    at: p.bigint('at', { mode: 'number' }).notNull(),
    settled: p.integer('settled').notNull().default(0),
    askedBy: p.text('asked_by'),
  }, (t) => [p.primaryKey({ columns: [t.account, t.rid] })]),
  marketOrders: p.pgTable('market_orders', {
    id: p.text('id').primaryKey(),
    poster: p.text('poster').notNull(),
    charId: p.text('char_id').notNull(),
    region: p.integer('region').notNull(),
    material: p.text('material').notNull(),
    units: p.integer('units').notNull(),
    leftUnits: p.integer('left_units').notNull(),
    price: p.integer('price').notNull(),
    escrow: p.bigint('escrow', { mode: 'number' }).notNull(),
    at: p.bigint('at', { mode: 'number' }).notNull(),
    expiresAt: p.bigint('expires_at', { mode: 'number' }).notNull(),
    state: p.text('state').notNull().default('open'),
    closedAt: p.bigint('closed_at', { mode: 'number' }),
    returned: p.integer('returned').notNull().default(0),
    rid: p.text('rid').notNull(),
    n: p.text('n').notNull(),
  }),
  marksLedger: p.pgTable('marks_ledger', {
    srcKind: p.text('src_kind').notNull(),
    srcId: p.text('src_id'),
    dstKind: p.text('dst_kind').notNull(),
    dstId: p.text('dst_id'),
    kind: p.text('kind').notNull(),
    amount: p.bigint('amount', { mode: 'number' }).notNull(),
    day: p.integer('day').notNull(),
    at: p.bigint('at', { mode: 'number' }).notNull(),
    actor: p.text('actor').notNull(),
    who: p.text('who'),
    rid: p.text('rid').notNull(),
  }),
  marks: p.pgTable('marks', {
    account: p.text('account').primaryKey(),
    balance: p.bigint('balance', { mode: 'number' }).notNull().default(0),
  }),
};

const noRun = async () => ({ rows: [] });
const compilers = {
  sqlite: sqliteProxy(noRun),
  postgres: pgProxy(noRun),
};

/**
 * The Drizzle compiler and the table set for a seam's dialect.
 * @param {import('./db.js').SqlDb} seam
 */
export function drizzleFor(seam) {
  if (seam.dialect === 'sqlite') return { d: /** @type {any} */ (compilers.sqlite), t: sqliteTables };
  return { d: /** @type {any} */ (compilers.postgres), t: pgTables };
}
