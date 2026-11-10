// How often the town seats read the account database (the witness rows, the weekly lease).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, T0 } from '../accountDb.mjs';
import { confirmedSeats, SEAT_ROWS_KEPT_S, SEAT_ROWS_SQL, SEAT_JUDGED_SQL } from '../../server-account/src/townSeats.js';
import { titheAt } from '../../server-account/src/seatHolding.js';
import { settleWeek, settleDueOnce } from '../../server-account/src/seatTurning.js';
import { seatReportText, seatWeekOf, seatWeekStartMs } from '../../src/net/townSeatLaw.js';

const ENV = { SEATS_OPEN: 'on' };
const ANTICLERE = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace', pixel: [402, 151] };
const seatRead = (sql) => sql === SEAT_ROWS_SQL || sql === SEAT_JUDGED_SQL;   // LEAN-WITNESS (
/** The service with Anticlere confirmed and held by a guild, its seat witness reads counted (`c.n`). */
async function heldSeat() {
  const svc = await standService(ENV);
  const raw = svc.env.DB._raw;
  for (const w of [await svc.guest(), await svc.guest(), await svc.guest()]) {
    raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('seat', ?, ?, ?, ?, ?)").run(String(ANTICLERE.key), w.id, seatReportText(ANTICLERE), ANTICLERE.region, T0 - 86400);
  }
  raw.prepare("INSERT INTO guilds (id, name, name_key, tag, ranks, founded_at) VALUES ('g1', 'Holders', 'holders', 'HO', '[]', 1)").run();
  raw.prepare("INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, tithe, at) VALUES (?, 'g1', ?, 'palace', 1, 50, 5, 1)").run(ANTICLERE.key, ANTICLERE.region);
  const base = svc.env.DB;
  const c = { n: 0, sql: [] };
  const db = Object.create(base);
  db.prepare = (sql) => { if (seatRead(sql)) c.n++; c.sql.push(sql); return base.prepare(sql); };
  db.batch = (l) => base.batch(l);
  return { svc, raw, db, c };
}

test('D1-LOAD THE SEATS\' WITNESS ROWS ARE READ ONCE A MINUTE FOR EVERY CALLER: a market sale\'s Tithe in a held seat\'s region - which read all of them on every sale from the moment its first Charter was held - a standings and a pledge share the isolate\'s kept rows; a minute on, read again; the Turning reads the table as it stands (mutants: the default kept; the Turning fresh)', async () => {
  const { db, c } = await heldSeat();
  const t1 = await titheAt(db, T0, ANTICLERE.region, ANTICLERE.pixel);
  assert.deepEqual([t1?.key, t1?.guild, t1?.pct], [ANTICLERE.key, 'g1', 5], 'the Tithe is the holder\'s');
  assert.equal(c.n, 1);
  for (let i = 0; i < 20; i++) await titheAt(db, T0 + i, ANTICLERE.region, ANTICLERE.pixel);
  assert.equal((await confirmedSeats(db, T0 + 30)).has(ANTICLERE.key), true);
  assert.equal(c.n, 1, 'twenty sales and a standings inside the minute: the one read');
  await titheAt(db, T0 + SEAT_ROWS_KEPT_S, ANTICLERE.region, ANTICLERE.pixel);
  assert.equal(c.n, 2, 'a minute on: read again');
  await settleWeek(db, seatWeekOf(T0 * 1000) - 1, T0 + SEAT_ROWS_KEPT_S + 1);   // inside the minute the rows were kept
  assert.equal(c.n, 3, 'the Turning: the table as it stands, whatever this isolate kept');
});

test('D1-LOAD THE LEASE IS READ BEFORE IT IS ASKED OF THE WRITER: while another holds it, a caller that finds the week due reads the lease and answers pending with no write; one whose read raced the other\'s take (it read the lease free) is still held off by the write\'s own WHERE (mutants: the read; the WHERE)', async () => {
  const { db, raw, c } = await heldSeat();
  const W = seatWeekOf(T0 * 1000);
  const atS = Math.floor(seatWeekStartMs(W + 1) / 1000) + 60;
  raw.prepare("INSERT INTO town_seat_settling (id, holder, until) VALUES (1, 'another', ?)").run(atS + 30);
  c.sql.length = 0;
  assert.deepEqual(await settleDueOnce(db, atS), { settled: 0, pending: true });
  assert.deepEqual(c.sql.filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), [], 'no write asked while the lease is held');
  // a racer: its read answered before the other's take landed
  const racer = Object.create(db);
  racer.prepare = (sql) => (/^SELECT until FROM town_seat_settling/.test(sql) ? { bind: () => ({ first: async () => null }), first: async () => null } : db.prepare(sql));
  racer.batch = (l) => db.batch(l);
  assert.deepEqual(await settleDueOnce(racer, atS), { settled: 0, pending: true }, 'the write\'s WHERE holds it off');
  assert.equal(raw.prepare('SELECT holder FROM town_seat_settling').get().holder, 'another', 'the lease still the other\'s');
});
