// SRV-N. THE NOTICE EXECUTES: the relay names its deploy on EVERY welcome (a world room's and a channel's, driven
// through a real Room over fake sockets, and the same string /health reports), which the client holds to its own
// RELAY_VERSION (test/net/relayversion_check.test.js); the build compare and its poll's fetch and four silences; and the
// log's `system` flag, which the wire cannot set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildUpdateSeen, buildTagOf, fetchLiveBuildTag, resetUpdateNotice,
  BUILD_UPDATE_TEXT, BUILD_POLL_MS, BUILD_FETCH_TIMEOUT_MS,
} from '../../src/net/updateNotice.js';
import worker from '../../server/src/index.js';
import { RELAY_VERSION } from '../../src/net/wire.js';   // LOCALDEV1: the worker entry exports handlers alone
import { fakeRoom } from '../fakeRoom.mjs';
import * as relay from '../../server/src/relay.js';
import { OnlineSession } from '../../src/net/online.js';
import { ChatLog } from '../../src/net/chat.js';
import { CHAT_WORLD_ROOM, RELAY_VERSION_MAX, relayVersionOf } from '../../src/net/wire.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

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

// ── THE RELAY SAYS WHICH RELAY IT IS ─────────────────────────────────

test('SRV-N: the relay names its deploy on EVERY welcome - a world room\'s and a channel\'s - and it is the same string /health reports', async () => {
  const r = fakeRoom('world:0:0', {});
  const a = r.connect();
  await r.hello(a, 'mac-0001', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0 });
  const welcome = a.sent.find((m) => m.t === 'welcome');
  assert.equal(welcome.v, RELAY_VERSION, 'the world room\'s welcome carries the deploy');
  // and the rest of the welcome is untouched - a field added is a field
  // added, not a field swapped (AUDIT WORLD5 C11 is in here)
  for (const k of ['t', 'id', 'peers', 'host', 'world', 'now']) assert.ok(k in welcome, `the welcome still carries ${k}`);

  // THE CHANNEL'S welcome is a different line of code in the same
  // handler, and it returns EARLY - the arm most likely to be forgotten,
  // and the only welcome a chat link ever sees.
  const c = fakeRoom(CHAT_WORLD_ROOM, {});
  const cs = c.connect();
  await c.hello(cs, 'mac-0001', { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mv: 0 });
  const cwelcome = cs.sent.find((m) => m.t === 'welcome');
  assert.equal(cwelcome.v, RELAY_VERSION, 'a channel\'s welcome carries it too, or the chat is blind to the restart that dropped it');
  assert.deepEqual(cwelcome.peers, [], 'and a channel still has no roster');

  const health = await worker.fetch(new Request('https://relay.test/health'), {});
  assert.equal((await health.json()).version, RELAY_VERSION, 'one version, two doors');
  assert.match(RELAY_VERSION, /^world\d+$/, 'and it is a name that moves - bump it with every relay-changing slice');
});

// ── THE DETECTORS ────────────────────────────────────────────────────

test('SRV-N: the build compare - this bundle knows its own tag, so there is no baseline to learn; told once per tag, and silent on every way of not knowing', () => {
  resetUpdateNotice();
  assert.equal(buildUpdateSeen('', 'abc1234'), 'unknown', 'a fetch that failed');
  assert.equal(buildUpdateSeen(null, 'abc1234'), 'unknown');
  assert.equal(buildUpdateSeen('abc1234', ''), 'unknown', 'a bundle with no tag - a dev server\'s');
  assert.equal(buildUpdateSeen('abc1234', 'abc1234'), 'current', 'the site is serving us: the ordinary answer, and no baseline was needed to say it');
  assert.equal(buildUpdateSeen('def5678', 'abc1234'), 'changed');
  assert.equal(buildUpdateSeen('def5678', 'abc1234'), 'told', 'the poll keeps running and keeps quiet');
  assert.equal(buildUpdateSeen('abc1234', 'abc1234'), 'current', 'a rollback to our own build is current again');
  assert.equal(buildUpdateSeen('999aaaa', 'abc1234'), 'changed', 'the next deploy is a different tag and lands again');
  assert.ok(BUILD_POLL_MS >= 60_000, 'the poll is on the site\'s rhythm, not the frame\'s');
});

