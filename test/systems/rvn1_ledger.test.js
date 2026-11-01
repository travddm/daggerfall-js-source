// RVN1 - THE LEDGER OF WOUNDS, AND EVERY NEW FIELD OF THE RECORD (and
// 26;, then "Go" on every call). A body that may become (or already is) a revenant keeps a LEDGER while the
// player fights it - what the player dealt, by weapon class and element, silver apart; the staggers, the blows dodged
// (perfectly too), the blows at its back, a backstab; whether the fight began by night, and where - and its deed folds
// the ledger into the record's SCARS: its leading source at 40% or more, else `mixed`, and its lessons. Every field
// FEUD adds to the record enters here at once, so the save changes once: each with its validator, and an older
// record's value derived (its weakness, signature and kin drawn on its id - never the shared DFRandom).
// Pinned: the leaf's laws; the ledger written from the REAL formulas' tail (melee by class, silver, a bow's shaft,
// bare hands, a backstab), a spell's real landing (hostMagic) and its real later rounds (effects) - never twice, never
// a peer's or a foe's; the brain's real overreach (dodged, perfect); the poise door (a stagger, a blow at its back);
// the fold at the deed; the scars' thresholds; the record's fields, their validators and their draws; the store's
// lastDay through the save and the mirror; the page's scars and deed words; where each foe pool tags its place.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); }, clear: () => _store.clear(), key: (i) => [..._store.keys()][i] ?? null, get length() { return _store.size; },
};

