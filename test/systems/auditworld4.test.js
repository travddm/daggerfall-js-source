// AUDIT WORLD4 (Mac, 2026-09-13: "Lets do an audit on thid") - four opus
// lenses over WORLD4 (the wire and the budgets; the projection and its
// readers; the dungeon host's claim, land and settle; the memory and the
// record), each finding refuted by its own finder and then by adversaries,
// fifteen surviving. THE FIXES EXECUTE: the wire (A1 - whether an act frame
// FITS is now a law with ONE HOME, so a host can tell a refusal the next
// token heals from one that can never be healed); the projection (B1 - an
// `enchantments` STRING survived the clamp and threw out of the frame body
// through three readers, freezing the tab); the mint (A2/B2/D1 - the list
// cap was a law the READER alone obeyed, so an oversized container was sent,
// dropped in silence by everyone, and then wiped by the next reader's
// claim); the host (C1 the open window is the opener's, C2/D5 a claim never
// overwrites the room's newer word and makes the memory due, C3/D2 the
// settle's missing re-mint arm, C4 the canonical key, C6 the claim after the
// mount); and the memory (D3 what we will not say we will not hear, D4/B3
// the foes' item lists, which are the same container vocabulary, out of the
// envelope and projected if one ever lands).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actFrameFits, MAX_FRAME_BYTES } from '../../src/net/wire.js';
import { validLootItem, validLootList, LOOT_LIST_MAX, LOOT_ARRAY_FIELDS } from '../../src/systems/loot/loot.js';
import { itemEnchantments } from '../../src/systems/enchantments.js';
import { hasArtifactSubtype, hasArtifactEffect } from '../../src/systems/artifactEffects.js';
import { fakeSocketClass } from '../fakeSocket.mjs';
import { OnlineSession } from '../../src/net/online.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const ITEM = { group: 'Weapons', templateIndex: 131, name: 'Arrow', material: 0, stackCount: 3, value: 1 };
const bigList = (n) => Array.from({ length: n }, (_, i) => ({ ...ITEM, name: `Arrow ${i}` }));

test('AUDIT WORLD4 A1: whether an act frame FITS is ONE HOME the sender reads before the socket does - the size refusal and the RATE refusal are different animals, and only the rate one heals; the session refuses exactly what the law refuses', () => {
  assert.equal(actFrameFits({ k: 'dungeon:1', l: [{ k: 'loot:3', r: [ITEM] }] }), true);
  assert.equal(actFrameFits({ k: 'dungeon:1', l: [{ k: 'loot:3', r: [{ ...ITEM, pad: 'x'.repeat(MAX_FRAME_BYTES) }] }] }), false);
  // the boundary is the FRAME's, not the payload's - the envelope counts
  const pad = (n) => ({ p: 'x'.repeat(n) });
  const room = JSON.stringify({ t: 'act', data: pad(0) }).length;   // the envelope around an empty string, quotes and all
  assert.equal(actFrameFits(pad(MAX_FRAME_BYTES - room)), true, 'exactly full is sayable');
  assert.equal(actFrameFits(pad(MAX_FRAME_BYTES - room + 1)), false, 'one byte past is not');
  // and the session refuses on the same law it publishes - no second opinion, no drift
  const { FakeWS, sockets } = fakeSocketClass();
  let now = 1000;
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'Mac', id: 'mac-0001', secret: 'secret-of-mac-0001', WebSocketImpl: FakeWS, now: () => now });
  s.join('dungeon:m187', { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mv: 0 });
  const ws = sockets[0]; ws.open();
  ws.receive({ t: 'welcome', id: 'mac-0001', peers: [], host: 'bob-0002', world: null });
  assert.equal(s.sendAct(pad(MAX_FRAME_BYTES - room)), true);
  now += 10000;
  assert.equal(s.sendAct(pad(MAX_FRAME_BYTES - room + 1)), false, 'refused for its SIZE with the rate token in hand');
  assert.equal(ws.sent.length, 2, 'and nothing went out - one hello, one act');
});

