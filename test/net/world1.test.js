// WORLD1 (Mac, 2026-09-12: "So now that this is situated its now
// important that we bring the world in line for anyone online.
// Currently theres a lot disconnected like enemies, doors, etc. The
// world is the server and every player should inhabit that world while
// also being able to continue their progress ... True persistance").
// SLICE 1: THE ROOM'S MEMORY. A world room (a dungeon, today) keeps a
// snapshot of its world in the relay's own storage - the layout's foes
// and how they stand, the piles, the dropped loot, the actions and door
// locks - published by the room's HOST (the hello'd socket in the room
// longest, the relay's word in the welcome and in a host frame) and
// handed to a joiner in the welcome, so a dungeon one player cleared is
// cleared for the next and stays so through an empty room. THE ARM
// EXECUTES: the wire's world frame (after hello, an object, the one
// frame past MAX_FRAME_BYTES, capped at WORLD_FRAME_MAX) and the world
// rooms; the Room over fake sockets and a fake state (the host elected
// and re-elected on a leave with a host frame; the welcome carrying the
// host and the raw world; a host's world stored chunked with its meta,
// re-published smaller with no stale tail, served verbatim; a non-host's
// or a sooner-than-WORLD_MIN_MS frame ignored, a place with no memory
// keeping none; the sweeps - the empty hello, the drain - forgetting
// looks, secrets and the hello bucket and never the world); the session
// (the host in the welcome and the host frame, isHost, onHost, onWorld,
// sendWorld the host's alone and never past the cap, the host forgotten
// on leave); the dungeon host, the mode machine and the world host by
// source (the layout's foes alone and the quest owner's left standing,
// the leave hook before the teardown, the publish clock and the four
// farewells).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseClient, isWorldRoom, isChatRoom, WORLD_FRAME_MAX, WORLD_MIN_MS, WORLD_CHUNK, WORLD_PREFIX, MAX_FRAME_BYTES, PIXEL_UNITS } from '../../src/net/wire.js';
import * as relay from '../../server/src/relay.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { OnlineSession, WORLD_PUBLISH_MS } from '../../src/net/online.js';
import { RELAY_VERSION } from '../../src/net/wire.js';   // LOCALDEV1: the worker entry exports handlers alone

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('WORLD1: the wire - the world frame is the one frame past MAX_FRAME_BYTES (an object, from a hello\'d socket, capped at WORLD_FRAME_MAX), every other frame keeps its cap; a world room is a dungeon\'s today; one home at both ends', () => {
  assert.equal(WORLD_FRAME_MAX, 512 * 1024); assert.equal(WORLD_MIN_MS, 5000); assert.equal(WORLD_CHUNK, 96 * 1024);
  assert.ok(WORLD_CHUNK < 128 * 1024, 'under a Durable Object value\'s cap');
  assert.ok(WORLD_PUBLISH_MS > WORLD_MIN_MS, 'the client publishes slower than the relay would drop');
  for (const k of ['isWorldRoom', 'WORLD_FRAME_MAX', 'WORLD_MIN_MS', 'WORLD_CHUNK', 'WORLD_PREFIX']) assert.equal(relay[k], { isWorldRoom, WORLD_FRAME_MAX, WORLD_MIN_MS, WORLD_CHUNK, WORLD_PREFIX }[k], `${k} at both ends`);
  assert.equal(JSON.stringify({ t: 'world', data: {} }).startsWith(WORLD_PREFIX), true, 'the prefix is what the client mints');
  assert.equal(isWorldRoom('dungeon:m187'), true); assert.equal(isWorldRoom('town:m9'), false); assert.equal(isWorldRoom('world:1,2'), false); assert.equal(isWorldRoom('interior:m9.4'), true, 'WORLD6a: a building is a world room too');
  assert.equal(isWorldRoom('chat:world'), false); assert.equal(isChatRoom('dungeon:m187'), false); assert.equal(isWorldRoom(null), false);
  const world = { locationKey: 'dungeon:1234', world: { foes: [{ health: 3, dead: false }], piles: [], actions: {} } };
  assert.deepEqual(parseClient(JSON.stringify({ t: 'world', data: world }), { hasHello: true }), { t: 'world', data: world, final: false });
  assert.deepEqual(parseClient(JSON.stringify({ t: 'world', data: world, final: true }), { hasHello: true }), { t: 'world', data: world, final: true }, 'the farewell\'s mark (AUDIT WORLD B5)');
  assert.equal(parseClient(JSON.stringify({ t: 'world', data: world, final: 1 }), { hasHello: true }).final, false, 'true alone');
  assert.deepEqual(parseClient(JSON.stringify({ t: 'world', data: world })), { error: 'world before hello' });
  assert.deepEqual(parseClient(JSON.stringify({ t: 'world' }), { hasHello: true }), { error: 'bad world' });
  assert.deepEqual(parseClient(JSON.stringify({ t: 'world', data: 'x' }), { hasHello: true }), { error: 'bad world' });
  assert.deepEqual(parseClient(JSON.stringify({ t: 'world', data: [1] }), { hasHello: true }), { error: 'bad world' });
  const big = { t: 'world', data: { pad: 'x'.repeat(MAX_FRAME_BYTES * 4) } };
  assert.equal(parseClient(JSON.stringify(big), { hasHello: true }).t, 'world', 'a world frame past MAX_FRAME_BYTES parses');
  assert.deepEqual(parseClient(JSON.stringify({ t: 'world', data: { pad: 'x'.repeat(WORLD_FRAME_MAX) } }), { hasHello: true }), { error: 'frame too large' }, 'and past WORLD_FRAME_MAX does not');
  assert.deepEqual(parseClient(JSON.stringify({ data: big.data, t: 'world' }), { hasHello: true }), { error: 'frame too large' }, 'a big frame without the prefix is refused before any parse');
  assert.deepEqual(parseClient('x'.repeat(MAX_FRAME_BYTES + 1), { hasHello: true }), { error: 'frame too large' }, 'and so is big junk');
  assert.deepEqual(parseClient(JSON.stringify({ t: 'chat', text: 'x'.repeat(MAX_FRAME_BYTES) }), { hasHello: true }), { error: 'frame too large' }, 'every other frame keeps MAX_FRAME_BYTES');
  assert.deepEqual(parseClient(JSON.stringify({ t: 'pose', p: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, pad: 'x'.repeat(MAX_FRAME_BYTES) } }), { hasHello: true }), { error: 'frame too large' });
});

