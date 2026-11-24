// A place's hello gate (server/src/helloGate.js) with the relay's door: a hello with the door's pass spends the pass
// instead of the room's bucket, and a busy close names how long the refused ahead take.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the wire's imports name DOM crypto types that tsconfig.node.json has no library for.
const GATE_PATH: string = '../../server/src/helloGate.js';
const DOOR_PATH_TS: string = '../../server/src/relay-door.ts';
const LAW_PATH: string = '../../src/net/door-law.ts';
const WIRE_PATH: string = '../../src/net/wire.js';
const { placeGate, preTokenGate } = await import(GATE_PATH);
const { doorInternal, DOOR_OBJECT } = await import(DOOR_PATH_TS);
const { busyWaitMs, busyTokenUnread } = await import(LAW_PATH);
const { CLOSE_BUSY } = await import(WIRE_PATH);

const CELL = 'world:25,9';
const PAGE = 'page-000000000001';

/** A room whose own hello bucket is shut, and the door object beside it. */
function busyRoom() {
  const doorRoom = { env: {} };
  const ROOMS = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (url: string, init: RequestInit) => {
        assert.equal(id, DOOR_OBJECT);
        return (
          (await doorInternal(doorRoom, new URL(url).pathname, new Request(url, init))) ??
          new Response('{}', { status: 404 })
        );
      },
    }),
  };
  const sides: string[] = [];
  const refused: Array<{ code: number; reason: string }> = [];
  const room = {
    env: { ROOMS },
    _hellos: { tokens: 0, at: 1_000 },
    _helloHz: () => 10,
    // The account's own bucket always has room; the room's (the 'watch' side) never does.
    _battleHelloGate: async (_sub: string, side: string) => {
      sides.push(side);
      return { pass: side !== 'watch' };
    },
    _refuse: (_ws: unknown, _words: string, code: number, reason: string) => refused.push({ code, reason }),
  };
  return { room, ROOMS, sides, refused };
}

async function passFor(ROOMS: object, room: string): Promise<string> {
  const { doorRoute } = await import(DOOR_PATH_TS);
  const res = await doorRoute({ ROOMS }, new URL(`https://relay.test/door?room=${room}&id=${PAGE}`));
  return (await res.json()).pass;
}

test("a hello with the door's pass goes in past a shut bucket, once", async () => {
  const { room, ROOMS, sides, refused } = busyRoom();
  const dp = await passFor(ROOMS, CELL);
  const who = { subject: 'acct-1' };
  assert.equal(await placeGate(room, {}, CELL, who, { id: 'p1', dp }, 1_000), false, 'let in');
  assert.deepEqual(sides, ['door']);
  assert.equal(await placeGate(room, {}, CELL, who, { id: 'p1', dp }, 1_001), true, 'the pass is spent');
  assert.equal(refused[0].code, CLOSE_BUSY);
});

test("a pass for another room is the room's bucket's to judge", async () => {
  const { room, ROOMS, sides } = busyRoom();
  const dp = await passFor(ROOMS, 'world:26,9');
  assert.equal(await placeGate(room, {}, CELL, { subject: 'acct-1' }, { id: 'p1', dp }, 1_000), true);
  assert.deepEqual(sides, ['watch']);
});

test('a busy close names a wait that grows with the refused ahead and drains at the hello rate', async () => {
  const { room, refused } = busyRoom();
  for (let i = 0; i < 30; i++) await placeGate(room, {}, CELL, { subject: `acct-${i}` }, { id: `p${i}` }, 1_000);
  const waits = refused.map((r) => busyWaitMs(r.reason));
  assert.equal(waits[0], 1_000);
  assert.equal(waits[29], 3_000, '30 refused at 10 a second');
  await placeGate(room, {}, CELL, { subject: 'late' }, { id: 'late' }, 4_000);
  assert.equal(busyWaitMs(refused[30].reason), 1_000, 'three seconds later the count has drained');
});

test('a room that spends its gate before the token says the token is unread, and the wait', () => {
  const { room, refused } = busyRoom();
  assert.equal(preTokenGate(room, {}, 'social', 1_000), true);
  assert.equal(busyTokenUnread(refused[0].reason), true);
  assert.equal(busyWaitMs(refused[0].reason), 1_000);
});
