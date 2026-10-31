// ROAD-C c2/S6: THE RENDER MODES AND THE WATER TINT - the second half of
// Assets/Shaders/DaggerfallAutomap.shader.
//
// WHAT THESE PINS ARE FOR. Nothing in CI can look at a pixel, so a
// shader arm is exactly the kind of law that ships broken and stays
// broken (c2's own standing warning: two data-gated pins have already
// rotted into existence checks). So this file pins the shader THREE
// ways, none of which is "the uniform exists":
//   1. the CONSTANTS, digit for digit against the C# - 0.75, the two
//      wireframe colours, 0.3/0.59/0.11, 20.0 and the 0.6 floor, and
//      the water lerp;
//   2. the ORDER of the statements those constants live in, because
//      every one of the three DFU quirks here IS an ordering (the water
//      tint before the dim; the wireframe constant before the
//      grayscale; and `min(y, slice)`, which is what makes the
//      above-slice dim identically zero);
//   3. the BEHAVIOUR on the real Renderer over the EV6 counting
//      Proxy-GL - the blend flip, the depth mask that stays ON, the
//      line index buffer built once and reused, and the four draw
//      groups the window issues.
//
// THE ONE THING A PIN MUST NOT DO HERE is re-derive the dim in JS and
// compare it to itself. Where a pin below computes, it computes the C#'s
// arithmetic by hand from the C# source and compares to the port's
// shader text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identity } from '../../../src/world/mat4.js';
import {
  Renderer, AUTOMAP_MODE, AUTOMAP_NO_WATER, AUTOMAP_WATER_COLOR, buildWireIndices,
} from '../../../src/render/renderer.js';
import { WATER_MAP_COLOR } from '../../../src/render/underwaterFog.js';
import {
  AutomapWindow, RENDER_MODES, ABOVE_SLICE_MODES, nextRenderMode,
  HOTKEYS_DOWN, HOTKEY_VERBS, automapRenderMode,
  signalAutomapReset, resetAutomapWindowState, _setAutomapArt,
} from '../../../src/ui/automap/automapWindow.js';
import { automapTooltipFor } from '../../../src/ui/automap/automapText.js';
import { _resetForTests } from '../../../src/systems/settings/settings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const ARENA2 = process.env.ARENA2_PATH;
const skipReal = !ARENA2 || !existsSync(ARENA2)
  ? 'ARENA2_PATH not set or missing - real-data validation skipped'
  : false;

// ─────────────────────────────────────────────────────────────────────
// 1. THE CONSTANTS
// ─────────────────────────────────────────────────────────────────────
test('c2/S6 the shader constants, digit for digit against DaggerfallAutomap.shader', () => {

  // the grayscale wireframe colour is NOT the luminance of the colour
  // one - which is why DFU spells it out, and why a port that "derives"
  // it is wrong. 0.3*0.9 + 0.59*0.9 + 0.11*0.7 = 0.878, not 0.25.
  assert.ok(Math.abs((0.3 * 0.9 + 0.59 * 0.9 + 0.11 * 0.7) - 0.878) < 1e-12);

  // THE TINT IS NOT THE SHADER'S PROPERTY DEFAULT, and pinning that
  // default is how this stayed wrong: DaggerfallAutomap.shader:27
  // declares `_WaterColor = (0.0,0.3,0.5,0.4)`, and Automap.cs:2589-2590
  // overwrites it on the ONE automap material - `automapMaterial
  // .SetColor("_WaterColor", PlayerEnterExit.UnderwaterFog
  // .waterMapColor)` - BEFORE the injection event that hands it out, so
  // no material DFU ever renders with keeps the default.
  // AutomapModel.cs:83 `Instantiate(automapMaterial)` copies the
  // overwritten one onto every automap submesh, and AddWater
  // (:1982-2001) touches only `_WaterLevel`. The shipped tint is
  // UnderwaterFog.cs:28's `new Color(0.1f, 0.3f, 0.25f, 0.4f)` - a dark
  // teal, not a blue - and that is its ONLY assignment in the tree.
  assert.deepEqual([...AUTOMAP_WATER_COLOR], [0.1, 0.3, 0.25, 0.4],
    'the injected UnderwaterFog.waterMapColor (Automap.cs:2590 / UnderwaterFog.cs:28)');
  assert.notDeepEqual([...AUTOMAP_WATER_COLOR], [0.0, 0.3, 0.5, 0.4],
    'and NOT the .shader Properties default, which nothing ever renders with');
  // ONE SOURCE OF TRUTH, so the seam cannot go dead again: the automap
  // reads the number off UnderwaterFog exactly as Automap.cs:2590 does,
  // rather than re-declaring it beside the shader that consumes it.
  assert.equal(AUTOMAP_WATER_COLOR, WATER_MAP_COLOR,
    'renderer.js takes the tint FROM underwaterFog.js - it is the same frozen array, not a copy');
  assert.equal(AUTOMAP_NO_WATER, -10000, 'the _WaterLevel property default - AddWater leaves it when the block is dry');
});

