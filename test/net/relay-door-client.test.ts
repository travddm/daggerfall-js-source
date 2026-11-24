// The page's side of the relay's door (net/relay-door-client.ts), run against the real door (server/src/relay-door.ts)
// on a fake clock: a room of 200 back at the door's pace, each page shown its place, and a door that fails open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the wire's imports name DOM crypto types that tsconfig.node.json has no library for.
const CLIENT_PATH: string = '../../src/net/relay-door-client.ts';
const DOOR_PATH_TS: string = '../../server/src/relay-door.ts';
const { RelayDoorClient, doorUrl, DOOR_GIVE_UP_MS } = await import(CLIENT_PATH);
const { newDoor, doorAsk, doorResponse, DOOR_ROOM_RATE } = await import(DOOR_PATH_TS);

const CELL = 'world:25,9';

type Session = { url: string; room: string; _retryAt: number | null; _halo: Map<string, { ws: unknown; retryAt: number | null }> };
const sessionIn = (room = CELL): Session => ({ url: 'wss://relay.test', room, _retryAt: null, _halo: new Map() });

/** A fetch that answers from the real door, at the fake clock's time. */
function doorFetch(door: object, clock: { now: number }, counts: { asks: number }) {
  return async (url: string) => {
    counts.asks++;
    const q = new URL(url).searchParams;
    const res = doorResponse(doorAsk(door, q.get('room'), q.get('id'), clock.now));
    return { status: res.status, json: () => res.json() };
  };
}

