// WIND3 (Mac, 2026-09-14: "World space wisps that indicate the direction of wind and wind audio without being too
// loud or overbearing; tree and flora sprite movement with wind") - THE WIND SEEN AND HEARD, off ONE MAPPING.
// Three consumers arrive at once, so the wind→units mapping the hosts had written out three times (twice for the
// rain, once for the grass, the rain still on the fixed gust WIND1 had replaced) becomes one home, systems/
// windDrive.js, read once a frame; the wisps (render/windWisps.js), the loop (systems/wind/windAudio.js) and the flats'
// sway (renderer.js BB_VS) take its numbers with the rain and the grass. Each has its row on the Features home, the
// player's own online, and a kill door.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  windDrive, legacyGust, floraSwayOf, floraSwayOn, WIND_NONE, WIND_STEP_DT_MAX, LAB_WIND_RATE, WIND_SLIDER_MAX,
} from '../../src/systems/wind/windDrive.js';
import {
  WindWispsRenderer, wispCount, wispsOn, WISP_MAX, WISP_FLOOR, WISP_BOX, WISP_VS, WISP_FS, WISP_LOOK, WISP_GUST_DIV,
  WISP_CLOCK_PERIOD, WISP_WOBBLE_CYCLES, WISP_RATE_STEPS, wispClock,
} from '../../src/render/windWisps.js';
import { glslFunctions } from '../glsl.mjs';
import {
  createWindAudio, windGain, windPitchFor, windSoundOn, WIND_GAIN_MAX, WIND_SLEW_PER_S, WIND_GAIN_FLOOR, WIND_BED_KEY,
} from '../../src/systems/wind/windAudio.js';
import { SOUND } from '../../src/systems/soundClips.js';
import { AMBIENT_SOUNDS } from '../../src/systems/ambientEffects.js';
import { TALL_FLAT_HEIGHT } from '../../src/world/flatDistance.js';
import { labWindSlider } from '../../src/render/labGrass.js';
import { FEATURES } from '../../src/systems/features.js';
import { PREF_DEFAULTS, setPref } from '../../src/systems/uiPrefs.js';
import { setUiSkin, uiSkin } from '../../src/systems/uiSkin.js';
import { ONLINE_PLAYERS_OWN_PREFS } from '../../src/systems/online/onlineLane.js';
import { Renderer } from '../../src/render/renderer.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const rd = (p) => hostText(p);   // HOST-SPLIT 2: a host whole
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const SUNNY = [0.010, 0.004];   // enhancedSky.js's sunny row - the lab's 70

/** A WebGL2 just deep enough for the wisps: every call recorded, the constructor's checks answered. */
function stubGl() {
  const calls = [];
  const consts = { VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 8, TRIANGLES: 15, BLEND: 16, SRC_ALPHA: 17, ONE_MINUS_SRC_ALPHA: 18, CULL_FACE: 19 };
  let ids = 0;
  const gl = new Proxy({}, {
    get(_, k) {
      if (k in consts) return consts[k];
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, n) => n;
      if (k === 'createShader' || k === 'createProgram' || k === 'createBuffer' || k === 'createVertexArray') return () => ++ids;
      return (...args) => { calls.push([k, ...args]); };
    },
  });
  return { gl, calls };
}

