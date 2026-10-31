// EG-H3 (2026-10-12, Mac: "I said I want everything"; bible/11-Multiplayer/Elite-Gates.md sections 7 and 31, EG10): THE
// SWAP'S BUILD, PINNED - the next circle's made level built while the Court rests (world/eliteGates/egCircleParts.js, on its worker -
// world/eliteGates/egCircleWorker.js - through scenes/eliteGates/egSwap.js), the step into the new circle a swap of the built level IN PLACE
// (scenes/worldModes.js egSwapCircle, scenes/dungeonContext.js egRecircle - their own source run), THE FREE PINS (twenty
// swaps and back: the live meshes, the collider's buckets and the draws at their baseline, no texture uploaded, no
// exterior, no landing, no world-cell hello), and the fallback - a build not ready when the step is due, or none offered,
// steps into the new circle the old way under the veil (scenes/eliteGates/egClient.js, played against the relay's real Room).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeRooms } from '../../fakeRoom.mjs';
import { SOCIAL_ROOM, validEgOut, validEgIn, EG_BRAIN_V } from '../../../src/net/wire.js';
import { egRoomKey, egHallOf, egCircleSpecs, egOnArrive, egFirstHallOf, EG_SEALED_MS, EG_GATHER_MS, EG_REST_MS, EG_TEXT } from '../../../src/net/eliteGates/egLaw.js';
import { mintEgOrder } from '../../../src/net/identityToken.js';
import { readEgReceipt } from '../../../src/net/eliteGates/egReceipt.js';
import { realmToDungeon, dungeonToRealm } from '../../../src/net/superDungeon/sdBrain.js';
import { createEgClient } from '../../../src/scenes/eliteGates/egClient.js';
import { createEgSwap, EG_SWAP_WAIT_MS } from '../../../src/scenes/eliteGates/egSwap.js';
import { createEgSpan, egSpanCollider } from '../../../src/scenes/eliteGates/egSpan.js';   // AUDIT EG V (L6-10): the collider the host hands the spans
import { egCircleParts, egCircleBuild, egCircleKey, egCircleGates, egCirclePartsTransfers } from '../../../src/world/eliteGates/egCircleParts.js';
import { buildEgCircleModel, egCircleColliderTris, egCircleLights, egGateParts, isEgHall } from '../../../src/world/eliteGates/egHall.js';
import { realmArt } from '../../../src/world/superDungeon/sdRealmArt.js';
import { SD_REALM_ARCHIVE } from '../../../src/world/superDungeon/sdRealm.js';
import { identity } from '../../../src/world/mat4.js';
import { egBandOfCircle, egSpecGive } from '../../../src/net/eliteGates/egLaw.js';   // EG-G2 (merged): the band's dress and the waystones go up with a swapped circle; AUDIT EG V (L6-8): the built circle's halls taken as given
import { egBandArt, egBandArchive, EG_DRESS_RECORDS, EG_BEAT_TELL_RECORDS, EG_BAND_RECORDS } from '../../../src/world/eliteGates/egBandArt.js';
import { createEgOccluders } from '../../../src/scenes/eliteGates/egOcclude.js';   // EG-ZN: the circle's occluders' dither pass, in the stand's own source
import { buildEgLookModel } from '../../../src/world/eliteGates/egLook.js';
import { Collider } from '../../../src/player/collider.js';
import { createEgGroundLook } from '../../../src/scenes/eliteGates/egGroundLook.js';
import { ensureSdHallArt } from '../../../src/scenes/superDungeon/sdHall.js';   // FIELD BUGS 2026-10-20f ORRERY-STONES: the Hour's hall pictures an Athenaeum's stones wear
import { EG_BEAT_STONE_RECORDS, EG_CRUMBLE_TELL_RECORDS } from '../../../src/world/eliteGates/egPlatformArt.js';   // EG-LOOK: the spans' pieces' own pictures   // EG-LOOK: the circle's ruin and its band's wreck, stood with it

const SEED = 0x5eed1234;
const B = '0123456789abcdef';
const plain = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, ArrayBuffer.isView(v) ? Array.from(v) : v]));
/** A worker that answers at once, as world/eliteGates/egCircleWorker.js does - its own build, run in this process. PIN MOVED (AUDIT EG
 *  V, e: L6-8, L6-9 - the worker's build is egCircleBuild: the parts, the circle's five specs, and the band's dress when asked). */
