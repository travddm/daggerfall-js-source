// A spell missile in flight when the player leaves a building goes with the building.

import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import { clearInteriorMissiles } from '../../src/scenes/interior-missiles.ts';
import { getStaticDoors } from '../../src/world/staticDoors.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
const damageEffect = {
  type: 4,
  subType: 0,
  magnitudeBaseLow: 10,
  magnitudeBaseHigh: 10,
  magnitudeLevelBase: 1,
  magnitudeLevelHigh: 1,
  magnitudePerLevel: 1,
  durationBase: 0,
  durationMod: 0,
  durationPerLevel: 1,
  chanceBase: 0,
  chanceMod: 0,
  chancePerLevel: 1,
};
const bolt = { name: 'Shock', index: 8, element: 2, rangeType: 2, effects: [damageEffect] };

function engine() {
  const hurt = { player: 0 };
  const player = {
    isPlayer: true,
    level: 1,
    health: 500,
    maxHealth: 500,
    magicka: 500,
    maxMagicka: 500,
    skills: new Array(40).fill(50),
    skillUses: new Array(40).fill(0),
    stats: { intelligence: 50, willpower: 50, endurance: 50 },
    career: {},
    activeEffects: [],
  };
  const sinks = { heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {} };
  const magic = createPlayerMagic({
    renderer: { createBillboardBatch: () => ({ origin: null }), destroyBillboardBatch: () => {} },
    audio: { playOneShot() {}, play3d() {}, playOneShotId() {}, play3dId() {} },
    getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }),
    uploadRecord: () => {},
    uploadRecordFrame: () => {},
    collider: { raycast: () => Infinity },
    playerEntity: player,
    playerSinks: { ...sinks, hurt: (n) => (hurt.player += n) },
    say: () => {},
    surfacePlayer: () => {},
    foes: () => [],
    foeSinks: () => sinks,
    absorbCtx: () => ({ inside: true, day: false }),
    rolls: () => 0.99,
  });
  return { magic, hurt };
}

const caster = { ai: { feet: [0, 0, 0], height: 1.8, target: null }, entity: { level: 5 } };
const fly = (magic) => {
  for (let i = 0; i < 20; i++) magic.update(0.05, [0, 0, 6]);
};

test('a foe bolt cleared with the interior never reaches the player (DFU InstantiateSpellMissile parents it to the interior)', () => {
  const { magic, hurt } = engine();
  magic.fireEnemyMissile([0, 0.9, 0.5], [0, 0, 1], bolt, 5, caster);
  clearInteriorMissiles(magic);
  fly(magic);
  assert.equal(hurt.player, 0);
});

test('the same bolt left in flight strikes the player, so the test above measures the clear', () => {
  const { magic, hurt } = engine();
  magic.fireEnemyMissile([0, 0.9, 0.5], [0, 0, 1], bolt, 5, caster);
  fly(magic);
  assert.ok(hurt.player > 0);
});

test('a host with no cast engine has nothing to clear', () => {
  assert.doesNotThrow(() => clearInteriorMissiles(null));
});

// The mode machine over a stub host, as test/systems/fb1001b_vampsun.test.js builds it: one tavern room with a floor.
const noop = () => {};
const deep = () =>
  new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : deep()),
    apply: () => deep(),
    construct: () => deep(),
  });

