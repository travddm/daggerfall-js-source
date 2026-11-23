// How fast the world clock and the sky clock run online are server-profile keys (time.worldScale, time.skyScale), with
// DFU's TimeScale 12 for the world and the port's 24 for the sky clock as the defaults.
import { playByRules } from '../profileRules.mjs'; // a server profile's rule keys, for one test
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DFU_TIME_SCALE,
  TIME_SCALE_MIN,
  TIME_SCALE_MAX,
  ONLINE_MINUTES_PER_MS,
  ONLINE_EPOCH_MS,
  onlineTimeScale,
  onlineMinutesPerMs,
  setOnlineTimeScale,
  sharedClassicMinutes,
  wallMsForClassicMinutes,
} from '../../src/net/wire.js';
import {
  SKY_SEGMENTS,
  skyClassicMinutes,
  skyMinutesPerMsAt,
  wallMsForSkyMinutes,
  skyHasOwnClock,
} from '../../src/net/skyLaw.js';
import { PROFILE_KEYS, profileRuleErrors, PROFILE_SCHEMA, resolveRules } from '../../src/net/profile/profileKeys.ts';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import { onlineRule } from '../../src/systems/online/serverProfile.ts';

const SWITCH = SKY_SEGMENTS[0].fromMs;
const MINUTE_MS = 60_000;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const profileWith = (rules) => ({ ...OFFICIAL_PROFILE, schema: PROFILE_SCHEMA, rules });

afterEach(() => setOnlineTimeScale(DFU_TIME_SCALE));

test("TIMESCALE the defaults: the world plays at DFU's 12 and the sky clock at 24, the official profile names neither, and the wire's default is the registry's", () => {
  const world = PROFILE_KEYS['time.worldScale'];
  const sky = PROFILE_KEYS['time.skyScale'];
  assert.deepEqual([world.dfu, world.online, world.offline, world.type], [12, 12, 12, 'int']);
  assert.deepEqual([sky.dfu, sky.online, sky.offline, sky.type], [12, 24, 12, 'int']);
  assert.deepEqual(
    [world.min, world.max, sky.min, sky.max],
    [TIME_SCALE_MIN, TIME_SCALE_MAX, TIME_SCALE_MIN, TIME_SCALE_MAX],
  );
  assert.equal(DFU_TIME_SCALE, world.online, "the wire plays at the key's default when a profile names none");
  assert.equal(OFFICIAL_PROFILE.rules['time.worldScale'], undefined);
  assert.equal(OFFICIAL_PROFILE.rules['time.skyScale'], undefined);
  assert.equal(onlineTimeScale(), 12);
  assert.equal(onlineMinutesPerMs(), ONLINE_MINUTES_PER_MS);
  assert.equal(resolveRules(OFFICIAL_PROFILE.rules)['time.worldScale'], 12);
});

test('TIMESCALE the world clock at the default: a game minute every five real seconds, and the inverse returns the instant', () => {
  const t0 = ONLINE_EPOCH_MS + 40 * 86_400_000;
  assert.ok(near(sharedClassicMinutes(t0 + 60_000) - sharedClassicMinutes(t0), 12));
  assert.ok(near(sharedClassicMinutes(t0 + 5_000) - sharedClassicMinutes(t0), 1));
  assert.ok(near(wallMsForClassicMinutes(sharedClassicMinutes(t0)), t0, 1e-3));
});

test('TIMESCALE the world clock at a written scale: it runs at that many game minutes a real minute from the same start, and its inverse agrees', () => {
  const t0 = ONLINE_EPOCH_MS + 40 * 86_400_000;
  for (const scale of [1, 6, 24, 60, 100]) {
    setOnlineTimeScale(scale);
    assert.equal(onlineTimeScale(), scale);
    assert.ok(
      near(sharedClassicMinutes(t0 + MINUTE_MS) - sharedClassicMinutes(t0), scale),
      `scale ${scale}: a real minute`,
    );
    assert.ok(
      near(sharedClassicMinutes(ONLINE_EPOCH_MS), 523530),
      `scale ${scale}: the start is the classic game start`,
    );
    assert.ok(near(wallMsForClassicMinutes(sharedClassicMinutes(t0)), t0, 1e-3), `scale ${scale}: the inverse`);
  }
});

test('TIMESCALE a value outside the bounds, or no number, leaves the clock where it was', () => {
  setOnlineTimeScale(24);
  for (const bad of [0, -3, 0.5, 101, 1000, NaN, Infinity, undefined, null, '12']) {
    setOnlineTimeScale(bad);
    assert.equal(onlineTimeScale(), 24, `${String(bad)} is refused`);
  }
});

