// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
// The surfaces with a texture of their own that follow the world texture filter through the world programs: the body
// parts and held items (the character program), the tree atlases (the billboard program), and the meadow's atlas. The seabed decorations'
// own program is tested beside its pass's other tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFrameTarget } from '../../src/render/renderTarget.js';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { MEADOW_TEXEL_GLSL, bindGrassSheet, uploadGrassSheet } from '../../src/render/grass-sheets.ts';
import { glslFunctions } from '../glsl.mjs';
import { E, stateGl } from '../retroGl.mjs';

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const LIGHT = new Float32Array([0.3, 0.8, -0.2]);
const filtersOf = (texture) => [texture.params[E.TEXTURE_MIN_FILTER], texture.params[E.TEXTURE_MAG_FILTER]];
const SHARP_FILTERS = [E.LINEAR_MIPMAP_LINEAR, E.LINEAR];
const POINT_FILTERS = [E.NEAREST_MIPMAP_NEAREST, E.NEAREST];
const near = (a, b) => Math.abs(a - b) < 1e-6;

test("a body part or held item takes the world filter and follows a change at its next draw; a spell effect's texture keeps nearest", () => {
  resetSettings();
  const { canvas } = stateGl();
  const renderer = new Renderer(canvas);
  const mips = [
    { width: 2, height: 2, rgba: new Uint8Array(16) },
    { width: 1, height: 1, rgba: new Uint8Array(4) },
  ];
  try {
    const part = renderer.createCharacterTexture(mips);
    const effect = renderer.createCharacterTexture(mips, { effect: true });
    assert.deepEqual(filtersOf(part), SHARP_FILTERS);
    assert.deepEqual(filtersOf(effect), [E.NEAREST_MIPMAP_LINEAR, E.NEAREST]);
    setValue('Video', 'MainFilterMode', '0');
    renderer.beginFrame(IDENTITY, IDENTITY, LIGHT, WORLD_FRAME);
    renderer.drawCharacter({ vao: {}, count: 3, ranges: [{ tex: part, first: 0, count: 3 }] }, IDENTITY);
    assert.deepEqual(filtersOf(part), POINT_FILTERS, 'Point at the draw that binds it');
    assert.deepEqual(filtersOf(effect), [E.NEAREST_MIPMAP_LINEAR, E.NEAREST], 'the effect untouched');
  } finally {
    setFrameTarget(null);
    resetSettings();
  }
});

test('a tree atlas takes the world filter and is refiltered on the frame after a change', () => {
  resetSettings();
  const { canvas } = stateGl();
  const renderer = new Renderer(canvas);
  try {
    const atlas = renderer.createAtlasTexture(8, 8, 4);
    assert.deepEqual(filtersOf(atlas), SHARP_FILTERS);
    renderer.beginFrame(IDENTITY, IDENTITY, LIGHT, WORLD_FRAME);
    setValue('Video', 'MainFilterMode', '0');
    renderer.beginFrame(IDENTITY, IDENTITY, LIGHT, WORLD_FRAME);
    assert.deepEqual(filtersOf(atlas), POINT_FILTERS, 'Point: nearest, as the trees mod samples it');
    setValue('Video', 'MainFilterMode', '2');
    renderer.beginFrame(IDENTITY, IDENTITY, LIGHT, WORLD_FRAME);
    assert.deepEqual(filtersOf(atlas), SHARP_FILTERS, 'Trilinear');
  } finally {
    setFrameTarget(null);
    resetSettings();
  }
});

/** Where the meadow's sample reads, in texels of a 64-texel atlas, and at which level, at a footprint of `footprint`
 *  texels a pixel. */
function meadowSample(sharpOn, sharpRetro, footprint) {
  let read = null;
  const fns = glslFunctions(`uniform sampler2D uPxSheet;\n${MEADOW_TEXEL_GLSL}`, {
    uSharpOn: sharpOn,
    uSharpRetro: sharpRetro,
    textureSize: () => [64, 64],
    textureLod: (sampler, uv, lod) => {
      read = { at: uv[0] * 64, lod };
      return [0, 0, 0, 1];
    },
  });
  fns.meadowTexel([0.4, 0.6], 1.5, [footprint / 64, 0], [0, footprint / 64]);
  return read;
}

test("the meadow's sample: its own level always, Sharp's texel centre under Sharp, and the retro bias on that level", () => {
  const plain = meadowSample(0, [0, 0], 0.1);
  assert.ok(near(plain.at, 25.6) && plain.lod === 1.5, 'the other filters: the coordinate and the level as given');
  const sharp = meadowSample(1, [0, 0], 0.1);
  assert.ok(near(sharp.at, 25.5) && sharp.lod === 1.5, `Sharp, close up: the texel's centre (${sharp.at})`);
  const retro = meadowSample(1, [1, -0.75], 3);
  assert.ok(near(retro.at, 25.5) && near(retro.lod, 0.75), 'a retro frame: the centre, and the level biased');
});

test("the meadow's atlas takes the world filter and follows a change at its bind; the pixel sheet stays nearest, and only the meadow snaps", () => {
  resetSettings();
  const { gl } = stateGl();
  const mips = [
    { width: 2, height: 2, data: new Uint8Array(16) },
    { width: 1, height: 1, data: new Uint8Array(4) },
  ];
  const program = gl.createProgram();
  const u = Object.fromEntries(
    ['uPxSheet', 'uSharpOn', 'uSharpRetro'].map((n) => [n, gl.getUniformLocation(program, n)]),
  );
  try {
    const meadow = uploadGrassSheet(gl, mips, true);
    const pixel = uploadGrassSheet(gl, mips);
    assert.deepEqual(filtersOf(meadow), SHARP_FILTERS);
    assert.deepEqual(filtersOf(pixel), POINT_FILTERS, 'the pixel sheet: data, nearest under every filter');
    bindGrassSheet(gl, u, meadow, true, new Float32Array([1, -0.75]));
    assert.deepEqual([program.values.uSharpOn, program.values.uSharpRetro], [[1], [1, -0.75]]);
    bindGrassSheet(gl, u, pixel, false, null);
    assert.deepEqual(
      [program.values.uSharpOn, program.values.uSharpRetro],
      [[0], [0, 0]],
      'the pixel sheet never snaps',
    );
    setValue('Video', 'MainFilterMode', '2');
    bindGrassSheet(gl, u, meadow, true, null);
    assert.deepEqual(
      [filtersOf(meadow), program.values.uSharpOn],
      [SHARP_FILTERS, [0]],
      'Trilinear: refiltered at the bind, no snap',
    );
    setValue('Video', 'MainFilterMode', '0');
    bindGrassSheet(gl, u, meadow, true, null);
    assert.deepEqual(filtersOf(meadow), POINT_FILTERS, 'Point');
    assert.deepEqual(filtersOf(pixel), POINT_FILTERS);
  } finally {
    resetSettings();
  }
});