test('WIND3 windDrive: the one mapping - the classic sky is nothing; a sunny row is the lab\'s 70, a real rate, a unit direction, WIND1\'s gust, and a travel that carries the gust over a clamped frame', () => {
  // no deck: off, and every unit 0 - nothing moves, blows or sounds
  for (const sky of [null, undefined, {}, { cloudShadow: null }]) {
    const d = windDrive(sky, 10, 0.016);
    assert.equal(d.on, false); assert.deepEqual(d.w, [0, 0]); assert.deepEqual(d.dir, [1, 0]);
    assert.equal(d.slider, 0); assert.equal(d.strength01, 0); assert.deepEqual(d.windV, [0, 0]); assert.deepEqual(d.step, [0, 0]);
  }
  assert.deepEqual({ ...WIND_NONE, w: [...WIND_NONE.w] }, { on: false, w: [0, 0], dir: [1, 0], slider: 0, strength01: 0, gust: 1, windV: [0, 0], step: [0, 0] });
  // the sunny deck, with the controller's own gust
  const sky = { cloudShadow: { wind: SUNNY }, gustAt: (t) => 1.25 + t * 0 };
  const d = windDrive(sky, 10, 0.016);
  assert.equal(d.on, true);
  assert.equal(d.slider, labWindSlider(SUNNY)); assert.ok(Math.abs(d.slider - 70) < 1, `the lab's 70: ${d.slider}`);
  assert.ok(near(d.strength01, d.slider / WIND_SLIDER_MAX));
  assert.ok(near(Math.hypot(...d.dir), 1) && near(d.dir[0] * SUNNY[1], d.dir[1] * SUNNY[0]), 'a unit vector along the row');
  assert.equal(d.gust, 1.25, "the controller's envelope (WIND1) - not the fixed stack");
  assert.ok(near(d.windV[0], d.dir[0] * d.slider * LAB_WIND_RATE) && near(d.windV[1], d.dir[1] * d.slider * LAB_WIND_RATE), 'uWindV is the rate WITHOUT the gust');
  assert.ok(Math.hypot(...d.windV) > 10, 'a real push, not a whisper');
  assert.ok(near(d.step[0], d.windV[0] * 1.25 * 0.016) && near(d.step[1], d.windV[1] * 1.25 * 0.016), 'the travel carries the gust and the frame');
  // a hitch integrates at most WIND_STEP_DT_MAX; a bad dt integrates nothing
  const hitch = windDrive(sky, 10, 0.4);
  assert.ok(near(hitch.step[0], d.windV[0] * 1.25 * WIND_STEP_DT_MAX));
  assert.deepEqual(windDrive(sky, 10, NaN).step, [0, 0]); assert.deepEqual(windDrive(sky, 10, -1).step, [0, 0]); assert.deepEqual(windDrive(sky, 10).step, [0, 0]);
  // no envelope on the controller (the mod's deck, a bare deck): WX1's stack, term for term
  const bare = windDrive({ cloudShadow: { wind: SUNNY } }, 3.3, 0.016);
  assert.equal(bare.gust, legacyGust(3.3));
  assert.ok(near(legacyGust(3.3), 0.72 + 0.20 * Math.sin(3.3 * 0.31) + 0.14 * Math.sin(3.3 * 0.83 + 1.7) + 0.10 * Math.sin(3.3 * 2.10 + 0.4)));
  // the thunder row is the slider's top and strength 1
  const storm = windDrive({ cloudShadow: { wind: [0.045, 0.016] } }, 0, 0.016);
  assert.equal(storm.slider, 200); assert.equal(storm.strength01, 1);
});

test('WIND3 floraSwayOf: the climate\'s flora lean - a tree whole, a bush six tenths - and nothing else moves', () => {
  assert.equal(floraSwayOf(504, 504, TALL_FLAT_HEIGHT), 1, 'a tree (TALL_FLAT_HEIGHT and up)');
  assert.equal(floraSwayOf(504, 504, 12), 1);
  assert.equal(floraSwayOf(504, 504, TALL_FLAT_HEIGHT - 0.01), 0.6, 'a bush');
  assert.equal(floraSwayOf(504, 504, 0.5), 0.6);
  for (const other of [182, 210, 253, 255, 267, 275]) assert.equal(floraSwayOf(other, 504, 12), 0, `archive ${other} stands still`);
  assert.equal(floraSwayOf(504, 505, 12), 0, 'another season\'s nature archive is not this climate\'s');
});

