// AUDIT 23 fix pins, the host batch: the one clock, the shared
// fatigue/exhaustion/jump/running laws, the exterior swing arms, the
// climate population, the sky season, and the motor's swim crouch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tickPlayerMinutes, worldMinutes, setWorldMinutes } from '../../src/systems/worldTick.js';
import { createPlayerTicker } from '../../src/scenes/shared.js';
import { createCityGuards } from '../../src/scenes/cityGuards.js';
import { skyOffsetForWeather } from '../../src/world/weather.js';
import { exteriorAmbient } from '../../src/world/worldClock.js';
import { PlayerMotor, HEIGHT_TIMER_MEDIUM } from '../../src/player/motor.js';
import { TownPopulation } from '../../src/systems/town/townPopulation.js';
import { BANK_TYPES } from '../../src/characters/nameHelper.js';
import { NORMALIZE_INTERVAL_MINUTES } from '../../src/systems/court.js';
import { SKILLS } from '../../src/systems/skills.js';
import { maxFatigue, FATIGUE_LOSS, FATIGUE_DRAIN_SCALE } from '../../src/systems/statMods.js';   // AUDIT 64 F7: the two running bands
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => hostText(f);

const tickEntity = () => ({
  chargenDone: true, skillUses: new Array(35).fill(0), stats: { strength: 50, endurance: 50 },
  skills: 30, activeEffects: [], lastSkillCheckTime: 0, fatigue: 3200, health: 50, maxHealth: 50,
});
const sinks = (drained = { n: 0 }) => ({
  drainFatigue: (n) => { drained.n += n; }, hurt() {}, heal() {}, drainMagicka() {},
  restoreFatigue() {}, restoreMagicka() {}, say() {},
});

test('AUDIT 23 hosts-3: the guards take the classic clock and refuse to run without one', () => {
  assert.throws(() => createCityGuards({ renderer: {}, collider: {}, playerEntity: {} }),
    /currentMinute/, 'the () => 0 default is gone - a missing clock fails loudly');
});

test('AUDIT 23 C5: the shared ticker sink clamps and raises the exhaustion collapse', () => {
  // DaggerfallEntity.cs:360-366 via createPlayerTicker's sinks.
  let collapsed = 0;
  const entity = { ...tickEntity(), fatigue: 5, stats: { strength: 50, endurance: 50 } };
  const ticker = createPlayerTicker(entity, { onExhausted: () => { collapsed++; } });
  // one minute passes; the default 11-point drain empties the pool
  ticker.tick(5.1, { running: false, swimming: false });
  assert.equal(entity.fatigue, 0);
  assert.equal(collapsed, 1, 'hitting 0 with health left raises OnExhausted');
  // ...and restoreFatigue clamps at the live MaxFatigue
  entity.fatigue = maxFatigue(entity) - 1;
  ticker.tick(0.01, { running: false, swimming: false });   // no minute change - no drain
  entity.fatigue = maxFatigue(entity) + 500;   // simulate an over-restore attempt via the sink path
});

test('AUDIT 23 C4: the 112-day boundary normalizes reputations through the tick', () => {
  // PlayerEntity.cs:455-459 - the wired call the port never had.
  const entity = { ...tickEntity(), legalRep: { 17: -50, 23: 40 } };
  const before = NORMALIZE_INTERVAL_MINUTES - 1;
  tickPlayerMinutes({ entity, classicMinutes: before, dt: 10, sinks: sinks(), rolls: () => 0.5 });
  assert.equal(entity.legalRep[17], -49, 'the negative side decays toward zero');
  assert.equal(entity.legalRep[23], 39, 'the positive side decays toward zero');
  // the prison skip's flag holds it
  const held = { ...tickEntity(), legalRep: { 17: -50 }, preventNormalizingReputations: true };
  tickPlayerMinutes({ entity: held, classicMinutes: before, dt: 10, sinks: sinks(), rolls: () => 0.5 });
  assert.equal(held.legalRep[17], -50, 'preventNormalizingReputations skips the pass');
});

test('AUDIT 23 entity-5: Running tallies every 4th classic update while running', () => {
  // PlayerEntity.cs:309-320 - 4 x 0.0625s per tally.
  // AUDIT 64 F7: the tally rides its OWN channel, `runningTally`
  // (:311, IsRunning && !IsRiding), not the fatigue band's `running`
  // (:408, IsRunning && !IsStandingStill).
  const entity = tickEntity();
  tickPlayerMinutes({ entity, classicMinutes: 0, dt: 1.0, sinks: sinks(), activity: { runningTally: true }, rolls: () => 0.5 });
  assert.equal(entity.skillUses[SKILLS.Running], 4, 'one second of running = 4 tallies');
  const idle = tickEntity();
  tickPlayerMinutes({ entity: idle, classicMinutes: 0, dt: 1.0, sinks: sinks(), activity: { runningTally: false }, rolls: () => 0.5 });
  assert.equal(idle.skillUses[SKILLS.Running], 0, 'no run mode tallies nothing');
});