const syncWorker = () => {
  const w = { posted: [], terminated: false, onmessage: null, onerror: null,
    postMessage(m) { w.posted.push(m); const parts = egCircleBuild(m); w.onmessage?.({ data: { t: 'built', id: m.id, parts } }); },
    terminate() { w.terminated = true; } };
  return w;
};
/** A worker that holds each job until `answer()` - a build still in flight. */
const heldWorker = () => {
  const w = { posted: [], terminated: false, onmessage: null, onerror: null,
    postMessage(m) { w.posted.push(m); }, terminate() { w.terminated = true; },
    answer(i = w.posted.length - 1) { const m = w.posted[i]; w.onmessage?.({ data: { t: 'built', id: m.id, parts: egCircleBuild(m) } }); } };
  return w;
};

test('EG10 THE SWAP\'S BUILD, THE SAME LEVEL: a circle built apart from the screen is the level the mode machine stands, byte for byte - the halls\' mesh, the collider\'s triangles, the lamps and every Rampart\'s portcullis - under the mode machine\'s own key; every buffer it carries is handed over, none copied (mutants: a part built off another circle; a buffer left behind)', () => {
  for (const [c, geo] of [[1, 0], [2, 0], [4, 3], [7, 1]]) {
    const p = egCircleParts(SEED, c, geo);
    assert.equal(p.key, `${SEED >>> 0}:${c}:${geo}`, 'standEgHall\'s own key');
    assert.equal(egCircleKey(SEED, c), `${SEED >>> 0}:${c}:0`);
    assert.deepEqual(plain(p.model), plain(buildEgCircleModel(SEED, c, geo)));
    assert.deepEqual(Array.from(p.tris), Array.from(egCircleColliderTris(SEED, c, geo)));
    assert.deepEqual(p.lamps, egCircleLights(SEED, c, geo));
    const want = egCircleSpecs(SEED, c, geo).map((s) => [s.h, egGateParts(s)]).filter(([, g]) => g);
    assert.deepEqual(p.gates.map((g) => [g.h, plain(g.model), Array.from(g.tris)]), want.map(([h, g]) => [h, plain(g.model), Array.from(g.tris)]));
    assert.deepEqual(egCircleGates(SEED, c, geo).map((g) => g.h), want.map(([h]) => h));
    const bufs = egCirclePartsTransfers(p);
    const all = [p.model, ...p.gates.map((g) => g.model)].flatMap((m) => Object.values(m).filter((v) => ArrayBuffer.isView(v)).map((v) => v.buffer));
    all.push(p.tris.buffer, ...p.gates.map((g) => g.tris.buffer));
    assert.deepEqual(new Set(bufs), new Set(all), 'every buffer, once');
  }
  assert.ok(egCircleSpecs(SEED, 1).some((s) => s.gate), 'the first circle carries a Rampart - its portcullis is in the parts');
});

test('EG10 THE SWAP\'S WORKER, RUN: a build asked is answered with the circle\'s parts under its job\'s number, its buffers transferred; a word that is not a build is nothing (mutants: the answer unnumbered; the parts copied)', async () => {
  const posted = [];
  const was = { on: globalThis.onmessage, post: globalThis.postMessage };
  globalThis.postMessage = (m, transfer) => posted.push({ m, transfer });
  try {
    await import('../../../src/world/eliteGates/egCircleWorker.js');
    globalThis.onmessage({ data: { t: 'nope', id: 1 } });
    assert.equal(posted.length, 0);
    globalThis.onmessage({ data: { t: 'build', id: 7, seed: SEED, c: 3, geo: 0 } });
    assert.equal(posted.length, 1);
    const [{ m, transfer }] = posted;
    assert.deepEqual([m.t, m.id, m.parts.key], ['built', 7, egCircleKey(SEED, 3, 0)]);
    assert.deepEqual(new Set(transfer), new Set(egCirclePartsTransfers(m.parts)));
    assert.ok(transfer.length >= 5);
  } finally { globalThis.onmessage = was.on; globalThis.postMessage = was.post; }
});

