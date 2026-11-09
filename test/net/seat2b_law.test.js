// SEAT2b: THE FORTIFICATIONS' LAW - the works' table whole (7.5, Appendix B), who may raise what, what a tier costs in Marks,
// the drops, what each tier does, the Siege Camp and the revolt's numbers (net/fortLaw.js). The works cost Marks alone, once a
// tier, and a tier stands at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORT_WORKS, fortWork, fortMaxTier, fortTierRow, fortMayRaise, fortCost, fortWorkLine,
  fortDropped, fortsAfterCapture, fortsAfterSeason, defendersWaveMs, GATEHOUSE, gatehouseVitality, RAM, watchtowerShare,
  barracksGuards, marketHallListings, marketHallTitheCap, shrineStanding, shrineGateInfluence, stationSteps, harbourPort,
  CAMP_MARKS, CAMP_RAMS, campRams, REVOLT, revoltDue, WALLS_WAVE_MIN_MS,
} from '../../src/net/fortLaw.js';
import { SIEGE_WAVE_MS } from '../../src/net/siege/siegeRef.js';

test('SEAT2b THE WORKS: the 7.5 table whole - ten works and the Marks of each tier in the order written (mutants: a cost; a count of tiers)', () => {
  const table = FORT_WORKS.map((w) => [w.id, w.name, w.where, w.tiers.map((t) => t.marks)]);
  assert.deepEqual(table, [
    ['walls', 'Walls', 'any', [700, 2000, 5300]],
    ['gatehouse', 'Gatehouse', 'gate', [1300, 3300, 8000]],
    ['watchtowers', 'Watchtowers', 'any', [500, 1300]],
    ['barracks', 'Barracks', 'any', [1000, 2700, 6000]],
    ['market', 'Market Hall', 'any', [700, 1700, 4000]],
    ['shrine', 'Shrine', 'any', [700, 2000]],
    ['forge', 'Forge', 'any', [700, 1700]],
    ['workshop', 'Workshop', 'any', [700, 1700]],
    ['apothecary', 'Apothecary', 'any', [700, 1700]],
    ['harbour', 'Harbor', 'coast', [1300, 3300]],
  ]);
  assert.deepEqual(FORT_WORKS.map((w) => fortMaxTier(w.id)), [3, 3, 2, 3, 3, 2, 2, 2, 2, 2]);
  assert.deepEqual([fortWork('nope'), fortWork(3), fortMaxTier('nope'), fortTierRow('walls', 0), fortTierRow('walls', 4), fortTierRow('shrine', 3)], [null, null, 0, null, null, null]);
  assert.equal(fortTierRow('walls', 2).marks, 2000);
});

test('SEAT2b WHO MAY RAISE WHAT: a Gatehouse at a crown, or a palace whose Walls stand at tier 3; a Harbour at a coastal seat; the rest anywhere (mutants: the gate\'s rule; the coast)', () => {
  assert.deepEqual([fortMayRaise('gatehouse', { tier: 'crown', walls: 0 }), fortMayRaise('gatehouse', { tier: 'palace', walls: 2 }), fortMayRaise('gatehouse', { tier: 'palace', walls: 3 })], [true, false, true]);
  assert.deepEqual([fortMayRaise('harbour', { tier: 'palace', coastal: false }), fortMayRaise('harbour', { tier: 'palace', coastal: true })], [false, true]);
  assert.deepEqual([fortMayRaise('walls', { tier: 'palace' }), fortMayRaise('nope', { tier: 'crown' })], [true, false]);
});

test('SEAT2b WHAT A TIER COSTS: its Marks alone, no materials, no days; a line says the tier standing and the price of the next (mutants: a cost; a line)', () => {
  assert.deepEqual([fortCost('walls', 1), fortCost('walls', 3), fortCost('shrine', 2), fortCost('walls', 4), fortCost('nope', 1)], [700, 5300, 2000, null, null]);
  assert.equal(fortWorkLine('walls', { tier: 0 }), 'Walls: none raised. Tier 1: 700 Marks.');
  assert.equal(fortWorkLine('shrine', { tier: 2 }), 'Shrine: tier 2 - Standing +2 a week, +100 influence for each gate felled in the region.');
});

