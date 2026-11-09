// A .js test: the pass is WebGL code, which the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIC_SHADE_STEPS,
  CLASSIC_DARK_RANGE_M,
  SHADE_FS,
  clearsIndoors,
  shadeAmount,
  shadeFade,
  shadeRange,
  shadeStep,
} from '../../src/render/classic-distance-shading.ts';
import { INTERIOR_CLEAR, Renderer, SKY_CLEAR, VIEW_OUT_CLEAR, WORLD_FRAME } from '../../src/render/renderer.js';
import { setFrameTarget } from '../../src/render/renderTarget.js';
import { perspective } from '../../src/world/mat4.js';
import { glslFunctions } from '../glsl.mjs';
import { E, stateGl, presents, retroCfg } from '../retroGl.mjs';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const L = new Float32Array([0.3, 0.8, -0.2]);
const BLACK = new Float32Array([0, 0, 0]);
/** Better Ambience's FoggyDungeons fog: linear, 1.76 to 98.7 m, brown. */
const BROWN = new Float32Array([0.208, 0.157, 0.005]);
const DUNGEON_BROWN = { mode: 1, density: 0, end: 98.7, color: BROWN };

test('a step is 0 near the player, one more each 64th of the range, and 63 from the last 64th on', () => {
  assert.equal(CLASSIC_SHADE_STEPS, 64);
  assert.equal(shadeStep(0, 30), 0);
  assert.equal(shadeStep(30 / 64 - 0.001, 30), 0);
  assert.equal(shadeStep(30 / 64 + 0.001, 30), 1);
  assert.equal(shadeStep(15, 30), 32);
  assert.equal(shadeStep(30 * (63 / 64) + 0.001, 30), 63);
  assert.equal(shadeStep(5000, 30), 63);
  assert.equal(shadeStep(10, 0), 0, 'no range: nothing moves');
  assert.equal(shadeAmount(0), 0);
  assert.equal(shadeAmount(63), 1);
});

test("the range: 30 m to black indoors, the fog's own distance outdoors, none without fog", () => {
  assert.equal(shadeRange({ mode: 2, density: 0.005, end: 0, color: BLACK }), CLASSIC_DARK_RANGE_M, 'a dungeon');
  assert.equal(shadeRange({ mode: 2, density: 0.001, end: 0, color: BLACK }), CLASSIC_DARK_RANGE_M, 'a building');
  assert.equal(shadeRange({ mode: 1, density: 0, end: 2400, color: [0.5, 0.6, 0.7] }), 2400, 'clear weather outdoors');
  assert.equal(
    shadeRange({ mode: 2, density: 0.003, end: 0, color: [0.4, 0.4, 0.4] }),
    1000,
    'rain: 5% left at 3 / density',
  );
  assert.equal(shadeRange({ mode: 0, density: 0, end: 0, color: BLACK }), null, 'fog off');
});

test('to black, a dungeon or a building goes to black over 30 m whatever its fog; to fog colour, to its own fog', () => {
  assert.deepEqual(shadeFade(DUNGEON_BROWN, true, 'black'), { range: CLASSIC_DARK_RANGE_M, color: [0, 0, 0] });
  assert.deepEqual(shadeFade(DUNGEON_BROWN, true, 'fog'), { range: 98.7, color: BROWN });
  const dfuDungeon = { mode: 2, density: 0.005, end: 0, color: BLACK };
  for (const target of ['black', 'fog']) {
    const fade = shadeFade(dfuDungeon, true, target);
    assert.deepEqual([fade?.range, Array.from(fade?.color ?? [])], [CLASSIC_DARK_RANGE_M, [0, 0, 0]], target);
  }
});

test("a dungeon or a building is told by its opaque black clear, never the view out's transparent one", () => {
  assert.equal(clearsIndoors(INTERIOR_CLEAR), true);
  assert.equal(clearsIndoors(SKY_CLEAR), false);
  assert.equal(clearsIndoors(VIEW_OUT_CLEAR), false);
});

