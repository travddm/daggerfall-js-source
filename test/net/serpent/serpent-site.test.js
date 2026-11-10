// Where the sea serpent lies, as the players' games say it, driven. The agreement law (net/serpent/serpent-site.ts), the
// wire's `site` word (net/wire.js), the hub keeping each word and telling every game the agreed site (server/src/index.js),
// the client's word (net/online.js sendSerpentSite, systems/serpent/serpentOmen.js ahead, scenes/world.js), and the
// Timers window's rows (systems/eventTimers.js, ui/enhanced/enhancedTimers.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serpentSiteDayOk, agreedSerpentSite, serpentAtWord } from '../../../src/net/serpent/serpent-site.ts';
import { foldGateSite, GATE_SITE_SKEW_MS } from '../../../src/net/gate/gate-site.ts';
import {
  serpentTimes,
  serpentAt,
  serpentPhase,
  SERPENT_DIVE_MS,
  SERPENT_SURFACE_MS,
} from '../../../src/net/serpent/serpentLaw.js';
import {
  validSerpentIn,
  parseClient,
  SERPENT_KINDS,
  SOCIAL_ROOM,
  RELAY_VERSION,
  POSE_BOUND,
  ACCOUNT_SWEEP_MS,
  SD_KEY,
} from '../../../src/net/wire.js';
import { createSerpentOmen } from '../../../src/systems/serpent/serpentOmen.js';
import { eventTimerRows } from '../../../src/systems/eventTimers.js';
import { TIMER_KINDS } from '../../../src/ui/enhanced/enhancedTimers.js';
import { ENHANCED_CSS } from '../../../src/ui/enhanced/enhancedStyle.js';
import { SERPENT_RING_MAP_CSS } from '../../../src/ui/serpentMapMark.js';
import { fakeRoom } from '../../fakeRoom.mjs';
import { OnlineSession } from '../../../src/net/online.js';
import { fakeSocketClass } from '../../fakeSocket.mjs';

const DAY = 611; // a serpent day: its bells 15:02:30 UTC 2026-10-04, rising 15:17:30, storm 15:32:30, dive 15:42:30
const T = serpentTimes(DAY);
const SITE = { sx: 81_000, sz: -42_000, place: 'Sentinel' };

// ═══ THE LAW ═══

test('serpent site law: WHERE IT LIES - a word taken for the serpent the clock is about, and the next a moment before the turn; the vote law of the gate (one account names nothing, two agree)', () => {
  const quiet = T.omenAt - 3600_000;
  assert.equal(serpentAt(quiet).day, DAY);
  assert.ok(serpentSiteDayOk(DAY, quiet), 'the serpent the clock is about');
  assert.ok(!serpentSiteDayOk(DAY + 2, quiet) && !serpentSiteDayOk(DAY - 2, quiet));
  const turn = T.soundAt + SERPENT_DIVE_MS; // the clock turns to the next serpent here
  assert.ok(serpentSiteDayOk(DAY + 2, turn - GATE_SITE_SKEW_MS + 1), 'the next, a moment before the turn');
  assert.ok(!serpentSiteDayOk(DAY + 2, turn - GATE_SITE_SKEW_MS - 1000));
  assert.ok(!serpentSiteDayOk(DAY, turn), "a gone serpent's");
  assert.ok(!serpentSiteDayOk('611', quiet) && !serpentSiteDayOk(null, quiet));
  let rec = foldGateSite(null, DAY, 'a', SITE.sx, SITE.sz, SITE.place);
  assert.equal(agreedSerpentSite(rec, DAY), null, 'one account: nothing');
  rec = foldGateSite(rec, DAY, 'b', SITE.sx, SITE.sz, SITE.place);
  assert.deepEqual(agreedSerpentSite(rec, DAY), SITE, 'two agree: its native point and its port');
  assert.equal(agreedSerpentSite(rec, DAY + 2), null);
});

// ═══ THE WIRE ═══

