// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BILINEAR,
  NON_POINT_SPRITE_SCALE,
  POINT,
  TRILINEAR,
  filterUpload,
  needsRefilter,
  parseWorldFilterMode,
  refilterWorldTexture,
  worldFilterFor,
} from '../../src/render/world-texture-filter.ts';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { getPref, setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { VideoPlayer } from '../../src/ui/videoPlayer.js';
import { loadHud } from '../../src/ui/hud/hud.js';
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
  choose(POINT); // DFU's Point; the port's default is Sharp (sharp-texels.test.js)
  const { canvas } = stateGl();
  const r = new Renderer(canvas);
  try {
    const wall = r.uploadTexture(5, 1, picture());
    const hands = r.uploadTexture('img', 'hands:test:0', picture(), { clamp: true, world: true });
    const ui = r.uploadTexture('img', 'ui:test', picture());
    const smooth = r.uploadTexture('img', 'logo:test', picture(), { smooth: true });
    assert.deepEqual(filters(wall), [E.NEAREST_MIPMAP_NEAREST, E.NEAREST], 'Point: as before');
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
  choose(POINT); // DFU's Point; the port's default is Sharp (sharp-texels.test.js)
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
  choose(POINT); // DFU's Point; the port's default is Sharp (sharp-texels.test.js)
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

test('a video frame takes GUI/VideoFilterMode, Bilinear by default as in DFU', () => {
  resetSettings();
  const filtersAsked = [];
  const renderer = {
    uploadTexture: (archive, record, color32, opts) => {
      filtersAsked.push(opts?.sampler?.filter);
      return {};
    },
    releaseTexture: () => true,
  };
  try {
    const player = new VideoPlayer({ renderer, now: () => 0, audioContext: () => null });
    player.vidFile = { frameBuffer: new Uint8Array(16), frameWidth: 2, frameHeight: 2 };
    player._uploadFrame();
    setValue('GUI', 'VideoFilterMode', '0');
    player._uploadFrame();
    assert.deepEqual(filtersAsked, ['linear', 'nearest']);
  } finally {
    resetSettings();
  }
});

test('the compass pictures take GUI/GUIFilterMode, Point by default; the bars keep their own', async () => {
  resetSettings();
  const asked = new Map();
  const renderer = {
    uploadTexture: (archive, record, color32, opts) => {
      asked.set(record, opts?.sampler?.filter ?? 'own');
      return { record };
    },
  };
  class ImgFile {
    load() {}
    getDFBitmap() {
      return { width: 2, height: 2, data: new Uint8Array(4) };
    }
  }
  const load = () =>
    loadHud({
      fetchBytes: async () => new Uint8Array(0),
      ImgFile,
      palette: { get: () => ({ r: 0, g: 0, b: 0 }) },
      renderer,
    }).then(() => {
      return [asked.get('COMPASS.IMG'), asked.get('COMPBOX.IMG'), asked.get('MAIN03I0.IMG')];
    });
  try {
    assert.deepEqual(await load(), ['nearest', 'nearest', 'own']);
    setValue('GUI', 'GUIFilterMode', '1');
    assert.deepEqual(await load(), ['linear', 'linear', 'own']);
  } finally {
    resetSettings();
  }
});

test('a world texture takes the Anisotropic Filtering row at upload, and a change of the row or the filter re-filters it', () => {
  resetSettings();
  resetPrefs();
  choose(POINT); // DFU's Point; the port's default is Sharp (sharp-texels.test.js)
  const ext = { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff };
  const set = [];
  const gl = {
    ...E,
    getExtension: (name) => (name === 'EXT_texture_filter_anisotropic' ? ext : null),
    getParameter: (name) => (name === ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT ? 16 : 0),
    bindTexture: () => {},
    texParameteri: () => {},
    texParameterf: (target, name, value) => {
      if (name === ext.TEXTURE_MAX_ANISOTROPY_EXT) set.push(value);
    },
  };
  const texture = {};
  try {
    filterUpload(gl, texture, true, true, null, E.NEAREST);
    choose(TRILINEAR);
    assert.equal(needsRefilter(gl, texture), true, 'the filter changed');
    refilterWorldTexture(gl, texture);
    setPref('anisotropicFiltering', 'texture');
    assert.equal(needsRefilter(gl, texture), true, 'the row changed');
    refilterWorldTexture(gl, texture);
    assert.equal(needsRefilter(gl, texture), false);
    assert.deepEqual(
      set,
      [1, 8, 1],
      "Point (none), then Trilinear at the row's default 8x, then Per texture (none on a model)",
    );
  } finally {
    resetSettings();
    resetPrefs();
  }
});

test('a change made while playing reaches every cached world texture and ground array on the next frame, with no reload', async () => {
  resetSettings();
  resetPrefs();
  const { GRAPHICS_PRESETS } = await import('../../src/systems/graphicsPresets.js');
  const { applyGraphicsPreset } = await import('../../src/ui/enhanced/enhancedMenu.js');
  const { canvas } = stateGl();
  const r = new Renderer(canvas);
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const frame = () => r.beginFrame(I, I, new Float32Array([0, 1, 0]), WORLD_FRAME);
  try {
    const wall = r.uploadTexture(5, 1, picture());
    const glow = r.uploadEmissionTexture(5, 1, picture());
    const ground = r.uploadTileArray(302, [picture(), picture()]);
    frame();
    choose(TRILINEAR);
    frame();
    assert.deepEqual(
      filters(wall),
      [E.LINEAR_MIPMAP_LINEAR, E.LINEAR],
      'World Texture Filter: the cached wall, at once',
    );
    assert.deepEqual(filters(glow), [E.LINEAR_MIPMAP_LINEAR, E.LINEAR], 'and its glow');
    assert.equal(ground.params[E.TEXTURE_MAG_FILTER], E.LINEAR, "and the ground's magnification");
    setPref('groundSharpness', 'off');
    frame();
    assert.equal(ground.params[E.TEXTURE_MIN_FILTER], E.NEAREST_MIPMAP_NEAREST, 'Ground sharpness Off, at once');
    applyGraphicsPreset(GRAPHICS_PRESETS.find((p) => p.id === 'ultra'));
    frame();
    assert.equal(getPref('anisotropicFiltering'), 16, 'the Quality preset wrote its anisotropy');
    assert.equal(ground.params[E.TEXTURE_MIN_FILTER], E.LINEAR_MIPMAP_LINEAR, 'and the arrays took it at once');
    choose(POINT);
    frame();
    assert.deepEqual(filters(wall), [E.NEAREST_MIPMAP_NEAREST, E.NEAREST], 'and back to Point');
  } finally {
    resetSettings();
    resetPrefs();
  }
});

test('a world picture outside the caches (a banner, a flag, the far trees) follows the filter at its next draw', async () => {
  const { BannerRenderer } = await import('../../src/render/bannerPass.js');
  const { ShipFlagRenderer } = await import('../../src/render/shipFlagPass.js');
  resetSettings();
  resetPrefs();
  const { gl } = stateGl();
  try {
    const banners = new BannerRenderer(gl, { paint: () => ({ width: 4, height: 4 }) });
    const flags = new ShipFlagRenderer(gl, { paint: () => ({ width: 4, height: 4 }) });
    const banner = banners.textureOf('hall', {}, 0);
    const flag = flags.textureOf('ship', {}, 0);
    assert.deepEqual(filters(banner), [E.LINEAR_MIPMAP_LINEAR, E.LINEAR], 'Sharp, the default: trilinear, as before');
    assert.deepEqual(filters(flag), [E.LINEAR_MIPMAP_LINEAR, E.LINEAR]);
    choose(POINT);
    assert.equal(banners.textureOf('hall', {}, 1), banner, 'the cached texture');
    flags.textureOf('ship', {}, 1);
    assert.deepEqual(filters(banner), [E.NEAREST_MIPMAP_NEAREST, E.NEAREST], 'Point at the next draw');
    assert.deepEqual(filters(flag), [E.NEAREST_MIPMAP_NEAREST, E.NEAREST]);
  } finally {
    resetSettings();
    resetPrefs();
  }
});
