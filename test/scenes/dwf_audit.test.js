// DW-F (2026-09-26) - ILIAC PUDDLE NO MORE 1.2.2's CLOSING AUDIT (jet082), PINNED: the four readers' findings against
// the assembly, each fixed here or recorded as a Port-Ledger departure (bible/03-World/Deep-Waters.md, "The close").
// The expectations are the IL's, spelled out here.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../../src/world/underwater/underwaterLoot.js';
import { createDecorTextureSource } from '../../src/scenes/deepWater/deepWatersDecor.js';
import { createRandomWeapon } from '../../src/systems/loot/loot.js';
import { createDeepWatersPlayer } from '../../src/scenes/deepWater/deepWatersPlayer.js';
import { surfaceLook, underwaterFogColor, lookSettings } from '../../src/world/deepWater/deepWaterLook.js';
import { loadStarted, loadFinished, teleported, canRunLightRuntimeWork, canRunHeavyRuntimeWork, resetDeepWaterRuntime } from '../../src/world/deepWater/deepWaterRuntime.js';
import { trySpawnTreasureGuards } from '../../src/scenes/deepWater/deepWatersEncounters.js';
import { Renderer, BB_SURFACE_UNIT } from '../../src/render/renderer.js';
import { EL_BB_FS } from '../../src/render/enhancedLighting.js';
import { COLUMN_GLSL } from '../../src/render/columnGlsl.js';
import { identity } from '../../src/world/mat4.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('AUDIT DW-F E5-2: the replacement cache waits for the file - a record asked before its archive loads is not held to its classic picture for the session (mutants: the empty answer cached; the warm deciding the kind before the file)', async () => {
  let arrive;
  const file = { recordCount: 50, getFrameCount: () => 1, getSize: () => ({ width: 8, height: 8 }), getDFBitmap: () => ({}), getColor32: () => ({ width: 8, height: 8, colors: new Uint8ClampedArray(256) }) };
  const src = createDecorTextureSource({
    getTexture: (() => { const once = new Promise((r) => { arrive = () => r(file); }); return () => once; })(),   // the loader keeps its file
    scaledSize: () => ({ w: 1, h: 1 }), replacementSize: () => ({ w: 2, h: 3 }),
    replacementsOn: () => true, hasReplacement: (a, r, f) => f === 0,
    loadReplacement: async () => ({ width: 8, height: 8, colors: new Uint8ClampedArray(256) }),
    createTexture: (frames) => ({ tex: {}, frames: frames.length }),
  });
  const rec = { archive: 216, record: 3 };
  assert.equal(src.kindOf(rec), 'archive', 'before the file: the classic answer - and not kept');
  const spawn = { positions: [rec], warm: 0 };
  assert.equal(src.warm(spawn), true, 'the warm waits on the file');
  arrive();
  await tick(); await tick();
  assert.equal(src.texture(rec, 'archive'), null, 'no classic picture was built for it meanwhile');
  assert.equal(src.kindOf(rec), 'replacement', 'the file in: the replacement a texture pack registered');
  assert.deepEqual(src.replacement(rec).size, { w: 2, h: 3 });
  for (let i = 0; i < 20 && src.warm(spawn); i++) await tick();
  assert.ok(src.texture(rec, 'replacement'), 'and its picture built');
  assert.equal(src.visualHeight(rec) > 0, true, 'DW-E2\'s authored height reads the replacement too');
});

test('AUDIT DW-F E5-3: CreateRandomWeapon draws RandomMaterial for every slot before the arrow test - an arrow\'s stack is the THIRD draw (mutant: the arrow arm skipping the material draw)', () => {
  // slot 18 (0.95 of 19), RandomMaterial's Range(0, 256) at 0.99, the stack's Range(1, 21) at 0.5 -> 11
  const arrows = createRandomWeapon(1, seq(0.95, 0.99, 0.5));
  assert.equal(arrows.templateIndex, 131);
  assert.equal(arrows.stackCount, 11, 'the stack reads the third value, not the material\'s');
  assert.equal(arrows.material, 0, 'and the material drawn is thrown away (nativeMaterialValue = 0)');
});

test('AUDIT DW-F E5-6: the loot\'s unordered compares are the C#\'s own forms - a NaN takes the branch the IL\'s .un takes (mutants: an ordered negation back)', () => {
  const col = (depth, oceanY = 100, floor = 50) => ({ depth, oceanY, renderedSeafloorY: floor, entry: {} });
  // ResolveSeafloorAt: bge.un past `depth < 2` and `ocean - floor < 2` - a NaN goes on
  assert.ok(L.resolveSeafloorAt(col(NaN)), 'a NaN depth is no "under 2 m"');
  assert.ok(L.resolveSeafloorAt(col(10, NaN)), 'nor a NaN sea');
  assert.equal(L.resolveSeafloorAt(col(1.9)), null);
  assert.equal(L.resolveSeafloorAt(col(10, 51.5, 50)), null);
  // IsDeepEnoughForWreck: clt.un; ceq - `depth >= threshold`, false for a NaN
  assert.equal(L.isDeepEnoughForWreck({ depth: NaN }, 200), false);
  assert.equal(L.isDeepEnoughForWreck({ depth: 100 }, 200), true);
  assert.equal(L.isDeepEnoughForWreck({ depth: 99.9 }, 200), false);
  // TryPickFogAheadPoint: blt.un past `reveal >= max` - a NaN reveal is not "past the fog's reach"
  assert.ok(L.tryPickFogAheadPoint([0, 0, 0], 130, [0, 0, 1], NaN, () => 0.5), 'the IL goes on past the test');
  assert.equal(L.tryPickFogAheadPoint([0, 0, 0], 130, [0, 0, 1], 128, () => 0.5), null, 'a reveal of 130 is the reach');
});

