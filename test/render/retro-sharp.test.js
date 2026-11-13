// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARP_TEXEL_GLSL, sharpTexelCoordinate } from '../../src/render/sharp-texels.ts';
import { applyRetroSharp, retroMipBias } from '../../src/render/retro-sharp.ts';
import {
  RETRO_MIP_BIAS_DEFAULT as RETRO_MIP_BIAS,
  RETRO_MIP_BIAS_PREF,
  RETRO_MIP_BIAS_ROW,
} from '../../src/systems/retro-mip-bias-row.ts';
import { featureTile } from '../../src/ui/enhanced/enhancedMenu.js';
import { setPref, resetPrefs } from '../../src/systems/uiPrefs.js';
import { setFrameTarget } from '../../src/render/renderTarget.js';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
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
    setPref(RETRO_MIP_BIAS_PREF, -1.3);
    applyRetroSharp(renderer, RETRO_FRAME);
    assert.deepEqual([renderer._sharpRetro[1], renderer._frameStamp], [Math.fround(-1.3), 2]);
    applyRetroSharp(renderer, RETRO_FRAME);
    assert.equal(renderer._frameStamp, 2, 'a bias float32 cannot hold exactly still compares equal');
  } finally {
    resetPrefs();
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

/** A fake document element: enough for the settings screen's tile builder. */
function fakeElement(tag) {
  const node = {
    tag,
    children: [],
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    attrs: {},
    append(...children) {
      for (const child of children) node.children.push(child);
    },
    setAttribute(name, value) {
      node.attrs[name] = value;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return node;
}

function findByClass(node, name, out = []) {
  if (typeof node.className === 'string' && node.className.split(/\s+/).includes(name)) out.push(node);
  for (const child of node.children ?? []) findByClass(child, name, out);
  return out;
}

/** The Retro Mip Bias row as the settings screen draws it: its segments, and the reason shown on it, if any. */
function drawnRow() {
  globalThis.document = {
    createElement: fakeElement,
    createTextNode: (text) => ({ textContent: text }),
    querySelectorAll: () => [],
  };
  try {
    const tile = featureTile(RETRO_MIP_BIAS_ROW);
    const segments = findByClass(tile, 'ft-segb');
    return {
      segments,
      reason: findByClass(tile, 'ft-tile-lock')[0]?.textContent ?? null,
      press: (label) => segments.find((b) => b.textContent === label).onclick({ stopPropagation() {} }),
    };
  } finally {
    delete globalThis.document;
  }
}

test('the Retro Mip Bias row: a press on the drawn row is the bias the next retro frame takes, from 0 to -2', () => {
  resetSettings();
  resetPrefs();
  setValue('Video', 'UseMipMapsInRetroMode', 'True');
  const renderer = { _frameStamp: 0 };
  try {
    const row = drawnRow();
    assert.deepEqual(
      row.segments.map((b) => b.textContent),
      ['0', '-0.25', '-0.5', '-0.75', '-1', '-1.25', '-1.5', '-1.75', '-2'],
    );
    assert.equal(row.reason, null, 'Retro Mip Maps on: no reason shown');
    assert.ok(
      row.segments.every((b) => !b.disabled),
      'and every segment takes a press',
    );
    assert.equal(row.segments.find((b) => b.attrs['aria-pressed'] === 'true').textContent, '-0.75', "DFU's value");
    for (const [label, bias] of [
      ['-1.25', -1.25],
      ['0', 0],
      ['-2', -2],
    ]) {
      drawnRow().press(label);
      applyRetroSharp(renderer, RETRO_FRAME);
      assert.deepEqual([...renderer._sharpRetro], [1, bias], label);
    }
  } finally {
    resetPrefs();
    resetSettings();
  }
});

test('the Retro Mip Bias row is drawn disabled, with its reason, while Retro Mip Maps is off', () => {
  resetSettings();
  resetPrefs();
  try {
    setValue('Video', 'UseMipMapsInRetroMode', 'False');
    const row = drawnRow();
    assert.equal(row.reason, 'Needs Retro Mip Maps on');
    assert.ok(
      row.segments.every((b) => b.disabled && b.title === 'Needs Retro Mip Maps on'),
      'no segment takes a press',
    );
    setValue('Video', 'UseMipMapsInRetroMode', 'True');
    assert.equal(drawnRow().reason, null, 'turned on: the row is live at once');
  } finally {
    resetSettings();
  }
});

test('a stored bias outside the row reads as the default', () => {
  try {
    for (const stored of [0.5, -3, 'sharp', null]) {
      setPref(RETRO_MIP_BIAS_PREF, stored);
      assert.equal(retroMipBias(), RETRO_MIP_BIAS, String(stored));
    }
    setPref(RETRO_MIP_BIAS_PREF, -1.5);
    assert.equal(retroMipBias(), -1.5);
  } finally {
    resetPrefs();
  }
});
