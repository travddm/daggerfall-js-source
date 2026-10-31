// ES1 - THE ENHANCED SKY (2026-08-27, Mac's call: "for the enhanced
// version of the game, I want us to develop our own take on the
// procedural sky system mod from DFU").
//
// The sky's PRESENTATION is ours and unpinnable by assertion - it is
// judged by eye through tools/enhancedSkyProbe.mjs, which renders the
// real pass in a real WebGL context and screenshots it. What IS pinned
// here is everything the presentation stands on:
//
//   - the LAWS it reads are the port's verbatim ones, not new ones: the
//     sun's arc is worldClock's own (dawn at map east, noon overhead),
//     the moons' phases are gameDate's DFU ladder, night is DawnHour /
//     DuskHour, the weather is the weather sim's own type names;
//   - the palette is a RECORD interpolated in the sun's elevation, so
//     "change a row, change the sky" is true and no colour lives in the
//     shader;
//   - the moons' PLACES agree with their phases (a full moon is up at
//     midnight, a new moon is beside the sun and never seen at night),
//     which is the one thing a player can catch the sky lying about;
//   - the classic pass is untouched and the enhanced one is behind the
//     skin, with ?sky=classic the escape hatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SKY_KEYS, WEATHER_SKY, MOONS, SUN_RADIUS,
  paletteAt, sunSkyDirection, moonSkyDirection, skyState,
} from '../../src/render/enhancedSky.js';
import { LUNAR_PHASES, lunarPhasesFromMinutes, MINUTES_PER_DAY as CLASSIC_DAY } from '../../src/systems/gameDate.js';
import { dayFraction, isNight, sunDirection, DAWN_HOUR, DUSK_HOUR } from '../../src/world/worldClock.js';
import { WEATHER_TYPES } from '../../src/world/weather.js';

