// FIELD BUGS 2026-10-19f STAND-IN-WHOLE (a player's private report: a Disintegrate on an online breach's boss popped a huge
// number, and his bar never moved) - bible/11-Multiplayer/World-Bosses.md, STAND-IN-WHOLE.
//
// Every body a relay runs is struck on this machine against a stand-in (world/gate/gateBoss.js bossStandIn, hostStandIn,
// crystalStandIn) whose health stood at 1e9; a Disintegrate deals its target the health it has left, so it claimed 1e9 -
// past every wire's ceiling (the gate's hit, ahit and xhit, the Abyss's, a refereed bout's), and every
// relay refused the cast whole while the HUD popped the claim. The stand-in's whole is STAND_IN_WHOLE now - the most one
// blow lands at any relay, under the least ceiling nobody clamps - and the spell doors (scenes/gate/standInSpell.js, out
// of buildDungeonContext) say what can land. Driven on the real producers: the spell maker's Disintegrate, the
// stand-in factories, the court that sends the claim, the validators that read it and the brains that land it.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bossStandIn, hostStandIn, crystalStandIn, bossLookOf, hostLookOf, STAND_IN_WHOLE, standInBlowCap } from '../../../src/world/gate/gateBoss.js';
import { HIT_CAP_X, dpsRef, LV_MAX, HIT_KINDS, BOSS_R, spendPurse, newFight, joinFight, applyHit } from '../../../src/net/gate/gateBrain.js';
import { SERPENT_HIT_CAP_X, SHIP_REF, SERPENT_HAND_REF } from '../../../src/net/serpent/serpentBrain.js';
import { validArenaIn, arenaBlowCap, ARENA_HIT, ARENA_SPELL_MAX, ARENA_WEAPON_MAX, ARENA_MATERIAL_MOD } from '../../../src/net/arena/arenaLaw.js';
import { validGateIn, validSdIn } from '../../../src/net/wire.js';
import { createStandInSpell, countOnStandIn, standInShown } from '../../../src/scenes/gate/standInSpell.js';
import { duelSpellOf } from '../../../src/combat/duelCombat.js';
import { buildCustomSpell } from '../../../src/systems/spell/spellMaker.js';
import { playerEntity } from '../../../src/characters/playerEntity.js';
import { setPlayerAttackHook, calculateAttackDamage } from '../../../src/combat/formulas.js';
import { registerSpellLandedListener } from '../../../src/systems/spell/spellPower.js';
import { bloodHit, bloodRate, isOverkill, RATE_LADDER } from '../../../src/combat/blood/bloodDecals.js';
import { healthShare } from '../../../src/combat/healthShare.js';
import { createGateCourt } from '../../../src/scenes/gate/gateCourt.js';
import { GATE_STATE_EMPTY } from '../../../src/net/gate/gateLink.js';
import { courtToDungeon } from '../../../src/world/gate/gateArena.js';
import { SD_REMNANT_MOBILE } from '../../../src/scenes/superDungeon/sdRemnant.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const NOOP = () => {};
/** The dice that land it: the chance passed, no save. */
const SURE = () => 0.999;
/** The spell maker's own Disintegrate (5,255 - its chance whole) and a Damage Health bolt of 10, each as the maker mints it. */
const DISINTEGRATE = buildCustomSpell({ slots: [{ type: 5, subType: 255, settings: { chanceBase: 100 } }], rangeType: 1, element: 4, name: 'Disintegrate' });
const BOLT = buildCustomSpell({ slots: [{ type: 4, subType: 0, settings: { magnitudeBaseLow: 10, magnitudeBaseHigh: 10, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 } }], rangeType: 1, element: 4, name: 'Bolt' });
/** Every stand-in a relay's body is struck against, by its own factory, as its owners stand them. */
const standIns = () => ({
  warden: bossStandIn(bossLookOf('ruhn'), 'Valkynaz Ruhn'),
  host: hostStandIn(hostLookOf(0, 'burning'), 3),
  crystal: crystalStandIn(bossLookOf('ruhn'), 2),
  remnant: bossStandIn({ mobile: SD_REMNANT_MOBILE }, 'the Brass Remnant'),
  rival: bossStandIn({ mobile: 0 }, 'Your opponent'),
});
/** At my level, then put back. */
const atLevel = (lv, fn) => { const was = playerEntity.level; playerEntity.level = lv; try { return fn(); } finally { playerEntity.level = was; } };

