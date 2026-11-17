// @ts-check
// Study prototype: brokerSales.js's SQL written with Drizzle. The behaviour and the guards are brokerSales.js's own.

import { sql, and, eq, gt } from 'drizzle-orm';
import { BROKER_RID_RE } from '../../src/net/insignia.js';
import { sqlOf } from './sql/db.js';
import { drizzleFor } from './sql/drizzle-schema.js';

/** A request id the law accepts. */
export const brokerRidOk = (/** @type {unknown} */ rid) => typeof rid === 'string' && BROKER_RID_RE.test(rid);
const nonceOk = brokerRidOk;

/** @param {any} q */
const compiled = (q) => q.toSQL();

/**
 * The row a request id wrote for this account, or null.
 * @param {any} db @param {string} account @param {string} rid
 */
export async function brokerSaleOf(db, account, rid) {
  const seam = sqlOf(db);
  const { d, t } = drizzleFor(seam);
  const query = d
    .select({ kind: t.brokerSales.kind, item: t.brokerSales.item, at: t.brokerSales.at })
    .from(t.brokerSales)
    .where(and(eq(t.brokerSales.account, account), eq(t.brokerSales.rid, rid)));
  const row = (await seam.run(compiled(query))).rows[0];
  if (!row) return null;
  return { kind: String(row.kind), item: typeof row.item === 'string' ? row.item : null, at: Number(row.at) || 0 };
}

/**
 * The sale's own row, written only where the batch's previous write took (SQLite's `changes()`; see the Kysely copy).
 * @param {any} db
 * @param {{ account: string, rid: string, kind: string, item: string | null, nowS: number }} sale
 */
export function brokerSaleWrite(db, { account, rid, kind, item, nowS }) {
  const seam = sqlOf(db);
  if (seam.dialect !== 'sqlite') throw new Error('brokerSaleWrite needs changes(): convert the sale UPDATE to a WITH first');
  const { d, t } = drizzleFor(seam);
  // Drizzle's insert-select must name every column of the table, in the table's order, and a SELECT with no FROM is
  // written as a sql fragment
  const pick = d.select({
    account: sql`${account}`.as('account'),
    rid: sql`${rid}`.as('rid'),
    kind: sql`${kind}`.as('kind'),
    item: sql`${item}`.as('item'),
    at: sql`${nowS}`.as('at'),
    settled: sql`0`.as('settled'),
    askedBy: sql`NULL`.as('asked_by'),
  }).from(sql`(SELECT 1)`).where(gt(sql`changes()`, 0));
  return compiled(d.insert(t.brokerSales).select(pick));
}

/** The guard a sale's raw UPDATE carries, with placeholder names. */
export const brokerRidFreeSql = (/** @type {string} */ acc, /** @type {string} */ rid) => `NOT EXISTS (SELECT 1 FROM broker_sales WHERE account = ${acc} AND rid = ${rid})`;

/** The same guard as a Drizzle fragment: both values bound. */
export const brokerRidFree = (/** @type {string} */ account, /** @type {string} */ rid) => sql`NOT EXISTS (SELECT 1 FROM broker_sales WHERE account = ${account} AND rid = ${rid})`;

/**
 * The settle: the fence written where the id has no row, then the row counted and its first ask kept, atomically.
 * @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 */
export async function settleBrokerSale({ db, nowS }, player, body) {
  if (!player?.handle) return { error: 'guest' };
  const rid = body?.rid;
  const nonce = body?.nonce;
  if (!brokerRidOk(rid) || !nonceOk(nonce)) return { error: 'rid' };
  const seam = sqlOf(db);
  const { d, t } = drizzleFor(seam);
  const b = t.brokerSales;
  const fence = d.insert(b)
    .values({ account: player.id, rid, kind: 'fence', item: null, at: nowS })
    .onConflictDoNothing({ target: [b.account, b.rid] });
  const count = d.update(b)
    .set({ settled: sql`${b.settled} + 1`, askedBy: sql`COALESCE(${b.askedBy}, ${nonce})` })
    .where(and(eq(b.account, player.id), eq(b.rid, rid)))
    .returning({ kind: b.kind, item: b.item, at: b.at, asked_by: b.askedBy });
  const [, counted] = await seam.atomic([compiled(fence), compiled(count)]);
  const row = counted?.rows?.[0];
  if (!row || row.kind !== 'insignia') return { held: false };
  return { held: true, kind: String(row.kind), item: row.item, by: String(row.asked_by) };
}