const at = (px, pz) => ({ x: px * PIXEL_UNITS + 10, y: 0, z: pz * PIXEL_UNITS + 10, yaw: 0, pitch: 0, mv: 0 });
const ofType = (ws, t) => ws.sent.filter((m) => m.t === t);
const welcomeOf = (ws) => ofType(ws, 'welcome')[0];

test('WORLD1: the Room - the host is the hello\'d socket in the room longest, said in every welcome and in a host frame when it changes; the host\'s world is stored chunked with its meta and served raw in the next welcome, a smaller one leaves no stale tail; a non-host\'s frame, a sooner-than-WORLD_MIN_MS frame and a frame into a place that keeps no world are ignored, not refused; the sweeps forget looks, secrets and the hello bucket and never the world', async () => {
  const r = fakeRoom('dungeon:m187');
  const a = r.connect(), b = r.connect(), c = r.connect();
  await r.hello(a, 'aaaa-0001', at(1, 1));
  assert.equal(welcomeOf(a).host, 'aaaa-0001', 'alone: the host'); assert.equal(welcomeOf(a).world, null, 'a room with no memory yet');
  assert.equal(ofType(a, 'host').length, 0, 'the welcome said it: no host frame besides');
  await r.hello(b, 'bbbb-0002', at(1, 1));
  assert.equal(welcomeOf(b).host, 'aaaa-0001', 'the joiner is told the host'); assert.equal(ofType(a, 'host').length, 0, 'unchanged: nothing said');
  // the memory, from the host
  const foes = Array.from({ length: 40 }, (_, i) => ({ health: i, dead: i % 3 === 0, feet: [i, 0, i], yaw: 0, items: [], pad: 'p'.repeat(3000) }));
  const world = { locationKey: 'dungeon:1234', world: { foes, piles: [{ items: [] }], droppedLoot: [], actions: { 'act:1': { state: 'end' } } } };
  const raw = JSON.stringify(world);
  assert.ok(raw.length > WORLD_CHUNK && raw.length < 2 * WORLD_CHUNK, 'a world of two chunks');
  await r.world(b, world);
  assert.equal(r.store.has('world:meta'), false, 'a non-host\'s world is ignored');
  assert.equal(b.closed, null, 'and no offence');
  await r.world(a, world);
  const meta = r.store.get('world:meta');
  assert.equal(meta.chunks, 2); assert.equal(meta.size, raw.length); assert.equal(meta.by, 'aaaa-0001'); assert.equal(typeof meta.at, 'number');
  assert.equal(r.store.get('world:0') + r.store.get('world:1'), raw, 'stored as it came, in WORLD_CHUNK pieces');
  assert.equal(a.att.worldAt, undefined, 'the floor\'s stamp is the room\'s, in storage - not the socket\'s, which a reconnect reset (AUDIT WORLD A5)');
  const small = { locationKey: 'dungeon:1234', world: { foes: [], piles: [], droppedLoot: [], actions: {} } };
  await r.world(a, small);
  assert.equal(r.store.get('world:meta').chunks, 2, 'a second frame within WORLD_MIN_MS is dropped');
  r.store.get('world:meta').at -= WORLD_MIN_MS - 100;   // most of the floor gone
  await r.world(a, small);
  assert.equal(r.store.get('world:meta').chunks, 2, 'still inside WORLD_MIN_MS: dropped - the floor is the constant, not less (AUDIT WORLD D9)');
  r.store.get('world:meta').at -= 101; r.wake();   // the clock moves past it (the stamp is the room's: it survives a wake)
  await r.world(a, small);
  assert.equal(r.store.get('world:meta').chunks, 1, 'the smaller world took'); assert.equal(r.store.has('world:1'), false, 'and left no stale tail');
  assert.equal(r.store.get('world:0'), JSON.stringify(small));
  r.store.get('world:meta').at -= WORLD_MIN_MS + 1;
  await r.world(a, world);
  // served raw in the next welcome
  await r.hello(c, 'cccc-0003', at(1, 1));
  assert.deepEqual(welcomeOf(c).world, world, 'the joiner is handed the room\'s memory as the host sent it');
  assert.equal(welcomeOf(c).host, 'aaaa-0001'); assert.equal(ofType(a, 'host').length + ofType(b, 'host').length, 0, 'a hello into a led room (across a wake) says no host frame');
  assert.deepEqual(welcomeOf(c).peers.map((p) => p.id).sort(), ['aaaa-0001', 'bbbb-0002'], 'and the roster still');
  // AUDIT WORLD D4: the joiner that LEADS (a stamp before everyone's - the same-millisecond tie the smaller id wins)
  // is said to the rest and not to itself, and its leave hands the seat back
  // ACC1g: the token is minted BEFORE the stamps are bumped. A hello
  // mints one now, and minting is real Ed25519 - a few milliseconds
  // between the bump and the hello, which is enough to undo a +10ms
  // tie that this pin is entirely about.
  const tieTok = await r.token('0000-tie0');
  // ACC1g: AN EXACT TIE, not a ten-millisecond head start. The old
  // fixture bumped the other three by +10ms and relied on this test
  // reaching the hello inside that window; a hello mints a real
  // Ed25519 token now, so it does not, and the pin was measuring the
  // wall clock instead of the tie-break. The clock is FROZEN for this
  // block and the three stamps are set to the same instant, which is
  // exactly what the line above says the case is - "the
  // same-millisecond tie the smaller id wins".
  const realNow = Date.now; const froze = realNow();
  try {
    Date.now = () => froze;
    const tie = r.connect(); a.att.since = froze; b.att.since = froze; c.att.since = froze; r.wake();
    await r.hello(tie, '0000-tie0', at(1, 1), { tok: tieTok });
    assert.equal(welcomeOf(tie).host, '0000-tie0', 'the joiner leads');
    for (const ws of [a, b, c]) assert.deepEqual(ofType(ws, 'host').at(-1), { t: 'host', id: '0000-tie0' }, 'said to the rest');
    assert.equal(ofType(tie, 'host').length, 0, 'not to itself: its welcome said it');
    await r.drop(tie);
    for (const ws of [a, b, c]) assert.deepEqual(ofType(ws, 'host').at(-1), { t: 'host', id: 'aaaa-0001' }, 'the seat handed back');
  } finally { Date.now = realNow; }
  // the host leaves: the next-longest, said to everyone
  await r.drop(a);
  assert.deepEqual(ofType(b, 'host').at(-1), { t: 'host', id: 'bbbb-0002' }, 'b has been here longest now');
  assert.deepEqual(ofType(c, 'host').at(-1), { t: 'host', id: 'bbbb-0002' });
  await r.world(b, small);   // AUDIT WORLD34 D2: the floor is the AUTHOR's - a new host's first memory is not held behind the old host's stamp
  assert.equal(r.store.get('world:meta').by, 'bbbb-0002', 'the new host publishes');
  // the drain: looks, secrets and the bucket go; the world stays
  await r.drop(b); await r.drop(c);
  assert.equal(r.store.has('secret:bbbb-0002'), false); assert.equal(r.store.has('look:cccc-0003'), false); assert.equal(r.store.has('hellos'), false);   // SCALE2b: never stored now
  assert.equal(r.store.get('world:meta').by, 'bbbb-0002', 'the room\'s memory outlives an empty room');
  assert.equal(r.store.get('world:0'), JSON.stringify(small));
  // the empty hello: the same sweep, the same memory, the joiner handed it
  const d = r.connect(); await r.hello(d, 'dddd-0004', at(1, 1));
  assert.deepEqual(welcomeOf(d).world, small, 'a joiner into an empty room gets what the last host left');
  assert.equal(welcomeOf(d).host, 'dddd-0004');
  assert.ok(r.room._hellos, 'the bucket re-minted (SCALE2b: on the instance)');
  // a place that keeps no world
  const town = fakeRoom('town:m9');
  const t = town.connect(); await town.hello(t, 'town-0001', at(1, 1));
  assert.equal(welcomeOf(t).host, 'town-0001', 'a host in every place'); assert.equal(welcomeOf(t).world, null);
  await town.world(t, small);
  assert.equal(town.store.has('world:meta'), false, 'a town keeps no memory yet'); assert.equal(t.closed, null);
  // a channel: no host frame business, no world
  const chat = fakeRoom('chat:world');
  const ch = chat.connect(); await chat.hello(ch, 'chat-0001');
  assert.deepEqual(welcomeOf(ch), { t: 'welcome', id: 'chat-0001', peers: [], n: 1, v: RELAY_VERSION, now: welcomeOf(ch).now, ldo: 0 }, 'a channel\'s welcome: SRV-N\'s deploy name and ROSTER-G\'s roster and count - still no host, still no world (AUDIT SOC B7: the clock, since the hub link reads last-seen on it)');
});