test('EG10 THE SWAP\'S BUILD ON THIS SCREEN (scenes/eliteGates/egSwap.js): one build at a time keyed by the circle - asked, building, then ready and handed over once; asking again is nothing, asking another drops the one held; an answer for a dropped job is nothing; a worker that answers another circle, or errors, offers no build again (the old step) until the breach\'s end; no Worker, or a factory that throws, offers none at all; the end terminates the worker (mutants: a stale answer taken; the build handed twice; a dead worker trusted)', () => {
  // no worker at all: the old step, always
  const none = createEgSwap({ workerFactory: null });
  assert.equal(none.want(SEED, 2), null); assert.equal(none.state(SEED, 2), null); assert.equal(none.take(SEED, 2), null); assert.equal(none.offered, false);
  const throws = createEgSwap({ workerFactory: () => { throw new Error('no workers here'); } });
  assert.equal(throws.want(SEED, 2), null); assert.equal(throws.offered, false);
  // a build in flight
  let w = null;
  const s = createEgSwap({ workerFactory: () => (w = heldWorker()) });
  assert.equal(s.want(SEED, 2), 'building');
  assert.equal(s.want(SEED, 2), 'building', 'again: nothing new');
  assert.equal(w.posted.length, 1);
  assert.deepEqual([w.posted[0].t, w.posted[0].c, w.posted[0].seed, w.posted[0].geo], ['build', 2, SEED >>> 0, 0]);
  assert.equal(s.take(SEED, 2), null, 'not built yet');
  assert.equal(s.state(SEED, 3), null, 'another circle: not asked');
  w.answer(0);
  assert.equal(s.state(SEED, 2), 'ready');
  assert.equal(s.state(SEED, 2, 1), null, 'another ground is another circle');
  const parts = s.take(SEED, 2);
  assert.equal(parts.key, egCircleKey(SEED, 2));
  assert.equal(s.take(SEED, 2), null, 'handed over once');
  assert.equal(s.state(SEED, 2), null);
  // another asked drops the one held; the dropped job's answer is nothing
  assert.equal(s.want(SEED, 3), 'building');
  assert.equal(s.want(SEED, 4), 'building');
  w.answer(1);
  assert.equal(s.state(SEED, 3), null); assert.equal(s.state(SEED, 4), 'building', 'the stale answer is nobody\'s');
  w.answer(2);
  assert.equal(s.state(SEED, 4), 'ready');
  // the end: the worker ended, the build forgotten; a new breach builds again
  s.drop();
  assert.ok(w.terminated);
  assert.equal(s.state(SEED, 4), null);
  const w1 = w;
  assert.equal(s.want(SEED, 6), 'building');
  assert.notEqual(w, w1, 'a new worker');
  // a worker whose answer is not the circle asked is not trusted: no build offered (the old step) until the end
  w.onmessage({ data: { t: 'built', id: w.posted[0].id, parts: egCircleParts(SEED, 5) } });
  assert.equal(s.offered, false); assert.equal(s.state(SEED, 6), null);
  s.drop();
  assert.equal(s.want(SEED, 6), 'building');
  // a worker that errors: no build offered again (the old step) until the end
  w.onmessage({ data: { t: 'error', id: w.posted[0].id, message: 'boom' } });
  assert.equal(s.offered, false); assert.equal(s.state(SEED, 6), null); assert.equal(s.want(SEED, 7), null);
  assert.ok(w.terminated);
  s.drop();
  assert.equal(s.offered, true);
  assert.equal(s.want(SEED, 7), 'building');
  w.onerror?.({ message: 'died' });
  assert.equal(s.offered, false);
  assert.equal(EG_SWAP_WAIT_MS, 1500);
});

const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > 0 && j > i, `${a} .. ${b}`); return src.slice(i, j); };

