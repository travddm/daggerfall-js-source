// AUDIT FAR-SEA1 - five lanes on the frozen branch (`01-Overview/audits/Audit-FAR-SEA1.md`).
// What they found and the fix pinned here: the fill shaded most of the screen's sea to show in a hundredth of it (P1);
// the ring's sea was not the water's - another body, the full sun, no glint - so a step stood at the grid's edge, worse
// than before wherever the edge stood inside the fog's ramp (L1, L2); the hole's buffer was built twice a crossing (P4).
// The seam is run on the shaders themselves (test/glsl.mjs): the water surface's whole fragment shader, composed through
// its blend, against the far ring's, at the streamed grid's edge.

import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glslFunctions } from '../glsl.mjs';
import { RING_SEA_GLSL, FLORA_GLSL } from '../../src/render/horizonHaze.js';
import { RING_HAZE_GLSL } from '../../src/render/hazeGlsl.js';   // BANTHA1: the jungle's haze over the ring (off here: uJungleHaze[1].x 0)
import {
  buildFarRingGrid, buildSeaFillIndices, seaFillCount, ringHeight,
  RING_HAZE_HOLD, RING_RIM_START, RING_RIM_END,
} from '../../src/render/farRing.js';
import { waterSurfaceFs, WATER_TINT, WATER_F0, SHORE_SOFTNESS, WATER_ABSORB } from '../../src/render/waterSurface.js';
import { CLOUD_SHADOW_GLSL, RING_CLOUD_GLSL } from '../../src/render/cloudShadow.js';
import { EL_FAR_RING_FS, EL_EXPOSURE } from '../../src/render/enhancedLighting.js';
import { WATER_DRAW_MASK_TABLE, packWaterMask } from '../../src/world/water/waterCorners.js';
import { TERRAIN_SIZE } from '../../src/world/terrain/terrainSampler.js';

const rd = (p) => readFileSync(p, 'utf8');
const SEA_Y = ringHeight(0);
const FS_W = waterSurfaceFs(CLOUD_SHADOW_GLSL);
// the lane's ring without its eye's texture and its dither (a byte of noise): the sea is summed in the water's space
const LANE_FS = EL_FAR_RING_FS.replace('float ex = uELExposure * elAdapt();', 'float ex = uELExposure;')
  .replace(/outColor = vec4\(col \+ \(bayer4\(gl_FragCoord\.xy\) - [0-9.]+\) \/ 255\.0, 1\.0\);/, 'outColor = vec4(col, 1.0);');
const mask = packWaterMask(WATER_DRAW_MASK_TABLE), WORDS = [];
for (let i = 0; i < 8; i++) WORDS.push([mask[i * 4], mask[i * 4 + 1], mask[i * 4 + 2], mask[i * 4 + 3]]);

/** The streamed open sea's final pixel (Iliac Puddle No More's sheet, drawn by the water's program - the sea at the grid's
 *  edge), composed through its SRC_ALPHA blend over the ground the world's fog closed, `d` ahead of an eye `h` up. */
function water({ d, h, L, sky, fog, fogRange, texel, openColor }) {
  const wp = [0, SEA_Y + 0.03, d], cam = [0, SEA_Y + h, 0];
  const fw = Math.min(1, Math.max(0, (fogRange[1] - Math.hypot(d, h - 0.03)) / (fogRange[1] - fogRange[0])));
  const dst = fog.map((f) => f * fw + f * (1 - fw));
  const sample = (s) => (s === 'uSceneDepth' ? [1, 0, 0, 1] : s === 'uScene' ? [...dst, 1] : s === 'uRipple' ? [0.5, 0, 0, 1] : [...texel, 1]);
  const fns = glslFunctions(FS_W, {
    texelFetch: () => [0, 0, 0, 0], textureLod: sample, texture: sample, textureGrad: () => [0, 0, 0, 1],
    dFdx: (x) => (Array.isArray(x) ? x.map(() => 0.01) : 0.01), dFdy: (x) => (Array.isArray(x) ? x.map(() => 0.01) : 0.01),
    vWorldPos: wp, vLocalXZ: [10.5, 10.5], vDepth: 4, vGrow: 1,
    uTileSize: 6.4, uTileDim: 128, uWaterMask: WORDS, uOpen: 1, uOpenColor: openColor,
    uTime: 0, uWindDir: [0, 1], uWindStrength: 0, uSwell: 0, uRain: 0,
    uLightDir: L.dir, uAmbient: L.amb, uSunScale: L.sun, uSunColor: L.sunColor, uMoonDir: L.moonDir, uMoonScale: L.moon, uMoonColor: L.moonColor,
    uPointCount: 0, uPointLights: Array(16).fill([0, 0, 0, 1]), uPointColors: Array(16).fill([0, 0, 0]), uIndirect: [0, 0, 0, 0], uIndirectColor: [0, 0, 0],
    uSkyZenith: sky.z, uSkyHorizon: sky.h, uTint: WATER_TINT, uF0: WATER_F0, uShoreSoft: SHORE_SOFTNESS, uAbsorb: WATER_ABSORB,
    uSceneOn: 0, uSceneSize: [1920, 1080], uProj: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.0000667, -1, 0, 0, -0.4000133, 0],
    uRippleOn: 0, uRippleRect: [0, 0, 48], uCloudShadowRect: [0, 0, 0, 0],
    uFogColor: fog, uFogMode: 1, uFogDensity: 0, uFogRange: fogRange, uCamPos: cam, uFocus: [0, 0, 0, 0],
    uSeaHaze: [RING_HAZE_HOLD, SEA_Y], uDwFog: Array(5).fill([0, 0, 0, 0]), gl_FragCoord: [960, 540, 0.9999, 1],
  });
  fns.main();
  const o = fns.globals.outColor;
  return [0, 1, 2].map((i) => o[i] * o[3] + dst[i] * (1 - o[3]));
}

