// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARP,
  SHARP_TEXEL_GLSL,
  sharpTexelCoordinate,
  sharpenWorldFs,
  worldSampleCount,
} from '../../src/render/sharp-texels.ts';
import {
  worldFilterFor,
  spriteFilterScale,
  qualityAnisotropyFor,
  POINT,
} from '../../src/render/world-texture-filter.ts';
import { Renderer } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import {
  defaultOf,
  getString,
  setValue,
  _resetForTests as resetSettings,
} from '../../src/systems/settings/settings.js';
import { enumWords } from '../../src/ui/settings/settingsLaw.js';
import { CLASSIC_RENDERING_VIDEO } from '../../src/systems/classic-rendering-preset.ts';
import { glslFunctions } from '../glsl.mjs';
import { E, stateGl } from '../retroGl.mjs';

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('the coordinate: a texel centre inside the texel, a one-pixel ramp across its edge, unchanged when minified', () => {
  assert.ok(close(sharpTexelCoordinate(3.3, 0.1), 3.5), 'well inside texel 3: its centre');
  assert.ok(close(sharpTexelCoordinate(3.9, 0.1), 3.5), 'near its far edge, still its centre');
  assert.ok(close(sharpTexelCoordinate(4.02, 0.1), 4.2), 'within half a pixel past the edge: ramping into texel 4');
  assert.ok(close(sharpTexelCoordinate(3.98, 0.1), 3.8), '...and before it');
  for (const t of [3.3, 3.77, 4.02])
    assert.ok(close(sharpTexelCoordinate(t, 2), t), `${t}: a texel under a pixel is left alone`);
  assert.ok(close(sharpTexelCoordinate(3.3, 0), 3.5), 'no footprint at all: the centre, no division by zero');
});

test("the shader's sharpTexel is the same arithmetic", () => {
  const fns = glslFunctions(SHARP_TEXEL_GLSL, { textureSize: () => [64, 64], textureGrad: (s, p) => p });
  for (const [t, fw] of [
    [3.3, 0.1],
    [4.02, 0.1],
    [3.98, 0.1],
    [3.77, 2],
    [3.3, 0],
  ]) {
    const out = fns.sharpTexel([t, t], [fw, fw]);
    assert.ok(close(out[0], sharpTexelCoordinate(t, fw)) && close(out[1], sharpTexelCoordinate(t, fw)), `${t}, ${fw}`);
  }
});

test('the rewrite: every world-art sample, the helpers once after the precisions, the array overload only where declared', () => {
  const mesh = `#version 300 es\nprecision highp float;\nuniform sampler2D uTex;\nuniform sampler2D uEmissionTex;\nin vec2 vUV;\nout vec4 o;\nvoid main() {\n  vec4 a = texture(uTex, vUV);\n  vec3 e = texture(uEmissionTex, vUV).rgb;\n  vec4 probe = texture(uTex, vUV + vec2(0.01));\n  o = a + vec4(e, 0.0) + probe;\n}\n`;
  const sharp = sharpenWorldFs(mesh);
  assert.equal(worldSampleCount(mesh), 2);
  assert.equal(worldSampleCount(sharp), 0, 'no plain world-art sample left');
  assert.equal(sharp.split('sharpTex(uTex, vUV, dFdx(vUV), dFdy(vUV))').length - 1, 1);
  assert.equal(sharp.split('sharpTex(uEmissionTex, vUV,').length - 1, 1);
  assert.ok(sharp.includes('texture(uTex, vUV + vec2(0.01))'), 'an offset probe is not world art and stays as it is');
  assert.ok(sharp.indexOf('vec2 sharpTexel(') > sharp.indexOf('precision highp float;'), 'after the precision');
  assert.ok(!sharp.includes('sampler2DArray'), 'no array overload in a shader without the array precision');
  assert.equal(sharpenWorldFs(sharp), sharp, 'rewriting twice changes nothing');
  const ground = `#version 300 es\nprecision highp float;\nprecision highp sampler2DArray;\nuniform sampler2DArray uTileArr;\nvoid main() { vec4 c = textureGrad(uTileArr, vec3(0.5, 0.5, 1.0), vec2(0.0), vec2(0.0)); }\n`;
  const sharpGround = sharpenWorldFs(ground);
  assert.ok(sharpGround.includes('sharpGrad(uTileArr, vec3('), 'the ground samples through the array overload');
  assert.ok(
    sharpGround.indexOf('vec4 sharpGrad(sampler2DArray') > sharpGround.indexOf('precision highp sampler2DArray;'),
  );
});

