// REVENANTS STANDALONE: the mod runs on Daggerfall alone and its choices are the row's (decision #72). Any regular foe
// rises, the Renown wait is the player's, the trophy needs no Loot rarity, a spared one may leave for good, and the rank,
// flight and return tunables follow the player's pick.

import '../../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_PROFILE } from '../../../src/net/profile/officialProfile.ts';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => {
    _store.set(k, String(v));
  },
  removeItem: (k) => {
    _store.delete(k);
  },
  clear: () => _store.clear(),
  key: (i) => [..._store.keys()][i] ?? null,
  get length() {
    return _store.size;
  },
};
const N = await import('../../../src/systems/revenant/revenant.js');
const O = await import('../../../src/systems/revenant/revenantsOn.js');
const T = await import('../../../src/systems/revenant/revenantTrophy.js');
const F = await import('../../../src/systems/revenant/revenantFate.js');
const RC = await import('../../../src/systems/revenant/revenantCompanions.js');
const S = await import('../../../src/systems/companionSlots.js');
const { setPref, _resetForTests } = await import('../../../src/systems/uiPrefs.js');
const { FEATURE_PREF_DEFAULTS, FEATURE_PREF_ONLINE } = await import('../../../src/systems/features.js');
const { setSigilOnline, setSigilRenown, _resetSigilForTests } = await import('../../../src/systems/sigil/sigil.js');

const me = () => ({
  isPlayer: true,
  name: 'Ayla Stormwind',
  characterId: 'char-standalone',
  level: 10,
  items: [],
  activeEffects: [],
  health: 100,
  maxHealth: 100,
});
const plainFoe = (extra = {}) => ({ mobileType: 2, level: 6, health: 5, maxHealth: 50, team: 'Monster', ...extra });

beforeEach(() => {
  _resetForTests();
  setPref('lootRarity', false);
  setPref('revenants', true);
  setPref('revenantRenown', 'none'); // the mod runs with Loot rarity off, as a Daggerfall-only game has it
  N._resetRevenantForTests();
  RC._resetRetinueForTests();
  S._resetCompanionSlotsForTests();
  _resetSigilForTests();
  _store.clear();
  S.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
});

test('the choices read as the row defaults, and a pref holding anything else reads as the default', () => {
  assert.deepEqual(
    [
      O.revenantAnyFoe(),
      O.revenantRenownMin(),
      O.revenantSpareJoins(),
      O.revenantLevelsPerRank(),
      O.revenantFleeFactor(),
      O.revenantReturnWindow(),
    ],
    [true, 0, true, 2, 1, [1440, 4320]],
  );
  setPref('revenantRenown', 'lots');
  setPref('revenantFlee', 7);
  assert.equal(O.revenantRenownMin(), 0);
  assert.equal(O.revenantFleeFactor(), 1);
});

test('the row declares every choice: a default each, and online every one but the Renown wait is pinned in the profile', () => {
  const keys = ['revenantWho', 'revenantRenown', 'revenantSpare', 'revenantRank', 'revenantFlee', 'revenantReturn'];
  assert.deepEqual(
    keys.map((k) => FEATURE_PREF_DEFAULTS[k]),
    ['any', 'none', 'join', '2', 'normal', 'normal'],
  );
  assert.deepEqual(
    keys.map((k) => FEATURE_PREF_ONLINE[k]),
    ['room', 'player', 'room', 'room', 'room', 'room'],
  );
  for (const k of keys.filter((x) => x !== 'revenantRenown'))
    assert.equal(OFFICIAL_PROFILE.pins.prefs[k], FEATURE_PREF_DEFAULTS[k], `${k}: the profile pins the default`);
  assert.ok(!Object.hasOwn(OFFICIAL_PROFILE.pins.prefs, 'revenantRenown'), 'the Renown wait stays with the player');
});

test('with Loot rarity off a plain foe becomes a revenant; "elites and champions" keeps the old rule; a boss never does', () => {
  assert.equal(N.revenantOn(), true, 'the row alone switches the mod');
  assert.ok(N.revenantDeed(me(), plainFoe(), 'fled', { mobileType: 2, rolls: () => 0.5 }), 'a plain foe rises');
  setPref('revenantWho', 'elite');
  assert.equal(N.revenantCandidate(plainFoe()), false);
  assert.equal(N.revenantCandidate(plainFoe({ eliteFoe: true })), true);
  assert.equal(N.revenantCandidate(plainFoe({ champion: 'mighty' })), true);
  setPref('revenantWho', 'any');
  assert.equal(N.revenantCandidate(plainFoe({ staffBoss: { size: 2 } })), false);
  assert.equal(N.revenantCandidate(plainFoe({ bossTraits: ['warded'] })), false);
  setPref('revenants', false);
  assert.equal(N.revenantCandidate(plainFoe()), false, "the row off: Daggerfall's own foes");
});