const N = await import('../../src/systems/revenant/revenant.js');
const L = await import('../../src/systems/feudLedger.js');
const F = await import('../../src/systems/revenant/revenantFeud.js');
const { setPref, _resetForTests } = await import('../../src/systems/uiPrefs.js');
const { calculateAttackDamage } = await import('../../src/combat/formulas.js');
const { createWeapon } = await import('../../src/combat/enemyEquipment.js');
const { makeEnemyEntity } = await import('../../src/characters/enemy/enemyEntity.js');
const { ENEMY_BASICS } = await import('../../src/characters/enemy/enemyBasics.js');
const { MOBILE_TYPES: M } = await import('../../src/characters/mobile/mobileTypes.js');
const { WEAPONS: W } = await import('../../src/characters/weapons.js');
const { createPlayerMagic } = await import('../../src/scenes/hostMagic.js');
const { applySpell, tickActiveEffects } = await import('../../src/systems/effects.js');
const { setWorldMinutes } = await import('../../src/systems/worldTick.js');
const { getSeed, setSeed } = await import('../../src/formats/dfRandom.js');
const { modSaveRecords, restoreModSaveRecords, newGameModSaveRecords } = await import('../../src/systems/modSaveData.js');
const { setPlayerDoor } = await import('../../src/systems/playerDoor.js');
const { setTacticsClock, resetTactics, noteLocalPlayer } = await import('../../src/ai/tactics.js');
const { liveBlows, resetBlows, inBlow } = await import('../../src/ai/foeBlows.js');
const { windupDoor } = await import('../../src/scenes/hostCombat.js');
const { Collider } = await import('../../src/player/collider.js');
const { EnemyAI } = await import('../../src/characters/enemy/enemyMotor.js');
const { EnemyAttack } = await import('../../src/characters/enemy/enemyAttack.js');
const { MobileUnit, PRIMARY_ATTACK_ANIM_SPEED } = await import('../../src/characters/mobile/mobileUnit.js');
const { drawRevenantsPage, scarWords } = await import('../../src/ui/revenant/revenantPage.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const stats = () => ({ strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 });
const me = () => ({ isPlayer: true, name: 'Ayla Stormwind', characterId: 'char-rvn1', level: 5, stats: stats(), skills: new Array(35).fill(40), career: {}, activeEffects: [], items: [], health: 50, maxHealth: 60, magicka: 0, maxMagicka: 100, armorValues: new Array(7).fill(100) });
/** A real foe entity - a champion orc (a candidate) unless `plain`. */
const orc = ({ plain = false, mobileType = M.Orc, level = 6 } = {}) => {
  const e = makeEnemyEntity(mobileType, ENEMY_BASICS[mobileType], { ...stats(), attackModifierFlags: 0 }, level, () => 0.5);
  if (!plain) { e.champion = 'mighty'; e.unquiet = true; }   // UNQUIET (Revenants.md section 46): a marked one - the only one that may rise
  return e;
};
/** My blow, through the real formulas, until it lands. */
function land(attacker, target, opts = {}) {
  let d = 0;
  for (let i = 0; i < 40 && !(d > 0); i++) d = calculateAttackDamage(attacker, target, { rolls: () => 0.2, ...opts });
  assert.ok(d > 0, `the blow lands (${d})`);
  return d;
}
const sumDmg = (l) => Object.values(l.dmg).reduce((a, b) => a + b, 0);

beforeEach(() => {
  _resetForTests(); setPref('lootRarity', true); setPref('enhancedAI', true);
  N._resetRevenantForTests(); _store.clear(); setPlayerDoor(null);
  setWorldMinutes(12 * 60);   // noon on day 0
});

// ── the leaf ────────────────────────────────────────────────────────

test('RVN1 the ledger\'s day and place: night on the SKY\'s minute when it opens (worldClock.isNight), its start the character\'s minute; the place its pool\'s tag - street, building, dungeon - else the street (mutants: night never read; read at the fold; the place ignored)', () => {
  setWorldMinutes(1440 * 3 + 120);   // 02:00, day 3
  const a = orc();
  L.noteFeud(a, 'dodged');
  assert.equal(a._feud.night, true, 'opened at two in the morning');
  assert.equal(a._feud.start, 1440 * 3 + 120);
  assert.equal(a._feud.place, 'street', 'no tag: the street');
  setWorldMinutes(1440 * 3 + 720);
  L.noteFeud(a, 'dodged');
  assert.equal(a._feud.night, true, 'what the fight began as, not what it is now');
  const b = orc();
  b._feudPlace = 'dungeon';
  L.noteFeud(b, 'dodged');
  assert.equal(b._feud.night, false, 'noon');
  assert.equal(b._feud.place, 'dungeon');
  const c = orc();
  c._feudPlace = 'building';
  L.noteFeud(c, 'dodged');
  assert.equal(c._feud.place, 'building');
  const d = orc();
  d._feudPlace = 'the moon';
  L.noteFeud(d, 'dodged');
  assert.equal(d._feud.place, 'street', 'an odd tag: the street');
});

// ── written from the real seams ─────────────────────────────────────

test('RVN1 my blow, from the REAL formulas\' tail: its final damage by its weapon\'s class - a longsword a blade, a warhammer blunt, a battle axe an axe, a bow\'s shaft an arrow, bare hands h2h - silver by its metal; a backstab marked; a peer\'s blow, a foe\'s, a blow at a plain foe never (mutants: the listener unregistered; the class by the wrong skill; silver never read; the backstab never told)', () => {
  const p = me();
  const cases = [[W.Longsword, 'blade'], [W.Dagger, 'blade'], [W.Warhammer, 'blunt'], [W.Battle_Axe, 'axe'], [W.Short_Bow, 'arrow'], [null, 'h2h']];
  for (const [tpl, cls] of cases) {
    const o = orc();
    const weapon = tpl == null ? null : createWeapon(tpl, 0, () => 0.5);
    const d = land(p, o, { weapon });
    assert.equal(o._feud.dmg[cls], d, `${tpl}: ${cls}`);
    assert.equal(sumDmg(o._feud), d, `${tpl}: only ${cls}`);
    assert.equal(o._feud.silver, 0, 'no silver');
    assert.equal(o._feud.backstab, false);
  }
  const s = orc();
  const silver = createWeapon(W.Longsword, 2, () => 0.5);
  const d1 = land(p, s, { weapon: silver });
  const d2 = land(p, s, { weapon: createWeapon(W.Longsword, 1, () => 0.5) });
  assert.equal(s._feud.silver, d1, 'the silver blade\'s, not the steel\'s');
  assert.equal(s._feud.dmg.blade, d1 + d2);
  const b = orc();
  land(p, b, { weapon: createWeapon(W.Dagger, 1, () => 0.5), backstabChance: 100 });
  assert.equal(b._feud.backstab, true, 'a backstab');
  const plain = orc({ plain: true });
  land(p, plain, { weapon: silver });
  assert.equal(plain._feud, undefined);
  const peer = orc();
  for (let i = 0; i < 20; i++) calculateAttackDamage({ ...me(), peer: 'p1' }, peer, { weapon: silver, rolls: () => 0.01 });
  let foeOnFoe = 0;
  for (let i = 0; i < 20 && !(foeOnFoe > 0); i++) foeOnFoe = calculateAttackDamage(orc({ plain: true }), peer, { rolls: () => 0.01 });
  assert.ok(foeOnFoe > 0, 'a foe\'s blow at it landed');
  assert.equal(peer._feud, undefined, 'a peer\'s blow and a foe\'s: nothing in my ledger');
});

const magicFor = (pe) => createPlayerMagic({
  renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch() {} }, audio: { playOneShot() {}, playOneShotId() {}, play3d() {}, play3dId() {} },
  getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }), uploadRecord() {}, uploadRecordFrame() {},
  collider: { raycast: () => Infinity }, playerEntity: pe,
  playerSinks: { hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {}, say() {} },
  say() {}, surfacePlayer() {}, foes: () => [], foeSinks: () => ({}), absorbCtx: () => ({ inside: true, day: false }), rolls: () => 0.99, startCastAnim: null,   // a high roll: the saving throw fails
});
const fx = (type, subType, o = {}) => ({
  type, subType, magnitudeBaseLow: 0, magnitudeBaseHigh: 0, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
  durationBase: 5, durationMod: 0, durationPerLevel: 1, chanceBase: 100, chanceMod: 0, chancePerLevel: 1, ...o,
});
const EMPTY = { type: -1, subType: -1 };
const FIRE = { name: 'Fireball', index: 50, element: 0, rangeType: 1, effects: [fx(4, 0, { magnitudeBaseLow: 9, magnitudeBaseHigh: 9, durationBase: 0 }), EMPTY, EMPTY] };
const FROST_ROT = { name: 'Frostbite', index: 51, element: 1, rangeType: 1, effects: [fx(1, 0, { magnitudeBaseLow: 3, magnitudeBaseHigh: 3, durationBase: 4, durationPerLevel: 99 }), EMPTY, EMPTY] };