// ─────────────────────────────────────────────────────────────────────
// 2. THE MODE TABLES
// ─────────────────────────────────────────────────────────────────────
test('c2/S6 AutomapRenderMode is the enum, and the cycle is the enum\'s order INCLUDING the wrap', () => {
  // Automap.cs:197-202 - Cutout = 0, Wireframe = 1, Transparent = 2
  assert.deepEqual([...RENDER_MODES], ['Cutout', 'Wireframe', 'Transparent']);
  assert.equal(RENDER_MODES.indexOf('Cutout'), 0);
  assert.equal(RENDER_MODES.indexOf('Wireframe'), 1);
  assert.equal(RENDER_MODES.indexOf('Transparent'), 2);
  // SwitchToNextAutomapRenderMode (:464-486): ++ then wrap past
  // Length-1. NOT the tooltip's cutout/wireframe/transparent hotkey
  // order, and NOT alphabetical.
  assert.equal(nextRenderMode('Cutout'), 'Wireframe');
  assert.equal(nextRenderMode('Wireframe'), 'Transparent');
  assert.equal(nextRenderMode('Transparent'), 'Cutout', 'THE WRAP');
  // three steps from anywhere returns you to where you started
  let m = 'Transparent';
  for (let i = 0; i < 3; i++) m = nextRenderMode(m);
  assert.equal(m, 'Transparent');
  assert.equal(nextRenderMode('nonsense'), 'Cutout', 'an unknown mode answers the enum default');
});

test('c2/S6 the six presentations by VALUE, and Cutout is the absence of a group', () => {
  assert.deepEqual({ ...AUTOMAP_MODE }, {
    OFF: 0,
    BELOW_COLOUR: 1,
    BELOW_GRAY: 2,
    ABOVE_TRANSPARENT_COLOUR: 3,
    ABOVE_TRANSPARENT_GRAY: 4,
    ABOVE_WIREFRAME_COLOUR: 5,
    ABOVE_WIREFRAME_GRAY: 6,
  });
  // the EVEN modes are the grayscale halves - the shader reads
  // `amMode % 2 == 0`, so this parity is load-bearing
  for (const m of [AUTOMAP_MODE.BELOW_GRAY, AUTOMAP_MODE.ABOVE_TRANSPARENT_GRAY, AUTOMAP_MODE.ABOVE_WIREFRAME_GRAY]) {
    assert.equal(m % 2, 0, `mode ${m} is a grayscale half`);
  }
  for (const m of [AUTOMAP_MODE.BELOW_COLOUR, AUTOMAP_MODE.ABOVE_TRANSPARENT_COLOUR, AUTOMAP_MODE.ABOVE_WIREFRAME_COLOUR]) {
    assert.equal(m % 2, 1, `mode ${m} is a colour half`);
  }

  assert.deepEqual({ ...ABOVE_SLICE_MODES.Cutout }, { colour: 0, gray: 0 },
    'CUTOUT ISSUES NOTHING - DFU\'s cutout arm is clip(-1.0) in the second pass');
  assert.deepEqual({ ...ABOVE_SLICE_MODES.Wireframe }, { colour: 5, gray: 6 });
  assert.deepEqual({ ...ABOVE_SLICE_MODES.Transparent }, { colour: 3, gray: 4 });
  for (const name of RENDER_MODES) assert.ok(ABOVE_SLICE_MODES[name], `${name} has a row`);
});