test('STAND-IN-WHOLE THE WHOLE (world/gate/gateBoss.js STAND_IN_WHOLE): the most one blow lands at any relay - HIT_CAP_X times the reference at the level cap - at least every relay\'s one-blow cap (the gate\'s, the Abyss\'s, the serpent\'s, a bout\'s) and carried by every wire (the bout\'s 10,000 the least), each relay landing its whole cap on it; 1e9 refused by every one (mutants: 1e9 back; past the bout\'s ceiling)', () => {
  assert.equal(STAND_IN_WHOLE, HIT_CAP_X * dpsRef(LV_MAX));
  assert.equal(STAND_IN_WHOLE, 780);   // PIN MOVED (EG removal): no Elite Breach bucket grows it past the gate's cap
  assert.equal(dpsRef(999), dpsRef(LV_MAX), 'no level reads past the cap');
  // AT LEAST every relay's one-blow cap
  const bout = Math.max(arenaBlowCap({ r: ARENA_HIT.Spell }), arenaBlowCap({ r: ARENA_HIT.Melee }),
    ...Object.keys(ARENA_WEAPON_MAX).flatMap((w) => ARENA_MATERIAL_MOD.map((_, m) => arenaBlowCap({ r: ARENA_HIT.Melee, w: Number(w), m }))));
  const caps = { gate: HIT_CAP_X * dpsRef(LV_MAX), serpent: SERPENT_HIT_CAP_X * Math.max(...SHIP_REF), hand: SERPENT_HIT_CAP_X * SERPENT_HAND_REF, bout };
  assert.deepEqual(Object.entries(caps).filter(([, c]) => !(c <= STAND_IN_WHOLE)), [], 'every relay\'s cap within the whole');
  assert.equal(caps.gate, STAND_IN_WHOLE, 'the least whole that counts them all');
  // the relays land their whole cap on it: the purse a host body, a crystal and the Abyss spend
  const purse = () => ({ lv: LV_MAX, bucket: 0, bucketAt: -1e9, clipped: 0, dealt: 0 });
  assert.equal(spendPurse(purse(), STAND_IN_WHOLE, Infinity, 0), HIT_CAP_X * dpsRef(LV_MAX), 'the gate\'s purse: its cap');
  // AT MOST what every wire carries - the claim each exit sends of it
  const d = STAND_IN_WHOLE;
  const carried = (dd) => [
    !!validGateIn({ k: 'hit', q: 1, d: dd, r: 2 }), !!validGateIn({ k: 'ahit', i: 3, q: 1, d: dd, r: 2 }), !!validGateIn({ k: 'xhit', c: 0, q: 1, d: dd, r: 2 }),
    !!validSdIn({ k: 'hit', q: 1, d: dd, r: 2 }), !!validSdIn({ k: 'ehit', e: 1, q: 1, d: dd, r: 2 }), !!validSdIn({ k: 'xhit', c: 0, q: 1, d: dd, r: 2 }),
    !!validArenaIn({ k: 'hit', i: 'p1', d: dd, r: 2, q: 1 }),
  ];
  assert.deepEqual(carried(d), new Array(7).fill(true), 'every wire carries the whole');
  assert.deepEqual(carried(1e9), new Array(7).fill(false), 'the record of the bug: 1e9 none');
  assert.equal(validArenaIn({ k: 'hit', i: 'p1', d: 10_001, r: 2 }), null, 'the bout\'s ceiling, the least');
});