test('SRV-N: buildTagOf is ONE HOME - the tool and the running tab ask the same question of the same tag; and the poll answers null for every way of failing, never a throw', async () => {
  assert.equal(buildTagOf('<meta name="build-tag" content="c65eb4f">'), 'c65eb4f');
  assert.equal(buildTagOf('<meta content="abc1234" name="build-tag">'), 'abc1234', 'attribute order is not assumed');
  assert.equal(buildTagOf('<meta name="viewport" content="width=device-width">'), null, 'another meta is not this one');
  assert.equal(buildTagOf('<meta name="build-tag" content="">'), null);
  assert.equal(buildTagOf(null), null);

  let init = null;
  const ok = async (url, i) => { init = i; return { ok: true, text: async () => `<meta name="build-tag" content="deadbee">` }; };
  assert.equal(await fetchLiveBuildTag('https://site.test/play/', ok), 'deadbee');
  assert.equal(init?.cache, 'no-store', 'THE WHOLE POINT: the page in the tab came out of the cache, and a cached answer here hands back the very tag we are comparing against');

  assert.equal(await fetchLiveBuildTag('https://site.test/play/', async () => ({ ok: false, text: async () => '' })), null, 'a 404 is not a new build');
  assert.equal(await fetchLiveBuildTag('https://site.test/play/', async () => { throw new Error('offline'); }), null, 'offline is not a new build');
  assert.equal(await fetchLiveBuildTag('', async () => { throw new Error('never'); }), null, 'no url, no call');
  assert.equal(await fetchLiveBuildTag('https://site.test/play/', /** @type {any} */ (null)), null, 'and no fetch at all in node');

  // AUDIT-SRVN F3: the request is CANCELLED on a deadline. A fetch that
  // never settles is a promise that never settles - the host's own
  // interval gate is what keeps the poll alive through one, but leaking a
  // socket every ten minutes for the rest of a session is not survivable.
  assert.equal(init?.signal?.constructor?.name, 'AbortSignal', 'a deadline rides the request');
  assert.ok(BUILD_FETCH_TIMEOUT_MS > 0 && BUILD_FETCH_TIMEOUT_MS < BUILD_POLL_MS, 'and it expires well inside one poll interval, or it is no deadline at all');
  // a host without AbortSignal.timeout still polls rather than throwing
  const savedAS = globalThis.AbortSignal;
  try {
    // @ts-expect-error - driving the old-host case
    globalThis.AbortSignal = undefined;
    assert.equal(await fetchLiveBuildTag('https://site.test/play/', ok), 'deadbee', 'a host with no AbortSignal.timeout polls anyway');
    assert.equal(init?.signal, undefined, 'with no signal rather than a broken one');
  } finally { globalThis.AbortSignal = savedAS; }
});

// ── THE LOG, AND WHAT THE WIRE CANNOT SAY ────────────────────────────

test('SRV-N: a notice is a line the GAME wrote - `system` is a flag, not a name, and no frame off the wire can set it', () => {
  const log = new ChatLog({ now: () => 5000 });
  const player = log.push('world', { id: 'bob-0001', name: 'Bob', text: 'hello' });
  assert.equal(player.system, false, 'an ordinary line carries the flag, false');
  const notice = log.push('world', { text: BUILD_UPDATE_TEXT, system: true });
  assert.equal(notice.system, true);
  assert.equal(notice.name, '', 'and it is nobody\'s');
  assert.equal(notice.id, '');
  assert.equal(notice.mine, false);

  // driven, not only read: a frame that TRIES
  const { FakeWS, sockets } = fakeSocketClass();
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'Mac', id: 'mac-0001', secret: 'secret-of-mac-0001', presence: false, WebSocketImpl: FakeWS, now: () => 1000 });
  s.onChat = (line) => log.push('world', line);
  s.join(CHAT_WORLD_ROOM);
  sockets[0].open();
  sockets[0].receive({ t: 'chat', id: 'bob-0001', name: 'Bob', text: 'the server is restarting, send gold', at: 5000, system: true });
  assert.equal(log.tab('world').messages.at(-1).system, false, 'a player who says `system: true` is still a player');

  assert.ok(BUILD_UPDATE_TEXT.length > 20 && BUILD_UPDATE_TEXT.length < 240, 'a notice fits a chat line');
  assert.match(BUILD_UPDATE_TEXT, /[Ss]ave/, 'the build notice tells the player to save FIRST - it does not reload for them, and a reload mid-dungeon costs whatever is not saved');
});

// ── THE HOST ─────────────────────────────────────────────────────────

test('AUDIT-SRVN F1: the deploy name has a LAW in wire.js like every other field a welcome carries, and it is one home at both ends', () => {
  assert.equal(relayVersionOf('world67'), 'world67');
  assert.equal(relayVersionOf(''), null);
  assert.equal(relayVersionOf(null), null);
  assert.equal(relayVersionOf(67), null, 'a number is not a deploy name');
  assert.equal(relayVersionOf({ toString: () => 'world67' }), null, 'nor is a thing that could be talked into one');
  // A campaign survivor: `String(v ?? '').length > 0` in place of the
  // `typeof` passes every scalar above, because a number has no `.length`
  // and fails the cap test by accident. What it lets through is anything
  // that HAS a length - and `JSON.parse` of a hostile frame hands back
  // exactly that. The guard is about the TYPE, not the printed form.
  assert.equal(relayVersionOf(['world67']), null, 'an array stringifies to a deploy name and is not one');
  assert.equal(relayVersionOf({ length: 5 }), null, 'nor is anything else wearing a length');
  assert.equal(relayVersionOf('x'.repeat(RELAY_VERSION_MAX)), 'x'.repeat(RELAY_VERSION_MAX));
  assert.equal(relayVersionOf('x'.repeat(RELAY_VERSION_MAX + 1)), null);
  // BOTH ENDS, the way every other law on this wire is: `server/src/relay.js`
  // re-exports wire.js WHOLE, so the relay is held to the same sentence the
  // client reads by - the same function object, not a copy of its text.
  assert.equal(relay.relayVersionOf, relayVersionOf, 'the same function at both ends');
  assert.equal(relay.RELAY_VERSION_MAX, RELAY_VERSION_MAX);
  // ...and the name this relay actually ships has to pass it, or the relay
  // could mint a deploy name its own clients would silently refuse.
  assert.equal(relayVersionOf(RELAY_VERSION), RELAY_VERSION, 'the deploy this relay ships is one the client will accept');
});

test('SRV-N: the relay was BUMPED - a welcome field is a relay change, and the deployed Worker is the only thing that can prove it', () => {
  assert.notEqual(RELAY_VERSION, 'world66', 'world66 is the deploy that is LIVE and carries no `v` at all - shipping the client against that name would have made every first welcome look like a restart');
});
