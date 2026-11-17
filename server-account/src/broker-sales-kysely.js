// @ts-check
// Study prototype: brokerSales.js's SQL written with Kysely. The behaviour and the guards are brokerSales.js's own;
// only the way each statement is built changes.

import { sql } from 'kysely';
import { BROKER_RID_RE } from '../../src/net/insignia.js';
import { sqlOf } from './sql/db.js';

/** @typedef {import('./sql/schema-types.js').Database} Database */

/** @param {any} db @returns {import('kysely').Kysely<Database>} */
const kyselyOf = (db) => sqlOf(db).kysely;

/** A request id the law accepts. */
export const brokerRidOk = (/** @type {unknown} */ rid) => typeof rid === 'string' && BROKER_RID_RE.test(rid);
/** A settle's nonce: the same shape as a request id. */
const nonceOk = brokerRidOk;

/**
 * The row a request id wrote for this account, or null.
 * @param {any} db @param {string} account @param {string} rid
 * @returns {Promise<{ kind: string, item: string | null, at: number } | null>}
 */
export async function brokerSaleOf(db, account, rid) {
  const query = kyselyOf(db)
    .selectFrom('broker_sales')
    .select(['kind', 'item', 'at'])
    .where('account', '=', account)
    .where('rid', '=', rid);
  const row = (await sqlOf(db).run(query)).rows[0];
  if (!row) return null;
  return { kind: String(row.kind), item: typeof row.item === 'string' ? row.item : null, at: Number(row.at) || 0 };
}

/**
 * The sale's own row, in its batch after the write it records: written only where that write took.
 * `changes()` reads the statement before it in the same batch. SQLite has it and Postgres does not, so on Postgres this
 * statement has to become part of the sale's own UPDATE (a data-modifying WITH) when that UPDATE is converted.
 * @param {any} db
 * @param {{ account: string, rid: string, kind: string, item: string | null, nowS: number }} sale
 */
export function brokerSaleWrite(db, { account, rid, kind, item, nowS }) {
  const seam = sqlOf(db);
  if (seam.dialect !== 'sqlite') throw new Error('brokerSaleWrite needs changes(): convert the sale UPDATE to a WITH first');
  const k = seam.kysely;
  const pick = k
    .selectNoFrom((eb) => [
      eb.val(account).as('account'),
      eb.val(rid).as('rid'),
      eb.val(kind).as('kind'),
      eb.val(item).as('item'),
      eb.val(nowS).as('at'),
    ])
    .where(sql`changes()`, '>', 0);
  return k
    .insertInto('broker_sales')
    .columns(['account', 'rid', 'kind', 'item', 'at'])
    .expression(pick);
}

/**
 * The guard a sale's UPDATE carries: no row of this request id. A raw caller still splices it into its text with
 * placeholder names (`acc`, `rid`); a converted caller uses brokerRidFree below, whose values are bound.
 * @param {string} acc @param {string} rid
 */
export const brokerRidFreeSql = (acc, rid) => `NOT EXISTS (SELECT 1 FROM broker_sales WHERE account = ${acc} AND rid = ${rid})`;

/**
 * The same guard as a Kysely fragment, for a query built with Kysely: both values are bound parameters.
 * @param {string} account @param {string} rid
 */
export const brokerRidFree = (account, rid) => sql`NOT EXISTS (SELECT 1 FROM broker_sales WHERE account = ${account} AND rid = ${rid})`;

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
  const k = kyselyOf(db);
  const fence = k
    .insertInto('broker_sales')
    .values({ account: player.id, rid, kind: 'fence', item: null, at: nowS })
    .onConflict((oc) => oc.columns(['account', 'rid']).doNothing());
  const count = k
    .updateTable('broker_sales')
    .set((eb) => ({
      settled: eb('settled', '+', 1),
      asked_by: eb.fn.coalesce('asked_by', eb.val(nonce)),
    }))
    .where('account', '=', player.id)
    .where('rid', '=', rid)
    .returning(['kind', 'item', 'at', 'asked_by']);
  const [, counted] = await seam.atomic([fence, count]);
  const row = counted?.rows?.[0];
  // Only an insignia sale is held: a fence, or a row of a sale kind the Broker no longer makes, answers as nothing sold
  if (!row || row.kind !== 'insignia') return { held: false };
  return { held: true, kind: String(row.kind), item: row.item, by: String(row.asked_by) };
}
