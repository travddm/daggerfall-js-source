// BALANCE1 (2026-09-27, Mac: "I want to adjust fatigue drain and durability drain. Just needs some balancing. Currently
// things drain a little too fast"). Measured first: the port's own fatigue losses are DFU's to the unit (a full bar at
// STR/END 50 walks 48.5 real minutes and runs 6.1), while the default game's WEAR runs through the combat overhaul
// (PCAAO, on by default and online) at ~2.8x DFU's on a weapon per landed hit and ~15x on armour. Two scales, each
// applied where the cost is charged and nowhere else: exertion costs a quarter less, a blow wears gear 40% less.
// DFU's own constants and formulas stay verbatim and stay pinned where they always were; this file pins the scales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../modsOff.js';
import { FATIGUE_LOSS, FATIGUE_DRAIN_SCALE } from '../../src/systems/statMods.js';
import { SWING_WEAPON_FATIGUE_LOSS, SWING_FATIGUE_COST } from '../../src/scenes/hostCombat.js';
import { tickPlayerMinutes, CLASSIC_MINUTES_PER_SECOND } from '../../src/systems/worldTick.js';
import { CONDITION_WEAR_SCALE, blowWear, _wearScaleForTests } from '../../src/systems/equip.js';
import { damageEquipment } from '../../src/combat/formulas.js';
import { pcaaoApplyConditionDamageThroughWeaponDamage, pcaaoApplyConditionDamageThroughUnarmedDamage } from '../../src/combat/pcaao.js';
import { BODY_PARTS } from '../../src/systems/armorMaterials.js';
import { mintCondition } from '../../src/systems/item/itemTemplates.js';
import { strokeFatigueCost } from '../../src/world/deepWater/deepWaterSwim.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const rd = (p) => hostText(p);

test('BALANCE1: the two scales, and DFU\'s own numbers untouched beneath them', () => {
  assert.equal(FATIGUE_DRAIN_SCALE, 0.75, 'exertion costs a quarter less');
  assert.equal(CONDITION_WEAR_SCALE, 1, 'WEAR-VANILLA (2026-10-01): a blow wears what DFU says - the mods\' wear modules are off by default (wear_vanilla.test.js)');
  // DFU's losses stay DFU's (PlayerEntity.cs:109-113, WeaponManager.cs:72): the scale is applied where they are charged
  assert.deepEqual({ ...FATIGUE_LOSS }, { Default: 11, Climbing: 22, Running: 88, Swimming: 44, Jumping: 11 });
  assert.equal(SWING_WEAPON_FATIGUE_LOSS, 11);
  assert.equal(SWING_FATIGUE_COST, Math.trunc(11 * 0.75), 'a swing charges 8');
});

test('BALANCE1: what a full bar is worth now - STR/END 50, 6400 raw: walking 66.7 real minutes (DFU 48.5), running 8.1 (DFU 6.1)', () => {
  const minute = (activity) => {
    let n = 0;
    tickPlayerMinutes({
      entity: { level: 1, health: 50, maxHealth: 50, fatigue: 6400, magicka: 0, stats: {}, skills: new Array(35).fill(30), skillUses: [], items: [], activeEffects: [] },
      classicMinutes: 59.99, dt: 0.05, activity, fatigueMultiplier: 1, rolls: () => 0.5,
      sinks: { drainFatigue: (d) => { n += d; } },
    });
    return n;
  };
  const walk = minute({}), run = minute({ running: true }), jump = minute({ jumped: true }) - walk;
  assert.deepEqual([walk, run, jump], [8, 66, 8], 'a walking minute, a running minute, a jump');
  const realMinutes = (perMinute) => 6400 / perMinute / CLASSIC_MINUTES_PER_SECOND / 60;
  assert.equal(realMinutes(walk).toFixed(1), '66.7');
  assert.equal(realMinutes(run).toFixed(1), '8.1');
  assert.equal(realMinutes(FATIGUE_LOSS.Default).toFixed(1), '48.5', 'DFU\'s walk, for the record');
  assert.equal(realMinutes(FATIGUE_LOSS.Running).toFixed(1), '6.1', 'DFU\'s run');
});

test('BALANCE1: the fatigue scale is on EXERTION alone - the minute\'s band, a jump, a swing, Roleplay Realism\'s overload and its riding charge; never a spell\'s, a poison\'s, a disease\'s, training\'s, survival\'s or the deep\'s swim stroke (mutants: a band charged unscaled; the scale spread to fatigue damage)', () => {
  for (const [f, fn] of [['dungeonContext', 'drainFatigue'], ['world', 'drainExteriorFatigue'], ['exterior', 'drainExteriorFatigue'], ['worldModes', 'drainInteriorFatigue']]) {
    const s = rd(`src/scenes/${f}.js`);
    assert.equal((s.match(new RegExp(`${fn}\\(SWING_FATIGUE_COST\\)`, 'g')) ?? []).length, 2, `${f}: the melee arm and the bow arm charge the scaled swing`);
    assert.doesNotMatch(s, /\(SWING_WEAPON_FATIGUE_LOSS\)/, `${f}: nothing charges DFU's raw swing`);
  }
  for (const f of ['src/systems/effects.js', 'src/systems/poisons.js', 'src/systems/diseases.js', 'src/systems/guild/guildServiceActions.js', 'src/systems/quest/actions.js', 'src/systems/survival/needs.js', 'src/world/deepWater/deepWaterSwim.js']) {
    assert.doesNotMatch(rd(f), /FATIGUE_DRAIN_SCALE/, `${f}: not exertion, not scaled`);
  }
  assert.equal(strokeFatigueCost(6400), 160, 'the swim stroke is a burst bought on purpose, at the mod\'s price');
});

test('BALANCE1: a blow\'s wear is the scale\'s EXACTLY on average - the fraction rolled, a whole amount rolls nothing, nothing never wears (mutants: the fraction floored or rounded; the roll inverted; a roll drawn for a whole amount)', () => {
  const at = (r) => () => r;
  let drawn = 0;
  // WEAR-VANILLA: the port's scale is 1 now (DFU's wear); the roll's own law is pinned at BALANCE1's 0.6
  _wearScaleForTests(0.6);
  try {
    assert.equal(blowWear(1, at(0.59)), 1, 'a 1-point wear costs 1 on 60% of blows...');
    assert.equal(blowWear(1, at(0.6)), 0, '...and nothing on the rest');
    assert.equal(blowWear(2, at(0.19)), 2);
    assert.equal(blowWear(2, at(0.2)), 1);
    assert.equal(blowWear(5, () => { drawn++; return 0; }), 3, 'five points of wear are three');
    assert.equal(drawn, 0, 'and a whole amount draws no roll');
    assert.equal(blowWear(0, () => { drawn++; return 0; }), 0);
    assert.equal(drawn, 0, 'no wear, no roll');
    for (const amount of [1, 2, 3, 7, 12]) {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += blowWear(amount, at((i + 0.5) / 1000));
      assert.equal(sum / 1000, Math.round(amount * 0.6 * 1000) / 1000, `${amount}: the average is the scale's`);
    }
  } finally { _wearScaleForTests(); }
  // the port's own scale, 1: the amount is DFU's and no roll is drawn, so a scripted DFU roll sequence stays DFU's
  assert.equal(blowWear(1, () => { drawn++; return 0.99; }), 1);
  assert.equal(blowWear(5, () => { drawn++; return 0; }), 5, 'five points of wear are five');
  assert.equal(drawn, 0);
});

