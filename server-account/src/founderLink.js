// @ts-check
// ═══════════════════════════════════════════════════════════════════
// FOUNDER5 — THE LINK, KEPT LIVE.
//
// and then, "I want to do this without my input".
//
// FOUNDER4's migration (0078) wrote `players.first_played_at` ONCE: the
// earliest first play of a row an account shares a character with. Its
// own note said what that left out - "a character carried onto a new
// account after it is not linked by this" - and asked a person to run
// the statement again by hand. Nobody has to now: the same fact is
// written at the moment a character arrives on an account, for that
// account and that character alone.
//
// It runs where a character ARRIVES - a cloud save's card (saves.js
// putCard, a new slot) - never on the token's path, which runs about once
// a second (STORM-SHED). That is a rare, deliberate act a player makes.
//
// The holdings read are 0078's, less one: `renown_tracks`. Its char_id
// is second in its key, so asking it by character reads the whole table,
// and a track is keyed by a realm id the service mints for one account,
// which links nothing (0078 says so of realm ids). The realm's census and
// customs passes named the offline characters brought into the realm; the
// realm takes none now, so they hold nothing a new arrival can match. One hop, as
// 0078: the row that holds the character, never a row linked through it.
// Earlier only: a link never moves an account's first play later.
// ═══════════════════════════════════════════════════════════════════

/** The statement, bound as (?1 account, ?2 character id). Exported for the pin that it reads what 0078 reads. */
export const LINK_SQL = 'WITH linked AS ('
  + 'SELECT MIN(MIN(o.created_at, COALESCE(o.registered_at, o.created_at))) AS t FROM players o'
  + ' WHERE o.id <> ?1 AND o.id IN ('
  + 'SELECT player_id FROM saves WHERE character_id = ?2))'
  + ' UPDATE players SET first_played_at = (SELECT t FROM linked)'
  + ' WHERE id = ?1 AND (SELECT t FROM linked) < MIN(created_at, COALESCE(registered_at, created_at), COALESCE(first_played_at, created_at))';

/**
 * Record, for this account, the earliest first play of another row that holds this character - where it is earlier
 * than the account's own. A fact about when the player played, never a grant: titles.js reads it as it reads 0078's.
 * A failure is swallowed: the save it follows has already landed, and a link missed now is made again
 * the next time the character arrives.
 * @param {{ db: any }} ctx @param {string} playerId @param {string} charId
 */
export async function linkFirstPlay({ db }, playerId, charId) {
  if (!playerId || typeof charId !== 'string' || !charId) return;
  try { await db.prepare(LINK_SQL).bind(playerId, charId).run(); } catch { /* the next arrival links it */ }
}