test('RVN1 my spell, from the REAL landing (hostMagic.applySpellToFoe) and its REAL later rounds (effects.js): by its element, the landing\'s amount as the target took it; a round counted once (the round sink\'s, never the landing\'s too); a peer\'s spell and a foe\'s never (mutants: the landing unnoted; a round noted twice; rounds unnoted; a peer\'s or a foe\'s noted)', () => {
  const pe = me();
  const magic = magicFor(pe);
  const o = orc();
  const hurt = [];
  magic.applySpellToFoe(FIRE, 5, { entity: o }, null, undefined, { hurt: (n, opt) => hurt.push([n, !!opt?.round]) });
  assert.ok(hurt.length === 1 && hurt[0][0] > 0, `it landed (${JSON.stringify(hurt)})`);
  assert.equal(o._feud.dmg.fire, hurt[0][0], 'what landed, as fire');
  // a lingering frost: its first round at the landing, its later ones from the tick - each once
  const r = orc();
  const took = [];
  const sinks = { hurt: (n, opt) => took.push([n, !!opt?.round]) };
  magic.applySpellToFoe(FROST_ROT, 5, { entity: r }, null, undefined, sinks);
  assert.ok(took.length >= 1 && took.every(([, round]) => round), `the first round (${JSON.stringify(took)})`);
  for (let i = 0; i < 3; i++) tickActiveEffects(r, sinks, () => 0.99);
  assert.ok(took.length >= 3, `rounds ran (${took.length})`);
  const total = took.reduce((a, [n]) => a + n, 0);
  assert.equal(r._feud.dmg.frost, total, 'every round, once each');
  assert.equal(sumDmg(r._feud), total);
  // a peer's (its stand-in caster) and a foe's - nothing in my ledger
  const q = orc();
  magic.applySpellToFoe(FIRE, 5, { entity: q }, { entity: { level: 5 } }, { peerCaster: 'p1' }, { hurt() {} });
  magic.applySpellToFoe(FROST_ROT, 5, { entity: q }, { entity: { level: 5 } }, { peerCaster: 'p1' }, sinks);
  tickActiveEffects(q, sinks, () => 0.99);
  const foe = orc({ plain: true });
  applySpell(FROST_ROT, 5, q, sinks, () => 0.99, { entity: foe });
  tickActiveEffects(q, sinks, () => 0.99);
  assert.equal(q._feud, undefined, 'a peer\'s spell and a foe\'s rounds: none');
  // a round of mine on the player herself is no foe's ledger
  const p2 = me();
  applySpell(FROST_ROT, 5, p2, { hurt() {} }, () => 0.99, null);
  assert.equal(p2._feud, undefined);
});

// ── the brain and the door ──────────────────────────────────────────