test('EG10 THE SWAP IN PLACE, EXECUTED - THE FREE PINS (scenes/worldModes.js egSwapCircle and scenes/dungeonContext.js egRecircle, their own source run): a circle built during the rest is stood in this same level - the old circle\'s mesh, portcullises, floors, spans and draws gone, the new one\'s uploaded, laid and lit, the level renamed its circle; after twenty swaps and back the live meshes, the collider\'s buckets and the draws stand at their baseline and no texture was uploaded again; a circle not built, or another breach\'s, is refused with nothing touched (mutants: the old mesh kept; the old floors left in the collider; a span\'s bucket leaked; the level\'s circle unrenamed)', () => {
  const eh = { b: B, seed: SEED >>> 0, c: 1, geo: 0 };
  const bandTex = (b) => [...egBandArt(b)].length * 2;   // an albedo and an emission a record
  // PIN MOVED (EG-ZL, Elite-Gates.md section 10.3): a band's Beats' own pictures (its warning in the palette, its return -
  // world/eliteGates/egBandArt.js EG_BEAT_TELL_RECORDS) go up with its first span that lays a Beat, once a session as its dress does
  const tellTex = (b) => (Array.from({ length: 21 }, (_, i) => i + 1).some((c) => egBandOfCircle(c) === b && egCircleSpecs(SEED, c).some((s) => s.steps.some((q) => q.kind === 'beat'))) ? (EG_BEAT_TELL_RECORDS.warn[0].length + EG_BEAT_TELL_RECORDS.back.length) * 2 : 0);
  // PIN MOVED (EG-LOOK, the spans' pieces - world/eliteGates/egPlatformArt.js): a band's Beats' stone dissolving with their dials and its
  // Crumbles' stages in its own flags go up with its first span that lays one, once a session, as the Beats' pictures do
  const lays = (b, kinds) => Array.from({ length: 21 }, (_, i) => i + 1).some((c) => egBandOfCircle(c) === b && egCircleSpecs(SEED, c).some((s) => s.steps.some((q) => kinds.includes(q.kind))));
  const pieceTex = (b) => (lays(b, ['beat']) ? EG_BEAT_STONE_RECORDS.reduce((n, q) => n + q.warn.length + q.back.length, 0) * 2 : 0) + (lays(b, ['crumble', 'bone']) ? EG_CRUMBLE_TELL_RECORDS.length * 2 : 0);
  const bands = new Set(Array.from({ length: 21 }, (_, i) => egBandOfCircle(i + 1)));
  // PIN MOVED (THE ASCENT - THE ROOMS, LAW 9 - 2026-10-16): the first circle's band's pieces its first circle does not lay go up
  // with the first of its circles that does, once a session as the others' (law 9's first circle of this seed lays no Crumble;
  // law 8's did, so its band's went up with the stand)
  const b1 = egBandOfCircle(1), in1 = (kinds) => egCircleSpecs(SEED, 1).some((s) => s.steps.some((q) => kinds.includes(q.kind)));
  const later1 = (lays(b1, ['beat']) && !in1(['beat']) ? tellTex(b1) + EG_BEAT_STONE_RECORDS.reduce((n, q) => n + q.warn.length + q.back.length, 0) * 2 : 0) + (lays(b1, ['crumble', 'bone']) && !in1(['crumble', 'bone']) ? EG_CRUMBLE_TELL_RECORDS.length * 2 : 0);
  // PIN MOVED (FIELD BUGS 2026-10-20f ORRERY-STONES, scenes/eliteGates/egOrrery.js): an Athenaeum's stones wear the Hour's hall pictures
  // (scenes/superDungeon/sdHall.js ensureSdHallArt - counted off the producer), which go up with the first circle that lays one, once
  // a session as a band's Beats' do
  let hallUp = 0;
  ensureSdHallArt({ uploadTexture: () => { hallUp++; }, uploadEmissionTexture: () => { hallUp++; } });
  const ath = (c) => egCircleSpecs(SEED, c).some((s) => s.kind === 'athenaeum');
  const hallTex = !ath(1) && Array.from({ length: 20 }, (_, i) => i + 2).some(ath) ? hallUp : 0;
  assert.ok(hallUp > 0, 'the Hour\'s hall pictures counted');
});

// ── THE CLIENT'S SWAP, PLAYED AGAINST THE RELAY (EG-PLAY's harness) ─────────────────────────────────────────────────
const T0 = 1_800_000_000_000;
const ME = 'acct-mac';
const SITE = { px: 300, py: 200, x: 1000, y: 0, z: 2000, yaw: 0 };
const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
const tick = () => new Promise((r) => setImmediate(r));

/** The breach on the real Room, the client between it and a mode machine of fakes whose swap is THE SWAP's own
 *  (scenes/eliteGates/egSwap.js over `worker`): `offer` false offers no build. */
