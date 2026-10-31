// WORLD4 (Mac, 2026-09-13: "Lets start on slice 4") - SLICE 4: THE
// ROOM'S LOOT. A container nobody has opened is each client's OWN roll -
// the room knows nothing of it, and the room's memory carries nothing
// for it, which is what AUDIT WORLD's "loot's memory should carry
// 'emptied', not contents" asked for. The moment anyone OPENS one it
// becomes the ROOM's: its list is published on the open (so a second
// reader adopts the first's rather than their own roll) and again on the
// close (what is left after the taking), landed IN PLACE - except on a
// container you have open, which is yours until you close it (AUDIT
// WORLD4 C1 struck WORLD4's own "a window already open updates under the
// reader's hands"; test/systems/auditworld4.test.js). It rides WORLD3's act
// frame - the relay reads none of that frame's `data`, so slice 4 needed
// no relay change, no new frame and no budget of its own. THE ARM
// EXECUTES: the projection (a container's list off the wire, clamped);
// the wire and the Room over the one fake (an `l`-only frame fanned to
// everyone hello'd but its author, in a world room alone, on the act
// budgets); the session; the dungeon host and the memory by source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseClient, MAX_FRAME_BYTES, ACT_HZ_MAX, PIXEL_UNITS } from '../../src/net/wire.js';
import { validLootItem, validLootList, LOOT_LIST_MAX, LOOT_ITEM_KEYS_MAX, LOOT_STR_MAX, LOOT_DEPTH_MAX } from '../../src/systems/loot/loot.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { fakeSocketClass } from '../fakeSocket.mjs';
import { OnlineSession } from '../../src/net/online.js';
import { itemBaseValue } from '../../src/systems/item/itemTemplates.js';   // AUDIT WORLD6a B1: the projector floors an item's value at the template's own

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const at = (px, pz) => ({ x: px * PIXEL_UNITS + 10, y: 0, z: pz * PIXEL_UNITS + 10, yaw: 0, pitch: 0, mv: 0 });
const ofType = (ws, t) => ws.sent.filter((m) => m.t === t);
const ITEM = { group: 'Weapons', templateIndex: 131, name: 'Arrow', material: 0, stackCount: 3, value: 1 };

test('WORLD4: a container\'s list off the wire is projected and clamped - an EMPTY list is the commonest word a room says and is valid; an item needs a templateIndex a template could carry; the copy is a COPY, its strings bounded, its breadth and depth bounded, its non-finite numbers dropped; anything else is refused whole', () => {
  assert.deepEqual(validLootList([]), [], 'emptied - the word the room says most');
  assert.deepEqual(validLootList([ITEM]), [{ ...ITEM, value: Math.max(ITEM.value, itemBaseValue(ITEM)) }], 'an honest item survives entire - its value floored at the template\'s own (AUDIT WORLD6a B1)');
  const src = [ITEM];
  const out = validLootList(src);
  assert.notEqual(out[0], src[0], 'and survives as a COPY - no reference from the wire reaches the pack');
  assert.equal(validLootList(null), null); assert.equal(validLootList({}), null); assert.equal(validLootList('x'), null);
  assert.equal(validLootList([{ group: 'Weapons' }]), null, 'no templateIndex is not an item');
  assert.equal(validLootList([{ templateIndex: 1.5 }]), null); assert.equal(validLootList([{ templateIndex: -1 }]), null);
  assert.equal(validLootList([{ templateIndex: 70000 }]), null, 'nor one no template could carry');
  assert.equal(validLootList([ITEM, null]), null, 'one bad entry refuses the list');
  assert.equal(validLootList(new Array(LOOT_LIST_MAX + 1).fill({ templateIndex: 1 })), null, `at most ${LOOT_LIST_MAX} items`);
  assert.equal(validLootList(new Array(LOOT_LIST_MAX).fill({ templateIndex: 1 })).length, LOOT_LIST_MAX, 'and exactly that many is fine');
  // the clamp inside one item
  assert.equal(validLootItem({ templateIndex: 1, name: 'x'.repeat(LOOT_STR_MAX + 200) }).name.length, LOOT_STR_MAX, 'a string is bounded, not refused');
  assert.equal(validLootItem({ templateIndex: 1, value: NaN }).value, itemBaseValue({ templateIndex: 1 }), 'a non-finite value is the template\'s own (AUDIT WORLD6a B1: the price is never the wire\'s to lower)');
  assert.equal(validLootItem({ templateIndex: 1, value: Infinity }).value, itemBaseValue({ templateIndex: 1 }));
  assert.equal('f' in validLootItem({ templateIndex: 1, f: () => 1 }), false, 'a function is not an item field');
  const wide = { templateIndex: 1 }; for (let i = 0; i < LOOT_ITEM_KEYS_MAX + 2; i++) wide[`k${i}`] = 1;
  assert.equal(validLootItem(wide), null, `at most ${LOOT_ITEM_KEYS_MAX} fields`);
  // an enchantment list is depth 2 and must survive whole
  const magic = { templateIndex: 200, group: 'Weapons', enchantments: [{ type: 1, param: 2 }, { type: 3, param: 4 }] };
  assert.deepEqual(validLootItem(magic), { ...magic, value: itemBaseValue(magic) }, 'a magic item keeps its enchantments (and takes the template\'s value where it carried none)');
  const deep = validLootItem({ templateIndex: 1, a: { b: { c: { d: { e: 1 } } } } });
  assert.ok(deep && !JSON.stringify(deep).includes('"e"'), `nesting past ${LOOT_DEPTH_MAX} is dropped, the item kept`);
  assert.equal(validLootItem(JSON.parse('{"templateIndex":1,"__proto__":{"polluted":1}}')), null, 'and a prototype key is not a field');
  assert.equal(({}).polluted, undefined);
});

