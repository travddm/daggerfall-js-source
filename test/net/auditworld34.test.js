// AUDIT WORLD34 (Mac, 2026-09-13: "enemies, doors, and everything else
// doesnt persist between connected players. They still see their own
// enemies and stuff") - five opus lenses over slices 3 and 4 together (the
// boot path and the room's lifecycle; the foes stream end to end; the acts,
// the loot and the memory; the relay as deployed; the shipped scope against
// what a player sees), plus the PR #125 audit beside them. THE ONE ROOT (A1):
// the wire's world-room law admitted eight digits of map id, and a real
// MapTableData.MapId is a 32-bit integer - Privateer's Hold is 187853213 -
// so every real dungeon failed the law at BOTH ends, was joined all the
// same, relayed poses and nothing else, and every player kept stepping
// their own foes with no word said; test/net/auditworld.test.js:"AUDIT WORLD34 A1:" had PINNED
// the nine-digit key as no world room, which is why four slices shipped
// green over a feature no real dungeon could reach. THE FIXES EXECUTE: the
// law on the port's own real ids and two real sessions through the real
// Room in Privateer's Hold's room (A1); the unsigned id (A2); a socket the
// room closes itself leaving like a peer's would (D1); the memory's floor
// per author (D2); the memory pushed to a socket whose welcome carried none
// (C1); sendWorld under the room's guard (D3); the empty full frame as the
// heartbeat (B3); the whole dungeon online (B2); and by source: the dead
// foe retyped (B1), the memory's records the shared half out and projected
// in (C2), the pending acts kept through a reconnect (C3), the room and the
// host said out loud (D5), the pane's copy (D5), the relay's version (D4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isWorldRoom, roomOf, WORLD_MIN_MS, PIXEL_UNITS, CLOSE_POLICY } from '../../src/net/wire.js';
import * as relay from '../../server/src/relay.js';
import { RELAY_VERSION } from '../../src/net/wire.js';   // LOCALDEV1: the worker entry exports handlers alone
import { roomKeyFor, OnlineSession } from '../../src/net/online.js';
import { MAIN_STORY_DUNGEON_IDS, isMainStoryDungeon } from '../../src/world/dungeon/dungeonTextures.js';
import { useSmallerDungeon, dungeonSizeFor, onlineDungeonSize, SMALLER_DUNGEONS_STATE } from '../../src/world/smallerDungeons.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { fakeSocketClass } from '../fakeSocket.mjs';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const rd = (p) => hostText(p);
const at = (px, pz) => ({ x: px * PIXEL_UNITS + 10, y: 0, z: pz * PIXEL_UNITS + 10, yaw: 0, pitch: 0, mv: 0 });
const ofType = (ws, t) => ws.sent.filter((m) => m.t === t);
const PRIVATEERS_HOLD = 187853213;
const quiet = (fn) => { const info = console.info, warn = console.warn; console.info = () => {}; console.warn = () => {}; try { return fn(); } finally { console.info = info; console.warn = warn; } };
const until = async (ready, label) => {
  const deadline = Date.now() + 5000;
  while (!ready()) {
    assert.ok(Date.now() < deadline, `${label}: timed out waiting for the real relay response`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

test('AUDIT WORLD34 A1 (THE ROOT): the world-room law admits a REAL map id - every one of the port\'s own fourteen main-story ids, Privateer\'s Hold first - at both ends of the wire, and still refuses everything that is not one', () => {
  assert.equal(isMainStoryDungeon(PRIVATEERS_HOLD), true, 'the port\'s own table knows Privateer\'s Hold by this number');
  assert.ok(String(PRIVATEERS_HOLD).length === 9, 'nine digits: the bound the law had was eight');
  for (const id of MAIN_STORY_DUNGEON_IDS) {
    const key = roomKeyFor({ host: 'world', mode: 'dungeon', mapId: id, regionIndex: 17, locationName: 'x' });
    assert.equal(key, `dungeon:m${id}`, `the key is the map id's (${id})`);
    assert.equal(isWorldRoom(key), true, `a world room at the client (${id})`);
    assert.equal(relay.isWorldRoom(key), true, `and at the relay (${id})`);
    assert.ok(roomOf(`/room/${key}`) === key, 'and a room the worker opens');
  }
  assert.equal(isWorldRoom('dungeon:m4294967295'), true, 'the unsigned 32-bit bound');
  for (const k of ['dungeon:m12345678901', 'dungeon:m-1', 'dungeon:17.Privateer_s_Hold', 'town:m187853213', 'interior:17.Privateer_s_Hold.4', 'interior:m187853213.123456789', 'world:3,12']) assert.equal(isWorldRoom(k), false, k);
  assert.equal(isWorldRoom('interior:m187853213.4'), true, 'WORLD6a: a building is a world room');
  assert.equal(relay.isWorldRoom, isWorldRoom, 'one home');
});

test('AUDIT WORLD34 A2: a map id with bit 31 set read NEGATIVE off the signed int32 and fell to the name slug - the unsigned value is the id, the same on every client; 0 alone is "no map row"', () => {
  const neg = -1291010263 | 0;   // Daggerfall's 1291010263 with the sign bit's reading
  assert.equal(roomKeyFor({ host: 'world', mode: 'dungeon', mapId: neg, regionIndex: 17, locationName: 'Somewhere Hall' }), `dungeon:m${neg >>> 0}`, 'unsigned');
  assert.equal(isWorldRoom(roomKeyFor({ host: 'world', mode: 'dungeon', mapId: neg, regionIndex: 17, locationName: 'x' })), true);
  assert.equal(roomKeyFor({ host: 'world', mode: 'dungeon', mapId: 0, regionIndex: 17, locationName: "Privateer's Hold" }), 'dungeon:17.Privateer_s_Hold', 'no map row: the slug still');
  assert.equal(roomKeyFor({ host: 'world', mode: 'dungeon', mapId: null, regionIndex: 17, locationName: "Privateer's Hold" }), 'dungeon:17.Privateer_s_Hold');
  assert.equal(roomKeyFor({ host: 'world', mode: 'interior', mapId: neg, buildingKey: 4021 }), `interior:m${neg >>> 0}.4021`, 'the interior and the town read the same id');
  assert.equal(roomKeyFor({ host: 'exterior', mode: 'exterior', mapId: neg, regionIndex: 17, locationName: 'Daggerfall' }), `town:m${neg >>> 0}`);
});

test('AUDIT WORLD34 A1 executed: two real sessions through the real Room in Privateer\'s Hold\'s room - the host\'s foes fan to the joiner, the joiner\'s act fans to the host, the memory is stored and handed on; the same two in the slug room the old law left them in relay poses and nothing else', async () => {
  const run = async (key) => {
    const r = fakeRoom(key);
    // ACC1g: the keypair made BEFORE the clock starts. A session's hello
    // now awaits a mint, and generating an Ed25519 key the first time is
    // slower than the few milliseconds this pin waits between steps -
    // so the cost is paid here rather than inside the window the pin is
    // measuring.
    await r.signer();
    const link = (id) => {
      const { FakeWS, sockets } = fakeSocketClass();
      // ACC1g: a REAL minter against the room's own key. The relay
      // refuses a hello it cannot verify, so this end-to-end pin now
      // runs through the door a player runs through - the session mints,
      // the room verifies, and only then does anything cross.
      const s = new OnlineSession({ url: 'wss://relay.test', name: id, id, secret: 'secret-of-' + id, WebSocketImpl: FakeWS, now: () => Date.now(), mintToken: () => r.token(id) });
      const seen = { foes: [], acts: [], worlds: [] };
      s.onFoes = (_, d) => seen.foes.push(d); s.onAct = (_, d) => seen.acts.push(d); s.onWorld = (w) => seen.worlds.push(w);
      quiet(() => s.join(key, at(1, 1)));
      const ws = sockets[0]; const server = r.connect();
      // the bridge: what the session writes goes to the Room over the server socket; what the Room writes goes to the session
      ws.send = (str) => r.raw(server, str); server.send = (str) => ws.receive(str);
      ws.open();
      return { s, ws, server, seen };
    };
    const a = link('aaaa-0001'); await until(() => a.s.host === 'aaaa-0001', 'first welcome');
    const b = link('bbbb-0002'); await until(() => b.s.host === 'aaaa-0001', 'second welcome');
    assert.equal(a.s.host, 'aaaa-0001', 'a hosts'); assert.equal(b.s.host, 'aaaa-0001', 'b is told');
    assert.deepEqual([...b.s.peers.keys()], ['aaaa-0001'], 'presence: b sees a');
    const foes = a.s.sendFoes({ n: 1, k: 'dungeon:1', f: [{ i: 0, h: 5 }] });
    if (foes) await until(() => b.seen.foes.length > 0, 'foe fan');
    const act = b.s.sendAct({ k: 'dungeon:1', a: [{ key: 'act:1:2', state: 'forward', t: 1 }] });
    if (act) await until(() => a.seen.acts.length > 0, 'action fan');
    const world = a.s.sendWorld({ locationKey: 'dungeon:1', stamp: 'a', world: { foes: [], actions: [] } });
    if (world) await until(() => r.store.has('world:meta'), 'world memory');
    return { foes, act, world, bFoes: b.seen.foes.length, aActs: a.seen.acts.length, stored: r.store.has('world:meta'), peers: b.s.peers.size };
  };
  const real = await run(`dungeon:m${PRIVATEERS_HOLD}`);
  assert.deepEqual(real, { foes: true, act: true, world: true, bFoes: 1, aActs: 1, stored: true, peers: 1 }, 'the world room the fix opens: everything crosses');
  const slug = await run('dungeon:17.Privateer_s_Hold');
  assert.deepEqual(slug, { foes: false, act: false, world: false, bFoes: 0, aActs: 0, stored: false, peers: 1 }, 'the room the old law left every dungeon in: presence and nothing else, and not a word (D3: sendWorld now refuses at home too)');
});

test('AUDIT WORLD34 D1: a socket the ROOM closes itself - a refusal, a failed send - leaves as a peer\'s close would: its leave said, the seat re-said, its look and secret gone; and said once if the runtime delivers a close for it after all', async () => {
  const r = fakeRoom(`dungeon:m${PRIVATEERS_HOLD}`);
  const a = r.connect(), b = r.connect(), c = r.connect();
  await r.hello(a, 'aaaa-0001', at(1, 1)); await r.hello(b, 'bbbb-0002', at(1, 1)); await r.hello(c, 'cccc-0003', at(1, 1));
  assert.equal(ofType(b, 'welcome')[0].host, 'aaaa-0001');
  // the host sends a frame the room refuses
  await r.raw(a, JSON.stringify({ t: 'pose', p: 'bad' }));
  assert.deepEqual(a.closed, { code: CLOSE_POLICY, reason: 'bad pose' }, 'refused and closed by the object');
  assert.deepEqual(ofType(b, 'leave'), [{ t: 'leave', id: 'aaaa-0001' }], 'b heard the leave'); assert.deepEqual(ofType(c, 'leave'), [{ t: 'leave', id: 'aaaa-0001' }]);
  assert.deepEqual(ofType(b, 'host').at(-1), { t: 'host', id: 'bbbb-0002' }, 'and the seat: b has been here longest now');
  assert.deepEqual(ofType(c, 'host').at(-1), { t: 'host', id: 'bbbb-0002' });
  assert.equal(r.store.has('look:aaaa-0001'), false); assert.equal(r.store.has('secret:aaaa-0001'), false, 'forgotten like any leaver');
  // a runtime that DOES deliver a close for it says nothing twice
  await r.room.webSocketClose(a, CLOSE_POLICY, 'bad pose');
  assert.equal(ofType(b, 'leave').length, 1, 'once'); assert.equal(ofType(b, 'host').length, 1);
  // a failed send closes and reaps the same way
  c.send = () => { throw new Error('gone'); };
  await r.pose(b, at(1, 1));
  assert.equal(c.closed?.code, 1011, 'the send failed: closed');
  assert.deepEqual(ofType(b, 'leave').at(-1), { t: 'leave', id: 'cccc-0003' }, 'and its leave said to the survivor');
  // the new host streams and the room fans it (nobody left to hear, but nothing is refused)
  assert.equal(b.closed, null);
});

test('AUDIT WORLD34 D2: the memory\'s floor is the AUTHOR\'s - a new host\'s first memory after a handover is not held behind the old host\'s stamp', async () => {
  const r = fakeRoom(`dungeon:m${PRIVATEERS_HOLD}`);
  const a = r.connect(), b = r.connect();
  await r.hello(a, 'aaaa-0001', at(1, 1)); await r.hello(b, 'bbbb-0002', at(1, 1));
  await r.world(a, { stamp: 'a' });
  assert.equal(r.store.get('world:meta').by, 'aaaa-0001');
  await r.world(a, { stamp: 'a2' });
  assert.equal(r.store.get('world:0'), JSON.stringify({ stamp: 'a' }), 'the same author inside WORLD_MIN_MS: dropped, as ever');
  await r.drop(a);
  assert.deepEqual(ofType(b, 'host').at(-1), { t: 'host', id: 'bbbb-0002' });
  await r.world(b, { stamp: 'b' });
  assert.equal(r.store.get('world:meta').by, 'bbbb-0002', 'the new host\'s first memory took at once');
  assert.equal(r.store.get('world:0'), JSON.stringify({ stamp: 'b' }));
  await r.world(b, { stamp: 'b2' });
  assert.equal(r.store.get('world:0'), JSON.stringify({ stamp: 'b' }), 'and its own floor holds from there');
  r.store.get('world:meta').at -= WORLD_MIN_MS + 1;
  await r.world(b, { stamp: 'b3' });
  assert.equal(r.store.get('world:0'), JSON.stringify({ stamp: 'b3' }));
});

test('AUDIT WORLD34 C1: the memory rode the welcome ALONE - a socket whose welcome carried none is handed the next one the host publishes, once, as {t:\'world\', id, data}; one whose welcome carried a memory is not; and the session takes it from the host alone', async () => {
  const r = fakeRoom(`dungeon:m${PRIVATEERS_HOLD}`);
  const a = r.connect(), b = r.connect();
  await r.hello(a, 'aaaa-0001', at(1, 1)); await r.hello(b, 'bbbb-0002', at(1, 1));   // together: the room is empty-handed for both
  assert.equal(ofType(a, 'welcome')[0].world, null); assert.equal(ofType(b, 'welcome')[0].world, null);
  const mem = { locationKey: 'dungeon:1', stamp: 'a', world: { foes: [{ health: 1 }] } };
  await r.world(a, mem);
  assert.deepEqual(ofType(b, 'world'), [{ t: 'world', id: 'aaaa-0001', data: mem }], 'b is handed what its welcome could not carry');
  assert.equal(ofType(a, 'world').length, 0, 'never the author');
  r.store.get('world:meta').at -= WORLD_MIN_MS + 1;
  await r.world(a, { ...mem, stamp: 'a2' });
  assert.equal(ofType(b, 'world').length, 1, 'once: the live stream and the acts carry the rest');
  const c = r.connect(); await r.hello(c, 'cccc-0003', at(1, 1));
  assert.equal(ofType(c, 'welcome')[0].world.stamp, 'a2', 'a later joiner\'s welcome carries it');
  r.store.get('world:meta').at -= WORLD_MIN_MS + 1;
  await r.world(a, { ...mem, stamp: 'a3' });
  assert.equal(ofType(c, 'world').length, 0, 'and is not handed it again');
  r.wake();   // the mark rides the attachment: a wake forgets nothing
  r.store.get('world:meta').at -= WORLD_MIN_MS + 1;
  await r.world(a, { ...mem, stamp: 'a4' });
  assert.equal(ofType(b, 'world').length, 1); assert.equal(ofType(c, 'world').length, 0);
  // the session's side
  const { FakeWS, sockets } = fakeSocketClass();
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'b', id: 'bbbb-0002', secret: 'secret-of-bbbb-0002', WebSocketImpl: FakeWS, now: () => 1000 });
  const worlds = []; s.onWorld = (w) => worlds.push(w);
  quiet(() => s.join(`dungeon:m${PRIVATEERS_HOLD}`, at(1, 1))); const ws = sockets[0]; ws.open();
  quiet(() => ws.receive({ t: 'welcome', id: 'bbbb-0002', peers: [], host: 'aaaa-0001', world: null }));
  ws.receive({ t: 'world', id: 'zzzz-0009', data: mem });
  assert.deepEqual(worlds, [], 'not the host\'s: not the world');
  ws.receive({ t: 'world', id: 'aaaa-0001', data: [1] });
  assert.deepEqual(worlds, [], 'not an object: not a memory');
  ws.receive({ t: 'world', id: 'aaaa-0001', data: mem });
  assert.deepEqual(worlds, [mem], 'the host\'s memory, after the welcome');
});

test('AUDIT WORLD34 D3: sendWorld is under the room\'s guard like every other out-frame - the host of a slug room, a town or a cell sends no memory and hears false', () => {
  const { FakeWS, sockets } = fakeSocketClass();
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'a', id: 'aaaa-0001', secret: 'secret-of-aaaa-0001', WebSocketImpl: FakeWS, now: () => 1000 });
  quiet(() => s.join('town:m187853213', at(1, 1))); const ws = sockets[0]; ws.open();
  quiet(() => ws.receive({ t: 'welcome', id: 'aaaa-0001', peers: [], host: 'aaaa-0001', world: null }));
  assert.equal(s.isHost(), true);
  assert.equal(s.sendWorld({ a: 1 }), false, 'a town keeps no memory: refused at home, not sent to be ignored');
  assert.equal(ws.sent.filter((t) => t.startsWith('{"t":"world"')).length, 0);
  assert.equal(s.stats.worlds, 0);
});

