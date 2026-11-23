// The sky's day on the wall clock (net/sky-days.ts): what the Starfall's nights stand on. The relay carries it and never
// carries skyLaw.js, so these tests hold the two equal at every pair of scales, and hold the day arithmetic.
import { playByRules } from '../profileRules.mjs'; // a server profile's rule keys, for one test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedClassicMinutes } from '../../src/net/wire.js';
import {
  SKY_SWITCH_MS,
  DFU_TIME_SCALE,
  DEFAULT_SKY_TIME_SCALE,
  setSkyClock,
  skyClockOn,
  skyTimeScale,
} from '../../src/net/world-time-scale.ts';
import { skyClassicMinutes, wallMsForSkyMinutes } from '../../src/net/skyLaw.js';
import { PROFILE_KEYS } from '../../src/net/profile/profileKeys.ts';
import {
  skyMinutesAtWall,
  wallMsAtSkyMinutes,
  skyDayMs,
  skyDayStartMs,
  skyDayAtOrAfter,
} from '../../src/net/sky-days.ts';

const HOUR = 3_600_000;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const PAIRS = [
  { rules: {}, label: 'one clock at 12' },
  { rules: { 'time.worldScale': 24 }, label: 'one clock at 24' },
  { rules: { 'time.skyClock': true }, label: 'sky clock at 24, world 12' },
  { rules: { 'time.skyClock': true, 'time.skyScale': 48, 'time.worldScale': 24 }, label: 'sky 48, world 24' },
  { rules: { 'time.skyClock': true, 'time.skyScale': 7, 'time.worldScale': 5 }, label: 'sky 7, world 5' },
];

test("SKYDAYS the defaults the relay and the account service fall back on are the registry's", () => {
  assert.equal(DFU_TIME_SCALE, PROFILE_KEYS['time.worldScale'].online);
  assert.equal(DEFAULT_SKY_TIME_SCALE, PROFILE_KEYS['time.skyScale'].online);
  assert.equal(PROFILE_KEYS['time.skyClock'].online, false);
  assert.equal(skyClockOn(), false);
  assert.equal(skyTimeScale(), 24);
});

test("SKYDAYS the wire's sky and skyLaw.js's are the same sky at every pair of scales: before the switch, at it, and a day, a week and a year after", (t) => {
  for (const { rules, label } of PAIRS) {
    playByRules(t, rules);
    for (const at of [
      SKY_SWITCH_MS - 90 * HOUR,
      SKY_SWITCH_MS - 1,
      SKY_SWITCH_MS,
      SKY_SWITCH_MS + 1,
      SKY_SWITCH_MS + 24 * HOUR,
      SKY_SWITCH_MS + 168 * HOUR,
      SKY_SWITCH_MS + 8760 * HOUR,
    ]) {
      assert.ok(
        near(skyMinutesAtWall(at), skyClassicMinutes(at), 1e-5),
        `${label}: minutes at ${at - SKY_SWITCH_MS} ms from the switch`,
      );
      const m = skyClassicMinutes(at);
      assert.ok(
        near(wallMsAtSkyMinutes(m), wallMsForSkyMinutes(m), 1e-2),
        `${label}: the inverse at ${at - SKY_SWITCH_MS} ms from the switch`,
      );
    }
  }
});

test('SKYDAYS with one clock the sky is the world clock to the bit, whatever the scale', (t) => {
  for (const world of [12, 24, 5]) {
    playByRules(t, { 'time.worldScale': world });
    for (const at of [SKY_SWITCH_MS - HOUR, SKY_SWITCH_MS + 40 * HOUR])
      assert.equal(skyMinutesAtWall(at), sharedClassicMinutes(at));
    assert.equal(skyDayMs(), 86_400_000 / world);
  }
});

test("SKYDAYS a sky day is the profile's scale over a real day: two hours at 12, an hour at 24 on the sky clock, 30 minutes at 48 (mutants: the sky scale read while the clock is off; the world scale read while it is on)", (t) => {
  assert.equal(skyDayMs(), 2 * HOUR);
  playByRules(t, { 'time.skyScale': 48 });
  assert.equal(skyDayMs(), 2 * HOUR, 'time.skyScale is read only while the sky has a clock of its own');
  playByRules(t, { 'time.skyClock': true });
  assert.equal(skyDayMs(), HOUR);
  playByRules(t, { 'time.skyClock': true, 'time.skyScale': 48, 'time.worldScale': 6 });
  assert.equal(skyDayMs(), HOUR / 2, "the sky's scale, not the world's, while the sky has a clock");
});

test("SKYDAYS the first day at or after an instant: its start is at or after it, the day before began earlier, and a start is its own day's", (t) => {
  for (const { rules, label } of PAIRS) {
    playByRules(t, rules);
    for (const at of [
      SKY_SWITCH_MS - 5 * HOUR,
      SKY_SWITCH_MS + 1,
      SKY_SWITCH_MS + 31 * HOUR + 12_345,
      Date.UTC(2026, 9, 20),
      Date.UTC(2026, 10, 1, 7, 7, 7),
    ]) {
      const n = skyDayAtOrAfter(at);
      assert.ok(skyDayStartMs(n) >= at, `${label}: day ${n} starts at or after ${at}`);
      assert.ok(skyDayStartMs(n - 1) < at, `${label}: the day before starts earlier`);
      assert.equal(skyDayAtOrAfter(skyDayStartMs(n)), n, `${label}: a start belongs to its own day`);
      assert.equal(skyDayAtOrAfter(skyDayStartMs(n) + 1), n + 1, `${label}: one ms past a start is the next day's`);
    }
  }
});

test("SKYDAYS the sky clock's midnights fall on the hour UTC at 24 and nowhere else (the switch is aligned for 24 alone)", (t) => {
  playByRules(t, { 'time.skyClock': true });
  const n = skyDayAtOrAfter(Date.UTC(2026, 9, 20));
  for (let i = 0; i < 48; i++) assert.equal(skyDayStartMs(n + i) % HOUR, 0, `day ${n + i}`);
  playByRules(t, { 'time.skyClock': true, 'time.skyScale': 12 });
  assert.notEqual(skyDayStartMs(skyDayAtOrAfter(Date.UTC(2026, 9, 20))) % HOUR, 0);
});

test('SKYDAYS setSkyClock keeps the scale it had for a value outside the bounds and reads only true as on', () => {
  setSkyClock(true, 48);
  assert.deepEqual([skyClockOn(), skyTimeScale()], [true, 48]);
  setSkyClock('yes', 0);
  assert.deepEqual([skyClockOn(), skyTimeScale()], [false, 48]);
  setSkyClock(true, 101);
  assert.deepEqual([skyClockOn(), skyTimeScale()], [true, 48]);
  setSkyClock(false, DEFAULT_SKY_TIME_SCALE);
  assert.deepEqual([skyClockOn(), skyTimeScale()], [false, 24]);
});
