// SEA-EVENTS: THE SOCIAL ROOM'S RECORD OF SUNK TREASURE FLEETS (net/sea/fleetHub.js, the `sea` frame).
// The record's law alone, the frame's validators at both ends, and the relay over the real social Room (test/fakeRoom.mjs):
// a flagship sunk while her sailing is under way is kept once and told to everyone online, a `hi` is answered with the
// sailings down, and an early word and a repeated word move nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIAL_ROOM,
  SEA_FLEET_PERIOD_MS,
  SEA_FLEET_OFFSET_MS,
  SEA_FLEET_SAIL_MS,
  SEA_FLEET_LATE_MS,
  SEA_FRAME_MAX,
  parseClient,
  validSeaIn,
  validSeaOut,
} from '../../../src/net/wire.js';
import {
  SEA_HUB_KEY,
  fleetHubEmpty,
  fleetHubOf,
  fleetHubPrune,
  fleetSunk,
  fleetsDown,
} from '../../../src/net/sea/fleetHub.js';
import { fakeRoom } from '../../fakeRoom.mjs';

const SAILING = 400;
const UNDER_WAY = SAILING * SEA_FLEET_PERIOD_MS + SEA_FLEET_OFFSET_MS + 10 * 60_000;

test('SEA fleet hub law: a flagship is sunk only while her sailing is under way, once, until the sailing after is over', () => {
  const record = fleetHubEmpty();
  const start = SAILING * SEA_FLEET_PERIOD_MS + SEA_FLEET_OFFSET_MS;
  assert.equal(fleetSunk(record, SAILING, start - 1), false, 'in port, before she sails');
  assert.equal(
    fleetSunk(record, SAILING, start + SEA_FLEET_SAIL_MS + SEA_FLEET_LATE_MS + 1),
    false,
    'long after she is home',
  );
  assert.equal(fleetSunk(record, 'x', start + 5), false, 'a sailing is a number');
  assert.deepEqual(fleetsDown(record, start + 5), [], 'nothing moved');
  assert.equal(fleetSunk(record, SAILING, start + 5), true, 'under way: news');
  assert.equal(fleetSunk(record, SAILING, start + 6), false, 'a second report moves nothing');
  assert.deepEqual(fleetsDown(record, start + 6), [SAILING]);
  const letGo = (SAILING + 2) * SEA_FLEET_PERIOD_MS;
  assert.deepEqual(fleetsDown(record, letGo - 1), [SAILING], 'down till the sailing after next begins');
  assert.equal(fleetHubPrune(record, letGo - 1), false);
  assert.equal(fleetHubPrune(record, letGo), true, 'then let go');
  assert.deepEqual(fleetsDown(record, letGo), []);
});

test('SEA fleet hub record: a stored record is made safe, anything malformed dropped', () => {
  assert.deepEqual(fleetHubOf(null), fleetHubEmpty());
  assert.deepEqual(fleetHubOf({ fleets: [1, 2] }), fleetHubEmpty());
  assert.deepEqual(fleetHubOf({ fleets: { 7: 100, x: 5, 8: 'soon' } }), { fleets: { 7: 100 } });
});

test('SEA wire: the words in and out are bounded, and the frame parses only after a hello', () => {
  assert.deepEqual(validSeaIn({ k: 'hi' }), { k: 'hi' });
  assert.deepEqual(validSeaIn({ k: 'fk', n: 12, extra: 1 }), { k: 'fk', n: 12 });
  assert.equal(validSeaIn({ k: 'fk' }), null);
  assert.equal(validSeaIn({ k: 'fk', n: -1 }), null);
  assert.equal(validSeaIn({ k: 'fk', n: 1.5 }), null);
  assert.equal(validSeaIn({ k: 'gk', g: 1 }), null, 'the giants are gone with the zone');
  assert.deepEqual(validSeaOut({ t: 'sea', k: 'st', fleets: [3, 4, 'x', -1], now: 99 }), {
    k: 'st',
    fleets: [3, 4],
    now: 99,
  });
  assert.deepEqual(validSeaOut({ t: 'sea', k: 'st', fleets: [], now: 'later' }), { k: 'st', fleets: [], now: null });
  assert.deepEqual(validSeaOut({ t: 'sea', k: 'fd', fleets: [5] }), { k: 'fd', fleets: [5] });
  assert.equal(validSeaOut({ t: 'sea', k: 'cr' }), null);
  assert.equal(validSeaOut({ t: 'wdun', k: 'fd', fleets: [5] }), null, 'the old frame is not this one');
  assert.deepEqual(parseClient(JSON.stringify({ t: 'sea', k: 'hi' }), { hasHello: true }), { t: 'sea', k: 'hi' });
  assert.equal(parseClient(JSON.stringify({ t: 'sea', k: 'hi' })).error, 'sea before hello');
  assert.equal(parseClient(JSON.stringify({ t: 'sea', k: 'fk', n: 'x' }), { hasHello: true }).error, 'bad sea');
  assert.equal(
    parseClient(JSON.stringify({ t: 'sea', k: 'hi', pad: 'x'.repeat(SEA_FRAME_MAX) }), { hasHello: true }).error,
    'frame too large',
  );
  assert.equal(
    parseClient(JSON.stringify({ t: 'wdun', k: 'hi' }), { hasHello: true }).error !== undefined,
    true,
    'the hall frame no longer parses',
  );
  assert.equal(
    parseClient(JSON.stringify({ t: 'wild', data: { k: 'zone', z: 1 } }), { hasHello: true }).error !== undefined,
    true,
    'nor the zone frame',
  );
});

