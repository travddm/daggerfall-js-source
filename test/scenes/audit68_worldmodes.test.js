// AUDIT 68, the whole-tree sweep - cluster "worldmodes"
// (S23, src/scenes/worldModes.js): the mode host's door transitions (a
// failed entry that left its latches, a build published after the world
// moved, a forced exit the ambience never heard), the summoning
// punishment that stood nowhere outside a building, and three host doors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStaticDoors } from '../../src/world/staticDoors.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const slice = (src, from, to) => {
  const i = src.indexOf(from);
  assert.ok(i >= 0, `${from} not found`);
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, `${to} not found after ${from}`);
  return src.slice(i, j);
};

/** The mode machine over a stub host - the shape S23's verifier drove it
 *  with. worldModes reaches the browser at import (art preloads, the
 *  window seams), so the globals it touches are stood first. */
async function buildModes(overrides = {}) {
  const noop = () => {};
  const deep = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : deep()),
    apply: () => deep(),
    construct: () => deep(),
  });
  globalThis.addEventListener ??= noop;
  globalThis.removeEventListener ??= noop;
  globalThis.fetch = async () => { throw new Error('no ARENA2 in this test'); };
  const { createWorldModes } = await import('../../src/scenes/worldModes.js');
  globalThis.window = globalThis;
  const canvas = { width: 640, height: 400, clientWidth: 640, clientHeight: 400, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }) };
  const player = { pos: [0, 0, 0], eye: [0, 1.6, 0], height: 1.8, eyeAt: () => [0, 1.6, 0], feetAt: () => [0, 0, 0], spawn: noop, collider: null };
  return createWorldModes({
    canvas, renderer: deep(), player, cam: { yaw: 0, pitch: 0, pos: [0, 1.6, 0] }, keys: new Set(), latch: { edge: deep() },
    blocks: null,
    pipeline: { getGpuMesh: async () => null, cpuModels: new Map(), getTexture: async () => null, uploadRecord: noop, uploadRecordFrame: noop, arch: null, palette: null, getMachineryParts: noop },
    doorTargets: () => [], baseCollider: () => ({ raycast: () => Infinity, heightAt: () => 0 }),
    ...overrides,
  });
}

/** One building door as the layout mints it (GetStaticDoors over a
 *  model's door array), the entry the host's doorTargets carries, and
 *  the save's IS1 identity for it (interiorIdentity's two fields). */
function tavernDoor() {
  const matrix = new Float32Array(16); matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  const [door] = getStaticDoors({ doors: [{ type: 0, index: 0, vert0: { x: -0.5, y: 0, z: 0 }, vert2: { x: 0.5, y: 2, z: 0.2 }, normal: { x: 0, y: 0, z: 1 } }] }, 7, 2, matrix);
  const dfBlock = { index: 7, name: 'TVRNAL01.RMB', rmbBlock: { subRecords: [{}, {}, { interior: { block3dObjectRecords: [{ modelIdNum: 42 }] } }] } };
  const entry = { door, dfBlock, recordIndex: 2, climateBase: 0, season: 0, dfLocation: null, group: 'g' };
  const saved = {
    door: { blockIndex: door.blockIndex, recordIndex: door.recordIndex, doorIndex: door.doorIndex, buildingKey: 7 },
    building: { buildingKey: 7, buildingType: BUILDING_TYPES.Tavern, regionIndex: 0, quality: 10, factionId: 0, nameSeed: 1 },
  };
  return { entry, saved };
}

