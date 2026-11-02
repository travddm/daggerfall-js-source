// @ts-check
// The hero's threat: past the level Daggerfall Unity's own characters reach, foes stand a little tougher.
//
// Daggerfall Unity (DFU) stops its player at level 30 by its 100-point skill cap, and its monsters never grow with the
// player. This game lets a character climb to level 45, and the player-power budget (docs/systems/balance-harness.md)
// puts a level-45 character at about 1.3 to 2.2 times a DFU character. The threat answers that last stretch only:
// each level past HERO_THREAT.from, up to HERO_THREAT.to, a foe's blows land a little harder and it stands a little
// tougher, compounding. At level 45 a foe hits 1.7 times as hard and has 1.3 times the health, which is 1.5 times a foe in
// the balance harness's fight power (the geometric mean of the kill-time and survival-time ratios). Most of the step is
// in the blow, so a fight does not run long. Up to level 30 a foe is its row as DFU has it.
//
// Whose level: the threat is read where the foe is built, from the builder's player. Every client builds its own copy of
// every foe it sees, so a foe's blows at me carry my threat: my own foes, a dungeon's layout copy, and a peer's puppet
// (its blows only; its maximum health is its owner's word). While mentoring the group's level counts
// (mentorMode.js effectiveLevel).
//
// Where it applies: dungeon foes and wilderness foes of every kind. It does not apply to a promoted foe (an elite or a
// champion, systems/foe-promotion.ts), which has stats of its own, to an ally, to the watch, to a town or a building,
// or to a tuned stage (a made level, the arena floor).

import { effectiveLevel } from './mentorMode.js';
import { lootRarityOn } from './loot/lootRarity.js';

/** Each level from `from` (exclusive) to `to` multiplies a foe's blows by `damage` and its health by `health`. */
export const HERO_THREAT = Object.freeze({ from: 30, to: 45, damage: 1.036, health: 1.018 });

/**
 * The factors a foe's blows and health stand at for a hero of this level: 1 at `from` or lower. Pure.
 * @param {number} level
 * @returns {{ damage: number, health: number, steps: number }} `steps`: the levels that pay
 */
export function heroThreat(level) {
  const steps = Number.isFinite(level) ? Math.max(0, Math.min(HERO_THREAT.to, Math.trunc(level)) - HERO_THREAT.from) : 0;
  return { damage: HERO_THREAT.damage ** steps, health: HERO_THREAT.health ** steps, steps };
}

/**
 * The spawn door's reader: the threat a foe built now stands at against `player`, or null where none stands (the loot
 * ladder off, or nothing to pay). `puppet`: another client's foe, whose blows alone are scaled.
 * @param {any} player
 * @param {{ puppet?: boolean }} [o]
 * @returns {{ damage: number, health: number, steps: number } | null}
 */
export function heroThreatOf(player, { puppet = false } = {}) {
  if (!player || !lootRarityOn()) return null;
  const t = heroThreat(effectiveLevel(player));
  if (!(t.steps > 0)) return null;
  return puppet ? { ...t, health: 1 } : t;
}
