// The content tiers a foe stands in: each is the game's own health and damage factors, read from the modules that apply
// them (never copied), so a retune of a tier moves the harness with it.
import { ELITE_HEALTH_SCALE, ELITE_DAMAGE_SCALE } from '../../src/world/spawnedDungeons.js';
import { SUPER_HEALTH_SCALE, SUPER_DAMAGE_SCALE, SUPER_FOE_LEVEL_MIN } from '../../src/world/superDungeon/sdDungeon.js';
import {
  ELITE_FOE_HEALTH_MULT,
  ELITE_FOE_DAMAGE_MULT,
  ELITE_FOE_ELITE_DUNGEON_HEALTH_MULT,
  ELITE_FOE_ELITE_DUNGEON_DAMAGE_MULT,
  ELITE_FOE_SUPER_DUNGEON_HEALTH_MULT,
  ELITE_FOE_SUPER_DUNGEON_DAMAGE_MULT,
} from '../../src/systems/eliteFoes.js';
import { oceanBandDifficulty } from '../../src/systems/sea/oceanBandDifficulty.js';

/** Factors by tier name: a foe's total, not a step on the one before (a vault's band replaces the elite dungeon's step). */
export const CONTENT_TIERS = Object.freeze({
  eliteFoe: { health: ELITE_FOE_HEALTH_MULT, damage: ELITE_FOE_DAMAGE_MULT, note: 'an elite among open-world foes' },
  eliteDungeon: { health: ELITE_HEALTH_SCALE, damage: ELITE_DAMAGE_SCALE, note: 'a foe of an Elite dungeon' },
  eliteDungeonElite: {
    health: ELITE_FOE_ELITE_DUNGEON_HEALTH_MULT,
    damage: ELITE_FOE_ELITE_DUNGEON_DAMAGE_MULT,
    note: 'an elite of an Elite dungeon',
  },
  superFoe: {
    health: SUPER_HEALTH_SCALE,
    damage: SUPER_DAMAGE_SCALE,
    note: 'a foe of the Abyss (Super dungeon)',
    foeLevel: SUPER_FOE_LEVEL_MIN,
  },
  superElite: {
    health: ELITE_FOE_SUPER_DUNGEON_HEALTH_MULT,
    damage: ELITE_FOE_SUPER_DUNGEON_DAMAGE_MULT,
    note: 'an elite of the Abyss',
    foeLevel: SUPER_FOE_LEVEL_MIN,
  },
  vault3: vaultTier(3),
  vault4: vaultTier(4),
});

function vaultTier(ring) {
  const f = oceanBandDifficulty({ ring, vault: true });
  return {
    health: f.health,
    damage: f.damage,
    note: `a ring ${ring} vault foe (the band replaces the elite dungeon's step)`,
  };
}

export const CONTENT_TIER_NAMES = Object.freeze(Object.keys(CONTENT_TIERS));
