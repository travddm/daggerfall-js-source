// THE CLOCK ARC (CLK, 2026-09-08). . (test/world/clock.test.js is the
// world clock's own file - the rig's curve, the hour gates; this one is
// the arc's.)
//
// CLK1: the sky's PRESENTATION - the weather ease, the front's stretch
// of it, the cloud drift integral and the cloud profile's ease - walks
// on GAME MINUTES, the one clock the sun, the moons, the stars and the
// wind model already read, and never again on the wall's seconds the
// controller differenced for itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEATHER_EASE_MINUTES, WIND_SECONDS_PER_MINUTE, easeWeather, WEATHER_SKY } from '../../src/render/enhancedSky.js';
import { CLASSIC_MINUTES_PER_SECOND } from '../../src/systems/worldTick.js';
import {
  FIELD_PERIOD_METRES, wrapField, SHAPE_METRES, DETAIL_METRES, VARIATION_METRES, MOTTLE_METRES, easeProfile, VC_PROFILE,
} from '../../src/render/volumetricClouds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('CLK1: the constants - the ease is 14 real seconds at the default scale, said in game minutes; a game minute is five real seconds of wind', () => {
  assert.ok(Math.abs(WEATHER_EASE_MINUTES - 14 * CLASSIC_MINUTES_PER_SECOND) < 1e-12, 'ES1c\'s fourteen seconds, on the clock');
  assert.ok(Math.abs(WIND_SECONDS_PER_MINUTE - 1 / CLASSIC_MINUTES_PER_SECOND) < 1e-12, 'the row\'s per-second units through the one time scale');
  // the ease in minutes: one time constant at 2.8, all but done after a rest's hour, done after a day
  const a = { cover: 0, soft: 0.5, grey: 0, wind: [0, 0], lit: [1, 1, 1], shade: [0, 0, 0] };
  const b = { cover: 1, soft: 0.1, grey: 1, wind: [0.01, 0], lit: [0.5, 0.5, 0.5], shade: [0.2, 0.2, 0.2] };
  assert.ok(Math.abs(easeWeather(a, b, WEATHER_EASE_MINUTES).cover - (1 - Math.exp(-1))) < 1e-12);
  assert.ok(easeWeather(a, b, 60).cover > 0.999999, 'an hour of clock crosses it whole');
  assert.equal(easeWeather(a, b, 1440).cover, 1, 'a day of clock: arrived');
  assert.equal(easeWeather(a, b, 0).cover, 0, 'a stopped clock moves nothing');
  // the profile on the same minutes
  assert.ok(Math.abs(easeProfile(VC_PROFILE.sunny, VC_PROFILE.thunder, WEATHER_EASE_MINUTES).base - (VC_PROFILE.sunny.base + (VC_PROFILE.thunder.base - VC_PROFILE.sunny.base) * (1 - Math.exp(-1)))) < 1e-9);
  for (const w of Object.keys(WEATHER_SKY)) assert.ok(Math.hypot(...WEATHER_SKY[w].wind) < 0.1, `${w}: the row's wind is still in the dome's per-second units`);
});

test('CLK1: the wrap - the drift and the recenter shift are unbounded integrals; the clouds take them modulo the field\'s common period', () => {
  for (const [name, m] of Object.entries({ SHAPE_METRES, DETAIL_METRES, VARIATION_METRES, MOTTLE_METRES })) {
    const n = FIELD_PERIOD_METRES / m;
    assert.ok(Math.abs(n - Math.round(n)) < 1e-9 && n >= 1, `${name} divides the common period (${n} times)`);
  }
  for (const v of [0, 1, -1, 12345.678, -98765.4, FIELD_PERIOD_METRES, FIELD_PERIOD_METRES * 3.5, -FIELD_PERIOD_METRES * 2.25, 5e7]) {
    const w = wrapField(v);
    assert.ok(w >= 0 && w < FIELD_PERIOD_METRES, `${v} wraps into [0, P)`);
    assert.ok(Math.abs(wrapField(v + FIELD_PERIOD_METRES) - w) < 1e-6, 'a whole period away is the same cloud');
  }
  assert.ok(FIELD_PERIOD_METRES < 2 ** 20, 'the wrapped value keeps float32 precision under a metre');
});

