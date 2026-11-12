// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BILINEAR,
  NON_POINT_SPRITE_SCALE,
  POINT,
  TRILINEAR,
  parseWorldFilterMode,
  worldFilterFor,
} from '../../src/render/world-texture-filter.ts';
import { Renderer } from '../../src/render/renderer.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { ELEMENT_TYPES, spellHandRects } from '../../src/combat/fpsSpellCasting.js';
import { E, stateGl } from '../retroGl.mjs';

const picture = () => ({ width: 2, height: 2, colors: new Uint8Array(16) });
const filters = (tex) => [tex.params[E.TEXTURE_MIN_FILTER], tex.params[E.TEXTURE_MAG_FILTER]];
const choose = (mode) => setValue('Video', 'MainFilterMode', String(mode));

test('the stored value reads as DFU reads it: 0, 1 or 2, anything else Point', () => {
  assert.equal(parseWorldFilterMode('0'), POINT);
  assert.equal(parseWorldFilterMode('1'), BILINEAR);
  assert.equal(parseWorldFilterMode('2'), TRILINEAR);
  for (const bad of ['3', '-1', 'Bilinear', '', null, undefined])
    assert.equal(parseWorldFilterMode(bad), POINT, String(bad));
});

test("Unity's three modes, with and without mip maps", () => {
  const cases = [
    [POINT, true, E.NEAREST_MIPMAP_NEAREST, E.NEAREST],
    [POINT, false, E.NEAREST, E.NEAREST],
    [BILINEAR, true, E.LINEAR_MIPMAP_NEAREST, E.LINEAR],
    [BILINEAR, false, E.LINEAR, E.LINEAR],
    [TRILINEAR, true, E.LINEAR_MIPMAP_LINEAR, E.LINEAR],
    [TRILINEAR, false, E.LINEAR, E.LINEAR],
  ];
  for (const [mode, mips, min, mag] of cases)
    assert.deepEqual(worldFilterFor(E, mode, mips), { min, mag }, `${mode} ${mips}`);
});

test('world art takes the world filter at upload and again when a scene asks for it after a change; UI art keeps NEAREST', () => {
  resetSettings();
  const { canvas } = stateGl();
  const r = new Renderer(canvas);
  try {
    const wall = r.uploadTexture(5, 1, picture());
    const hands = r.uploadTexture('img', 'hands:test:0', picture(), { clamp: true, world: true });
    const ui = r.uploadTexture('img', 'ui:test', picture());
    const smooth = r.uploadTexture('img', 'logo:test', picture(), { smooth: true });
    assert.deepEqual(filters(wall), [E.NEAREST_MIPMAP_NEAREST, E.NEAREST], 'Point by default: as before');
    assert.deepEqual(filters(hands), [E.NEAREST, E.NEAREST]);

    choose(BILINEAR);
    assert.equal(r.uploadTexture(5, 1, picture()), wall, 'the cached texture, not a new one');
    assert.deepEqual(filters(wall), [E.LINEAR_MIPMAP_NEAREST, E.LINEAR]);
    r.uploadTexture('img', 'hands:test:0', picture(), { clamp: true, world: true });
    assert.deepEqual(filters(hands), [E.LINEAR, E.LINEAR]);
    r.uploadTexture('img', 'ui:test', picture());
    assert.deepEqual(filters(ui), [E.NEAREST, E.NEAREST], 'UI art is GUIFilterMode territory');
    r.uploadTexture('img', 'logo:test', picture(), { smooth: true });
    assert.deepEqual(filters(smooth), [E.LINEAR, E.LINEAR]);

    choose(TRILINEAR);
    const door = r.uploadTexture(6, 2, picture());
    assert.deepEqual(filters(door), [E.LINEAR_MIPMAP_LINEAR, E.LINEAR], 'a new upload reads the setting');
    choose(POINT);
    r.uploadTexture(6, 2, picture());
    assert.deepEqual(filters(door), [E.NEAREST_MIPMAP_NEAREST, E.NEAREST], 'and back to Point');
  } finally {
    resetSettings();
  }
});

test('an emission map follows its albedo, so both samples still blend alike', () => {
  resetSettings();
  const { canvas } = stateGl();
  const r = new Renderer(canvas);
  try {
    const glow = r.uploadEmissionTexture(7, 3, picture());
    assert.deepEqual(filters(glow), [E.NEAREST_MIPMAP_NEAREST, E.NEAREST]);
    choose(TRILINEAR);
    r.uploadEmissionTexture(7, 3, picture());
    assert.deepEqual(filters(glow), [E.LINEAR_MIPMAP_LINEAR, E.LINEAR]);
  } finally {
    resetSettings();
  }
});

test("the ground's magnification follows the world filter at each world load; Ground sharpness keeps its minification", () => {
  resetSettings();
  const { canvas } = stateGl();
  const r = new Renderer(canvas);
  try {
    const ground = r.uploadTileArray(302, [picture(), picture()]);
    const [min] = filters(ground);
    assert.equal(ground.params[E.TEXTURE_MAG_FILTER], E.NEAREST, 'Point by default: as before');
    choose(BILINEAR);
    r.applyGroundSharpness();
    assert.deepEqual(filters(ground), [min, E.LINEAR]);
    choose(POINT);
    r.applyGroundSharpness();
    assert.equal(ground.params[E.TEXTURE_MAG_FILTER], E.NEAREST);
  } finally {
    resetSettings();
  }
});

test('the spell hands are drawn 1% larger off Point, as DFU draws them', () => {
  resetSettings();
  const canvas = { width: 1280, height: 800 };
  const rec = { width: 100, height: 80 };
  try {
    const point = spellHandRects(canvas, rec, { frameIndex: 1, element: ELEMENT_TYPES.Magic });
    choose(BILINEAR);
    const filtered = spellHandRects(canvas, rec, { frameIndex: 1, element: ELEMENT_TYPES.Magic });
    assert.ok(Math.abs(filtered.left.w - point.left.w * NON_POINT_SPRITE_SCALE) < 1e-9);
    assert.ok(Math.abs(filtered.left.h - point.left.h * NON_POINT_SPRITE_SCALE) < 1e-9);
  } finally {
    resetSettings();
  }
});