test("the Renown wait is the player's: none by default, and online a revenant waits for the Renown they set", () => {
  setSigilOnline(true);
  setSigilRenown(4);
  assert.equal(N.revenantHeld(), false, 'no wait set: never held');
  setPref('revenantRenown', '10');
  assert.equal(N.revenantHeld(), true);
  assert.equal(N.revenantCandidate(plainFoe()), false, 'held: none rises');
  setSigilRenown(10);
  assert.equal(N.revenantHeld(), false);
});

test("flight follows the pick: the chance of a plain foe's 5% is halved, or doubled", () => {
  const foe = plainFoe();
  assert.equal(
    N.rollRevenantFlee(foe, () => 0.07),
    false,
  );
  setPref('revenantFlee', 'often');
  assert.equal(
    N.rollRevenantFlee(foe, () => 0.07),
    true,
  );
  setPref('revenantFlee', 'rare');
  assert.equal(
    N.rollRevenantFlee(foe, () => 0.04),
    false,
  );
  assert.equal(
    N.rollRevenantFlee(foe, () => 0.02),
    true,
  );
});

test('the return window follows the pick, from the minute of the deed', () => {
  const due = () => {
    N._resetRevenantForTests();
    _store.clear();
    return N.revenantDeed(me(), plainFoe(), 'fled', { mobileType: 2, now: 1000, rolls: () => 0.999 }).dueAt;
  };
  assert.equal(due(), 1000 + 1440 + Math.floor(0.999 * 2881));
  setPref('revenantReturn', 'soon');
  assert.equal(due(), 1000 + 1440);
  setPref('revenantReturn', 'late');
  assert.equal(due(), 1000 + 4320 + Math.floor(0.999 * 5761));
});

test("levels per rank scale a class foe's return", () => {
  const r = N.revenantDeed(me(), plainFoe({ mobileType: 128 }), 'fled', { mobileType: 128, rolls: () => 0.5 });
  r.rank = 3;
  const level = () => N.revenantSpawnOptions(r, 10).level;
  assert.equal(level(), 16);
  setPref('revenantRank', '3');
  assert.equal(level(), 19);
});

test("the trophy is the revenant's own weapon, and a rarity only with Loot rarity on", () => {
  const r = N.revenantDeed(me(), plainFoe(), 'fled', { mobileType: 2, rolls: () => 0.5 });
  const plain = T.revenantTrophy(r, { level: 8, rolls: () => 0.5 });
  assert.ok(plain && plain.name, 'a weapon, named for it');
  assert.equal(plain.rarity ?? null, null, 'no rarity with the row off');
  setPref('lootRarity', true);
  const rare = T.revenantTrophy(r, { level: 8, rolls: () => 0.5 });
  assert.ok(['magic', 'rare', 'legendary'].includes(rare.rarity), "with it on, the ladder's");
});

test('a spared revenant joins you, or leaves for good as the row says', () => {
  const sparedBy = (join) => {
    N._resetRevenantForTests();
    RC._resetRetinueForTests();
    _store.clear(); // the app's mirror outlives a reset
    setPref('revenantSpare', join);
    const p = me();
    const r = N.revenantDeed(p, plainFoe(), 'fled', { mobileType: 2, rolls: () => 0.5 });
    const f = { entity: { revenant: { id: r.id } }, archive: null };
    return { out: F.beginSpare(p, f, { now: 1, rolls: () => 0.5 }), r };
  };
  const joined = sparedBy('join');
  assert.equal(joined.r.sworn, true);
  assert.equal(N.swornRevenants().length, 1);
  const left = sparedBy('leave');
  assert.ok(left.out, 'the spare still plays its scene');
  assert.equal(left.r.sworn, false);
  assert.equal(left.r.fate, 'released', 'the page records it');
  assert.equal(N.swornRevenants().length, 0, 'nobody joins');
  assert.match(left.out.event.body ?? left.out.event.line ?? '', /leaves/);
});
