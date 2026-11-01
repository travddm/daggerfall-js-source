// @ts-check
// ═══════════════════════════════════════════════════════════════════
// OCEAN BAND DIFFICULTY: the deeper the sea, the harder its dungeons. A property of the ocean's bands (Shallows 1,
// Reaches 2, Deep Aether 3, Abyss 4 - systems/sea/etherRings.js), with no player fighting in it. Pure: a ring in, the
// factors out; the dungeon host (scenes/dungeonContext.js) applies them to the foes it builds and the loot it rolls.
//
// Two kinds of ocean dungeon:
//   - the day's VAULTS (systems/sea/seaVaults.js, rings 3 and 4 only): elite dungeons, so their foes are already the
//     tier-picked set of systems/sea/vaultFoes.js. They get about twice the health and 1.3 times the blows - the same
//     health step as any elite dungeon (world/spawnedDungeons.js ELITE_HEALTH_SCALE 2), with a gentler blow than an
//     elite's 2 so the sea is hard to clear but not a wall to a character of the tamed curve.
//   - plain RUIN isles: a smaller step, 1.1 to 1.4 times the health and 1.05 to 1.15 times the blows by ring.
// Veilhaven's peace (ring 0) and any place that is not the sea's get no factors (`null`).
// The factors are the same for every client (a pure function of the ring), so every client builds a room's foes alike.
// ═══════════════════════════════════════════════════════════════════
import { isGoldPieces } from '../inventory.js';

/** @typedef {{ health: number, damage: number, loot: number, gold: number }} OceanBandFactors */

/** A ruin isle's factors by ring 1..4 (Shallows to Abyss): each step a little harder; all under the vaults'. */
const RUIN_FACTORS = Object.freeze([
  Object.freeze({ health: 1.1, damage: 1.05, loot: 1.05, gold: 1.05 }),
  Object.freeze({ health: 1.2, damage: 1.08, loot: 1.1, gold: 1.1 }),
  Object.freeze({ health: 1.3, damage: 1.12, loot: 1.15, gold: 1.15 }),
  Object.freeze({ health: 1.4, damage: 1.15, loot: 1.2, gold: 1.2 }),
]);

/** A vault's factors for the Deep Aether (ring 3) and the Abyss (ring 4). `loot` multiplies the elite dungeon's own 1.2
 *  drop and quality step; `gold` is capped at 1.25 so the sea never out-pays the land in coin. */
const VAULT_FACTORS = Object.freeze({
  3: Object.freeze({ health: 1.8, damage: 1.2, loot: 1.1, gold: 1.15 }),
  4: Object.freeze({ health: 2, damage: 1.3, loot: 1.2, gold: 1.25 }),
});

/**
 * The factors for an ocean dungeon, or null where there are none.
 * @param {{ ring: number, vault?: boolean }} place `ring` the band 1..4 (0: Veilhaven's peace or not the sea); `vault` a day's vault
 * @returns {OceanBandFactors | null}
 */
export function oceanBandDifficulty({ ring, vault = false }) {
  const r = Math.trunc(Number(ring)) || 0;
  if (r < 1) return null;
  const band = Math.min(4, r);
  if (vault) return VAULT_FACTORS[/** @type {3 | 4} */ (Math.max(3, band))];
  return RUIN_FACTORS[band - 1];
}

/**
 * A foe's coin scaled in place: every gold piece of `items` by `factor`, whole and at least one. Answers the items.
 * @param {any[]} items @param {number} factor
 */
export function scaleGoldPieces(items, factor) {
  if (!Array.isArray(items) || !(factor > 1)) return items;
  for (const it of items) if (isGoldPieces(it)) it.stackCount = Math.max(1, Math.round(Math.max(1, it.stackCount ?? 1) * factor));
  return items;
}
