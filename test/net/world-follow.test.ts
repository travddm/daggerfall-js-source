// The client's side of a memory that follows its welcome: the session joins the pieces, takes the promised memory
// whoever hosts by then, and publishes no memory of its own while the stored one is on its way.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the session and the wire name the DOM's crypto types, which tsconfig.node.json does not have.
const ONLINE_PATH: string = '../../src/net/online.js';
const SOCKET_PATH: string = '../fakeSocket.mjs';
const PIECES_PATH: string = '../../src/net/bulk-pieces.ts';
const FOLLOW_PATH: string = '../../src/net/world-follow.ts';
const { OnlineSession } = await import(ONLINE_PATH);
const { fakeSocketClass } = await import(SOCKET_PATH);
const { BULK_PIECE_CHARS, cutPieces } = await import(PIECES_PATH);
const { WORLD_FOLLOW_WAIT_MS } = await import(FOLLOW_PATH);

const KEY = 'dungeon:m187853213';
const ME = 'join-0002';

function joined() {
  let clock = 1_000_000;
  const { FakeWS, sockets } = fakeSocketClass();
  const keep = { info: console.info, warn: console.warn };
  console.info = console.warn = () => {};
  const session = new OnlineSession({ url: 'wss://relay.test', name: ME, id: ME, WebSocketImpl: FakeWS, now: () => clock });
  const worlds: unknown[] = [];
  session.onWorld = (world: unknown) => worlds.push(world);
  session.join(KEY, { x: 1, y: 0, z: 1, yaw: 0, pitch: 0 });
  const ws = sockets[0];
  ws.open();
  const restore = () => Object.assign(console, keep);
  return { session, ws, worlds, restore, advance: (ms: number) => (clock += ms) };
}

const stored = { locationKey: KEY, stamp: 'big', world: { pad: 'm'.repeat(BULK_PIECE_CHARS * 3) } };
const followText = JSON.stringify({ t: 'world', wf: 1, id: 'host-0001', data: stored });

test('the promised memory arrives in pieces, is joined, and is taken after the host changed to me', () => {
  const { session, ws, worlds, restore } = joined();
  try {
    ws.receive({ t: 'welcome', id: ME, peers: [], host: 'host-0001', world: null, wf: 1, now: Date.now() });
    ws.receive({ t: 'host', id: ME });
    assert.equal(session.isHost(), true);
    assert.equal(session.sendWorld({ mine: 1 }), false, 'no memory of my own while the stored one is on its way');
    for (const piece of cutPieces(followText, 0)) ws.receive(piece);
    assert.deepEqual(worlds, [stored], 'taken although host-0001 no longer hosts');
    assert.equal(session.sendWorld({ mine: 1 }), true, 'and then I publish');
  } finally {
    restore();
  }
});

test('a follow frame nobody promised, and a world frame from someone not hosting, are not taken', () => {
  const { ws, worlds, restore } = joined();
  try {
    ws.receive({ t: 'welcome', id: ME, peers: [], host: 'host-0001', world: null, now: Date.now() });
    ws.receive(followText);
    ws.receive({ t: 'world', id: 'other-0003', data: { x: 1 } });
    assert.deepEqual(worlds, []);
    ws.receive({ t: 'world', id: 'host-0001', data: { x: 2 } });
    assert.deepEqual(worlds, [{ x: 2 }], 'the host\'s own still is');
  } finally {
    restore();
  }
});

test('a promised memory that never lands stops holding my publish after the wait', () => {
  const { session, ws, restore, advance } = joined();
  try {
    ws.receive({ t: 'welcome', id: ME, peers: [], host: ME, world: null, wf: 1, now: Date.now() });
    assert.equal(session.sendWorld({ mine: 1 }), false);
    advance(WORLD_FOLLOW_WAIT_MS + 1);
    assert.equal(session.sendWorld({ mine: 1 }), true);
  } finally {
    restore();
  }
});