test('WIND3 wisps: the count follows the strength with a floor; the renderer compiles two stages, draws nothing without a deck, the floor in a calm, the whole field in a gale, and keeps its travel inside one box', () => {
  assert.equal(wispCount(0), Math.round(WISP_MAX * WISP_FLOOR), 'the floor keeps the direction readable in a calm');
  assert.equal(wispCount(1), WISP_MAX);
  assert.equal(wispCount(2), WISP_MAX); assert.equal(wispCount(-1), wispCount(0));
  let last = -1;
  for (let s = 0; s <= 1.0001; s += 0.05) { const c = wispCount(s); assert.ok(c >= last, 'monotonic'); last = c; }
  assert.ok(wispCount(0.35) > wispCount(0) && wispCount(0.35) < WISP_MAX, 'a sunny day sits between');
  // the ramp's shape (moved from wind5_swirls.test.js when WISPS-RETURN retired it): the floor to a breeze of 0.05, all
  // of them from 0.9, a smoothstep between - half the rest at its middle
  assert.equal(wispCount(0.05), wispCount(0));
  assert.equal(wispCount(0.9), WISP_MAX);
  assert.equal(wispCount(0.475), Math.round(WISP_MAX * (WISP_FLOOR + (1 - WISP_FLOOR) * 0.5)));
  // the shaders: the lab's wrap, a streak along the velocity, a life fade, the strength in both stages
  assert.match(WISP_VS, /p = mod\(p - uEye \+ uBox\*0\.5, uBox\) \+ uEye - uBox\*0\.5;/, 'the lab\'s wrap - a world position wrapped around the eye');
  assert.match(WISP_VS, /p \+= vec3\(uWindOff\.x, 0\.0, uWindOff\.y\) \* gust;/, 'PROTO-19: a distance already travelled, never wind x time');
  assert.match(WISP_VS, /vLife = sin\(fract\(uTime\*rate \+ seed\*7\.0\) \* 3\.14159\);/, 'the wisp\'s own clock');
  assert.match(WISP_VS, /p \+= vel \* \(aCorner\.y-0\.5\) \* len;/, 'stretched along the wind (WISPS-RETURN: WIND3\'s streak again, where WIND5 drew a flourish)');
  assert.match(WISP_FS, /a \*= vLife \* \(uAlpha\.x \+ uAlpha\.y \* uStrength\);/, 'never more than a breath (WEATHER2d: the look\'s alpha)');
  assert.deepEqual([...WISP_LOOK.alpha], [0.09, 0.11]); assert.deepEqual([...WISP_LOOK.color], [0.86, 0.89, 0.94]);   // DISC17-A: the alpha doubled (WIND3's 0.10, 0.12)
  assert.doesNotMatch(WISP_VS + WISP_FS, /uTime \* uWindV|uWindV \* uTime/, 'no wind x time anywhere');
  const { gl, calls } = stubGl();
  const r = new WindWispsRenderer(gl);
  assert.equal(calls.filter((c) => c[0] === 'compileShader').length, 2);
  assert.equal(calls.filter((c) => c[0] === 'vertexAttribDivisor').length, 1, 'instanced');
  const proj = new Float32Array(16).fill(0); proj[0] = proj[5] = proj[10] = proj[15] = 1;
  const view = new Float32Array(proj);
  calls.length = 0;
  r.draw(WIND_NONE, proj, view, new Float32Array([0, 0, 0]), 1);
  assert.equal(calls.filter((c) => c[0] === 'drawArraysInstanced').length, 0, 'no deck, no wisps');
  assert.equal(r.drawn, 0);
  const calm = { ...windDrive({ cloudShadow: { wind: [0.0001, 0] } }, 1, 0.016) };
  r.draw(calm, proj, view, new Float32Array([0, 0, 0]), 1);
  let dr = calls.filter((c) => c[0] === 'drawArraysInstanced');
  assert.equal(dr.length, 1); assert.equal(dr[0][4], wispCount(calm.strength01)); assert.ok(dr[0][4] >= Math.round(WISP_MAX * WISP_FLOOR));
  calls.length = 0;
  const gale = windDrive({ cloudShadow: { wind: [0.045, 0.016] }, gustAt: () => 1 }, 2, 0.016);
  r.draw(gale, proj, view, new Float32Array([5, 2, 9]), 2);
  dr = calls.filter((c) => c[0] === 'drawArraysInstanced');
  assert.equal(dr[0][4], WISP_MAX); assert.equal(r.drawn, WISP_MAX);
  const off = calls.find((c) => c[0] === 'uniform2fv' && c[1] === 'uWindOff');
  assert.ok(off && near(off[2][0], calm.step[0] + gale.step[0], 1e-5) && near(off[2][1], calm.step[1] + gale.step[1], 1e-5), 'the travel is the sum of the steps');
  assert.ok(calls.some((c) => c[0] === 'depthMask' && c[1] === false) && calls.some((c) => c[0] === 'depthMask' && c[1] === true), 'no depth write, put back');
  assert.ok(calls.some((c) => c[0] === 'blendFunc' && c[1] === 17 && c[2] === 18), 'alpha blended');
  // the travel wraps: a long walk down the wind stays inside [0, WISP_BOX x WISP_GUST_DIV)
  // (AUDIT 68 S17-wisp-wrap-gust: one box was no common period of the wisps' gusts)
  for (let i = 0; i < 100000; i++) r.advance([gale.windV[0] * 0.05, gale.windV[1] * 0.05]);
  const span = WISP_BOX * WISP_GUST_DIV;
  assert.ok(r.windOff[0] >= 0 && r.windOff[0] < span && r.windOff[1] >= 0 && r.windOff[1] < span, `bounded: ${r.windOff}`);
  r.advance([-3, -3]);
  assert.ok(r.windOff[0] >= 0 && r.windOff[1] >= 0, 'a backward step wraps up, never negative');
});