test('serpent site wire: the `site` word - its day, its native point to the whole unit and a port its law leaves as it is (never rewritten at the relay); parseClient projects it and drops the rest (mutants: a raw place taken; the point unbounded or fractional)', () => {
  assert.ok(SERPENT_KINDS.includes('site'));
  const ok = { k: 'site', d: DAY, sx: SITE.sx, sz: SITE.sz, pl: 'Sentinel' };
  assert.deepEqual(validSerpentIn(ok), ok);
  assert.equal(validSerpentIn({ ...ok, pl: "Alik'r Desert, Sentinel" }).pl, "Alik'r Desert, Sentinel");
  for (const bad of [
    { pl: 'Sentinel**' },
    { pl: '<@&1> Sentinel' },
    { pl: 'Sen  tinel' },
    { pl: ' Sentinel' },
    { pl: ', Sentinel' },
    { pl: '' },
    { pl: 'x'.repeat(65) },
    { pl: 5 },
    { sx: POSE_BOUND + 1 },
    { sz: -POSE_BOUND - 1 },
    { sx: 1.5 },
    { sz: '1' },
    { d: -1 },
    { d: '611' },
    { d: 1.5 },
  ])
    assert.equal(validSerpentIn({ ...ok, ...bad }), null, JSON.stringify(bad));
  assert.deepEqual(parseClient(JSON.stringify({ t: 'serpent', ...ok, extra: 1 }), { hasHello: true }), {
    t: 'serpent',
    ...ok,
  });
  assert.equal(RELAY_VERSION, 'world324');
});

// ═══ THE RELAY ═══

const quiet = (fn) => {
  const warn = console.warn;
  console.warn = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.warn = warn;
    });
};

