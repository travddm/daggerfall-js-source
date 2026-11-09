// Where a gate stands, as the players' games say it, driven. The agreement law (net/gate/gate-site.ts), the wire's
// `site` word (net/wire.js), the hub keeping each account's word over the real Room (server/src/index.js), and the
// client's word (net/online.js sendGateSite). The broken rite stands by the site the accounts agree on.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  gateSiteDayOk, foldGateSite, agreedGateSite, GATE_SITE_AGREE, GATE_SITE_CANDIDATES_MAX, GATE_SITE_VOTES_MAX, GATE_SITE_SKEW_MS,
} from '../../../src/net/gate/gate-site.ts';
import { gateTimes, GATE_COLLAPSE_MS } from '../../../src/net/gate/gateLaw.js';
import { validGateIn, parseClient, gatePlaceWire, GATE_PLACE_MAX, SOCIAL_ROOM, RELAY_VERSION, ACCOUNT_SWEEP_MS, SD_KEY } from '../../../src/net/wire.js';
import { fakeRoom } from '../../fakeRoom.mjs';
import { OnlineSession } from '../../../src/net/online.js';
import { fakeSocketClass } from '../../fakeSocket.mjs';

const DAY = 538;   // a gate day: its omen 14:17:30 UTC, open 14:32:30, sealed 14:42:30, wrath 14:52:30
const TT = gateTimes(DAY);

// ═══ THE LAW ═══

test('gate site: WHERE THE GATE STANDS - one word an account a day; one account names nothing, GATE_SITE_AGREE agreeing name it, the most accounts win (the first said, a tie); a newer day starts again, an older day\'s word is nothing; the record\'s bounds; the same record back when nothing moved (mutants: one account enough; a second word counted; the last said winning; the bounds lifted)', () => {
  const A = [100, 200, 'Copperham, Wrothgarian Mountains'], B = [101, 200, 'Elsewhere'];
  let r = foldGateSite(null, DAY, 's1', ...A);
  assert.deepEqual(r, { d: DAY, c: [[...A, ['s1']]] });
  assert.equal(agreedGateSite(r, DAY), null, 'one account: nothing');
  assert.equal(foldGateSite(r, DAY, 's1', ...B), r, 'its second word: nothing, the same record');
  assert.equal(foldGateSite(r, DAY, 's1', ...A), r);
  r = foldGateSite(r, DAY, 's2', ...B);
  assert.equal(agreedGateSite(r, DAY), null, 'two accounts, two places: nothing');
  r = foldGateSite(r, DAY, 's3', ...A);
  assert.equal(GATE_SITE_AGREE, 2);
  assert.deepEqual(agreedGateSite(r, DAY), { px: 100, py: 200, pl: A[2] });
  r = foldGateSite(r, DAY, 's4', ...B);
  assert.deepEqual(agreedGateSite(r, DAY), { px: 100, py: 200, pl: A[2] }, 'a tie: the first said');
  r = foldGateSite(foldGateSite(r, DAY, 's5', ...B), DAY, 's6', ...B);
  assert.deepEqual(agreedGateSite(r, DAY), { px: 101, py: 200, pl: 'Elsewhere' }, 'the most accounts');
  assert.equal(agreedGateSite(r, DAY + 1), null, 'another day\'s record names nothing');
  assert.equal(foldGateSite(r, DAY - 1, 's9', ...A), r, 'an older day\'s word');
  assert.deepEqual(foldGateSite(r, DAY + 1, 's1', ...A), { d: DAY + 1, c: [[...A, ['s1']]] }, 'a newer day starts again');
  let full = null;
  for (let i = 0; i < GATE_SITE_CANDIDATES_MAX; i++) full = foldGateSite(full, DAY, `c${i}`, i, 0, `P${i}`);
  assert.equal(foldGateSite(full, DAY, 'late', 999, 0, 'Late'), full, 'no new place past the bound');
  let many = null;
  for (let i = 0; i < GATE_SITE_VOTES_MAX; i++) many = foldGateSite(many, DAY, `v${i}`, ...A);
  assert.equal(foldGateSite(many, DAY, 'late', ...A), many, 'no vote past the bound');
  assert.equal(many.c[0][3].length, GATE_SITE_VOTES_MAX);
  // the days the hub takes a word for
  const now = TT.omenAt - 60 * 60_000;
  assert.ok(gateSiteDayOk(DAY, now), 'the gate the clock is about');
  assert.ok(!gateSiteDayOk(DAY + 1, now) && !gateSiteDayOk(DAY - 1, now));
  const turn = TT.wrathAt + GATE_COLLAPSE_MS;   // the clock turns to the next gate here
  assert.ok(gateSiteDayOk(DAY + 1, turn - GATE_SITE_SKEW_MS + 1), 'the next, a moment before the turn');
  assert.ok(!gateSiteDayOk(DAY + 1, turn - GATE_SITE_SKEW_MS - 1000));
  assert.ok(!gateSiteDayOk(DAY, turn), 'a collapsed gate\'s');
  assert.ok(!gateSiteDayOk('538', now) && !gateSiteDayOk(null, now));
});

// ═══ THE WIRE ═══