test('AUDIT 68 X3-transition-build-race: the gate runs one build at a time and a moved world stales the pending one', async () => {
  const { createTransitionGate } = await import('../../src/scenes/transitionGate.js');
  const gate = createTransitionGate();
  const t1 = await gate.begin();
  assert.equal(gate.valid(t1), true);
  // a second request WAITS for the first to unwind - never overlaps it
  let second = null;
  const p2 = gate.begin().then((t) => { second = t; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(second, null, 'the second build started while the first held the gate');
  gate.abort();
  assert.equal(gate.valid(t1), false, 'a build the world moved under is stale');
  gate.end();
  await p2;
  assert.equal(second, null, 'a request taken before the world moved never holds the gate');
  await gate.settled();
  const t3 = await gate.begin();
  assert.equal(gate.valid(t3), true, 'a request after the move runs');
  gate.end();
});

test('AUDIT 68 review R-scenes-gate-queued-publish-orphans: a build that PUBLISHES stales every request queued behind it; one that fails does not', async () => {
  const { createTransitionGate } = await import('../../src/scenes/transitionGate.js');
  const gate = createTransitionGate();
  let release = null;
  const first = gate.run(() => new Promise((r) => { release = r; }));
  let secondBuilt = false;
  const second = gate.run(async () => { secondBuilt = true; return true; });
  await Promise.resolve(); await Promise.resolve();
  release(true);
  assert.equal(await first, true);
  assert.equal(await second, false, 'mutants: no generation bump on publish - the queued door builds over the live context');
  assert.equal(secondBuilt, false);
  // a FAILED build moved nothing: the request behind it still runs
  let releaseFail = null;
  const failed = gate.run(() => new Promise((r) => { releaseFail = r; }));
  let thirdBuilt = false;
  const third = gate.run(async () => { thirdBuilt = true; return true; });
  await Promise.resolve(); await Promise.resolve();
  releaseFail(false);
  assert.equal(await failed, false);
  assert.equal(await third, true);
  assert.equal(thirdBuilt, true, 'ASYNC NEVER DROPS: a request behind a failed build is not discarded');
});

test('AUDIT 68 X3-transition-build-race: the mode host serializes its door builds and a teleport or load abandons the pending one', async () => {
  // Driven through the host: the first restore's build hangs at its
  // model fetch while a second is asked for; the host moves the world
  // (the teleport's abortTransition); the first fails, and neither the
  // stale second request nor the first ever publishes.
  const { entry, saved } = tavernDoor();
  let fetches = 0;
  let fail = null;
  const modes = await buildModes({
    doorTargets: () => [entry],
    pipeline: { getGpuMesh: () => { fetches++; return new Promise((_, rej) => { fail = rej; }); }, cpuModels: new Map(), getTexture: async () => null, uploadRecord: () => {}, uploadRecordFrame: () => {}, arch: null, palette: null, getMachineryParts: () => {} },
  });
  const err = console.error; console.error = () => {};
  try {
    const first = modes.restoreInterior(saved, [0, 0, 0]);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(fetches, 1, 'the first build is in flight');
    const second = modes.restoreInterior(saved, [0, 0, 0]);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(fetches, 1, 'the second build waits its turn instead of overlapping the first');
    modes.abortTransition();
    fail(new Error('fetch failed'));
    assert.equal(await first, false);
    assert.equal(await second, false);
    assert.equal(fetches, 1, 'the request made before the world moved is never built');
    await modes.transitionSettled();
    assert.equal(modes.transitioning, false);
    assert.equal(modes.mode, 'exterior');
  } finally { console.error = err; }
});

test('WD3 (AUDIT WD3 G3): an inside save finds its building by its KEY when the block\'s index moved - a block a world-data mod adds is numbered in the order a session first reads it, so the saved index can name nothing (or another added block) next session', async () => {
  const { entry, saved } = tavernDoor();
  const run = async (key) => {
    const said = [];
    const modes = await buildModes({
      doorTargets: () => [entry],
      buildingDataForDoor: () => ({ buildingKey: key }),
      pipeline: { getGpuMesh: async () => { throw new Error('fetch failed'); }, cpuModels: new Map(), getTexture: async () => null, uploadRecord: () => {}, uploadRecordFrame: () => {}, arch: null, palette: null, getMachineryParts: () => {} },
    });
    const err = console.error; console.error = (...a) => said.push(a.join(' '));
    try { await modes.restoreInterior({ ...saved, door: { ...saved.door, blockIndex: saved.door.blockIndex + 36 } }, [0, 0, 0]); } finally { console.error = err; }
    return said.some((l) => l.includes('restoreInterior failed'));   // the entry was reached (its build then failed, as above)
  };
  assert.equal(await run(7), true, 'the saved building, by its key, though its block\'s index moved');
  assert.equal(await run(8), false, 'another building at the same record and door is not it');
});
