// AUDIT FEUD (- the AUDIT FEUD record): RVN1-RVN13 read again whole by four lenses - the record and its merge, the
// deeds and their flows, the four hosts, the words, the page and the wire - every finding verified before it was fixed.
// Pinned here: each fix through its real door where it has one, its seam where it is a host's.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); }, clear: () => _store.clear(), key: (i) => [..._store.keys()][i] ?? null, get length() { return _store.size; },
};

const N = await import('../../src/systems/revenant/revenant.js');
const F = await import('../../src/systems/revenant/revenantFeud.js');
const RC = await import('../../src/systems/revenant/revenantCompanions.js');
const S = await import('../../src/systems/companionSlots.js');
const L = await import('../../src/systems/feudLedger.js');
const P = await import('../../src/systems/revenant/revenantPersonality.js');
const PG = await import('../../src/ui/revenant/revenantPage.js');
const LR = await import('../../src/systems/loot/lootRarity.js');
const { blowClassOf } = await import('../../src/ai/puppetBlows.js');
const { hitClassField, hitClassOf } = await import('../../src/net/wire.js');
const { blowK } = await import('../../src/ai/tells.js');
const { setPref, _resetForTests } = await import('../../src/systems/uiPrefs.js');
const { setWorldMinutes } = await import('../../src/systems/worldTick.js');
const { MOBILE_TYPES: M } = await import('../../src/characters/mobile/mobileTypes.js');
const { modSaveRecords, restoreModSaveRecords } = await import('../../src/systems/modSaveData.js');
const { goldStack } = await import('../../src/systems/inventory.js');
const { createWeapon } = await import('../../src/combat/enemyEquipment.js');
const { WEAPONS: W } = await import('../../src/characters/weapons.js');
const { itemLongName } = await import('../../src/systems/item/itemInfo.js');
const { setLocked } = await import('../../src/systems/item/itemLock.js');
const H = await import('../../src/systems/harmMark.js');