test('gate site wire: the `site` word - its day, a map pixel and a place its law leaves as it is (never rewritten at the relay); parseClient projects it and drops the rest (mutants: a raw place taken; the pixel unbounded)', () => {
  const ok = { k: 'site', d: DAY, px: 100, py: 200, pl: 'Copperham, Wrothgarian Mountains' };
  assert.deepEqual(validGateIn(ok), ok);
  assert.deepEqual(validGateIn({ ...ok, pl: 'Alik\'r Desert' }).pl, 'Alik\'r Desert');
  for (const bad of [{ pl: 'Copperham**' }, { pl: '<@&1> Copperham' }, { pl: 'Copper  ham' }, { pl: ' Copperham' }, { pl: ', Copperham' }, { pl: '' }, { pl: 'x'.repeat(GATE_PLACE_MAX + 1) }, { pl: 5 },
    { px: 1000 }, { py: 500 }, { px: -1 }, { px: 1.5 }, { d: -1 }, { d: '538' }]) assert.equal(validGateIn({ ...ok, ...bad }), null, JSON.stringify(bad));
  assert.deepEqual(parseClient(JSON.stringify({ t: 'gate', ...ok, extra: 1 }), { hasHello: true }), { t: 'gate', ...ok });
  assert.equal(gatePlaceWire(' St. Olms  Keep:*  '), 'St Olms Keep');
});

// ═══ THE RELAY ═══

const quiet = (fn) => { const warn = console.warn; console.warn = () => {}; return Promise.resolve().then(fn).finally(() => { console.warn = warn; }); };

test('gate site relay: the hub keeps each word of an account in its record and arms nothing; a `site` outside the hub is junk', async () => {
  const realNow = Date.now;
  let clock = TT.omenAt - 10 * 60_000;
  Date.now = () => clock;
  try {
    await quiet(async () => {
      const r = fakeRoom(SOCIAL_ROOM);
      // the Abyss Dungeon's director beats on the hub's one alarm too: its record seeded with a rise ten years off
      r.store.set(SD_KEY, { s: 0, ph: 'gone', r: -1, at: clock, until: clock, next: clock + 10 * 365 * 86_400_000 });
      for (let lane = 1; lane <= 9; lane++) r.store.set(`${SD_KEY}:${lane}`, { s: lane * 10_000_000, ph: 'gone', r: -1, at: clock, until: clock, next: clock + 10 * 365 * 86_400_000 });
      const join = async (n) => { const ws = r.connect(); await r.hello(ws, `peer-${n}`, null, { name: n, acct: `acct-${n}`, asecret: `secret-of-acct-${n}` }); clock += 10; return ws; };
      const site = (ws, d, px, py, pl) => r.raw(ws, JSON.stringify({ t: 'gate', k: 'site', d, px, py, pl }));
      const a = await join('a');
      const sweepAt = r.alarm.at;
      assert.equal(sweepAt, clock - 10 + ACCOUNT_SWEEP_MS, 'the sweep alarm, untouched');
      await site(a, DAY, 100, 200, 'Copperham');
      assert.deepEqual(r.store.get('gatesite'), { d: DAY, c: [[100, 200, 'Copperham', ['acct-a']]] }, 'kept for the rite');
      const b = await join('b');
      await site(b, DAY, 100, 200, 'Copperham');
      assert.deepEqual(agreedGateSite(r.store.get('gatesite'), DAY), { px: 100, py: 200, pl: 'Copperham' }, 'two accounts agree');
      assert.equal(r.alarm.at, sweepAt, 'a site word arms nothing');
    });
    // a site word in a place room is junk, as a `spent` is
    const cell = fakeRoom('world:6,9');
    const ws = cell.connect(); await cell.hello(ws, 'peer-x', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    await cell.raw(ws, JSON.stringify({ t: 'gate', k: 'site', d: DAY, px: 1, py: 1, pl: 'Copperham' }));
    assert.equal(ws.meters.junk, 1);
  } finally { Date.now = realNow; }
});

// ═══ THE CLIENT ═══

test('gate site client: the game says where it found the gate to the hub - once a socket and day, a reconnect says it again; never without an account or when the send fails; the frame is the wire\'s; the scene says it off the clearing\'s own site (mutants: said every frame; the place sent raw)', () => {
  const link = (v = RELAY_VERSION, acct = 'acct-me') => {
    const { FakeWS, sockets } = fakeSocketClass();
    const o = new OnlineSession({ url: 'wss://relay.test', name: 'Mac', id: 'peer-me', secret: 'secret-of-peer-me', WebSocketImpl: FakeWS, now: () => 1e6, presence: false, acct, asecret: 'secret-of-acct-me' });
    o.join(SOCIAL_ROOM, null);
    const ws = sockets[0]; ws.open();
    ws.receive({ t: 'welcome', id: 'peer-me', peers: [], n: 1, v });
    const sites = () => ws.sent.map((x) => JSON.parse(x)).filter((m) => m.t === 'gate' && m.k === 'site');
    return { o, ws, sites, sockets };
  };
  const { o, sites, ws } = link();
  assert.equal(o.sendGateSite(DAY, 100, 200, 'St. Olms, Daggerfall'), true);
  assert.deepEqual(sites(), [{ t: 'gate', k: 'site', d: DAY, px: 100, py: 200, pl: 'St Olms, Daggerfall' }], 'the place as the wire\'s law leaves it');
  assert.equal(o.sendGateSite(DAY, 100, 200, 'St. Olms, Daggerfall'), true, 'said already');
  assert.equal(sites().length, 1, 'once a socket and day');
  assert.equal(o.sendGateSite(DAY + 1, 5, 6, 'Wayrest'), true); assert.equal(sites().length, 2, 'the next day');
  o._ws = { send: () => { throw new Error('gone'); } };
  assert.equal(o.sendGateSite(DAY + 2, 5, 6, 'Wayrest'), false, 'a send that fails is said again');
  o._ws = ws;
  assert.equal(link(RELAY_VERSION, null).o.sendGateSite(DAY, 1, 1, 'Wayrest'), false, 'no account, no word');
  const off = link();
  assert.equal(off.o.sendGateSite(DAY, 1000, 1, 'Wayrest'), false, 'off the map');
  assert.equal(off.o.sendGateSite(DAY, 1000, 1, 'Wayrest'), true, 'and asked no more that day');
  assert.equal(off.sites().length, 0);
});