// ---- CLK2: the weather evolves within the day (enhanced lane) --------
import {
  resetWeatherSim, setWeatherEvolution, weatherEvolutionOn, evolveClimateWeathers, rollClimateWeathersForDay, tickWeather,
  weatherForClimate, restoreWeather, weatherJumpStamp, EVOLVE_CHANCE_PER_HOUR, ZONE_CLIMATES, STALE_DRAIN_MINUTES, WEATHER_ENUM,
  currentWeather, WEATHER_TYPES, setWeather, setWeatherMapLaw,
} from '../../src/systems/weather/weatherSim.js';
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { MINUTES_PER_DAY } from '../../src/systems/gameDate.js';

const zonesNow = () => ZONE_CLIMATES.map((c) => weatherForClimate(c));

test('CLK2: the evolution - hourly, seeded on the hour and the zone, replayable; a day of it turns most zones at least once; the classic lane never sees it', () => {
  resetWeatherSim(); setWeatherMapLaw(false);   // WEATHER3b: the day-roll machine's pin - on the map's lane the map is the sky and this machine stands down (weather3b pins that)
  setWeatherEvolution(true);
  assert.equal(weatherEvolutionOn(), true);
  const day0 = 100 * MINUTES_PER_DAY;
  rollClimateWeathersForDay(day0, () => 0.0);   // every zone sunny (the first column)
  assert.equal(evolveClimateWeathers(day0 + 1), false, 'the first call anchors and rolls nothing');
  const before = zonesNow();
  const changes = [];
  for (let m = day0 + 60; m <= day0 + MINUTES_PER_DAY; m += 10) {   // a day walked in the rest's ten-minute steps
    if (evolveClimateWeathers(m)) changes.push(Math.floor(m / 60) - Math.floor(day0 / 60));
  }
  assert.ok(changes.length >= 1 && changes.length <= 12, `a day evolves a few times, not every hour and not never (${changes.length})`);
  assert.ok(changes.every((h) => h >= 1 && h <= 24), 'on hour boundaries within the day');
  const after = zonesNow();
  assert.notDeepEqual(after, before, 'the zones moved');
  // REPLAYABLE: the same day evolves the same way
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  for (let m = day0 + 60; m <= day0 + MINUTES_PER_DAY; m += 10) evolveClimateWeathers(m);
  assert.deepEqual(zonesNow(), after, 'seeded on the hour and the zone - whoever watches');
  // and the ten-minute walk and the one-hour walk agree: the hour is the unit
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  for (let m = day0 + 60; m <= day0 + MINUTES_PER_DAY; m += 60) evolveClimateWeathers(m);
  assert.deepEqual(zonesNow(), after, 'the same hours, however the clock is stepped');
  // the chance is the law's own number, and an hour re-rolls from the table (never a weather the season cannot bring)
  assert.ok(EVOLVE_CHANCE_PER_HOUR > 0.05 && EVOLVE_CHANCE_PER_HOUR < 0.3);
  assert.ok(after.every((w) => w >= 0 && w <= 6));
  // THE CLASSIC LANE: off, the hours pass and nothing moves
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(false);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  let moved = false;
  for (let m = day0 + 60; m <= day0 + MINUTES_PER_DAY; m += 60) moved = evolveClimateWeathers(m) || moved;
  assert.equal(moved, false);
  assert.deepEqual(zonesNow(), before, 'DFU\'s day roll is the whole machine there');
  resetWeatherSim(); setWeatherMapLaw(false);
});

