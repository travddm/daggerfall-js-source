// The relay door's law as both ends read it: the answers' shapes, the account line's answer read the same way, and
// the wait a busy close names.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the wire's imports name DOM crypto types that tsconfig.node.json has no library for.
const DOOR_LAW_PATH: string = '../../src/net/door-law.ts';
const WIRE_PATH: string = '../../src/net/wire.js';
const ADMIT_PATH: string = '../../server-account/src/admit.js';
const { readDoorAnswer, busyReason, busyWaitMs, busyTokenUnread, doorPaces, DOOR_WAIT_MAX_MS, DOOR_WAIT_MIN_MS } =
  await import(DOOR_LAW_PATH);
const { BUSY_TOKEN_UNREAD } = await import(WIRE_PATH);
const { admitLine, admitAsk, ADMIT_BURST } = await import(ADMIT_PATH);

test('a pass, a place in line, and every other answer read as open', () => {
  assert.deepEqual(readDoorAnswer(200, { pass: 'abcdefghijklmnop', until: 5 }), {
    kind: 'pass',
    pass: 'abcdefghijklmnop',
    until: 5,
  });
  assert.deepEqual(readDoorAnswer(503, { error: 'queue', position: 7, wait: 1750 }), {
    kind: 'queue',
    position: 7,
    wait: 1750,
  });
  assert.deepEqual(readDoorAnswer(200, {}), { kind: 'open' }, 'a door that lets the page in unpaced');
  assert.deepEqual(
    readDoorAnswer(503, { error: 'unavailable' }),
    { kind: 'open' },
    'a room that did not answer is no line',
  );
  assert.deepEqual(readDoorAnswer(404, { error: 'no such room' }), { kind: 'open' });
  assert.deepEqual(readDoorAnswer(0, null), { kind: 'open' }, 'a network error');
  assert.deepEqual(readDoorAnswer(200, { pass: 'short', until: 5 }), { kind: 'open' }, 'a pass out of shape');
  assert.deepEqual(readDoorAnswer(503, { error: 'queue', position: Number.NaN, wait: 1000 }), { kind: 'open' });
  assert.deepEqual(readDoorAnswer(503, { error: 'queue', position: 0, wait: 1000 }), { kind: 'open' });
});

test('a told wait is bounded: never under a second, never over the longest', () => {
  assert.equal(readDoorAnswer(503, { error: 'queue', position: 1, wait: 0 }).wait, DOOR_WAIT_MIN_MS);
  assert.equal(readDoorAnswer(503, { error: 'queue', position: 1, wait: 9e9 }).wait, DOOR_WAIT_MAX_MS);
});

test("the account service's sign-in line answers in the shape the door's reader takes", () => {
  const line = admitLine();
  for (let i = 0; i < ADMIT_BURST; i++) admitAsk(line, `quiet${i}`, 1000);
  const held = admitAsk(line, 'late', 1000);
  assert.equal(held.go, false);
  // The service's 503 body: server-account/src/index.js answers `{ error: 'queue', position, wait }`.
  const read = readDoorAnswer(503, { error: 'queue', position: held.position, wait: held.wait });
  assert.deepEqual(read, { kind: 'queue', position: held.position, wait: held.wait });
});

test('a busy close names its wait in whole seconds, and the reader takes it back', () => {
  assert.equal(busyReason('busy', 4_400), 'busy, wait 4');
  assert.equal(busyWaitMs('busy, wait 4'), 4_000);
  assert.equal(busyWaitMs(busyReason(BUSY_TOKEN_UNREAD, 2_000)), 2_000);
  assert.equal(busyReason('busy', 10), 'busy, wait 1', 'never under a second');
  assert.equal(busyReason('busy', 1e9), 'busy, wait 30', 'never over the longest');
  assert.equal(busyWaitMs('busy'), null, 'a reason without a wait');
  assert.equal(busyWaitMs(BUSY_TOKEN_UNREAD), null);
  assert.equal(busyWaitMs('busy, wait 999'), null, 'out of shape');
  assert.equal(busyWaitMs('room full, wait 4'), null, 'not a busy close');
  assert.equal(busyWaitMs(undefined), null);
});

test('the token-unread word is read with or without a wait', () => {
  assert.equal(busyTokenUnread(BUSY_TOKEN_UNREAD), true);
  assert.equal(busyTokenUnread(busyReason(BUSY_TOKEN_UNREAD, 3_000)), true);
  assert.equal(busyTokenUnread(busyReason('busy', 3_000)), false);
  assert.equal(busyTokenUnread('busy'), false);
});

test('the door paces places: cells and world rooms, not the hub or a chat channel', () => {
  assert.equal(doorPaces('world:25,9'), true);
  assert.equal(doorPaces('social'), false);
  assert.equal(doorPaces('chat:general'), false);
});