const DT = 1 / 60;
const CAM = [0, 1.6, -5];
let T = 0;
setTacticsClock(() => T);
/** TELL4's foe (a plain orc: a champion's tier throws other shapes) - the gate opened for it alone below. */
function brainFoe() {
  const c = new Collider(() => 0);
  const ent = { health: 100, maxHealth: 100, mobileType: M.Orc, level: 12 };
  const at = [0, 0, 8];
  const ai = new EnemyAI(c, [...at], Math.atan2(-at[0], -at[2]), { vitals: () => ent });
  const atk = new EnemyAttack({ liveSpeed: () => 50, playerLevel: () => 5, reflexes: 2 });
  const mobile = new MobileUnit(M.Orc, ENEMY_BASICS[M.Orc], () => 8, () => 0.99);
  return { ai, atk, ent, mobile, mobileType: M.Orc, entity: ent, _seq: 0 };
}
function run(f, secs, player) {
  for (let s = 0; s < Math.round(secs / DT); s++) {
    T += DT;
    noteLocalPlayer(player, [0, 0, 1]);
    f.ai.update(DT, player);
    f.atk.update(DT, f.ai, player);
    const edge = f.atk.swingSeq !== f._seq;
    f._seq = f.atk.swingSeq;
    f.mobile.update(DT, { striking: edge && !f.atk.firedRanged, hold: f.ai._blowHold, hurting: f.ai.hurtKnock || f.ai.staggered }, f.ai.yaw, f.ai.feet, CAM);
    if (f.mobile.doMeleeDamage) f.mobile.doMeleeDamage = false;
  }
}
function untilWindup(f, player) {
  for (let s = 0; s < 3600; s++) {
    run(f, DT, player);
    if (f.ai._tac?.state === 'windup') return liveBlows().get(f.ai) ?? null;
  }
  return null;
}
const SIDE = (f) => {
  const b = liveBlows().get(f.ai), y = b?.yaw ?? 0, o = b?.origin ?? f.ai.feet, a = (55 * Math.PI) / 180;
  const fx2 = Math.sin(y), fz = Math.cos(y), px = -fz, pz = fx2;
  return [o[0] + 3.5 * (Math.cos(a) * fx2 + Math.sin(a) * px), 0, o[2] + 3.5 * (Math.cos(a) * fz + Math.sin(a) * pz)];
};
function dodgeAt(f, blow, player, before) {
  run(f, Math.max(0, blow.land - before - T), player);
  const out = SIDE(f);
  assert.equal(inBlow(blow, out[0], out[2]), false);
  player[0] = out[0]; player[2] = out[2];
  run(f, Math.max(0, blow.land + 0.1 - T), player);
}

test('RVN1 a blow of its I dodged, from the REAL brain: an overreach at me counts `dodged`, a late one `perfect` too (TELL4\'s sample) (mutants: the dodge unnoted; every dodge perfect; a perfect one uncounted)', (t) => {
  L.setFeudGate((e) => e?.mobileType === M.Orc && e.level === 12);   // the brain's seam, whatever makes a body a candidate (the gate's own pin is above)
  t.after(() => L.setFeudGate((e) => N.revenantCandidate(e)));
  resetTactics(); resetBlows(); T = 0;
  const f = brainFoe();
  const player = [0, 0, 0];
  const blow = untilWindup(f, player);
  assert.ok(blow && inBlow(blow, 0, 0), 'it wound one up at me');
  dodgeAt(f, blow, player, 0.45);
  assert.equal(f.ai._tac.state, 'overreach');
  assert.equal(f.ent._feud.dodged, 1);
  assert.equal(f.ent._feud.perfect, 0, 'an early step is no perfect dodge');
  resetTactics(); resetBlows(); T = 0;
  const g = brainFoe();
  const p2 = [0, 0, 0];
  const b2 = untilWindup(g, p2);
  assert.ok(b2 && inBlow(b2, 0, 0));
  dodgeAt(g, b2, p2, 0.12);
  assert.equal(b2.lateIn, true);
  assert.equal(g.ent._feud.dodged, 1);
  assert.equal(g.ent._feud.perfect, 1, 'a perfect dodge');
});

