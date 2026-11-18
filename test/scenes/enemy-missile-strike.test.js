// A foe's spell missile above ground lands on the foe it was loosed at, not on the player behind it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import { PLAYER_TARGET } from '../../src/characters/enemy/enemyTargets.js';

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

const foeAt = (z, target = null) => ({
  dead: false,
  ai: { feet: [0, 0, z], height: 1.8, target },
  entity: {
    level: 1,
    health: 40,
    maxHealth: 40,
    magicka: 0,
    maxMagicka: 0,
    skills: new Array(40).fill(30),
    stats: { willpower: 30 },
    career: {},
    activeEffects: [],
  },
});

function rig(foes) {
  const hurt = new Map();
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
  const noop = { heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {} };
  const magic = createPlayerMagic({
    renderer: { createBillboardBatch: () => ({ origin: null }), destroyBillboardBatch: () => {} },
    audio: { playOneShot() {}, play3d() {}, playOneShotId() {}, play3dId() {} },
    getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }),
    uploadRecord: () => {},
    uploadRecordFrame: () => {},
    collider: { raycast: () => Infinity },
    playerEntity: player,
    playerSinks: { ...noop, hurt: (n) => hurt.set('player', (hurt.get('player') ?? 0) + n) },
    say: () => {},
    surfacePlayer: () => {},
    foes: () => foes,
    foeSinks: (f) => ({ ...noop, hurt: (n) => hurt.set(f, (hurt.get(f) ?? 0) + n) }),
    absorbCtx: () => ({ inside: true, day: false }),
    rolls: () => 0.99,
  });
  return { magic, hurt };
}

/** Fly the missiles for a second: far enough to pass the monster and reach the player. */
const fly = (magic) => {
  for (let i = 0; i < 20; i++) magic.update(0.05, [0, 0, 8]);
};

test("an ally's bolt at a monster lands on the monster, not on the player behind it (DFU DaggerfallMissile.DoCollision)", () => {
  const monster = foeAt(4);
  const ally = foeAt(0, monster);
  const { magic, hurt } = rig([ally, monster]);
  magic.fireEnemyMissile([0, 0.9, 0.5], [0, 0, 1], bolt, 5, ally);
  fly(magic);
  assert.ok(hurt.get(monster) > 0, 'the monster took the bolt');
  assert.equal(hurt.get('player'), undefined, 'the player behind it took nothing');
});

test("a monster's bolt at the player still lands on the player", () => {
  const monster = foeAt(0, PLAYER_TARGET);
  const { magic, hurt } = rig([monster]);
  magic.fireEnemyMissile([0, 0.9, 0.5], [0, 0, 1], bolt, 5, monster);
  fly(magic);
  assert.ok(hurt.get('player') > 0);
});

test('a bolt whose aimed foe died in flight can still strike the player', () => {
  const monster = foeAt(4);
  const ally = foeAt(0, monster);
  const { magic, hurt } = rig([ally, monster]);
  magic.fireEnemyMissile([0, 0.9, 0.5], [0, 0, 1], bolt, 5, ally);
  monster.dead = true;
  fly(magic);
  assert.ok(hurt.get('player') > 0);
});

test("a bolt at a townsperson, a star's ward or another player's puppet lands nothing on it", () => {
  for (const kind of [{ civilian: true }, { starWard: true }, { puppet: 'peer-1' }]) {
    const body = { ...foeAt(4), ...kind };
    const monster = foeAt(0, body);
    const { magic, hurt } = rig([monster]);
    magic.fireEnemyMissile([0, 0.9, 0.5], [0, 0, 1], bolt, 5, monster);
    fly(magic);
    assert.equal(hurt.get(body), undefined, `${Object.keys(kind)[0]} took no landing`);
  }
});