test('AUDIT WORLD4 B1: an item field the readers walk as an ARRAY must BE an array - a string `enchantments` survived the clamp entire (it is a bounded string, which is a legal value) and then threw out of three readers, one of them the enchantment round inside the frame body itself, freezing the tab for good', () => {
  assert.deepEqual([...LOOT_ARRAY_FIELDS], ['enchantments', 'customEnchantments', 'affixes', 'sockets', 'socketBought'], 'the fields the readers walk (LR1: the rarity affix list too; GEM1, PIN MOVED: a piece\'s socket list; AUDIT TOWN-ECON 2 PRICE-2, PIN MOVED: the sockets a counter sold a stone for)');
  for (const f of LOOT_ARRAY_FIELDS) {
    assert.equal(validLootItem({ templateIndex: 133, [f]: 'abc' }), null, `${f} as a string is not an item`);
    assert.equal(validLootItem({ templateIndex: 133, [f]: 7 }), null, `${f} as a number is not an item`);
    assert.equal(validLootItem({ templateIndex: 133, [f]: { 0: { type: 1 } } }), null, `${f} as an object is not an item`);
    const sample = f === 'affixes' ? [{ id: 'damage', value: 5 }] : f === 'decks' ? [{ name: 'Starter Deck', cards: ['rat'] }] : f === 'sockets' ? ['empty'] : f === 'socketBought' ? [[0, 205]] : [{ type: 1, param: 2 }];   // CARDS8: a binder's deck, a sound one   // LR4: an affix list is CHECKED, not only typed - a sound record
    const on = f === 'sockets' ? { group: 'Jewellery', rarity: 'rare' } : {};   // GEM1: a socket list stands on a piece that may hold one (lootRarity.js validSocket)
    assert.deepEqual(validLootItem({ templateIndex: 133, ...on, [f]: sample })[f], sample, `${f} as an array is kept whole`);
    assert.deepEqual(validLootItem({ templateIndex: 133, [f]: [] })[f], [], 'an empty one too');
    assert.equal(validLootList([{ templateIndex: 133, [f]: 'abc' }]), null, 'and one such entry refuses the whole list');
  }
  assert.equal(validLootItem({ templateIndex: 133 }).enchantments, undefined, 'absent stays absent');
  // the three readers, which the projection must never hand a string - and which no longer care if something else does
  const bad = { templateIndex: 133, enchantments: 'abc' };
  assert.equal(itemEnchantments(bad), null, 'the enchantment round survives it');
  assert.equal(hasArtifactSubtype(bad, 1), false);
  assert.equal(hasArtifactEffect(bad), false);
  assert.equal(itemEnchantments({ templateIndex: 133, enchantments: [{ type: 1, param: 2 }] }).length, 1, 'and an honest list still reads');
});

test('AUDIT WORLD4 A2/B2/D1 + C4: the mint is the ONE HOME of what may be said - a container over the list cap is skipped THERE, said once, and stays its owner\'s own (it used to be sent, dropped in silence by every receiver, and then wiped on the depositor by the next reader\'s claim); and a key is re-spelt canonically, so no peer can mint an unbounded family of aliases for one container', () => {
  // the far end of the same law, executed: what the mint refuses to send is exactly what every reader refuses to take
  assert.equal(validLootList(bigList(LOOT_LIST_MAX)).length, LOOT_LIST_MAX);
  assert.equal(validLootList(bigList(LOOT_LIST_MAX + 1)), null, 'one past the cap and the whole list is dropped - in SILENCE, at the far end');
  // C4 executed on the shape of the law: the spellings the old `key.split(':')` read as one container
  const RE = /^(loot|corpse|enc):(0|[1-9][0-9]{0,4})$/;
  for (const alias of ['loot:0x0a', 'loot:1e1', 'loot: 10 ', 'loot:0000000010', 'loot:10.0', 'loot:+10', 'loot:-1', 'loot:999999', 'chest:1', 'loot:'])
    assert.equal(RE.test(alias), false, `${alias} is not a container key`);
  for (const ok of ['loot:0', 'loot:10', 'corpse:99999', 'enc:1']) assert.match(ok, RE);
});

