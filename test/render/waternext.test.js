// WATER-NEXT 2 and 3: THE SWELL, THE BODY, THE LOOK THROUGH IT, THE SHORE. The
// record: WATER-NEXT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SWELL_TRAINS, SWELL_G, SWELL_CALM, SWELL_GALE, SWELL_GLSL, swellAt, swellAmplitude, waterUniforms, waterSurfaceFs, WATER_SURFACE_VS,
  WATER_ABSORB, NO_BED_DEPTH, FOAM_DEPTH, WATER_SCENE_UNIT, WATER_SCENE_DEPTH_UNIT, WATER_RIPPLE_UNIT,
} from '../../src/render/waterSurface.js';
import { BB_SURFACE_UNIT, CLOUD_SHADOW_UNIT } from '../../src/render/renderer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('WATER-NEXT 2 the swell: three trains on the wind at deep water\'s own speed, none shorter than four of the sheet\'s cells; its height the wind\'s, calm to gale (mutants: a train turned off the wind; the dispersion; the gale)', () => {
  assert.equal(SWELL_TRAINS.length, 3);
  for (const [, len] of SWELL_TRAINS) assert.ok(len >= 4 * 6.4, `a ${len}-unit train rides a 6.4-unit grid without facets`);
  assert.ok(Math.abs(SWELL_TRAINS.reduce((s, t) => s + t[2], 0) - 1) < 1e-9, 'the shares sum to the whole height');
  assert.equal(SWELL_TRAINS[0][0], 0, 'the long train runs down the wind');
  assert.deepEqual([SWELL_CALM, SWELL_GALE], [0.05, 0.34], 'a calm pond breathes, a gale heaves - modest, as asked');
  assert.equal(swellAmplitude(0), SWELL_CALM);
  assert.equal(swellAmplitude(1), SWELL_GALE);
  assert.equal(swellAmplitude(5), SWELL_GALE, 'clamped');
  assert.equal(waterUniforms({ wind: null }).swell, SWELL_CALM, 'no wind known: a calm');
  assert.deepEqual(waterUniforms().absorb, WATER_ABSORB);
  // the height's slope is the slope the shader lights: the analytic gradient against a finite difference
  const wind = [0.6, 0.8], t = 3.7, a = 0.3, e = 1e-3;
  const [h, gx, gz] = swellAt(12.3, -40.1, t, wind, a);
  assert.ok(Math.abs(gx - (swellAt(12.3 + e, -40.1, t, wind, a)[0] - swellAt(12.3 - e, -40.1, t, wind, a)[0]) / (2 * e)) < 1e-6);
  assert.ok(Math.abs(gz - (swellAt(12.3, -40.1 + e, t, wind, a)[0] - swellAt(12.3, -40.1 - e, t, wind, a)[0]) / (2 * e)) < 1e-6);
  assert.ok(Math.abs(h) <= a + 1e-9, 'never past its own height');
  // a crest travels at omega / k down the wind
  const k = (2 * Math.PI) / SWELL_TRAINS[0][1], c = Math.sqrt(SWELL_G * k) / k;
  assert.ok(c > 8 && c < 9, `the long train runs ${c.toFixed(2)} units a second (deep water at 48 units)`);
});

test('WATER-NEXT 2 the GLSL is the JS: SWELL_GLSL carries each train\'s wavenumber, speed and share, signed constants bracketed (mutants: a train dropped; a constant off)', () => {
  for (const [ang, len, share] of SWELL_TRAINS) {
    const k = (2 * Math.PI) / len, w = Math.sqrt(SWELL_G * k);
    assert.ok(SWELL_GLSL.includes(`float ph = ${k.toFixed(6)} * dot(d, p) - ${w.toFixed(6)} * t; float a = amp * ${share.toFixed(4)};`));
    assert.ok(SWELL_GLSL.includes(`(${Math.cos(ang).toFixed(6)}) * wind.x - (${Math.sin(ang).toFixed(6)}) * wind.y`));
  }
  assert.doesNotMatch(SWELL_GLSL, /- -/, 'no doubled sign');
  assert.ok(WATER_SURFACE_VS.includes(SWELL_GLSL) && waterSurfaceFs('', '').includes(SWELL_GLSL), 'one field: the lift and the slope');
});

