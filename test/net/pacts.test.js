// PACTS, AS THE SERVICE KEEPS THEM - Pacts of non-aggression for the rest of the Season, broken early and announced in red on
// the seats' list; two partners may not pledge at each other's seats. Driven through the real Worker over node:sqlite with every
// migration applied (test/accountDb.mjs). 7.8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { standService, T0 } from '../accountDb.mjs';
import { utcDay } from '../../src/net/marksLaw.js';
import {
  seatReportText,
  seatWeekOf,
  seatWeekStartMs,
  SEAT_MEMBER_WAIT_S,
  pactUntil,
} from '../../src/net/townSeatLaw.js';

const WAYREST = { key: 5023, name: 'Wayrest', region: 23, tier: 'crown', pixel: [590, 166] };
const ALCAIRE = { key: 3034, name: 'Alcaire Keep', region: 34, tier: 'palace', pixel: [520, 130] };
const TULUNE = { key: 3058, name: 'Tulune', region: 58, tier: 'palace', pixel: [150, 120] }; // Daggerfall's
const YKALON = { key: 3040, name: 'Ykalon', region: 40, tier: 'palace', pixel: [560, 100] };
const DAY = 86400;
const W = seatWeekOf(T0 * 1000);
const turning = (w) => Math.floor(seatWeekStartMs(w + 1) / 1000);
const AFTER = (w) => turning(w) + 3 * 3600;

async function stood(t) {
  let now = T0;
  t.mock.method(Date, 'now', () => now * 1000);
  const svc = await standService({ SEATS_OPEN: 'on', MARKS_OPEN: 'on', PROFESSIONS_OPEN: 'on', BOARD_OPEN: 'on' });
  const raw = svc.env.DB._raw;
  const witnesses = [await svc.guest(), await svc.guest(), await svc.guest()];
  for (const seat of [WAYREST, ALCAIRE, TULUNE, YKALON])
    for (const w of witnesses)
      raw
        .prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('seat', ?, ?, ?, ?, ?)")
        .run(String(seat.key), w.id, seatReportText(seat), seat.region, T0 - DAY);
  raw.prepare('INSERT INTO town_seat_weeks (week, settled_at) VALUES (?, ?)').run(W - 1, T0);
  const guild = async (handle, name, tag) => {
    const gm = await svc.registered(handle, { renown: 12 });
    assert.equal((await svc.found(gm, { name, tag })).status, 200);
    const gid = raw
      .prepare('SELECT guild_id FROM guild_members WHERE player = ? AND char_id = ?')
      .get(gm.id, gm.character).guild_id;
    raw.prepare('UPDATE guild_members SET joined_at = ? WHERE guild_id = ?').run(T0 - SEAT_MEMBER_WAIT_S - DAY, gid);
    raw
      .prepare(
        `INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      VALUES ('mint', NULL, 'guild', ?, 'test', 100000, 1, 1, 'seed', NULL, ?)`,
      )
      .run(gid, `seed-${gid}`);
    return { gm, gid, tag };
  };
  const hold = (seat, g, standing = 50) =>
    raw
      .prepare(
        `INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at, tithe, owed)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 6, 0)`,
      )
      .run(seat.key, g.gid, seat.region, seat.tier, W - 1, standing, T0 - 7 * DAY);
  const held = (key) => raw.prepare('SELECT * FROM town_seat_holds WHERE key = ?').get(key) ?? null;
  const watch = (g, seat, week, amount = 100) => {
    const id = `w-${g.gid}-${seat.key}-${week}-${amount}`;
    raw
      .prepare('INSERT OR IGNORE INTO town_seat_binds (week, account, guild_id, char_id, at) VALUES (?, ?, ?, ?, ?)')
      .run(week, g.gm.id, g.gid, g.gm.character, T0);
    raw
      .prepare(
        `INSERT INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
      VALUES (?, ?, ?, ?, ?, 'watch', ?, ?, 1, ?, ?)`,
      )
      .run(week, seat.key, g.gid, g.gm.id, g.gm.character, amount, seat.region, id, T0);
  };
  const tithe = (g, n, at) =>
    raw
      .prepare(
        `INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
    VALUES ('mint', NULL, 'guild', ?, 'tithe', ?, ?, ?, 'seed', NULL, ?)`,
      )
      .run(g.gid, n, utcDay(at), at, `tithe-${g.gid}-${at}`);
  const lines = (kind) =>
    raw
      .prepare('SELECT src_id, dst_kind, dst_id, amount FROM marks_ledger WHERE kind = ? ORDER BY seq')
      .all(kind)
      .map((r) => [r.src_id, r.dst_kind, r.dst_id, Number(r.amount)]);
  const chronicle = (key) =>
    raw
      .prepare('SELECT kind FROM town_seat_history WHERE key = ? ORDER BY seq')
      .all(key)
      .map((r) => r.kind);
  const call = async (path, body, who) => svc.call(path, body, who.secret);
  const act = (path, g, body) => call(path, { character: g.gm.character, ...body }, g.gm);
  const list = async (g) => (await call('/v1/seats/list', {}, g.gm)).body;
  return {
    svc,
    raw,
    guild,
    hold,
    held,
    watch,
    tithe,
    lines,
    chronicle,
    call,
    act,
    list,
    getNow: () => now,
    setNow: (v) => {
      now = v;
    },
  };
}