test("Sharp's samplers: trilinear on mip-mapped world art, nearest and scale 1 on the sprites, the level's anisotropy", () => {
  assert.deepEqual(worldFilterFor(E, SHARP, true), { min: E.LINEAR_MIPMAP_LINEAR, mag: E.LINEAR });
  assert.deepEqual(worldFilterFor(E, SHARP, false), { min: E.NEAREST, mag: E.NEAREST });
  assert.equal(qualityAnisotropyFor(5, SHARP, 16), 9, 'Fantastic forces 9x: the sampler is linear, so ANGLE keeps it');
  resetSettings();
  try {
    assert.equal(getString('Video', 'MainFilterMode'), '3', "the port's default is Sharp");
    assert.equal(defaultOf('Video', 'MainFilterMode'), '3');
    assert.equal(spriteFilterScale(), 1, 'the weapon at its own size under Sharp');
    assert.deepEqual(enumWords('Video/MainFilterMode'), ['Point', 'Bilinear', 'Trilinear', 'Sharp']);
    assert.deepEqual(
      enumWords('GUI/VideoFilterMode'),
      ['Point', 'Bilinear', 'Trilinear'],
      'Sharp is the world filter only',
    );
    assert.equal(CLASSIC_RENDERING_VIDEO['Video/MainFilterMode'], String(POINT), 'the Classic preset sets Point');
  } finally {
    resetSettings();
  }
});

/** The fragment shaders a renderer compiled, from the fake GL's record. */
const compiledFragments = (calls) =>
  calls
    .filter(
      (c) => c[0] === 'shaderSource' && /out\s+vec4|gl_FragColor|fragColor/.test(c[2]) && c[2].includes('precision'),
    )
    .map((c) => c[2]);

test('the world sets follow the filter: Sharp by default, plain after a switch to Point, on both lanes, with no reload', () => {
  resetSettings();
  const { canvas, calls } = stateGl();
  try {
    const r = new Renderer(canvas);
    const sharpSources = compiledFragments(calls).filter((fs) => fs.includes('vec2 sharpTexel('));
    assert.ok(
      sharpSources.length >= 5,
      `the classic set's mesh, character, flat, ground and decal programs (${sharpSources.length})`,
    );
    for (const fs of sharpSources)
      assert.equal(worldSampleCount(fs), 0, 'no plain world-art sample in a Sharp program');
    assert.equal(r._worldSet.sharp, true);
    r.setLightingLane(EL_LANE);
    assert.equal(r._worldSet.sharp, true, 'the lighting lane is built Sharp too');
    calls.length = 0;
    setValue('Video', 'MainFilterMode', String(POINT));
    assert.equal(r._worldSet.sharp, false, 'a switch to Point installs the plain lane set at once');
    assert.ok(
      compiledFragments(calls).every((fs) => !fs.includes('vec2 sharpTexel(')),
      'its programs are plain',
    );
    r.setLightingLane(null);
    assert.equal(r._worldSet.sharp, false, 'and the classic set too');
    calls.length = 0;
    setValue('Video', 'MainFilterMode', String(SHARP));
    assert.equal(r._worldSet.sharp, true, 'back to Sharp');
    assert.equal(compiledFragments(calls).length, 0, 'the Sharp set was kept: switching back compiles nothing');
  } finally {
    resetSettings();
  }
});