test('CLK2: the change lands through DFU\'s own drain - live under the sky it is a front, out of sight it is a jump; a jump of days walks only the last 24 hours; a load re-anchors', () => {
  const day0 = 200 * MINUTES_PER_DAY;
  // find an hour that changes the Woodlands zone, from sunny
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);   // WEATHER3b: the day-roll machine's pin - on the map's lane the map is the sky and this machine stands down (weather3b pins that)
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  let hourOfChange = null;
  for (let h = 1; h <= 24 * 20 && hourOfChange === null; h++) {
    const was = weatherForClimate(CLIMATES.Woodlands);
    evolveClimateWeathers(day0 + h * 60);
    if (weatherForClimate(CLIMATES.Woodlands) !== was) hourOfChange = h;
  }
  assert.ok(hourOfChange !== null, 'the woodlands turn within twenty days');
  // LIVE: the drain on the next frame (a rest's sub-tick lands within the hour) - no jump stamp
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  tickWeather(day0 + 1, CLIMATES.Woodlands);   // the day's own drain first
  const stamp0 = weatherJumpStamp();
  for (let h = 1; h < hourOfChange; h++) { evolveClimateWeathers(day0 + h * 60); tickWeather(day0 + h * 60, CLIMATES.Woodlands); }
  assert.equal(evolveClimateWeathers(day0 + hourOfChange * 60), true);
  assert.equal(tickWeather(day0 + hourOfChange * 60 + 5, CLIMATES.Woodlands), true, 'the drain applies it');
  assert.equal(weatherJumpStamp(), stamp0, 'five minutes after its hour: live, a front');
  assert.equal(currentWeather(), WEATHER_TYPES[weatherForClimate(CLIMATES.Woodlands)], 'the drain applied the zone the player stands in');
  // STALE: the same change found by a tick hours later (a day inside) drains as a jump
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  tickWeather(day0 + 1, CLIMATES.Woodlands);
  const stamp1 = weatherJumpStamp();
  for (let h = 1; h < hourOfChange; h++) evolveClimateWeathers(day0 + h * 60);
  evolveClimateWeathers(day0 + hourOfChange * 60);
  assert.equal(tickWeather(day0 + hourOfChange * 60 + STALE_DRAIN_MINUTES + 1, CLIMATES.Woodlands), true);
  assert.equal(weatherJumpStamp(), stamp1 + 1, 'past the stale window from the change\'s OWN hour: a jump');
  // A JUMP OF DAYS in one tick walks only the last 24 hours (the earlier ones were the day roll's)
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  evolveClimateWeathers(day0 + 5 * MINUTES_PER_DAY);
  const jumped = zonesNow();
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 4 * MINUTES_PER_DAY + 1);
  for (let h = 1; h <= 24; h++) evolveClimateWeathers(day0 + 4 * MINUTES_PER_DAY + h * 60);
  assert.deepEqual(zonesNow(), jumped, 'the five-day jump and the last day walked hour by hour agree');
  // A LOAD re-anchors: the loaded clock's hour rolls nothing, the next hour does
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1);
  restoreWeather('rain');
  assert.equal(evolveClimateWeathers(day0 + 7 * MINUTES_PER_DAY + 30), false, 'the first tick after a load anchors');
  // A REWOUND clock (a load to an earlier save) re-anchors too
  assert.equal(evolveClimateWeathers(day0 + 30), false);
  assert.equal(evolveClimateWeathers(day0 + 30), false, 'and the same hour again rolls nothing');
  resetWeatherSim(); setWeatherMapLaw(false);
});

// ---- CLK3: day and night on the clock - the remaining steps ----------
import { lunarPhaseFraction, lunarPhaseFractionsFromMinutes, lunarPhase, lunarPhasesFromMinutes, dateFromClassicMinutes, LUNAR_PHASES } from '../../src/systems/gameDate.js';
import { skyState, moonSkyDirection, phaseLitFraction, sunSkyDirection } from '../../src/render/enhancedSky.js';
import { dayFraction, daylightScale, sunDirection, DAWN_HOUR, DUSK_HOUR } from '../../src/world/worldClock.js';