test('STAND-IN-WHOLE A REAL DISINTEGRATE ON EVERY STAND-IN: counted whole on each factory\'s body (the Warden, his host and crystals, the Remnant, my opponent), nothing local taking from it; out through the court as the wire\'s frame, the relay landing its cap (mutants: 1e9 back; a stand-in emptied by its count)', () => {
  atLevel(20, () => {
    for (const [who, e] of Object.entries(standIns())) {
      assert.deepEqual([e.health, e.maxHealth, e.relayHealth], [STAND_IN_WHOLE, STAND_IN_WHOLE, true], `${who}: whole, the relay's to know`);
      const { dealt } = countOnStandIn(duelSpellOf(DISINTEGRATE), e, playerEntity.level, playerEntity, SURE);
      assert.equal(dealt, STAND_IN_WHOLE, `${who}: a Disintegrate counts its whole`);
      assert.equal(countOnStandIn(duelSpellOf(DISINTEGRATE), e, playerEntity.level, playerEntity, SURE).dealt, STAND_IN_WHOLE, `${who}: and again - nothing took from it`);
      calculateAttackDamage({ isPlayer: true, level: 20, skills: 80, stats: Object.fromEntries(['strength', 'intelligence', 'willpower', 'agility', 'endurance', 'personality', 'speed', 'luck'].map((k) => [k, 75])), health: 200, maxHealth: 200 }, e, { weapon: { templateIndex: 123, material: 8, flags: 0 }, damageMod: 0, toHitMod: 0, backstabChance: 0, rolls: () => 0.5 });
      assert.deepEqual([e.health, e.maxHealth, e.activeEffects], [STAND_IN_WHOLE, STAND_IN_WHOLE, []], `${who}: a swing's formula takes nothing either, and no lasting family stays`);
    }
    // the court's own stand-in, its claim out through the court's door, the wire and the brain
    const link = { st: { ...GATE_STATE_EMPTY, day: 700, boss: 'ruhn', hp: 900, max: 1000, x: 3, z: -4, yaw: 0.5 }, state() { return this.st; } };
    const sent = [];
    const c = createGateCourt({ link, now: () => 5000, feet: () => courtToDungeon(0, 0, 2), send: (hit) => { sent.push(hit); return true; } });
    const { dealt } = countOnStandIn(duelSpellOf(DISINTEGRATE), c.target().entity, playerEntity.level, playerEntity, SURE);
    assert.equal(c.hit({ d: dealt, r: HIT_KINDS.Spell }), true);
    assert.deepEqual(sent, [{ q: 1, d: STAND_IN_WHOLE, r: HIT_KINDS.Spell }], 'the claim, whole');
    const frame = validGateIn({ k: 'hit', ...sent[0] });
    assert.ok(frame, 'the wire carries it');
    const f = newFight(700, 1000, 10_000_000, 'ruhn');
    joinFight(f, 'acct-1', 'Mac', 20, 1000, true);
    f.pos = [3, -4];
    assert.equal(applyHit(f, 'acct-1', frame.d, frame.r, { x: 3, z: -4 + BOSS_R + 2 }, 2000), HIT_CAP_X * dpsRef(20), 'and his bar moves - by a blow\'s cap');
  });
});