test('WORLD4: the wire and the Room - the loot rides WORLD3\'s act frame, so the relay needed NO change: a frame carrying only `l` parses, is fanned to everyone hello\'d but its author in a world room, spends the act buckets and no others, and a town relays none; the session sends and takes it', async () => {
  const loot = { k: 'dungeon:1', l: [{ k: 'loot:3', r: [ITEM] }] };
  assert.deepEqual(parseClient(JSON.stringify({ t: 'act', data: loot }), { hasHello: true }), { t: 'act', data: loot });
  assert.deepEqual(parseClient(JSON.stringify({ t: 'act', data: loot })), { error: 'act before hello' });
  // the Room, over the one fake: an l-only frame is an act like any other
  const r = fakeRoom('dungeon:m187');
  const h = r.connect(), j1 = r.connect(), j2 = r.connect();
  await r.hello(h, 'host-0001', at(1, 1)); await r.hello(j1, 'join-0002', at(1, 1)); await r.hello(j2, 'join-0003', at(1, 1));
  const pose0 = JSON.stringify(j1.meters.bucket ?? null);
  await r.raw(j1, JSON.stringify({ t: 'act', data: loot }));
  assert.deepEqual(ofType(h, 'act'), [{ t: 'act', id: 'join-0002', data: loot }], 'the host hears the joiner empty a chest');
  assert.deepEqual(ofType(j2, 'act'), [{ t: 'act', id: 'join-0002', data: loot }]);
  assert.equal(ofType(j1, 'act').length, 0, 'never its author');
  assert.equal(JSON.stringify(j1.meters.bucket ?? null), pose0, 'and it spends the ACT bucket, not the poses\'');
  assert.ok(j1.meters.abucket, 'which is the one it spends');
  assert.ok(r.room._roomActBytes, 'under the room\'s act byte budget (AUDIT WORLD3 A1), which already covers it');
  const town = fakeRoom('town:m9');
  const t1 = town.connect(), t2 = town.connect();
  await town.hello(t1, 'town-0001', at(1, 1)); await town.hello(t2, 'town-0002', at(1, 1));
  await town.raw(t1, JSON.stringify({ t: 'act', data: loot }));
  assert.equal(ofType(t2, 'act').length, 0, 'a town has no shared containers'); assert.equal(t1.closed, null);
  // the session: out and in, the same door WORLD3 opened
  const { FakeWS, sockets } = fakeSocketClass();
  let now = 1000;
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'Mac', id: 'mac-0001', secret: 'secret-of-mac-0001', WebSocketImpl: FakeWS, now: () => now });
  const got = []; s.onAct = (id, data) => got.push([id, data]);
  s.join('dungeon:m187', { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mv: 0 });
  const ws = sockets[0]; ws.open();
  ws.receive({ t: 'welcome', id: 'mac-0001', peers: [], host: 'bob-0002', world: null });
  assert.equal(s.sendAct(loot), true); assert.equal(ws.sent.at(-1), '{"t":"act","data":' + JSON.stringify(loot) + '}', 't first');
  assert.equal(s.sendAct({ k: 'dungeon:1', l: [{ k: 'loot:0', r: [{ ...ITEM, pad: 'x'.repeat(MAX_FRAME_BYTES) }] }] }), false, 'the small cap still stands');
  let passed = 1; for (let i = 0; i < ACT_HZ_MAX + 2; i++) if (s.sendAct(loot)) passed++;
  assert.equal(passed, ACT_HZ_MAX, 'and so does the gate at home');
  ws.receive({ t: 'act', id: 'bob-0002', data: loot });
  assert.deepEqual(got, [['bob-0002', loot]], 'another player\'s chest in');
  ws.receive({ t: 'act', id: 'mac-0001', data: loot });
  assert.equal(got.length, 1, 'never my own back');
});