function fakeSocketClass() {
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.closed = null; sockets.push(this); }
    send(s) { this.sent.push(JSON.parse(s)); }
    close(code, reason) { this.closed = { code, reason }; }
    open() { this.onopen?.(); }
    receive(o) { this.onmessage?.({ data: typeof o === 'string' ? o : JSON.stringify(o) }); }
  }
  return { FakeWS, sockets };
}

test('WORLD1: the session - the host from the welcome and the host frame, isHost, onHost on a change alone, onWorld when the welcome carries a memory; sendWorld the host\'s alone, an object alone, never a frame past WORLD_FRAME_MAX; the host forgotten on leave', () => {
  const { FakeWS, sockets } = fakeSocketClass();
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'Mac', id: 'mac-0001', secret: 'secret-of-mac-0001', WebSocketImpl: FakeWS, now: () => 1000 });
  const hosts = [], worlds = [];
  s.onHost = (id, mine) => hosts.push([id, mine]); s.onWorld = (w) => worlds.push(w);
  s.join('dungeon:m187', { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mv: 0 });
  const ws = sockets[0]; ws.open();
  assert.equal(s.host, null); assert.equal(s.isHost(), false, 'unknown until the welcome');
  assert.equal(s.sendWorld({ a: 1 }), false, 'not the host: nothing goes');
  ws.receive({ t: 'welcome', id: 'mac-0001', peers: [], host: 'bob-0002', world: null });
  assert.equal(s.host, 'bob-0002'); assert.equal(s.isHost(), false); assert.deepEqual(hosts, [['bob-0002', false]]); assert.deepEqual(worlds, [], 'no memory: onWorld silent');
  ws.receive({ t: 'host', id: 'bob-0002' });
  assert.deepEqual(hosts, [['bob-0002', false]], 'the same host again: nothing said');
  ws.receive({ t: 'host', id: 'mac-0001' });
  assert.equal(s.isHost(), true); assert.deepEqual(hosts.at(-1), ['mac-0001', true], 'mine now');
  const shared = { locationKey: 'dungeon:1234', world: { foes: [] } };
  assert.equal(s.sendWorld(shared), true);
  assert.deepEqual(ws.sent.at(-1), { t: 'world', data: shared }); assert.equal(s.stats.worlds, 1);
  assert.equal(s.sendWorld(null), false); assert.equal(s.sendWorld([1]), false); assert.equal(s.sendWorld('x'), false);
  assert.equal(s.sendWorld({ pad: 'x'.repeat(WORLD_FRAME_MAX) }), false, 'past the cap: kept home, never a terminal close');
  assert.equal(ws.sent.filter((m) => m.t === 'world').length, 1);
  ws.receive({ t: 'welcome', id: 'mac-0001', peers: [], host: 'mac-0001', world: shared });
  assert.deepEqual(worlds, [shared], 'a welcome with a memory: onWorld');
  ws.receive({ t: 'welcome', id: 'mac-0001', peers: [], host: 'mac-0001', world: [1] });
  assert.deepEqual(worlds, [shared], 'not an object: not a memory');
  s.leave();
  assert.equal(s.host, null); assert.equal(s.isHost(), false, 'forgotten with the room');
});