// AUDIT-VC7 (G6), moved here from wind5_swirls.test.js when WISPS-RETURN (2026-09-25) retired that suite with the
// flourish: the clock is the streak's as much as it was the flourish's (the wobble and the fade run on it).
const I16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** WISP_VS's own main() at one corner of one wisp: the world position (the view-projection the identity) and the life. */
function wispAt(x, y, { seed = 0.37, time = 12.3, fp32 = false } = {}) {
  const f = glslFunctions(WISP_VS, {
    uVP: I16, uEye: [0, 0, 0], uTime: time, uBox: 400, uStrength: 0.6, uWindV: [3, 4], uWindOff: [0, 0], uLen: [4, 2],
    aCorner: [x, y], aSeed: [5, 2, -7, seed],
  }, { fp32 });
  f.main();
  return { p: f.globals.gl_Position.slice(0, 3), vLife: f.globals.vLife };
}

test('WIND3 wisps\' clock WRAPS WHOLE (AUDIT-VC7 G6) - every rate whole cycles over its period, so the hosts\' seconds wrap without a seam; the renderer hands the wrapped clock and the wind x then z', () => {
  assert.ok(Number.isInteger(0.35 * WISP_CLOCK_PERIOD) && Number.isInteger((0.25 / WISP_RATE_STEPS) * WISP_CLOCK_PERIOD), 'every life\'s rate a whole number of lives a period');
  assert.ok(WISP_WOBBLE_CYCLES.every(Number.isInteger));
  assert.equal(wispClock(WISP_CLOCK_PERIOD * 216 + 12.5), 12.5);
  assert.equal(wispClock(-3), WISP_CLOCK_PERIOD - 3);
  // the shader at a wrapped clock is the shader at the whole one, for every wisp (float64: the arithmetic, not the GPU)
  for (const seed of [0.11, 0.37, 0.66, 0.92]) for (const T of [36000.3, 86400.77, 399.9, 400.1]) {
    const whole = wispAt(0.3, 0.6, { seed, time: T }), wrapped = wispAt(0.3, 0.6, { seed, time: wispClock(T) });
    const d = whole.p.map((v, i) => v - wrapped.p[i]);
    assert.ok(Math.hypot(...d) < 1e-6 && Math.abs(whole.vLife - wrapped.vLife) < 1e-6, `seed ${seed} at ${T} s`);
  }
  // ...and at the GPU's own precision the wrap is what keeps a day-long session's phase: the whole clock at a day's
  // seconds steps a life by a large share of a frame; the wrapped one holds it to the frame's own grain
  const truth = wispAt(0.5, 0.5, { seed: 0.37, time: 86400.77 }).vLife;
  const raw = Math.abs(wispAt(0.5, 0.5, { seed: 0.37, time: 86400.77, fp32: true }).vLife - truth);
  const kept = Math.abs(wispAt(0.5, 0.5, { seed: 0.37, time: wispClock(86400.77), fp32: true }).vLife - truth);
  assert.ok(kept < 1e-3 && kept < raw / 10, `a day in: ${raw.toExponential(2)} off unwrapped, ${kept.toExponential(2)} wrapped`);
  // the renderer hands the wrapped clock
  const { gl, calls } = stubGl();
  const w = new WindWispsRenderer(gl, WISP_LOOK), I = new Float32Array(I16);
  w.draw({ on: true, strength01: 1, windV: [5, -2], step: [0, 0] }, I, I, new Float32Array(3), 86400.77);
  assert.deepEqual(calls.find((c) => c[0] === 'uniform1f' && c[1] === 'uTime').slice(2), [wispClock(86400.77)]);
  assert.deepEqual(calls.find((c) => c[0] === 'uniform2f' && c[1] === 'uWindV').slice(2), [5, -2], 'the wind as it blows - x then z');
});

