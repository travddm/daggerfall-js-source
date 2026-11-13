// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
// The surfaces with a texture of their own that follow the world texture filter through the world programs: the body
// parts and held items (the character program) and the tree atlases (the billboard program). The seabed decorations'
// own program is tested beside its pass's other tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFrameTarget } from '../../src/render/renderTarget.js';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { E, stateGl } from '../retroGl.mjs';

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const LIGHT = new Float32Array([0.3, 0.8, -0.2]);
const filtersOf = (texture) => [texture.params[E.TEXTURE_MIN_FILTER], texture.params[E.TEXTURE_MAG_FILTER]];
const SHARP_FILTERS = [E.LINEAR_MIPMAP_LINEAR, E.LINEAR];
const POINT_FILTERS = [E.NEAREST_MIPMAP_NEAREST, E.NEAREST];

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
