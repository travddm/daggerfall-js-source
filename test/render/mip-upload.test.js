// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../../src/render/renderer.js';
import { _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { _resetForTests as resetPrefs, setPref } from '../../src/systems/uiPrefs.js';
import { applyMipQuality, forgetTrackedMips, mipQuality, trackMips } from '../../src/render/mip-upload.ts';
import { refreshWorldSamplingOnChange, worldSamplingKey } from '../../src/render/live-world-sampling.ts';
import { stateGl } from '../retroGl.mjs';

const picture = (size) => ({ width: size, height: size, colors: new Uint8ClampedArray(size * size * 4).fill(180) });
const named = (calls, name) => calls.filter((c) => c[0] === name);

function fresh(quality) {
  resetSettings();
  resetPrefs();
  setPref('mipQuality', quality);
  const { canvas, calls } = stateGl();
  const renderer = new Renderer(canvas);
  calls.length = 0;
  return { renderer, calls };
}

test('Sharp uploads every level of a world texture by hand and never asks the driver for a chain', () => {
  const { renderer, calls } = fresh('sharp');
  renderer.uploadTexture(7, 0, picture(8));
  const levels = named(calls, 'texImage2D').map((c) => c[2]);
  assert.deepEqual(levels, [0, 1, 2, 3], '8 x 8 down to 1 x 1');
  assert.deepEqual(named(calls, 'texImage2D').map((c) => c[4]), [8, 4, 2, 1], 'each level half the one above');
  assert.equal(named(calls, 'generateMipmap').length, 0);
});

test('Standard hands the chain to the driver, as before', () => {
  const { renderer, calls } = fresh('standard');
  renderer.uploadTexture(7, 0, picture(8));
  assert.deepEqual(named(calls, 'texImage2D').map((c) => c[2]), [0]);
  assert.equal(named(calls, 'generateMipmap').length, 1);
});

test('a ground array under Sharp has every level allocated and every layer uploaded to every level', () => {
  const { renderer, calls } = fresh('sharp');
  renderer.uploadTileArray(302, [picture(4), picture(4), picture(4)]);
  assert.deepEqual(named(calls, 'texImage3D').map((c) => c[2]), [0, 1, 2], '4 x 4, 2 x 2, 1 x 1');
  assert.equal(named(calls, 'texSubImage3D').length, 3 * 3, 'three layers, three levels');
  assert.equal(named(calls, 'generateMipmap').length, 0);
});

test('a change of the row is a change of the sampling key, and the renderer is told to rebuild its chains', () => {
  resetSettings();
  resetPrefs();
  setPref('mipQuality', 'sharp');
  const rebuilt = [];
  const renderer = { textures: new Map(), emissionTextures: new Map(), tileArrays: new Map(), gl: { TEXTURE1: 1 }, _worldHit() {}, applyGroundSharpness() {}, applyMipQuality: () => rebuilt.push(mipQuality()) };
  const sharpKey = worldSamplingKey();
  refreshWorldSamplingOnChange(renderer);
  setPref('mipQuality', 'standard');
  assert.notEqual(worldSamplingKey(), sharpKey);
  refreshWorldSamplingOnChange(renderer);
  refreshWorldSamplingOnChange(renderer);
  assert.deepEqual(rebuilt, ['standard'], 'once, on the frame after the change');
});

/** A context that holds one 4 x 4 texture whose level 0 is a known stripe, and records what is uploaded to its levels. */
function readableGl() {
  const level0 = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) level0.set(i % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4);
  const log = [];
  const gl = {
    TEXTURE_2D: 1, TEXTURE_2D_ARRAY: 2, RGBA: 3, UNSIGNED_BYTE: 4, FRAMEBUFFER: 5, FRAMEBUFFER_BINDING: 6, COLOR_ATTACHMENT0: 7,
    createFramebuffer: () => ({}), deleteFramebuffer() {}, bindFramebuffer() {}, bindTexture() {}, framebufferTexture2D() {}, framebufferTextureLayer() {},
    getParameter: () => null, isTexture: () => true,
    readPixels: (x, y, w, h, f, t, out) => out.set(level0),
    generateMipmap: (target) => log.push(['generateMipmap', target]),
    texSubImage2D: (t, level, x, y, w, h, f, ty, data) => log.push(['texSubImage2D', level, w, h, data]),
  };
  return { gl, log };
}

test('switching to Sharp rebuilds a remembered texture from the level 0 read back from the GPU; switching to Standard asks the driver', () => {
  const { gl, log } = readableGl();
  forgetTrackedMips();
  const texture = {};
  trackMips(texture, gl.TEXTURE_2D, 4, 4, 1, { wrapX: false, wrapY: false });
  applyMipQuality(gl, 'sharp');
  const subs = log.filter((c) => c[0] === 'texSubImage2D');
  assert.deepEqual(subs.map((c) => [c[1], c[2], c[3]]), [[1, 2, 2], [2, 1, 1]]);
  assert.ok(subs[1][4][0] > 150 && subs[1][4][0] < 220, 'a black and white stripe averages to light grey in linear light');
  log.length = 0;
  applyMipQuality(gl, 'standard');
  assert.deepEqual(log, [['generateMipmap', gl.TEXTURE_2D]]);
});
