// CLAW-METAL (decision #69, trbcodex T11): by default a werewolf's claws are DFU's bare hand. FormulaHelper.cs
// CalculateHandToHandAttackDamage reads no item, so Daedric gauntlets on the beast add nothing to a claw hit, in either
// core, on the stats card or on a refereed lane's sheet. The port's gauntlet metal is the `clawMetal` option, pinned off
// in the server profile. The option's own behaviour is held by test/systems/bal6_curses.test.js and auditclaws.test.js.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLycanthropyCurse, morphSelf } from '../../src/systems/lycanthropy.js';
import { LYCANTHROPY_TYPES } from '../../src/systems/infection.js';
import { isFullMoonFromMinutes, MINUTES_PER_DAY, CLASSIC_GAME_START_TIME } from '../../src/systems/gameDate.js';
import { clawMetalDamage, CLAW_METAL_PREF } from '../../src/combat/clawMetal.js';
import { duelAttackerOf, duelStub } from '../../src/combat/duelCombat.js';
import { pcaaoHandToHandAttackDamage } from '../../src/combat/pcaao.js';
import { handToHandAttackDamage } from '../../src/combat/formulas.js';
import { computeCombatStats } from '../../src/combat/combatStats.js';
import { equipItem } from '../../src/systems/equip.js';
import { armorOfMaterial } from '../../src/combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { FEATURES } from '../../src/systems/features.js';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';

const QUIET = (() => {
  let m = CLASSIC_GAME_START_TIME;
  while (isFullMoonFromMinutes(m) || isFullMoonFromMinutes(m + MINUTES_PER_DAY * 4)) m += MINUTES_PER_DAY;
  return m;
})();
const player = () => ({
  name: 'Hero', isPlayer: true, level: 12, raceId: 1, activeEffects: [], items: [], spells: [], skillUses: new Array(35).fill(0),
  stats: { strength: 50, agility: 50, endurance: 50, speed: 50, willpower: 50, intelligence: 50, personality: 50, luck: 50 },
  skills: Array.from({ length: 35 }, () => 40), health: 60, maxHealth: 60, chargenDone: true,
  career: { weaponArmorShieldsBitfield: 0, abilityFlagsAndSpellPointsBitfield: 0, attackModifierFlags: 0 }, armorValues: new Array(7).fill(100), reflexes: 2, biographyAvoidHitMod: 0,
});
const GAUNTLETS = 103;
const beast = (material = null) => {
  const p = player();
  createLycanthropyCurse(p, LYCANTHROPY_TYPES.Werewolf, { now: QUIET });
  if (material !== null) { const g = armorOfMaterial(GAUNTLETS, material); p.items.push(g); equipItem(p, g); }
  morphSelf(p, { force: true, nowMinutes: QUIET + 2 });
  return p;
};
const target = () => ({ ...player(), name: 'Target', isPlayer: false });
const blows = (who) => [pcaaoHandToHandAttackDamage(who, target(), 0, true, () => 0.5), handToHandAttackDamage(who, target(), 0, true, () => 0.5)];
const withClawMetal = (on, fn) => {
  const was = getPref(CLAW_METAL_PREF);
  setPref(CLAW_METAL_PREF, on);
  try { return fn(); } finally { setPref(CLAW_METAL_PREF, was); }
};

test('CLAW-METAL: by default the beast in Daedric gauntlets strikes with DFU\'s bare claws - both cores, the stats card and a refereed sheet add nothing', () => {
  assert.equal(getPref(CLAW_METAL_PREF), false, 'the option starts off');
  const daedric = beast(ARMOR_MATERIAL.Daedric), bare = beast();
  assert.equal(daedric.isInBeastForm, true);
  assert.equal(clawMetalDamage(daedric), 0);
  assert.deepEqual(blows(daedric), blows(bare), 'the overhaul\'s and DFU\'s claw blow, the same as bare claws');
  assert.deepEqual(computeCombatStats(daedric), computeCombatStats(bare), 'the stats card shows the bare claws');
  assert.equal(duelAttackerOf(daedric).cm, 0, 'a duel or siege sheet carries no metal');
});

test('CLAW-METAL: the option on gives the old +6 for Daedric, and off zeroes a stand-in that still carries a word', () => {
  const daedric = beast(ARMOR_MATERIAL.Daedric), bare = beast();
  const [on, sheet] = withClawMetal(true, () => [blows(daedric), duelAttackerOf(daedric)]);
  const [pcBare, dfuBare] = blows(bare);
  assert.deepEqual(on, [pcBare + 6, dfuBare + 6]);
  assert.equal(sheet.cm, 6);
  const { stub } = duelStub(sheet);
  assert.equal(withClawMetal(true, () => clawMetalDamage(stub)), 6, 'the stand-in carries the striker\'s word');
  assert.equal(clawMetalDamage(stub), 0, 'off, the room\'s pin answers the stand-in too');
});

test('CLAW-METAL: the Features row is off by default and the room\'s, and the official profile pins it off', () => {
  const row = FEATURES.find((f) => f.id === 'claw-metal');
  assert.deepEqual([row.control.key, row.control.initial, row.control.online], [CLAW_METAL_PREF, false, 'room']);
  assert.equal(OFFICIAL_PROFILE.pins.prefs[CLAW_METAL_PREF], false);
});
