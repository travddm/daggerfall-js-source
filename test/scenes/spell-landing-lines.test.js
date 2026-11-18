// The lines a foe's absorb or failed chance prints when the player's spell lands on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import { SPELL_ABSORPTION } from '../../src/systems/absorption.js';

/** One effect record in the shape SPELLS.STD gives. */
const effectRecord = (type, subType, chanceBase) => ({
  type,
  subType,
  durationBase: 3,
  durationMod: 1,
  durationPerLevel: 1,
  chanceBase,
  chanceMod: 2,
  chancePerLevel: 1,
  magnitudeBaseLow: 1,
  magnitudeBaseHigh: 20,
  magnitudeLevelBase: 1,
  magnitudeLevelHigh: 4,
  magnitudePerLevel: 1,
});
const shock = { index: 8, name: 'Shock', element: 2, rangeType: 1, cost: 0, effects: [effectRecord(4, 0, 1)] };
const paralysis = {
  index: 50,
  name: 'Paralysis',
  element: 4,
  rangeType: 1,
  cost: 0,
  effects: [effectRecord(0, -1, 25)],
};

const foe = (career = {}) => ({
  entity: {
    level: 3,
    health: 50,
    maxHealth: 50,
    magicka: 0,
    maxMagicka: 200,
    activeEffects: [],
    items: [],
    career,
    stats: { luck: 50, willpower: 50 },
  },
  ai: { feet: [2, 0, 0], isHostile: true },
});

function host(roll) {
  const said = [];
  const player = {
    isPlayer: true,
    level: 10,
    health: 50,
    maxHealth: 100,
    magicka: 100,
    maxMagicka: 100,
    fatigue: 100,
    items: [],
    activeEffects: [],
    skills: new Array(40).fill(50),
    skillUses: new Array(40).fill(0),
    stats: { intelligence: 50, willpower: 50, endurance: 50, luck: 50, personality: 50 },
    career: {},
  };
  const sinks = {
    hurt() {},
    heal() {},
    drainMagicka() {},
    restoreMagicka() {},
    drainFatigue() {},
    restoreFatigue() {},
  };
  const magic = createPlayerMagic({
    renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch() {} },
    audio: { playOneShot() {}, play3d() {}, playOneShotId() {}, play3dId() {} },
    getTexture: async () => null,
    uploadRecord() {},
    uploadRecordFrame() {},
    collider: { raycast: () => Infinity },
    playerEntity: player,
    playerSinks: sinks,
    say: (line) => said.push(line),
    surfacePlayer() {},
    foes: () => [],
    foeSinks: () => ({ hurt() {} }),
    absorbCtx: () => ({ inside: true, day: false }),
    rolls: () => roll,
  });
  return { magic, player, said };
}

test('a foe that absorbs the player\'s spell prints "Spell was absorbed." (DFU AssignBundle)', () => {
  const { magic, player, said } = host(0.5);
  const target = foe({ spellAbsorptionFlags: SPELL_ABSORPTION.Always });
  const landing = magic.applySpellToFoe(shock, player.level, target, { entity: player });
  assert.ok(landing.absorbed > 0, 'the foe absorbed it');
  assert.deepEqual(said, ['Spell was absorbed.']);
});

test('a foe that the player\'s spell fails against prints "Save versus spell made." (ShowNonPlayerFailures)', () => {
  const { magic, player, said } = host(0.99);
  const landing = magic.applySpellToFoe(paralysis, player.level, foe(), { entity: player });
  assert.equal(landing.chanceFailed, 1, 'the chance roll failed');
  assert.deepEqual(said, ['Save versus spell made.']);
});

test("another player's spell that a foe here absorbs prints nothing on this client", () => {
  const { magic, player, said } = host(0.5);
  const target = foe({ spellAbsorptionFlags: SPELL_ABSORPTION.Always });
  magic.applySpellToFoe(shock, player.level, target, { entity: { level: 10 } }, { peerCaster: 'peer-1' });
  assert.deepEqual(said, []);
});
