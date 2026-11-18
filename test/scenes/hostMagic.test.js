// The player's magic host: what a spell that lands on a foe hands back to the host.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import { NEARBY } from '../../src/systems/nearbyObjects.js';

const playerEntity = () => ({
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
});

const foeAt = (x) => ({
  entity: { level: 3, health: 50, maxHealth: 50, activeEffects: [], items: [], stats: { luck: 50, willpower: 50 } },
  ai: { feet: [x, 0, 0], isHostile: true },
});

/** One effect record in the shape SPELLS.STD gives (Holy Word, Holy Touch and Banish Daedra carry one each). */
const dispelEffect = (subType) => ({
  type: 6,
  subType,
  durationBase: 1,
  durationMod: 1,
  durationPerLevel: 1,
  chanceBase: 10,
  chanceMod: 2,
  chancePerLevel: 1,
  magnitudeBaseLow: 1,
  magnitudeBaseHigh: 1,
  magnitudeLevelBase: 1,
  magnitudeLevelHigh: 1,
  magnitudePerLevel: 1,
});
const holyWord = { index: 58, name: 'Holy Word', element: 4, rangeType: 3, cost: 0, effects: [dispelEffect(1)] };
const banishDaedra = {
  index: 57,
  name: 'Banish Daedra',
  element: 4,
  rangeType: 1,
  cost: 0,
  effects: [dispelEffect(2)],
};

function host({ onDispel }) {
  const player = playerEntity();
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
    say() {},
    surfacePlayer() {},
    foes: () => [],
    foeSinks: () => sinks,
    absorbCtx: () => ({ inside: true, day: false }),
    rolls: () => 0.99,
    onDispel,
  });
  return { magic, player };
}

test('Holy Word and Banish Daedra that land on a foe start the dispel sweep, as DFU DispelUndead.Start does', () => {
  for (const [spell, group] of [
    [holyWord, NEARBY.Undead],
    [banishDaedra, NEARBY.Daedra],
  ]) {
    const sweeps = [];
    const { magic, player } = host({ onDispel: (d) => sweeps.push(d) });
    magic.applySpellToFoe(spell, player.level, foeAt(2), { entity: player });
    assert.equal(sweeps.length, 1, `${spell.name} swept once`);
    assert.equal(sweeps[0].group, group);
    assert.ok(sweeps[0].chance > 0, 'the sweep carries the per-target chance');
  }
});

test('A dispel landed on a foe by another player or by a foe sweeps nothing here', () => {
  const sweeps = [];
  const { magic, player } = host({ onDispel: (d) => sweeps.push(d) });
  magic.applySpellToFoe(holyWord, player.level, foeAt(2), { entity: { level: 5 } }, { peerCaster: 'peer-1' });
  magic.applySpellToFoe(holyWord, player.level, foeAt(2), { entity: foeAt(3).entity });
  assert.equal(sweeps.length, 0);
});

test('a self-cast dispel that lands on the player sweeps, as before the move to dispel-sweep.ts', () => {
  const sweeps = [];
  const { magic, player } = host({ onDispel: (d) => sweeps.push(d) });
  const selfCast = { ...holyWord, rangeType: 0 };
  magic.applySpellToPlayer(selfCast, player.level, { entity: player });
  assert.equal(sweeps.length, 1);
  assert.equal(sweeps[0].group, NEARBY.Undead);
});