test('outdoors both choices go to the fog colour over the fog distance; with the fog off nothing is shaded', () => {
  const clear = { mode: 1, density: 0, end: 2400, color: [0.5, 0.6, 0.7] };
  for (const target of ['black', 'fog']) {
    assert.deepEqual(shadeFade(clear, false, target), { range: 2400, color: clear.color }, target);
    assert.equal(shadeFade({ mode: 0, density: 0, end: 0, color: BLACK }, true, target), null, `${target}: fog off`);
  }
});

/** What the fragment shader writes for a pixel whose surface is `distance` metres away along that pixel's ray. */
function shadeAt({ distance, frag, size, proj, range }) {
  const p0 = Math.abs(proj[0]);
  const ndc = [(frag[0] / size[0]) * 2 - 1, (frag[1] / size[1]) * 2 - 1];
  const viewDepth = distance / Math.hypot(ndc[0] / p0, ndc[1] / proj[5], 1);
  const depth = distance === Infinity ? 1 : ((proj[10] * -viewDepth + proj[14]) / viewDepth + 1) / 2;
  const fns = glslFunctions(SHADE_FS, {
    gl_FragCoord: [frag[0], frag[1], 0, 1],
    uSize: size,
    uProj: [p0, proj[5], proj[10], proj[14]],
    uRange: range,
    uFade: [0.1, 0.2, 0.3],
    outColor: [0, 0, 0, 0],
    texelFetch: () => [depth, 0, 0, 1],
  });
  fns.main();
  return fns.globals.outColor;
}

test("the shader picks the same step as shadeStep, by distance along each pixel's ray, and leaves the sky alone", () => {
  const proj = perspective((65 * Math.PI) / 180, 16 / 10, 0.05, 800);
  proj[0] = -proj[0]; // the scenes mirror X (mat4.js mirrorProjectionX)
  const size = [320, 200];
  for (const frag of [
    [160.5, 100.5],
    [10.5, 190.5],
    [300.5, 20.5],
  ]) {
    for (const distance of [0.2, 3.1, 10.2, 21.3, 29.9, 400]) {
      const out = shadeAt({ distance, frag, size, proj, range: 30 });
      assert.deepEqual(out.slice(0, 3), [0.1, 0.2, 0.3], 'toward the fade colour');
      assert.ok(Math.abs(out[3] - shadeAmount(shadeStep(distance, 30))) < 1e-6, `${distance} m at ${frag}: ${out[3]}`);
    }
  }
  assert.deepEqual(
    shadeAt({ distance: Infinity, frag: [160.5, 100.5], size, proj, range: 30 }),
    [0, 0, 0, 0],
    'the sky',
  );
});

/** Every shader source the renderer compiled. */
const compiled = (calls) => calls.filter((c) => c[0] === 'shaderSource').map((c) => c[2]);

function worldFrames(r, n, fog = ['exp', 0.005, 0, 0, BLACK]) {
  for (let i = 0; i < n; i++) {
    r.beginFrame(I, I, L, WORLD_FRAME);
    r.setFog(...fog);
    r.drawScreenQuad(null, { x: 0, y: 0, w: 1, h: 1 });
  }
}

test('off, the shading costs nothing: no program, pass, image or framebuffer of it, with retro mode off or on', () => {
  for (const source of [null, () => null]) {
    for (const retro of [null, retroCfg({ post: 3 })]) {
      const { canvas, calls } = stateGl();
      const r = new Renderer(canvas);
      if (source) r.setDistanceShadeSource(source);
      r.setRetroSource(() => retro);
      try {
        worldFrames(r, 3);
        assert.equal(r._shade, null, 'no pass');
        assert.ok(!compiled(calls).includes(SHADE_FS), "no program (its vertex shader is the present's own)");
        assert.equal(
          r.retroFrame?.kind ?? null,
          retro ? 'retro' : null,
          retro ? 'the retro frame alone' : 'the world draws to the canvas',
        );
      } finally {
        setFrameTarget(null);
      }
    }
  }
});