test('RVN1 the poise door: MY blow that staggers counts `staggers`; my blow at its back on a wind-up `backHits`; a peer\'s and a foe\'s never (mutants: the stagger unnoted; the back unnoted; a peer\'s counted)', (t) => {
  L.setFeudGate((e) => e?.mobileType === M.Orc && e.level === 12);
  t.after(() => L.setFeudGate((e) => N.revenantCandidate(e)));
  resetTactics(); resetBlows(); T = 0;
  const f = brainFoe();
  const player = [0, 0, 0];
  const blow = untilWindup(f, player);
  assert.ok(blow);
  const ahead = [blow.origin[0] + Math.sin(blow.yaw) * 2, 0, blow.origin[2] + Math.cos(blow.yaw) * 2];
  const behindFeet = [blow.origin[0] - Math.sin(blow.yaw) * 2, 0, blow.origin[2] - Math.cos(blow.yaw) * 2];
  const sword = createWeapon(W.Longsword, 1, () => 0.5);
  assert.equal(windupDoor(f, 1, { kind: 'melee', weapon: sword, from: ahead, weight: 300 }), 'hold');
  assert.equal(f.ent._feud?.backHits ?? 0, 0, 'from the front: no back hit');
  windupDoor(f, 1, { kind: 'melee', weapon: sword, peer: true, wc: { k: 1, back: true, weak: false }, weight: 300 });
  windupDoor(f, 1, { kind: 'melee', striker: { entity: {}, mobileType: M.Orc, ai: { feet: behindFeet } }, from: behindFeet, weight: 300 });
  windupDoor(f, 1, { kind: 'melee', weapon: sword, from: behindFeet, weight: 300, fromPlayer: false });
  assert.equal(f.ent._feud?.backHits ?? 0, 0, 'a peer\'s, a foe\'s, nobody\'s: none');
  assert.equal(windupDoor(f, 1, { kind: 'melee', weapon: sword, from: behindFeet, weight: 300 }), 'hold');
  assert.equal(f.ent._feud.backHits, 1, 'mine, at its back');
  assert.equal(f.ent._feud.staggers, 0);
  const word = windupDoor(f, 9999, { kind: 'melee', weapon: sword, from: ahead, weight: 300 });
  assert.equal(word, 'stagger');
  assert.equal(f.ent._feud.staggers, 1, 'my stagger');
});

// ── the scars ───────────────────────────────────────────────────────

const ledger = (dmg = {}, o = {}) => ({ dmg: { ...Object.fromEntries(L.FEUD_CLASSES.map((k) => [k, 0])), ...dmg }, silver: 0, staggers: 0, dodged: 0, perfect: 0, backHits: 0, backstab: false, weak: 0, night: false, place: 'street', start: 0, ...o });

test('RVN1 THE SCARS: the leading source at 40% of what was dealt or more (exactly 40% leads), else `mixed`; nothing dealt, neither; silver at 40%; staggered twice, three dodged, three at its back or a backstab; a night fight; the deed; the latest six kept (mutants: the share moved; mixed never; silver by count; each lesson\'s line moved; the deed dropped; more than six kept)', () => {
  assert.equal(F.SCAR_SHARE, 0.4);
  assert.equal(F.SCAR_MAX, 6);
  assert.deepEqual([F.SCAR_STAGGERS, F.SCAR_DODGED, F.SCAR_BACK], [2, 3, 3]);
  assert.deepEqual(F.feudScars(ledger({ fire: 40, blade: 30, arrow: 30 })), ['fire'], 'exactly 40% leads');
  assert.deepEqual(F.feudScars(ledger({ fire: 39, blade: 31, arrow: 30 })), ['mixed'], 'under it, none leads');
  assert.deepEqual(F.feudScars(ledger({})), [], 'nothing dealt');
  assert.deepEqual(F.feudScars(null, 'fled'), ['fled'], 'no ledger: the deed alone');
  assert.deepEqual(F.feudScars(ledger({ blade: 10 }, { silver: 4 })), ['blade', 'silver'], 'silver at 40%');
  assert.deepEqual(F.feudScars(ledger({ blade: 10 }, { silver: 3 })), ['blade']);
  assert.deepEqual(F.feudScars(ledger({}, { staggers: 1, dodged: 2, backHits: 2 })), []);
  assert.deepEqual(F.feudScars(ledger({}, { staggers: 2, dodged: 3, backHits: 3, night: true }), 'slew'), ['staggered', 'dodged', 'back', 'night', 'slew']);
  assert.deepEqual(F.feudScars(ledger({}, { backstab: true })), ['back'], 'a backstab is a blow at its back');
  assert.deepEqual(F.feudScars(ledger({ magic: 5 }), 'nonsense'), ['magic'], 'a deed with no scar of its own');
  const kept = F.withScars(F.withScars([], ['fire', 'night', 'slew'], 10), ['blade', 'staggered', 'dodged', 'fled'], 20);
  assert.deepEqual(kept.map((s) => s.k), ['night', 'slew', 'blade', 'staggered', 'dodged', 'fled'], 'the latest six');
  assert.deepEqual(kept.map((s) => s.at), [10, 10, 20, 20, 20, 20]);
});

