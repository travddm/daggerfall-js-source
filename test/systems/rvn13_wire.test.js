// RVN13 - ONLINE (;, then "Go"). The foe record carries a revenant's own: `ad` its adaptations (a mask), `wq` its
// weakness, `p2` its last stand's second phase, `rt` a band follower's master's `i` (for its name). Puppets stand with
// `ad` and `wq`, so a peer's roll against them sees what the owner's would; the owner applies none twice (a relayed blow
// is a final number). A peer's blow of its weakness on my revenant reveals it to me. Relay world164.
// Pinned: the mask and the index (held in step with the wire's bounds); the record's law; what an owner writes and a
// puppet stands with (a peer's roll through the real blow-taken door); a follower's band name; the reveal; the hosts.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); }, clear: () => _store.clear(), key: (i) => [..._store.keys()][i] ?? null, get length() { return _store.size; },
};

const F = await import('../../src/systems/revenant/revenantFeud.js');
const N = await import('../../src/systems/revenant/revenant.js');
const L = await import('../../src/systems/feudLedger.js');
const Wire = await import('../../src/net/wire.js');
const { blowTakenScale } = await import('../../src/systems/blowTaken.js');
const { setPref, _resetForTests } = await import('../../src/systems/uiPrefs.js');
const { MOBILE_TYPES: M } = await import('../../src/characters/mobile/mobileTypes.js');
const { createWeapon } = await import('../../src/combat/enemyEquipment.js');
const { WEAPONS: W } = await import('../../src/characters/weapons.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
beforeEach(() => { _resetForTests(); setPref('lootRarity', true); N._resetRevenantForTests(); _store.clear(); });

test('RVN13 THE MASK AND THE INDEX: a bit for each adaptation, read back in its order (at most its rank\'s three); a weakness by its index - held in step with the wire\'s bounds (mutants: a bit moved; the cap; an index off by one)', () => {
  assert.equal(F.adaptMask([]), 0);
  assert.equal(F.adaptMask(['mailed', 'arrowWise']), (1 << F.ADAPTATIONS.indexOf('mailed')) | (1 << F.ADAPTATIONS.indexOf('arrowWise')));
  assert.equal(F.adaptMask(['nope']), 0);
  assert.deepEqual(F.maskAdapt(F.adaptMask(['nightStalker', 'mailed'])), ['mailed', 'nightStalker'], 'in ADAPTATIONS\' order');
  assert.deepEqual(F.maskAdapt(0xffff).length, F.ADAPT_MAX, 'never past its rank\'s most');
  for (const w of F.WEAKNESSES) assert.equal(F.weakAt(F.weakIndex(w)), w);
  assert.deepEqual([F.weakIndex('nope'), F.weakAt(-1), F.weakAt(F.WEAKNESSES.length)], [-1, null, null]);
  assert.equal(Wire.FOE_ADAPT_MASK_MAX, 2 ** F.ADAPTATIONS.length - 1);
  assert.equal(Wire.FOE_ADAPT_MAX, F.ADAPT_MAX);
  assert.equal(Wire.FOE_WEAK_MAX, F.WEAKNESSES.length - 1);
  assert.equal(Wire.RELAY_VERSION, 'world283');
});

test('RVN13 THE RECORD\'S LAW: `ad` a mask of one to three, `wq` an index, `p2` 1, `rt` a foe\'s number - each refused whole outside its law; none when none (mutants: each bound dropped)', () => {
  const v = (extra) => Wire.validFoeRecord({ i: 4, ...extra });
  assert.deepEqual(v({ ad: 5, wq: 13, p2: 1, rt: 9 }), { i: 4, ad: 5, wq: 13, p2: 1, rt: 9 });
  assert.deepEqual(v({}), { i: 4 });
  for (const bad of [{ ad: 0 }, { ad: 0x10000 }, { ad: 0b1111 }, { ad: 1.5 }, { ad: '5' }, { wq: -1 }, { wq: 14 }, { wq: 2.5 }, { p2: 0 }, { p2: 2 }, { rt: -1 }, { rt: Wire.FOE_SEQ_MAX + 1 }, { rt: 'x' }]) {
    assert.equal(v(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(v({ ad: 0b111 }), { i: 4, ad: 7 }, 'three set: its most');
});

test('RVN13 WHAT AN OWNER WRITES, WHAT A PUPPET STANDS WITH: its adaptations, weakness and phase two out of its stamp, back onto the puppet with their edge - and a peer\'s blow on the puppet weighs as the owner\'s would (mutants: the mask unwritten; the weakness unread; the edge unbuilt; phase two dropped)', () => {
  const stamp = { id: 'r1', name: 'Grushnak the Butcher', rank: 3, learned: ['mailed'], weak: 'silver', p2: F.phaseTwo() };
  const wire = F.feudWire(stamp);
  assert.deepEqual(wire, { ad: F.adaptMask(['mailed']), wq: F.weakIndex('silver'), p2: 1 });
  assert.deepEqual(F.feudWire({ id: 'r2', learned: [], weak: null }), {});
  assert.deepEqual(F.feudWire(null), {});
  const rev = F.feudFromWire({ id: null, name: 'Grushnak the Butcher', rank: 0 }, wire);
  assert.deepEqual([rev.name, rev.learned, rev.weak], ['Grushnak the Butcher', ['mailed'], 'silver']);
  assert.deepEqual(rev.edge, F.adaptEdge(['mailed'], 'silver'));
  assert.deepEqual(rev.p2, F.phaseTwo());
  assert.equal(F.feudFromWire(rev, { ad: wire.ad, wq: wire.wq }).p2, null, 'out of phase two: none');
  // the peer's roll, through the real door: a steel blade bites x0.7 on a Mailed puppet, silver x1.5 on its weakness
  const puppet = { mobileType: M.Orc, revenant: rev };
  const me = { isPlayer: true };
  assert.ok(Math.abs(blowTakenScale(me, puppet, createWeapon(W.Longsword, 1, () => 0.5), { kind: 'melee' }) - 0.7) < 1e-9);
  assert.equal(blowTakenScale(me, puppet, createWeapon(W.Longsword, 2, () => 0.5), { kind: 'melee' }), 1.5, 'its weakness, on the peer\'s roll');
  assert.equal(blowTakenScale(me, { mobileType: M.Orc }, createWeapon(W.Longsword, 1, () => 0.5), { kind: 'melee' }), 1, 'a plain puppet: nothing');
});

test('RVN13 A FOLLOWER\'S NAME: its master\'s given name and its kind\'s word - from the name its owner calls it (mutants: the given unread; the word unread)', () => {
  assert.equal(F.puppetBandName('Grushnak the Butcher', M.Orc), "Grushnak's Warband");
  assert.equal(F.puppetBandName('Varis, Bane of Ayla', M.Werewolf), "Varis' Pack");
  assert.equal(F.puppetBandName('Grushnak the Butcher', M.Lich), null, 'a solitary kind rides alone');
  assert.equal(F.puppetBandName(null, M.Orc), null);
});

test('RVN13 A PEER\'S BLOW OF ITS WEAKNESS: revealed to me as my own would be; nothing on a body that is no revenant (mutants: the reveal unwired)', () => {
  const p = { isPlayer: true, name: 'Ayla Stormwind', characterId: 'char-rvn13', level: 8, items: [] };
  const e = { mobileType: M.Orc, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Monster' };
  const r = N.revenantDeed(p, e, 'fled', { mobileType: M.Orc, rolls: () => 0 });
  r.weakKnown = 0;
  L.feudRevealWeak(e);
  assert.equal(N.revenantById(r.id).weakKnown, 2);
  assert.doesNotThrow(() => L.feudRevealWeak({ mobileType: M.Orc }));
  assert.doesNotThrow(() => L.feudRevealWeak(null));
});