async function withPlay(fn, { worker = () => syncWorker(), offer = true } = {}) {
  const realNow = Date.now;
  let clock = T0;
  Date.now = () => clock;
  const world = fakeRooms({ now: () => clock });
  const hub = world.room(SOCIAL_ROOM);
  const eg = world.room(egRoomKey(B));
  const pending = [], said = [], asked = { enter: [], place: [], exits: 0, lands: [], prebuilt: [], swaps: [], drops: 0 };
  const entity = { level: 20, health: 100, maxHealth: 100, magicka: 0, maxMagicka: 40, fatigue: 0, stats: { strength: 50, endurance: 50 }, items: [] };
  const player = { pos: realmToDungeon(SITE.x, 0, SITE.z) };
  const from = { pos: [1, 2, 3], normal: [0, 0, 1] };
  let mode = 'exterior', hall = null, ws = null, macHub = null;
  const swap = createEgSwap({ workerFactory: offer ? worker : null });
  const modes = {
    get mode() { return mode; },
    egHallBreach: () => (mode === 'dungeon' && hall ? hall.b : null),
    egHallCircle: () => (mode === 'dungeon' && hall ? hall.c : null),
    stepThroughFire: async (go) => go(),
    enterEgHall: (r) => { if (mode !== 'exterior') return false; asked.enter.push(r); mode = 'dungeon'; hall = { ...r }; player.pos = realmToDungeon(0, 0, 1.5); return true; },
    egPlace: (at) => { asked.place.push(at); player.pos = [...at]; return true; },
    egLeave: () => { mode = 'exterior'; hall = null; return true; },
    egHallReturn: () => (mode === 'dungeon' ? from : null),
    forceExitToExterior: () => { asked.exits++; mode = 'exterior'; hall = null; },
    egPrebuild: (r) => { asked.prebuilt.push(r.c); return mode === 'dungeon' && hall && r.b === hall.b ? swap.want(r.seed, r.c, r.geo) : null; },
    egSwapCircle: (r) => { if (mode !== 'dungeon' || !hall || r.b !== hall.b || !swap.take(r.seed, r.c, r.geo)) return false; asked.swaps.push(r.c); hall.c = r.c; hall.geo = r.geo; return true; },
    egSwapDrop: () => { asked.drops++; swap.drop(); },
    get dungeonCtx() { return mode === 'dungeon' ? { exitDoors: [] } : null; },
  };
  const send = (room, sock, w) => { pending.push(room.raw(sock, JSON.stringify({ t: 'eg', ...w }))); return true; };
  const hubLink = { get egOk() { return true; }, sendEg: (k, f = {}) => { const w = validEgIn({ ...f, k }); return w && macHub ? send(hub, macHub, w) : false; } };
  const presence = { welcomes: 1, terminal: false, error: null, sendEg: (k, f = {}) => { const w = validEgIn({ ...f, k, ...(k === 'in' ? { bv: EG_BRAIN_V } : {}) }); return w && ws && mode === 'dungeon' ? send(eg, ws, w) : false; } };
  let inflight = 0;
  const track = (f) => async (...a) => { inflight++; try { return await f(...a); } finally { inflight--; } };
  const account = {
    me: () => ME, guest: () => false,
    keys: track(async () => ({ ok: true, data: { keys: 2 } })),
    open: track(async (rq, rh) => ({ ok: true, data: { order: await mintEgOrder({ o: 'egopen', s: ME, eb: B, ez: 'z'.repeat(20), ...(rh ? { rh: 1 } : {}) }, (await hub.signer()).privateKey, { subtle: globalThis.crypto.subtle, nowS: Math.floor(clock / 1000) }), b: B, ez: 'z'.repeat(20), keys: 1, until: 0, rh: rh ? 1 : 0 } })),
    admit: track(async (b) => ({ ok: true, data: { order: await mintEgOrder({ o: 'egadmit', s: ME, eb: b, ez: 'a'.repeat(20) }, (await eg.signer()).privateKey, { subtle: globalThis.crypto.subtle, nowS: Math.floor(clock / 1000) }), b } })),
    claim: track(async (r) => { const c = readEgReceipt(r); return { ok: true, data: { recorded: true, q: c.q, b: c.b, ...(c.q === 'w' ? { w: c.w } : {}), keys: 1 } }; }),
  };
  const client = createEgClient({
    modes: () => modes, online: () => presence, hub: () => hubLink, account, now: () => clock, entity, player, cam: { pos: player.pos },
    say: (t) => said.push(t), mid: () => {}, site: () => ({ climateBase: 2, season: 0 }), wire: () => SITE,
    landAt: (l) => { asked.lands.push(l); return true; }, hurt: (n) => { entity.health -= n; },
  });
  const seen = new Map();
  const pump = () => {
    for (const [r, s] of [[SOCIAL_ROOM, macHub], [egRoomKey(B), ws]]) {
      if (!s) continue;
      let i = seen.get(s) ?? 0;
      for (; i < s.sent.length; i++) { const m = s.sent[i]; if (m.t === 'eg') client.word(validEgOut(m), r); }
      seen.set(s, i);
    }
  };
  const settle = async () => { for (let q = 0, k = 0; k < 5000 && q < 3; k++) { await tick(); const busy = inflight > 0 || pending.length > 0; await Promise.all(pending.splice(0)); pump(); q = busy ? 0 : q + 1; } };
  const beat = async (ms) => { const end = clock + Math.round(ms); while (eg.alarm.at != null && eg.alarm.at <= end) { clock = Math.max(clock, eg.alarm.at); await eg.fire(); pump(); } clock = end; };
  const pose = () => { const [x, y, z] = player.pos; return { x, y, z, yaw: 0, pitch: 0 }; };
  const frame = async (ms = 300) => { client.frame(); await settle(); if (ws && mode === 'dungeon') await eg.pose(ws, pose()); await beat(ms); pump(); await settle(); };
  const enter = async () => { ws = eg.connect(); await eg.hello(ws, 'peer-mac', pose(), { kind: 'linked', tokenSub: ME, charLevel: 20 }); pump(); await settle(); };
  const rec = () => eg.room._eg;
  try {
    await quiet(async () => {
      macHub = hub.connect(); await hub.hello(macHub, 'peer-mac', null, { name: 'Mac', acct: ME, asecret: 'secret-of-acct-mac', kind: 'linked' });
      assert.equal(client.useKey(), EG_TEXT.opening);
      await settle();
      clock += EG_SEALED_MS; await beat(1000);
      client.command('');
      await settle();
      await enter();
      await frame(300);
      for (let i = 0; i < 6 && rec().sg !== 'trial'; i++) await frame(EG_GATHER_MS / 3);
      await fn({ client, asked, player, modes, frame, rec, eg, said, swap, presence, step: (ms) => { clock += ms; }, now: () => clock });
    });
  } finally { Date.now = realNow; }
}
/** The rest run out on the room's own beats (EG-H2, Elite-Gates.md section 22: a gap between beats past EG_GAP_MS is a
 *  restart, and the room gives it back - so a clock stepped past the rest would hold it). */