test('TIMESCALE the registry holds both keys to whole numbers from 1 to 100; a profile that writes a bad value is refused by name', () => {
  const errors = (rules) => profileRuleErrors(profileWith(rules));
  assert.deepEqual(errors({ 'time.worldScale': 24, 'time.skyScale': 48 }), []);
  assert.deepEqual(errors({ 'time.worldScale': 1 }), []);
  assert.deepEqual(errors({ 'time.worldScale': 100 }), []);
  for (const bad of [0, 101, 12.5, '12', true, null]) {
    assert.deepEqual(errors({ 'time.worldScale': bad }), ['bad value for time.worldScale'], `world ${String(bad)}`);
    assert.deepEqual(errors({ 'time.skyScale': bad }), ['bad value for time.skyScale'], `sky ${String(bad)}`);
  }
});

test("TIMESCALE a page that installs a profile plays the world clock at its scale, and at DFU's again once the profile is gone", (t) => {
  const t0 = ONLINE_EPOCH_MS + 10 * 86_400_000;
  assert.ok(near(sharedClassicMinutes(t0 + MINUTE_MS) - sharedClassicMinutes(t0), 12));
  playByRules(t, { 'time.worldScale': 36 });
  assert.equal(onlineRule('time.worldScale'), 36);
  assert.equal(onlineTimeScale(), 36);
  assert.ok(near(sharedClassicMinutes(t0 + MINUTE_MS) - sharedClassicMinutes(t0), 36));
});

test("TIMESCALE the profile's scale is gone after the test that installed it", () => {
  assert.equal(onlineTimeScale(), 12, "the previous test's profile was removed and the clock followed");
});

test('TIMESCALE one clock: with time.skyClock off the sky is the world clock at whatever scale the world runs, and time.skyScale is not read', (t) => {
  playByRules(t, { 'time.worldScale': 24, 'time.skyScale': 60 });
  assert.equal(skyHasOwnClock(), false);
  const t0 = SWITCH + 3_600_000;
  assert.equal(skyClassicMinutes(t0), sharedClassicMinutes(t0));
  assert.equal(skyMinutesPerMsAt(t0), onlineMinutesPerMs());
  assert.equal(skyMinutesPerMsAt(t0), 24 / 60 / 1000);
  assert.equal(wallMsForSkyMinutes(sharedClassicMinutes(t0)), wallMsForClassicMinutes(sharedClassicMinutes(t0)));
});

test("TIMESCALE the sky clock on: its default is the port's 24, a written time.skyScale is its rate after the switch, and the switch has no jump at any world scale", (t) => {
  playByRules(t, { 'time.skyClock': true });
  assert.equal(skyMinutesPerMsAt(SWITCH + 1), 24 / 60 / 1000, 'the default sky scale');
  for (const [world, sky] of [
    [12, 48],
    [12, 6],
    [24, 24],
    [6, 100],
  ]) {
    playByRules(t, { 'time.skyClock': true, 'time.worldScale': world, 'time.skyScale': sky });
    assert.equal(
      skyMinutesPerMsAt(SWITCH + 1),
      sky / 60 / 1000,
      `world ${world}, sky ${sky}: the rate after the switch`,
    );
    assert.equal(
      skyMinutesPerMsAt(SWITCH - 1),
      world / 60 / 1000,
      `world ${world}, sky ${sky}: before the switch the sky is the event clock`,
    );
    assert.ok(
      near(skyClassicMinutes(SWITCH), sharedClassicMinutes(SWITCH), 1e-6),
      `world ${world}, sky ${sky}: no jump at the switch`,
    );
    assert.ok(
      near(skyClassicMinutes(SWITCH - 1000), sharedClassicMinutes(SWITCH - 1000), 1e-6),
      `world ${world}, sky ${sky}: the event clock before it`,
    );
    const later = SWITCH + 2 * 3_600_000;
    assert.ok(
      near(skyClassicMinutes(later) - skyClassicMinutes(SWITCH), (later - SWITCH) * (sky / 60 / 1000), 1e-6),
      `world ${world}, sky ${sky}: the slope`,
    );
    assert.ok(
      near(wallMsForSkyMinutes(skyClassicMinutes(later)), later, 1e-3),
      `world ${world}, sky ${sky}: the inverse`,
    );
  }
});

test('TIMESCALE the sky follows a change of either scale at once: the law is rebuilt, not kept from the first read', (t) => {
  playByRules(t, { 'time.skyClock': true, 'time.skyScale': 24 });
  const later = SWITCH + 3_600_000;
  const at24 = skyClassicMinutes(later);
  playByRules(t, { 'time.skyClock': true, 'time.skyScale': 48 });
  const at48 = skyClassicMinutes(later);
  assert.ok(
    near(at48 - skyClassicMinutes(SWITCH), 2 * (at24 - skyClassicMinutes(SWITCH)), 1e-6),
    'twice the slope after the switch',
  );
  playByRules(t, { 'time.skyClock': true, 'time.skyScale': 24, 'time.worldScale': 24 });
  assert.ok(near(skyClassicMinutes(SWITCH), sharedClassicMinutes(SWITCH)), 'the start moved with the world');
  assert.ok(skyClassicMinutes(SWITCH) > 0);
  assert.notEqual(skyClassicMinutes(later), at24, "a new world scale moves the sky's start");
});
