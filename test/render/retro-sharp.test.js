// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARP_TEXEL_GLSL, sharpTexelCoordinate } from '../../src/render/sharp-texels.ts';
import { RETRO_MIP_BIAS, applyRetroSharp, setRetroMipBias } from '../../src/render/retro-sharp.ts';
import { setFrameTarget } from '../../src/render/renderTarget.js';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { glslFunctions } from '../glsl.mjs';
import { stateGl, retroCfg } from '../retroGl.mjs';

const close = (a, b) => Math.abs(a - b) < 1e-6;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const LIGHT = new Float32Array([0.3, 0.8, -0.2]);
const SIZE = 64;
const RETRO_FRAME = { kind: 'retro' };

/** The shader's sharpTex under the given uniform: the coordinate it samples at, in texels, and the x gradient it hands
 *  the sampler, in uv. */
function sampleWith(sharpRetro, texel, gradientTexels) {
  const fns = glslFunctions(SHARP_TEXEL_GLSL, {
    uSharpRetro: sharpRetro,
    textureSize: () => [SIZE, SIZE],
    textureGrad: (sampler, uv, gx) => [uv[0] * SIZE, uv[1] * SIZE, gx[0], gx[1]],
  });
  const gradient = gradientTexels / SIZE;
  const out = fns.sharpTex('s', [texel / SIZE, texel / SIZE], [gradient, 0], [0, gradient]);
  return { at: out[0], gradientX: out[2] };
}

test('the full-size frame: the same coordinate and gradients as before the retro values', () => {
  for (const [texel, footprint] of [
    [3.3, 0.1],
    [4.02, 0.1],
    [3.77, 2],
  ]) {
    const sample = sampleWith([0, 0], texel, footprint);
    assert.ok(close(sample.at, sharpTexelCoordinate(texel, footprint)), `${texel}, ${footprint}`);
    assert.ok(close(sample.gradientX, footprint / SIZE), 'the gradients unscaled');
  }
});

test('the retro edge drop: every coordinate at its texel centre, as Point samples, near and far', () => {
  for (const [texel, footprint] of [
    [4.02, 0.1],
    [3.98, 0.1],
    [3.3, 0.5],
    [3.77, 2],
    [9.1, 6],
  ]) {
    const sample = sampleWith([1, 0], texel, footprint);
    assert.ok(close(sample.at, Math.floor(texel) + 0.5), `${texel} at a footprint of ${footprint}: ${sample.at}`);
  }
});

test('the retro mip bias scales the gradients by two to its power; the snap does not move with it', () => {
  const plain = sampleWith([1, 0], 3.3, 4);
  const biased = sampleWith([1, -1], 3.3, 4);
  assert.ok(close(biased.gradientX, plain.gradientX / 2), 'one level towards the detailed mips');
  assert.ok(close(biased.at, plain.at));
});

test('the frame values: set for a retro frame, cleared for any other, and the stamp moved only by a change', () => {
  const renderer = { _frameStamp: 0 };
  applyRetroSharp(renderer, null);
  assert.deepEqual([...renderer._sharpRetro, renderer._frameStamp], [0, 0, 0], 'off is the starting state');
  applyRetroSharp(renderer, RETRO_FRAME);
  assert.deepEqual([...renderer._sharpRetro, renderer._frameStamp], [1, RETRO_MIP_BIAS, 1]);
  applyRetroSharp(renderer, RETRO_FRAME);
  assert.equal(renderer._frameStamp, 1, 'the same values: no new stamp');
  try {
    setRetroMipBias(-1.3);
    applyRetroSharp(renderer, RETRO_FRAME);
    assert.deepEqual([renderer._sharpRetro[1], renderer._frameStamp], [Math.fround(-1.3), 2]);
    applyRetroSharp(renderer, RETRO_FRAME);
    assert.equal(renderer._frameStamp, 2, 'a bias float32 cannot hold exactly still compares equal');
  } finally {
    setRetroMipBias(RETRO_MIP_BIAS);
  }
  applyRetroSharp(renderer, null);
  assert.deepEqual([...renderer._sharpRetro, renderer._frameStamp], [0, 0, 3]);
});

test('the renderer: a retro world frame uploads the values to the Sharp programs, a full-size frame clears them', () => {
  resetSettings();
  const { canvas } = stateGl();
  const renderer = new Renderer(canvas);
  let config = retroCfg();
  renderer.setRetroSource(() => config);
  const uploaded = (fog) => {
    renderer._uploadFog(fog);
    return fog.sharpRetro.p.values.uSharpRetro;
  };
  try {
    for (const name of ['_solidFog', '_bbFog', '_terrainFog', '_charFog'])
      assert.ok(renderer[name].sharpRetro, `${name}: the Sharp program declares the uniform`);
    renderer.beginFrame(IDENTITY, IDENTITY, LIGHT, WORLD_FRAME);
    assert.deepEqual(uploaded(renderer._terrainFog), [1, RETRO_MIP_BIAS]);
    assert.deepEqual(uploaded(renderer._solidFog), [1, RETRO_MIP_BIAS]);
    renderer.drawScreenQuad(null, { x: 0, y: 0, w: 1, h: 1 });
    config = null;
    renderer.beginFrame(IDENTITY, IDENTITY, LIGHT, WORLD_FRAME);
    assert.deepEqual(uploaded(renderer._terrainFog), [0, 0], 'retro off: the full-size values on the next frame');
  } finally {
    setFrameTarget(null);
    resetSettings();
  }
});