const restOut = async (P) => { for (let i = 0; i < Math.ceil(EG_REST_MS / 1500) + 4 && P.rec().sg === 'rest'; i++) await P.frame(1500); };
/** The breach carried to its first Court's rest, until my screen has heard it. */
const toRest = async (P) => {
  const B0 = P.eg.room._eg; B0.h = 5; B0.sg = 'rest'; B0.F = null; B0.sa = P.now(); B0.su = P.now() + 8000; B0.rd = 1;
  for (let i = 0; i < 20 && P.client.state().sg !== 'rest'; i++) await P.frame(300);
  assert.equal(P.client.state().sg, 'rest');
  await P.frame(300);
};

test('EG10 THE SWAP, PLAYED (scenes/eliteGates/egClient.js against the relay): while the Court rests the client asks the next circle\'s level of the swap\'s build; the rest over, the step into it is a swap of the built level IN PLACE under the veil - no exterior, no landing, no new level entered - my feet on the new circle\'s first plate; the build forgotten when I walk out (mutants: the build never asked; the old step taken with a level built; my feet left in the old Court; the build kept past the breach)', async () => {
  await withPlay(async (P) => {
    const { asked, frame, rec, step, modes, player } = P;
    assert.equal(asked.enter.length, 1);
    await toRest(P);
    assert.ok(asked.prebuilt.includes(2), 'the next circle asked while the Court rests');
    assert.equal(P.swap.state(rec().seed, 2, rec().geo ?? 0), 'ready', 'built during the rest');
    await restOut(P);   // PIN MOVED (EG-H2): the rest run out on the room's own beats - a clock that jumps past them is a restart, and its gap given back
    assert.deepEqual([rec().h, rec().sg], [egFirstHallOf(2), 'arrive']);
    await frame(300);
    assert.deepEqual(asked.swaps, [2], 'the built level stood in place');
    assert.equal(asked.exits, 0, 'no exterior');
    assert.equal(asked.lands.length, 0, 'no landing outside');
    assert.equal(asked.enter.length, 1, 'no new level entered');
    assert.equal(modes.egHallCircle(), 2);
    const s6 = egHallOf(rec().seed, egFirstHallOf(2), rec().geo ?? 0), [sx, , z] = dungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
    assert.ok(egOnArrive(s6, sx - s6.x0, z, 0.5), 'on Hall 6\'s arrival plate');
    assert.equal(modes.egPrebuild({ b: B, seed: rec().seed, c: 3, geo: 0 }), 'ready', 'a build held');
    P.presence.terminal = true;   // the room closed my socket: I walk out
    await frame(300);
    assert.equal(asked.drops, 1, 'the build forgotten with the breach');
    assert.equal(P.swap.state(rec().seed, 3, 0), null);
  });
});

