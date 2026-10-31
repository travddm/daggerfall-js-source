// FIELD BUGS 2026-10-19f BOSS-DOT (the owner, 2026-10-19: "Carry DoTs") - bible/11-Multiplayer/World-Bosses.md, BOSS-DOT.
//
// A Continuous Damage spell on a body a relay runs landed its cast's round alone: the stand-in forgot every lasting family
// the moment the count was done (scenes/gate/standInSpell.js countOnStandIn's wipe, and world.js serpentSpellOn's), so a
// level-20 Burn dealt its first round and the rest of its rounds went nowhere. Its rounds are carried now: kept a body,
// renewed by a recast (STACK-CAP), ticked on the shared world's round (COURT_ROUND_MS, the court's soul trap's clock) by
// effects.js tickActiveEffects, each round's sum out through the door a spell's claim takes. Driven on the real producers:
// the spell maker's Continuous Damage, the stand-in factories, the court and its host driver,
// the serpent's door, and the wire's validator.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bossStandIn, hostStandIn, crystalStandIn, bossLookOf, hostLookOf } from '../../../src/world/gate/gateBoss.js';
import { HIT_KINDS, HOST } from '../../../src/net/gate/gateBrain.js';
import { GATE_STATE_EMPTY } from '../../../src/net/gate/gateLink.js';
import { validGateIn } from '../../../src/net/wire.js';
import { createStandInSpell, createStandInRounds, createSerpentSpell, countOnStandIn, carriedOnStandIn } from '../../../src/scenes/gate/standInSpell.js';
import { createGateCourt, COURT_ROUND_MS } from '../../../src/scenes/gate/gateCourt.js';
import { courtToDungeon } from '../../../src/world/gate/gateArena.js';
import { applySpell, tickActiveEffects } from '../../../src/systems/effects.js';
import { duelSpellOf } from '../../../src/combat/duelCombat.js';
import { buildCustomSpell } from '../../../src/systems/spell/spellMaker.js';
import { playerEntity } from '../../../src/characters/playerEntity.js';
import { registerSpellLandedListener } from '../../../src/systems/spell/spellPower.js';
import { SERPENT_HIT_CAP_X, SERPENT_HAND_REF } from '../../../src/net/serpent/serpentBrain.js';
import { destroyGateBossBar } from '../../../src/ui/gate/gateBossBar.js';
import { destroyGateMarksCard } from '../../../src/ui/gate/gateMarksView.js';
import { destroyGateGround } from '../../../src/ui/gate/gateGroundView.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const NOOP = () => {};
const HALF = () => 0.5;
/** The spell maker's Continuous Damage on health (1,0) - 5 rounds and one a level, 10 a round, in Magic (no element turns
 *  it) - and its two siblings on fatigue (1,1) and magicka (1,2), and a plain bolt (4,0). */
const SETTINGS = { durationBase: 5, durationMod: 1, durationPerLevel: 1, chanceBase: 100, magnitudeBaseLow: 10, magnitudeBaseHigh: 10, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 };
const spell = (type, subType, name) => buildCustomSpell({ slots: [{ type, subType, settings: SETTINGS }], rangeType: 1, element: 4, name });
const BURN = spell(1, 0, 'Burn'), WEARY = spell(1, 1, 'Weary'), DRAIN = spell(1, 2, 'Drain'), BOLT = spell(4, 0, 'Bolt');
const BIG = buildCustomSpell({ slots: [{ type: 4, subType: 0, settings: { ...SETTINGS, magnitudeBaseLow: 200, magnitudeBaseHigh: 200 } }], rangeType: 1, element: 4, name: 'Big' });
/** AUDIT FB1019f G7: a Continuous Damage of 2 a round - at even dice his save lets 1 of each through. */
const EMBER = buildCustomSpell({ slots: [{ type: 1, subType: 0, settings: { ...SETTINGS, magnitudeBaseLow: 2, magnitudeBaseHigh: 2 } }], rangeType: 1, element: 4, name: 'Ember' });
/** At level 20: a Burn of 25 rounds (5 + 20) - its first at the cast, 24 carried. */
const ROUNDS = 25;
const atLevel = (lv, fn) => { const was = [playerEntity.level, playerEntity.health]; playerEntity.level = lv; playerEntity.health = Math.max(1, playerEntity.health || 1); try { return fn(); } finally { [playerEntity.level, playerEntity.health] = was; } };