test('RVN1 a return is a fight: applyRevenant counts it (an older record\'s count is kills + escapes + returns) (mutants: a return uncounted)', () => {
  const p = me();
  const o = orc();
  const r = N.revenantDeed(p, o, 'fled', { rolls: () => 0.5 });
  assert.equal(r.fights, 1);
  N.applyRevenant(orc(), r);
  assert.equal(r.fights, 2);
});

// ── the record, whole ───────────────────────────────────────────────

const older = (over = {}) => ({ id: 'rvn-older-1', rev: 3, mobileType: M.Orc, gender: 'male', given: 'Grushnak', epithet: 'the Scarred', rank: 1, kills: 2, escapes: 1, returns: 3, personality: 'brutal', ...over });

test('RVN1 AN OLDER RECORD (section 26): every field FEUD adds, derived - scars, learned, took []; weakKnown 0; lair null and unknown; wrath 0; fights kills + escapes + returns; its weakness and kin drawn on its id, its signature at rank 2 and up, else none; a sworn one\'s loyalty its personality\'s start (mutants: any default moved; the draw off its id; a signature at rank 1)', () => {
  const [r] = N.mergeRevenants([older()], []);
  assert.deepEqual(r.scars, []);
  assert.deepEqual(r.learned, []);
  assert.deepEqual(r.took, []);
  assert.equal(r.weakKnown, 0);
  assert.equal(r.lair, null);
  assert.equal(r.lairKnown, false);
  assert.equal(r.wrath, 0);
  assert.equal(r.fights, 6);
  assert.equal(r.weak, F.drawWeakness('rvn-older-1', M.Orc));
  assert.ok(F.isWeakness(r.weak));
  const derived = N.mergeRevenants(Array.from({ length: 12 }, (_, i) => older({ id: `rvn-older-w${i}` })), []);
  assert.deepEqual(derived.map((x) => x.weak), derived.map((x) => F.drawWeakness(x.id, M.Orc)), 'each its own id\'s');
  assert.ok(new Set(derived.map((x) => x.weak)).size > 1, 'ids differ');
  assert.deepEqual(r.kin, F.drawKin('rvn-older-1', M.Orc));
  assert.equal(r.kin.length, Math.max(...F.RETINUE));
  assert.ok(r.kin.every((t) => [M.Orc, M.OrcSergeant, M.OrcShaman].includes(t)), 'orcs bring orcs');
  assert.equal(r.sig, null, 'rank 1: none');
  const [r3] = N.mergeRevenants([older({ rank: 3 })], []);
  assert.equal(r3.sig, F.drawSignature('rvn-older-1', M.Orc));
  const [sw] = N.mergeRevenants([older({ sworn: true, companion: { state: 'with' } })], []);
  assert.equal(sw.companion.loyalty, F.LOYALTY_START.brutal, 'brutal: 55');
  assert.equal(F.LOYALTY_START.brutal, 55);
  assert.deepEqual({ ...F.LOYALTY_START }, { honourable: 80, weary: 70, humorous: 65, cold: 65, witty: 60, zealous: 60, arrogant: 55, brutal: 55, craven: 45, unhinged: 40 });
  assert.equal(F.loyaltyStart('nonsense'), 60);
});