test("serpent site relay: the hub keeps each account's word, tells every game online the site once two accounts agree, and arms nothing; a `site` outside the hub is junk", async () => {
  const realNow = Date.now;
  let clock = T.omenAt - 10 * 60_000;
  Date.now = () => clock;
  try {
    await quiet(async () => {
      const r = fakeRoom(SOCIAL_ROOM);
      // the Abyss Dungeon's director beats on the hub's one alarm too: its record seeded with a rise ten years off
      r.store.set(SD_KEY, { s: 0, ph: 'gone', r: -1, at: clock, until: clock, next: clock + 10 * 365 * 86_400_000 });
      for (let lane = 1; lane <= 9; lane++)
        r.store.set(`${SD_KEY}:${lane}`, {
          s: lane * 10_000_000,
          ph: 'gone',
          r: -1,
          at: clock,
          until: clock,
          next: clock + 10 * 365 * 86_400_000,
        });
      const join = async (n) => {
        const ws = r.connect();
        await r.hello(ws, `peer-${n}`, null, { name: n, acct: `acct-${n}`, asecret: `secret-of-acct-${n}` });
        clock += 10;
        return ws;
      };
      const site = (ws) =>
        r.raw(ws, JSON.stringify({ t: 'serpent', k: 'site', d: DAY, sx: SITE.sx, sz: SITE.sz, pl: SITE.place }));
      const told = (ws) =>
        ws.sent
          .map((x) => (typeof x === 'string' ? JSON.parse(x) : x))
          .filter((m) => m.t === 'serpent' && m.k === 'at');
      const a = await join('a');
      const sweepAt = r.alarm.at;
      assert.equal(sweepAt, clock - 10 + ACCOUNT_SWEEP_MS, 'the sweep alarm, untouched');
      await site(a);
      assert.deepEqual(r.store.get('serpentsite'), { d: DAY, c: [[SITE.sx, SITE.sz, SITE.place, ['acct-a']]] });
      assert.deepEqual(told(a), [], 'one account: nothing told');
      const b = await join('b');
      await site(b);
      const word = { t: 'serpent', k: 'at', d: DAY, sx: SITE.sx, sz: SITE.sz, pl: SITE.place };
      assert.deepEqual(serpentAtWord(r.store.get('serpentsite'), clock), word);
      assert.deepEqual(told(a), [word], 'two agree: every game online told');
      assert.equal(r.alarm.at, sweepAt, 'a site word arms nothing');
    });
    const cell = fakeRoom('world:6,9');
    const ws = cell.connect();
    await cell.hello(
      ws,
      'peer-x',
      { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
      { acct: 'acct-x', asecret: 'secret-of-acct-x' },
    );
    await quiet(() => cell.raw(ws, JSON.stringify({ t: 'serpent', k: 'site', d: DAY, sx: 1, sz: 1, pl: 'Sentinel' })));
    assert.equal(ws.meters.junk, 1, 'a cell takes no site');
    assert.equal(cell.store.has('serpentsite'), false);
  } finally {
    Date.now = realNow;
  }
});

// ═══ THE CLIENT ══════════════════════════════════════════════════════════════════════════════════════════════════

test("serpent site client: the game says where it found the serpent to the hub - once a socket and day, a reconnect says it again; its point to the whole unit and its port as the wire's law leaves it; never without an account, or when the send fails (mutants: said every frame; the place sent raw)", () => {
  const link = (v = RELAY_VERSION, acct = 'acct-me') => {
    const { FakeWS, sockets } = fakeSocketClass();
    const o = new OnlineSession({
      url: 'wss://relay.test',
      name: 'Mac',
      id: 'peer-me',
      secret: 'secret-of-peer-me',
      WebSocketImpl: FakeWS,
      now: () => 1e6,
      presence: false,
      acct,
      asecret: 'secret-of-acct-me',
    });
    o.join(SOCIAL_ROOM, null);
    const ws = sockets[0];
    ws.open();
    ws.receive({ t: 'welcome', id: 'peer-me', peers: [], n: 1, v });
    const sites = () => ws.sent.map((x) => JSON.parse(x)).filter((m) => m.t === 'serpent' && m.k === 'site');
    return { o, ws, sites, sockets };
  };
  const { o, sites, ws } = link();
  assert.equal(o.sendSerpentSite(DAY, 81_000.4, -42_000.6, 'St. Olms*'), true);
  assert.deepEqual(
    sites(),
    [{ t: 'serpent', k: 'site', d: DAY, sx: 81_000, sz: -42_001, pl: 'St Olms' }],
    "its point to the whole unit, the port as the wire's law leaves it",
  );
  assert.equal(o.sendSerpentSite(DAY, 81_000, -42_000, 'Sentinel'), true, 'said already');
  assert.equal(sites().length, 1, 'once a socket and day');
  assert.equal(o.sendSerpentSite(DAY + 2, 5, 6, 'Wayrest'), true);
  assert.equal(sites().length, 2, 'the next serpent');
  o._ws = {
    send: () => {
      throw new Error('gone');
    },
  };
  assert.equal(o.sendSerpentSite(DAY + 4, 5, 6, 'Wayrest'), false, 'a send that fails is said again');
  o._ws = ws;
  assert.equal(link(RELAY_VERSION, null).o.sendSerpentSite(DAY, 1, 1, 'Wayrest'), false, 'no account, no word');
  const off = link();
  assert.equal(off.o.sendSerpentSite(DAY, POSE_BOUND * 2, 1, 'Wayrest'), false, 'off the world');
  assert.equal(off.o.sendSerpentSite(DAY, POSE_BOUND * 2, 1, 'Wayrest'), true, 'and asked no more that day');
  assert.equal(off.o.sendSerpentSite(DAY + 2, NaN, 1, 'Wayrest'), false, 'no point');
  assert.equal(off.sites().length, 0);
});

test("serpent site client: the omen finds the site AHEAD of the bells (from its quiet on, once it is settled) - the one the omen will name, asked once a day; the scene says it to the hub on the serpent's frame (mutants: ahead before the omen settles; another day's site; said only from the bells)", () => {
  let clock = T.omenAt - 3600_000,
    ready = false,
    asked = 0;
  const site = (day) => {
    asked++;
    return {
      day,
      sx: SITE.sx,
      sz: SITE.sz,
      near: 'Sentinel',
      place: "Sentinel, Alik'r Desert",
      ring: { cx: 0, cy: 0, r: 3 },
    };
  };
  const omen = createSerpentOmen({ now: () => clock, site, say: () => {}, ready: () => ready, settleMs: 1000 });
  omen.frame();
  assert.equal(omen.ahead(), null, 'not ready: nothing');
  ready = true;
  omen.frame();
  assert.equal(omen.ahead(), null, 'settling');
  clock += 1000;
  omen.frame();
  assert.equal(omen.current().phase, 'quiet');
  const a = omen.ahead();
  assert.equal(a.day, DAY);
  assert.equal(a.site.near, 'Sentinel');
  omen.ahead();
  clock = T.omenAt;
  omen.frame();
  assert.equal(asked, 1, "the omen's own site, found once");
  clock = T.soundAt + SERPENT_DIVE_MS;
  omen.frame();
  assert.equal(omen.ahead().day, DAY + 2, 'the next serpent once this one is gone');
  const none = createSerpentOmen({ now: () => clock, site: () => null, say: () => {} });
  none.frame();
  assert.equal(none.ahead(), null, 'no site found: nothing said');
});

// ═══ THE TIMERS WINDOW ═══════════════════════════════════════════════════════════════════════════════════════════

test("serpent site timers: the serpent's row through its day - its rising counted down (the port named from its bells on), its hunt to its dive (SERPENT4: to the storm once, then its closed waters to the dive), and the next serpent beside it once this one is under way; a kill ends it early (mutants: the place named before the bells; the hunt counting to the storm; no next row)", () => {
  const rowsAt = (now, serpent = null) => eventTimerRows({ now, serpent }).filter((r) => r.kind === 'serpent');
  const src = { place: 'Sentinel', fellAt: () => null };
  const q = rowsAt(T.omenAt - 60_000, src);
  assert.deepEqual(
    q,
    [
      {
        id: `serpent:${DAY}`,
        kind: 'serpent',
        title: 'Sethrakul rises',
        where: null,
        detail: 'The harbor bells ring 15 minutes before',
        live: false,
        at: T.riseAt,
        until: null,
      },
    ],
    'quiet: the rising alone, nowhere named',
  );
  const o = rowsAt(T.omenAt + 1000, src);
  assert.deepEqual(o[0], {
    id: `serpent:${DAY}`,
    kind: 'serpent',
    title: 'Sethrakul rises',
    where: 'Off Sentinel',
    detail: 'The harbor bells are ringing. Its waters are circled on your map',
    live: false,
    at: T.riseAt,
    until: null,
  });
  const N = serpentTimes(DAY + 2);
  assert.deepEqual(o[1], {
    id: `serpent:${DAY + 2}`,
    kind: 'serpent',
    title: 'Next sea serpent rises',
    where: null,
    detail: null,
    live: false,
    at: N.riseAt,
    until: null,
  });
  for (const at of [T.riseAt + 1, T.riseAt + SERPENT_SURFACE_MS + 1]) {
    const h = rowsAt(at, src);
    assert.equal(h[0].live, true);
    assert.equal(h[0].title, 'Sethrakul hunts');
    assert.equal(h[0].until, T.soundAt);
    assert.equal(h[0].where, 'Off Sentinel');
  }
  const l = rowsAt(T.sealAt + 1, src);
  assert.equal(l[0].title, 'Sethrakul hunts');
  assert.equal(l[0].until, T.soundAt);
  assert.equal(l[0].detail, 'It dives when this runs out. Sail out to join the hunt');
  assert.deepEqual(
    rowsAt(T.soundAt + 1, src).map((r) => r.title),
    ['Next sea serpent rises'],
    'sounding: the next alone',
  );
  const fellAt = T.riseAt + 5 * 60_000;
  assert.equal(serpentPhase(T, fellAt + 1, fellAt), 'slain');
  assert.deepEqual(
    rowsAt(fellAt + 1, { place: 'Sentinel', fellAt: (d) => (d === DAY ? fellAt : null) }).map((r) => r.title),
    ['Next sea serpent rises'],
    'slain: its row ends',
  );
  assert.equal(rowsAt(T.omenAt + 1000)[0].where, null, 'no host: nowhere named');
  assert.deepEqual(
    rowsAt(T.soundAt + SERPENT_DIVE_MS).map((r) => [r.id, r.title, r.at]),
    [[`serpent:${DAY + 2}`, 'Sethrakul rises', N.riseAt]],
    'gone: the clock is about the next',
  );
  // its kind in the window: after the gate's, in its waters' own colour, named in the button
  assert.deepEqual(TIMER_KINDS.slice(0, 2), ['gate', 'serpent']);
  assert.ok(ENHANCED_CSS.includes(`.px-timerswin .tm-serpent { --tm-kind: ${SERPENT_RING_MAP_CSS}; }`));
});