const read = (p) => hostText(p);
const at = (h, m = 0) => h * 60 + m;
const elevOf = (dir) => Math.asin(Math.max(-1, Math.min(1, dir[1]))) * 180 / Math.PI;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ── THE PALETTE IS A RECORD ───────────────────────────────────────
test('ES1 palette: a table in the sun\'s elevation, interpolated, and the shader holds no colour', () => {
  // Ordered, spanning horizon to horizon, every field a colour or a 0..1.
  assert.ok(SKY_KEYS.length >= 5);
  assert.equal(SKY_KEYS[0].elev, -90);
  assert.equal(SKY_KEYS[SKY_KEYS.length - 1].elev, 90);
  for (let i = 1; i < SKY_KEYS.length; i++) assert.ok(SKY_KEYS[i].elev > SKY_KEYS[i - 1].elev, 'rows ascend');
  for (const k of SKY_KEYS) {
    for (const f of ['zenith', 'horizon', 'sun', 'glow']) assert.match(k[f], /^#[0-9a-f]{6}$/, `${f} is a hex colour`);
    for (const f of ['glowAmount', 'stars']) assert.ok(k[f] >= 0 && k[f] <= 1, `${f} is 0..1`);
  }
  // A row is returned verbatim at its own elevation, and between two
  // rows every channel is the linear blend - the whole interpolation.
  // EE2 F3: elevation 2 is a REAL key now, so it is no longer the
  // midpoint of 0 and 4. The law - linear between the two keys an
  // elevation falls between - is checked on a gap that still has none.
  const p0 = paletteAt(4), pMid = paletteAt(5.5), p4 = paletteAt(7);
  const row0 = SKY_KEYS.find((k) => k.elev === 4), row4 = SKY_KEYS.find((k) => k.elev === 7);
  assert.ok(near(p0.glowAmount, row0.glowAmount) && near(p4.glowAmount, row4.glowAmount));
  assert.ok(near(pMid.glowAmount, (row0.glowAmount + row4.glowAmount) / 2), 'halfway is half');
  for (let c = 0; c < 3; c++) assert.ok(near(pMid.zenith[c], (p0.zenith[c] + p4.zenith[c]) / 2, 1e-6));
  // Clamped past both ends, never undefined.
  assert.deepEqual(paletteAt(-200).zenith, paletteAt(-90).zenith);
  assert.deepEqual(paletteAt(200).zenith, paletteAt(90).zenith);
  // Night is starry and sunless, noon is not.
  assert.equal(paletteAt(-90).stars, 1);
  assert.equal(paletteAt(90).stars, 0);
});

test('ES1 weather: one row per weather type the sim can produce, and greyer weather is greyer', () => {
  for (const type of WEATHER_TYPES) assert.ok(WEATHER_SKY[type], `${type} has a sky row`);
  assert.equal(Object.keys(WEATHER_SKY).length, WEATHER_TYPES.length, 'and no row for a weather that cannot happen');
  for (const [name, w] of Object.entries(WEATHER_SKY)) {
    for (const f of ['cover', 'soft', 'grey']) assert.ok(w[f] >= 0 && w[f] <= 1, `${name}.${f} is 0..1`);
    assert.match(w.lit, /^#[0-9a-f]{6}$/); assert.match(w.shade, /^#[0-9a-f]{6}$/);
    assert.equal(w.wind.length, 2);
  }
  assert.ok(WEATHER_SKY.sunny.cover < WEATHER_SKY.cloudy.cover);
  assert.ok(WEATHER_SKY.cloudy.cover < WEATHER_SKY.overcast.cover);
  assert.ok(WEATHER_SKY.overcast.cover <= WEATHER_SKY.thunder.cover);
  assert.equal(WEATHER_SKY.sunny.grey, 0, 'a clear sky is not greyed at all');
  assert.ok(WEATHER_SKY.thunder.grey > WEATHER_SKY.overcast.grey);
  assert.ok(WEATHER_SKY.thunder.wind[0] > WEATHER_SKY.sunny.wind[0], 'a storm moves faster');
});

// ── THE LAWS ARE THE PORT'S OWN ───────────────────────────────────
test('ES1 sun: worldClock\'s arc, continued below the horizon', () => {
  // Dawn at map east, noon overhead, dusk at map west - the same three
  // the lit world uses, so the shadow and the sun in the sky agree.
  const dawn = sunSkyDirection(at(DAWN_HOUR));
  const noon = sunSkyDirection(at((DAWN_HOUR + DUSK_HOUR) / 2));
  const dusk = sunSkyDirection(at(DUSK_HOUR));
  assert.ok(near(dawn[0], 1, 1e-9) && near(dawn[1], 0, 1e-9), 'dawn: due east, on the horizon');
  assert.ok(near(noon[1], 1, 1e-9), 'noon: straight up');
  assert.ok(near(dusk[0], -1, 1e-9) && near(dusk[1], 0, 1e-9), 'dusk: due west, on the horizon');
  for (const m of [at(7), at(10), at(13), at(17)]) {
    const s = sunSkyDirection(m);
    assert.ok(near(Math.hypot(s[0], s[1], s[2]), 1, 1e-9), 'unit');
    // It IS the lit world's direction while the sun is up.
    const lit = sunDirection(m);
    assert.ok(near(s[0], lit[0], 1e-6) && near(s[1], lit[1], 1e-6), `${m}: the sky's sun is the world's sun`);
  }
  // ...and below the horizon at night, which sunDirection clamps away -
  // twilight is a matter of degrees, so the sky needs the real angle.
  assert.ok(sunSkyDirection(at(0))[1] < -0.5, 'midnight: well under');
  assert.ok(elevOf(sunSkyDirection(at(19))) < 0 && elevOf(sunSkyDirection(at(19))) > -20, 'an hour past dusk: twilight, not deep night');
  assert.ok(dayFraction(at(0)) < 0, 'the unclamped fraction is what makes that possible');
});

test('ES1 moons: DFU\'s phases decide WHERE they are, so the sky cannot lie about them', () => {
  // The one thing a player can catch: a full moon must be up at
  // midnight and a new moon must never be seen at night.
  const midnight = at(0), noon = at((DAWN_HOUR + DUSK_HOUR) / 2);
  assert.ok(moonSkyDirection(midnight, LUNAR_PHASES.Full)[1] > 0.9, 'a full moon is overhead at midnight');
  assert.ok(moonSkyDirection(noon, LUNAR_PHASES.Full)[1] < -0.9, '...and under the world at noon');
  assert.ok(moonSkyDirection(midnight, LUNAR_PHASES.New)[1] < -0.9, 'a new moon is with the sun: never seen at night');
  assert.ok(near(moonSkyDirection(noon, LUNAR_PHASES.New)[1], 1, 1e-9), '...and beside the sun at noon');
  // A waning half rises at midnight and is high at dawn; a waxing half sets after dusk.
  assert.ok(moonSkyDirection(at(DAWN_HOUR), LUNAR_PHASES.HalfWane)[1] > 0.5, 'the waning half is high at dawn');
  assert.ok(moonSkyDirection(at(DUSK_HOUR + 1), LUNAR_PHASES.HalfWax)[1] > 0, 'the waxing half is still up just after dusk');
  // None (the year < 0 sentinel) is treated as new rather than thrown.
  assert.deepEqual(moonSkyDirection(noon, LUNAR_PHASES.None), moonSkyDirection(noon, LUNAR_PHASES.New));
  // Every phase is a unit direction on the sun's own plane, tilt aside.
  for (const p of Object.values(LUNAR_PHASES)) {
    const d = moonSkyDirection(at(9), p, 0);
    assert.ok(near(Math.hypot(d[0], d[1], d[2]), 1, 1e-9));
    assert.ok(near(d[2], 0, 1e-9), 'no tilt: on the sun\'s arc');
  }
  assert.ok(MOONS.masser.radius > MOONS.secunda.radius, 'Masser is the big one');
  assert.ok(MOONS.secunda.tilt !== 0, '...and Secunda rides off the arc, so they do not overlap forever');
  assert.ok(SUN_RADIUS > 0.01 && SUN_RADIUS < 0.1);
});

// ── THE FRAME'S STATE ─────────────────────────────────────────────
test('ES1 state: what the shader gets - the palette by elevation, the weather\'s hand, the clock\'s phases', () => {
  const noon = skyState({ minuteOfDay: at(12), weather: 'sunny', classicMinutes: 0 });
  const night = skyState({ minuteOfDay: at(0), weather: 'sunny', classicMinutes: 0 });
  assert.ok(noon.elevDeg > 80 && night.elevDeg < -40);
  assert.equal(noon.sunVis, 1, 'the disc is drawn by day');
  assert.equal(night.sunVis, 0, '...and not at night');
  assert.ok(night.stars > 0.8 && noon.stars === 0, 'stars at night, none by day - a little dimmed even on a clear night by its scattered cloud');
  assert.ok(skyState({ minuteOfDay: at(0), weather: 'overcast' }).stars < night.stars, 'and dimmer under cloud');
  assert.equal(night.night, isNight(at(0)));
  assert.equal(noon.night, isNight(at(12)));
  // The hosts read these two for the haze and the clear, exactly as they
  // read the classic pass's - which is why the field names are its.
  assert.deepEqual(noon.clearColor, noon.horizon);
  assert.deepEqual(noon.fillColor, noon.zenith);
  // Weather greys the dome and thins the glow; a storm more than clouds.
  const clear = skyState({ minuteOfDay: at(12), weather: 'sunny' });
  const storm = skyState({ minuteOfDay: at(12), weather: 'thunder' });
  // The dome moves TOWARD the grey - which is not the same as darker,
  // and the difference is worth pinning because it caught this test out:
  // a greyed noon zenith is LIGHTER in sum than clear blue. The frame
  // gets darker because the CLOUDS cover it, which is the probe's to
  // judge (it measures 95 < 137 < 174 for storm < overcast < clear).
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const grey = [0x66 / 255, 0x70 / 255, 0x7c / 255];   // GREY_ZENITH
  assert.ok(dist(storm.zenith, grey) < dist(clear.zenith, grey), 'a storm dome is nearer grey');
  const cloudy = skyState({ minuteOfDay: at(12), weather: 'cloudy' });
  assert.ok(dist(cloudy.zenith, grey) < dist(clear.zenith, grey) && dist(storm.zenith, grey) < dist(cloudy.zenith, grey),
    'and the greying is ordered: clear, cloudy, storm');
  assert.ok(storm.glowAmount < clear.glowAmount, 'the horizon glow thins under weather');
  assert.ok(storm.cloudCover > clear.cloudCover);
  assert.ok(storm.stars <= clear.stars);
  // Weather darkens the CLOUDS, which is what a rendered storm reads as.
  assert.ok(storm.cloudLit[0] + storm.cloudLit[1] + storm.cloudLit[2] < clear.cloudLit[0] + clear.cloudLit[1] + clear.cloudLit[2],
    'a storm\'s clouds are darker than a clear day\'s');
  // The phases come from the CLASSIC clock. CLK3: as a NUMBER on it -
  // the same in-game day's morning and evening are thirteen hours
  // apart on a 32-day ring, a sliver, and both sit within one ring step
  // of DFU's ladder for that day (which every system still reads whole).
  const day11 = 11 * CLASSIC_DAY;
  const morning = skyState({ minuteOfDay: at(7), classicMinutes: day11 + at(7) });
  const evening = skyState({ minuteOfDay: at(20), classicMinutes: day11 + at(20) });
  assert.ok(Math.abs(evening.masser.phase - morning.masser.phase - 13 / 24 / 4) < 1e-9, 'one day: thirteen hours of the ring between them');
  const ring = (a, b) => Math.min(Math.abs(a - b), 8 - Math.abs(a - b));
  assert.ok(ring(morning.masser.phase, lunarPhasesFromMinutes(day11 + at(7)).masser) <= 1, 'within a step of the ladder');
  assert.notEqual(Math.round(morning.masser.phase), Math.round(skyState({ minuteOfDay: at(7), classicMinutes: day11 + 8 * CLASSIC_DAY }).masser.phase), 'eight days on, another phase');
  // A moon below the horizon is not drawn; by day it is faint at most.
  const full = skyState({ minuteOfDay: at(0), phases: { masser: LUNAR_PHASES.Full, secunda: LUNAR_PHASES.Full } });
  assert.ok(full.masser.vis > 0.5, 'a full moon at midnight is plainly there');
  const dayFull = skyState({ minuteOfDay: at(12), phases: { masser: LUNAR_PHASES.Full, secunda: LUNAR_PHASES.Full } });
  assert.equal(dayFull.masser.vis, 0, 'and under the world at noon it is not drawn at all');
  const dayNew = skyState({ minuteOfDay: at(12), phases: { masser: LUNAR_PHASES.New, secunda: LUNAR_PHASES.New } });
  assert.ok(dayNew.masser.vis < 0.2, 'a moon up by day is faint');
  // An unknown weather falls to clear rather than throwing.
  assert.deepEqual(skyState({ minuteOfDay: at(12), weather: 'volcano' }).zenith, clear.zenith);
});

// ── ES1c: THE POLISH (2026-08-27, Mac: "how can we improve this") ──
// Four of five taken: the banding, the clouds, the weather's snap, the
// stars standing still. (The fifth - cloud shadow on the world - is a
// world change, not a sky one, and stays on the board.)
import { easeWeather, weatherRow, WEATHER_EASE_MINUTES, STAR_POLE } from '../../src/render/enhancedSky.js';

test('ES1c weather: the sim flips in a frame, the sky walks - eased, monotone, and whole on the first call', () => {
  const clear = weatherRow('sunny'), storm = weatherRow('thunder');
  assert.deepEqual(easeWeather(null, storm, 1), { ...storm }, 'the first call takes the row whole: a boot into rain is rain');
  assert.deepEqual(easeWeather(clear, storm, 0), { ...clear }, 'no time, no move');
  // One step is a fraction of the way, and the way is monotone.
  let row = clear, last = clear.cover;
  for (let t = 0; t < 60; t += 1 / 60) {
    row = easeWeather(row, storm, 1 / 60);
    assert.ok(row.cover >= last - 1e-12, 'cover never goes backwards on the way to a stormier row');
    last = row.cover;
  }
  const span = storm.cover - clear.cover;
  assert.ok(Math.abs(row.cover - storm.cover) < span * 0.02, `an hour of clock in it has all but arrived (${(row.cover).toFixed(4)} of ${storm.cover})`);
  const half = easeWeather(clear, storm, WEATHER_EASE_MINUTES);
  assert.ok(half.cover > clear.cover && half.cover < storm.cover, 'at the time constant it is part way, not there');
  assert.ok(Math.abs(half.cover - (clear.cover + (storm.cover - clear.cover) * (1 - Math.exp(-1)))) < 1e-9, 'exponential, one time constant');
  // Every number the shader takes eases, colours included.
  for (const k of ['cover', 'soft', 'grey']) assert.ok(Number.isFinite(half[k]), k);
  assert.equal(half.wind.length, 2);
  assert.equal(half.lit.length, 3);
  assert.ok(half.lit.every((v, i) => (v - clear.lit[i]) * (storm.lit[i] - clear.lit[i]) >= 0), 'the cloud colours ease too');
  assert.ok(WEATHER_EASE_MINUTES >= 1 && WEATHER_EASE_MINUTES <= 6, `${WEATHER_EASE_MINUTES} game minutes: a weather turns, it does not cut`);
  // skyState takes the eased row over the type's own.
  const eased = skyState({ minuteOfDay: 12 * 60, weather: 'sunny', row: half });
  assert.equal(eased.cloudCover, half.cover, 'the state is built from the eased row');
  assert.notEqual(eased.cloudCover, weatherRow('sunny').cover);
});

test('ES1c stars: the field wheels about a pole, one turn a day, on the same clock as the sun', () => {
  const at = (h) => skyState({ minuteOfDay: h * 60 }).starAngle;
  assert.equal(at(0), 0);
  assert.ok(Math.abs(at(12) - Math.PI) < 1e-9, 'half a turn by noon');
  assert.ok(Math.abs(at(24) - Math.PI * 2) < 1e-9, 'a full turn a day');
  assert.ok(at(3) > at(0) && at(21) > at(3), 'it only goes one way');
  // The pole is a unit vector, off the zenith, so the field wheels at an
  // angle rather than spinning flat overhead.
  const len = Math.hypot(...STAR_POLE);
  assert.ok(Math.abs(len - 1) < 1e-6, `${len}: a direction`);
  assert.ok(STAR_POLE[1] > 0.3 && STAR_POLE[1] < 0.9, 'tilted: neither flat nor overhead');
  assert.deepEqual(skyState({ minuteOfDay: 60 }).starPole, STAR_POLE, 'and the state carries it to the shader');
});

// ── ES1d: THE CLOUD IN FRONT OF THE SUN ───────────────────────────
import { sunOcclusion, CLOUD_SHADOW, fbm, hash21 } from '../../src/render/enhancedSky.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

test('ES1d shadow: the sun dims under the cloud the SHADER draws, and the two cannot disagree', () => {
  // Nothing at night: there is no sun to occlude.
  assert.equal(sunOcclusion(skyState({ minuteOfDay: 2 * 60, weather: 'cloudy' })), 0);
  assert.equal(sunOcclusion(null), 0);
  // A clear sky barely occludes; a solid deck occludes wholly; a broken
  // one SWEEPS - which is the whole point, a cloud passing over you.
  const over = (w) => {
    const v = [];
    for (let t = 0; t < 400; t += 10) v.push(sunOcclusion(skyState({ minuteOfDay: 9 * 60, weather: w, seconds: t })));
    return { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((a, b) => a + b) / v.length };
  };
  const sunny = over('sunny'), cloudy = over('cloudy'), overcast = over('overcast');
  assert.ok(sunny.mean < 0.1, `clear: the sun is mostly out (${sunny.mean.toFixed(2)})`);
  assert.ok(cloudy.min < 0.1 && cloudy.max > 0.9, `broken: it sweeps (${cloudy.min.toFixed(2)}..${cloudy.max.toFixed(2)})`);
  assert.ok(overcast.min > 0.95, 'solid: the sun is gone');
  for (const s of [sunny, cloudy, overcast]) assert.ok(s.min >= 0 && s.max <= 1);
  assert.ok(fbm(1.5, 2.5) >= 0 && fbm(1.5, 2.5) <= 1);
  assert.equal(hash21(1, 1), hash21(1, 1));
  assert.notEqual(hash21(1, 1), hash21(1, 2));
  // The world takes it off the KEY light only - the sky still lights the
  // ground under a cloud - and the same number in both exterior hosts.
  assert.ok(CLOUD_SHADOW > 0.2 && CLOUD_SHADOW < 0.8, `${CLOUD_SHADOW}: a cloud dims the sun, it does not switch it off`);
  for (const host of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const src = read(host);
    // WX2: the weather's sun scale reaches the light as `wxNow.sun` - the
    // row's own number under the classic sky, the front's under the enhanced
    assert.match(src, /sunScale\(minute\) \* wxNow\.sun \* flash \* sky\.sunFactor\(\)/, `${host} dims the key light`);
    assert.doesNotMatch(src, /exteriorAmbient\(minute, 1, (weatherSun|wxNow\.sun) \* sky\.sunFactor/, `${host} does NOT dim the ambient`);
  }
});

// ── ES1e / ES1f / ES1g: THE RETRO PASS - REMOVED (FT3, 2026-09-14, Mac:
// "Remove our version of pixelated sky"). The pins went with the pass.

// ═══ EE2: the sky's four fixes, from the Enhanced Environments lab ═══
test('EE2: the deck reaches the horizon, the stars are not rows, the sunset has its band', async () => {
  const { paletteAt, SKY_KEYS } = await import('../../src/render/enhancedSky.js');
  // F3: the band is four keys wide where it was two
  const band = SKY_KEYS.filter((k) => k.elev >= -4 && k.elev <= 7).map((k) => k.elev);
  assert.deepEqual(band, [-4, -2, 0, 2, 4, 7]);
  const h = [-2, 0, 2].map((e) => paletteAt(e).horizon);
  assert.ok(h[0][0] > h[0][1] * 1.3, 'at -2 the horizon is EMBER: red well over green');
  assert.ok(h[1][0] > h[1][1] && h[1][1] > h[1][2], 'at 0 it is peach');
  const z = paletteAt(-2).zenith;
  assert.ok(z[2] > z[1] && z[1] > z[0], 'at -2 the zenith is deep blue-violet');
  assert.ok(paletteAt(0).glowAmount > paletteAt(-2).glowAmount && paletteAt(2).glowAmount < paletteAt(0).glowAmount,
    'the glow swings warm then cools as the sun clears the haze');
});

test('AUDIT 58 (f3/render): the classic lane builds 1000 particles and no lab program; the enhanced lane builds the lab\u2019s 26,000', async () => {
  const { PrecipitationRenderer, LAB_COUNTS } = await import('../../src/render/precipitation.js');
  // the audit26/renderalloc/glstate Proxy-GL precedent, counting what
  // the constructor actually mints and uploads
  const spy = () => {
    const seen = { programs: 0, shaders: [], uploads: [] };
    const gl = new Proxy({}, { get: (o, k) => {
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation' || k === 'getAttribLocation') return () => ({});
      if (k === 'createProgram') return () => { seen.programs++; return {}; };
      if (k === 'createShader') return () => ({});
      if (k === 'shaderSource') return (sh, src) => { seen.shaders.push(src); };
      if (k === 'createBuffer' || k === 'createVertexArray') return () => ({});
      if (k === 'bufferData') return (target, data) => { seen.uploads.push(data.length); };
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;   // GL enums
      return () => {};
    } });
    return { gl, seen };
  };

  const classic = spy();
  const cp = new PrecipitationRenderer(classic.gl);
  assert.equal(classic.seen.programs, 1, 'the classic lane compiles ONE program - the lab\u2019s is not its to build');
  assert.equal(cp.labProgram, null, 'and holds no lab program');
  assert.ok(!classic.seen.shaders.some((src) => src.includes('uWindV')), 'none of the lab\u2019s stages were compiled');
  // 1000 particles: 1000 * 4 verts * 5 floats, and 1000 * 6 indices
  assert.deepEqual(classic.seen.uploads.sort((a, b) => a - b), [6000, 20000],
    'the classic buffers are sized for DFU\u2019s cap, not for the lab\u2019s 26,000');

  const enhanced = spy();
  const ep = new PrecipitationRenderer(enhanced.gl, { enhanced: true, countCap: 4000 });
  assert.equal(enhanced.seen.programs, 2, 'the enhanced lane builds the lab\u2019s program in the CONSTRUCTOR - a shader fault stays a constructor fault');
  assert.ok(ep.labProgram, 'and keeps it');
  assert.ok(enhanced.seen.uploads.includes(LAB_COUNTS.rain * 4),
    'with the lab\u2019s own 26,000 instances - the enhanced look is unchanged');
  assert.equal(ep.enhanced, true, 'the lane opens enhanced');
  assert.equal(ep.countCap, 4000, 'and ?rain=<n> arrives at construction, not per frame');

  // a renderer built classic that is handed the deck still draws the
  // lab's rain - it builds the program on demand rather than throwing
  const late = spy();
  const lp = new PrecipitationRenderer(late.gl);
  assert.equal(late.seen.programs, 1);
  lp.enhanced = true;
  lp.draw('rain', new Float32Array(16), new Float32Array(16), new Float32Array(3), new Float32Array(3), 1);
  assert.equal(late.seen.programs, 2, 'the lab\u2019s program is built on first use');
  assert.ok(late.seen.uploads.includes(LAB_COUNTS.rain * 4));
});