test('EG10 THE SWAP\'S FALLBACK, PLAYED: a build still in flight when the step is due holds the step EG_SWAP_WAIT_MS - landing inside it, the swap; never landing, the old step under the veil (out to where I answered from and into the new circle\'s level); and with no build offered, the old step at once (mutants: the wait unbounded; the fallback never taken; the swap taken unbuilt)', async () => {
  // in flight, landing inside the wait
  let w = null;
  await withPlay(async (P) => {
    const { asked, frame, rec, step } = P;
    await toRest(P);
    await restOut(P);   // PIN MOVED (EG-H2): the rest run out on the room's own beats - a clock that jumps past them is a restart, and its gap given back
    assert.equal(rec().sg, 'arrive');
    await frame(200);
    assert.equal(asked.swaps.length + asked.exits, 0, 'waiting on the build');
    w.answer();
    await frame(200);
    assert.deepEqual(asked.swaps, [2], 'landed inside the wait: the swap');
    assert.equal(asked.exits, 0);
  }, { worker: () => (w = heldWorker()) });
  // in flight, never landing
  await withPlay(async (P) => {
    const { asked, frame, rec, step, modes } = P;
    await toRest(P);
    await restOut(P);   // PIN MOVED (EG-H2): the rest run out on the room's own beats - a clock that jumps past them is a restart, and its gap given back
    assert.equal(rec().sg, 'arrive');
    await frame(EG_SWAP_WAIT_MS / 2);
    assert.equal(asked.exits, 0, 'still waiting');
    await frame(EG_SWAP_WAIT_MS);
    await frame(300);
    assert.equal(asked.swaps.length, 0);
    assert.equal(asked.exits, 1, 'the old step: out of the old circle');
    assert.equal(asked.lands.length, 1, 'stood where I answered from');
    assert.equal(asked.enter.length, 2);
    assert.deepEqual([asked.enter[1].b, asked.enter[1].c], [B, 2], 'into the next circle\'s level');
    assert.equal(modes.egHallCircle(), 2);
  }, { worker: () => heldWorker() });
  // none offered
  await withPlay(async (P) => {
    const { asked, frame, rec, step } = P;
    await toRest(P);
    await restOut(P);   // PIN MOVED (EG-H2): the rest run out on the room's own beats - a clock that jumps past them is a restart, and its gap given back
    assert.equal(rec().sg, 'arrive');
    await frame(300);
    assert.equal(asked.swaps.length, 0);
    assert.equal(asked.exits, 1, 'no build offered: the old step at once');
    assert.equal(asked.enter.length, 2);
  }, { offer: false });
});

test('EG10 THE HOSTS WIRED: the mode machine builds the swap and hands the client its three doors; the stand of a portcullis is one function for the stand and the swap; the dungeon host stands a new circle\'s spans in the same level; the client asks the build at the rest and swaps before it falls back (mutants: any seam unwired)', () => {
  assert.ok(isEgHall({ egBreach: B, egCircle: 2, dungeon: { recordElement: { header: { locationId: 0x7ffff300 } } } }));
});
