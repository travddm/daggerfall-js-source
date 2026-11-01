// One build at one level against one foe, under DFU's rules and under this game's: the numbers the report prints.
//
// A cell holds: the player's damage per second (hit chance x damage x swing or cast rate), the seconds to kill the foe,
// the foe's damage per second to the player (hit chance x damage x attack rate, after the player's armour and guard) and
// the seconds for the foe to kill the player.
//
// Casters (a build with a `spell`) fight on a horizon of FIGHT_SECONDS: they cast while their magicka lasts and swing
// their weapon for the rest. Their damage per second is the mean over the horizon. There is no saving throw and no
// elemental tolerance in either rule set.
import { VANILLA_ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { ENEMY_NAMES } from '../../src/characters/enemy/enemyBasics.js';
import { rollMagnitude } from '../../src/systems/spellcast.js';
import { classicCastingCost } from '../../src/systems/spellcost.js';
import { spellPowerMult } from '../../src/systems/spell/spellPower.js';
import { castRate } from '../../src/systems/castSpeed.js';
import { techniquesFor, techniqueMult, TECHNIQUES, TECHNIQUE_BANDS } from '../../src/combat/technique/techniqueRoster.js';
import { liveStat } from '../../src/systems/statMods.js';
import { skillValue, SKILLS } from '../../src/systems/skills.js';
import { mintKit, wearKit } from './gear.mjs';
import { weaponSkillOf, WEAPON_TEMPLATES } from './builds.mjs';
import { progressionOf } from './progression.mjs';
import * as dfu from './dfu.mjs';
import * as ours from './ours.mjs';

export const FIGHT_SECONDS = 30;
export const CAST_SECONDS = 1;
const DEFAULT_STATS = Object.freeze({ strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 });

/** SPELLS.STD record 31, "Lightning": Damage Health, magnitude Range(1, 25) + Range(1, 5) per caster level, ranged
 *  (rangeType 2), the shop spell a Destruction build casts. Embedded so the harness runs without ARENA2. */
export const BOLT_SPELL = Object.freeze({
  name: 'Lightning', rangeType: 2, element: 3,
  effects: Object.freeze([Object.freeze({
    type: 4, subType: 0, durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
    magnitudeBaseLow: 1, magnitudeBaseHigh: 25, magnitudeLevelBase: 1, magnitudeLevelHigh: 5, magnitudePerLevel: 1,
  })]),
});
/** Class multiplier on Intelligence for the magicka pool (DFU class "Magic Points" setting): the mage's, the spellsword's. */
export const POOL_MULTIPLIER = Object.freeze({ mage: 2, spellsword: 1.5 });

const meanOf = (low, high) => (low + high) / 2;
/** Mean of EntityEffect.GetMagnitude over a classic effect: Range(baseLow, baseHigh + 1) + Range(levelBase, levelHigh + 1) x floor(level / perLevel). */
export function meanMagnitude(effect, casterLevel) {
  const plus = meanOf(effect.magnitudeLevelBase, effect.magnitudeLevelHigh);
  return meanOf(effect.magnitudeBaseLow, effect.magnitudeBaseHigh) + plus * Math.floor(casterLevel / Math.max(1, effect.magnitudePerLevel));
}

/** Fold the spell and weapon legs into one damage per second over the fight horizon. */
function mixSpellAndWeapon({ weaponDps, perCast, castSeconds, casts }) {
  const castTime = Math.min(casts * castSeconds, FIGHT_SECONDS);
  const spellDamage = Math.min(casts, FIGHT_SECONDS / castSeconds) * perCast;
  return { dps: (spellDamage + weaponDps * (FIGHT_SECONDS - castTime)) / FIGHT_SECONDS, spellDps: perCast / castSeconds };
}

const nameOf = (id) => ENEMY_NAMES[id] ?? `#${id}`;
const foeStatsOf = (career) => ({ ...DEFAULT_STATS, ...(career ? {
  strength: career.strength, intelligence: career.intelligence, willpower: career.willpower, agility: career.agility,
  endurance: career.endurance, personality: career.personality, speed: career.speed, luck: career.luck,
} : {}) });

/** DFU's cell. The player is the DFU-ceiling character where the level is past what DFU's 100 cap lets a build reach. */
export function dfuCell(build, buildName, level, foeId, { career = null, gearPercentile } = {}) {
  const progression = progressionOf(build, level, {});
  const playerLevel = progression.level;
  const kit = mintKit(build, playerLevel, { gearPercentile });
  const armourOwner = { items: [], armorValues: new Array(7).fill(100), stats: progression.stats };
  wearKit(armourOwner, kit);
  const row = VANILLA_ENEMY_BASICS[foeId];
  const foeStats = foeStatsOf(career);
  const weaponSkillId = weaponSkillOf(build);
  const player = {
    stats: progression.stats, critical: progression.skills[SKILLS.CriticalStrike], dodging: progression.skills[SKILLS.Dodging],
    armourParts: armourOwner.armorValues,
  };
  const weapon = { template: kit.weapon.templateIndex, material: kit.material };
  const swing = dfu.playerSwing({ player, weaponSkill: progression.skills[weaponSkillId], weapon, foe: { row, stats: foeStats } });
  const swingSeconds = weapon.template === WEAPON_TEMPLATES.LongBow ? dfu.bowShotSeconds(player.stats.speed) : dfu.meleeSwingSeconds(player.stats.speed);
  let weaponDps = swing.perSwing / swingSeconds;
  let spell = null;
  if (build.spell) {
    const skillOf = (id) => progression.skills[id] ?? 0;
    const cost = classicCastingCost(BOLT_SPELL, skillOf, { online: false });
    const pool = Math.floor(player.stats.intelligence * POOL_MULTIPLIER[buildName]);
    const casts = Math.floor(pool / cost);
    const perCast = meanMagnitude(BOLT_SPELL.effects[0], playerLevel);
    spell = { perCast, cost, pool, casts, ...mixSpellAndWeapon({ weaponDps, perCast, castSeconds: CAST_SECONDS, casts }) };
    weaponDps = spell.dps;
  }
  const hit = dfu.monsterAttack({ row, foeStats, player: { ...player, avoidHit: 0 } });
  const foeHealth = dfu.monsterHealth(row);
  const attackSeconds = dfu.monsterAttackSeconds(playerLevel);
  const foeDps = hit.perAttack / attackSeconds;
  return finishCell({
    foeId, foeName: nameOf(foeId), foeLevel: row.level, foeHealth, playerLevel, playerHealth: progression.maxHealth,
    dps: weaponDps, hitChance: swing.chance, perSwing: swing.perSwing, swingSeconds, foeDps, foeHitChance: hit.chance,
    perAttack: hit.perAttack, attackSeconds, ceiling: progression.ceiling, spell, material: kit.material,
  });
}

function finishCell(cell) {
  return { ...cell, ttk: cell.foeHealth / cell.dps, ttkPlayer: cell.foeDps > 0 ? cell.playerHealth / cell.foeDps : Infinity };
}

/** The best technique this weapon can roll, as damage per second added: (x - 1) of a swing per cooldown. */
export function techniqueGain(weapon, perSwing, swingSeconds, tier) {
  if (!tier) return 0;
  const value = Math.round(meanOf(...TECHNIQUE_BANDS[tier]));
  let best = 0;
  for (const id of techniquesFor(weapon)) {
    const technique = TECHNIQUES[id];
    const gain = ((techniqueMult(technique.base, value) - 1) * perSwing) / Math.max(technique.cooldown, swingSeconds);
    best = Math.max(best, gain);
  }
  return best;
}

/** This game's cell under a layer set. `kind`: 'plain', 'elite' (x5/x3) or 'boss' (the elite dungeon's x7/x4). */
export function oursCell(build, buildName, level, foeId, layers, { career, swings, gearPercentile, dungeonType, kind = 'plain' } = {}) {
  const character = ours.oursCharacter(build, level, layers, { gearPercentile });
  const { entity } = character;
  const foe = ours.oursFoe(foeId, character, layers, { career, dungeonType, kind });
  const fight = ours.oursFight(character, foe, layers, { swings, label: `${buildName}|${kind}` });
  let weaponDps = fight.perSwing / fight.swingSeconds;
  if (layers.has('techniques')) {
    weaponDps += techniqueGain(character.kit.weapon, fight.perSwing, fight.swingSeconds, ours.lootTierAt(entity.level));
  }
  let spell = null;
  if (build.spell) {
    const online = layers.has('online');
    const skillOf = (id) => skillValue(entity, id);
    const cost = classicCastingCost(BOLT_SPELL, skillOf, { online });
    const pool = Math.floor(liveStat(entity, 'intelligence') * POOL_MULTIPLIER[buildName]);
    const casts = Math.floor(pool / cost);
    const power = layers.has('master') ? spellPowerMult(entity, foe, { online }) : 1;
    const perCast = meanMagnitude(BOLT_SPELL.effects[0], entity.level) * power;
    const castSeconds = CAST_SECONDS / (layers.has('swing') ? castRate(entity) : 1);
    spell = { perCast, cost, pool, casts, castSeconds, ...mixSpellAndWeapon({ weaponDps, perCast, castSeconds, casts }) };
    weaponDps = spell.dps;
  }
  const attackSeconds = dfu.monsterAttackSeconds(entity.level);
  const foeDps = fight.perAttack / attackSeconds;
  return finishCell({
    foeId, foeName: `${kind === 'plain' ? '' : `${kind[0].toUpperCase()}${kind.slice(1)} `}${nameOf(foeId)}`, foeLevel: foe.level,
    foeHealth: foe.maxHealth, playerLevel: entity.level, playerHealth: entity.maxHealth, dps: weaponDps,
    hitChance: fight.hitChance, perSwing: fight.perSwing, swingSeconds: fight.swingSeconds, foeDps, foeHitChance: fight.foeHitRate,
    perAttack: fight.perAttack, attackSeconds, ceiling: false, spell, material: character.kit.material,
  });
}