/** A sea of one column kind: x in [0, 100] is 24 m deep (a floor at 10), the rest dry (dwc_fog's). */
const OCEAN = 34;
function fakeSwimmer() {
  const col = (entry, lx) => (lx >= 0 && lx <= 100 ? { oceanY: OCEAN, seafloorY: 10, renderedSeafloorY: 10, depth: OCEAN - 10, entry } : null);
  const host = { waterColumn: col, rawWaterColumn: col };
  return createDeepWatersPlayer({
    host, locate: (x, z) => ({ entry: {}, lx: x, lz: z, baseY: 0 }), seaY: () => OCEAN, terrainGroundAt: () => -Infinity,
    collider: { raycastHit: () => null }, settings: () => ({ fogStrength: 0.5, fogDistance: 0.3 }),
  });
}

test('AUDIT DW-F CD-7: the underside\'s _UnderwaterFogColor is latched - configured at a settings change and at every surface built, never by the frame\'s refresh (mutants: the latch recomputed each frame; the surface build not re-latching)', () => {
  const s = lookSettings(() => undefined);
  assert.deepEqual(surfaceLook(s, { daylight: 0.3, undersideFogColor: [0.1, 0.2, 0.3, 1] }).fogColor, [0.1, 0.2, 0.3, 1], 'the latched colour');
  assert.deepEqual(surfaceLook(s, { daylight: 0.3 }).fogColor, underwaterFogColor(0.3), 'absent: this frame\'s');
  assert.deepEqual(surfaceLook(s, { daylight: 0.3, undersideFogColor: [0.1, 0.2, 0.3, 1] }).undersideColor, surfaceLook(s, { daylight: 0.3 }).undersideColor, 'the tint is the dynamic refresh\'s, every frame');
});

test('AUDIT DW-F E-2: a load\'s own teleport does not open the work mid-load - SaveLoadManager.LoadInProgress holds light work shut until OnLoad (mutant: the load read off the clock again)', () => {
  resetDeepWaterRuntime();
  loadStarted();
  assert.equal(canRunLightRuntimeWork(true), false, 'OnStartLoad');
  teleported(100);   // SaveLoadManager.cs:1475 -> Respawner -> OnTeleportToCoordinates, in the middle of the load
  assert.equal(canRunLightRuntimeWork(true), false, 'the load is still in progress');
  assert.equal(canRunHeavyRuntimeWork(200, true), false);
  loadFinished(300);
  assert.equal(canRunLightRuntimeWork(true), true, 'OnLoad');
  assert.equal(canRunHeavyRuntimeWork(301, true), false, 'the grace');
  assert.equal(canRunHeavyRuntimeWork(301.5, true), true);
  assert.equal(canRunLightRuntimeWork(false), false, 'a window up is no work either');
  resetDeepWaterRuntime();
});

test('AUDIT DW-F E-3: a treasure guard lives with its column\'s terrain - the request names the pixel, the world keeps the guard against it and an unload takes it (mutants: the entry dropped; the unload leaving the guards)', () => {
  const entry = { px: 7, py: 9 };
  const f = { time: 0, dt: 0.1, frame: 0, roll: () => 0.4, playerPos: [0, 0, 0], column: () => ({ oceanY: 34, seafloorY: -26, depth: 60, entry }), renderedSeafloorY: (c) => c.seafloorY, visibleDistance: 70, raycast: () => null };
  const stood = [];
  const n = trySpawnTreasureGuards({ f, centre: [100, 0, 100], settings: { on: true, frequency: 0.3, waterDepth: 200 }, canRunHeavy: true, playerPos: [0, 0, 0], vision: 70, view: null, spawnGuard: (o) => { stood.push(o); return {}; } });
  assert.ok(n > 0 && stood.every((o) => o.entry === entry), 'SpawnTreasureGuardEnemy: the column\'s Parent');
});

