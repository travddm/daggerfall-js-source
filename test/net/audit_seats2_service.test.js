// AUDIT SEATS-2 - THE SEATS IN THE ACCOUNT SERVICE, WHAT OUTLIVED THE FORTIFICATIONS' CUT: a Charter relinquished, a
// Charter lapsed at the Turning (Neglect, or a seat the registry no longer confirms) and a Charter struck each leave
// the seat unheld, and a relinquishing that moved nothing drops nothing (S5). Driven through the real Worker over
// node:sqlite with every migration applied (test/accountDb.mjs). 4.2, 9.1, 16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, T0 } from '../accountDb.mjs';
import { seatReportText, seatWeekOf, seatWeekStartMs, SEAT_MEMBER_WAIT_S } from '../../src/net/townSeatLaw.js';

const ANTICLERE = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace', pixel: [402, 151] };
const ASHFIELD = { key: 3022, name: 'Ashfield', region: 21, tier: 'palace', pixel: [470, 160] };
const ALCAIRE = { key: 3034, name: 'Alcaire Keep', region: 34, tier: 'palace', pixel: [520, 130] };
const WAYREST = { key: 5023, name: 'Wayrest', region: 23, tier: 'crown', pixel: [590, 166] };
const SEATS = [ANTICLERE, ASHFIELD, ALCAIRE, WAYREST];
const DAY = 86400;
const W = seatWeekOf(T0 * 1000);   // T0 is a Friday morning: the Muster of week W
const turning = (w) => Math.floor(seatWeekStartMs(w + 1) / 1000);
const AFTER = (w) => turning(w) + 3 * 3600;

async function stood(t) {
  let now = T0;
  t.mock.method(Date, 'now', () => now * 1000);
  const svc = await standService({ SEATS_OPEN: 'on', MARKS_OPEN: 'on', PROFESSIONS_OPEN: 'on', BOARD_OPEN: 'on', SEAT_ADMINS: 'Devra' });
  const raw = svc.env.DB._raw;
  const witnesses = [await svc.guest(), await svc.guest(), await svc.guest()];
  for (const seat of SEATS) for (const w of witnesses) raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('seat', ?, ?, ?, ?, ?)").run(String(seat.key), w.id, seatReportText(seat), seat.region, T0 - DAY);
  raw.prepare('INSERT INTO town_seat_weeks (week, settled_at) VALUES (?, ?)').run(W - 1, T0);
  const guild = async (handle, name, tag) => {
    const gm = await svc.registered(handle, { renown: 12 });
    assert.equal((await svc.found(gm, { name, tag })).status, 200);
    const gid = raw.prepare('SELECT guild_id FROM guild_members WHERE player = ? AND char_id = ?').get(gm.id, gm.character).guild_id;
    raw.prepare('UPDATE guild_members SET joined_at = ? WHERE guild_id = ?').run(T0 - SEAT_MEMBER_WAIT_S - DAY, gid);
    return { gm, gid };
  };
  let seed = 0;
  const treasury = (gid, n) => raw.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
    VALUES ('mint', NULL, 'guild', ?, 'test', ?, 1, 1, 'seed', NULL, ?)`).run(gid, n, `seed-g-${++seed}`);
  const hold = (seat, gid, o = {}) => raw.prepare(`INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at, tithe, owed)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`).run(seat.key, gid, seat.region, seat.tier, o.since ?? W - 2, o.standing ?? 50, T0 - 14 * DAY, o.tithe ?? 6, o.owed ?? 0);
  const holdOf = (seat = ANTICLERE) => { const h = raw.prepare('SELECT guild_id FROM town_seat_holds WHERE key = ?').get(seat.key); return h ? h.guild_id : null; };
  const history = (kind, seat = ANTICLERE) => raw.prepare('SELECT data FROM town_seat_history WHERE key = ? AND kind = ? ORDER BY seq').all(seat.key, kind).map((r) => JSON.parse(r.data));
  const call = (path, body, who) => svc.call(path, body, who.secret);
  const list = (who) => call('/v1/seats/list', {}, who);
  return { svc, raw, guild, treasury, hold, holdOf, history, call, list, setNow: (n) => { now = n; } };
}

test('AUDIT SEATS-2 S5: A CHARTER RELINQUISHED - the seat unheld; a relinquishing that moved nothing (another guild\'s Guildmaster) drops nothing (mutants: the relinquish\'s hold; the not-held refusal)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  s.hold(ANTICLERE, sh.gid);
  const relinquish = (g) => s.call('/v1/seats/relinquish', { character: g.gm.character, key: ANTICLERE.key }, g.gm);
  assert.equal((await relinquish(eo)).body.error, 'seat-not-held');
  assert.equal(s.holdOf(), sh.gid, 'nothing fell - the Charter is still the Hand\'s');
  assert.deepEqual((await relinquish(sh)).body, { ok: true });
  assert.equal(s.holdOf(), null);
});

test('AUDIT SEATS-2 S5: A CHARTER LAPSED AT THE TURNING - Neglect\'s second short week, and a seat the registry no longer confirms: each lapses; a Charter that stands keeps its seat (mutants: the Neglect lapse; the unregistered lapse)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  const dg = await s.guild('Doran', 'Daggers', 'DG');
  s.hold(ANTICLERE, sh.gid, { owed: 2500 });   // a week in Neglect already, and a treasury of nothing: lapsed
  s.hold(ALCAIRE, eo.gid);
  s.treasury(eo.gid, 10000);
  s.hold(ASHFIELD, dg.gid);
  s.treasury(dg.gid, 10000);
  s.raw.prepare("DELETE FROM world_witness WHERE kind = 'seat' AND key = ? AND rowid IN (SELECT rowid FROM world_witness WHERE kind = 'seat' AND key = ? LIMIT 1)").run(String(ALCAIRE.key), String(ALCAIRE.key));
  s.setNow(AFTER(W));
  await s.list(sh.gm);
  assert.deepEqual([s.holdOf(ANTICLERE), s.holdOf(ALCAIRE), s.holdOf(ASHFIELD)], [null, null, dg.gid], 'two lapsed, one stands');
  assert.equal(s.history('lapse').length, 1);
  assert.equal(s.history('unregistered', ALCAIRE).length, 1);
});

test('AUDIT SEATS-2 S5: A CHARTER STRUCK - the seat unheld (mutant: the strike\'s hold)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const dev = await s.svc.registered('Devra');
  s.hold(WAYREST, sh.gid);
  assert.equal((await s.call('/v1/seats/strike', { key: WAYREST.key }, dev)).status, 200);
  assert.equal(s.holdOf(WAYREST), null);
});
