// A .js test: the pass is WebGL code, which the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIC_SHADE_STEPS,
  CLASSIC_DARK_RANGE_M,
  DUNGEON_FALLOFF_DEPTH_M,
  SHADE_FS,
  clearsIndoors,
  dungeonFalloffAmount,
  inDungeon,
  shadeAmount,
  shadeDraws,
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
/** DFU's own dungeon fog and its interior (building) fog. */
const DUNGEON_DFU = { mode: 2, density: 0.005, end: 0, color: BLACK };
const BUILDING = { mode: 2, density: 0.001, end: 0, color: BLACK };
const OUTDOORS = { mode: 1, density: 0, end: 2400, color: [0.5, 0.6, 0.7] };

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

test("the fog-colour fade: 30 m under a black fog, the fog's own distance and colour otherwise, none without fog", () => {
  assert.equal(shadeRange(DUNGEON_DFU), CLASSIC_DARK_RANGE_M, 'a dungeon under DFU fog');
  assert.equal(shadeRange(BUILDING), CLASSIC_DARK_RANGE_M, 'a building');
  assert.equal(shadeRange(OUTDOORS), 2400, 'clear weather outdoors');
  assert.equal(
    shadeRange({ mode: 2, density: 0.003, end: 0, color: [0.4, 0.4, 0.4] }),
    1000,
    'rain: 5% at 3 / density',
  );
  assert.deepEqual(shadeFade(DUNGEON_BROWN), { range: 98.7, color: BROWN }, "Better Ambience's brown");
  assert.equal(shadeFade({ mode: 0, density: 0, end: 0, color: BLACK }), null, 'fog off');
});

test("indoors is the opaque black clear; a dungeon is indoors without a building's fog", () => {
  assert.equal(clearsIndoors(INTERIOR_CLEAR), true);
  assert.equal(clearsIndoors(SKY_CLEAR), false);
  assert.equal(clearsIndoors(VIEW_OUT_CLEAR), false, "the real windows' view out");
  assert.equal(inDungeon(INTERIOR_CLEAR, DUNGEON_DFU), true, "DFU's dungeon fog");
  assert.equal(inDungeon(INTERIOR_CLEAR, DUNGEON_BROWN), true, "Better Ambience's dungeon fog");
  assert.equal(inDungeon(INTERIOR_CLEAR, BUILDING), false, 'a building');
  assert.equal(inDungeon(SKY_CLEAR, DUNGEON_DFU), false, 'outdoors');
});

test("DFU's dungeon falloff: min(depth / 90 m, 1) x falloff of the way to black, held there", () => {
  assert.equal(DUNGEON_FALLOFF_DEPTH_M, 90);
  assert.equal(dungeonFalloffAmount(45, 0), 0, 'falloff 0 is off');
  assert.ok(Math.abs(dungeonFalloffAmount(45, 1) - 0.4995) < 1e-9, 'half way at 45 m');
  assert.ok(Math.abs(dungeonFalloffAmount(90, 1) - 0.999) < 1e-9, 'DFU stops at colour x 0.001');
  assert.ok(Math.abs(dungeonFalloffAmount(400, 1) - 0.999) < 1e-9, 'and holds past 90 m');
  assert.ok(Math.abs(dungeonFalloffAmount(11.25, 8) - 0.999) < 1e-9, 'falloff 8 is there by 11.25 m');
  assert.equal(dungeonFalloffAmount(30, 8), 1, 'past it, black');
});

test('which fades a frame gets: the fog colour where the row asks, then the falloff in dungeons alone', () => {
  const both = { fogColour: true, falloff: 2 };
  assert.deepEqual(shadeDraws({ fog: DUNGEON_BROWN, clear: INTERIOR_CLEAR, target: both }), [
    { mode: 0, fade: { range: 98.7, color: BROWN } },
    { mode: 1, falloff: 2 },
  ]);
  assert.deepEqual(
    shadeDraws({ fog: BUILDING, clear: INTERIOR_CLEAR, target: { fogColour: false, falloff: 2 } }),
    [],
    'a building',
  );
  assert.deepEqual(
    shadeDraws({ fog: OUTDOORS, clear: SKY_CLEAR, target: { fogColour: false, falloff: 2 } }),
    [],
    'outdoors',
  );
  assert.deepEqual(shadeDraws({ fog: OUTDOORS, clear: SKY_CLEAR, target: { fogColour: true, falloff: 0 } }), [
    { mode: 0, fade: { range: 2400, color: OUTDOORS.color } },
  ]);
});

/** What the fragment shader writes for a pixel whose surface is `distance` metres away along that pixel's ray. */
function shadeAt({ distance, frag, size, proj, mode = 0, range = 30, falloff = 0 }) {
  const p0 = Math.abs(proj[0]);
  const ndc = [(frag[0] / size[0]) * 2 - 1, (frag[1] / size[1]) * 2 - 1];
  const viewDepth = distance / Math.hypot(ndc[0] / p0, ndc[1] / proj[5], 1);
  const depth = distance === Infinity ? 1 : ((proj[10] * -viewDepth + proj[14]) / viewDepth + 1) / 2;
  const fns = glslFunctions(SHADE_FS, {
    gl_FragCoord: [frag[0], frag[1], 0, 1],
    uSize: size,
    uProj: [p0, proj[5], proj[10], proj[14]],
    uMode: mode,
    uRange: range,
    uFade: [0.1, 0.2, 0.3],
    uFalloff: falloff,
    outColor: [0, 0, 0, 0],
    texelFetch: () => [depth, 0, 0, 1],
  });
  fns.main();
  return { out: fns.globals.outColor, viewDepth };
}

