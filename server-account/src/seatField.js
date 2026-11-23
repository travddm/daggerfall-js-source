// @ts-check
// A SIEGE'S BATTLEFIELD, SETTLED FOR ITS FIRST PASS. The service never holds ARENA2, so it learns a town's field from the
// games that derived it (src/systems/siegeField.js), as it learns a seat (townSeats.js). A field is taken, in order:
//   1. the one three accounts a week old reported alike, over every week's submissions (siegeFieldLaw.js witnessedField);
//   2. the one an attacker and a defender submitted alike;
//   3. once the battle is joined and only one side ever submitted, that side's most-submitted.
// Two sides that never agree settle nothing: a count would hand the field to the bigger side's own geometry. Every
// submitted field must also keep the offsets an honest town's field has (siegeFieldLaw.js fieldShapeOk) and lie in or
// near the seat's pixel.
import { siegeFieldValid } from '../../src/net/identityToken.js';
import { settleField, witnessedField, fieldInPixel, fieldShapeOk } from '../../src/net/townSeatLaw.js';
import { WITNESS } from '../../src/net/nodeLaw.js';
import { confirmedSeats } from './townSeats.js';

/**
` * Records \`field\` as the player's report (a rostered fighter's, \`side\` not 'watch') and settles the battle's field,
` * once: a second request racing this one keeps the first's. Answers the field's JSON text, or \`{ error }\`.
 * @param {{db: any, nowS: number}} ctx
 * @param {{ b: any, week: number, key: number, side: string, field: unknown, playerId: string }} o
 * @returns {Promise<string | { error: string }>}
 */
export async function settleBattleField({ db, nowS }, { b, week, key, side, field, playerId }) {
  if (side !== 'watch') {
    const seat = (await confirmedSeats(db, nowS)).get(key);
    if (!siegeFieldValid(field, b.tier) || !fieldShapeOk(field, b.tier) || (seat && !fieldInPixel(field, seat.pixel)))
      return { error: 'field-bad' };
    await db
      .prepare(
        `INSERT INTO town_seat_fields (week, key, account, side, field, at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (week, key, account) DO UPDATE SET field = excluded.field, at = excluded.at`,
      )
      .bind(week, key, playerId, side, JSON.stringify(field), nowS)
      .run();
  }
  const { results: rows = [] } = await db
    .prepare('SELECT side, field, at FROM town_seat_fields WHERE week = ? AND key = ? ORDER BY at, rowid')
    .bind(week, key)
    .all();
  const { results: aged = [] } = await db
    .prepare(
      'SELECT f.field, f.account, f.at FROM town_seat_fields f JOIN players p ON p.id = f.account WHERE f.key = ? AND p.registered_at <= ?',
    )
    .bind(key, nowS - WITNESS.ageS)
    .all();
  const settled =
    witnessedField(aged) ??
    settleField(
      rows.map((r) => ({ side: r.side, field: r.field, at: Number(r.at) })),
      nowS >= b.starts_at,
      b.kind,
    ); // a revolt's first defender's
  if (!settled) return { error: 'field-unsettled' };
  await db
    .prepare('UPDATE town_seat_battles SET field = ? WHERE week = ? AND key = ? AND field IS NULL')
    .bind(settled, week, key)
    .run();
  return (
    (await db.prepare('SELECT field FROM town_seat_battles WHERE week = ? AND key = ?').bind(week, key).first())
      ?.field ?? settled
  );
}
