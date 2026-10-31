// AUDIT FEUD 2 (- the AUDIT FEUD 2 record): AUDIT FEUD and FEUD BALANCE read again by four lenses - the record and its flows, the hosts and
// the wire, the duel harness's fidelity, the pins and the docs - every finding reproduced before it was fixed.
// Pinned here: each fix through its real door where it has one (the brain, the street pool, the merge, the deed), its
// seam where it is a host's; the harness's own steps through its exported helpers and its seeded fights.
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
const F = await import('../../src/systems/revenant/revenantFeud.js');
const RC = await import('../../src/systems/revenant/revenantCompanions.js');
const CS = await import('../../src/systems/companionSlots.js');
const L = await import('../../src/systems/feudLedger.js');
const FT = await import('../../src/systems/revenant/revenantFate.js');
const H = await import('../../src/systems/harmMark.js');
const TA = await import('../../src/ai/tactics.js');
const FB = await import('../../src/ai/foeBlows.js');
const LR = await import('../../src/systems/loot/lootRarity.js');
const { setPlayerDoor } = await import('../../src/systems/playerDoor.js');
const { createExteriorFoes } = await import('../../src/scenes/exteriorFoes.js');
const { FOES_STALE_MS } = await import('../../src/net/online.js');
const { hitClassOf } = await import('../../src/net/wire.js');
const { setPref, _resetForTests } = await import('../../src/systems/uiPrefs.js');
const { setWorldMinutes } = await import('../../src/systems/worldTick.js');
const { MOBILE_TYPES: M } = await import('../../src/characters/mobile/mobileTypes.js');
const { modSaveRecords, restoreModSaveRecords, newGameModSaveRecords } = await import('../../src/systems/modSaveData.js');
const { goldStack } = await import('../../src/systems/inventory.js');
const { createWeapon } = await import('../../src/combat/enemyEquipment.js');
const { WEAPONS: W } = await import('../../src/characters/weapons.js');
const { chainMax } = await import('../../src/ai/tells.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const DAY = 1440;
let me;
beforeEach(() => {
  _resetForTests(); setPref('lootRarity', true); H._resetHarmMarkForTests(); setPlayerDoor(null);
  N._resetRevenantForTests(); RC._resetRetinueForTests(); CS._resetCompanionSlotsForTests(); _store.clear();
  CS.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
  me = { isPlayer: true, name: 'Ayla Stormwind', characterId: 'char-auditfeud2', level: 8, health: 100, maxHealth: 100, items: [], stats: {}, skills: [], career: {}, activeEffects: [] };
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
const legendary = (id, tpl) => { const it = LR.applyRarity(createWeapon(tpl, 0, () => 0.5), 'legendary', () => 0.1, [LR.legendaryById(id)]); it.isIdentified = true; return it; };

// ── the brain: a perfect dodge is one I made ───────────────────────

test('AUDIT FEUD 2 B1: A PERFECT DODGE IS ONE I MADE - a leap a ledge stopped short of me, a charge a wall stopped, "misses" a body that never left its shape: no perfect dodge, no will broken (FEUD BALANCE); one I left is (mutants: out unread)', () => {
  setPref('enhancedAI', true);
  let T = 10; TA.setTacticsClock(() => T);
  try {
    const r = made('fled'); r.rank = 3;
    const e = orc({ health: 100, maxHealth: 100 });
    N.applyRevenant(e, N.revenantById(r.id));
    const leap = (stayIn) => {
      TA.noteLocalPlayer([0, 0, 3], [0, 0, -1]);
      const b = FB.makeBlow('leap', [0, 0, 0], 0, T - 0.9); b.ahead = 3;
      const ai = { feet: [0, 0, 0.4], canAct: true, vitals: () => e, _tac: { state: 'windup', blow: b, seen: T, key: TA.LOCAL_TARGET } };
      FB.setLiveBlow(ai, b);
      const was = Math.random; Math.random = () => 0.99;
      try {
        TA.tacticsStep(ai, 0, 1);   // the late sample: inside its disc
        assert.equal(b.lateIn, true);
        if (!stayIn) TA.noteLocalPlayer([4, 0, 3], [0, 0, -1]);   // out before it lands
        T = b.land + 0.01; ai.feet = [0, 0, 0.4];   // the ledge held it short
        TA.tacticsStep(ai, 0, 1);
      } finally { Math.random = was; }
      T += 5;
      return ai;
    };
    const short = leap(true);
    assert.equal(short._blowVerdict, false, 'it missed - short of its point');
    assert.equal(short._perfectAt ?? null, null, 'but I never left: no perfect dodge');
    assert.equal(e._feud?.perfect | 0, 0);
    assert.equal(FT.revenantWillHolds({ entity: e }), true, 'its will holds');
    const left = leap(false);
    assert.ok(left._perfectAt != null, 'I left its disc before it landed: perfect');
    assert.equal(FT.revenantWillHolds({ entity: e }), false, 'and its will breaks');
  } finally { TA.setTacticsClock(null); }
});

// ── the record and its merge ────────────────────────────────────────

test('AUDIT FEUD 2 R1: A RESTORE IS THE SAVE\'S OWN - an older save\'s sworn copy comes back at its own revision, so a newer save loaded after it keeps what happened since (mutants: the restore bumped)', () => {
  const s = sworn('with', { loyalty: 5, personality: 'brutal' });
  const a = piece(W.Longsword, 900), b = piece(W.Dagger, 50);
  N.revenantCompanionUpdate(me, s.id, (c) => { c.items = [a, b, goldStack(40)]; });
  const S1 = modSaveRecords(); const S1items = me.items.slice();
  N.revenantBetrays(me, N.revenantById(s.id));
  const e = { mobileType: s.mobileType, level: 6, health: 100, maxHealth: 100, items: [] };
  N.applyRevenant(e, N.revenantById(s.id), { turned: true });
  N.revenantSlain(me, e, { now: DAY * 12 });
  const S2 = modSaveRecords(); const S2items = me.items.slice();
  restoreModSaveRecords(S1); me.items = S1items.slice();
  assert.equal(N.revenantRecord(me, s.id).sworn, true, 'S1: sworn, as it had it');
  assert.equal(N.revenantById(s.id).companion.items.length, 3);
  N.takeRevenantNotice(me, { now: DAY * 10 + 60 });   // a moment of play: the mirror written
  restoreModSaveRecords(S2); me.items = S2items.slice();
  const r2 = N.revenantRecord(me, s.id);
  assert.deepEqual([r2.defeated, r2.sworn], [true, false], 'S2: slain, as it had it');
  assert.equal(RC.revenantsWithYou().length, 0);
});

test('AUDIT FEUD 2 R2: BY ANY ROAD - a leaving its twelve-deed history has scrolled off still restores the save\'s sworn copy and its pack (mutants: the history read)', () => {
  const s = sworn('away', { loyalty: 3, personality: 'honourable' });
  N.revenantCompanionUpdate(me, s.id, (c) => { c.items = [piece(W.Longsword, 900), piece(W.Dagger, 50), piece(W.Mace, 40), goldStack(40)]; });
  const S1 = modSaveRecords(); const S1items = me.items.slice();
  N.revenantDeserts(me, N.revenantById(s.id), { now: DAY * 11 });
  for (let i = 0; i < 6; i++) {
    const e = { mobileType: s.mobileType, level: 6, health: 100, maxHealth: 100, items: [], champion: 'mighty', unquiet: true };
    N.applyRevenant(e, N.revenantById(s.id), { now: DAY * (12 + i) });
    N.revenantDeed(me, e, 'fled', { mobileType: s.mobileType, rolls: () => 0, now: DAY * (12 + i) + 10 });
  }
  assert.ok(!N.revenantById(s.id).history.some((h) => h.deed === 'deserted'), 'its leaving scrolled off');
  restoreModSaveRecords(S1); me.items = S1items.slice();
  const r = N.revenantRecord(me, s.id);
  assert.deepEqual([r.sworn, r.companion.items.length], [true, 4]);
});

test('AUDIT FEUD 2 R3: WHAT IT HELD, ON A RECORD SINCE FORGOTTEN - the save\'s living copy held a piece; the mirror buried the record since: the piece is mine (mutants: the tombstone first)', () => {
  const X = piece(W.Longsword, 900);
  const a = made('slew', { now: DAY * 8 });
  me.items = [X];
  N.revenantTakes(me, { online: true });
  const save = modSaveRecords(); const savedItems = me.items.slice();
  N.revenantHandBack(me, N.revenantById(a.id));
  N.revenantSpared(me, { revenant: { id: a.id } }, { state: 'away' });
  N.revenantDeserts(me, N.revenantById(a.id), { now: DAY * 11 });
  // UNQUIET (Revenants.md section 46): no birth past REVENANT_MAX buries one any more - a deserter living again past it
  // does: one more sworn, two more born, and that sworn one deserting forgets the weakest, oldest (this one)
  const b = N.revenantDeed(me, orc({ level: 9 }), 'fled', { mobileType: M.Orc, rolls: () => 0, now: DAY * 12 });
  N.revenantSpared(me, { revenant: { id: b.id } }, { state: 'away' });
  for (let i = 1; i < N.REVENANT_MAX; i++) N.revenantDeed(me, orc({ level: 9 }), 'fled', { mobileType: M.Orc, rolls: () => 0, now: DAY * 12 + i });
  N.revenantDeserts(me, N.revenantById(b.id), { now: DAY * 13 });
  assert.equal(N.revenantById(a.id), null, 'buried by the cap');
  restoreModSaveRecords(save); me.items = savedItems.slice();
  N.revenantRecord(me, a.id);
  assert.ok(me.items.includes(X) || me.items.some((i) => i.value === 900), 'the piece is mine');
});

test('AUDIT FEUD 2 R4: A FELLING IN ITS LAST STAND KEEPS PHASE TWO (mutants: the re-stamp drops it)', () => {
  const r = made('fled'); r.rank = 3;
  const e = orc({ health: 100, maxHealth: 100, stats: { speed: 50 } });
  N.applyRevenant(e, N.revenantById(r.id));
  const f = { entity: e, mobileType: M.Orc, ai: null };
  FT.beginLastStand(me, f, { now: 0 });
  assert.ok(e.revenant.p2);
  assert.ok(N.revenantFelled(me, f, 'Borgakh'), 'it fells');
  assert.ok(e.revenant.p2, 'still in phase two');
  assert.equal(chainMax(e), F.PHASE_TWO.CHAIN_MAX);
});

test('AUDIT FEUD 2 R5: THE OATH\'S HAND-BACK names a piece without its article; and an article only at the start goes ("The Amulet of the Nine": "Amulet of the Nine") (mutants: the long name; the anchor)', () => {
  const bow = legendary('glenmoril-bow', 129);
  const r = made('slew'); me.items = [bow];
  N.revenantTakes(me, { online: true });
  const e = { mobileType: M.Orc, level: 6, health: 1, maxHealth: 50, items: [], revenant: { id: r.id } };
  N.applyRevenant(e, N.revenantById(r.id)); e.health = 1;
  const out = FT.beginSpare(me, { entity: e, mobileType: M.Orc, archive: null, yielded: { at: 0 } }, { now: 0, rolls: () => 0 });
  assert.match(out.event.body ?? out.event.line, /It hands back your Glenmoril Bow: /);
  assert.equal(N.takenName(legendary('amulet-of-the-nine', 133)), 'Amulet of the Nine');
});

test('AUDIT FEUD 2 R6: A ROUT KEEPS A KILL\'S WAITING CARD, as a felling does; a new game forgets the killer through the real door (mutants: the rout wipes it; the new game keeps it)', () => {
  const r = made('slew');
  assert.equal(N.revenantById(r.id).notice, 'slew');
  const f = { mobileType: M.Orc, entity: orc({ health: 40 }), ai: { isHostile: true, detected: true, targetIsLocalPlayer: true } };
  N.applyRevenant(f.entity, N.revenantById(r.id));
  N.revenantRouted(me, f);
  assert.equal(N.revenantById(r.id).notice, 'slew', 'the kill\'s card waits');
  me.items = [piece(W.Longsword, 500)];
  newGameModSaveRecords();
  assert.equal(N.revenantTakes(me, { online: true }), null, 'a new game: no killer');
});

// ── the hosts and the wire ──────────────────────────────────────────
function craftCfg() {
  const b = new Uint8Array(74); const v = new DataView(b.buffer);
  b[10] = 0x08; v.setUint16(52, 4, true);
  const attrs = [40, 50, 50, 85, 50, 50, 90, 55];
  for (let i = 0; i < 8; i++) v.setUint16(58 + i * 2, attrs[i], true);
  return b;
}
function craftMonsterBsa(records) {
  const NAME_FIELD = 14, ENTRY = 18;
  const dataLen = records.reduce((a, [, b]) => a + b.length, 0);
  const out = new Uint8Array(4 + dataLen + ENTRY * records.length); const v = new DataView(out.buffer);
  v.setInt16(0, records.length, true); v.setUint16(2, 0x0100, true);
  let pos = 4;
  for (const [, bytes] of records) { out.set(bytes, pos); pos += bytes.length; }
  for (const [name, bytes] of records) { for (let i = 0; i < name.length; i++) out[pos + i] = name.charCodeAt(i); v.setInt32(pos + NAME_FIELD, bytes.length, true); pos += ENTRY; }
  return out;
}
const bsa = craftMonsterBsa([['ENEMY000.CFG', craftCfg()]]);
const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8, getFrameCount: () => 1 };
const settle = () => new Promise((r) => setTimeout(r, 0));
const poolRig = () => ({
  renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, textures: new Map() },
  collider: { raycast: () => Infinity, heightAt: () => 0, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false },
  fetchBytes: async (n) => { if (n === 'MONSTER.BSA') return bsa; throw new Error(`no ${n} in this pin`); },
  getTexture: async () => stubTex, uploadRecordFrame: () => {}, currentMinute: () => 0, currentPixelKey: () => '3,12',
  playerEntity: { isPlayer: true, level: 1, reflexes: 2, skills: new Array(40).fill(20), skillUses: new Array(40).fill(0), items: [], activeEffects: [], stats: { strength: 50, agility: 50, luck: 50, speed: 50 } },
  audio: null, onPlayerHurt: () => {}, rolls: () => 0.5, rand: () => 0.5,
});
const netFor = (hits) => ({ room: () => 'world:3,12', now: () => 0, staleMs: FOES_STALE_MS, onPeerHit: (h, fate) => { hits.push(h); fate?.sent?.(); return true; }, toWire: (p) => p, toScene: (p) => p });

test('AUDIT FEUD 2 W2: AN HEIR\'S FOE WRITES WHAT IT STANDS WITH, through the real street frame (mutants: the writer gated on the id)', async () => {
  const pool = createExteriorFoes(poolRig());
  pool.setNet(netFor([]));
  const f = await pool.spawnFoe(0, [10, 0, 10], { feetGiven: true });
  f.entity.revenant = F.feudFromWire({ id: null, name: 'Grushnak the Butcher', rank: 0 }, { wq: F.weakIndex('silver'), ad: F.adaptMask(['mailed']) });
  const r = pool.foesFrame(true)?.f?.find((x) => x.i === f.seq);
  assert.ok(r, 'its record');
  assert.deepEqual([r.nm, r.wq, r.ad], ['Grushnak the Butcher', F.weakIndex('silver'), F.adaptMask(['mailed'])]);
});

// ── the duel harness ────────────────────────────────────────────────

test('AUDIT FEUD 2 S2: THE HARNESS IS ITS SEEDS - a fight\'s result is its seed\'s whatever DFU\'s shared stream held before it; a trader takes telegraphed blows, a perfect dodger next to none; a revenant from rank 2 bears its signature (mutants: a seed dropped; the blows uncounted; the signature undrawn)', async () => {
  const D = await import('../../tools/tellDuel.mjs');
  const { setSeed } = await import('../../src/formats/dfRandom.js');
  const run = (outer) => { const out = []; for (let seed = 1; seed <= 8; seed++) { setSeed(outer + seed); out.push(D.revenantFight({ rank: 3, seed }), D.fight({ type: M.Orc, weapon: 'Longsword', seed, seconds: 30 }), D.fight({ type: M.Orc, weapon: null, mode: 'dodge', seed, seconds: 30 })); } return out; };
  assert.deepEqual(run(1), run(777777), 'eight revenant fights and eight of TELL\'s, whatever the stream held');
  let trade = 0, dodge = 0;
  for (let seed = 1; seed <= 12; seed++) { trade += D.revenantFight({ rank: 3, seed }).hitsOnMe; dodge += D.revenantFight({ rank: 3, mode: 'dodge', seed }).hitsOnMe; }
  assert.ok(trade >= 12, `a trader is struck (${trade} in 12 fights)`);
  assert.ok(dodge * 10 <= trade, `a perfect dodger a tenth as often or less (${dodge})`);
  assert.equal(D.revenantFight({ rank: 2, seed: 3 }).sig, true, 'rank 2: its signature');
  assert.equal(D.revenantFight({ rank: 1, seed: 3 }).sig, false);
});