test('on, the world is drawn into a full-size image, shaded through its depth, then presented; off again frees both', () => {
  const { canvas, calls, errors, s } = stateGl();
  const r = new Renderer(canvas);
  let on = true;
  r.setDistanceShadeSource(() => (on ? 'black' : null));
  try {
    worldFrames(r, 1);
    const frame = r.retroFrame;
    assert.deepEqual([frame.kind, frame.scale, frame.width, frame.height], ['scale', 1, canvas.width, canvas.height]);
    assert.ok(compiled(calls).includes(SHADE_FS), 'the program is built on the first shaded frame');
    const image = r.retro.target;
    const shadeDraw = s.draws.findIndex((d) => d.prog?.locs?.has('uRange'));
    const presentDraw = s.draws.indexOf(presents(s).at(-1));
    assert.ok(shadeDraw >= 0 && shadeDraw < presentDraw, 'shaded before the present');
    const shade = s.draws[shadeDraw];
    assert.deepEqual(s.fbos.get(shade.fb), { [E.COLOR_ATTACHMENT0]: image.tex }, "into the image's colour alone");
    assert.equal(shade.units[1][E.TEXTURE_2D], image.depth, 'reading its depth');
    assert.deepEqual(shade.prog.values.uRange, [CLASSIC_DARK_RANGE_M]);
    assert.deepEqual(shade.viewport, [0, 0, canvas.width, canvas.height]);
    assert.deepEqual(errors, [], 'no feedback loop');
    on = false;
    worldFrames(r, 1);
    assert.equal(r.retroFrame, null, 'the world draws to the canvas again');
    assert.equal(image.tex.deleted, true, 'the image is freed');
    assert.equal(shade.fb.deleted, true, 'and the shading framebuffer');
  } finally {
    setFrameTarget(null);
  }
});

test('with retro mode, the 320x200 image is shaded before the present palettizes it', () => {
  const { canvas, s, errors } = stateGl();
  const r = new Renderer(canvas);
  r.setRetroSource(() => retroCfg({ post: 3 }));
  r.setDistanceShadeSource(() => 'black');
  try {
    worldFrames(r, 1);
    const shade = s.draws.find((d) => d.prog?.locs?.has('uRange'));
    assert.deepEqual(shade.viewport, [0, 0, 320, 200]);
    assert.equal(s.fbos.get(shade.fb)[E.COLOR_ATTACHMENT0], r.retro.target.tex);
    assert.ok(s.draws.indexOf(shade) < s.draws.indexOf(presents(s).at(-1)));
    assert.deepEqual(errors, []);
  } finally {
    setFrameTarget(null);
  }
});

test('the renderer tells a dungeon from the outdoors by its clear colour, and fades as the choice says', () => {
  const cases = [
    {
      clear: INTERIOR_CLEAR,
      target: 'black',
      range: CLASSIC_DARK_RANGE_M,
      fade: [0, 0, 0],
      what: 'a dungeon, to black',
    },
    { clear: INTERIOR_CLEAR, target: 'fog', range: 98.7, fade: [...BROWN], what: 'a dungeon, to its brown fog' },
    { clear: SKY_CLEAR, target: 'black', range: 98.7, fade: [...BROWN], what: 'outdoors, to the fog colour' },
  ];
  for (const { clear, target, range, fade, what } of cases) {
    const { canvas, s } = stateGl();
    const r = new Renderer(canvas);
    r.setDistanceShadeSource(() => target);
    r.setClearColor(clear);
    try {
      worldFrames(r, 1, ['linear', 0, 1.76, 98.7, BROWN]);
      const shade = s.draws.find((d) => d.prog?.locs?.has('uRange'));
      assert.ok(Math.abs(shade.prog.values.uRange[0] - range) < 1e-4, `${what}: range ${shade.prog.values.uRange}`);
      assert.ok(
        shade.prog.values.uFade.every((v, i) => Math.abs(v - fade[i]) < 1e-6),
        `${what}: fade ${shade.prog.values.uFade}`,
      );
    } finally {
      setFrameTarget(null);
    }
  }
});