test('WIND3 wind loop: the gain never passes the ceiling, is nothing in a calm and the ceiling in a gale, breathes with the gust; the pitch rises with the wind; the driver slews, holds its one loop through the blow (FIELD-WIND1: the bed on the native loop), stops on the floor and on a modal frame', () => {
  assert.equal(windGain(0), 0); assert.equal(windGain(0.1), 0);
  assert.ok(near(windGain(1, 1), WIND_GAIN_MAX)); assert.ok(near(windGain(0.85, 1), WIND_GAIN_MAX));
  assert.ok(windGain(0.35, 1) > 0 && windGain(0.35, 1) < WIND_GAIN_MAX, 'a sunny day murmurs');
  assert.ok(windGain(0.5, 1.0) > windGain(0.5, 0.5), 'the gust is worth a fifth');
  for (let s = 0; s <= 1; s += 0.01) for (const g of [0, 0.5, 1, 1.2, 2, 10]) assert.ok(windGain(s, g) <= WIND_GAIN_MAX + 1e-12, `never above the ceiling: ${s} ${g}`);
  assert.ok(WIND_GAIN_MAX <= 0.2, "Mac's 'not too loud', as a number");
  assert.ok(windPitchFor(0) < windPitchFor(1) && windPitchFor(1) <= 1.1 && windPitchFor(0) >= 0.9);
  // the driver over a fake engine: the bed registered, one native loop (audio.loop's handle), its gain and pitch live
  const calls = [];
  const engine = {
    registerSamples: (key) => { calls.push(['register', key]); return true; },
    loop: (key, volume) => { calls.push(['loop', key, volume]); return { setVolume: (v) => calls.push(['volume', v]), setPitch: (p) => calls.push(['pitch', p]), stop: () => calls.push(['stop']) }; },
  };
  const loops = () => calls.filter((c) => c[0] === 'loop');
  const wa = createWindAudio(engine);
  const gale = windDrive({ cloudShadow: { wind: [0.045, 0.016] }, gustAt: () => 1 }, 0, 0.016);
  wa.update(gale, 1 / 60, true);
  assert.equal(loops().length, 1); assert.equal(loops()[0][1], WIND_BED_KEY);
  assert.ok(near(loops()[0][2], WIND_SLEW_PER_S / 60), 'the first tick is one slew step, not the target - no pop');
  assert.deepEqual(calls.at(-1), ['pitch', windPitchFor(1)]);
  for (let i = 0; i < 60 * 10; i++) wa.update(gale, 1 / 60, true);
  assert.ok(near(wa.gain, WIND_GAIN_MAX, 1e-9), 'and reaches the ceiling within seconds');
  assert.ok(calls.filter((c) => c[0] === 'volume').every((c) => c[1] <= WIND_GAIN_MAX + 1e-12));
  // the wind drops to a breeze: the same loop slews down, its pitch with it
  const breeze = windDrive({ cloudShadow: { wind: SUNNY }, gustAt: () => 1 }, 0, 0.016);
  wa.update(breeze, 1 / 60, true);
  assert.equal(loops().length, 1, 'the one loop - nothing swapped, nothing restarted');
  const down = calls.findLast((c) => c[0] === 'volume')[1];
  assert.ok(down < WIND_GAIN_MAX && down > windGain(breeze.strength01, 1), 'slewing down, not there yet');
  assert.deepEqual(calls.at(-1), ['pitch', windPitchFor(breeze.strength01)]);
  // the switch off: the gain winds down and the loop is stopped once on the floor, then nothing
  calls.length = 0;
  for (let i = 0; i < 60 * 10; i++) wa.update(breeze, 1 / 60, false);
  const stop = calls.findIndex((c) => c[0] === 'stop');
  assert.equal(calls.filter((c) => c[0] === 'stop').length, 1, 'stopped once, on the floor'); assert.equal(wa.gain, 0); assert.equal(wa.playing, false);
  assert.ok(calls.slice(0, stop).filter((c) => c[0] === 'volume').every((c) => c[1] >= WIND_GAIN_FLOOR), 'every tick before the stop was above the floor');
  assert.equal(calls.slice(stop + 1).length, 0, 'no calls after the stop');
  // the classic sky (no deck) never starts it; a modal frame stops it at once
  calls.length = 0;
  wa.update(WIND_NONE, 1 / 60, true); assert.equal(calls.length, 0);
  wa.update(gale, 1 / 60, true); assert.equal(loops().length, 1);
  wa.stop(); assert.deepEqual(calls.at(-1), ['stop']); assert.equal(wa.gain, 0);
  const n = calls.length;
  wa.stop(); assert.equal(calls.length, n, 'a second stop is silent');
});