const DS_FOG = [119 / 255, 131 / 255, 183 / 255];   // Dynamic Skies' FogSunny day colour (7783B7), the screenshot's
const DS_SKY = { h: DS_FOG, z: [DS_FOG[0] * 0.55, DS_FOG[1] * 0.65, DS_FOG[2] * 0.85] };   // scenes/shared.js waterSky under the mod
const DAY = { dir: [0.3, 0.8, 0.52], amb: [0.9, 0.9, 0.9], sun: 0.54, sunColor: [1, 0.96, 0.88], moonDir: [0, 1, 0], moon: 0, moonColor: [0, 0, 0] };
const step = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))) * 255;

test('AUDIT FAR-SEA1 P1: the fill counted from the eye never leaves out a cell that can be past the far plane, and from a raised eye it is a corner\'s worth', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const holeRadius of [5, 6]) {
    const W = 200, H = 200, base = 100;
    const g = buildFarRingGrid({ heightBytes: new Uint8Array(W * H), mapWidth: W, mapHeight: H, climateAt: () => 231, baseX: base, baseY: base, radius: 12 });
    const hole = { baseX: base, baseY: base, radius: 12, holeX: base, holeY: base, holeRadius, sea: g.sea };
    const { indices, reach } = buildSeaFillIndices(hole);
    const side = 25, centre = [0.5 * TERRAIN_SIZE, 0.5 * TERRAIN_SIZE];
    const corner = (i0, k) => { const i = (i0 % side) + (k & 1), j = Math.floor(i0 / side) + (k >> 1); return [(i - 12 + 0.5) * TERRAIN_SIZE, -(j - 12 - 0.5) * TERRAIN_SIZE]; };
    for (let n = 0; n < 400; n++) {
      // an eye anywhere in its pixel, at any height a player or the travel view reaches
      const eye = [centre[0] + (rand() - 0.5) * TERRAIN_SIZE, SEA_Y + 0.5 + rand() * 5000, centre[1] + (rand() - 0.5) * TERRAIN_SIZE];
      const k = seaFillCount(reach, { far: 6000 * 0.99, h: eye[1] - SEA_Y, offset: Math.hypot(eye[0] - centre[0], eye[2] - centre[1]) });
      for (let c = k; c < reach.length; c++) {
        const i0 = indices[c * 6];
        for (let q = 0; q < 4; q++) {
          const [x, z] = corner(i0, q);
          assert.ok(Math.hypot(x - eye[0], SEA_Y - eye[1], z - eye[2]) <= 6000 * 0.99, `R${holeRadius}: a cell left out lies within the plane from every corner`);
        }
      }
    }
    const at300 = seaFillCount(reach, { far: 6000 * 0.99, h: 300, offset: 0 });
    assert.equal(at300, holeRadius === 5 ? 0 : 12, `R${holeRadius}: from 300 up at the pixel's centre, ${at300} of ${reach.length} cells`);
  }
  assert.equal(seaFillCount(new Float32Array([7000, 6000]), { far: 5940, h: -1, offset: 0 }), 0, 'an eye under the sea draws none');
});