/** The doors over hand-held bodies (the producers' stand-ins), each claim recorded `[who, d, tick]`, on a clock the test turns. */
function doorsOver(bodies, { now }) {
  const landed = [];
  const doors = createStandInSpell({
    player: playerEntity, say: NOOP, rolls: HALF, now,
    boss: () => bodies.boss ?? null, crystals: () => bodies.crystals ?? [], host: () => bodies.host ?? [], rival: () => bodies.rival ?? null,
    landOnBoss: (b, d, r, tick) => (bodies.refuse ? false : (landed.push(['him', d, r, !!tick]), true)),
    landOnCrystal: (b, d, r, tick) => (landed.push([`crystal ${b.crystal}`, d, r, !!tick]), true),
    landOnHost: (b, d, r, tick) => (landed.push([`host ${b.host}`, d, r, !!tick]), true),
    landOnRival: (b, d, kind) => (landed.push([`rival ${b.rival}`, d, kind, false]), true),
    nextArenaQ: NOOP, trapNow: () => null, onTrap: () => false,
  });
  return { doors, landed };
}

test('BOSS-DOT THE ROUNDS ARE CARRIED, AS DFU RUNS THEM: a Burn on his stand-in - its first round at the cast, and every round after on the shared world\'s round, each one claim of its own (a spell\'s, marked a round) - deals over its rounds exactly what DoMagicRound deals a body that keeps it (effects.js applySpell then tickActiveEffects, the save each round); the stand-in itself holds nothing between; a level-20 Burn 8 of its 200 at even dice, as the pages say (mutants: the rounds wiped; never ticked; the count keeping nothing; a round not marked; the figure moved)', () => {
  atLevel(20, () => {
    // DFU's law on a body that keeps its effects: the same stand-in, the same dice
    const ref = bossStandIn(bossLookOf('ruhn'), 'Valkynaz Ruhn');
    const per = [];
    let n = 0;
    const sinks = { hurt: (d) => { n += d; }, heal() {}, drainFatigue() {}, restoreFatigue() {}, drainMagicka() {}, restoreMagicka() {} };
    applySpell(duelSpellOf(BURN), 20, ref, sinks, HALF, { entity: playerEntity });
    per.push(n);
    while ((ref.activeEffects ?? []).some(carriedOnStandIn)) { n = 0; tickActiveEffects(ref, sinks, HALF); per.push(n); }
    assert.equal(per.length, ROUNDS, 'twenty-five rounds, the first at the cast');
    // AUDIT FB1019f C3: the figure World-Bosses.md section 27 and standInSpell.js's header say - 10 a round, 8 of each
    // through his save at even dice, 200 in all
    assert.deepEqual([per[0], per.reduce((a, b) => a + b, 0)], [8, 200], 'the Burn\'s first round, and its whole');
    // the record of the bug: the count alone leaves nothing on the stand-in, and what it carries is the other 24
    const e = bossStandIn(bossLookOf('ruhn'), 'Valkynaz Ruhn');
    const c = countOnStandIn(duelSpellOf(BURN), e, 20, playerEntity, HALF);
    assert.deepEqual([c.dealt, e.activeEffects, c.kept.length, c.kept[0].roundsRemaining], [per[0], [], 1, ROUNDS - 1]);
    // the door: the cast's claim, then a claim a round
    let t = 7 * COURT_ROUND_MS + 1234;
    const { doors, landed } = doorsOver({ boss: { boss: true, entity: e } }, { now: () => t });
    assert.equal(doors.spellOnBoss(BURN), true);
    doors.standInRound();
    t += COURT_ROUND_MS - 1235;
    doors.standInRound();
    assert.equal(landed.length, 1, 'nothing before the round turns');
    for (let k = 0; k < ROUNDS + 3; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    assert.deepEqual(landed.map((x) => x[1]), per, 'round for round, what DFU deals');
    assert.deepEqual(landed.map((x) => [x[0], x[2], x[3]]), [['him', HIT_KINDS.Spell, false], ...new Array(ROUNDS - 1).fill(['him', HIT_KINDS.Spell, true])], 'the cast a spell\'s claim, each round a spell\'s marked a round');
    assert.deepEqual(e.activeEffects, [], 'the stand-in holds nothing between');
  });
});

test('BOSS-DOT THE ROUND\'S LAW: a frame that stalled runs every round missed as one claim; a recast renews the rounds running, never stacks them (STACK-CAP); a round into his ward is lost and its rounds run on; a body no longer offered and my death end them; only Continuous Damage on health is carried (fatigue and magicka: a relay body has neither); a bout carries none (BAL8); the host\'s and the crystal\'s by their own doors (mutants: a stall dropped; a recast stacked; the ward\'s round sent; a gone body kept; death ignored; the fatigue drain carried; the rival carried)', () => {
  atLevel(20, () => {
    let t = 50 * COURT_ROUND_MS;
    const him = { boss: true, entity: bossStandIn(bossLookOf('ruhn'), 'him') };
    const bodies = { boss: him, host: [{ host: 3, entity: hostStandIn(hostLookOf(HOST.harrier, 'burning'), 3) }], crystals: [{ crystal: 1, entity: crystalStandIn(bossLookOf('ruhn'), 1) }], rival: { rival: 'p1', entity: bossStandIn({ mobile: 0 }, 'Your opponent') } };
    const { doors, landed } = doorsOver(bodies, { now: () => t });
    const rounds = () => landed.filter((x) => x[3]);
    doors.spellOnBoss(BURN); doors.standInRound();
    t += 3 * COURT_ROUND_MS; doors.standInRound();
    assert.deepEqual(rounds().map((x) => x[0]), ['him'], 'three rounds missed: one claim');
    const one = landed[1][1] / 3;
    assert.ok(one >= 1 && Number.isInteger(one), 'the sum of three');
    // a recast at 21 left: renewed to the cast's 24, never 21 + 24 - and no first round of its own (DFU's renewal fires none)
    const atRecast = landed.length;
    assert.equal(doors.spellOnBoss(BURN), true, 'it met him: its rounds renewed');
    assert.equal(landed.length, atRecast, 'a renewal claims nothing at its cast');
    let n = 0;
    for (let k = 0; k < 40; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    n = rounds().length - 1;
    assert.equal(n, ROUNDS - 1, 'renewed: 24 more rounds, not 45');
    // a recast his ward turns renews nothing; a cast whose claim is refused lays nothing
    landed.length = 0;
    doors.spellOnBoss(BURN); doors.standInRound();
    for (let k = 0; k < 10; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    him.warded = true; doors.spellOnBoss(BURN); him.warded = false;
    for (let k = 0; k < 40; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    assert.equal(rounds().length, ROUNDS - 1, 'turned: its 24 ran as they were, never renewed');
    landed.length = 0;
    bodies.refuse = true; doors.spellOnBoss(BURN); bodies.refuse = false;
    for (let k = 0; k < 5; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    assert.deepEqual(landed, [], 'the claim refused: no rounds laid');
    // his ward: the round lost, the rounds running on
    landed.length = 0;
    doors.spellOnBoss(BURN); doors.standInRound();
    him.warded = true;
    t += COURT_ROUND_MS; doors.standInRound();
    him.warded = false;
    for (let k = 0; k < 40; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    assert.equal(rounds().length, ROUNDS - 2, 'one round into the ward: lost, and the rest run their course');
    // gone, and my death
    landed.length = 0;
    doors.spellOnBoss(BURN); doors.spellOnHost(BURN, 3); doors.spellOnCrystal(BURN, 1); doors.standInRound();
    t += COURT_ROUND_MS; doors.standInRound();
    assert.deepEqual(rounds().map((x) => x[0]), ['him', 'host 3', 'crystal 1'], 'every body\'s round in the one frame, each by its door');
    bodies.host = [];
    t += COURT_ROUND_MS; doors.standInRound();
    bodies.host = [{ host: 3, entity: hostStandIn(hostLookOf(HOST.harrier, 'burning'), 3) }];
    t += COURT_ROUND_MS; doors.standInRound();
    assert.deepEqual(rounds().slice(3).map((x) => x[0]), ['him', 'crystal 1', 'him', 'crystal 1'], 'a body gone ends its rounds - back, it carries none');
    playerEntity.health = 0;
    t += COURT_ROUND_MS; doors.standInRound();
    playerEntity.health = 100;
    t += COURT_ROUND_MS; doors.standInRound();
    assert.equal(rounds().length, 7, 'my death ends them all');
    // only health
    landed.length = 0;
    doors.spellOnBoss(WEARY); doors.spellOnBoss(DRAIN); doors.standInRound();
    for (let k = 0; k < 5; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    assert.deepEqual(landed, [], 'a drain of fatigue or magicka claims nothing and carries nothing');
    for (const sp of [WEARY, DRAIN]) assert.deepEqual(countOnStandIn(duelSpellOf(sp), bossStandIn(bossLookOf('ruhn'), 'x'), 20, playerEntity, HALF).kept, [], `${sp.name}: nothing to carry`);
    // a bout: the cast's claim alone
    doors.spellOnRival(BURN); doors.standInRound();
    for (let k = 0; k < 5; k++) { t += COURT_ROUND_MS; doors.standInRound(); }
    assert.deepEqual(landed.map((x) => x[0]), ['rival p1'], 'the referee\'s blow alone');
    // a plain bolt over a running Burn keeps it
    landed.length = 0;
    doors.spellOnBoss(BURN); doors.spellOnBoss(BOLT); doors.standInRound();
    t += COURT_ROUND_MS; doors.standInRound();
    assert.deepEqual(landed.map((x) => [x[0], x[3]]), [['him', false], ['him', false], ['him', true]], 'the bolt\'s claim, and the Burn still running');
  });
});

test('BOSS-DOT THE KEEPER (createStandInRounds): a body\'s rounds tick against its own stand-in as it stands, the clock standing still while none run, a body laid in a round ticking from the next, a round of one sent (mutants: the clock run while idle; a stalled round lost; a round of one dropped)', () => {
  let t = 10 * COURT_ROUND_MS + 4000;
  const R = createStandInRounds({ now: () => t, rolls: HALF });
  const e = bossStandIn(bossLookOf('ruhn'), 'x');
  const got = [];
  const body = { entity: e, land: (d) => got.push(d) };
  t += 20 * COURT_ROUND_MS; R.frame(() => body);
  const c = atLevel(20, () => countOnStandIn(duelSpellOf(BURN), e, 20, playerEntity, HALF));
  R.keep('b', c.kept);
  R.frame(() => body);
  assert.deepEqual([got, R.keys()], [[], ['b']], 'idle so long, nothing owed: its first round is the next');
  t += COURT_ROUND_MS; R.frame(() => body);
  t += 2 * COURT_ROUND_MS; R.frame(() => body);
  assert.equal(got.length, 2);
  assert.equal(got[1], 2 * got[0], 'two rounds stalled, one claim of both');
  // a keeper that framed nothing for a while: what it is handed first ticks from the next round, never the rounds before
  const Q = createStandInRounds({ now: () => t, rolls: HALF }), got2 = [];
  Q.frame(() => null);
  t += 20 * COURT_ROUND_MS;
  Q.keep('b', atLevel(20, () => countOnStandIn(duelSpellOf(BURN), e, 20, playerEntity, HALF)).kept);
  Q.frame(() => ({ entity: e, land: (d) => got2.push(d) }));
  assert.deepEqual(got2, [], 'none owed for the rounds before it was laid');
  // AUDIT FB1019f G7: a round that deals exactly one is a claim - an Ember of 2 a round, 1 of each through his save at even dice
  const one = atLevel(20, () => countOnStandIn(duelSpellOf(EMBER), e, 20, playerEntity, HALF)), P = createStandInRounds({ now: () => t, rolls: HALF }), got3 = [];
  assert.deepEqual([one.dealt, one.kept.length], [1, 1], 'its cast\'s round: one, its rounds kept');
  P.keep('b', one.kept);
  t += COURT_ROUND_MS; P.frame(() => ({ entity: e, land: (d) => got3.push(d) }));
  t += COURT_ROUND_MS; P.frame(() => ({ entity: e, land: (d) => got3.push(d) }));
  assert.deepEqual(got3, [1, 1], 'a round of one: sent, each');
});

/** The court and its host driver over a link the test writes (scenes/gate/gateCourt.js), standing in his court. */
function court() {
  const link = { st: GATE_STATE_EMPTY, state() { return this.st; } };
  const clock = { t: 0 };
  const sent = [], hsent = [];
  const c = createGateCourt({ renderer: null, gl: null, link, now: () => clock.t, getTexture: null, uploadRecordFrame: null, audio: { play3d() {}, play3dId() {} },
    cam: () => courtToDungeon(0, 1.7, -10), feet: () => courtToDungeon(0, 0, 4), player: () => ({ health: 100, maxHealth: 100 }),
    say: NOOP, send: (h) => { sent.push(h); return true; }, sendHost: (h) => { hsent.push(h); return true; } });
  return { c, link, clock, sent, hsent };
}
const stOf = (over = {}) => ({ ...GATE_STATE_EMPTY, day: 700, boss: 'ruhn', phase: 1, hp: 800, max: 1000, fighters: 3, wrathAt: 1e13, md: ['burning', 'legion', 'echoing'], lg: { ads: [], gone: [] }, ...over });
const ad = (o) => ({ i: 1, k: HOST.harrier, h: 45, m: 45, x: 0, z: 6, mv: null, atk: null, rose: -Infinity, yaw: 0, ...o });

test('BOSS-DOT THE COURT: a Burn on the Warden and on one of his host, through the real court - each round\'s claims leave in one frame as one blow\'s sequence (one token of the relay\'s hand), the wire carrying them; his fall ends them (mutants: the rounds unsent; a round a frame apart)', () => {
  const h = court();
  h.clock.t = 1000 * COURT_ROUND_MS + 10;
  h.link.st = stOf({ lg: { ads: [ad({ i: 1, x: 1, z: 6 })], gone: [] } });
  h.c.frame();
  const doors = createStandInSpell({
    player: playerEntity, say: NOOP, rolls: HALF, now: () => h.clock.t,
    boss: () => { const b = h.c.target(); return b ? { boss: true, entity: b.entity, warded: b.warded } : null; },
    host: () => h.c.hostTargets().map((q) => ({ host: q.i, entity: q.entity })), crystals: () => [], rival: () => null,
    landOnBoss: (b, d, r) => h.c.hit({ d, r }), landOnHost: (hb, d, r) => h.c.hostHit({ i: hb.host, d, r }), landOnCrystal: () => false, landOnRival: () => false,
    nextArenaQ: NOOP, trapNow: () => null, onTrap: () => false,
  });
  try {
    atLevel(20, () => {
      assert.equal(doors.spellOnBoss(BURN), true, 'him');
      h.clock.t += 40; h.c.frame();
      assert.equal(doors.spellOnHost(BURN, 1), true, 'one of his host');
      doors.standInRound();
      const before = [h.sent.length, h.hsent.length];
      h.clock.t += COURT_ROUND_MS; h.c.frame();
      doors.standInRound();
      const him = h.sent.at(-1), it = h.hsent.at(-1);
      assert.deepEqual([h.sent.length - before[0], h.hsent.length - before[1]], [1, 1], 'a round: one claim each');
      assert.equal(him.q, it.q, 'one blow\'s sequence - one token');
      assert.equal(him.r, HIT_KINDS.Spell);
      assert.ok(validGateIn({ k: 'hit', ...him }) && validGateIn({ k: 'ahit', ...it }), 'the wire carries them');
      h.link.st = { ...h.link.st, fell: { at: h.clock.t, top: [], n: 1 } };
      h.clock.t += COURT_ROUND_MS; h.c.frame();
      const n = h.sent.length;
      doors.standInRound();
      assert.equal(h.sent.length, n, 'fallen: nothing more');
    });
  } finally { h.c.leave(); destroyGateBossBar(); destroyGateMarksCard(); destroyGateGround(); }
});

test('BOSS-DOT THE SERPENT (createSerpentSpell, out of bootWorld): a hand\'s Burn on its hide - the cast\'s claim to the host\'s hand door, the riders told what a hand\'s purse can land, then a claim a round to the segment it met; the fight over ends its rounds (mutants: the serpent\'s rounds unkept; past the fight)', () => {
  atLevel(20, () => {
    let t = 300 * COURT_ROUND_MS;
    const box = { id: 'serpent:4' }, hide = bossStandIn({ mobile: 31 }, 'the sea serpent'), handed = [], told = [];
    const S = createSerpentSpell({ player: playerEntity, standIn: () => hide, land: (b, d) => handed.push([b.id, d]), now: () => t, rolls: HALF });
    registerSpellLandedListener('fb1019f-dot', (i) => told.push(i.took));
    try {
      assert.equal(S.cast(BIG, box), true);
      assert.deepEqual(told, [SERPENT_HIT_CAP_X * SERPENT_HAND_REF], 'a bolt past a hand\'s purse: the riders told what can land');
      told.length = 0; handed.length = 0;
      assert.equal(S.cast(BURN, box), true);
      S.frame(true);
      for (let k = 0; k < 3; k++) { t += COURT_ROUND_MS; S.frame(true); }
      assert.equal(handed.length, 4, 'the cast and three rounds');
      assert.ok(handed.every(([id]) => id === 'serpent:4'), 'to the segment it met');
      assert.deepEqual(told, [Math.min(handed[0][1], SERPENT_HIT_CAP_X * SERPENT_HAND_REF)], 'the riders told what a hand can land, the cast alone');
      t += COURT_ROUND_MS; S.frame(false);
      t += COURT_ROUND_MS; S.frame(true);
      assert.equal(handed.length, 4, 'the fight over: its rounds end');
    } finally { registerSpellLandedListener('fb1019f-dot', null); }
  });
});