test('WIND3 clips: the five wind records by name, the indices DFU draws as dungeon one-shots', () => {
  assert.equal(SOUND.AmbientWindMoan, 65); assert.equal(SOUND.AmbientWindMoanDeep, 66);
  assert.equal(SOUND.AmbientWindBlow1, 70); assert.equal(SOUND.AmbientWindBlow1a, 71); assert.equal(SOUND.AmbientWindBlow1b, 72);
  for (const i of [65, 66, 70, 71, 72]) assert.ok(AMBIENT_SOUNDS.dungeon.includes(i), `${i} is one of DFU's dungeon ambients`);
});

test('WIND3 rows and switches: three switches on the Features home (FT18: two rows - the wind, and Enhanced sounds), on by default, the player\'s own online; each switch is the enhanced skin, its pref, and its kill door', () => {
  // ES1: the wind's own row became the Enhanced sounds row - same place, same shape, the loot cues beside the loop.
  // FT18: the wisps and the sway are ONE row, `wind` - its bar is both, each its own part in the drawer; the sway is its
  // key and the wisps are declared in its `also`, so the three switches are still three keys, three defaults, three
  // online answers, each declared on a row.
  const wind = FEATURES.find((f) => f.id === 'wind');
  const sounds = FEATURES.find((f) => f.id === 'enhanced-sounds');
  const declared = [wind.control, wind.control.also.find((a) => a.key === 'windWisps'), sounds.control];
  assert.deepEqual(declared.map((c) => c?.key), ['floraSway', 'windWisps', 'soundEnhancements']);
  assert.deepEqual(wind.control.parts.map((pt) => pt.key), ['floraSway', 'windWisps'], 'each its own in the drawer');
  for (const r of [wind, sounds]) {
    assert.deepEqual(r.kinds, ['enhanced']);
    assert.equal(r.effect, 'Takes effect at once.'); assert.ok(r.note.length > 80);
  }
  for (const c of declared) {
    assert.equal(c.store, 'prefs'); assert.equal(c.initial, true); assert.equal(c.online, 'player');
    assert.equal(PREF_DEFAULTS[c.key], true, 'the shelf derives the default from the row (RF4)');
    assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes(c.key), 'the lane leaves it to the player (RF4)');
  }
  assert.equal(FEATURES.findIndex((f) => f.id === 'wind'), FEATURES.findIndex((f) => f.id === 'loot-rarity') + 1, 'after LR1, before the packs');
  const skin = uiSkin();
  const doors = [[wispsOn, 'windWisps', 'wisps'], [windSoundOn, 'soundEnhancements', 'windaudio'], [floraSwayOn, 'floraSway', 'sway']];
  try {
    for (const [on, key, door] of doors) {
      setUiSkin('enhanced'); setPref(key, true);
      assert.equal(on(''), true, `${key}: on by default on the enhanced skin`);
      assert.equal(on(`?${door}=off`), false, `${key}: the kill door`);
      assert.equal(on(`?${door}=on`), true);
      setPref(key, false); assert.equal(on(''), false, `${key}: the pref is the switch`);
      setPref(key, true); setUiSkin('classic'); assert.equal(on(''), false, `${key}: never on the classic skin`);
    }
  } finally { setUiSkin(skin); for (const [, key] of doors) setPref(key, PREF_DEFAULTS[key]); }
});

test('WIND3 the flats\' sway in the renderer: BB_VS declares the wind and the share, leans the crown by the square of the height with the grass\'s wave, and stands still at uSway 0; one wind upload a call, the share per batch', () => {
   
  // executed: the prototype's setFlatWind holds four numbers and clears to zero
  const bare = Object.create(Renderer.prototype);
  bare.setFlatWind([1.5, -2, 30, 1.1]);
  assert.deepEqual([...bare._flatWind], [1.5, -2, 30, 1.100000023841858]);
  bare.setFlatWind(null);
  assert.deepEqual([...bare._flatWind], [0, 0, 0, 0]);
  bare.setFlatWind([undefined, NaN, null, 2]);
  assert.deepEqual([...bare._flatWind], [0, 0, 0, 2], 'a bad number is 0, never NaN in the shader');
});

