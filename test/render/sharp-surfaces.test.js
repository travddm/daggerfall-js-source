// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
// The surfaces with a texture of their own that follow the world texture filter: the seabed decorations (their own
// program, with Sharp's texel snap), the body parts and held items (the character program), and the tree atlases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECOR_FS, DeepWatersRenderer } from '../../src/render/deepWatersRender.js';
import { setFrameTarget } from '../../src/render/renderTarget.js';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { glslFunctions } from '../glsl.mjs';
import { E, stateGl } from '../retroGl.mjs';

const SIZE = 64;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const LIGHT = new Float32Array([0.3, 0.8, -0.2]);
const close = (a, b) => Math.abs(a - b) < 1e-6;
const filtersOf = (texture) => [texture.params[E.TEXTURE_MIN_FILTER], texture.params[E.TEXTURE_MAG_FILTER]];
const SHARP_FILTERS = [E.LINEAR_MIPMAP_LINEAR, E.LINEAR];
const POINT_FILTERS = [E.NEAREST_MIPMAP_NEAREST, E.NEAREST];

/** Where the decorations' shader samples its frame, in texels, at a footprint of `footprint` texels a pixel, and the
 *  x gradient it hands the sampler. */
function decorationSample(uniforms, footprint) {
  const seen = [];
  const fns = glslFunctions(DECOR_FS, {
    vUv: [0.4, 0.6],
    vStart: 0,
    vWorldPos: [30, 20, 40],
    uColor: [1.12, 1.12, 1.12, 1],
    uCutoff: 0.5,
    uSceneTint: [1, 1, 1, 0],
    uTick: 0,
    uFrames: 1,
    uCamPos: [0, 420, 0],
    uFogColor: [0.5, 0.5, 0.5],
    uFogMode: 0,
    uFogDensity: 0,
    uFogRange: [0, 1],
    uDwFog: Array(5).fill([0, 0, 0, 0]),
    uDwCamFwd: [0, -1, 0],
    uColumnOn: 0,
    uSeaY: 34,
    uTopColor: [1, 1, 1, 1],
    uTopVision: 18,
    uSurfaceScroll: [0, 0],
    uPixelOrigin: [0, 0, 0],
    ...uniforms,
    textureSize: () => [SIZE, SIZE, 1],
    dFdx: () => [footprint / SIZE, 0],
    dFdy: () => [0, footprint / SIZE],
    texture: (sampler, p) => {
      seen.push({ how: 'plain', at: p[0] * SIZE });
      return [0.4, 0.5, 0.2, 1];
    },
    textureGrad: (sampler, p, gx) => {
      seen.push({ how: 'grad', at: p[0] * SIZE, gradientX: gx[0] * SIZE });
      return [0.4, 0.5, 0.2, 1];
    },
  });
  fns.main();
  return seen[0];
}

test('the seabed decorations: Sharp samples each frame at its texel centres; the other filters sample as before', () => {
  const plain = decorationSample({ uSharpOn: 0, uSharpRetro: [0, 0] }, 0.1);
  assert.equal(plain.how, 'plain');
  assert.ok(close(plain.at, 0.4 * SIZE), 'Point, Bilinear, Trilinear: the coordinate itself');
  const near = decorationSample({ uSharpOn: 1, uSharpRetro: [0, 0] }, 0.1);
  assert.ok(close(near.at, 25.5), `Sharp, close up: the texel's centre (${near.at})`);
  const far = decorationSample({ uSharpOn: 1, uSharpRetro: [0, 0] }, 2);
  assert.ok(close(far.at, 0.4 * SIZE), 'Sharp, a texel under a pixel: left to the mips');
  const retro = decorationSample({ uSharpOn: 1, uSharpRetro: [1, -1] }, 2);
  assert.ok(close(retro.at, 25.5), 'a retro frame: the centre near and far, as Point');
  assert.ok(close(retro.gradientX, 1), 'and the retro bias halves the footprint the mip is chosen by');
});

/** The decorations' pass over the stateful fake GL, with the renderer's retro values. */
function decorationPass() {
  const { gl } = stateGl();
  const renderer = {
    gl,
    _proj: new Float32Array(16),
    _view: new Float32Array(16),
    _camPos: new Float32Array(3),
    _dwFog: new Float32Array(20),
    _fogColor: new Float32Array(3),
    _fogMode: 0,
    _fogDensity: 0,
    _fogRange: new Float32Array([0, 1]),
    _focus: new Float32Array(4),
    _haze: new Float32Array(8),
    _sharpRetro: new Float32Array([1, -0.75]),
    markForeignPass() {},
  };
  const pass = new DeepWatersRenderer(renderer);
  const texture = pass.createDecorationTexture([{ width: 4, height: 4, data: new Uint8Array(64) }]);
  const frame = {
    sceneTint: [1, 1, 1, 0],
    seconds: 0,
    columnOn: false,
    seaY: 0,
    topColor: [1, 1, 1, 1],
    topVision: 1,
    surfaceScroll: [0, 0],
    surfaceTexture: null,
  };
  const draw = () => {
    pass.drawDecorations(
      [
        {
          h: { groups: [{ vao: {}, count: 6, texture, fps: 0, born: 0, facing: 0 }] },
          model: new Float32Array(16),
          origin: [0, 0, 0],
        },
      ],
      frame,
    );
    return pass._programs.decor.p.values;
  };
  return { texture, draw };
}

test('the seabed decorations take the world filter, follow a change at their next draw, and are told Sharp and the retro values', () => {
  resetSettings();
  try {
    const { texture, draw } = decorationPass();
    assert.deepEqual(filtersOf(texture.tex), SHARP_FILTERS, 'Sharp, the default: trilinear under the snap');
    let uniforms = draw();
    assert.deepEqual([uniforms.uSharpOn, [...uniforms.uSharpRetro]], [[1], [1, -0.75]]);
    setValue('Video', 'MainFilterMode', '0');
    uniforms = draw();
    assert.deepEqual(filtersOf(texture.tex), POINT_FILTERS, 'Point: nearest, refiltered at the draw');
    assert.deepEqual(uniforms.uSharpOn, [0], 'and no snap');
  } finally {
    resetSettings();
  }
});

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
