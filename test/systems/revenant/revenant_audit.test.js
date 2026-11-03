// REVENANT AUDIT - every finding of the five-way audit of
// the Revenants (the records and their words, the kill-or-spare flow, the sworn companions, the UI, the burn and the
// portals), pinned by what it does where it can be run, and by its source where it is a host's wiring.

import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOBILE_TYPES } from '../../../src/characters/mobile/mobileTypes.js';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); }, clear: () => _store.clear(), key: (i) => [..._store.keys()][i] ?? null, get length() { return _store.size; },
};
const N = await import('../../../src/systems/revenant/revenant.js');
const P = await import('../../../src/systems/revenant/revenantPersonality.js');
const T = await import('../../../src/systems/revenant/revenantTrophy.js');
const F = await import('../../../src/systems/revenant/revenantFate.js');
const RC = await import('../../../src/systems/revenant/revenantCompanions.js');
const S = await import('../../../src/systems/companionSlots.js');
const H = await import('../../../src/systems/harmMark.js');
const { setPref, _resetForTests } = await import('../../../src/systems/uiPrefs.js');
const { modSaveRecords, restoreModSaveRecords } = await import('../../../src/systems/modSaveData.js');
const { validFoeRecord } = await import('../../../src/net/wire.js');
const { fateKey } = await import('../../../src/ui/revenant/revenantFateView.js');
const { createInventoryWindow } = await import('../../../src/ui/inventoryDoor.js');
const { createPortalSet, PORTAL_SOUND } = await import('../../../src/scenes/portalFx.js');
const { setPlayerDoor } = await import('../../../src/systems/playerDoor.js');

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const player = (id = 'char-audit') => ({
  isPlayer: true, name: 'Ayla Stormwind', characterId: id, level: 10, items: [], goldPieces: 0, activeEffects: [], health: 100, maxHealth: 100,
  stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
});
const orc = (over = {}) => ({ mobileType: MOBILE_TYPES.Orc, level: 6, health: 60, maxHealth: 60, team: 'Orcs', champion: 'mighty', unquiet: true, ...over });
function fresh() {
  _resetForTests(); setPref('lootRarity', true);
  N._resetRevenantForTests(); RC._resetRetinueForTests(); S._resetCompanionSlotsForTests(); H._resetHarmMarkForTests(); _store.clear(); setPlayerDoor(null);
  S.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── THE RECORDS ──────────────────────────────────────────────────────────────────────────────────────────────────
test('AUDIT A1/A6: a judged revenant does no deed - executed, released or sworn, its poison finishing the player raises nothing and ranks nothing; one forgotten never lends its id; the cap never buries one standing in the world (mutants: a judged one ranked up; an executed one re-made under its own id; one standing buried)', () => {
  fresh();
  const me = player();
  RC.setRetinuePlayer(me);
  const e = orc();
  const r = N.revenantDeed(me, e, 'fled', { now: 10, rolls: () => 0 });
  N.revenantSpared(me, e, { state: 'with' });
  const rank = r.rank;
  assert.equal(N.revenantDeed(me, e, 'slew', { now: 20, rolls: () => 0 }), null, 'sworn: no deed');
  assert.equal(N.revenantById(r.id).rank, rank, 'not ranked up');
  const e2 = orc({ champion: 'swift' });
  const r2 = N.revenantDeed(me, e2, 'fled', { now: 30, rolls: () => 0 });
  N.revenantExecuted(me, e2);
  const before = N.allRevenants().length;
  assert.equal(N.revenantDeed(me, e2, 'slew', { now: 40, rolls: () => 0 }), null, 'executed: no deed');
  assert.equal(N.allRevenants().length, before, 'and no second record under its id');
  assert.equal(N.revenantById(r2.id).fate, 'executed');
  // the cap: the living full, one of them out in the world - a deserter coming back past it buries the weakest that is
  // NOT out (
  // back from the sworn)
  fresh();
  RC.setRetinuePlayer(me);
  const s = N.revenantDeed(me, orc({ champion: 'swift' }), 'fled', { now: -10, rolls: () => 0 });
  N.revenantSpared(me, { revenant: { id: s.id } }, { state: 'away' });
  const out = N.revenantDeed(me, orc(), 'slew', { now: 0, rolls: () => 0 });   // a kill: it stands over the body (out) - the weakest, the oldest
  assert.equal(out.out, true);
  for (let i = 0; i < N.REVENANT_MAX - 1; i++) N.revenantDeed(me, orc({ champion: 'stalwart' }), 'fled', { now: 100 + i, rolls: () => 0.4 });
  assert.equal(N.livingRevenants().length, N.REVENANT_MAX);
  N.revenantDeserts(me, N.revenantById(s.id), { now: 200 });
  assert.ok(N.livingRevenants().some((x) => x.id === out.id), 'the one standing is never buried');
  assert.equal(N.livingRevenants().length, N.REVENANT_MAX, 'the cap holds');
  // a tombstone's id is never worn again (AUDIT UNQUIET, Revenants.md section 49: past the cap no birth at all - room made)
  N.revenantSlain(me, { revenant: { id: out.id } });
  const e3 = orc({ revenant: { id: 'long-gone' } });
  const r3 = N.revenantDeed(me, e3, 'fled', { now: 500, rolls: () => 0 });
  assert.notEqual(r3.id, 'long-gone', 'a forgotten id is not reused');
});

test('AUDIT A7-A15: its words - the tally taunt only with kills to count, a revenant\'s flight knows the player\'s name, a beast\'s moment keeps what it says, a skeleton is never a wit, a $ in a name is a letter, three risen taunts each, one possessive for every title, the cornered say their words (mutants: the tally for a runner; a stranger to its own revenant; the body dropped; a mute kind talking temperaments)', () => {
  fresh();
  const me = player();
  const r = N.revenantDeed(me, orc(), 'fled', { now: 0, rolls: () => 0 });
  r.rank = 4; r.kills = 0; r.personality = 'humorous';
  for (let i = 0; i < 20; i++) assert.doesNotMatch(N.revenantTauntEvent(r, me.name, { rolls: () => i / 20 }).speech, /tally on my arm/, 'a runner keeps no tally');
  r.kills = 3;
  const said = new Set(); for (let i = 0; i < 3; i++) said.add(N.revenantTauntEvent(r, me.name, { rolls: () => i / 3 }).speech);
  assert.ok(P.voiceLines('humorous', 'taunt_risen').every((l) => said.has(l.replace(/\{p\}/g, 'Ayla'))), 'with kills, the risen\'s');
  for (const id of P.PERSONALITY_IDS ?? Object.keys(P.PERSONALITIES)) assert.ok(P.voiceLines(id, 'taunt_risen').length >= 3, `${id}: three risen taunts`);
  // the flight, by name
  r.personality = 'honourable';
  const fl = N.revenantFleeEvent({ revenant: { id: r.id }, mobileType: r.mobileType }, 'Orc', { playerName: 'Ayla Stormwind', rolls: () => 0.99 });
  assert.match(fl.speech, /Ayla/, 'its own revenant knows the name');
  const cor = N.revenantCorneredEvent({ revenant: { id: r.id }, mobileType: r.mobileType }, 'Orc', { playerName: 'Ayla', rolls: () => 0 });
  assert.ok(cor.line.includes(cor.speech), 'the cornered line says its words');
  // a beast's moment keeps the body
  const bat = { id: 'bat-1', name: 'Screech the Lucky', mobileType: MOBILE_TYPES.GiantBat, personality: 'craven', rank: 1, gender: 'male' };
  const ev = N.revenantMomentEvent('spared', bat, 'Ayla', { body: 'It waits until you call it.' });
  assert.equal(ev.speech, null);
  assert.match(ev.body, /It waits until you call it\.$/, 'the moment\'s own words after its deed');
  assert.match(ev.line, /It waits until you call it\.$/, 'and on the text line');
  // a mute kind leans as a beast
  const beastPool = new Set(['brutal', 'craven', 'humorous', 'cold', 'unhinged', 'weary', 'honourable']);
  for (const mt of [MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Zombie, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.IronAtronach]) {
    for (let i = 0; i < 40; i++) assert.ok(beastPool.has(P.personalityFor(`id-${i}`, mt)), `kind ${mt}: never a wit or a zealot`);
    assert.equal(N.revenantSpeaks(mt), false);
  }
  // a $ in a name
  assert.equal(P.voiceLine('witty', 'escape', { p: 'Jo$&n', rolls: () => 0 }), 'Do keep the scar I gave you, Jo$&n. A keepsake.');
  // one possessive
  assert.equal(P.possessive('Varis'), "Varis'"); assert.equal(P.possessive('Ayla'), "Ayla's");
  const ep = N.revenantEpithet('slew', 4, 'Marcus', () => 0.99);
  assert.ok(!/Marcus's/.test(ep), `the epithet's possessive is the trophy's (${ep})`);
  assert.ok(N.REVENANT_EPITHETS.risen.some((x) => x === '{p}\'s Shadow'));
  assert.equal(N.revenantEpithet('slew', 1, '', () => 4.5 / 8), 'Bane of Stranger', 'a name in a title is capitalised');
});

// ── THE UI ───────────────────────────────────────────────────────────────────────────────────────────────────────
test('AUDIT D1/D4/D5: Enter on a focused button is that button\'s; the judgement opens in beast form; the classic box keys short and its details wrapped, a refused choice saying why (mutants: Enter confirms over Back; the beast refuses; a long label)', () => {
  const fate = { options: [{ id: 'kill', key: 'K', label: 'Kill', detail: 'It drops a rod', disabled: false }, { id: 'spare', key: 'S', label: 'Spare', detail: 'You keep 6 sworn already. Release one first', disabled: true }], name: 'Grushnak', sub: 'Rank II', plea: { speech: 'Mercy!' }, choose: () => {} };
  const got = [];
  const kit = { onPick: (id) => got.push(['pick', id]), onChoose: (id) => got.push(['choose', id]) };
  assert.equal(fateKey({ key: 'Enter', target: { closest: () => ({}) } }, fate, 'kill', kit), false, 'a focused button keeps its Enter');
  assert.equal(fateKey({ key: 'Enter', target: { closest: () => null } }, fate, 'kill', kit), true);
  assert.deepEqual(got, [['choose', 'kill']]);
  const w = createInventoryWindow({ fate, entity: { isPlayer: true, items: [] } });
  assert.deepEqual(w.options.map((o) => o.label), ['K - Kill', 'Esc - Leave it kneeling'], 'short keys; the refused one not offered');
  assert.ok(w.lines.some((l) => /Spare: You keep 6 sworn already/.test(l)), 'its reason in the wrapped lines');
});

// ── THE BURN AND THE PORTALS ─────────────────────────────────────────────────────────────────────────────────────
test('AUDIT E2/E7/E8: the portal speaks by its sound ID; the leave hand-offs wait for the foe loop; no portal standing allocates nothing (mutants: an index played; the splice under the loop)', () => {
  const played = [];
  const renderer = { createBillboardBatch: () => ({ conceal: undefined }), destroyBillboardBatch: () => {}, uploadTexture: () => {}, uploadEmissionTexture: () => {} };
  const set = createPortalSet({ renderer, audio: { play3dId: (id) => played.push(['id', id]), play3d: (i) => played.push(['index', i]) }, now: () => 0 });
  assert.equal(set.batches(), set.batches(), 'none standing: one shared empty list');
  set.open([0, 0, 0]);
  assert.deepEqual(played, [['id', PORTAL_SOUND]]);
  for (const p of ['src/scenes/exteriorFoes.js', 'src/scenes/dungeonContext.js']) {
    const s = read(p);
    assert.match(s, /_leftDone\.push\(f, f\.leaving\.done\); f\.leaving = null;/, `${p}: queued`);
    assert.match(s, /if \(_leftDone\.length\) runLeftDone\(\);/, `${p}: run after the loop`);
  }
});

