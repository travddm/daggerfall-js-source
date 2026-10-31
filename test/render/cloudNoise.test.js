// VC2 - THE CLOUD NOISE AND THE RENDER TARGET (2026-09-07). The
// volumetric cloud arc's first machinery: an offscreen target helper
// that obeys the upload law, and two tiling 3D noise volumes generated
// on the GPU. Node has no GL, so the shapes are pinned here and the
// pictures in tools/cloudNoiseProbe.mjs (10 checks on SwiftShader).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHAPE_SIZE, DETAIL_SIZE, NOISE_GLSL, SHAPE_FS, DETAIL_FS, SLICE_FS, NOISE_VS } from '../../src/render/cloudNoise.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('VC2: the noise volumes - sizes, a shared block with no uniform, every lattice taken modulo its period', () => {
  assert.equal(SHAPE_SIZE, 128); assert.equal(DETAIL_SIZE, 32);
  assert.doesNotMatch(NOISE_GLSL, /uniform/, 'the shared block declares no uniform - the AUDIT 47 sweep reads each template alone');
  assert.match(NOISE_GLSL, /hash33\(mod\(pi \+ c, period\)\)/, 'the gradient lattice wraps at its period');
  assert.match(NOISE_GLSL, /hash33\(mod\(qi \+ o, cells\)\)/, 'the Worley cells wrap at their count');
  assert.match(SHAPE_FS, /vec3 p = vec3\(gl_FragCoord\.xy \/ uSize, uZ\);/, 'a layer samples texel centres in [0,1)^3');
  assert.match(SHAPE_FS, /outColor = vec4\(pw, worleyFbm\(p, 8\.0\), worleyFbm\(p, 16\.0\), worleyFbm\(p, 32\.0\)\);/, 'R Perlin-Worley, G/B/A Worley at 8/16/32');
  assert.match(SHAPE_FS, /remap\(perlin, 0\.0, 1\.0, w4, 1\.0\)/, 'the Perlin-Worley dilates the billows by the low-frequency cells');
  assert.match(DETAIL_FS, /outColor = vec4\(worleyFbm\(p, 4\.0\), worleyFbm\(p, 8\.0\), worleyFbm\(p, 16\.0\), 1\.0\);/, 'the detail volume: Worley at 4/8/16');
  for (const t of [SHAPE_FS, DETAIL_FS, SLICE_FS, NOISE_VS]) assert.ok(t.startsWith('#version 300 es'), 'every template is a whole compilation unit');
  assert.match(SLICE_FS, /texture\(uVolume, vec3\(vUV \* uTiles, uZ\)\)/, 'the viewer tiles the volume so a seam would show');
});