test('RVN1 THE VALIDATORS: a scar of no kind or no minute dropped, the latest six; learned only adaptations, once each, the latest three; a weakness of none drawn again; weakKnown 0-2; a signature of none drawn (rank 2+) and never kept at rank 1; kin only real kinds (a city watchman never), at most three; a lair whole or none, known only with one; took only items, at most three, through the save\'s item law; wrath 0-3; fights whole and not negative; loyalty 0-100 (mutants: any validator dropped)', () => {
  const scars = [{ k: 'fire', at: 1 }, { k: 'nonsense', at: 2 }, { k: 'blade', at: NaN }, { k: 'night', at: 3 }, { k: 'slew', at: 4 }, { k: 'mixed', at: 5 }, { k: 'back', at: 6 }, { k: 'arrow', at: 7 }, { k: 'silver', at: 8 }, null];
  const [r] = N.mergeRevenants([older({
    rank: 1, scars, learned: ['mailed', 'mailed', 'nope', 'braced', 'watchful', 'patient'], weak: 'kryptonite', weakKnown: 3, sig: 'slam',
    kin: [M.Orc, -1, 1.5, M.Knight_CityWatch, 200, M.Rat, M.Orc, M.Orc], lair: { px: 5, py: 6, name: 'Tomb of Vaness', region: 17, junk: 1 }, lairKnown: true,
    took: [{ templateIndex: 120, name: 'Longsword' }, { name: 'no template' }, null, { templateIndex: 1 }, { templateIndex: 2 }, { templateIndex: 3 }], wrath: 9, fights: -2,
    sworn: true, companion: { state: 'away', loyalty: 140 },
  })], []);
  assert.deepEqual(r.scars.map((s) => s.k), ['night', 'slew', 'mixed', 'back', 'arrow', 'silver']);
  assert.deepEqual(r.learned, ['patient'], 'its rank\'s (one), the latest, once each, only adaptations');
  const [r5] = N.mergeRevenants([older({ rank: 5, learned: ['mailed', 'mailed', 'nope', 'braced', 'watchful', 'patient'] })], []);
  assert.deepEqual(r5.learned, ['braced', 'watchful', 'patient'], 'at most three');
  assert.equal(r.weak, F.drawWeakness('rvn-older-1', M.Orc));
  assert.equal(r.weakKnown, 0);
  assert.equal(r.sig, null, 'rank 1 keeps none');
  assert.deepEqual(r.kin, [M.Orc, M.Rat, M.Orc], 'real kinds, at most three');
  assert.deepEqual(r.lair, { px: 5, py: 6, name: 'Tomb of Vaness', region: 17 });
  assert.equal(r.lairKnown, true);
  assert.equal(r.took.length, 3);
  assert.equal(r.took[0].templateIndex, 120);
  assert.equal(r.wrath, 3);
  assert.equal(r.fights, 6, 'a bad count derived');
  assert.equal(r.companion.loyalty, 100);
  const [r2] = N.mergeRevenants([older({ rank: 2, sig: 'nonsense', weak: 'silver', weakKnown: 2, lair: { px: 1.5, py: 2, name: 'x' }, lairKnown: true, kin: 'all of them', wrath: -1, fights: 4, companion: { loyalty: -5 }, sworn: true })], []);
  assert.equal(r2.sig, F.drawSignature('rvn-older-1', M.Orc));
  assert.equal(r2.weak, 'silver', 'a weakness kept');
  assert.equal(r2.weakKnown, 2);
  assert.equal(r2.lair, null);
  assert.equal(r2.lairKnown, false, 'known only with a lair');
  assert.deepEqual(r2.kin, F.drawKin('rvn-older-1', M.Orc), 'no list: drawn');
  assert.equal(r2.wrath, 0);
  assert.equal(r2.fights, 4);
  assert.equal(r2.companion.loyalty, 0);
  const [r3] = N.mergeRevenants([older({ rank: 2, sig: 'leap' })], []);
  assert.equal(r3.sig, 'leap', 'a signature kept');
});