test('AUDIT WORLD34 B2: online, ONE layout - the layout the room addresses by index is one layout, whatever a client\'s Smaller Dungeons setting or a quest\'s frozen copy of it says (SD-ONLINE: the world\'s size for the dungeon, where it was the whole dungeon - PIN MOVED)', () => {
  const loc = { hasDungeon: true, mapTableData: { mapId: 12345 }, dungeon: { blocks: Array.from({ length: 12 }, (_, i) => ({ blockName: i ? `B${i}` : 'S0' })) } };
  assert.equal(useSmallerDungeon(loc, { setting: true }), true, 'offline: the setting');
  assert.equal(useSmallerDungeon(loc, { setting: true, online: true }), false, 'online: never');
  const machine = { getSiteLinks: () => [{ questUID: 1 }], getQuest: () => ({ smallerDungeonsState: SMALLER_DUNGEONS_STATE.Enabled }) };
  assert.equal(useSmallerDungeon(loc, { setting: false, questMachine: machine }), true, 'offline: the quest\'s frozen state wins');
  assert.equal(useSmallerDungeon(loc, { setting: false, questMachine: machine, online: true }), false, 'online: not even the quest\'s');
  assert.equal(dungeonSizeFor(loc, { setting: true, medium: false, questMachine: machine, online: true }), onlineDungeonSize(loc), 'SD-ONLINE: the world\'s one size for it - no setting and no quest\'s copy reaches it');
});

