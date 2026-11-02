// The arena referee believes only what the striker could deal: the weapon it names is the one in its hand, a blow that
// names none is worth no more than the best weapon, a spell reaches no further than a shaft and draws on a magicka pool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBout, joinBout, stepBout, poseOf, refBlow } from '../../../src/net/arena/arenaBrain.js';
import {
  ARENA_HIT,
  ARENA_TICK_MS,
  ARENA_FLOOR_CENTRE,
  ARENA_SPELL_REACH,
  ARENA_MAGICKA_DEPTH,
  ARENA_MAGICKA_REGEN,
  ARENA_SPELL_MAX,
  ARENA_SPELLS_IN,
  arenaBlowCap,
  arenaHeld,
} from '../../../src/net/arena/arenaLaw.js';
import { boutLive } from '../../../src/systems/arena/arenaBout.js';

const C = ARENA_FLOOR_CENTRE;
const DAI_LOOK = { items: [{ templateIndex: 123, group: 'Weapons', equipSlot: 19, material: 9 }] };
const BARE_LOOK = { items: [] };

/** A fight against the tier's AI, the AI a step away (`awayM` metres along x). */
function fight(awayM = 1) {
  let now = 10_000;
  const st = openBout({
    o: '0000000000000abc',
    kind: 'pve',
    f: [{ sub: 'acct-ceryn', name: 'Ceryn', lv: 20, cl: 20 }],
    tier: 9,
    bout: 0,
    now,
  });
  joinBout(st, 'acct-ceryn', 'f', now);
  for (let i = 0; i < 400 && !boutLive(st.b); i++) {
    now += ARENA_TICK_MS;
    stepBout(st, now, () => 0.5);
  }
  poseOf(st, 'p0', C[0], C[2], now);
  for (const a of st.ai) {
    a.pos = [C[0] + awayM, C[2]];
    a.mv = null;
    a.atk = null;
    a.nextAt = Infinity;
  }
  return {
    st,
    foe: st.ai[0].id,
    now: () => now,
    step: (ms) => {
      now += ms;
    },
  };
}

test("a fist keeps DFU's hand-to-hand most, and cannot be claimed by a fighter holding a weapon", () => {
  const best = arenaBlowCap({ r: ARENA_HIT.Melee, w: 123, m: 9 });
  assert.ok(arenaBlowCap({ r: ARENA_HIT.Melee, w: -1 }) > best, 'an unarmed build is not cut below what DFU allows');
  assert.equal(arenaHeld(DAI_LOOK, -1), null, 'but a swordsman leaving the weapon out is refused');
  assert.equal(arenaHeld(DAI_LOOK, 9999, 0), null, 'and so is a template it does not hold');
});

test("a blow names the weapon in the striker's hand: a claim its look does not carry is refused, a fist only while no weapon is in hand", () => {
  assert.deepEqual(arenaHeld(DAI_LOOK, 123, 9), { w: 123, m: 9 });
  assert.equal(arenaHeld(DAI_LOOK, 123, 1), null, 'another material');
  assert.equal(arenaHeld(DAI_LOOK, 116, 9), null, 'another weapon');
  assert.equal(arenaHeld(DAI_LOOK, -1), null, 'leaving the weapon out while one is held');
  assert.deepEqual(arenaHeld(BARE_LOOK, -1), { w: -1, m: 0 });
  assert.equal(arenaHeld(BARE_LOOK, 123, 9), null, 'a weapon it does not hold');
  assert.deepEqual(arenaHeld(null, 123, 9), { w: 123, m: 9 }, 'no look on record: its word');
  const F = fight();
  assert.equal(
    refBlow(F.st, 'p0', { i: F.foe, d: 500, r: ARENA_HIT.Melee, q: 1 }, F.now(), null, DAI_LOOK).got,
    0,
    'the claim of no weapon from a swordsman',
  );
  F.step(1000);
  assert.ok(
    refBlow(F.st, 'p0', { i: F.foe, d: 500, r: ARENA_HIT.Melee, w: 123, m: 9, q: 2 }, F.now(), null, DAI_LOOK).got > 0,
    'the weapon it holds lands',
  );
});

test("a spell lands within a shaft's reach and no further", () => {
  const near = fight(ARENA_SPELL_REACH - 1);
  assert.ok(refBlow(near.st, 'p0', { i: near.foe, d: 10, r: ARENA_HIT.Spell, q: 1 }, near.now()).got > 0, 'in reach');
  const far = fight(ARENA_SPELL_REACH + 20);
  assert.equal(
    refBlow(far.st, 'p0', { i: far.foe, d: 10, r: ARENA_HIT.Spell, q: 1 }, far.now()).got,
    0,
    'out of reach',
  );
});

test('casts draw on a magicka pool that refills over time', () => {
  const F = fight();
  let spent = 0;
  for (let q = 1; spent < ARENA_MAGICKA_DEPTH + ARENA_SPELL_MAX && q < 20; q++) {
    F.step(5100); // clear of the cast window and the damage bucket, so only the pool can refuse
    const got = refBlow(F.st, 'p0', { i: F.foe, d: ARENA_SPELL_MAX, r: ARENA_HIT.Spell, q }, F.now()).got;
    if (!got) break;
    spent += got;
  }
  assert.ok(spent >= ARENA_SPELLS_IN, 'honest casting lands');
  const dry = fight();
  dry.st.ref.p0.magicka = 0;
  dry.st.ref.p0.magickaAt = dry.now();
  assert.equal(
    refBlow(dry.st, 'p0', { i: dry.foe, d: 30, r: ARENA_HIT.Spell, q: 1 }, dry.now()).got,
    0,
    'an empty pool casts nothing',
  );
  dry.step(5000);
  assert.ok(
    refBlow(dry.st, 'p0', { i: dry.foe, d: 30, r: ARENA_HIT.Spell, q: 2 }, dry.now()).got > 0,
    'and casts again once it refilled',
  );
});
