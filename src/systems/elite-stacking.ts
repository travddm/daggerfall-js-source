// How an elite's or a champion's multipliers meet its dungeon's own. Elites are a tier of their own (about x2 health,
// x1.3 damage), one step above the foes around them rather than a second layer on theirs. By default an elite in an
// Elite or Super dungeon takes the larger of the elite tier and the dungeon's own layer, stat by stat, with nothing
// multiplied, and a champion likewise takes the larger of its own step and the layer. The `eliteStacking` pref (a Features
// row, elite-stacking-row.ts) brings back the stacked figures: x7 health and x2.6 damage for an elite in an Elite Dungeon,
// x9 and x3 in a Super dungeon, and a champion's step on the layer. Pinned off online (net/profile/officialProfile.ts).

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

/** A dungeon's layer as a host names it: an Elite or Super dungeon by name, an ocean band by its own figures, or none. */
export type DungeonLayer = 'elite' | 'super' | FoeMults | null | undefined;

/** The figures of a named layer. */
export function layerOf(layer: DungeonLayer): FoeMults | null {
  if (layer === 'elite') return ELITE_DUNGEON_LAYER;
  if (layer === 'super') return SUPER_DUNGEON_LAYER;
  return layer && Number.isFinite(layer.health) && Number.isFinite(layer.damage) ? layer : null;
}

/**
 * A champion's step on a foe its dungeon's layer has already scaled. By default the foe ends at the larger of
 * the two, stat by stat, so the step gives only what passes the layer; with the stacking row on, the whole step multiplies.
 */
export function stepOnLayer(step: FoeMults, layer: DungeonLayer, { stacked = eliteStackingOn() } = {}): FoeMults {
  const l = layerOf(layer);
  if (!l || stacked) return step;
  return { health: Math.max(step.health, l.health) / l.health, damage: Math.max(step.damage, l.damage) / l.damage };
}