test("PACTS NEVER AGAINST EACH OTHER: two Pact partners may not pledge at the other's seat; an offer binds nothing; a pledge against the other's seat bars the Pact; another seat stands open (mutants: the Pact bar; the offer binding)", async (t) => {
  const s = await stood(t);
  const oa = await s.guild('Orla', 'The Oath', 'OA'),
    sh = await s.guild('Gamal', 'The Silver Hand', 'SH'),
    dg = await s.guild('Doran', 'Daggers', 'DG');
  s.hold(WAYREST, oa);
  s.hold(ALCAIRE, sh);
  s.hold(TULUNE, dg);
  const pledge = (g, seat) => s.act('/v1/seats/pledge', g, { key: seat.key });
  assert.equal((await pledge(oa, YKALON)).status, 200, 'an unheld seat');
  assert.deepEqual((await s.act('/v1/seats/pact', dg, { tag: 'OA' })).body, { ok: true, signed: false });
  assert.equal((await pledge(dg, WAYREST)).status, 200, 'an offer binds nothing');
  s.raw.prepare('DELETE FROM town_seat_pledges WHERE guild_id = ?').run(dg.gid);
  const signed = (await s.act('/v1/seats/pact', oa, { tag: 'DG' })).body;
  assert.deepEqual(signed, { ok: true, signed: true, until: pactUntil(W) });
  assert.equal((await pledge(dg, WAYREST)).body.error, 'pact-pledge');
  assert.equal((await pledge(oa, TULUNE)).body.error, 'pact-pledge');
  assert.equal((await s.act('/v1/seats/pact', oa, { tag: 'DG' })).body.error, 'pact-signed');
  assert.equal((await s.act('/v1/seats/pact', oa, { tag: 'OA' })).body.error, 'pact-self');
  assert.equal((await pledge(sh, TULUNE)).status, 200);
  assert.equal((await s.act('/v1/seats/pact', sh, { tag: 'DG' })).body.error, 'pact-pledged');
});
test('PACTS CAN BE SWITCHED OFF: with SEATS_PACTS off the service signs none', async (t) => {
  let now = T0;
  t.mock.method(Date, 'now', () => now * 1000);
  const svc = await standService({
    SEATS_OPEN: 'on',
    MARKS_OPEN: 'on',
    PROFESSIONS_OPEN: 'on',
    BOARD_OPEN: 'on',
    SEATS_PACTS: 'off',
  });
  const a = await svc.registered('Orla', { renown: 12 });
  assert.equal((await svc.found(a, { name: 'The Oath', tag: 'OA' })).status, 200);
  assert.equal(
    (await svc.call('/v1/seats/pact', { character: a.character, tag: 'OA' }, a.secret)).body.error,
    'seat-option-off',
  );
});
test("CROWN2 A PACT BROKEN EARLY: allowed at once, announced to the whole server in red on the seats' list for a day; an unsigned offer only withdrawn, unannounced; none, refused (mutants: the announcement; the withdrawal; the day)", async (t) => {
  const s = await stood(t);
  const oa = await s.guild('Orla', 'The Oath', 'OA'),
    dg = await s.guild('Doran', 'Daggers', 'DG'),
    sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  await s.act('/v1/seats/pact', oa, { tag: 'SH' });
  assert.deepEqual(
    (await s.act('/v1/seats/pact/break', oa, { tag: 'SH' })).body,
    { ok: true, announced: false },
    'an offer withdrawn',
  );
  await s.act('/v1/seats/pact', oa, { tag: 'DG' });
  assert.deepEqual(
    (await s.act('/v1/seats/pact', oa, { tag: 'DG' })).body,
    { ok: true, signed: false },
    'offered again by the same side: still an offer',
  );
  await s.act('/v1/seats/pact', dg, { tag: 'OA' });
  assert.deepEqual((await s.act('/v1/seats/pact/break', dg, { tag: 'OA' })).body, { ok: true, announced: true });
  assert.equal((await s.act('/v1/seats/pact/break', dg, { tag: 'OA' })).body.error, 'pact-none');
  const red = (await s.list(sh)).red;
  assert.deepEqual(
    red.map((r) => r.text),
    ['Daggers <DG> has broken its Pact of non-aggression with the Oath <OA>.'],
  );
  s.setNow(s.getNow() + DAY);
  assert.deepEqual((await s.list(sh)).red, [], 'a day, then gone');
});
