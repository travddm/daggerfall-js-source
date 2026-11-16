// @ts-check
// The checks the arena referee (arenaBrain.js refBlow) makes on one blow claim, apart from the damage: what the striker
// holds, how often it strikes and casts, how far its blow reaches, and the magicka its spells draw on. Each answers from
// the room's own state; none reads the claimed damage.
import {
  ARENA_HIT,
  ARENA_HIT_HZ_MAX,
  ARENA_SPELLS_IN,
  ARENA_SPELL_WINDOW_MS,
  ARENA_MELEE_REACH,
  ARENA_POSE_SLACK,
  ARENA_BOW_REACH,
  ARENA_SPELL_REACH,
  ARENA_MAGICKA_DEPTH,
  ARENA_MAGICKA_REGEN,
  arenaArmsOk,
  arenaHeld,
} from './arenaLaw.js';

/** Whether the weapon a blow names is the striker's: a spell names none, a weapon blow the one in its hand (arenaHeld).
 *  @param {any} look @param {number} r @param {number} w @param {number} m */
export const blowHeld = (look, r, w, m) => r === ARENA_HIT.Spell || arenaHeld(look, w, m) !== null;

/**
 * The striker's rate, spent for this blow: the blows of the last second, one blow by its sequence `q` however many bodies
 * it met, and a spell's count in its window. Answers whether the blow may go on.
 * @param {any} M the striker's record in the bout @param {number} r @param {number | null} q @param {number} now
 */
export function rateSpent(M, r, q, now) {
  M.hits = M.hits.filter((x) => now - x < 1000);
  if (q != null && q === M.q && now - M.qAt < 250) return true;
  if (M.hits.length >= ARENA_HIT_HZ_MAX) return false;
  if (r === ARENA_HIT.Spell) {
    M.spells = M.spells.filter((x) => now - x < ARENA_SPELL_WINDOW_MS);
    if (M.spells.length >= ARENA_SPELLS_IN) return false;
    M.spells.push(now);
  }
  M.hits.push(now);
  M.q = q ?? -1;
  M.qAt = now;
  return true;
}

/**
 * How a blow of kind `r` fares over `gap` metres: 'miss' (a melee blow out of reach: a miss on the record), 'none' (a
 * shaft or spell out of reach, or a shaft with no signed bow: not believed) or null (in reach).
 * @param {number} r @param {number} gap @param {any} wa the striker's signed arms
 */
export function reachVerdict(r, gap, wa) {
  if (r === ARENA_HIT.Melee) return gap > ARENA_MELEE_REACH + ARENA_POSE_SLACK ? 'miss' : null;
  if (r === ARENA_HIT.Spell) return gap > ARENA_SPELL_REACH + ARENA_POSE_SLACK ? 'none' : null;
  return gap > ARENA_BOW_REACH || (arenaArmsOk(wa) && wa[1] !== 1) ? 'none' : null; // INT7: a shaft a signed bow's
}

/** The points of magicka the fighter's record \`M\` has at \`now\`; a blow that is no spell draws on none (no limit).
 *  @param {any} M @param {number} r @param {number} now */
export function magickaFor(M, r, now) {
  if (r !== ARENA_HIT.Spell) return Infinity;
  const refilled =
    (M.magicka ?? ARENA_MAGICKA_DEPTH) + (Math.max(0, now - (M.magickaAt ?? now)) / 1000) * ARENA_MAGICKA_REGEN;
  return Math.floor(Math.min(ARENA_MAGICKA_DEPTH, refilled));
}
/** Spends a spell's \`cost\` of the fighter's magicka. @param {any} M @param {number} r @param {number} cost @param {number} now */
export function magickaSpent(M, r, cost, now) {
  if (r !== ARENA_HIT.Spell) return;
  M.magicka = magickaFor(M, r, now) - cost;
  M.magickaAt = now;
}
