// AUDIT FB1024 - THE BROKER'S SALES BY THEIR REQUEST IDS.
//
// A press of the Broker's insignia (accounts.js buyInsignia) may carry a
// request id (`rid`, src/net/insignia.js BROKER_RID_RE). The sale writes `broker_sales` in its own
// batch, only where its write took, and refuses a `rid` this account has a row of: a FENCE (`fenced`), or the same press
// asked again (the sale's own answer, `again`). A client whose answer was lost asks `/v1/broker/settle` by the `rid`
// (settleBrokerSale): the row it wrote answers the sale - `held`, and which ask came first (`by`, the first ask's nonce:
// the piece is handed to that ask, never to a save loaded again that asks a second time); no row, and the id is fenced in
// the same statement, so the press can never write after the client gave its embers back. The cause it closes: the
// client asked "does the account hold a sale like this one?" - by the week and the piece - and an earlier honest sale,
// or the week turning, answered for a press that never landed (AUDIT FB1024 lanes B and C).

import { sql } from 'kysely';
import { BROKER_RID_RE } from '../../src/net/insignia.js';
import { sqlOf } from './database-seam.ts';

/** A request id the law accepts. */
export const brokerRidOk = (rid) => typeof rid === 'string' && BROKER_RID_RE.test(rid);
/** A settle's nonce: the same shape as a request id. */
const nonceOk = brokerRidOk;

/** The row a request id wrote for this account, or null: `{ kind, item, at }`. */
export async function brokerSaleOf(db, account, rid) {
  const seam = sqlOf(db);
  const query = seam.kysely
    .selectFrom('broker_sales')
    .select(['kind', 'item', 'at'])
    .where('account', '=', account)
    .where('rid', '=', rid);
  const r = (await seam.run(query)).rows[0];
  return r ? { kind: String(r.kind), item: typeof r.item === 'string' ? r.item : null, at: Number(r.at) || 0 } : null;
}

/** The sale's own row, in its batch after the write it records: written only where that write took (`changes()`). */
export function brokerSaleWrite(db, { account, rid, kind, item, nowS }) {
  const k = sqlOf(db).kysely;
  const row = k
    .selectNoFrom((eb) => [
      eb.val(account).as('account'),
      eb.val(rid).as('rid'),
      eb.val(kind).as('kind'),
      eb.val(item).as('item'),
      eb.val(nowS).as('at'),
    ])
    .where(sql`changes()`, '>', 0);
  // A D1 statement, because the sale's caller (accounts.js buyInsignia) still sends its own db.batch
  return sqlOf(db).statement(k.insertInto('broker_sales').columns(['account', 'rid', 'kind', 'item', 'at']).expression(row));
}

/** The guard a sale's UPDATE carries: no row of this request id (`acc` and `rid` its SQL parameters). */
export const brokerRidFreeSql = (acc, rid) => `NOT EXISTS (SELECT 1 FROM broker_sales WHERE account = ${acc} AND rid = ${rid})`;

/**
 * THE SETTLE - `body.rid` the press asked after, `body.nonce` this ask's own. One batch: the fence written where the id
 * has no row (ON CONFLICT: a sale's row, or a fence already, stands), then the row counted and its first ask kept.
 * Answers `{ held: false }` (fenced - nothing was sold, nothing will be), or `{ held: true, kind, item, by }`
 * (`by` the first ask's nonce), or `{ error }`: `guest`, `rid` (a bad id or nonce).
 * @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 */
export async function settleBrokerSale({ db, nowS }, player, body) {
  if (!player?.handle) return { error: 'guest' };
  const rid = body?.rid, nonce = body?.nonce;
  if (!brokerRidOk(rid) || !nonceOk(nonce)) return { error: 'rid' };
  const seam = sqlOf(db);
  const fence = seam.kysely
    .insertInto('broker_sales')
    .values({ account: player.id, rid, kind: 'fence', item: null, at: nowS })
    .onConflict((oc) => oc.columns(['account', 'rid']).doNothing());
  const count = seam.kysely
    .updateTable('broker_sales')
    .set((eb) => ({ settled: eb('settled', '+', 1), asked_by: eb.fn.coalesce('asked_by', eb.val(nonce)) }))
    .where('account', '=', player.id)
    .where('rid', '=', rid)
    .returning(['kind', 'item', 'at', 'asked_by']);
  const [, counted] = await seam.atomic([fence, count]);
  const row = counted?.rows?.[0];
  // Only an insignia sale is held: a fence, or a row of a sale kind the Broker no longer makes, answers as nothing sold
  if (!row || row.kind !== 'insignia') return { held: false };
  return { held: true, kind: String(row.kind), item: row.item, by: String(row.asked_by) };
}