test('SEAT2b THE DROPS: a capture takes every work a tier down; a Season\'s end every work a tier down; never below nought (mutants: the drop)', () => {
  assert.deepEqual([fortDropped(3), fortDropped(1), fortDropped(0), fortDropped(-2), fortDropped('x')], [2, 0, 0, 0, 0]);
  const forts = { walls: 2, gatehouse: 3, shrine: 1 };
  assert.deepEqual(fortsAfterCapture(forts), { walls: 1, gatehouse: 2, shrine: 0 });
  assert.deepEqual(fortsAfterSeason(forts), { walls: 1, gatehouse: 2, shrine: 0 });
  assert.deepEqual(fortsAfterCapture(null), {});
});

test('SEAT2b WHAT A TIER DOES: the defenders\' wave 3 s faster a tier; the Gatehouse 20,000 and half again a tier; a Ram 3,000, 500 every 10 s with two crew within 3 m; the Watchtowers\' half and quarter; the Barracks\' 2, 4, 6; the Market Hall\'s quarter and its point; the Shrine\'s Standing and its 50; the stations\' step; the Harbour\'s port (mutants: each)', () => {
  assert.deepEqual([0, 1, 2, 3].map((t) => defendersWaveMs(SIEGE_WAVE_MS.palace, t)), [20000, 17000, 14000, 11000]);
  assert.deepEqual([0, 3].map((t) => defendersWaveMs(SIEGE_WAVE_MS.crown, t)), [30000, 21000]);
  assert.equal(defendersWaveMs(6000, 3), WALLS_WAVE_MIN_MS, 'never under five seconds');
  assert.equal(defendersWaveMs(20000, 9), 11000, 'three tiers at most');
  assert.deepEqual({ ...GATEHOUSE }, { vitality: 20000, perTier: 0.5, blowShare: 0.1 });
  assert.deepEqual([0, 1, 2, 3].map(gatehouseVitality), [20000, 30000, 40000, 50000]);
  assert.deepEqual({ ...RAM }, { vitality: 3000, damage: 500, everyMs: 10000, crew: 2, crewM: 3 });
  assert.deepEqual([0, 1, 2].map(watchtowerShare), [null, 0.5, 0.25]);
  assert.deepEqual([0, 1, 2, 3, 7].map(barracksGuards), [0, 2, 4, 6, 6]);
  assert.deepEqual([0, 1, 2, 3].map((t) => marketHallListings(30, t)), [30, 37, 45, 52]);
  assert.deepEqual([0, 1, 3].map((t) => marketHallTitheCap(10, t)), [10, 11, 13]);
  assert.deepEqual([0, 1, 2, 5].map(shrineStanding), [0, 1, 2, 2]);
  assert.deepEqual([0, 1, 2].map(shrineGateInfluence), [0, 50, 100]);
  const forts = { forge: 2, workshop: 1, apothecary: 0 };
  assert.deepEqual(['smithing', 'carpentry', 'masonry', 'outfitting', 'alchemy', 'mining'].map((p) => stationSteps(p, forts)), [2, 1, 1, 1, 0, 0]);
  assert.deepEqual([harbourPort(0), harbourPort(1)], [false, true]);
});

test('SEAT2b THE SIEGE CAMP AT THE TURNING: a paid camp that won the Right brings its Rams to a siege with a Gatehouse; a palace without a gate, a camp that won nothing and an unpaid one bring none (mutants: the Right; the gate; the payment)', () => {
  assert.deepEqual([CAMP_MARKS, CAMP_RAMS], [1500, 3]);
  assert.equal(campRams({ paid: true, won: true, gated: true }), 3);
  assert.equal(campRams({ paid: true, won: true, gated: false }), 0, 'Appendix A: no Ram - a palace has no Gatehouse');
  assert.equal(campRams({ paid: true, won: false, gated: true }), 0, 'no Right: burnt whole');
  assert.equal(campRams({ paid: false, won: true, gated: true }), 0);
});

test('SEAT2b THE REVOLT\'S NUMBERS: a Rebel Captain of Renown 50, twelve rebels, the window\'s two hours; due at Standing nought (mutants: the numbers; the due)', () => {
  assert.deepEqual({ ...REVOLT }, { captainRenown: 50, rebels: 12, windowMs: 7_200_000 });
  assert.deepEqual([revoltDue(0), revoltDue(1), revoltDue(-3)], [true, false, true]);
});