async function buildModes(overrides) {
  globalThis.addEventListener ??= noop;
  globalThis.removeEventListener ??= noop;
  globalThis.fetch = async () => {
    throw new Error('no ARENA2 in this test');
  };
  const { createWorldModes } = await import('../../src/scenes/worldModes.js');
  globalThis.window = globalThis;
  const canvas = {
    width: 640,
    height: 400,
    clientWidth: 640,
    clientHeight: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }),
  };
  const player = {
    pos: [0, 0, 0],
    eye: [0, 1.6, 0],
    height: 1.8,
    eyeAt: () => [0, 1.6, 0],
    feetAt: () => [0, 0, 0],
    spawn: noop,
    collider: null,
    update: noop,
    vel: [0, 0, 0],
    grounded: true,
  };
  return createWorldModes({
    canvas,
    renderer: deep(),
    player,
    cam: { yaw: 0, pitch: 0, pos: [0, 1.6, 0] },
    keys: new Set(),
    latch: { edge: deep() },
    blocks: null,
    doorTargets: () => [],
    baseCollider: () => ({ raycast: () => Infinity, heightAt: () => 0 }),
    ...overrides,
  });
}
function tavern() {
  const matrix = new Float32Array(16);
  matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  const [door] = getStaticDoors(
    {
      doors: [
        {
          type: 0,
          index: 0,
          vert0: { x: -0.5, y: 0, z: 0 },
          vert2: { x: 0.5, y: 2, z: 0.2 },
          normal: { x: 0, y: 0, z: 1 },
        },
      ],
    },
    7,
    2,
    matrix,
  );
  const interior = {
    header: { num3dObjectRecords: 1 },
    block3dObjectRecords: [
      { modelIdNum: 42, objectType: 0, xPos: 0, yPos: 0, zPos: 0, xRotation: 0, yRotation: 0, zRotation: 0 },
    ],
    blockFlatObjectRecords: [{ textureArchive: 199, textureRecord: 8, xPos: 0, yPos: 0, zPos: 100 }],
    blockDoorRecords: [],
    blockPeopleRecords: [],
    blockSection3Records: [],
  };
  const dfBlock = { index: 7, name: 'TVRNAL01.RMB', rmbBlock: { subRecords: [{}, {}, { interior }] } };
  const entry = { door, dfBlock, recordIndex: 2, climateBase: 0, season: 0, dfLocation: null, group: 'g' };
  const saved = {
    door: { blockIndex: door.blockIndex, recordIndex: door.recordIndex, doorIndex: door.doorIndex, buildingKey: 7 },
    building: {
      buildingKey: 7,
      buildingType: BUILDING_TYPES.Tavern,
      regionIndex: 0,
      quality: 10,
      factionId: 0,
      nameSeed: 1,
    },
  };
  const floor = {
    modelIdNum: 42,
    positions: new Float32Array([-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    subMeshes: [],
    doors: [],
  };
  const cpuModels = new Map();
  const pipeline = {
    getGpuMesh: async (id) => (id === 42 ? (cpuModels.set(42, floor), { id }) : null),
    cpuModels,
    getTexture: async () => null,
    uploadRecord: noop,
    uploadRecordFrame: noop,
    arch: null,
    palette: null,
    getMachineryParts: noop,
  };
  return { entry, saved, pipeline };
}

/** Quiet while the stand-in world warns of the ARENA2 it has not got. */
async function quietly(fn) {
  const saved = [console.warn, console.error, console.log];
  console.warn = console.error = console.log = () => {};
  try {
    return await fn();
  } finally {
    [console.warn, console.error, console.log] = saved;
  }
}

/** A player standing in the tavern, and how many times the cast engine was told to drop its missiles. */
async function inTavern() {
  const counts = { cleared: 0 };
  const magic = new Proxy(
    {},
    { get: (t, k) => (k === 'clearMissiles' ? () => counts.cleared++ : k === 'then' ? undefined : deep()) },
  );
  const { entry, saved, pipeline } = tavern();
  const modes = await quietly(() => buildModes({ doorTargets: () => [entry], pipeline, magic }));
  assert.equal(await quietly(() => modes.restoreInterior(saved, [0, 0, 0])), true);
  assert.equal(modes.mode, 'interior');
  return { modes, counts };
}

test('walking out of the door clears the missiles in flight', async () => {
  const { modes, counts } = await inTavern();
  assert.equal(modes.unstuck(), true, 'the exit through the door the player came in by');
  await quietly(() => modes.frame(0.016, 0));
  assert.equal(modes.mode, 'exterior');
  assert.equal(counts.cleared, 1);
});

test('a forced exit (a quest teleport or a load) clears them too', async () => {
  const { modes, counts } = await inTavern();
  await quietly(() => modes.forceExitToExterior({ cacheScene: false }));
  assert.equal(modes.mode, 'exterior');
  assert.equal(counts.cleared, 1);
});
