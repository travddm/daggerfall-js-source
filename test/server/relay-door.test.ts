// The relay's door (server/src/relay-door.ts): each room's line at its rate under the server-wide line, its passes,
// its bounds, and the Worker's route that fails open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the wire's imports name DOM crypto types that tsconfig.node.json has no library for.
const DOOR_PATH_TS: string = '../../server/src/relay-door.ts';
const ADMIT_PATH: string = '../../server-account/src/admit.js';
const door = await import(DOOR_PATH_TS);
const { newDoor, doorAsk, doorSpend, doorResponse, doorInternal, doorRoute, spendDoorPass } = door;
const { DOOR_ROOM_RATE, DOOR_SERVER_RATE, DOOR_ROOM_PLACES_MAX, DOOR_PASS_MS, DOOR_OBJECT, DOOR_INTERNAL_ASK } = door;
const { ADMIT_RATE } = await import(ADMIT_PATH);

const CELL = 'world:25,9';
const OTHER_CELL = 'world:26,9';
const idOf = (n: number): string => `page-${String(n).padStart(12, '0')}`;

test('a quiet room lets a second of sign-ins in at once, then gives places in order', () => {
  const d = newDoor();
  const t0 = 1_000_000;
  for (let i = 0; i < DOOR_ROOM_RATE; i++) assert.equal(doorAsk(d, CELL, idOf(i), t0).kind, 'pass', `burst ${i}`);
  const first = doorAsk(d, CELL, idOf(100), t0);
  const second = doorAsk(d, CELL, idOf(101), t0);
  assert.deepEqual([first.kind, first.position], ['queue', 1]);
  assert.deepEqual([second.kind, second.position], ['queue', 2]);
  assert.equal(doorAsk(d, CELL, idOf(100), t0).position, 1, 'asked again, a page keeps its place');
  assert.equal(doorAsk(d, CELL, idOf(100), t0 + 1000 / DOOR_ROOM_RATE).kind, 'pass', 'its turn comes at the rate');
});

test("a pass opens its own room's hello once, and no other room's", () => {
  const d = newDoor();
  const t0 = 1_000_000;
  const got = doorAsk(d, CELL, idOf(1), t0);
  assert.equal(got.kind, 'pass');
  assert.equal(doorSpend(d, OTHER_CELL, got.pass, t0), false, 'another room');
  assert.equal(doorSpend(d, CELL, got.pass, t0 + DOOR_PASS_MS), false, 'out of date');
  assert.equal(doorSpend(d, CELL, got.pass, t0 + 1), true);
  assert.equal(doorSpend(d, CELL, got.pass, t0 + 2), false, 'spent');
  assert.equal(doorSpend(d, CELL, 'nobody-gave-this-word', t0), false);
});

test('a page asking again for a pass holds one live pass, not one an ask', () => {
  const d = newDoor();
  const first = doorAsk(d, CELL, idOf(1), 1_000_000);
  const again = doorAsk(d, CELL, idOf(1), 1_000_001);
  assert.equal(again.kind, 'pass');
  assert.equal(doorSpend(d, CELL, first.pass, 1_000_002), false, 'the earlier pass went with the new one');
  assert.equal(doorSpend(d, CELL, again.pass, 1_000_002), true);
});

test("the server-wide line holds a second room the first room's return already fills", () => {
  const d = newDoor();
  const t0 = 1_000_000;
  for (let i = 0; i < DOOR_SERVER_RATE; i++) assert.equal(doorAsk(d, CELL, idOf(i), t0).kind, 'pass');
  // The other room's own line is quiet and would let a burst in; the server's has none left this second.
  const held = doorAsk(d, OTHER_CELL, idOf(50), t0);
  assert.equal(held.kind, 'queue');
  assert.equal(
    doorAsk(d, OTHER_CELL, idOf(50), t0 + 1000 / DOOR_SERVER_RATE).kind,
    'pass',
    "its turn in the server's line",
  );
});

