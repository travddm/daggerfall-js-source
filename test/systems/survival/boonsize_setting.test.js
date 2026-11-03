import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOON_PROFILES,
  boonProfile,
  boonProfileFor,
  BOON_SIZE_PREF,
} from '../../../src/systems/survival/boonProfile.js';
import { survivalStatMods, survivalBoons, newSurvival, paySleep, BOON } from '../../../src/systems/survival/needs.js';
import { survivalRules } from '../../../src/systems/survival/switch.js';
import { boonEffect } from '../../../src/systems/survival/status.js';
import { bondBonus } from '../../../src/systems/steedCare.js';
import { SURVIVAL_RULES } from '../../../src/systems/survival/difficulty.js';
import { setPref } from '../../../src/systems/uiPrefs.js';
import { FEATURES } from '../../../src/systems/features.js';
import { ONLINE_FORCED_PREFS } from '../../../src/systems/online/onlineLane.js';

afterEach(() => {
  setPref(BOON_SIZE_PREF, 'small');
  setPref('survival', 'boons');
});
const all = { boons: ['fed', 'quenched', 'rested', 'thriving'] };
const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

test('F3b: the three sizes - none (DFU), small (default: +11 points in all), original (+35) - and an unknown value reads as small', () => {
  const sum = (p) => Object.values(p.boon).reduce((n, b) => n + total(b), 0);
  assert.deepEqual([sum(BOON_PROFILES.none), sum(BOON_PROFILES.small), sum(BOON_PROFILES.mod)], [0, 11, 35]);
  assert.equal(boonProfileFor('nope'), BOON_PROFILES.small);
  assert.equal(BOON, BOON_PROFILES.small.boon);
  assert.deepEqual(BOON_PROFILES.small.boon.fed, { strength: 1, endurance: 2 });
});

test('F3b: a body that has earned all four boons carries the chosen size, read live', () => {
  const rules = SURVIVAL_RULES.boons;
  for (const [size, points] of [
    ['small', 11],
    ['mod', 35],
  ]) {
    setPref(BOON_SIZE_PREF, size);
    assert.equal(total(survivalStatMods({ ...newSurvival(0), ...all }, null, 0, { rules })), points, size);
  }
  assert.equal(boonEffect('fed'), '+5 Strength, +5 Endurance', 'the page says the live numbers');
});

test('F3b: the durations follow the size - Well fed two hours or four, the bank four hours or twelve', () => {
  const s = (minutes) => ({ ...newSurvival(0), lastAte: -minutes, wellRested: 1 });
  for (const [size, fed, bank] of [
    ['small', 120, 240],
    ['mod', 240, 720],
  ]) {
    setPref(BOON_SIZE_PREF, size);
    assert.equal(survivalBoons(s(fed - 1), 0).includes('fed'), true, `${size}: fed a minute before`);
    assert.equal(survivalBoons(s(fed), 0).includes('fed'), false, `${size}: fed no more at ${fed}`);
    const r = newSurvival(0);
    paySleep(r, 'bed', 24 * 60, 2000, SURVIVAL_RULES.boons);
    assert.equal(r.wellRested, bank, `${size}: the bank holds ${bank}`);
  }
});

test("F3b: None is DFU's - the Boons tier earns nothing, the horse's bond adds no stat; the other sizes keep the tier's rewards", () => {
  setPref('survival', 'boons');
  setPref(BOON_SIZE_PREF, 'none');
  assert.equal(survivalRules().boons, false);
  assert.equal(survivalRules().stamina.floor, SURVIVAL_RULES.boons.stamina.floor, 'and it still takes nothing');
  assert.equal(bondBonus(100), 0);
  setPref(BOON_SIZE_PREF, 'small');
  assert.equal(survivalRules().boons, true);
  assert.equal(bondBonus(100), 2);
  setPref(BOON_SIZE_PREF, 'mod');
  assert.equal(bondBonus(100), 20);
  assert.equal(boonProfile().bondStep, 5);
});

test("F3b: the row declares its default and the room's pin, and the online lane forces it", () => {
  const row = FEATURES.find((f) => f.id === 'boon-size');
  assert.deepEqual([row.control.key, row.control.initial, row.control.online], ['boonSize', 'small', 'small']);
  assert.deepEqual(
    row.control.tiers.map((x) => x[0]),
    ['none', 'small', 'mod'],
  );
  assert.equal(ONLINE_FORCED_PREFS.boonSize, 'small');
});
