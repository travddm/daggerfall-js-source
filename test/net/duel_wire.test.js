// DUEL1: THE DUEL ON THE
// WIRE, DRIVEN. The frame's law (net/wire.js validDuelData - every kind, every bound, the cast frame's spell law shared
// and the cast frame itself unchanged by the sharing); the relay over the real Room (routed to the one socket `to`
// names, stamped with the sender's id AND verified account, a place room's alone, its own meter and its own per-sender
// funnel); the card frame carrying the answerer's account the same way; the session (sent only to a relay that routes
// it, gated both ways, delivered only when addressed to me, with the stamp).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import {
  parseClient, validDuelData, validCastData, RELAY_VERSION, DUEL_KINDS, DUEL_WHY,
  DUEL_FRAME_MAX, DUEL_DATA_MAX, DUEL_HZ_MAX, DUEL_IN_HZ_MAX,
  DUEL_TEMPLATE_MAX, DUEL_MATERIAL_MAX, DUEL_DMG_MAX, DUEL_SEQ_MAX, DUEL_SWINGS,
  CAST_HZ_MAX, DROP_STRIKES_MAX, POSE_BOUND,
} from '../../src/net/wire.js';
import { OnlineSession } from '../../src/net/online.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { fakeSocketClass } from '../fakeSocket.mjs';
import { HEAL_SPELL } from '../placeWidest.mjs';
const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const quiet = (fn) => { const info = console.info, warn = console.warn; console.info = () => {}; console.warn = () => {}; try { return fn(); } finally { console.info = info; console.warn = warn; } };
const P = [100000, 10.5, 200000];
const FIRE = { name: 'Fire Bolt', element: 0, rangeType: 2, icon: 3, effects: [{ type: 4, subType: 0, magnitudeBaseLow: 5, magnitudeBaseHigh: 10 }] };
const S = 'abc123def0';

