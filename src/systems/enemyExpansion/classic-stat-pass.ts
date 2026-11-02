// The stat rows of Daggerfall's classic monsters when Enemy Expansion is loaded. Enemy Expansion and MUDEX rewrite these
// monsters; this table holds the numbers they stand at in this game: each field within 30% of Daggerfall Unity's own row
// (armor within 30% or 2 points). A rewritten monster keeps the mods' direction, and none is far too strong or weak.
// The test for this module holds every row to that bound.

export type ClassicStatRow = {
  level: number;
  minHealth: number;
  maxHealth: number;
  minDamage: number;
  maxDamage: number;
  minDamage2?: number;
  maxDamage2?: number;
  minDamage3?: number;
  maxDamage3?: number;
  armorValue: number;
};

/** Keyed by the monster's mobile id. A monster that neither mod edits has no row. */
export const CLASSIC_STAT_PASS: Readonly<Record<number, Readonly<ClassicStatRow>>> = Object.freeze({
  // Rat
  0: { level: 1, minHealth: 11, maxHealth: 20, minDamage: 1, maxDamage: 3, armorValue: 8 },
  // Spriggan
  2: {
    level: 3,
    minHealth: 12,
    maxHealth: 26,
    minDamage: 1,
    maxDamage: 10,
    minDamage2: 1,
    maxDamage2: 6,
    minDamage3: 1,
    maxDamage3: 7,
    armorValue: -2,
  },
  // Giant Bat
  3: { level: 3, minHealth: 9, maxHealth: 19, minDamage: 2, maxDamage: 9, armorValue: 4 },
  // Grizzly Bear
  4: {
    level: 4,
    minHealth: 16,
    maxHealth: 44,
    minDamage: 1,
    maxDamage: 10,
    minDamage2: 1,
    maxDamage2: 6,
    minDamage3: 1,
    maxDamage3: 7,
    armorValue: 7,
  },
  // Sabretooth Tiger
  5: {
    level: 4,
    minHealth: 16,
    maxHealth: 44,
    minDamage: 1,
    maxDamage: 13,
    minDamage2: 1,
    maxDamage2: 7,
    minDamage3: 3,
    maxDamage3: 11,
    armorValue: 4,
  },
  // Spider
  6: { level: 3, minHealth: 16, maxHealth: 44, minDamage: 4, maxDamage: 11, armorValue: 6 },
  // Orc
  7: { level: 6, minHealth: 16, maxHealth: 44, minDamage: 1, maxDamage: 7, armorValue: 5 },
  // Werewolf
  9: {
    level: 7,
    minHealth: 22,
    maxHealth: 50,
    minDamage: 1,
    maxDamage: 13,
    minDamage2: 1,
    maxDamage2: 7,
    minDamage3: 2,
    maxDamage3: 9,
    armorValue: 3,
  },
  // Orc Sergeant
  12: { level: 9, minHealth: 19, maxHealth: 65, minDamage: 6, maxDamage: 19, armorValue: 3 },
  // Wereboar
  14: {
    level: 8,
    minHealth: 22,
    maxHealth: 85,
    minDamage: 2,
    maxDamage: 15,
    minDamage2: 2,
    maxDamage2: 9,
    minDamage3: 4,
    maxDamage3: 11,
    armorValue: 5,
  },
  // Giant
  16: { level: 10, minHealth: 23, maxHealth: 96, minDamage: 10, maxDamage: 30, armorValue: 3 },
  // Zombie
  17: { level: 7, minHealth: 60, maxHealth: 85, minDamage: 11, maxDamage: 35, armorValue: 2 },
  // Mummy
  19: { level: 14, minHealth: 22, maxHealth: 85, minDamage: 5, maxDamage: 15, armorValue: 0 },
  // Giant Scorpion
  20: { level: 9, minHealth: 15, maxHealth: 70, minDamage: 11, maxDamage: 18, armorValue: 2 },
  // Orc Shaman
  21: { level: 15, minHealth: 23, maxHealth: 96, minDamage: 2, maxDamage: 26, armorValue: 6 },
  // Orc Warlord
  24: { level: 19, minHealth: 26, maxHealth: 117, minDamage: 6, maxDamage: 50, armorValue: -2 },
  // Frost Daedra
  25: { level: 17, minHealth: 25, maxHealth: 130, minDamage: 35, maxDamage: 70, armorValue: -3 },
  // Fire Daedra
  26: { level: 17, minHealth: 26, maxHealth: 138, minDamage: 15, maxDamage: 50, armorValue: -1 },
  // Ancient Vampire
  30: { level: 20, minHealth: 39, maxHealth: 200, minDamage: 25, maxDamage: 60, armorValue: -7 },
  // Daedra Lord
  31: { level: 21, minHealth: 45, maxHealth: 240, minDamage: 19, maxDamage: 65, armorValue: -10 },
  // Lich
  32: { level: 20, minHealth: 39, maxHealth: 200, minDamage: 80, maxDamage: 110, armorValue: -8 },
  // Ancient Lich
  33: { level: 21, minHealth: 39, maxHealth: 210, minDamage: 91, maxDamage: 130, armorValue: -12 },
  // Dragonling
  34: { level: 18, minHealth: 18, maxHealth: 54, minDamage: 6, maxDamage: 19, armorValue: 4 },
  // Fire Atronach
  35: { level: 16, minHealth: 25, maxHealth: 130, minDamage: 6, maxDamage: 19, armorValue: 6 },
  // Iron Atronach
  36: { level: 16, minHealth: 25, maxHealth: 130, minDamage: 5, maxDamage: 15, armorValue: 4 },
  // Flesh Atronach
  37: { level: 16, minHealth: 32, maxHealth: 169, minDamage: 5, maxDamage: 15, armorValue: 6 },
  // Ice Atronach
  38: { level: 20, minHealth: 25, maxHealth: 130, minDamage: 5, maxDamage: 15, armorValue: 6 },
  // Dreugh
  41: { level: 12, minHealth: 16, maxHealth: 44, minDamage: 6, maxDamage: 19, armorValue: 4 },
  // Lamia
  42: { level: 13, minHealth: 20, maxHealth: 74, minDamage: 6, maxDamage: 19, armorValue: 4 },
});