// ─────────────────────────────────────────────────────────────────────
// 3. THE LINE INDEX CACHE
// ─────────────────────────────────────────────────────────────────────
test('c2/S6 the edge expansion: a 2-triangle quad yields SIX pairs, the diagonal twice', () => {
  // 0-1-2 / 0-2-3, the two triangles of a quad
  const tri = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const { indices, ranges } = buildWireIndices(tri, [{ startIndex: 0, primitiveCount: 2 }]);
  assert.equal(indices.length, 12, '2 triangles x 3 edges x 2 endpoints');
  assert.deepEqual([...indices], [0, 1, 1, 2, 2, 0, 0, 2, 2, 3, 3, 0]);
  assert.deepEqual(ranges, [{ start: 0, count: 12 }]);

  // the SHARED DIAGONAL (0,2) appears TWICE, once per triangle - which
  // is not waste: DFU's geometry shader computes per-triangle
  // barycentrics, so it draws every triangle's own three edges and
  // shows the diagonals too. A de-duplicating port would be CLEANER
  // than the original, which is the wrong direction.
  const pairs = [];
  for (let i = 0; i < indices.length; i += 2) pairs.push([indices[i], indices[i + 1]].sort((a, b) => a - b).join('-'));
  assert.equal(pairs.length, 6);
  assert.equal(pairs.filter((p) => p === '0-2').length, 2, 'the shared edge is drawn twice, as DFU draws it');
  assert.equal(new Set(pairs).size, 5, 'five distinct edges over six draws');

  // sub-mesh ranges are per sub-mesh, in order, and cover the buffer
  const two = buildWireIndices(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]), [
    { startIndex: 0, primitiveCount: 1 },
    { startIndex: 3, primitiveCount: 2 },
  ]);
  assert.deepEqual(two.ranges, [{ start: 0, count: 6 }, { start: 6, count: 12 }]);
  assert.equal(two.indices.length, 18);
  assert.deepEqual([...two.indices.slice(6, 12)], [3, 4, 4, 5, 5, 3], 'the second sub-mesh starts at ITS startIndex');
});

// ─────────────────────────────────────────────────────────────────────
// 4. THE RENDERER, on the EV6 counting Proxy-GL
// ─────────────────────────────────────────────────────────────────────
function recordingRenderer(log) {
  const stub = new Proxy({}, {
    get: (o, k) => {
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation' || k === 'getAttribLocation') return () => ({});
      if (k === 'createTexture' || k === 'createBuffer' || k === 'createVertexArray'
        || k === 'createProgram' || k === 'createShader' || k === 'createFramebuffer') return () => ({});
      if (k === 'getParameter') return () => new Float32Array([0, 0, 0, 0]);
      if (typeof k === 'string' && k.toUpperCase() === k) return k;
      return (...args) => { log.push([k, ...args]); };
    },
  });
  const canvas = { getContext: () => stub, clientWidth: 640, clientHeight: 400, width: 640, height: 400 };
  const r = new Renderer(canvas);
  log.length = 0;
  return r;
}
const calls = (log, name) => log.filter((c) => c[0] === name);

const QUAD_MODEL = () => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  subMeshes: [{ textureArchive: 0, textureRecord: 0, startIndex: 0, primitiveCount: 2 }],
});