test('DUEL1 wire: every kind carries exactly its own fields - ask/yes/no the id alone, start the ring\'s centre, cancel an optional reason and end a required one; INT8: a strike and a spell the striker\'s own number for the referee (never a sheet for the defender), no result; anything outside refuses the whole frame (mutants: a strike\'s number unbounded; an end with no reason; a bound off by one; a result admitted)', () => {
  // damage, a spell the spell record and a level, and the defender answered with a `result` - THE DEFENDER RESOLVED
  // EVERY BLOW. The relay referees them now (net/duel/duelRef.js): a strike and a spell carry the number the striker's own
  // game rolled (`d`), which the referee clips; a sheet rides nowhere, and the result is gone.
  const ok = (d) => { const v = validDuelData({ to: 'peer-0002', s: S, ...d }); assert.ok(v, JSON.stringify(d)); return v; };
  const no = (d) => assert.equal(validDuelData({ to: 'peer-0002', s: S, ...d }), null, JSON.stringify(d));
  assert.deepEqual(DUEL_KINDS, ['ask', 'yes', 'no', 'start', 'cancel', 'strike', 'spell', 'end']);
  for (const k of ['ask', 'yes', 'no']) assert.deepEqual(ok({ k, extra: 1 }), { to: 'peer-0002', k, s: S }, 'the id alone - an extra field is dropped');
  assert.deepEqual(ok({ k: 'start', c: P }), { to: 'peer-0002', k: 'start', s: S, c: P });
  for (const c of [[1, 2], [-POSE_BOUND - 1, 0, 0], [POSE_BOUND + 1, 0, 0], [0, 2e5, 0], [0, NaN, 0], null]) no({ k: 'start', c });
  assert.deepEqual(ok({ k: 'cancel' }), { to: 'peer-0002', k: 'cancel', s: S });
  for (const why of DUEL_WHY) { ok({ k: 'cancel', why }); ok({ k: 'end', why }); }
  no({ k: 'end' });
  no({ k: 'cancel', why: 'bored' });
  const strike = ok({ k: 'strike', n: 1, by: 'melee', p: P, d: 14, a: { lv: 30 }, w: { t: 116, m: 3, c: 88 }, sw: 'StrikeDown', at: 900 });
  assert.deepEqual(strike, { to: 'peer-0002', k: 'strike', s: S, n: 1, by: 'melee', p: P, d: 14, w: { t: 116, m: 3, c: 88 }, sw: 'StrikeDown', at: 900 }, 'the number, never a sheet');
  ok({ k: 'strike', n: 1, by: 'arrow', p: P, d: 0 });
  for (const bad of [
    { n: 0 }, { n: DUEL_SEQ_MAX + 1 }, { by: 'kick' }, { p: [1, 2] }, { d: -1 }, { d: DUEL_DMG_MAX + 1 }, { d: 1.5 }, { d: undefined },
    { w: { t: DUEL_TEMPLATE_MAX + 1, m: 0, c: 50 } }, { w: { t: 1, m: DUEL_MATERIAL_MAX + 1, c: 50 } }, { w: { t: 1, m: 0, c: 101 } },
    { sw: 'Hug' }, { at: -1 },
  ]) no({ k: 'strike', n: 1, by: 'melee', p: P, d: 14, ...bad });
  for (const sw of DUEL_SWINGS) ok({ k: 'strike', n: 1, by: 'melee', p: P, d: 3, sw });
  assert.deepEqual(ok({ k: 'spell', n: 2, p: P, d: 40, level: 12, spell: FIRE }), { to: 'peer-0002', k: 'spell', s: S, n: 2, p: P, d: 40 }, 'the harm the caster counted, never the record');
  for (const bad of [{ d: -1 }, { d: DUEL_DMG_MAX + 1 }, { d: undefined }, { n: 0 }, { p: null }]) no({ k: 'spell', n: 2, p: P, d: 40, ...bad });
  no({ k: 'result', n: 3, hit: 1, dmg: 12, h: [60, 90] });
  assert.equal(validDuelData({ to: 'peer-0002', s: 'x', k: 'ask' }), null, 'the id is the trade\'s alphabet and length');
  assert.equal(validDuelData({ to: 'p', s: S, k: 'ask' }), null);
  assert.equal(validDuelData({ to: 'peer-0002', s: S, k: 'hug' }), null);
  // the widest honest frame fits the relay's door
  const frame = JSON.stringify({ t: 'duel', data: validDuelData({ to: 'x'.repeat(40), s: 'Z'.repeat(16), k: 'strike', n: DUEL_SEQ_MAX, by: 'arrow', p: [POSE_BOUND, -99999.999, POSE_BOUND], d: DUEL_DMG_MAX, w: { t: DUEL_TEMPLATE_MAX, m: DUEL_MATERIAL_MAX, c: 100 }, sw: 'StrikeDownRight', at: 60000 }) });
  assert.ok(frame.length < DUEL_FRAME_MAX && JSON.parse(frame).data, `the widest strike frame fits: ${frame.length} of ${DUEL_FRAME_MAX}`);
  assert.ok(DUEL_DATA_MAX < DUEL_FRAME_MAX);
});

test('DUEL1 the cast frame is exactly what it was: a touch or a ranged single target alone - INT8: the duel\'s spell carries no record now, so nothing of its ranges can leak into the cast frame (mutants: the duel\'s ranges leaking into the cast frame)', () => {
  // is the caster's counted number now (above), and the cast frame stands as it was
  assert.ok(validCastData({ to: 'peer-0002', level: 5, spell: HEAL_SPELL }));
  for (const rangeType of [0, 3, 4]) assert.equal(validCastData({ to: 'peer-0002', level: 5, spell: { ...HEAL_SPELL, rangeType } }), null, `a cast frame at range ${rangeType}`);
});

test('DUEL1 the parser and the version: `duel` is its own arm (after the hello, under its own door) (mutants: the frame parsed before the hello)', () => {
  const d = { to: 'peer-0002', s: S, k: 'ask' };
  assert.deepEqual(parseClient(JSON.stringify({ t: 'duel', data: d }), { hasHello: true }), { t: 'duel', data: d });
  assert.deepEqual(parseClient(JSON.stringify({ t: 'duel', data: d })), { error: 'duel before hello' });
  assert.deepEqual(parseClient(JSON.stringify({ t: 'duel', data: { ...d, k: 'x' } }), { hasHello: true }), { error: 'bad duel' });
  assert.equal(RELAY_VERSION, 'world283');
  assert.equal(DUEL_IN_HZ_MAX, DUEL_HZ_MAX * 2);
});

// ─── THE RELAY ──────────────────────────────────────────────────────────────────────────────────────────────────

async function withRoom(key, fn) {
  const r = fakeRoom(key);
  const realNow = Date.now; let clock = 1e12; Date.now = () => clock;
  try { await fn({ r, tick: (ms = 1000) => { clock += ms; } }); } finally { Date.now = realNow; }
}
const duels = (ws) => ws.sent.filter((m) => m.t === 'duel');