const PROJ = (() => {
  const proj = perspective((65 * Math.PI) / 180, 16 / 10, 0.05, 800);
  proj[0] = -proj[0]; // the scenes mirror X (mat4.js mirrorProjectionX)
  return proj;
})();
const FRAGS = [
  [160.5, 100.5],
  [10.5, 190.5],
  [300.5, 20.5],
];

test("the shader's steps equal shadeStep's, by distance along each pixel's ray, and the sky is left alone", () => {
  const size = [320, 200];
  for (const frag of FRAGS) {
    for (const distance of [0.2, 3.1, 10.2, 21.3, 29.9, 400]) {
      const { out } = shadeAt({ distance, frag, size, proj: PROJ });
      assert.deepEqual(out.slice(0, 3), [0.1, 0.2, 0.3], 'toward the fade colour');
      assert.ok(Math.abs(out[3] - shadeAmount(shadeStep(distance, 30))) < 1e-6, `${distance} m at ${frag}: ${out[3]}`);
    }
  }
  assert.deepEqual(shadeAt({ distance: Infinity, frag: FRAGS[0], size, proj: PROJ }).out, [0, 0, 0, 0], 'the sky');
});

test("the shader's falloff equals DFU's arithmetic on each pixel's eye depth, toward black", () => {
  const size = [320, 200];
  for (const frag of FRAGS) {
    for (const distance of [0.5, 12, 45, 89, 300]) {
      for (const falloff of [0.5, 1, 3, 8]) {
        const { out, viewDepth } = shadeAt({ distance, frag, size, proj: PROJ, mode: 1, falloff });
        assert.deepEqual(out.slice(0, 3), [0, 0, 0], 'toward black');
        const want = dungeonFalloffAmount(viewDepth, falloff);
        assert.ok(
          Math.abs(out[3] - want) < 1e-5,
          `${distance} m, falloff ${falloff} at ${frag}: ${out[3]} against ${want}`,
        );
      }
    }
  }
});

/** Every shader source the renderer compiled. */
const compiled = (calls) => calls.filter((c) => c[0] === 'shaderSource').map((c) => c[2]);
/** The uMode each shading draw ran with, in order. */
const modes = (calls) => calls.filter((c) => c[0] === 'uniform1i' && c[1]?.name === 'uMode').map((c) => c[2]);
const shadeDrawsOf = (s) => s.draws.filter((d) => d.prog?.locs?.has('uMode'));

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
  r.setDistanceShadeSource(() => (on ? { fogColour: true, falloff: 0 } : null));
  try {
    worldFrames(r, 1);
    const frame = r.retroFrame;
    assert.deepEqual([frame.kind, frame.scale, frame.width, frame.height], ['scale', 1, canvas.width, canvas.height]);
    assert.ok(compiled(calls).includes(SHADE_FS), 'the program is built on the first shaded frame');
    const image = r.retro.target;
    const shade = shadeDrawsOf(s)[0];
    assert.ok(s.draws.indexOf(shade) < s.draws.indexOf(presents(s).at(-1)), 'shaded before the present');
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
  r.setDistanceShadeSource(() => ({ fogColour: true, falloff: 0 }));
  try {
    worldFrames(r, 1);
    const shade = shadeDrawsOf(s)[0];
    assert.deepEqual(shade.viewport, [0, 0, 320, 200]);
    assert.equal(s.fbos.get(shade.fb)[E.COLOR_ATTACHMENT0], r.retro.target.tex);
    assert.ok(s.draws.indexOf(shade) < s.draws.indexOf(presents(s).at(-1)));
    assert.deepEqual(errors, []);
  } finally {
    setFrameTarget(null);
  }
});

test('the renderer draws the fog fade, then the falloff in a dungeon; a building and the outdoors get no falloff', () => {
  const cases = [
    { clear: INTERIOR_CLEAR, fog: ['linear', 0, 1.76, 98.7, BROWN], want: [0, 1], what: 'a Better Ambience dungeon' },
    { clear: INTERIOR_CLEAR, fog: ['exp', 0.001, 0, 0, BLACK], want: [0], what: 'a building' },
    { clear: SKY_CLEAR, fog: ['linear', 0, 0, 2400, new Float32Array([0.5, 0.6, 0.7])], want: [0], what: 'outdoors' },
  ];
  for (const { clear, fog, want, what } of cases) {
    const { canvas, calls, s } = stateGl();
    const r = new Renderer(canvas);
    r.setDistanceShadeSource(() => ({ fogColour: true, falloff: 2 }));
    r.setClearColor(clear);
    try {
      worldFrames(r, 1, fog);
      assert.deepEqual(modes(calls), want, `${what}: the draws' modes`);
      assert.equal(shadeDrawsOf(s).length, want.length, `${what}: one draw each`);
      if (want.includes(1)) assert.deepEqual(shadeDrawsOf(s)[0].prog.values.uFalloff, [2], `${what}: the falloff`);
    } finally {
      setFrameTarget(null);
    }
  }
});
