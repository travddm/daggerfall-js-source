// RVN7d - THE LAIR STAND (;, then "Go"). Entering its lair while it is living, unsworn and not out, and due or
// known, a revenant stands at the layout marker farthest from the entrance once the layout has stood - found resting
// (unaware until it sees or hears the player, so a first blow may be a backstab), its drop's gold x1.25, its band about
// it. A loose foe of the player's (online, on the room's SUMMON-SYNC lane - never a room's layout foe). In its own lair
// a due revenant answers a rest's first roll ("You wake to Grushnak standing over you."), and any rest's roll may be a
// due one's return - the open world's arm.
// Pinned: who is at home (each gate, the claim, the rank's order, a rest's due-only ask); the lair's gold; the wake's
// card; the dungeon's build arm and loose stand; the stand on the first frame, its place, its rest and its band; the
// band underground - stood, scattered by every door, its run spent, rank 5's rally; the taunt once roused; the rest's
// two arms, mine alone.
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
const { setPref, _resetForTests } = await import('../../src/systems/uiPrefs.js');
const { setPlayerDoor } = await import('../../src/systems/playerDoor.js');
const { setWorldMinutes } = await import('../../src/systems/worldTick.js');
const { MOBILE_TYPES: M } = await import('../../src/characters/mobile/mobileTypes.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const me = (id = 'char-rvn7d') => ({ isPlayer: true, name: 'Ayla Stormwind', characterId: id, level: 10, stats: {}, skills: [], career: {}, activeEffects: [], items: [], health: 100, maxHealth: 100 });
const NOW = 1440 * 5;

beforeEach(() => {
  _resetForTests(); setPref('lootRarity', true);
  N._resetRevenantForTests(); _store.clear(); setPlayerDoor(null); setWorldMinutes(NOW);
});

const LAIR = Object.freeze({ px: 40, py: 41, name: 'The Pit', region: 5 });
function made(p, { lair = LAIR, rank = 2, dueAt = NOW + 600, known = false } = {}) {
  const r = N.revenantDeed(p, { mobileType: M.Orc, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Monster' }, 'fled', { mobileType: M.Orc, rolls: () => 0 });
  r.lair = lair ? { ...lair } : null; r.lairKnown = known; r.rank = rank; r.dueAt = dueAt; r.out = false;
  return r;
}
const HERE = Object.freeze({ px: 40, py: 41 });

test('RVN7d WHO IS AT HOME: in its lair, living, unsworn, not out, and due or known - claimed (out) as a return is; the higher rank first; a rest asks the due alone; elsewhere, none (mutants: each gate dropped; unclaimed; the order)', () => {
  const p = me();
  const r = made(p);
  assert.equal(N.revenantForLair(p, HERE, { now: NOW }), null, 'not due, not known');
  r.lairKnown = true;
  assert.equal(N.revenantForLair(p, HERE, { now: NOW, dueOnly: true }), null, 'a rest: known is not due');
  const got = N.revenantForLair(p, HERE, { now: NOW });
  assert.equal(got, r, 'known: at home');
  assert.equal(r.out, true, 'claimed');
  assert.ok(r.outAt > 0);
  assert.equal(N.revenantForLair(p, HERE, { now: NOW }), null, 'out: not twice');
  N.releaseRevenantStand(r);
  assert.equal(r.out, false);
  r.lairKnown = false; r.dueAt = NOW - 1;
  assert.equal(N.revenantForLair(p, HERE, { now: NOW, dueOnly: true }), r, 'due: a rest\'s too');
  N.releaseRevenantStand(r);
  assert.equal(N.revenantForLair(p, { px: 41, py: 41 }, { now: NOW }), null, 'another dungeon');
  assert.equal(N.revenantForLair(p, { px: 40, py: 42 }, { now: NOW }), null, 'another dungeon, one row down');
  r.sworn = true;
  assert.equal(N.revenantForLair(p, HERE, { now: NOW }), null, 'sworn');
  r.sworn = false; r.defeated = true;
  assert.equal(N.revenantForLair(p, HERE, { now: NOW }), null, 'fallen');
  r.defeated = false;
  setPref('lootRarity', false);
  assert.equal(N.revenantForLair(p, HERE, { now: NOW }), null, 'the switch off');
  setPref('lootRarity', true);
  assert.equal(N.revenantForLair(p, null, { now: NOW }), null);
  assert.equal(N.revenantForLair(p, { px: 'a', py: 41 }, { now: NOW }), null);
  // two at home: the higher rank, then the longer due
  const q = made(p, { rank: 4, dueAt: NOW - 1 });
  assert.equal(N.revenantForLair(p, HERE, { now: NOW }), q, 'the higher rank');
  N.releaseRevenantStand(q);
  q.rank = 2; q.dueAt = NOW - 1; r.dueAt = NOW - 50;
  assert.equal(N.revenantForLair(p, HERE, { now: NOW }), r, 'as high: the longer due');
});

test('RVN7d ITS GOLD AND ITS WAKE: found in its lair its drop\'s gold is x1.25, once; the wake\'s card in the narrator\'s words, its kicker its lair (mutants: the mult unread; the card unsaid)', () => {
  const p = me();
  const r = made(p);
  const plain = N.revenantLoot(10, 2, () => 0.5);
  const lair = N.revenantLoot(10, 2, () => 0.5, F.LAIR_GOLD);
  const amount = (items) => items.at(-1).stackCount;   // its gold the last of the drop
  assert.equal(lair.at(-1).group, 'Currency');
  const [lo, hi] = N.REVENANT_LOOT.goldPerLevel;
  assert.equal(amount(plain), Math.round(10 * 2 * (lo + 0.5 * (hi - lo))));
  assert.equal(amount(lair), Math.round(10 * 2 * (lo + 0.5 * (hi - lo)) * 1.25), 'x1.25');
  assert.equal(N.revenantLoot(10, 2, () => 0.5, 0).at(-1).stackCount, amount(plain), 'no mult: as it was');
  const e = { revenant: { id: r.id, rank: 2 }, items: [] };
  N.grantRevenantLoot(e, 10, () => 0.5, { goldMult: F.LAIR_GOLD });
  assert.equal(amount(e.items), amount(lair));
  N.grantRevenantLoot(e, 10, () => 0.5, { goldMult: F.LAIR_GOLD });
  assert.equal(e.items.length, lair.length, 'once');
  const ev = N.revenantWakeEvent(r);
  assert.equal(ev.kind, 'lair');
  assert.equal(ev.kicker, 'Its lair');
  assert.equal(ev.body, `You wake to ${r.given} standing over you.`);
  assert.equal(ev.line, ev.body);
});