test('DUEL1 relay: a duel frame reaches the one player it names, stamped with the sender\'s id AND the account its token verified - never the frame\'s word; nobody else hears it; a channel is nowhere to duel; a frame at myself is junk; a peer gone is nothing; and a card answer carries the answerer\'s account the same way (mutants: the frame fanned; the account missing; the account read off the frame)', () => withRoom('world:3,12', async ({ r }) => {
  const a = r.connect(); await r.hello(a, 'peer-0001');
  const b = r.connect(); await r.hello(b, 'peer-0002');
  const c = r.connect(); await r.hello(c, 'peer-0003');
  for (const ws of [a, b, c]) ws.sent.length = 0;
  await r.raw(a, JSON.stringify({ t: 'duel', data: { to: 'peer-0002', s: S, k: 'ask', sub: 'acct-forged' } }));
  assert.deepEqual(duels(b), [{ t: 'duel', id: 'peer-0001', sub: 'acct-peer-0001', data: { to: 'peer-0002', s: S, k: 'ask' } }]);
  assert.equal(duels(a).length + duels(c).length, 0);
  await r.raw(a, JSON.stringify({ t: 'duel', data: { to: 'peer-0001', s: S, k: 'ask' } }));
  assert.equal(a.meters.junk, 1, 'a duel at my own id is junk');
  await r.raw(b, JSON.stringify({ t: 'duel', data: { to: 'peer-0099', s: S, k: 'ask' } }));
  assert.equal(b.meters.junk ?? 0, 0, 'a leave races a frame - not junk');
  // the card: the answerer's account beside its id
  b.sent.length = 0;
  const card = { level: 5, attrs: [50, 50, 50, 50, 50, 50, 50, 50], vitals: [50, 50, 50], look: { race: 'Nord', gender: 'male', faceIndex: 0, items: [] } };
  await r.raw(a, JSON.stringify({ t: 'card', data: { to: 'peer-0002', card } }));
  assert.equal(b.sent.find((m) => m.t === 'card')?.sub, 'acct-peer-0001');
}).then(() => withRoom('chat:world', async ({ r }) => {
  const a = r.connect(); await r.hello(a, 'peer-0001');
  const b = r.connect(); await r.hello(b, 'peer-0002');
  b.sent.length = 0;
  await r.raw(a, JSON.stringify({ t: 'duel', data: { to: 'peer-0002', s: S, k: 'ask' } }));
  assert.equal(duels(b).length, 0, 'a channel is nowhere to duel');
})));

test('DUEL1 relay: the duel\'s meter is its own (DUEL_HZ_MAX a second, struck out in its own words) and so is its funnel onto a destination, per sender at the duel\'s rate - a duellist\'s frames never wait on the casts or cards their sender spent there (mutants: the cast funnel shared; the meter unstruck)', () => withRoom('world:3,12', async ({ r, tick }) => {
  // funnel onto a destination is driven with a routed kind (a refusal), and a strike still spends the sender's meter
  const me = r.connect(); await r.hello(me, 'peer-0001');
  const s = r.connect(); await r.hello(s, 'peer-0002');
  tick(5000);
  me.sent.length = 0;
  const cast = JSON.stringify({ t: 'cast', data: { to: 'peer-0001', level: 5, spell: HEAL_SPELL } });
  for (let k = 0; k < CAST_HZ_MAX; k++) await r.raw(s, cast);
  const blow = () => JSON.stringify({ t: 'duel', data: { to: 'peer-0001', s: S, k: 'no' } });
  for (let n = 1; n <= DUEL_HZ_MAX; n++) await r.raw(s, blow());
  assert.equal(duels(me).length, DUEL_HZ_MAX, 'the cast funnel spent, the duel\'s own full');
  assert.ok(Array.isArray(me.meters.duin) && me.meters.duin.length === 1, 'the duel\'s slots are their own list');
  tick(5000);
  me.sent.length = 0;
  for (let k = 0; k < DUEL_HZ_MAX + DROP_STRIKES_MAX; k++) await r.raw(s, blow());
  assert.equal(s.closed, null);
  assert.equal(s.meters.duelDrops, DROP_STRIKES_MAX);
  assert.equal(duels(me).length, DUEL_HZ_MAX);
  await r.raw(s, blow());
  assert.equal(s.closed?.reason, 'too many duel frames');
}));

// ─── THE SESSION ────────────────────────────────────────────────────────────────────────────────────────────────