test('AUDIT WORLD34 D4/D5: the relay names itself in /health; the session says the room and whether it is a shared world, and the host; the Online pane\'s copy says what is shared', () => {
  assert.match(RELAY_VERSION, /^world\d+$/, 'bumped with every relay-changing slice - the latest slice pins its own value (WORLD5 pinned world5)');
  const lines = [];
  const info = console.info; console.info = (l) => lines.push(l);
  try {
    const { FakeWS, sockets } = fakeSocketClass();
    const s = new OnlineSession({ url: 'wss://relay.test', name: 'a', id: 'aaaa-0001', secret: 'secret-of-aaaa-0001', WebSocketImpl: FakeWS, now: () => 1000 });
    s.join(`dungeon:m${PRIVATEERS_HOLD}`, at(1, 1)); sockets[0].open();
    sockets[0].receive({ t: 'welcome', id: 'aaaa-0001', peers: [], host: 'bbbb-0002', world: null });
    s.leave(); s.join('world:3,12', at(1, 1)); sockets[1].open();
    sockets[1].receive({ t: 'welcome', id: 'aaaa-0001', peers: [], host: 'aaaa-0001', world: null });
  } finally { console.info = info; }
  assert.deepEqual(lines, [`[online] room dungeon:m${PRIVATEERS_HOLD} - a shared world`, '[online] host bbbb-0002', '[online] room world:3,12 - shared country (each player\'s foes are everyone\'s)'], 'a cell says its room and no host (WORLD6b: and what it shares)');
});

