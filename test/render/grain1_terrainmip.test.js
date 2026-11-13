// GRAIN1 -
// THE DISTANT GROUND WAS UNFILTERED, AND THE REASON IT WAS UNFILTERED IS
// IN THE SHADER.
//
// The grain is minification aliasing: past a few tiles out a screen pixel
// covers many texels and NEAREST picks one, so the ground boils as the
// camera drifts. A mipmap is the only cure - and it could not be turned
// on while the shader sampled the WRAPPED coordinate, because `fract`
// jumps 1 -> 0 at every tile edge and the hardware picks its mip from the
// screen-space derivative of the coordinate it is handed. Those jumps
// read as "this pixel covers the whole texture", so every tile edge in
// every pixel would draw a line of the coarsest mip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waterSurfaceFs } from '../../src/render/waterSurface.js';
import { Renderer, groundSamplerFor, groundSharpnessTier } from '../../src/render/renderer.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** Every shader that samples the tile array, and the name of the
 *  continuous coordinate its footprint must come from. */
const SAMPLERS = [
  ['src/render/renderer.js', 'the classic terrain'],
  ['src/render/enhancedLighting.js', 'the enhanced terrain'],
];

test('GRAIN1: every tile-array sample takes its footprint from the UNWRAPPED coordinate, never the fract', () => {
  for (const [file, what] of SAMPLERS) {
    const s = read(file);
    assert.match(s, /vec2 gx = ROT\[t\] \* dFdx\(unwrapped\);\s*\n\s*vec2 gy = ROT\[t\] \* dFdy\(unwrapped\);/,
      `${what}: the gradient is the unwrapped one, rotated as the UV is`);
    assert.match(s, /textureGrad\(uTileArr, vec3\(tuv, float\(layer\)\), gx, gy\)/, `${what}: and it is handed to the sampler`);
    // the implicit-derivative spelling must be GONE, or the mipmap draws a
    // blurred line around all 16,384 tiles of every pixel
    assert.doesNotMatch(s, /texture\(uTileArr, vec3\(tuv, float\(layer\)\)\)/, `${what}: no implicit-derivative sample survives`);
  }
  // the water pass samples the same array, with the same wrap
  const fs = waterSurfaceFs('');
  assert.match(fs, /vec2 wgx = dFdx\(unwrapped\), wgy = dFdy\(unwrapped\);/, 'the water pass measures from the unwrapped coordinate too');
  // (an explicit LOD: no footprint at all), and the one footprinted read left is the puddle art's
  assert.match(fs, /textureGrad\(uTileArr, vec3\(puv, float\(rec\)\), PUDDLE_ROT\[turn\] \* wgx, PUDDLE_ROT\[turn\] \* wgy\)/, 'and hands it over');
  assert.doesNotMatch(fs, /texture\(uTileArr,/, 'no implicit-derivative read of the array');
  assert.doesNotMatch(fs, /texture\(uTileArr, vec3\(uv, 0\.0\)\)/, 'no implicit sample survives there either');
});

test("GRAIN2: Ground sharpness is the ground's minification, and its row the player's own online", async () => {
  const { FEATURE_PREF_DEFAULTS, FEATURES } = await import('../../src/systems/features.js');
  // and the row exists, with the safe default, as the player's own online
  assert.equal(FEATURE_PREF_DEFAULTS.groundSharpness, 'default');
  const row = FEATURES.find((f) => f.id === 'ground-sharpness');
  assert.ok(row, 'the Features row is there for the player to turn');
  assert.deepEqual(row.control.tiers.map(([k]) => k), ['off', 'default'], "nearest-mip or trilinear: its anisotropy is the Anisotropic Filtering row's");
  assert.equal(row.control.online, 'player', 'one player’s dial is not everyone’s');
  assert.match(row.effect, /at once/, 'the renderer re-applies the tier to the cached arrays on the next frame after a change (render/live-world-sampling.ts), as well as at every world load');
  assert.deepEqual([...row.kinds], ['enhanced', 'classic'], 'GRAIN AUDIT 1: both lanes sample the one array, so both lanes get the dial');
});

/** a GL that logs every call and answers enums with their own name (incident_dungeon_seams' rig) */
function recordingRenderer(log, { aniso = true, max = 16 } = {}) {
  const stub = new Proxy({}, {
    get: (o, k) => {
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation' || k === 'getAttribLocation') return () => ({});
      if (k === 'createTexture' || k === 'createBuffer' || k === 'createVertexArray'
        || k === 'createProgram' || k === 'createShader' || k === 'createFramebuffer') return () => ({});
      if (k === 'getParameter') return (p) => (p === 'MAX_TEXTURE_MAX_ANISOTROPY_EXT' ? max : new Float32Array([0, 0, 0, 0]));
      if (k === 'getExtension') return (name) => { log.push(['getExtension', name]); return name === 'EXT_texture_filter_anisotropic' ? (aniso ? { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 'MAX_TEXTURE_MAX_ANISOTROPY_EXT', TEXTURE_MAX_ANISOTROPY_EXT: 'TEXTURE_MAX_ANISOTROPY_EXT' } : null) : {}; };
      if (typeof k === 'string' && k.toUpperCase() === k) return k;
      return (...args) => { log.push([k, ...args]); };
    },
  });
  const canvas = { getContext: () => stub, clientWidth: 640, clientHeight: 400, width: 640, height: 400 };
  const r = new Renderer(canvas);
  log.length = 0;
  return r;
}
const calls = (log, name) => log.filter((c) => c[0] === name);
const layers = () => [{ width: 2, height: 2, colors: new Uint8ClampedArray(16) }, { width: 2, height: 2, colors: new Uint8ClampedArray(16) }];

test('GRAIN AUDIT 1: the tier is sampler state - EXECUTED: one chain per archive, nothing on a cached archive, the filter and the anisotropy by tier, and the dial LANDS on a world load', () => {
  assert.deepEqual(groundSamplerFor('off'), { aniso: 1, minFilter: 'NEAREST_MIPMAP_NEAREST' }, 'Off is the mipmap alone, point-sampled: ONE fetch, the pre-GRAIN1 cost with the boil gone');
  assert.deepEqual(groundSamplerFor('default', 8), { aniso: 8, minFilter: 'LINEAR_MIPMAP_LINEAR' }, 'the anisotropy is carried, not chosen: the Anisotropic Filtering row chooses it');
  assert.deepEqual(groundSamplerFor('max', 8), { aniso: 8, minFilter: 'LINEAR_MIPMAP_LINEAR' }, 'a stored Maximum from before is trilinear');
  assert.deepEqual(groundSamplerFor('nonsense', 4), { aniso: 4, minFilter: 'LINEAR_MIPMAP_LINEAR' }, 'a junk tier is trilinear');
  assert.equal(groundSharpnessTier('?ground=max'), 'max', 'the ?ground door names the tier');
  assert.equal(groundSharpnessTier('?x=1'), 'default', '...and without it the pref answers (a fresh shelf: the row\u2019s default)');
  const log = [];
  const r = recordingRenderer(log);
  r.uploadTileArray(302, layers());
  assert.equal(calls(log, 'generateMipmap').length, 1, 'one chain per archive');
  assert.ok(log.findIndex((c) => c[0] === 'texSubImage3D') < log.findIndex((c) => c[0] === 'generateMipmap'), 'built after the layers');
  const minOf = (l) => calls(l, 'texParameteri').filter((c) => c[2] === 'TEXTURE_MIN_FILTER').pop()?.[3];
  const anisoOf = (l) => calls(l, 'texParameterf').filter((c) => c[2] === 'TEXTURE_MAX_ANISOTROPY_EXT').pop()?.[3];
  assert.equal(minOf(log), 'LINEAR_MIPMAP_LINEAR', 'the default tier: trilinear'); assert.equal(anisoOf(log), 8, "...at the Anisotropic Filtering row's 8x (under Sharp, the default filter)");
  assert.equal(calls(log, 'texParameteri').find((c) => c[2] === 'TEXTURE_MAG_FILTER')[3], 'NEAREST');
  assert.equal(calls(log, 'getExtension').filter((c) => c[1] === 'EXT_texture_filter_anisotropic').length, 1, 'the extension asked once');
  log.length = 0;
  r.uploadTileArray(302, layers());
  assert.equal(log.length, 0, 'a cached archive costs NOTHING - no upload, no chain, no parameter (the cache is what makes this feature free per frame, and nothing had pinned it)');
  r.uploadTileArray(303, layers());
  assert.equal(calls(log, 'generateMipmap').length, 1, 'a second archive builds its own chain');
  assert.equal(calls(log, 'getExtension').length, 0, '...and asks for no extension again');
  // THE DIAL LANDS: the world load re-applies the tier over every cached array
  log.length = 0;
  r._tArrayTex = {};   // as if a terrain draw had bound an array this frame
  const s = r.applyGroundSharpness('off');
  assert.deepEqual(s, { aniso: 8, minFilter: 'NEAREST_MIPMAP_NEAREST' }, "Off sets the filter; the anisotropy stays the row's");
  assert.equal(calls(log, 'bindTexture').filter((c) => c[1] === 'TEXTURE_2D_ARRAY').length, 2, 'both cached arrays bound');
  assert.deepEqual(calls(log, 'texParameteri').filter((c) => c[2] === 'TEXTURE_MIN_FILTER').map((c) => c[3]), ['NEAREST_MIPMAP_NEAREST', 'NEAREST_MIPMAP_NEAREST'], 'Off: point-sampled over the chain, on BOTH');
  assert.deepEqual(calls(log, 'texParameterf').map((c) => c[3]), [8, 8], "and the row's anisotropy SET again on both, not skipped");
  assert.equal(calls(log, 'generateMipmap').length, 0, 'no chain rebuilt'); assert.equal(calls(log, 'texSubImage3D').length, 0, 'no upload');
  assert.equal(r.groundTier, 'off');
  assert.equal(r._tArrayTex, null, 'PERF-TEX2\u2019s array shadow is forgotten, so the next terrain draw binds its own');
  log.length = 0;
  r.applyGroundSharpness('max');
  assert.deepEqual(calls(log, 'texParameterf').map((c) => c[3]), [8, 8], "a stored Maximum: the row's anisotropy");
  assert.deepEqual(calls(log, 'texParameteri').filter((c) => c[2] === 'TEXTURE_MIN_FILTER').map((c) => c[3]), ['LINEAR_MIPMAP_LINEAR', 'LINEAR_MIPMAP_LINEAR']);
  // a driver WITHOUT the extension: asked once, remembered as false, never asked again, and the filter still set
  const log2 = [];
  const r2 = recordingRenderer(log2, { aniso: false });
  r2.uploadTileArray(302, layers()); r2.uploadTileArray(303, layers()); r2.applyGroundSharpness('max');
  assert.equal(calls(log2, 'getExtension').filter((c) => c[1] === 'EXT_texture_filter_anisotropic').length, 1, 'asked ONCE on a driver without it (the old ||= memo of null re-asked every archive)');
  assert.equal(calls(log2, 'texParameterf').length, 0, 'and no anisotropy call is made');
  assert.equal(r2._anisoExt, false);
  assert.deepEqual(calls(log2, 'texParameteri').filter((c) => c[2] === 'TEXTURE_MIN_FILTER').map((c) => c[3]).slice(-2), ['LINEAR_MIPMAP_LINEAR', 'LINEAR_MIPMAP_LINEAR'], 'the filter is still the tier\u2019s');
  // the hosts: both call the re-apply at their world load, AFTER the tile-array guard
  for (const host of ['src/scenes/groundSets.js', 'src/scenes/exterior.js']) {
    const h = read(host);
    const guard = Math.max(h.indexOf('if (!renderer.tileArrays.has(groundArchive)) {'), h.indexOf('if (!renderer.tileArrays.has(key)) {'));   // AUDIT PRECIP GROUND-2 (
    const apply = h.indexOf('renderer.applyGroundSharpness();', guard);
    assert.ok(guard > 0 && apply > guard && apply - guard < 1200, `${host}: the tier is re-applied right after the guard, cached or not`);
  }
});