function linkRig() {
  const { FakeWS, sockets } = fakeSocketClass();
  let t = 1000;
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'a', id: 'aaaa-0001', secret: 'secret-of-aaaa-0001', WebSocketImpl: FakeWS, now: () => t });
  const got = []; s.onDuel = (id, d, sub) => got.push({ id, d, sub });
  const cards = []; s.onCard = (id, d, sub) => cards.push({ id, sub });
  quiet(() => s.join('world:3,12', { x: 1, y: 0, z: 1, yaw: 0 }));
  const ws = sockets[0]; ws.open();
  quiet(() => ws.receive({ t: 'welcome', id: 'aaaa-0001', peers: [{ id: 'peer-0002', name: 'Bran', p: { x: 2, y: 0, z: 1, yaw: 0 } }], host: 'aaaa-0001', world: null, v: RELAY_VERSION }));
  const out = () => ws.sent.map((x) => JSON.parse(x)).filter((x) => x.t === 'duel');
  return { s, ws, got, cards, out, tick: (ms) => { t += ms; } };
}

test('DUEL1 session: a duel frame goes through the wire\'s projection, to a peer some socket reports, DUEL_HZ_MAX a second; one in is delivered only when a peer\'s and addressed to me, with the relay\'s account stamp, DUEL_IN_HZ_MAX a second per sender; a card answer hands its stamp on too (mutants: the stamp lost; a frame at someone else delivered)', () => {
  const { s, ws, got, cards, out, tick } = linkRig();
  assert.equal(s.sendDuel({ to: 'peer-0002', s: S, k: 'ask' }), true);
  assert.deepEqual(out().at(-1), { t: 'duel', data: { to: 'peer-0002', s: S, k: 'ask' } });
  assert.equal(s.sendDuel({ to: 'aaaa-0001', s: S, k: 'ask' }), false, 'never at myself');
  assert.equal(s.sendDuel({ to: 'peer-0009', s: S, k: 'ask' }), false, 'nobody reports peer-0009');
  assert.equal(s.sendDuel({ to: 'peer-0002', s: S, k: 'strike', n: 1, by: 'melee', p: P, d: 5, a: { lv: 30 } }), true, 'INT8: the projection keeps the number for the referee, and drops a sheet');
  assert.deepEqual([out().at(-1).data.d, out().at(-1).data.a], [5, undefined]);
  for (let i = 2; i < DUEL_HZ_MAX; i++) assert.equal(s.sendDuel({ to: 'peer-0002', s: S, k: 'yes' }), true);
  assert.equal(s.sendDuel({ to: 'peer-0002', s: S, k: 'yes' }), false, 'DUEL_HZ_MAX a second');
  tick(1000);
  assert.equal(s.sendDuel({ to: 'peer-0002', s: S, k: 'yes' }), true);
  ws.receive({ t: 'duel', id: 'peer-0002', sub: 'acct-bran', data: { to: 'aaaa-0001', s: S, k: 'ask' } });
  ws.receive({ t: 'duel', id: 'peer-0002', sub: 'acct-bran', data: { to: 'peer-0003', s: S, k: 'ask' } });
  ws.receive({ t: 'duel', id: 'aaaa-0001', data: { to: 'aaaa-0001', s: S, k: 'ask' } });
  ws.receive({ t: 'duel', id: 'peer-0002', data: { to: 'aaaa-0001', s: S, k: 'hug' } });
  assert.deepEqual(got.map((x) => [x.id, x.d.k, x.sub]), [['peer-0002', 'ask', 'acct-bran']]);
  ws.receive({ t: 'duel', id: 'peer-0002', data: { to: 'aaaa-0001', s: S, k: 'no' } });
  assert.equal(got.at(-1).sub, null, 'no stamp: null, never a guess');
  for (let i = 0; i < DUEL_IN_HZ_MAX + 4; i++) quiet(() => ws.receive({ t: 'duel', id: 'peer-0002', data: { to: 'aaaa-0001', s: S, k: 'no' } }));
  assert.ok(got.length <= DUEL_IN_HZ_MAX, 'the inbound gate per sender');
  ws.receive({ t: 'card', id: 'peer-0002', sub: 'acct-bran', data: { to: 'aaaa-0001', ask: true } });
  assert.deepEqual(cards.at(-1), { id: 'peer-0002', sub: 'acct-bran' }, 'the card answer\'s stamp goes on to the host');
});
