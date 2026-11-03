// Which foes the harness fights at a player level: DFU's own encounter tables, summarised as a weak, an average and a
// strong foe.
//
// RandomEncounters.ChooseRandomEnemy (systems/encounters.js `chooseRandomEnemy`) picks a position in a dungeon's
// 20-entry table from a band that moves with the player's level: four times in five [level-3, level+3], else
// [0, level+1] (or, one time in twenty, [0, 19] - [0, level+2] up to level 5). The distribution over foes is exact and
// is computed here from that rule, not sampled. Foes are ordered by a threat score (mean health x mean damage a swing,
// on DFU's own rows) and the weak, average and strong foe are its 10th, 50th and 90th percentiles by probability.
//
// Class foes (mobile ids 128 and up, human fighters) need equipment and a career file to be built; this version skips
// them and renormalises. Orc Stronghold (table 1) holds none, which is why it is the default dungeon.
import { ENCOUNTER_TABLES } from '../../src/characters/encounterTables.js';
import { VANILLA_ENEMY_BASICS, isClassEnemyId } from '../../src/characters/enemy/enemyBasics.js';

export const DEFAULT_DUNGEON = 1;   // DFRegion.DungeonTypes.OrcStronghold
export const DUNGEON_NAMES = Object.freeze({
  crypt: 0, orcstronghold: 1, humanstronghold: 2, prison: 3, desecratedtemple: 4, mine: 5, naturalcave: 6, coven: 7,
  vampirehaunt: 8, laboratory: 9, harpynest: 10, ruinedcastle: 11, spidernest: 12, giantstronghold: 13, dragonsden: 14,
  barbarianstronghold: 15, volcaniccaves: 16, scorpionnest: 17, cemetery: 18,
});
export const FOE_QUANTILES = Object.freeze({ weak: 0.1, average: 0.5, strong: 0.9 });

/** The [min, max] table positions one Dice100 roll (1..100) picks from at `level` (chooseRandomEnemy's band). */
export function bandFor(roll, level) {
  let min;
  let max;
  if (roll > 80) {
    if (roll > 95) {
      if (level <= 5) { min = 0; max = level + 2; } else { min = 0; max = 19; }
    } else { min = 0; max = level + 1; }
  } else { min = level - 3; max = level + 3; }
  if (min < 0) { min = 0; max = 5; }
  if (max > 19) { min = 14; max = 19; }
  return { min, max };
}

/** Probability of each mobile id for a dungeon table at a player level. */
export function encounterDistribution(tableIndex, level) {
  const table = ENCOUNTER_TABLES[tableIndex];
  const odds = new Map();
  for (let roll = 1; roll <= 100; roll++) {
    const { min, max } = bandFor(roll, level);
    const width = max + 1 - min;
    for (let at = min; at <= max; at++) {
      const id = table[at];
      odds.set(id, (odds.get(id) ?? 0) + 1 / 100 / width);
    }
  }
  return odds;
}

/** Mean health x mean damage a swing (all three attacks) on DFU's vanilla row: the order foes are ranked in. */
export function threatScore(id) {
  const row = VANILLA_ENEMY_BASICS[id];
  const health = (row.minHealth + row.maxHealth) / 2;
  const swing = (row.minDamage + row.maxDamage) / 2
    + ((row.minDamage2 ?? 0) + (row.maxDamage2 ?? 0)) / 2
    + ((row.minDamage3 ?? 0) + (row.maxDamage3 ?? 0)) / 2;
  return health * Math.max(1, swing);
}

/** The weak, average and strong foe ids at a level. */
export function representativeFoes(level, tableIndex = DEFAULT_DUNGEON) {
  const odds = encounterDistribution(tableIndex, level);
  for (const id of [...odds.keys()]) if (isClassEnemyId(id)) odds.delete(id);
  const total = [...odds.values()].reduce((a, b) => a + b, 0);
  const ranked = [...odds.entries()].sort((a, b) => threatScore(a[0]) - threatScore(b[0]) || a[0] - b[0]);
  const pick = (quantile) => {
    let seen = 0;
    for (const [id, p] of ranked) {
      seen += p / total;
      if (seen >= quantile) return id;
    }
    return ranked[ranked.length - 1][0];
  };
  return { weak: pick(FOE_QUANTILES.weak), average: pick(FOE_QUANTILES.average), strong: pick(FOE_QUANTILES.strong) };
}