test('CLK3: the moon\'s phase is continuous on the clock for the dome - no 45-degree jump at midnight - and never a ring step from DFU\'s ladder, which every system still reads', () => {
  const base = 405 * 360 * MINUTES_PER_DAY;
  // across midnight the dome's moon moves by minutes, not by a step
  const before = skyState({ minuteOfDay: 1439, classicMinutes: base + 10 * MINUTES_PER_DAY + 1439 });
  const after = skyState({ minuteOfDay: 0, classicMinutes: base + 11 * MINUTES_PER_DAY });
  const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  assert.ok(angle(before.masser.dir, after.masser.dir) < 0.02, `Masser moves ${angle(before.masser.dir, after.masser.dir).toFixed(4)} rad across midnight - minutes' worth, not a step`);
  assert.ok(Math.abs(phaseLitFraction(before.masser.phase) - phaseLitFraction(after.masser.phase)) < 0.01, 'and the moonlight with it');
  // monotone through a day: the fraction only ever grows (mod the ring)
  let last = null;
  for (let m = 0; m < MINUTES_PER_DAY; m += 30) {
    const p = lunarPhaseFractionsFromMinutes(base + 3 * MINUTES_PER_DAY + m).masser;
    if (last !== null) assert.ok(((p - last + 8) % 8) > 0 && ((p - last + 8) % 8) < 0.02, 'a half hour is a sliver of the ring');
    last = p;
  }
  // a full ring is 32 days: the fraction at day d + 32 is the fraction at day d
  for (const d of [0, 7, 19]) {
    const a = lunarPhaseFractionsFromMinutes(base + d * MINUTES_PER_DAY + 600), b = lunarPhaseFractionsFromMinutes(base + (d + 32) * MINUTES_PER_DAY + 600);
    assert.ok(Math.abs(a.masser - b.masser) < 1e-9 && Math.abs(a.secunda - b.secunda) < 1e-9);
  }
  // the ladder's distance (the review widened this to the whole day): at midnight never more than one ring
  // step from DFU's own ladder, within the day at most 1.25 (the fraction walks a quarter step across a day
  // while the ladder stands still), on every day of the cycle, both moons
  const ring = (a, b) => Math.min(Math.abs(a - b), 8 - Math.abs(a - b));
  let worstDay = 0;
  for (let d = 0; d < 32; d++) {
    for (const m of [0, 360, 720, 1080, 1439]) {
      const cm = base + d * MINUTES_PER_DAY + m;
      const steps = lunarPhasesFromMinutes(cm), frac = lunarPhaseFractionsFromMinutes(cm);
      for (const moon of ['masser', 'secunda']) {
        const dist = ring(frac[moon], steps[moon]);
        assert.ok(dist <= (m === 0 ? 1 : 1.25) + 1e-9, `day ${d} minute ${m} ${moon}: fraction ${frac[moon].toFixed(2)} vs ladder ${steps[moon]}`);
        worstDay = Math.max(worstDay, dist);
      }
      if (m === 0) {
        // at midnight on a Full or New day the two agree exactly
        if (steps.masser === LUNAR_PHASES.Full) assert.ok(Math.abs(frac.masser - 4) < 1e-9, 'Full is ratio 0: the fraction is 4 at midnight');
        if (steps.masser === LUNAR_PHASES.New) assert.ok(Math.abs(frac.masser) < 1e-9, 'New is ratio 16: the fraction is 0 at midnight');
      }
    }
  }
  assert.ok(worstDay > 1, 'and the within-day bound is the real one: the walk does exceed a step late in the widest band');
  assert.equal(lunarPhaseFraction({ year: -1 }, 0), 0, 'year < 0: None, as the ladder answers');
  assert.equal(lunarPhase(dateFromClassicMinutes(base), { masser: true }) >= 0, true, 'the ladder itself is untouched');
  // the systems keep the step - the readers the page names (the enchant ctx's moon arms, the lycanthrope's full
  // moon, the Dynamic Skies mod's own), unconditionally: a file that stops reading DFU's step goes red, not quiet
  for (const f of ['src/scenes/hostEnchant.js', 'src/systems/lycanthropy.js', 'src/systems/dynamicSkies/dynamicSkies.js']) {
    const s = read(f);
    assert.match(s, /lunarPhasesFromMinutes|isFullMoonFromMinutes|lunarPhase\(/, `${f}: reads DFU's step`);
    assert.doesNotMatch(s, /lunarPhaseFraction/, `${f}: a system reads DFU's step, never the dome's fraction`);
  }
  assert.equal(Object.keys(import.meta).length >= 0, true);
  assert.deepEqual(skyState({ minuteOfDay: 0, classicMinutes: base, phases: { masser: LUNAR_PHASES.Full, secunda: LUNAR_PHASES.New } }).masser.phase, LUNAR_PHASES.Full, 'a caller\'s own phases go in whole');
  for (const h of [DAWN_HOUR, DUSK_HOUR]) {
    assert.ok(Math.abs(sunSkyDirection(h * 60)[1]) < 1e-9, `${h}:00: the dome's sun is on the horizon`);
    assert.ok(Math.abs(daylightScale(h * 60)) < 1e-9, 'and the rig\'s light is at zero - the same minute');
  }
  let lastY = -1, lastScale = -1;
  for (let m = DAWN_HOUR * 60; m <= 12 * 60; m += 15) {
    const y = sunSkyDirection(m)[1], sc = daylightScale(m);
    assert.ok(y >= lastY - 1e-12 && sc >= lastScale - 1e-12, 'both climb through the morning together');
    assert.ok(Math.abs(y - sunDirection(m)[1]) < 1e-6, 'the rig\'s sun and the dome\'s are one direction by day');
    lastY = y; lastScale = sc;
  }
  assert.ok(sunSkyDirection(3 * 60)[1] < 0 && dayFraction(3 * 60) < 0, 'and the dome alone knows how far under the horizon the night\'s sun is');
});

// ---- CLK4: the review's fixes ----------------------------------------
import { moonlightTerm, MOONLIGHT, DECK_LATTICE, DECK_PERIOD, wrapDeck, fbm } from '../../src/render/enhancedSky.js';

test('CLK4: the review - a distant zone never moves the player\'s stale clock, a loaded save is never evolved off, the door is live, the moonlight ramps, the deck has a period, the rest is a veil', () => {
  // (1) THE PLAYER'S ZONE'S STAMP: the day rolls at midnight while the player is inside; a DISTANT zone turns at
  // 03:00; the player steps out at 03:10 - the drain is stale (the day roll's three hours), not live (the distant turn)
  const day0 = 300 * MINUTES_PER_DAY;
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);   // WEATHER3b: the day-roll machine's pin - on the map's lane the map is the sky and this machine stands down (weather3b pins that)
  rollClimateWeathersForDay(day0 - MINUTES_PER_DAY, () => 0.0); evolveClimateWeathers(day0 - MINUTES_PER_DAY + 1);
  tickWeather(day0 - MINUTES_PER_DAY + 1, CLIMATES.Woodlands);
  setWeather('rain');   // the sky the player stands under
  rollClimateWeathersForDay(day0, () => 0.0);   // midnight, inside: every zone Sunny, the woodlands' slot now differs from the rain
  let distantTurn = null;
  for (let h = 1; h <= 24 * 30 && distantTurn === null; h++) {
    const before = zonesNow();
    if (evolveClimateWeathers(day0 + h * 60)) {
      const after = zonesNow();
      const woodlands = ZONE_CLIMATES.indexOf(CLIMATES.Woodlands);
      if (after[woodlands] === before[woodlands]) distantTurn = h;   // a zone that is not the player's moved
      else { resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true); rollClimateWeathersForDay(day0, () => 0.0); evolveClimateWeathers(day0 + 1); setWeather('rain'); }
    }
  }
  assert.ok(distantTurn !== null, 'some hour turns a zone that is not the woodlands');
  const stamp = weatherJumpStamp();
  assert.equal(tickWeather(day0 + distantTurn * 60 + 10, CLIMATES.Woodlands), true, 'the drain applies the day roll\'s Sunny to the woodlands');
  assert.equal(weatherJumpStamp(), stamp + 1, 'and it is a JUMP - the woodlands\' change is the day roll\'s, hours old; the distant zone\'s turn ten minutes ago is not the player\'s');
  // (2) A LOADED SAVE: the array was never rolled (all Sunny); the evolution rolls nothing off it, the loaded sky stands
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);
  restoreWeather('rain');
  evolveClimateWeathers(day0 + 1);
  let moved = false;
  for (let h = 1; h <= 48; h++) moved = evolveClimateWeathers(day0 + h * 60) || moved;
  assert.equal(moved, false, 'nothing evolves off an array a save never had');
  assert.equal(tickWeather(day0 + 48 * 60, CLIMATES.Woodlands), false);
  assert.equal(currentWeather(), 'rain', 'the W1 restore law holds: the loaded sky stands until a day rolls');
  rollClimateWeathersForDay(day0 + MINUTES_PER_DAY, () => 0.0); evolveClimateWeathers(day0 + MINUTES_PER_DAY + 1);
  moved = false;
  for (let h = 1; h <= 24 * 20; h++) moved = evolveClimateWeathers(day0 + MINUTES_PER_DAY + h * 60) || moved;
  assert.equal(moved, true, 'and after the day roll the evolution runs again');
  resetWeatherSim(); setWeatherMapLaw(false);
  // (4) THE MOONLIGHT RAMPS on the daylight curve - no step at 18:00, none at 06:00
  const base = 405 * 360 * MINUTES_PER_DAY;
  let nightOf = null;
  for (let d = 0; d < 32 && nightOf === null; d++) {
    const st = skyState({ minuteOfDay: 18 * 60 + 5, classicMinutes: base + d * MINUTES_PER_DAY + 18 * 60 + 5 });
    if (st.masser.vis > 0.5 && phaseLitFraction(st.masser.phase) > 0.5) nightOf = d;
  }
  assert.ok(nightOf !== null);
  let lastScale = 0;
  for (let m = 17 * 60 + 30; m <= 18 * 60 + 30; m++) {
    const st = skyState({ minuteOfDay: m, classicMinutes: base + nightOf * MINUTES_PER_DAY + m });
    const term = moonlightTerm(st);
    const scale = term ? term.scale : 0;
    assert.ok(scale >= lastScale - 1e-12 && scale - lastScale < 0.04, `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}: the moonlight rises by slivers (${(scale - lastScale).toFixed(4)})`);
    lastScale = scale;
  }
  assert.ok(lastScale > 0.05, 'and is up by half past six');
  assert.equal(moonlightTerm(skyState({ minuteOfDay: 12 * 60, classicMinutes: base + nightOf * MINUTES_PER_DAY + 12 * 60 })), null, 'none at noon');
  assert.equal(skyState({ minuteOfDay: 720, classicMinutes: base }).daylight, daylightScale(720), 'the state carries the rig\'s curve');
  assert.ok(MOONLIGHT.dayFade > 0 && MOONLIGHT.dayFade < 0.2);
  // (5) THE DECK HAS A PERIOD: both decks whole, the field the same a period away, the drift wrapped where it becomes the state
  assert.equal(DECK_PERIOD % DECK_LATTICE, 0, 'the near deck');
  assert.ok(Math.abs((DECK_PERIOD * 0.55) / DECK_LATTICE - Math.round((DECK_PERIOD * 0.55) / DECK_LATTICE)) < 1e-9, 'the far deck (0.55 of the drift)');
  for (const [x, y] of [[0.3, 0.7], [12.25, -3.5], [100.1, 77.7]]) {
    assert.ok(Math.abs(fbm(x + DECK_PERIOD, y) - fbm(x, y)) < 1e-9 && Math.abs(fbm(x, y - DECK_PERIOD) - fbm(x, y)) < 1e-9, `fbm(${x}, ${y}) repeats every DECK_PERIOD`);
    assert.ok(Math.abs(fbm(x + DECK_LATTICE, y) - fbm(x, y)) < 1e-9, 'and every lattice period of the base octave');
  }
  assert.ok(wrapDeck(DECK_PERIOD * 3 + 5) - 5 < 1e-9 && wrapDeck(-1) > DECK_PERIOD - 1.001);
  const st = skyState({ minuteOfDay: 720, classicMinutes: base, drift: [DECK_PERIOD * 7 + 1.5, -DECK_PERIOD - 2] });
  assert.ok(Math.abs(st.drift[0] - 1.5) < 1e-9 && Math.abs(st.drift[1] - (DECK_PERIOD - 2)) < 1e-9, 'wrapped once, where the state is made');
  // (7) WHAT STAYS ON THE WALL, by decision - pinned so the next audit does not "fix" it
  for (const h of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const s = read(h);
    assert.match(s, /lightning\.tick\(dt\)/, `${h}: the strobe's schedule is DFU's real-second law`);
    assert.match(s, /advanceRotor\(w\.state, dt, /, `${h}: the sails turn at their physical rate`);
    assert.match(s, /tsec: now \/ 1000/, `${h}: the precipitation's wander is the wall's`);
  }
});