test('WATER-NEXT 2 the sheet: lifted by the swell, which dies over the bank (none on a bed shallower than nothing), whole on the open sea; its depth rides the swell (mutants: the swell on the bank; the open sea still)', () => {
  // the eye's distance, and the depth is the magnitude
  assert.match(WATER_SURFACE_VS, /float grow = uOpen == 1 \? 1\.0 : \(aDepth < 0\.0 \? 0\.0 : smoothstep\(1\.668, 4\.168, aDepth\)\);/);
  assert.match(WATER_SURFACE_VS, /vec3 sw = swellAt\(world\.xz, uTime, uWindDir, uSwell \* grow\);/);
  assert.match(WATER_SURFACE_VS, /float lift = sw\.x \* \(1\.0 - smoothstep\(300\.0, 600\.0, length\(world\.xz - uCamPos\.xz\)\)\);\s*\n\s*world\.y \+= lift;/);
  assert.match(WATER_SURFACE_VS, /vDepth = max\(abs\(aDepth\) \+ lift, 0\.0\);/);
});

test('WATER-NEXT 2 the look: the path through the water is the scene\'s depth behind the surface, never less than the bed\'s; the pushed look never takes what stands in front of the water; Beer-Lambert to the water\'s own lit colour; without a copy the blend makes the same sum (mutants: the occluder taken; the bed\'s floor dropped; the blend\'s alpha the shore\'s alone)', () => {
  const fs = waterSurfaceFs('', '');
  assert.match(fs, /precision highp int;/, 'an int uniform shared with the vertex stage agrees in precision (the probe\'s first boot)');
  assert.match(fs, /float eyeDepth\(float d\) \{ return uProj\[3\]\[2\] \/ \(\(d \* 2\.0 - 1\.0\) \+ uProj\[2\]\[2\]\); \}/);
  assert.match(fs, /path = max\(bedD - here, bedPath\);/);
  assert.match(fs, /if \(pushedD < here\) uv = uv0; else path = max\(pushedD - here, bedPath\);/);
  assert.match(fs, /vec3 T = exp\(-uAbsorb \* path\);\s*\n\s*under = textureLod\(uScene, uv, 0\.0\)\.rgb;[^\n]*\n\s*trans = T \* \(1\.0 - F\);\s*\n\s*own = lit \* \(vec3\(1\.0\) - T\) \* \(1\.0 - F\) \+ skyRefl \* F;/);
  assert.match(fs, /cover = 1\.0 - t \* \(1\.0 - F\);\s*\n\s*own = lit \* \(1\.0 - t\) \* \(1\.0 - F\) \+ skyRefl \* F;/);
  assert.ok(WATER_ABSORB[0] > WATER_ABSORB[1] && WATER_ABSORB[1] > WATER_ABSORB[2], 'red is swallowed first');
  assert.ok(NO_BED_DEPTH > FOAM_DEPTH * 2, 'a sheet with no bed is never a shore, even in a gale');
});

test('WATER-NEXT 3 the shore: foam over the shallow band the swell pushes up and down the bank, crests whitening only in a strong wind, foam opaque and unglinting (mutants: no run-up; crests in a calm; the foam see-through)', () => {
  const fs = waterSurfaceFs('', '');
  assert.match(fs, /float shore = 1\.0 - smoothstep\(0\.0, band, vdepth - sw\.x \* 2\.20\);/);
  assert.match(fs, /\* smoothstep\(0\.55, 0\.9, uWindStrength\);/, 'the crests need a wind');
  assert.match(fs, /edge = max\(edge, foam \* smoothstep\(0\.0, 0\.2, edge\)\);/);
  assert.match(fs, /float spec = seaSunLobe\(dot\(n, H\)\) \* uSunScale \* shadow \* \(1\.0 - foam\);/);
  assert.ok(fs.includes('float seaSunLobe(float nh) { return pow(max(nh, 0.0), 180.0); }'), 'the sun\'s lobe, 180');
});

test('WATER-NEXT 2 the copy: once a frame, before the first water draw, the lane\'s frame only, its units its own and rebound every draw; the open sea drawn by the same program over Deep Waters\' sheets from above (mutants: a copy a draw; the units shared; the sea\'s old top kept from above)', () => {
  const units = [WATER_SCENE_UNIT, WATER_SCENE_DEPTH_UNIT, WATER_RIPPLE_UNIT, CLOUD_SHADOW_UNIT];
  assert.equal(new Set(units).size, units.length, 'four units, four things');
  assert.ok(units.every((u) => u !== 0 && u !== 2), 'never the ground array\'s or the tilemap\'s');
  assert.ok(WATER_SCENE_DEPTH_UNIT === BB_SURFACE_UNIT, 'the billboards\' surface unit - both rebind before every draw that reads it');
  assert.match(waterSurfaceFs('', ''), /if \(uOpen == 1 && uSceneOn == 1\) edge \*= smoothstep\(0\.0, 0\.12, vdepth\);/, 'the sea\'s staircase edge gone where it covers no water');
});