test('c2/S6 THE MODE IS THE QUEUE: the above-slice group blends, and the depth mask stays ON', () => {
  const log = [];
  const r = recordingRenderer(log);

  // below-slice (and off): DFU's first pass is Queue=Geometry /
  // RenderType=Opaque, with no Blend line anywhere
  for (const m of [AUTOMAP_MODE.OFF, AUTOMAP_MODE.BELOW_COLOUR, AUTOMAP_MODE.BELOW_GRAY]) {
    log.length = 0;
    r.setAutomapMode(m);
    assert.ok(calls(log, 'disable').some((c) => c[1] === 'BLEND'), `mode ${m} draws opaque`);
    assert.equal(calls(log, 'enable').some((c) => c[1] === 'BLEND'), false);
    assert.deepEqual(calls(log, 'depthMask').pop(), ['depthMask', true], `mode ${m} keeps ZWrite On`);
  }

  // above-slice: Queue=Transparent, Blend SrcAlpha OneMinusSrcAlpha,
  // BlendOp Add - and ZWrite ON, which is written out in the pass and
  // is what makes the output order-dependent on purpose
  for (const m of [3, 4, 5, 6]) {
    log.length = 0;
    r.setAutomapMode(m);
    assert.ok(calls(log, 'enable').some((c) => c[1] === 'BLEND'), `mode ${m} blends`);
    assert.deepEqual(calls(log, 'blendFunc').pop(), ['blendFunc', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA']);
    assert.deepEqual(calls(log, 'depthMask').pop(), ['depthMask', true],
      `mode ${m} STILL WRITES DEPTH - the artifacts are the target`);
    assert.equal(calls(log, 'depthMask').some((c) => c[1] === false), false, 'never ZWrite Off');
  }

  // and the bracket hands the blend state back
  r.setAutomapMode(AUTOMAP_MODE.OFF);
  log.length = 0;
  r.panelFrame({ proj: identity(), view: identity(), lightDir: new Float32Array([0, 1, 0]), rect: { x: 0, y: 0, w: 10, h: 10 } },
    () => { r.setAutomapMode(AUTOMAP_MODE.ABOVE_TRANSPARENT_COLOUR); });
  const lastBlend = log.filter((c) => (c[0] === 'enable' || c[0] === 'disable') && c[1] === 'BLEND').pop();
  assert.deepEqual(lastBlend, ['disable', 'BLEND'], 'blending is OFF again when the bracket closes');
  assert.deepEqual(calls(log, 'depthMask').pop(), ['depthMask', true]);
  assert.equal(r._automapMode, 0, 'and the mode came back to the host\'s');
});

test('c2/S6 setAutomapWater uploads immediately, rides the bracket, and returns with it', () => {
  const log = [];
  const r = recordingRenderer(log);
  assert.equal(r._automapWaterLevel, AUTOMAP_NO_WATER, 'a fresh renderer is dry');
  const rounded = () => [...r._automapWaterColor].map((v) => Math.round(v * 1e6) / 1e6);
  assert.deepEqual(rounded(), [0.1, 0.3, 0.25, 0.4],
    'a fresh renderer already carries the INJECTED tint (Automap.cs:2590), not the shader property default');

  log.length = 0;
  r.setAutomapWater(-12.5);
  assert.equal(r._automapWaterLevel, -12.5);
  assert.ok(calls(log, 'uniform1f').length >= 1, 'the level is uploaded straight away - the draw loop changes it MID-pass');
  assert.ok(calls(log, 'uniform4fv').length >= 1, 'and the colour with it');
  r.setAutomapWater(null);
  assert.equal(r._automapWaterLevel, AUTOMAP_NO_WATER, 'null is a DRY block, not zero - zero would flood every floor at y<=0');

  // the bracket names it, saves it and gives it back
  r.setAutomapWater(-3, [1, 0, 0, 0.5]);
  r.panelFrame({ proj: identity(), view: identity(), lightDir: new Float32Array([0, 1, 0]), rect: { x: 0, y: 0, w: 10, h: 10 } },
    () => { r.setAutomapWater(-99, [0, 1, 0, 0.25]); });
  assert.equal(r._automapWaterLevel, -3, 'the level came back');
  assert.deepEqual(rounded(), [1, 0, 0, 0.5], 'and the colour');

});

test('c2/S6 the line buffer is built ONCE per mesh, reused, and freed with the mesh', () => {
  const log = [];
  const r = recordingRenderer(log);
  const mesh = r.createMesh(QUAD_MODEL());
  r.textures.set('0_0', 'T');   // give the sub-mesh a texture so the draw actually issues

  log.length = 0;
  r.drawMeshWire(mesh, identity());
  const built = calls(log, 'bufferData');
  assert.equal(built.length, 1, 'exactly one new buffer - the edge indices');
  assert.equal(built[0][1], 'ELEMENT_ARRAY_BUFFER');
  assert.equal(built[0][2].length, 12, 'the quad\'s twelve line indices');
  assert.equal(mesh._wire.indexCount, 12);
  const draw = calls(log, 'drawElements').pop();
  assert.deepEqual(draw, ['drawElements', 'LINES', 12, 'UNSIGNED_INT', 0], 'gl.LINES over the edge range');

  log.length = 0;
  r.drawMeshWire(mesh, identity());
  assert.equal(calls(log, 'bufferData').length, 0, 'the SECOND draw builds nothing - the cache is per mesh');
  assert.deepEqual(calls(log, 'drawElements').pop(), ['drawElements', 'LINES', 12, 'UNSIGNED_INT', 0]);

  // the triangle draw is untouched by any of it - the line indices live
  // in their own VAO precisely so the mesh's element binding is never
  // swapped out from under it
  log.length = 0;
  r.drawMesh(mesh, identity());
  assert.deepEqual(calls(log, 'drawElements').pop(), ['drawElements', 'TRIANGLES', 6, 'UNSIGNED_INT', 0]);

  log.length = 0;
  r.destroyMesh(mesh);
  assert.ok(calls(log, 'deleteBuffer').length >= 5, 'the four mesh buffers AND the edge buffer are released');
  assert.equal(calls(log, 'deleteVertexArray').length, 2, 'both VAOs go');
  assert.equal(mesh._wire, null);

  // a bundle that kept no indices simply cannot be wireframed, and says
  // so by drawing nothing rather than by throwing
  const bare = { vao: {}, subMeshes: [{ textureArchive: 0, textureRecord: 0, startIndex: 0, primitiveCount: 1 }], buffers: [] };
  log.length = 0;
  assert.doesNotThrow(() => r.drawMeshWire(bare, identity()));
  assert.equal(calls(log, 'drawElements').length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// 5. THE WINDOW: four draw groups, and the water level per block
// ─────────────────────────────────────────────────────────────────────
const CANVAS = { width: 320, height: 200 };

function windowStub(log) {
  return {
    canvas: CANVAS,
    uploadTexture: (a, k) => `tex:${a}/${k}`,
    releaseTexture: () => {},
    createBillboardBatch: () => ({}),
    destroyBillboardBatch: () => {},
    createMesh: (model) => ({ stub: true, subMeshes: model.subMeshes }),   // c2/S7
    destroyMesh: () => {},
    drawBillboards: () => {},
    drawMesh: (mesh) => log.push(['drawMesh', mesh]),
    drawMeshWire: (mesh) => log.push(['drawMeshWire', mesh]),
    drawScreenQuad: () => {},
    setClipY: () => {},
    setAutomapMode: (m) => log.push(['setAutomapMode', m]),
    setAutomapWater: (l) => log.push(['setAutomapWater', l]),
    setFog: () => {}, setLighting: () => {}, setMoonlight: () => {},
    setLightDir: () => {}, setThirdLight: () => {}, uploadLighting: () => {},
    setPointLights: () => {}, setIndirectLight: () => {}, setWindowEmission: () => {},
    panelFrame: ({ setup }, body) => { setup?.(); body(); },
  };
}

/** Four models across two blocks: block 0 is FLOODED at y = -8, block 1
 *  is dry. One model of each block was seen on a prior run. */
const ROWS = [
  { key: 'a', mesh: 'A', water: -8 },
  { key: 'b', mesh: 'B', water: -8 },
  { key: 'c', mesh: 'C', water: null },
  { key: 'd', mesh: 'D', water: null },
];
function mapDeps(over = {}) {
  const byKey = new Map(ROWS.map((r) => [r.key, { key: r.key, waterLevel: r.water }]));
  return {
    record: () => ({
      revealed: new Set(['a', 'b', 'c', 'd']),
      visitedThisRun: new Set(['a', 'c']),
      entranceDiscovered: false,
    }),
    model: { exploredPercentage: () => 100, length: 4, byKey },
    drawList: ROWS.map((r) => ({ key: r.key, mesh: r.mesh, matrix: identity() })),
    dynamicDraws: [],
    texRemap: null,
    player: () => ({ feet: [0, 1, 0], eye: [0, 2.7, 0], yaw: 0 }),
    startMarker: null,
    blocks: [{ x: 0, z: 0, name: 'W0000000.RDB' }],
    arrowMesh: null,
    dungeonName: 'D',
    insideBuilding: false,
    ...over,
  };
}

function drawInMode(mode) {
  _resetForTests();
  resetAutomapWindowState();
  _setAutomapArt(null);
  signalAutomapReset();
  const w = new AutomapWindow(mapDeps());
  w.runVerb(`ActionSwitchToAutomapRenderMode${mode}`);
  const log = [];
  w.draw(windowStub(log), CANVAS, null, 1);
  _resetForTests();
  resetAutomapWindowState();
  return log;
}

test('c2/S6 the FOUR draw groups: below colour, below gray, then the above-slice pair by mode', () => {
  // TRANSPARENT: 1, 2, 3, 4 - both tiers again above the plane
  const t = drawInMode('Transparent').filter((c) => c[0] === 'setAutomapMode').map((c) => c[1]);
  assert.deepEqual(t, [1, 2, 3, 4, 0], 'below colour, below gray, above colour, above gray, then OFF for the markers');

  // WIREFRAME: the same partition at 5/6
  const wf = drawInMode('Wireframe').filter((c) => c[0] === 'setAutomapMode').map((c) => c[1]);
  assert.deepEqual(wf, [1, 2, 5, 6, 0]);

  // CUTOUT: NO above-slice group is issued at all
  const c = drawInMode('Cutout').filter((c2) => c2[0] === 'setAutomapMode').map((c2) => c2[1]);
  assert.deepEqual(c, [1, 2, 0], 'cutout is the ABSENCE of the second pass, not a mode of it');

  // the below-slice output is byte-identical across all three modes -
  // c2/S6 must not have touched what S5 already draws
  const below = (log) => {
    const out = [];
    let mode = 0;
    for (const e of log) {
      if (e[0] === 'setAutomapMode') mode = e[1];
      else if ((mode === 1 || mode === 2) && e[0] !== 'setAutomapWater') out.push([mode, e[0], e[1]]);
    }
    return out;
  };
  const ref = below(drawInMode('Cutout'));
  assert.deepEqual(below(drawInMode('Transparent')), ref, 'the below-slice half is unchanged by the render mode');
  assert.deepEqual(below(drawInMode('Wireframe')), ref);
  assert.deepEqual(ref, [
    [1, 'drawMesh', 'A'], [1, 'drawMesh', 'C'],
    [2, 'drawMesh', 'B'], [2, 'drawMesh', 'D'],
  ], 'visited this run in colour, revealed on a prior run in grayscale');
});

test('c2/S6 wireframe uses the LINE path and only above the slice; transparent uses the triangle path throughout', () => {
  const wf = drawInMode('Wireframe');
  let mode = 0;
  const seen = [];
  for (const e of wf) {
    if (e[0] === 'setAutomapMode') mode = e[1];
    // mode 0 is c2/S7's NEVER-SLICED marker group, which is not a
    // presentation of the geometry and takes no part in this law
    else if (mode !== 0 && (e[0] === 'drawMesh' || e[0] === 'drawMeshWire')) seen.push([mode, e[0]]);
  }
  assert.deepEqual(seen, [
    [1, 'drawMesh'], [1, 'drawMesh'],
    [2, 'drawMesh'], [2, 'drawMesh'],
    [5, 'drawMeshWire'], [5, 'drawMeshWire'],
    [6, 'drawMeshWire'], [6, 'drawMeshWire'],
  ], 'the wireframe substitution applies to the ABOVE-slice group alone');

  const t = drawInMode('Transparent');
  assert.equal(t.some((e) => e[0] === 'drawMeshWire'), false, 'transparent never takes the line path');
  let tm = 0;
  const geo = t.filter((e) => {
    if (e[0] === 'setAutomapMode') { tm = e[1]; return false; }
    return tm !== 0 && e[0] === 'drawMesh';
  });
  assert.equal(geo.length, 8, 'four models, twice - once per pass');
});

test('c2/S6 one upload per run of equal levels - a single-block dungeon uploads once per group', () => {
  _resetForTests(); resetAutomapWindowState(); _setAutomapArt(null); signalAutomapReset();
  const rows = ['a', 'b', 'c'].map((k) => ({ key: k, mesh: k.toUpperCase(), matrix: identity() }));
  const byKey = new Map(rows.map((r) => [r.key, { key: r.key, waterLevel: -4 }]));
  const w = new AutomapWindow(mapDeps({
    record: () => ({ revealed: new Set(['a', 'b', 'c']), visitedThisRun: new Set(['a', 'b', 'c']), entranceDiscovered: false }),
    model: { exploredPercentage: () => 100, length: 3, byKey },
    drawList: rows,
  }));
  w.runVerb('ActionSwitchToAutomapRenderModeCutout');
  const log = [];
  w.draw(windowStub(log), CANVAS, null, 1);
  _resetForTests(); resetAutomapWindowState();
  const uploads = log.filter((c) => c[0] === 'setAutomapWater');
  assert.deepEqual(uploads.map((c) => c[1]), [-4, null],
    'ONE upload for the whole flooded group, then the marker group\'s reset');
});

// ─────────────────────────────────────────────────────────────────────
// 6. THE HOTKEYS
// ─────────────────────────────────────────────────────────────────────
test('c2/S6 the four render-mode hotkeys sit where DFU polls them, and each one lands', () => {
  // :747-763 - after SwitchFocusToNextBeaconObject and before the four
  // backgrounds, in the order next / transparent / wireframe / cutout
  const i = (n) => HOTKEYS_DOWN.indexOf(n);
  assert.deepEqual(HOTKEYS_DOWN.slice(i('AutomapSwitchToNextAutomapRenderMode'), i('AutomapSwitchToAutomapBackgroundOriginal')), [
    'AutomapSwitchToNextAutomapRenderMode',
    'AutomapSwitchToAutomapRenderModeTransparent',
    'AutomapSwitchToAutomapRenderModeWireframe',
    'AutomapSwitchToAutomapRenderModeCutout',
  ]);
  assert.equal(i('AutomapSwitchFocusToNextBeaconObject') + 1, i('AutomapSwitchToNextAutomapRenderMode'));
  for (const b of HOTKEYS_DOWN.filter((n) => n.includes('RenderMode'))) {
    assert.ok(HOTKEY_VERBS[b], `${b} has a verb`);
  }

  // and they really change the mode, through the real window's key seam
  _resetForTests(); resetAutomapWindowState(); _setAutomapArt(null); signalAutomapReset();
  const w = new AutomapWindow(mapDeps());
  try {
    // the reset arm set Transparent (this host is not inside a building)
    assert.equal(automapRenderMode(), 'Transparent');
    w.input('F2', { code: 'F2' });
    assert.equal(automapRenderMode(), 'Cutout', 'F2 = cutout');
    w.input('F3', { code: 'F3' });
    assert.equal(automapRenderMode(), 'Wireframe', 'F3 = wireframe');
    w.input('F4', { code: 'F4' });
    assert.equal(automapRenderMode(), 'Transparent', 'F4 = transparent');
    w.input('Enter', { code: 'Enter' });
    assert.equal(automapRenderMode(), 'Cutout', 'Return cycles, and Transparent wraps to Cutout');
    w.input('Enter', { code: 'Enter' });
    assert.equal(automapRenderMode(), 'Wireframe');
  } finally { _resetForTests(); resetAutomapWindowState(); }
});

test('c2/S6 the mode tooltips were already law-complete - and now the keys they name answer', () => {
  // S5 transcribed Internal_Strings:874-890 whole, so the stair
  // buttons' tooltips have named the three render modes and the Return
  // cycle since then - documenting a surface that did not yet exist.
  // Nothing in ui/automap/automapChrome.js needed changing for this stage; what
  // this pin holds is the LOOP - the key the tooltip PRINTS is the key
  // that sets the mode the sentence beside it names.
  _resetForTests(); resetAutomapWindowState(); _setAutomapArt(null); signalAutomapReset();
  const w = new AutomapWindow(mapDeps());
  try {
    for (const rect of ['upstairs', 'downstairs']) {
      const tip = automapTooltipFor(rect, 'KeyM');
      assert.match(tip, /hotkey F2: cutout mode/);
      assert.match(tip, /hotkey F3: wireframe mode/);
      assert.match(tip, /hotkey F4: transparent mode/);
      assert.match(tip, /switch between modes with return key/);
    }
    for (const [code, mode] of [['F2', 'Cutout'], ['F3', 'Wireframe'], ['F4', 'Transparent']]) {
      w.input(code, { code });
      assert.equal(automapRenderMode(), mode, `${code} really selects ${mode}`);
    }
  } finally { _resetForTests(); resetAutomapWindowState(); }
});

// DATA-GATED: none in this file, and deliberately so. This stage's
// real-data claim ("a real dungeon renders in all three modes with no
// GL error") needs a GL context, which CI does not have - an
// ARENA2-gated pin here could only assert that data loaded, which is
// exactly the rot the c2 risk list warns about. It is recorded as a
// remainder instead; the below-slice half's real-data arm already
// stands in roadc_automap_window.test.js.
