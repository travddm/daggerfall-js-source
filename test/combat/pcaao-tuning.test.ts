// The combat core near Daggerfall Unity (DFU): the weapon skill counts once to hit, a critical keeps a slight edge, a bow
// takes the strength term once. The swing law is in test/systems/swinglaw.test.js; the harness bounds are in
// test/tooling/playerPowerBudget.test.js.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pcaaoModules, pcaaoAttackDamage, pcaaoWeaponAttackDamage, pcaaoWeaponToHit, pcaaoSkillsToHit,
} from '../../src/combat/pcaao.js';
import { pcaaoCritDamageMultiplier, PCAAO_CRIT_DAMAGE_PER_FIVE, PCAAO_CRIT_HIT_DIVISOR } from '../../src/combat/pcaao-critical.ts';
import { criticalModel } from '../../src/combat/combatStats.js';
import { WEAPONS, WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { SKILLS } from '../../src/systems/skills.js';
import { makeEnemyEntity } from '../../src/characters/enemy/enemyEntity.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';

const ALL_ON = { Enabled: true, equipmentDamageEnhanced: false, fadingEnchantedItems: false, fixedStrengthDamageModifier: true, armorHitFormulaRedone: true, criticalStrikesIncreaseDamage: true, conditionBasedEffectiveness: false, softMaterialRequirements: true };
const modulesOf = (over = {}) => pcaaoModules((k) => ({ ...ALL_ON, ...over })[k], () => undefined);
const stats = (o = {}) => ({ strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50, ...o });
const skillsAll = (v, o = {}) => ({ ...Object.fromEntries(Array.from({ length: 35 }, (_, i) => [i, v])), ...o });
const fighter = (o = {}) => ({
  isPlayer: true, level: 10, raceId: 1, stats: stats({ strength: 100 }), skills: skillsAll(0), career: { weaponArmorShieldsBitfield: 0 },
  health: 500, maxHealth: 500, items: [], armorValues: new Array(7).fill(100), reflexes: 2, biographyAvoidHitMod: 0, ...o,
});
const career = stats({ attackModifierFlags: 0 });
const dummy = () => makeEnemyEntity(0, ENEMY_BASICS[0], career, 5, () => 0.5);   // a Rat: a monster, no Dodging
const sword = (material) => ({ group: 'Weapons', templateIndex: WEAPONS.Longsword, material, flags: 0, maxCondition: 100, currentCondition: 100 });

/** Blows landed out of a hundred evenly spaced rolls: the chance to hit, in whole percent. */
const landedOf = (attacker, target, weapon) => {
  let landed = 0;
  for (let i = 0; i < 100; i++) {
    const notes = { hit: false };
    pcaaoAttackDamage(attacker, target, { weapon, rolls: () => i / 100 + 0.001, dfRand: () => 0, modules: modulesOf(), notes });
    if (notes.hit) landed++;
  }
  return landed;
};

test('to hit: the weapon skill counts once, so ten more skill is ten more chance (the mod gave fifteen)', () => {
  const at = (skill) => landedOf(fighter({ skills: skillsAll(0, { [SKILLS.LongBlade]: skill }) }), dummy(), sword(WEAPON_MATERIALS.Steel));
  assert.equal(at(40) - at(30), 10);
  assert.equal(at(30) - at(20), 10);
});

test("to hit: a weapon's material gives x6 + 2, and dodging takes a quarter, as DFU's formula leans", () => {
  assert.equal(pcaaoWeaponToHit({ material: WEAPON_MATERIALS.Steel }), 2);
  assert.ok(pcaaoWeaponToHit({ material: WEAPON_MATERIALS.Daedric }) > pcaaoWeaponToHit({ material: WEAPON_MATERIALS.Steel }));
  const dodger = fighter({ skills: skillsAll(100) });
  assert.equal(pcaaoSkillsToHit(fighter(), dodger, () => 0.99, modulesOf()), -25);
  const slow = fighter({ skills: skillsAll(40) });
  assert.equal(pcaaoSkillsToHit(fighter(), slow, () => 0.99, modulesOf()), -10);
});

test("critical: x1.5 at Critical Strike 100 (the mod's was x2.0), +crit/10 to hit, and the combat card reads the same", () => {
  assert.equal(PCAAO_CRIT_DAMAGE_PER_FIVE, 0.025);
  assert.equal(PCAAO_CRIT_HIT_DIVISOR, 10);
  assert.equal(pcaaoCritDamageMultiplier(0), 1);
  assert.equal(pcaaoCritDamageMultiplier(100), 1.5);
  assert.ok(pcaaoCritDamageMultiplier(110) > 1.5 && pcaaoCritDamageMultiplier(110) < 1.6);
  const critter = fighter({ skills: skillsAll(0, { [SKILLS.CriticalStrike]: 100 }) });
  const model = criticalModel(critter, { overhaul: true, modules: modulesOf() });
  assert.equal(model.damageMult, 1.5);
  assert.equal(model.hitBonus, 10);
  assert.equal(model.chance, 0.25, 'one blow in four at Luck 50');
  const plain = fighter();
  const blow = (who) => pcaaoAttackDamage(who, dummy(), { weapon: sword(WEAPON_MATERIALS.Steel), rolls: () => 0.01, dfRand: () => 0, modules: modulesOf() });
  const crit = blow(critter), base = blow(plain);
  assert.ok(Math.abs(crit - 1.5 * base) <= 0.5, `a landed critical takes half again: ${base} -> ${crit}`);
});

test('bow: the strength term once, the +1 span stays, a two-hander keeps its doubled term', () => {
  const archer = fighter({ stats: stats({ strength: 100 }) });
  const modifier = 5;
  const bow = { group: 'Weapons', templateIndex: WEAPONS.Long_Bow, material: WEAPON_MATERIALS.Steel, flags: 0 };
  const claymore = { group: 'Weapons', templateIndex: WEAPONS.Claymore, material: WEAPON_MATERIALS.Steel, flags: 0 };
  assert.equal(pcaaoWeaponAttackDamage(archer, dummy(), 0, 0, bow, () => 0, modulesOf()), 5 + modifier, 'min 5 (the +1) plus the term once');
  assert.equal(pcaaoWeaponAttackDamage(archer, dummy(), 0, 0, claymore, () => 0, modulesOf()), 2 + 2 * modifier);
});
