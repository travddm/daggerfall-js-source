// @ts-check
// Study prototype: the buy orders' statements from market.js, written with Drizzle (see market-orders-kysely.js for
// what each statement guards).

import { sql, and, eq, ne, gt, lte, gte, lt, or, exists, not, count } from 'drizzle-orm';
import { sqlOf } from './sql/db.js';
import { drizzleFor } from './sql/drizzle-schema.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';

/** @param {any} q */
const compiled = (q) => q.toSQL();

/** @param {any} db @param {string} poster @param {string} rid */
export async function orderByRid(db, poster, rid) {
  const seam = sqlOf(db);
  const { d, t } = drizzleFor(seam);
  const o = t.marketOrders;
  return (await seam.run(compiled(d.select().from(o).where(and(eq(o.poster, poster), eq(o.rid, rid)))))).rows[0] ?? null;
}

/** @param {any} db @param {string} id */
export async function orderById(db, id) {
  const seam = sqlOf(db);
  const { d, t } = drizzleFor(seam);
  const o = t.marketOrders;
  return (await seam.run(compiled(d.select().from(o).where(eq(o.id, id))))).rows[0] ?? null;
}

/** @param {any} db @param {import('./market-orders-kysely.js').OrderPost} post */
export function orderPostStatements(db, post) {
  const seam = sqlOf(db);
  const { d, t } = drizzleFor(seam);
  const o = t.marketOrders;
  const l = t.marksLedger;
  const m = t.marks;
  const cost = post.units * post.price;
  const escrowRid = `${post.rid}:escrow`;
  const balance = d.select({ balance: m.balance }).from(m).where(eq(m.account, post.poster));
  const openCount = d.select({ open: count() }).from(o).where(and(eq(o.poster, post.poster), eq(o.state, 'open')));
  const spent = d.select({ one: sql`1` }).from(l).where(and(eq(l.actor, post.poster), eq(l.rid, escrowRid)));
  const guardedRow = d.select({
    id: sql`${post.id}`.as('id'),
    poster: sql`${post.poster}`.as('poster'),
    charId: sql`${post.character}`.as('char_id'),
    region: sql`${post.region}`.as('region'),
    material: sql`${post.material}`.as('material'),
    units: sql`${post.units}`.as('units'),
    leftUnits: sql`${post.units}`.as('left_units'),
    price: sql`${post.price}`.as('price'),
    escrow: sql`${cost}`.as('escrow'),
    at: sql`${post.nowS}`.as('at'),
    expiresAt: sql`${post.expiresAt}`.as('expires_at'),
    state: sql`'open'`.as('state'),
    closedAt: sql`NULL`.as('closed_at'),
    returned: sql`0`.as('returned'),
    rid: sql`${post.rid}`.as('rid'),
    n: sql`${post.nonce}`.as('n'),
  }).from(sql`(SELECT 1)`).where(and(
    gte(sql`COALESCE((${balance}), 0)`, cost),
    lt(sql`(${openCount})`, post.ordersMax),
    not(exists(spent)),
  ));
  const row = d.insert(o).select(guardedRow).onConflictDoNothing();
  const line = d.insert(l).select(d.select({
    srcKind: sql`'account'`.as('src_kind'),
    srcId: o.poster,
    dstKind: sql`'escrow'`.as('dst_kind'),
    dstId: o.id,
    kind: sql`'order-escrow'`.as('kind'),
    amount: o.escrow,
    day: sql`${utcDay(post.nowS)}`.as('day'),
    at: o.at,
    actor: sql`${o.poster}`.as('actor'),
    who: o.material,
    rid: sql`${o.rid} || ${':escrow'}`.as('rid'),
  }).from(o).where(and(eq(o.poster, post.poster), eq(o.rid, post.rid), eq(o.n, post.nonce))));
  return [compiled(row), compiled(line)];
}

/** @param {any} db @param {{ id: string, poster: string, nowS: number }} cancel */
export function orderCancelStatement(db, { id, poster, nowS }) {
  const { d, t } = drizzleFor(sqlOf(db));
  const o = t.marketOrders;
  return compiled(d.update(o).set({ state: 'cancelled', closedAt: nowS }).where(and(eq(o.id, id), eq(o.poster, poster), eq(o.state, 'open'))));
}

/** @param {any} db @param {string} id @param {number} nowS */
export function orderReturnStatements(db, id, nowS) {
  const { d, t } = drizzleFor(sqlOf(db));
  const o = t.marketOrders;
  const l = t.marksLedger;
  const m = t.marks;
  const closeRid = `order-close:${id}`;
  const posterBalance = d.select({ balance: m.balance }).from(m).where(eq(m.account, o.poster));
  const line = d.insert(l).select(d.select({
    srcKind: sql`'escrow'`.as('src_kind'),
    srcId: o.id,
    dstKind: sql`'account'`.as('dst_kind'),
    dstId: o.poster,
    kind: sql`'order-return'`.as('kind'),
    amount: o.escrow,
    day: sql`${utcDay(nowS)}`.as('day'),
    at: sql`${nowS}`.as('at'),
    actor: sql`${o.poster}`.as('actor'),
    who: o.material,
    rid: sql`${closeRid}`.as('rid'),
  }).from(o).where(and(
    eq(o.id, id),
    ne(o.state, 'open'),
    eq(o.returned, 0),
    gt(o.escrow, 0),
    lte(sql`COALESCE((${posterBalance}), 0) + ${o.escrow}`, MARKS_MAX),
  )));
  const returned = d.select({ one: sql`1` }).from(l).where(and(eq(l.actor, o.poster), eq(l.rid, closeRid)));
  const mark = d.update(o).set({ escrow: 0, returned: 1 }).where(and(
    eq(o.id, id),
    ne(o.state, 'open'),
    eq(o.returned, 0),
    or(eq(o.escrow, 0), exists(returned)),
  ));
  return [compiled(line), compiled(mark)];
}