/** A renderer over a GL that answers everything and records the uniform uploads (by name) and the texture binds (by unit). */
function recordingRenderer(log) {
  let active = 0;
  const TEXTURE0 = 33984;
  const stub = new Proxy({}, {
    get: (o, k) => {
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (p, n) => n;
      if (k === 'getAttribLocation') return () => 0;
      if (['createTexture', 'createBuffer', 'createVertexArray', 'createProgram', 'createShader', 'createFramebuffer'].includes(k)) return () => ({});
      if (k === 'activeTexture') return (u) => { active = u - TEXTURE0; };
      if (k === 'bindTexture') return (t, tex) => log.push({ fn: 'bind', unit: active, tex });
      if (k === 'drawElements') return () => log.push({ fn: 'draw' });
      if (typeof k === 'string' && k.startsWith('uniform')) return (loc, ...a) => log.push({ fn: k, name: loc, args: a });
      if (k === 'TEXTURE0') return TEXTURE0;
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;
      return () => {};
    },
  });
  return new Renderer({ getContext: () => stub, clientWidth: 320, clientHeight: 200, width: 320, height: 200 });
}

test('AUDIT DW-F E-1: a foe under the carved sea takes the water column\'s share - DFU\'s Daggerfall/Billboard writes the depth texture the top reads; the flat\'s share is the floor\'s, on both lanes\' programs (mutants: the share dropped from either program; after the underwater fog)', () => {
  assert.ok(EL_BB_FS.includes(COLUMN_GLSL), 'the lane\'s flats too');
  assert.match(EL_BB_FS, /outColor = vec4\(dwColumn\(elFinish\(lit, vBBWorld\), vBBWorld\), alpha\);/, 'on the finished display colour (the sea\'s fog is off whenever the share is on)');
});

test('AUDIT DW-F E-1: the renderer hands the column to the flats the host flagged and to no other - the switch per batch, the surface on its own unit, a frame\'s; and the switch a flat draws with is the one it asked for across calls and frames, the program holding its last upload (mutants: every flat switched; the surface on the picture\'s unit; the frame kept; the block forgets the switch\'s shadow)', () => {
  const log = [];
  const r = recordingRenderer(log);
  const surf = { surface: true };
  const flat = (x) => { const b = r.createBillboardBatch(5, 1, { w: 1, h: 2 }, [[x, 0, 0]]); r.textures.set('5_1', { t: 1 }); return b; };
  const a = flat(0), b = flat(1);
  a.dwColumn = true; b.dwColumn = false;
  r.beginFrame(identity(), identity(), new Float32Array([0, 1, 0]));
  r.setWaterColumn({ seaY: 34, topColor: [0.1, 0.3, 0.35, 0.42], topVision: 18, surfaceScroll: [0.2, 0.1], surfaceTexture: surf, origin: [0, 0, 0] });
  log.length = 0;
  r.drawBillboards([a, b], new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0]));
  const on = log.filter((e) => e.name === 'uColumnOn').map((e) => e.args[0]);
  assert.deepEqual(on, [0, 1, 0], 'off, on for the flagged flat, off again for the other');
  assert.ok(log.some((e) => e.fn === 'bind' && e.unit === BB_SURFACE_UNIT && e.tex === surf), 'the surface texture on its reserved unit');
  assert.ok(log.some((e) => e.name === 'uSurfaceTex' && e.args[0] === BB_SURFACE_UNIT));
  assert.notEqual(BB_SURFACE_UNIT, 0); assert.notEqual(BB_SURFACE_UNIT, 1);
  assert.deepEqual(log.find((e) => e.name === 'uSeaY').args, [34]);
  // the next frame, none set: nothing switched on, nothing bound there
  r.beginFrame(identity(), identity(), new Float32Array([0, 1, 0]));
  log.length = 0;
  r.drawBillboards([a, b], new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0]));
  assert.ok(log.filter((e) => e.name === 'uColumnOn').every((e) => e.args[0] === 0), 'beginFrame clears it');
  assert.ok(!log.some((e) => e.fn === 'bind' && e.unit === BB_SURFACE_UNIT));
  // AUDIT PRE-MERGE 0928 M3: TWO FRAMES, TWO CALLS EACH. A uniform is the program's and holds until the next upload
  // to it, so what a draw reads is the last `uColumnOn` sent before it, whichever call sent it. Each frame's first call
  // opens on the flagged flat and its second ends on it - so the next frame opens on a program left switched on, under
  // a new block that switches it off: the renderer's shadow of the switch must be reset with it, or the flagged flat
  // takes the frame's first draw with the switch the block left.
  let sw = 0;
  const draws = (batches) => {
    log.length = 0;
    r.drawBillboards(batches, new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0]));
    const read = [];
    for (const e of log) { if (e.name === 'uColumnOn') sw = e.args[0]; if (e.fn === 'draw') read.push(sw); }
    return read;
  };
  for (let f = 0; f < 2; f++) {
    r.beginFrame(identity(), identity(), new Float32Array([0, 1, 0]));
    r.setWaterColumn({ seaY: 34, topColor: [0.1, 0.3, 0.35, 0.42], topVision: 18, surfaceScroll: [0.2, 0.1], surfaceTexture: surf, origin: [0, 0, 0] });
    assert.deepEqual(draws([a, b]), [1, 0], `frame ${f}, the first call: the flagged flat on, the other off`);
    assert.deepEqual(draws([b, a]), [0, 1], `frame ${f}, the second call: the other off, the flagged flat on - the frame ends switched on`);
  }
});