const read = (p) => hostText(p);
const DAY = 1440;
let me;
beforeEach(() => {
  _resetForTests(); setPref('lootRarity', true); H._resetHarmMarkForTests();
  N._resetRevenantForTests(); RC._resetRetinueForTests(); S._resetCompanionSlotsForTests(); _store.clear();
  S.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
  me = { isPlayer: true, name: 'Ayla Stormwind', characterId: 'char-auditfeud', level: 8, health: 100, maxHealth: 100, items: [], stats: {}, skills: [], career: {}, activeEffects: [] };
  RC.setRetinuePlayer(me);
  setWorldMinutes(DAY * 10);
});
const orc = (o = {}) => ({ mobileType: M.Orc, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Monster', ...o });
const made = (deedName = 'fled', o = {}) => N.revenantDeed(me, orc(), deedName, { mobileType: M.Orc, rolls: () => 0, ...o });
function sworn(state = 'with', { loyalty = 5, personality = 'brutal' } = {}) {
  const r = made();
  const s = N.revenantSpared(me, { revenant: { id: r.id } }, { state });
  s.companion.loyalty = loyalty;
  s.personality = personality;
  return s;
}
const piece = (tpl, value) => { const it = createWeapon(tpl, 1, () => 0.5); it.value = value; return it; };
function glenmoril() {
  const it = LR.applyRarity(createWeapon(129, 0, () => 0.5), 'legendary', () => 0.1, [LR.legendaryById('glenmoril-bow')]);
  it.isIdentified = true;
  return it;
}

// ── the wire ────────────────────────────────────────────────────────

// ── the words ───────────────────────────────────────────────────────

test('AUDIT FEUD V1: A PIECE BY ITS NAME AFTER "YOUR" - a legendary\'s article dropped in the theft\'s line, the taunt, the deserter\'s card and the page (mutants: the article kept; each seam on the long name)', () => {
  const bow = glenmoril();
  assert.equal(itemLongName(bow), 'The Glenmoril Bow', 'the pack\'s own name');
  assert.equal(N.takenName(bow), 'Glenmoril Bow');
  assert.equal(N.takenName(createWeapon(W.Longsword, 1, () => 0.5)), itemLongName(createWeapon(W.Longsword, 1, () => 0.5)), 'no article, nothing taken');
  // the theft's line, through the respawn's real door
  const r = made('slew');
  me.items = [bow];
  const t = N.revenantTakes(me, { online: true });
  assert.equal(t.line, `${r.name} took your Glenmoril Bow.`);
  assert.deepEqual(N.tauntMoment(N.revenantById(r.id)).vars, { item: 'Glenmoril Bow' });
  assert.equal(PG.tookWords(N.revenantById(r.id)), 'Took: your Glenmoril Bow. Take it back from it.');
  // a deserter's card
  const s = sworn('away', { loyalty: 3, personality: 'honourable' });
  N.revenantCompanionUpdate(me, s.id, (c) => { c.items = [glenmoril()]; });
  N.revenantDeserts(me, N.revenantById(s.id), { now: DAY * 11 });
  assert.match(N.revenantDesertEvent(N.revenantById(s.id), { playerName: 'Ayla' }).body, /It kept your Glenmoril Bow\./);
});

test('AUDIT FEUD V2: NO VERB TAKES A NUMBER - no {how} or {item} is followed by a verb that needs it one (arrows, fists, gauntlets are many), nor named back as "it" (mutants: a line restored)', () => {
  const singular = /\{(how|item)\}(\s+\w+)?\s+(is|was|does|doesn't|remains|drinks|whispers|suits|has)\b/;
  const backAsIt = /\{(how|item)\}[^.!?]*[.!?]\s[^{]*\bit\b/i;
  for (const id of P.PERSONALITY_IDS) {
    for (const ev of ['learned', 'stole']) {
      for (const l of P.voiceLines(id, ev)) {
        assert.doesNotMatch(l, singular, `${id}.${ev}: "${l}"`);
        assert.doesNotMatch(l, /\{(how|item)\}[^{]*\b(it|it's|its)\b/i, `${id}.${ev}: "${l}" names it back as one`);
        assert.doesNotMatch(l, backAsIt, `${id}.${ev}: "${l}"`);
      }
    }
  }
  assert.equal(P.voiceLine('cold', 'learned', { p: 'Ayla', how: 'arrows', rolls: () => 0 }), 'I have measured your arrows. Nothing remains.');
});

test('AUDIT FEUD V3: A RETURN SPEAKS ONLY OF WHAT CAME AFTER ITS OATH - a deserter with nothing since speaks its leaving; a felling before it is forgotten; a kill after it speaks as ever (mutants: the oath unread; the leaving unspoken)', () => {
  const r = made('fled');
  r.history = [{ deed: 'felled', at: 1, ally: 'Borgakh' }, { deed: 'yielded', at: 2 }, { deed: 'spared', at: 3 }, { deed: 'deserted', at: 4 }, { deed: 'returned', at: 5 }];
  assert.deepEqual(N.tauntMoment(r), { event: 'deserted', vars: {} });
  r.history.push({ deed: 'betrayed', at: 6 });
  assert.deepEqual(N.tauntMoment(r), { event: 'betrayed', vars: {} });
  r.history.push({ deed: 'slew', at: 7 });
  assert.equal(N.tauntMoment(r).event, 'taunt_slew', 'a kill since: as ever');
  r.history = [{ deed: 'felled', at: 1, ally: 'Borgakh' }];
  assert.equal(N.tauntMoment(r).event, 'felled_return', 'never sworn: unchanged');
});

// ── the record and its merge ────────────────────────────────────────

test('AUDIT FEUD R1: A BETRAYAL RELOADED - the save held it sworn with its pack; it betrayed after; the reload stands it as the save had it (mutants: betrayal not a leaving)', () => {
  const s = sworn('with', { loyalty: 5, personality: 'brutal' });
  const a = piece(W.Longsword, 900), b = piece(W.Dagger, 50);
  N.revenantCompanionUpdate(me, s.id, (c) => { c.items = [a, b, goldStack(40)]; });
  const save = modSaveRecords();
  N.revenantBetrays(me, N.revenantById(s.id));
  me.items = [];
  restoreModSaveRecords(save);
  const back = N.revenantRecord(me, s.id);
  assert.equal(back.sworn, true);
  assert.equal(back.companion.items.length, 3, 'its whole pack');
});

test('AUDIT FEUD R2: WHAT IT HELD, ON A RECORD SINCE FALLEN OR SWORN - a reload hands it to me, never strands it on the record (mutants: stranded; handed for one still living)', () => {
  const s = sworn('away', { loyalty: 3, personality: 'honourable' });
  const hi = piece(W.Longsword, 900), lo = piece(W.Dagger, 10);
  N.revenantCompanionUpdate(me, s.id, (c) => { c.items = [hi, lo]; });
  N.revenantFester(me, { now: DAY * 10 + 30, rolls: () => 0 });
  N.revenantFester(me, { now: DAY * 11 + 30, rolls: () => 0 });
  const d = N.revenantById(s.id);
  assert.equal(d.sworn, false, 'deserted');
  assert.deepEqual(d.took.map((i) => i.value), [900]);
  const save = modSaveRecords();
  const savedItems = me.items.slice();
  const e = { mobileType: d.mobileType, level: 6, health: 100, maxHealth: 100, items: [] };
  N.applyRevenant(e, d);
  N.revenantSlain(me, e, { now: DAY * 13 });
  restoreModSaveRecords(save); me.items = savedItems.slice();
  const back = N.revenantRecord(me, s.id);
  assert.equal(back.defeated, true, 'the mirror\'s fall stands');
  assert.deepEqual(back.took, [], 'nothing on a fallen record');
  assert.ok(me.items.some((i) => i.value === 900), 'the piece is mine');
  // one still living keeps what the save says it holds
  _store.clear(); N._resetRevenantForTests();
  const q = made('slew'); me.items = [hi];
  N.revenantTakes(me, { online: true });
  const save2 = modSaveRecords();
  me.items = [];
  restoreModSaveRecords(save2);
  assert.equal(N.revenantRecord(me, q.id).took.length, 1);
  assert.equal(me.items.length, 0);
});

test('AUDIT FEUD R3: A FORGOTTEN ONE THE SAVE HELD SWORN WITH A PACK comes back as the save had it (mutants: the tombstone first)', () => {
  const s = sworn('with', { loyalty: 50 });
  N.revenantCompanionUpdate(me, s.id, (c) => { c.items = [goldStack(500)]; });
  const save = modSaveRecords();
  // the mirror: forgotten since (a tombstone - its id and a newer revision)
  const key = [..._store.keys()].find((k) => _store.get(k).includes(s.id));
  const m = JSON.parse(_store.get(key));
  m.list = m.list.map((r) => (r.id === s.id ? { id: r.id, rev: (r.rev | 0) + 5, gone: true } : r));
  _store.set(key, JSON.stringify(m));
  restoreModSaveRecords(save);
  const back = N.revenantRecord(me, s.id);
  assert.equal(back?.sworn, true);
  assert.equal(back.companion.items.length, 1);
});

test('AUDIT FEUD R4: NO DAY COUNTED TWICE - a reload of an older save replays no festering and no loyalty day the mirror counted (mutants: a clock behind it counted again)', () => {
  const r = made('fled', { now: DAY * 8 });
  r.dueAt = DAY * 9;
  r.personality = 'brutal';   // UNQUIET (Revenants.md section 46): not one of mastery - it festers twice as fast (unquiet.test.js pins it)
  const s = sworn('with', { loyalty: 50, personality: 'honourable' });
  const at = (d) => ({ now: DAY * d + 30, rolls: () => 0.99 });
  N.revenantFester(me, at(10));
  const save = modSaveRecords();
  N.revenantFester(me, at(13));
  const wrath = N.revenantById(r.id).wrath, loyalty = N.revenantById(s.id).companion.loyalty;
  assert.equal(wrath, 1);
  restoreModSaveRecords(save);
  setWorldMinutes(DAY * 10);
  N.revenantRecord(me, r.id);
  N.revenantFester(me, at(10));
  N.revenantFester(me, at(13));
  assert.equal(N.revenantById(r.id).wrath, wrath, 'its wrath once');
  assert.equal(N.revenantById(s.id).companion.loyalty, loyalty, 'its loyalty once');
  N.revenantFester(me, at(14));
  assert.equal(N.revenantById(s.id).companion.loyalty, loyalty + F.LOYALTY.DAY_WITH, 'a new day counts');
});

test('AUDIT FEUD R5: A LEAVER KEEPS ONLY WHAT IT MAY TAKE - a locked piece, a quest item come back with its gold (mutants: the split unfiltered)', () => {
  const s = sworn('away', { loyalty: 3, personality: 'honourable' });
  const locked = piece(W.Longsword, 9000), quest = piece(W.Dagger, 8000), plain = piece(W.Mace, 50);
  setLocked(locked, true); quest.questItem = true;
  N.revenantCompanionUpdate(me, s.id, (c) => { c.items = [locked, quest, plain]; });
  N.revenantDeserts(me, N.revenantById(s.id), { now: DAY * 11 });
  const d = N.revenantById(s.id);
  assert.deepEqual(d.took, [plain], 'it keeps the plain piece');
  assert.ok(me.items.includes(locked) && me.items.includes(quest), 'the rest is mine');
});

// ── the deeds and their flows ───────────────────────────────────────

test('AUDIT FEUD D1: A FELLING IS NO END - the fight\'s ledger stays open (its will broken stays broken), a waiting kill\'s card stays; and one held by its fate fells nobody (mutants: the ledger taken; the notice wiped; each fate unread)', () => {
  const e = orc({ health: 40 });
  const r = made('slew');
  assert.equal(N.revenantById(r.id).notice, 'slew', 'a kill\'s card waiting');
  N.applyRevenant(e, N.revenantById(r.id));
  L.noteFeud(e, 'weak');
  assert.ok(N.revenantFelled(me, { entity: e, mobileType: M.Orc }, 'Borgakh'), 'it fells');
  assert.equal(e._feud?.weak, 1, 'the ledger stands');
  assert.ok(F.willBroken(e._feud), 'its will still broken');
  assert.equal(N.revenantById(r.id).notice, 'slew', 'the kill\'s card waits');
  assert.ok(N.revenantFelled(me, { entity: orc({ health: 1 }), mobileType: M.Orc }, 'Borgakh'), 'a plain striker at 1 fells');
  for (const held of ['yielded', 'executing', 'sparing', 'leaving']) {
    assert.equal(N.revenantFelled(me, { entity: orc({ health: 1 }), mobileType: M.Orc, [held]: { at: 1 } }, 'Borgakh'), null, held);
  }
});

test('AUDIT FEUD D2: NO ROUT FROM A TEAR-AWAY, A FATE OR A PEER\'S FOE (mutants: each unread)', () => {
  const live = (o = {}) => { const f = { mobileType: M.Orc, entity: orc({ health: 40 }), ai: { isHostile: true, detected: true, targetIsLocalPlayer: true }, ...o }; H.markPlayerHarm(f.entity, { now: 1_000_000 }); H.markPlayerLow(1_001_000); return f; };
  assert.equal(N.revenantRoutable(live(), { now: 1_002_000 }), true, 'a plain one routs');
  for (const held of ['leaving', 'executing', 'sparing']) assert.equal(N.revenantRoutable(live({ [held]: { at: 1 } }), { now: 1_002_000 }), false, held);
  assert.equal(N.revenantRoutable(live({ puppet: 'peer-1' }), { now: 1_002_000 }), false, 'a puppet');
});

test('AUDIT FEUD D3: A FIGHT WON IS A FOE KILLED - one that escaped, was culled or scattered (dead, its health whole) is none (mutants: `dead` a win)', () => {
  const rec = { ai: { target: null } };
  const foe = { entity: { health: 40 }, dead: false };
  rec.ai.target = foe; RC.swornFightStep(rec);
  foe.dead = true; rec.ai.target = null;
  assert.equal(RC.swornFightStep(rec), false, 'walked off');
  const kill = { entity: { health: 30 }, dead: false };
  rec.ai.target = kill; RC.swornFightStep(rec);
  kill.entity.health = 0; kill.dead = true; rec.ai.target = null;
  assert.equal(RC.swornFightStep(rec), true, 'killed');
});

// ── the hosts ───────────────────────────────────────────────────────

// ── section 28: the revenant's duel ─────────────────────────────────

// the blows not taken, never slower; AUDIT FEUD 2: the harness's fights re-seeded by its faithful steps)
test('AUDIT FEUD (section 28): THE REVENANT\'S DUEL - an Orc revenant fought to its end through the pools\' own law: its last stand from rank 3, then its will - its weakness struck, it kneels; traded with and never staggered, it tears away; one stagger, it kneels; one perfect dodge, it kneels; a rank-1 kneels with no stand; RVN\'s targets as the arc names them (mutants: the stand skipped; the will unread; the dodge left before the late sample; a target moved)', async () => {
  const { revenantFight: fightIn, FEUD_TARGETS } = await import('../../tools/tellDuel.mjs');
  const revenantFight = (o) => fightIn({ band: false, flight: false, ...o });
  assert.deepEqual(JSON.parse(JSON.stringify(FEUD_TARGETS)), { DODGE_SPARES: 0.1, KNEEL_WEAK: 0.9, KNEEL_DODGE: 0.7, KNEEL_TRADE_MAX: 0.2, RANK_RATIO: [2.5, 3.5] });
  const weak = revenantFight({ rank: 3, weak: true, seed: 1 });
  assert.deepEqual([weak.end, weak.stood, weak.weak > 0], ['knelt', true, true]);
  const tore = revenantFight({ rank: 3, seed: 2 });
  assert.deepEqual([tore.end, tore.stood, tore.staggers, tore.perfect], ['tore', true, 0, 0]);
  const staggered = revenantFight({ rank: 3, seed: 1 });
  assert.deepEqual([staggered.end, staggered.staggers, staggered.perfect, staggered.hitsOnMe], ['knelt', 1, 0, 2], 'one stagger breaks it; a trader is struck');
  const dodge = revenantFight({ rank: 3, mode: 'dodge', seed: 7 });
  assert.deepEqual([dodge.end, dodge.staggers, dodge.perfect, dodge.hitsOnMe], ['knelt', 0, 1, 0], 'one perfect dodge breaks it');
  const one = revenantFight({ rank: 1, seed: 1 });
  assert.deepEqual([one.end, one.stood], ['knelt', false]);
});