test('STAND-IN-WHOLE THE NUMBER SAYS WHAT CAN LAND (scenes/gate/standInSpell.js): a Disintegrate on the Warden, his host or a crystal pops my one-blow cap at my level, on my opponent the referee\'s spell cap - the claim sent whole beside it, the riders told the number; a spell under the cap says itself (mutants: the number uncapped; the claim clipped; the rival\'s cap the gate\'s)', () => {
  const heard = [], told = [], landed = [];
  const S = standIns();
  const doors = createStandInSpell({
    player: playerEntity, say: NOOP, rolls: SURE,
    boss: () => ({ boss: true, entity: S.warden }), crystals: () => [{ crystal: 2, entity: S.crystal }], host: () => [{ host: 3, entity: S.host }],
    rival: () => ({ rival: 'p1', entity: S.rival }),
    landOnBoss: (b, d, r) => landed.push(['him', d, r]), landOnCrystal: (b, d, r) => landed.push([`crystal ${b.crystal}`, d, r]),
    landOnHost: (b, d, r) => landed.push([`host ${b.host}`, d, r]), landOnRival: (b, d, kind) => landed.push([`rival ${b.rival}`, d, kind]),
    nextArenaQ: NOOP, trapNow: () => null, onTrap: () => false,
  });
  setPlayerAttackHook((r) => heard.push(r.damage));
  registerSpellLandedListener('fb1019f', (info) => told.push(info.took));
  try {
    atLevel(20, () => {
      const cap = HIT_CAP_X * dpsRef(20);
      assert.deepEqual([doors.spellOnBoss(DISINTEGRATE), doors.spellOnHost(DISINTEGRATE, 3), doors.spellOnCrystal(DISINTEGRATE, 2), doors.spellOnRival(DISINTEGRATE)], [1, 2, 3, 4]);
      assert.deepEqual(heard, [cap, cap, cap, ARENA_SPELL_MAX], 'what can land: the cap, a bout\'s spell');
      assert.deepEqual(heard, [300, 300, 300, 60]);
      assert.deepEqual(told, [300, 300, 300], 'the riders told the same (none in a bout)');
      assert.deepEqual(landed, [['him', STAND_IN_WHOLE, HIT_KINDS.Spell], ['host 3', STAND_IN_WHOLE, HIT_KINDS.Spell], ['crystal 2', STAND_IN_WHOLE, HIT_KINDS.Spell], ['rival p1', STAND_IN_WHOLE, 'spell']], 'the claim whole - the relay\'s caps decide (its stun and its ward weigh it first)');
      heard.length = 0; told.length = 0;
      doors.spellOnBoss(BOLT); doors.spellOnRival(BOLT);
      assert.deepEqual([heard, told], [[10, 10], [10]], 'a spell under the cap says itself');
    });
    heard.length = 0;
    atLevel(60, () => { doors.spellOnBoss(DISINTEGRATE); });
    assert.deepEqual(heard, [STAND_IN_WHOLE], 'at the level cap: the gate\'s cap, the whole');
  } finally { setPlayerAttackHook(null); registerSpellLandedListener('fb1019f', null); }
  // the law: the gate's one-blow cap at my level, on every factory's body
  assert.equal(standInBlowCap(bossStandIn({ mobile: 31 }, 'x'), 30), 420);
  assert.deepEqual([standInBlowCap(hostStandIn({ mobile: 31, name: 'a lord' }, 1), 30), standInBlowCap(crystalStandIn(bossLookOf('ruhn'), 0), 30)], [420, 420], 'a host body\'s and an object\'s factory the same');
  assert.deepEqual([standInShown(975, 300), standInShown(12.5, 300), standInShown(-4, 300)], [300, 12.5, 0]);
});

test('STAND-IN-WHOLE NOTHING READS A STAND-IN\'S WHOLE AS ITS BODY\'S: the blood ladder measures no whole on one (the bottom rung, as 1e9 gave - never a rung a body of 975 would bleed), a body of the same whole is measured; an "under its health" power reads the relay\'s word, never the whole (mutants: the ladder reads the stand-in\'s whole)', () => {
  for (const [who, e] of Object.entries(standIns())) {
    assert.equal(bloodHit(500, e).maxHealth, 0, `${who}: no whole to measure`);
    assert.equal(bloodRate(500, bloodHit(500, e).maxHealth), RATE_LADDER[0].rate, `${who}: the bottom rung`);
    assert.equal(isOverkill(5000, bloodHit(5000, e).maxHealth), false, `${who}: never an overkill`);
    assert.equal(healthShare(e), null, `${who}: its share the relay's word - none heard here - never its whole's`);
  }
  assert.equal(bloodHit(500, { maxHealth: STAND_IN_WHOLE }).maxHealth, STAND_IN_WHOLE, 'a body of that whole is measured');
  assert.equal(bloodRate(500, STAND_IN_WHOLE), RATE_LADDER[2].rate);
});