// ---- AUDIT 65 SL-1 -----------------------------------------------------
// The CLK4 arm above pins the BOOT load: a fresh process, resetWeatherSim()
// first, so `_climateWeathersValid` was never raised and the evolution has
// nothing to roll off. The IN-SESSION load - F12, or the pause window's Load -
// runs in a process that HAS rolled, and restoreWeather stamped the array
// ROLLED without lowering VALID, so CLK2's hourly evolution kept walking the
// OUTGOING session's six zones and DFU's own drain wore the loaded sky off
// within hours. WeatherManager.cs:538-542's else arm is not "at boot" - it is
// "in case of loaded savegame", every time.
test('CLK2 / AUDIT 65 SL-1: an IN-SESSION load lowers the evolution guard - the loaded sky survives a day of hourly evolution in a session that had already rolled', () => {
  const day0 = 300 * MINUTES_PER_DAY;
  resetWeatherSim(); setWeatherMapLaw(false); setWeatherEvolution(true);   // WEATHER3b: the day-roll machine's pin - on the map's lane the map is the sky and this machine stands down (weather3b pins that)
  // the OUTGOING session's boot roll: a real, valid six-zone array (all Sunny)
  tickWeather(day0 - 200, CLIMATES.Woodlands, () => 0.0);
  assert.equal(currentWeather(), 'sunny', 'the outgoing session stands under its own rolled sky');
  // ...and then the player loads, in this same process
  restoreWeather('rain');
  const stamp = weatherJumpStamp();
  for (let h = 1; h <= 24; h++) {
    evolveClimateWeathers(day0 + h * 60);
    tickWeather(day0 + h * 60, CLIMATES.Woodlands);
    assert.equal(currentWeather(), 'rain', `hour ${h}: the loaded sky still stands`);
  }
  assert.equal(weatherJumpStamp(), stamp, 'and nothing landed as a jump either - the array never moved');
  // the next DAY ROLL re-validates, and the evolution runs again
  rollClimateWeathersForDay(day0 + MINUTES_PER_DAY, () => 0.0); evolveClimateWeathers(day0 + MINUTES_PER_DAY + 1);
  let moved = false;
  for (let h = 1; h <= 24 * 20; h++) moved = evolveClimateWeathers(day0 + MINUTES_PER_DAY + h * 60) || moved;
  assert.equal(moved, true, 'the guard is dormant, not dead');
  resetWeatherSim(); setWeatherMapLaw(false);
});
