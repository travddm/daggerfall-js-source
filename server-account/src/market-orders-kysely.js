// @ts-check
// Study prototype: the buy orders' statements from market.js, written with Kysely. Each builder returns statements
// for the seam's `atomic` list; market.js puts them beside its unconverted statements in one list.

import { sql } from 'kysely';
import { sqlOf } from './sql/db.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';

/** @typedef {import('./sql/schema-types.js').Database} Database */
/** @param {any} db @returns {import('kysely').Kysely<Database>} */
const kyselyOf = (db) => sqlOf(db).kysely;

/**
 * An order by its poster's request id, or null.
 * @param {any} db @param {string} poster @param {string} rid
 */
export async function orderByRid(db, poster, rid) {
  const query = kyselyOf(db).selectFrom('market_orders').selectAll().where('poster', '=', poster).where('rid', '=', rid);
  return (await sqlOf(db).run(query)).rows[0] ?? null;
}

/**
 * An order by its id, or null.
 * @param {any} db @param {string} id
 */
export async function orderById(db, id) {
  const query = kyselyOf(db).selectFrom('market_orders').selectAll().where('id', '=', id);
  return (await sqlOf(db).run(query)).rows[0] ?? null;
}

/**
 * @typedef {{
 *   poster: string, character: string, id: string, region: number, material: string, units: number, price: number,
 *   nowS: number, expiresAt: number, rid: string, nonce: string, ordersMax: number,
 * }} OrderPost
 */

/**
 * The order's row and its escrow line. The row is written only while the poster holds the escrow, has room for
 * another open order and has not spent this request id; the line is written only for the row this post wrote (its
 * nonce), so a refused row moves no Marks.
 * @param {any} db @param {OrderPost} post
 */
export function orderPostStatements(db, post) {
  const k = kyselyOf(db);
  const cost = post.units * post.price;
  const escrowRid = `${post.rid}:escrow`;
  const guardedRow = k
    .selectNoFrom((eb) => [
      eb.val(post.id).as('id'),
      eb.val(post.poster).as('poster'),
      eb.val(post.character).as('char_id'),
      eb.val(post.region).as('region'),
      eb.val(post.material).as('material'),
      eb.val(post.units).as('units'),
      eb.val(post.units).as('left_units'),
      eb.val(post.price).as('price'),
      eb.val(cost).as('escrow'),
      eb.val(post.nowS).as('at'),
      eb.val(post.expiresAt).as('expires_at'),
      eb.val(post.rid).as('rid'),
      eb.val(post.nonce).as('n'),
    ])
    .where((eb) => eb.and([
      eb(eb.fn.coalesce(eb.selectFrom('marks').select('balance').where('account', '=', post.poster), eb.lit(0)), '>=', cost),
      eb(eb.selectFrom('market_orders').select(eb.fn.countAll().as('open')).where('poster', '=', post.poster).where('state', '=', 'open'), '<', post.ordersMax),
      eb.not(eb.exists(eb.selectFrom('marks_ledger').select(eb.lit(1).as('one')).where('actor', '=', post.poster).where('rid', '=', escrowRid))),
    ]));
  const row = k
    .insertInto('market_orders')
    .columns(['id', 'poster', 'char_id', 'region', 'material', 'units', 'left_units', 'price', 'escrow', 'at', 'expires_at', 'rid', 'n'])
    .expression(guardedRow)
    .onConflict((oc) => oc.doNothing());
  const line = k
    .insertInto('marks_ledger')
    .columns(['src_kind', 'src_id', 'dst_kind', 'dst_id', 'kind', 'amount', 'day', 'at', 'actor', 'who', 'rid'])
    .expression(k
      .selectFrom('market_orders')
      .select((eb) => [
        eb.val('account').as('src_kind'),
        'poster',
        eb.val('escrow').as('dst_kind'),
        'id',
        eb.val('order-escrow').as('kind'),
        'escrow',
        eb.val(utcDay(post.nowS)).as('day'),
        'at',
        'poster as actor',
        'material',
        sql`rid || ${':escrow'}`.as('rid'),
      ])
      .where('poster', '=', post.poster)
      .where('rid', '=', post.rid)
      .where('n', '=', post.nonce));
  return [row, line];
}

/**
 * The order cancelled, where it is its poster's and still open.
 * @param {any} db @param {{ id: string, poster: string, nowS: number }} cancel
 */
export function orderCancelStatement(db, { id, poster, nowS }) {
  return kyselyOf(db)
    .updateTable('market_orders')
    .set({ state: 'cancelled', closed_at: nowS })
    .where('id', '=', id)
    .where('poster', '=', poster)
    .where('state', '=', 'open');
}

/**
 * What is left of a closed order's escrow back to its poster: one line keyed on the order's id, under the Marks cap
 * (else it waits), then the order marked returned.
 * @param {any} db @param {string} id @param {number} nowS
 */
export function orderReturnStatements(db, id, nowS) {
  const k = kyselyOf(db);
  const closeRid = `order-close:${id}`;
  const line = k
    .insertInto('marks_ledger')
    .columns(['src_kind', 'src_id', 'dst_kind', 'dst_id', 'kind', 'amount', 'day', 'at', 'actor', 'who', 'rid'])
    .expression(k
      .selectFrom('market_orders')
      .select((eb) => [
        eb.val('escrow').as('src_kind'),
        'id',
        eb.val('account').as('dst_kind'),
        'poster',
        eb.val('order-return').as('kind'),
        'escrow',
        eb.val(utcDay(nowS)).as('day'),
        eb.val(nowS).as('at'),
        'poster as actor',
        'material',
        eb.val(closeRid).as('rid'),
      ])
      .where('id', '=', id)
      .where('state', '!=', 'open')
      .where('returned', '=', 0)
      .where('escrow', '>', 0)
      .where((eb) => eb(
        eb(eb.fn.coalesce(eb.selectFrom('marks').select('balance').whereRef('account', '=', 'market_orders.poster'), eb.lit(0)), '+', eb.ref('escrow')),
        '<=',
        MARKS_MAX,
      )));
  const mark = k
    .updateTable('market_orders')
    .set({ escrow: 0, returned: 1 })
    .where('id', '=', id)
    .where('state', '!=', 'open')
    .where('returned', '=', 0)
    .where((eb) => eb.or([
      eb('escrow', '=', 0),
      eb.exists(eb.selectFrom('marks_ledger').select(eb.lit(1).as('one')).whereRef('actor', '=', 'market_orders.poster').where('rid', '=', closeRid)),
    ]));
  return [line, mark];
}
