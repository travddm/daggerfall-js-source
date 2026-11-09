// How an elite foe's multipliers meet its dungeon's own (decision 124, from decision 117 item 19). Decision 5 keeps
// elites as their own tier (about x2 health, x1.3 damage) with "no stacking with other layers". By default an elite in an
// Elite or Super dungeon takes the larger of the elite tier and the dungeon's own layer, stat by stat, with nothing
// multiplied. The `eliteStacking` pref (a Features row, elite-stacking-row.ts) brings back the stacked figures: x7 health
// and x2.6 damage in an Elite Dungeon, x9 and x3 in a Super dungeon. Pinned off online (net/profile/officialProfile.ts).

import { getPref } from './uiPrefs.js';

export const ELITE_STACKING_PREF = 'eliteStacking';

/** Whether an elite's multipliers stack on its dungeon's (the old figures). */
export const eliteStackingOn = (): boolean => getPref(ELITE_STACKING_PREF) === true;

export type FoeMults = { readonly health: number; readonly damage: number };

/** The dungeons' own layers, as every plain foe there stands. world/spawnedDungeons.js (ELITE_HEALTH_SCALE,
 *  ELITE_DAMAGE_SCALE) and world/superDungeon/sdDungeon.js (SUPER_HEALTH_SCALE, SUPER_DAMAGE_SCALE) hold them; they are
 *  written here so this module does not pull the world modules in, and test/systems/elite-stacking.test.js holds them
 *  equal. */
export const ELITE_DUNGEON_LAYER: FoeMults = Object.freeze({ health: 2, damage: 2 });
export const SUPER_DUNGEON_LAYER: FoeMults = Object.freeze({ health: 4, damage: 2.5 });

/** The stacked figures, the option's. */
export const ELITE_DUNGEON_STACKED: FoeMults = Object.freeze({ health: 7, damage: 2.6 });
export const SUPER_DUNGEON_STACKED: FoeMults = Object.freeze({ health: 9, damage: 3 });

/**
 * An elite's multipliers: the elite tier in the open, and in an Elite or Super dungeon the larger of the tier and the
 * dungeon's layer, stat by stat - or the stacked figures with the option on.
 */
export function eliteMults(
  tier: FoeMults,
  { eliteDungeon = false, superDungeon = false, stacked = eliteStackingOn() } = {},
): FoeMults {
  if (!eliteDungeon && !superDungeon) return tier;
  if (stacked) return superDungeon ? SUPER_DUNGEON_STACKED : ELITE_DUNGEON_STACKED;
  const layer = superDungeon ? SUPER_DUNGEON_LAYER : ELITE_DUNGEON_LAYER;
  return { health: Math.max(tier.health, layer.health), damage: Math.max(tier.damage, layer.damage) };
}
