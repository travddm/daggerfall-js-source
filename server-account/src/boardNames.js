// @ts-check
// ═══════════════════════════════════════════════════════════════════
// AUDIT CARDS-6 D3 (2026-10-09) - A SEASON BOARD'S NAMES, EVERY HONOUR ON THEM.
//
// A season board badges its rows with every honour, as the token, a letter
// and a notice wear them all (letters.js, board.js), never its OWN alone.
//
// ONE DOOR FOR EVERY BOARD. A board lays the honours it counted itself with
// the board it answers (`own` - its #1 off its own rows, as fresh as the
// board); the others are read as a letter's sender's are (arena.js
// withArenaHonoursAll - the Worker's kept words, never a count).
//
// Not a DFU member: Daggerfall Unity has no accounts.
// ═══════════════════════════════════════════════════════════════════
import { displayName } from './accounts.js';
import { titleWorn, glyphsOf } from './titles.js';
import { withArenaHonoursAll } from './arena.js';
import { withEgHonoursAll } from './egHonours.js';   // EG-E2: and the Spire Champions
import { withMasteryMarksAll } from './hunts.js';   // MARKS-OF-MASTERY

/**
 * Players by id, each with the badge they wear now: `{ name, title, glyphs }` (titles.js). `own` names the honours the
 * board counted itself - `{ arena: (row) => ({ grand, champion }) }` - laid over the rest, which are read as a letter's
 * are.
 * @param {{ db: any }} ctx @param {string[]} ids @param {any} env @param {number} nowS
 * @param {{ arena?: (row: any) => any }} own
 */
export async function boardNamesOf(ctx, ids, env, nowS, own) {
  const want = [...new Set(ids.filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < want.length; i += 50) {
    const part = want.slice(i, i + 50);
    let rows = (await ctx.db.prepare(`SELECT * FROM players WHERE id IN (${part.map((_, k) => `?${k + 1}`).join(', ')})`).bind(...part).all()).results ?? [];
    if (!own.arena) rows = await withArenaHonoursAll(ctx, rows, nowS);
    rows = await withEgHonoursAll(ctx, rows, nowS);   // EG-E2: and the last season's Spire Champions, the Worker's kept word on every board
    rows = await withMasteryMarksAll(ctx, rows);   // MARKS-OF-MASTERY: the hunt's, a Master's and the sea's titles, read off their rows
    for (const row of rows) {
      const withH = { ...row, ...(own.arena ? { arena: own.arena(row) } : {}) };
      out.set(row.id, { name: displayName(row), title: titleWorn(withH, env) ?? null, glyphs: glyphsOf(withH, env, nowS) });
    }
  }
  return out;
}