test('RVN1 THE POOLS (section 14.1, 16.1, 17): the weakness by kind (the undead fire, silver, blunt, the daylight; a daedra its opposite only where it has one; a beast fire and frost and a cut), the signature by family (a caster\'s the pyre), the kin by faction (a solitary kind none; a beast its own kind; a person its class\'s family) (mutants: a table row moved)', () => {
  const pool = (t) => F.weaknessPool(t).map(([w]) => w);
  assert.deepEqual(pool(M.Zombie), ['fire', 'magic', 'silver', 'blunt', 'daylight']);
  assert.deepEqual(pool(M.FireDaedra), ['frost', 'shock', 'magic']);
  assert.deepEqual(pool(M.FrostDaedra), ['fire', 'shock', 'magic']);
  assert.deepEqual(pool(M.Daedroth), ['shock', 'magic'], 'no element: no opposite');
  assert.deepEqual(pool(M.IceAtronach), ['fire', 'shock', 'blunt']);
  assert.deepEqual(pool(M.IronAtronach), ['shock', 'blunt']);
  assert.deepEqual(pool(M.Vampire), ['fire', 'dwarven', 'daylight']);
  assert.deepEqual(pool(M.Werewolf), ['fire', 'dwarven']);
  assert.deepEqual(pool(M.Orc), ['fire', 'shock', 'elven', 'arrow', 'blade']);
  assert.deepEqual(pool(M.Rat), ['fire', 'frost', 'axe', 'arrow']);
  assert.equal(pool(M.Warrior).length, 12, 'a person: every element, two metals, five weapons');
  assert.deepEqual(['element', 'metal', 'weapon', 'sun', null], ['fire', 'silver', 'axe', 'daylight', 'x'].map(F.weaknessKind));
  assert.equal(F.signatureFamily(M.Orc), 'blade');
  assert.equal(F.signatureFamily(M.Giant), 'brute');
  assert.equal(F.signatureFamily(M.Werewolf), 'beast');
  assert.equal(F.signatureFamily(M.Mage), null);
  assert.equal(F.drawSignature('x', M.Mage), 'pyre');
  assert.equal(F.drawSignature('x', M.Rat), 'pyre', 'no family: the pyre');
  assert.ok(['ring', 'charge'].includes(F.drawSignature('x', M.Giant)));
  assert.deepEqual(F.kinPool(M.Giant), [], 'a giant rides alone');
  assert.deepEqual(F.kinPool(M.Lich), []);
  assert.deepEqual(F.kinPool(M.Rat), [M.Rat]);
  assert.deepEqual(F.kinPool(M.SkeletalWarrior), [M.SkeletalWarrior, M.Zombie, M.Ghost, M.Wraith]);
  assert.deepEqual(F.kinPool(M.Burglar), [M.Thief, M.Rogue, M.Burglar, M.Acrobat, M.Assassin]);
  assert.deepEqual(F.drawKin('x', M.Giant), []);
  assert.deepEqual(F.weaponFeudClass(null), { cls: 'h2h', silver: false });
  assert.deepEqual(F.weaponFeudClass({ templateIndex: W.Staff, material: 2 }), { cls: 'blunt', silver: true });
  assert.deepEqual(F.weaponFeudClass({ templateIndex: 9999 }), { cls: 'other', silver: false });
});

test('RVN1 THE STORE: lastDay rides the save slot and the mirror - read back a whole day or none, the later of the two kept, never counted twice; a new game clears it (mutants: lastDay unsaved; unrestored; unmirrored; unread from the mirror; the earlier kept; a bad day kept; a new game keeping it)', () => {
  const slot = () => modSaveRecords()[N.REVENANT_SAVE];
  restoreModSaveRecords({ [N.REVENANT_SAVE]: { v: 1, list: [], lastDay: 7 } });
  assert.equal(slot().lastDay, 7, 'restored, and saved again');
  for (const bad of [-1, 1.5, '7', null, undefined]) {
    restoreModSaveRecords({ [N.REVENANT_SAVE]: { v: 1, list: [], lastDay: bad } });
    assert.equal(slot().lastDay, null, `${bad}: none`);
  }
  // the mirror: written with the day, and the later of the save's and the mirror's kept when a character's is read in
  const p = me();
  restoreModSaveRecords({ [N.REVENANT_SAVE]: { v: 1, list: [], lastDay: 4 } });
  N.revenantDeed(p, orc(), 'fled', { rolls: () => 0.5 });
  const key = `${N.REVENANT_STORE_PREFIX}${p.characterId}`;
  assert.equal(JSON.parse(_store.get(key)).lastDay, 4, 'mirrored');
  _store.set(key, JSON.stringify({ ...JSON.parse(_store.get(key)), lastDay: 9 }));
  restoreModSaveRecords({ [N.REVENANT_SAVE]: { v: 1, list: [], lastDay: 6 } });
  N.revenantsFor(p);
  assert.equal(slot().lastDay, 9, 'the mirror\'s later day');
  _store.set(key, JSON.stringify({ ...JSON.parse(_store.get(key)), lastDay: 2 }));
  restoreModSaveRecords({ [N.REVENANT_SAVE]: { v: 1, list: [], lastDay: 6 } });
  N.revenantsFor(p);
  assert.equal(slot().lastDay, 6, 'the save\'s later day');
  _store.set(key, JSON.stringify({ ...JSON.parse(_store.get(key)), lastDay: 'tomorrow' }));
  restoreModSaveRecords({ [N.REVENANT_SAVE]: { v: 1, list: [], lastDay: 6 } });
  N.revenantsFor(p);
  assert.equal(slot().lastDay, 6, 'a bad mirror day is none');
  restoreModSaveRecords({});
  assert.equal(slot().lastDay, null, 'a save that never knew one: none');
  restoreModSaveRecords({ [N.REVENANT_SAVE]: { v: 1, list: [], lastDay: 7 } });
  newGameModSaveRecords();
  assert.equal(slot().lastDay, null, 'a new game clears it');
});

// ── the page, the pools ─────────────────────────────────────────────