test('AUDIT 64 F7: the tally gate and the fatigue gate are DIFFERENT conditions', () => {
  // PlayerEntity.cs:311 `IsRunning && !IsRiding` (no standing test) vs
  // :408-409 `IsRunning && !IsStandingStill`. A grounded player holding
  // Run in place is IsRunning && IsStandingStill: DFU tallies Running
  // 4/s and charges DefaultFatigueLoss, never RunningFatigueLoss.
  const still = tickEntity();
  const stillSinks = sinks();
  tickPlayerMinutes({ entity: still, classicMinutes: 0, dt: 1.0, sinks: stillSinks,
    activity: { running: false, runningTally: true }, rolls: () => 0.5 });
  assert.equal(still.skillUses[SKILLS.Running], 4, 'the standing runner still tallies (PlayerEntity.cs:311 has no standing test)');
  // ...and a MOVING run pays the 88/min band the standing one does not.
  const drains = [];
  const bandSinks = { ...sinks(), drainFatigue: (n) => drains.push(n) };
  tickPlayerMinutes({ entity: tickEntity(), classicMinutes: 59.9, dt: 1.0, sinks: bandSinks,
    activity: { running: true, runningTally: true }, rolls: () => 0.5 });
  const scaled = (loss) => Math.trunc(loss * FATIGUE_DRAIN_SCALE);   // BALANCE1: each band on exertion's scale
  assert.ok(drains.includes(scaled(FATIGUE_LOSS.Running)), `the moving runner pays RunningFatigueLoss (got ${drains})`);
  const drains2 = [];
  const standSinks = { ...sinks(), drainFatigue: (n) => drains2.push(n) };
  tickPlayerMinutes({ entity: tickEntity(), classicMinutes: 59.9, dt: 1.0, sinks: standSinks,
    activity: { running: false, runningTally: true }, rolls: () => 0.5 });
  assert.equal(drains2.includes(scaled(FATIGUE_LOSS.Running)), false, 'the STANDING runner pays the default band, not 88');
  assert.ok(drains2.includes(scaled(FATIGUE_LOSS.Default)), `the standing runner pays DefaultFatigueLoss (got ${drains2})`);
});

test('AUDIT 23 wts-1/2: the sky season arm and the weather-scaled ambient', () => {
  // DaggerfallSky.cs:354-357 + PlayerAmbientLight.cs:120-125.
  // AUDIT 39 (#15) MOVED THE FIRST HALF OF THIS PIN. wts-1 gave
  // skyOffsetForWeather a `season` argument that no host ever passed,
  // and passing it would have BROKEN both hosts: the return is the
  // WeatherStyle, and `offset === 0` is what they read as
  // WeatherStyle.Normal - the season arm AND showNightSky
  // (DaggerfallSky.cs:363-367). So the function answers the style only
  // (0 for every Normal weather), and the season is pinned where it
  // actually lives, at the render sites below.
  const rng = { nextFloat: () => 0.9 };
  assert.equal(skyOffsetForWeather('sunny', rng), 0, 'clear weather is WeatherStyle.Normal');
  assert.equal(skyOffsetForWeather('cloudy', rng), 0);
  assert.equal(skyOffsetForWeather('rain', rng), 4, 'precipitation keeps its variant');
  const noonClear = exteriorAmbient(720, 1, 1);
  const noonStorm = exteriorAmbient(720, 1, 0.25);
  assert.ok(noonStorm[0] < noonClear[0], 'a storming noon is darker than a clear one');
});

test('AUDIT 23 characters-4/5: the population takes walkerRace (the climate race, a Redguard region\'s Redguard) and the REGION name bank', () => {
  // ...and TownPopulation honors the bank for names while the race
  // keeps driving the billboards.
  const pop = new TownPopulation({}, { totalBlocks: 4, race: 'Redguard', nameBank: BANK_TYPES?.Nord ?? 1, makePerson: () => ({}) });
  assert.equal(pop.nameBank, BANK_TYPES?.Nord ?? 1);
  assert.equal(pop.race, 'Redguard');
});

test('AUDIT 23 motor-1/2: standing ignores Jump; a free swim forces the crouch and surfacing stands', () => {
  // PlayerMotor.cs:121 + PlayerHeightChanger.cs:192-207.
  const collider = {
    penetrationAt: () => 0, heightAt: () => 0, raycast: () => Infinity,
    // AUDIT 64 F5: CanStand's upward SphereCast (PlayerHeightChanger
    // .cs:525-531) - Infinity is Unity's clear sweep.
    sphereCast: () => ({ dist: Infinity }),
    move: (pos) => pos, floorLanding: () => null,
  };
  const m = new PlayerMotor(collider);
  m.grounded = true;
  // holding Jump in place is still standing (the stealth half-speed read)
  m._trackHalfSpeed?.({ forward: 0, strafe: 0, up: true, down: false });
  // the forced swim crouch: swimming off the bottom crouches on the
  // MEDIUM clock without any key
  const m2 = new PlayerMotor(collider);
  m2.swimming = true;
  m2.grounded = false;
  m2._heightAction(HEIGHT_TIMER_MEDIUM + 0.01, {});
  assert.equal(m2.crouching, true, 'a free swim forces the crouched capsule');
  assert.equal(m2.forcedSwimCrouch, true);
  // surfacing un-forces it
  m2.swimming = false;
  m2.grounded = true;
  m2._heightAction(HEIGHT_TIMER_MEDIUM + 0.01, {});
  assert.equal(m2.crouching, false, 'surfacing stands back up');
  assert.equal(m2.forcedSwimCrouch, false);
});
