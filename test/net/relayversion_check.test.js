// The one relay-version rule: the client and the relay ship as one pair, so a session joins only the relay whose welcome
// names this client's own RELAY_VERSION (net/wire.js relayMatches). Any other version, or a welcome that names none, is
// refused for the life of the page: the session leaves every room, never retries or rejoins, and its status line tells
// the player to reload. Driven through the real OnlineSession on the shared fake socket.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OnlineSession } from '../../src/net/online.js';
import { RELAY_VERSION, relayMatches, CHAT_WORLD_ROOM } from '../../src/net/wire.js';
import { fakeSocketClass } from '../fakeSocket.mjs';

const pose = { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mv: 0 };
const quiet = (fn) => { const info = console.info, warn = console.warn; console.info = () => {}; console.warn = () => {}; try { return fn(); } finally { console.info = info; console.warn = warn; } };

/** A session in a world cell (or, `chat`, a chat link on the World channel), its socket open and waiting on the welcome. */
const session = ({ chat = false } = {}) => {
  const { FakeWS, sockets } = fakeSocketClass();
  const clock = { t: 1_000_000 };
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'Mac', id: 'mac-0001', secret: 'secret-of-mac-0001', WebSocketImpl: FakeWS, now: () => clock.t, ...(chat ? { presence: false } : {}) });
  s.join(chat ? CHAT_WORLD_ROOM : 'world:2,12', chat ? null : pose);
  sockets[0].open();
  return { s, sockets, clock };
};
/** The welcome as a raw frame, so the fake socket sends exactly what is written (no `v` stamped). */
const welcome = (v) => JSON.stringify({ t: 'welcome', id: 'mac-0001', peers: [], host: null, world: null, ...(v === undefined ? {} : { v }) });

/** Runs the session's clock far past every backoff and ticks it, as the page's frame loop does. */
const longAfter = (s, clock) => { for (let i = 0; i < 20; i++) { clock.t += 60_000; s.tick(); } };

test('relayMatches: this client\'s own RELAY_VERSION alone', () => {
  assert.equal(relayMatches(RELAY_VERSION), true);
  assert.equal(relayMatches('world1'), false, 'another version');
  assert.equal(relayMatches(undefined), false, 'no version');
  assert.equal(relayMatches(''), false);
  assert.equal(relayMatches(` ${RELAY_VERSION}`), false, 'a version is matched as written');
});

test('a welcome that names this client\'s RELAY_VERSION joins: the session is open and welcomed, and says nothing', () => quiet(() => {
  const { s, sockets } = session();
  sockets[0].receive(welcome(RELAY_VERSION));
  assert.equal(s.status, 'open');
  assert.equal(s.welcomed, true);
  assert.equal(s.terminal, false);
  assert.equal(s.versionRefused, false);
  assert.equal(s.statusLine(), null);
  assert.equal(sockets[0].closed, null, 'the socket stays');
}));

for (const [what, v] of [['another version', 'world1'], ['no version', undefined]]) {
  test(`a welcome with ${what} is refused: the room is left, the status line says to reload, and nothing reconnects`, () => quiet(() => {
    const { s, sockets, clock } = session();
    sockets[0].receive(welcome(v));
    assert.equal(s.welcomed, false, 'never welcomed');
    assert.equal(s.versionRefused, true);
    assert.equal(s.terminal, true);
    assert.equal(s.status, 'error');
    assert.match(s.statusLine(), /Reload the page/, 'the player is told to reload');
    assert.ok(sockets[0].closed, 'the socket is closed by the session');
    sockets[0].drop(1006);   // the relay's side of the close
    longAfter(s, clock);
    assert.equal(sockets.length, 1, 'no retry opens a socket');
    s.join('world:3,12', pose);
    assert.equal(s.rejoin('world:2,12', 0), false, 'no rejoin on any clock');
    longAfter(s, clock);
    assert.equal(sockets.length, 1, 'no join opens one either, until a reload');
    assert.match(s.statusLine(), /Reload the page/);
  }));
}

test('the chat link\'s own welcome is held to the same rule: another version refuses it, and it stays refused', () => quiet(() => {
  const { s, sockets, clock } = session({ chat: true });
  sockets[0].receive(welcome('world1'));
  assert.equal(s.versionRefused, true);
  assert.match(s.statusLine('chat'), /^chat: .*Reload the page/);
  sockets[0].drop(1006);
  longAfter(s, clock);
  assert.equal(s.rejoin(CHAT_WORLD_ROOM, 0), false);
  assert.equal(sockets.length, 1, 'the channel neither retries nor rejoins');
}));