/** Run `fn` with the clock at `at`, so the room's `Date.now()` is the sailing's moment. */
async function atClock(at, fn) {
  const realNow = Date.now;
  let clock = at;
  Date.now = () => clock;
  try {
    await fn({
      tick: (ms) => {
        clock += ms;
      },
    });
  } finally {
    Date.now = realNow;
  }
}
const seaWords = (ws, k) => ws.sent.filter((m) => m.t === 'sea' && (k == null || m.k === k));

test('SEA relay: a flagship sunk under way is kept once, written once and told to everyone; a hi is answered with the sailings down', async () => {
  await atClock(UNDER_WAY, async ({ tick }) => {
    const hub = fakeRoom(SOCIAL_ROOM);
    const join = async (n, who = {}) => {
      const ws = hub.connect();
      await hub.hello(ws, `peer-${n}`, null, {
        name: n,
        acct: `acct-${n}`,
        asecret: `secret-of-acct-${n}`,
        kind: 'linked',
        ...who,
      });
      tick(10);
      return ws;
    };
    const say = (ws, word) => hub.raw(ws, JSON.stringify({ t: 'sea', ...word }));
    const alice = await join('alice');
    const bob = await join('bob');
    await say(alice, { k: 'hi' });
    assert.deepEqual(
      seaWords(alice, 'st').map((m) => m.fleets),
      [[]],
      'nothing down yet',
    );
    assert.equal(seaWords(alice, 'st')[0].now, Date.now(), "the answer carries the relay's clock");
    assert.equal(hub.store.has(SEA_HUB_KEY), false, 'a question writes nothing');

    await say(alice, { k: 'fk', n: SAILING });
    assert.deepEqual(
      seaWords(alice, 'fd').map((m) => m.fleets),
      [[SAILING]],
      'the sinker hears it',
    );
    assert.deepEqual(
      seaWords(bob, 'fd').map((m) => m.fleets),
      [[SAILING]],
      'so does everyone online',
    );
    assert.deepEqual(hub.store.get(SEA_HUB_KEY).fleets[SAILING] > Date.now(), true, 'kept, with the time it is let go');

    tick(2000);
    const writes = hub.store.get(SEA_HUB_KEY);
    await say(bob, { k: 'fk', n: SAILING });
    assert.equal(seaWords(alice, 'fd').length, 1, 'a second report is not news');
    assert.equal(hub.store.get(SEA_HUB_KEY), writes, 'and writes nothing');

    const carol = await join('carol');
    await say(carol, { k: 'hi' });
    assert.deepEqual(
      seaWords(carol, 'st').map((m) => m.fleets),
      [[SAILING]],
      'a newcomer asks and is told',
    );

    tick(2000);
    await say(alice, { k: 'fk', n: SAILING + 1 });
    assert.deepEqual(seaWords(bob, 'fd').length, 1, 'a sailing not yet under way is not scattered');
    await say(alice, { k: 'fk', n: 'x' });
    assert.equal(alice.closed?.reason, 'bad sea', 'a malformed word closes the socket at the parser');
  });
});

test('SEA relay: a guest word on a flagship moves nothing', async () => {
  await atClock(UNDER_WAY, async ({ tick }) => {
    const hub = fakeRoom(SOCIAL_ROOM);
    const guest = hub.connect();
    await hub.hello(guest, 'peer-guest', null, { name: 'guest', acct: 'acct-guest', asecret: 'secret-of-acct-guest' });
    tick(10);
    await hub.raw(guest, JSON.stringify({ t: 'sea', k: 'fk', n: SAILING }));
    assert.equal(hub.store.has(SEA_HUB_KEY), false, 'a guest sails no realm ship');
    assert.equal(seaWords(guest, 'fd').length, 0);
  });
});

test('SEA relay: the frame belongs to the social room alone, a cell answers none', async () => {
  await atClock(UNDER_WAY, async () => {
    const cell = fakeRoom('world:3,12');
    const walker = cell.connect();
    await cell.hello(walker, 'peer-walker', null, { kind: 'linked' });
    await cell.raw(walker, JSON.stringify({ t: 'sea', k: 'hi' }));
    assert.equal(seaWords(walker).length, 0);
  });
});