/** Lets every pending ask settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('a room of 200 dropped together comes back at the door\'s pace: about 50 s, each told its place, asking a few times', async () => {
  const clock = { now: 1_000_000 };
  const door = newDoor();
  const counts = { asks: 0 };
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const fetchImpl = doorFetch(door, clock, counts);
  const pages = Array.from({ length: 200 }, () => ({
    session: sessionIn(),
    client: new RelayDoorClient({ now: () => clock.now, rand, paces: true, fetchImpl }),
    inAt: null as number | null,
    maxPlace: 0,
  }));
  const start = clock.now;
  // Each page drops and asks at once: the harshest case, with no wave spreading them first.
  for (const p of pages) {
    p.client.dropped();
    p.session._retryAt = clock.now;
  }
  let perSecond = new Map<number, number>();
  while (pages.some((p) => p.inAt === null) && clock.now - start < 180_000) {
    for (const p of pages) {
      if (p.inAt !== null || p.session._retryAt === null || clock.now < p.session._retryAt) continue;
      p.session._retryAt = null;
      if (p.client.holds(p.session)) continue;
      assert.ok(p.client.passFor(CELL), 'a page goes in with a pass');
      p.client.welcomed();
      p.inAt = clock.now;
      const second = Math.floor((clock.now - start) / 1000);
      perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
    }
    await settle();
    for (const p of pages) p.maxPlace = Math.max(p.maxPlace, p.client.position ?? 0);
    clock.now += 50;
  }
  const last = Math.max(...pages.map((p) => (p.inAt ?? Infinity) - start));
  assert.ok(last >= 45_000 && last <= 70_000, `the last page in at ${last} ms`);
  assert.ok(Math.max(...perSecond.values()) <= DOOR_ROOM_RATE * 2, `at most about the rate in any second: ${JSON.stringify([...perSecond])}`);
  assert.ok(pages.filter((p) => p.maxPlace > 0).length >= 190, 'nearly every page was shown a place');
  assert.ok(counts.asks / pages.length <= 12, `asks a page: ${counts.asks / pages.length}`);
  perSecond = new Map();
});

test('a door that does not answer with a place or a pass lets the page in, and the wave spreads it again', async () => {
  for (const answer of [
    async () => ({ status: 404, json: async () => ({ error: 'no such room' }) }),
    async () => ({ status: 503, json: async () => ({ error: 'unavailable' }) }),
    async () => {
      throw new Error('offline');
    },
  ]) {
    const clock = { now: 5_000 };
    const client = new RelayDoorClient({ now: () => clock.now, rand: () => 0.5, paces: true, fetchImpl: answer });
    const session = sessionIn();
    assert.equal(client.holds(session), true, 'the first open asks');
    await settle();
    assert.equal(session._retryAt, clock.now, 'answered: it opens at once');
    assert.equal(client.holds(session), false);
    assert.equal(client.passFor(CELL), null, 'and its hello carries no pass');
    assert.equal(client.waveHold({ holdUntil: () => 42 }, 1, CELL, clock.now), 42, 'with no door, the deploy wave spreads the next return');
  }
});

test('a session in its place changes rooms without asking; a drop asks again', async () => {
  const clock = { now: 5_000 };
  const counts = { asks: 0 };
  const client = new RelayDoorClient({ now: () => clock.now, rand: () => 0.5, paces: true, fetchImpl: doorFetch(newDoor(), clock, counts) });
  const session = sessionIn();
  assert.equal(client.holds(session), true);
  await settle();
  assert.equal(client.holds(session), false);
  client.welcomed();
  session.room = 'world:26,9';
  assert.equal(client.holds(session), false, 'a crossing into the next cell');
  assert.equal(counts.asks, 1);
  client.dropped();
  assert.equal(client.holds(session), true, 'the return after a drop');
  assert.equal(client.waveHold({ holdUntil: () => 42 }, 1, CELL, clock.now), null, 'the door, not the wave, spreads it');
});

test('a session that does not pace (a hub or region link) and a room the door does not pace never ask', () => {
  const fetchImpl = async () => assert.fail('asked');
  const link = new RelayDoorClient({ now: () => 0, rand: () => 0.5, paces: false, fetchImpl });
  assert.equal(link.holds(sessionIn()), false);
  const place = new RelayDoorClient({ now: () => 0, rand: () => 0.5, paces: true, fetchImpl });
  assert.equal(place.holds(sessionIn('social')), false);
});

test('a page waits at most DOOR_GIVE_UP_MS in all, then goes in without a pass', async () => {
  const clock = { now: 0 };
  const queue = async () => ({ status: 503, json: async () => ({ error: 'queue', position: 300, wait: 30_000 }) });
  const client = new RelayDoorClient({ now: () => clock.now, rand: () => 0.5, paces: true, fetchImpl: queue });
  const session = sessionIn();
  assert.equal(client.holds(session), true);
  await settle();
  assert.equal(client.position, 300);
  clock.now = DOOR_GIVE_UP_MS + 1;
  assert.equal(client.holds(session), false);
});

test('while the place waits at the door, its halos wait too', async () => {
  const clock = { now: 0 };
  const queue = async () => ({ status: 503, json: async () => ({ error: 'queue', position: 3, wait: 4_000 }) });
  const client = new RelayDoorClient({ now: () => clock.now, rand: () => 0.5, paces: true, fetchImpl: queue });
  const session = sessionIn();
  session._halo.set('world:26,9', { ws: null, retryAt: 100 });
  client.holds(session);
  await settle();
  assert.equal(session._retryAt, 4_000, 'the wait, jittered (rand 0.5 is the wait itself)');
  assert.equal(session._halo.get('world:26,9')?.retryAt, 4_000);
});

test('a busy close\'s named wait sets the retry, jittered; one without leaves it', () => {
  const clock = { now: 1_000 };
  const client = new RelayDoorClient({ now: () => clock.now, rand: () => 0, paces: true, fetchImpl: null });
  const session = sessionIn();
  session._retryAt = 99;
  client.afterBusy(session, { reason: 'busy' });
  assert.equal(session._retryAt, 99);
  client.afterBusy(session, { reason: 'busy, wait 6' });
  assert.equal(session._retryAt, 1_000 + 3_000, 'rand 0 is half the wait');
  assert.equal(client.haloRetryAt({ reason: 'busy, token unread, wait 2' }, 5), 1_000 + 1_000);
  assert.equal(client.haloRetryAt({ reason: 'going away' }, 5), 5);
});

test('the door\'s address follows the relay\'s', () => {
  assert.equal(doorUrl('wss://relay.example/', CELL, 'abcdefghijklmnop'), 'https://relay.example/door?room=world%3A25%2C9&id=abcdefghijklmnop');
  assert.equal(doorUrl('ws://127.0.0.1:8873', CELL, 'abcdefghijklmnop'), 'http://127.0.0.1:8873/door?room=world%3A25%2C9&id=abcdefghijklmnop');
  assert.equal(doorUrl('https://not-a-socket', CELL, 'abcdefghijklmnop'), null);
});

const ONLINE_PATH: string = '../../src/net/online.js';
const SOCKET_PATH: string = '../fakeSocket.mjs';
const WIRE_PATH: string = '../../src/net/wire.js';

test('a session waits at the door with no socket open, shows its place, then opens with the pass in its hello', async () => {
  const { OnlineSession } = await import(ONLINE_PATH);
  const { fakeSocketClass } = await import(SOCKET_PATH);
  const { CLOSE_BUSY } = await import(WIRE_PATH);
  const { FakeWS, sockets } = fakeSocketClass();
  let now = 1_000_000;
  const answers = [
    { status: 503, body: { error: 'queue', position: 12, wait: 3_000 } },
    { status: 200, body: { pass: 'pass-for-this-hello-1', until: 0 } },
  ];
  const fetchImpl = async () => {
    const next = answers.shift() ?? { status: 200, body: {} };
    return { status: next.status, json: async () => next.body };
  };
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'M', id: 'mac-0001', secret: 'secret-of-mac-0001', WebSocketImpl: FakeWS, now: () => now, rand: () => 0.5, door: true });
  s._door = new RelayDoorClient({ now: () => now, rand: () => 0.5, paces: true, fetchImpl });
  s.join(CELL, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0 });
  await settle();
  assert.equal(sockets.length, 0, 'no socket while the session waits');
  assert.match(s.statusLine(), /number 12 in line/);
  now = s._retryAt;
  s.tick();
  await settle();
  now = s._retryAt;
  s.tick();
  assert.equal(sockets.length, 1, 'the pass opens the socket');
  sockets[0].open();
  await settle();
  const hello = JSON.parse(sockets[0].sent.find((m: string) => m.includes('"t":"hello"')));
  assert.equal(hello.dp, 'pass-for-this-hello-1');
  // Welcomed, the session crosses cells without the door, and a busy close's named wait sets its next try.
  sockets[0].receive({ t: 'welcome', id: 'mac-0001', peers: [], host: null, world: null });
  assert.equal(s.statusLine(), null);
  sockets[0].drop(CLOSE_BUSY, 'busy, wait 6');
  assert.equal(s._retryAt, now + 6_000, 'rand 0.5: the wait itself');
});
