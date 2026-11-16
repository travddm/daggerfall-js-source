// The reference builds the balance harness measures, and how each one grows with level.
//
// A build is a class shape: which six skills count toward the level (DFU's level sum), which attributes the
// per-level points go to, the class's hit points per level, the weapon it fights with, and the armour it wears.
// Nothing here reads a save. The numbers are stated so a reader can argue with them; docs/systems/balance-harness.md
// lists them.
import { SKILLS } from '../../src/systems/skills.js';

/** Template indices (ItemEnums Weapons / ArmorTemplates) the builds wield. */
export const WEAPON_TEMPLATES = Object.freeze({ Dagger: 113, Staff: 115, Longsword: 120, LongBow: 130 });
export const ARMOUR_TEMPLATES = Object.freeze([102, 103, 104, 105, 106, 107, 108]);   // cuirass, gauntlets, greaves, 2 pauldrons, helm, boots
export const ARMOUR_KIND = Object.freeze({ none: 'none', leather: 'leather', chain: 'chain', plate: 'plate' });

const STAT_KEYS = Object.freeze(['strength', 'intelligence', 'willpower', 'agility', 'endurance', 'personality', 'speed', 'luck']);

/**
 * `counted`: the six skills DFU's level sum reads (3 primary, the best 2 of 3 major, the best minor), each tagged with
 * the group whose chargen base it starts from. `support`: other skills the build fights with that the level sum does
 * not count; they rise at half the pace of a counted skill.
 * `statWeights`: the share of each level's attribute points a stat takes (the rest of the stats stay at `baseStats`).
 * `spell`: the Destruction spell a caster or spellsword casts (DFU spell record index; see ours.mjs / dfu.mjs).
 */
export const BUILDS = Object.freeze({
  warrior: {
    label: 'Warrior',
    weapon: WEAPON_TEMPLATES.Longsword,
    armour: ARMOUR_KIND.plate,
    hpPerLevel: 14,
    counted: [
      { skill: SKILLS.LongBlade, group: 'primary' }, { skill: SKILLS.CriticalStrike, group: 'primary' }, { skill: SKILLS.Dodging, group: 'primary' },
      { skill: SKILLS.Axe, group: 'major' }, { skill: SKILLS.BluntWeapon, group: 'major' }, { skill: SKILLS.Jumping, group: 'minor' },
    ],
    support: [],
    baseStats: { strength: 70, intelligence: 40, willpower: 45, agility: 60, endurance: 65, personality: 40, speed: 55, luck: 50 },
    statWeights: { strength: 0.3, endurance: 0.25, agility: 0.2, speed: 0.15, luck: 0.1 },
    spell: null,
  },
  archer: {
    label: 'Archer',
    weapon: WEAPON_TEMPLATES.LongBow,
    armour: ARMOUR_KIND.chain,
    hpPerLevel: 10,
    counted: [
      { skill: SKILLS.Archery, group: 'primary' }, { skill: SKILLS.CriticalStrike, group: 'primary' }, { skill: SKILLS.Dodging, group: 'primary' },
      { skill: SKILLS.Stealth, group: 'major' }, { skill: SKILLS.Running, group: 'major' }, { skill: SKILLS.Climbing, group: 'minor' },
    ],
    support: [],
    baseStats: { strength: 60, intelligence: 45, willpower: 45, agility: 70, endurance: 55, personality: 40, speed: 60, luck: 50 },
    statWeights: { agility: 0.3, strength: 0.25, speed: 0.2, endurance: 0.15, luck: 0.1 },
    spell: null,
  },
  spellsword: {
    label: 'Spellsword',
    weapon: WEAPON_TEMPLATES.Longsword,
    armour: ARMOUR_KIND.chain,
    hpPerLevel: 10,
    counted: [
      { skill: SKILLS.LongBlade, group: 'primary' }, { skill: SKILLS.Destruction, group: 'primary' }, { skill: SKILLS.Dodging, group: 'primary' },
      { skill: SKILLS.Restoration, group: 'major' }, { skill: SKILLS.Alteration, group: 'major' }, { skill: SKILLS.CriticalStrike, group: 'minor' },
    ],
    support: [],
    baseStats: { strength: 60, intelligence: 60, willpower: 55, agility: 55, endurance: 55, personality: 40, speed: 50, luck: 50 },
    statWeights: { strength: 0.2, intelligence: 0.25, willpower: 0.15, endurance: 0.2, agility: 0.1, speed: 0.1 },
    spell: 'bolt',
  },
  mage: {
    label: 'Mage',
    weapon: WEAPON_TEMPLATES.Staff,
    armour: ARMOUR_KIND.none,
    hpPerLevel: 6,
    counted: [
      { skill: SKILLS.Destruction, group: 'primary' }, { skill: SKILLS.Restoration, group: 'primary' }, { skill: SKILLS.Alteration, group: 'primary' },
      { skill: SKILLS.Illusion, group: 'major' }, { skill: SKILLS.Thaumaturgy, group: 'major' }, { skill: SKILLS.Mysticism, group: 'minor' },
    ],
    support: [SKILLS.BluntWeapon, SKILLS.Dodging],
    baseStats: { strength: 40, intelligence: 70, willpower: 65, agility: 45, endurance: 45, personality: 50, speed: 50, luck: 50 },
    statWeights: { intelligence: 0.35, willpower: 0.25, endurance: 0.2, speed: 0.1, agility: 0.1 },
    spell: 'bolt',
  },
  thief: {
    label: 'Thief',
    weapon: WEAPON_TEMPLATES.Dagger,
    armour: ARMOUR_KIND.leather,
    hpPerLevel: 8,
    counted: [
      { skill: SKILLS.ShortBlade, group: 'primary' }, { skill: SKILLS.CriticalStrike, group: 'primary' }, { skill: SKILLS.Dodging, group: 'primary' },
      { skill: SKILLS.Stealth, group: 'major' }, { skill: SKILLS.Lockpicking, group: 'major' }, { skill: SKILLS.Climbing, group: 'minor' },
    ],
    support: [],
    baseStats: { strength: 50, intelligence: 45, willpower: 40, agility: 70, endurance: 50, personality: 45, speed: 70, luck: 55 },
    statWeights: { agility: 0.3, speed: 0.25, strength: 0.15, endurance: 0.2, luck: 0.1 },
    spell: null,
  },
});

export const BUILD_NAMES = Object.freeze(Object.keys(BUILDS));

/** The skill that drives the build's weapon swing. */
export const weaponSkillOf = (build) => build.counted.find((c) => c.skill !== SKILLS.CriticalStrike && c.skill !== SKILLS.Dodging && c.group === 'primary')?.skill
  ?? build.counted[0].skill;

/** Chargen bases (DFU CreateCharSkillsRollout): a primary skill starts at 28, a major at 18, a minor at 13; the roll adds
 *  Range(0,3) (mean 1.5, taken as 2) and the pool adds 6 points per group (2 per primary, 2 per major, 1 per minor). */
export const SKILL_START = Object.freeze({ primary: 28 + 2 + 2, major: 18 + 2 + 2, minor: 13 + 2 + 1 });
/** A skill outside the build's lists. */
export const MISC_SKILL_START = 8;
/** DFU: a character's level reads floor((sum - startSum + 28) / 15), the sum being primaries + majors - lowest major + best minor. */
export const LEVEL_PER_SUM = 15;
export const LEVEL_HEAD_START = 28;

export const startSumOf = (build) => build.counted.reduce((s, c) => s + SKILL_START[c.group], 0);
export { STAT_KEYS };
