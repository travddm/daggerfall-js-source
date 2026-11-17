// @ts-check
// Study prototype: the Broker's insignia sale (accounts.js buyInsignia) written with Kysely, to show how the raw
// fragments carry over. EMBERS_EARNED_SQL names its account as `?1`, a placeholder its caller must bind first; as a
// fragment it takes the account as a value, and Kysely binds it in each place it appears.

import { sql } from 'kysely';
import { sqlOf } from './sql/db.js';
import { brokerRidFree } from './broker-sales-kysely.js';

/** @typedef {import('./sql/schema-types.js').Database} Database */

/**
 * The embers an account has earned: its gate kills' stones and its serpents'.
 * @param {string} account
 */
export const embersEarned = (account) => sql`((SELECT COALESCE(SUM(stones), 0) FROM gate_kills WHERE account = ${account})
  + (SELECT COALESCE(SUM(stones), 0) FROM serpent_kills WHERE account = ${account}))`;

/**
 * The sale's one UPDATE: the piece appended to the account's insignia and its price spent, only where the piece is not
 * held, the embers cover it, and (with a request id) no sale or fence of that id stands.
 * @param {any} db
 * @param {{ account: string, item: string, price: number, nowS: number, rid: string | null }} sale
 */
export function insigniaSaleStatement(db, { account, item, price, nowS, rid }) {
  /** @type {import('kysely').Kysely<Database>} */
  const k = sqlOf(db).kysely;
  return k
    .updateTable('players')
    .set((eb) => ({
      insignia: sql`CASE WHEN COALESCE(insignia, '') = '' THEN ${item} ELSE insignia || ' ' || ${item} END`,
      insignia_spent: eb('insignia_spent', '+', price),
      last_seen: nowS,
    }))
    .where('id', '=', account)
    .where(sql`(' ' || COALESCE(insignia, '') || ' ')`, 'not like', sql`'% ' || ${item} || ' %'`)
    .where(sql`${embersEarned(account)} - insignia_spent`, '>=', price)
    .$if(rid !== null, (q) => q.where(brokerRidFree(account, /** @type {string} */ (rid))))
    .returning(['insignia', 'insignia_spent']);
}