test("a full line gives no place: the page goes in unpaced, and the room's bucket decides", () => {
  const d = newDoor();
  const t0 = 1_000_000;
  for (let i = 0; i < DOOR_ROOM_PLACES_MAX + DOOR_ROOM_RATE; i++) doorAsk(d, CELL, idOf(i), t0);
  assert.equal(doorAsk(d, CELL, idOf(99_999), t0).kind, 'open');
});

test("the server owner's rates are read from the Worker's vars, and a bad value keeps the default", () => {
  const d = newDoor({ DOOR_ROOM_RATE: '10', DOOR_SERVER_RATE: 'lots' });
  assert.equal(d.roomLaw.rate, 10);
  assert.equal(d.serverLaw.rate, DOOR_SERVER_RATE);
});

test("the account service's sign-in line runs at or above the door's server-wide rate, so it forms no second line", () => {
  assert.ok(ADMIT_RATE >= DOOR_SERVER_RATE, `ADMIT_RATE ${ADMIT_RATE} < DOOR_SERVER_RATE ${DOOR_SERVER_RATE}`);
});

test("a place in line answers 503 in the sign-in line's shape, with retry-after; a pass and open answer 200", async () => {
  const queued = doorResponse({ kind: 'queue', position: 9, wait: 2250 });
  assert.equal(queued.status, 503);
  assert.equal(queued.headers.get('retry-after'), '3');
  assert.equal(queued.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await queued.json(), { error: 'queue', position: 9, wait: 2250 });
  const pass = doorResponse({ kind: 'pass', pass: 'abcdefghijklmnop', until: 7 });
  assert.equal(pass.status, 200);
  assert.deepEqual(await pass.json(), { pass: 'abcdefghijklmnop', until: 7 });
  assert.deepEqual(await doorResponse({ kind: 'open' }).json(), {});
});

/** A Workers namespace whose one object is a Room that only answers the door's paths, or that never answers. */
function namespace(answers = true) {
  const room = { env: {} };
  return {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (url: string, init: RequestInit) => {
        assert.equal(id, DOOR_OBJECT);
        if (!answers) return new Promise(() => {});
        return (
          (await doorInternal(room, new URL(url).pathname, new Request(url, init))) ??
          new Response('{}', { status: 404 })
        );
      },
    }),
  };
}

test("the Worker's route asks the door object and passes its answer on", async () => {
  const env = { ROOMS: namespace() };
  const res = await doorRoute(env, new URL(`https://relay.test/door?room=${CELL}&id=${idOf(1)}`));
  assert.equal(res.status, 200);
  const { pass } = await res.json();
  assert.equal(await spendDoorPass(env, CELL, pass), true, 'the room spends it at the same object');
  assert.equal(await spendDoorPass(env, CELL, pass), false);
});

test("the Worker's route lets a bad ask in unpaced, without asking the door object", async () => {
  const env = { ROOMS: namespace() };
  for (const query of [
    `room=social&id=${idOf(1)}`,
    `room=${CELL}&id=short`,
    `room=%23door&id=${idOf(1)}`,
    `id=${idOf(1)}`,
  ]) {
    const res = await doorRoute(env, new URL(`https://relay.test/door?${query}`));
    assert.deepEqual([res.status, await res.json()], [200, {}], query);
  }
});

test("a door object that does not answer lets the page in, and a room's spend gives up", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = { ROOMS: namespace(false) };
  const asked = doorRoute(env, new URL(`https://relay.test/door?room=${CELL}&id=${idOf(1)}`));
  const spent = spendDoorPass(env, CELL, 'abcdefghijklmnop');
  t.mock.timers.tick(5_000);
  assert.deepEqual(await (await asked).json(), {});
  assert.equal(await spent, false);
});

test('the door object answers only its own paths', async () => {
  const room = { env: {} };
  assert.equal(
    await doorInternal(room, '/internal/park/reg', new Request('https://x/internal/park/reg', { method: 'POST' })),
    null,
  );
  const res = await doorInternal(
    room,
    DOOR_INTERNAL_ASK,
    new Request(`https://x${DOOR_INTERNAL_ASK}`, { method: 'POST', body: 'not json' }),
  );
  assert.deepEqual(await res.json(), {}, 'a bad body is let in unpaced');
});
