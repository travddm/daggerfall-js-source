// AUDIT SEATS-2 - THE
// SEATS' FORTIFICATIONS IN THE ACCOUNT SERVICE, THE AUDITED FINDINGS FIXED: a crown's Tithe past 15 a 500 (S2); a Season's
// wear, and the Siege Camps' Rams read before it (S4); a relinquished Charter (S5). Driven through the real Worker over
// node:sqlite with every migration applied (test/accountDb.mjs), and the statements the batches carry where a Worker path
// cannot reach the state. 4.2, 7.2, 7.5, 7.7, 9.1, 16;
// server-account/src/seatForts.js, seatSiege.js, seatTurning.js, townSeats.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, T0 } from '../accountDb.mjs';
import { seatReportText, seatWeekOf, seatWeekStartMs, SEAT_MEMBER_WAIT_S, siegeStartMs, TITHE_CAP } from '../../src/net/townSeatLaw.js';
import { marketHallTitheCap, fortMaxTier } from '../../src/net/fortLaw.js';
import { _b64url } from '../../src/net/identityToken.js';
import { SIEGE_RECEIPT_V, SIEGE_RECEIPT_TTL_S } from '../../src/net/siege/siegeReceipt.js';
import { fortsSeasonStatements, campsWorn } from '../../server-account/src/seatForts.js';

const { subtle } = globalThis.crypto;
const ANTICLERE = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace', pixel: [402, 151] };
const ASHFIELD = { key: 3022, name: 'Ashfield', region: 21, tier: 'palace', pixel: [470, 160] };
const ALCAIRE = { key: 3034, name: 'Alcaire Keep', region: 34, tier: 'palace', pixel: [520, 130] };
const WAYREST = { key: 5023, name: 'Wayrest', region: 23, tier: 'crown', pixel: [590, 166] };
const SEATS = [ANTICLERE, ASHFIELD, ALCAIRE, WAYREST];
const DAY = 86400;
const W = seatWeekOf(T0 * 1000);   // T0 is a Friday morning: the Muster of week W
const turning = (w) => Math.floor(seatWeekStartMs(w + 1) / 1000);
const AFTER = (w) => turning(w) + 3 * 3600;
const START = Math.floor(siegeStartMs(W + 1, 0, 20) / 1000);   // the default window, Wednesday 20:00 of W+1
const enc = new TextEncoder();
let _rid = 0;
const rid = () => `as2-${String(++_rid).padStart(6, '0')}`;

/** A siege receipt minted as the relay mints one (test/net/audit_seats_service.test.js's mint). */
async function mintSiege(claims, key, nowS) {
  const c = { ...claims, i: nowS, e: nowS + SIEGE_RECEIPT_TTL_S };
  const body = _b64url.encode(enc.encode(JSON.stringify(c)));
  const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, key, enc.encode(`${SIEGE_RECEIPT_V}.${body}`)));
  return `${SIEGE_RECEIPT_V}.${body}.${_b64url.encode(sig)}`;
}

async function stood(t, extra = {}) {
  let now = T0;
  t.mock.method(Date, 'now', () => now * 1000);
  const svc = await standService({ SEATS_OPEN: 'on', MARKS_OPEN: 'on', PROFESSIONS_OPEN: 'on', BOARD_OPEN: 'on', SEAT_ADMINS: 'Devra', ...extra });
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
  const member = async (g, handle, rank = 2, week = W) => {
    const m = await svc.registered(handle, { renown: 5 });
    raw.prepare('INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, ?, ?, ?, ?)').run(m.id, m.character, g.gid, rank, handle, T0 - 30 * DAY);
    raw.prepare('INSERT INTO town_seat_binds (week, account, guild_id, char_id, at) VALUES (?, ?, ?, ?, ?)').run(week, m.id, g.gid, m.character, T0);
    return m;
  };
  let seed = 0;
  const treasury = (gid, n) => raw.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
    VALUES ('mint', NULL, 'guild', ?, 'test', ?, 1, 1, 'seed', NULL, ?)`).run(gid, n, `seed-g-${++seed}`);
  const earn = async (gid, seat, amount, week = W) => {
    while (amount > 0) {
      const a = await svc.guest();
      const n = Math.min(2000, amount);
      raw.prepare('INSERT INTO town_seat_binds (week, account, guild_id, char_id, at) VALUES (?, ?, ?, ?, ?)').run(week, a.id, gid, 'c', T0);
      raw.prepare(`INSERT INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
        VALUES (?, ?, ?, ?, 'c', 'watch', ?, ?, 1, ?, ?)`).run(week, seat.key, gid, a.id, n, seat.region, `t:${a.id}:${week}:${seat.key}`, now);
      amount -= n;
    }
  };
  const pledge = (gid, seat, week = W) => raw.prepare('INSERT INTO town_seat_pledges (week, guild_id, region, key, set_by, at) VALUES (?, ?, ?, ?, ?, ?)').run(week, gid, seat.region, seat.key, 'x', T0);
  const hold = (seat, gid, o = {}) => raw.prepare(`INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at, tithe, owed)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`).run(seat.key, gid, seat.region, seat.tier, o.since ?? W - 2, o.standing ?? 50, T0 - 14 * DAY, o.tithe ?? 6, o.owed ?? 0);
  const holdOf = (seat = ANTICLERE) => { const h = raw.prepare('SELECT guild_id FROM town_seat_holds WHERE key = ?').get(seat.key); return h ? h.guild_id : null; };
  /** A work's row put by hand: its standing tier. */
  const fort = (seat, work, tier) => {
    raw.prepare('INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?, ?, ?, ?)').run(seat.key, work, tier, T0);
  };
  const works = (seat = ANTICLERE) => Object.fromEntries(raw.prepare('SELECT work, tier FROM town_seat_forts WHERE key = ? ORDER BY work').all(seat.key).map((r) => [r.work, r.tier]));
  const history = (kind, seat = ANTICLERE) => raw.prepare('SELECT data FROM town_seat_history WHERE key = ? AND kind = ? ORDER BY seq').all(seat.key, kind).map((r) => JSON.parse(r.data));
  const call = (path, body, who) => svc.call(path, body, who.secret);
  const list = (who) => call('/v1/seats/list', {}, who);
  const battle = (seat = ANTICLERE, week = W + 1) => { const b = raw.prepare('SELECT * FROM town_seat_battles WHERE week = ? AND key = ?').get(week, seat.key); return b ? { ...b } : null; };
  const claim = async (who, o = {}) => call('/v1/seats/siege/claim', {
    receipt: await mintSiege({ s: who.id, sk: ANTICLERE.key, sw: W + 1, sd: 'attack', r: 'attack', a: 1, h: 1, th: 0, ...o }, svc.gateKey, now), character: who.character,
  }, who);
  return {
    svc, raw, guild, member, treasury, earn, pledge, hold, holdOf, fort, works, history, call, list, battle, claim,
    setNow: (n) => { now = n; }, getNow: () => now,
  };
}

/** THE SIEGE OF ANTICLERE (test/net/audit_seats_service.test.js's): the Silver Hand holds it, the Ebon Oath wins a Right at
 *  W's Turning, Wednesday 20:00 of W+1; an attacker and a defender signed. */
async function siegeWeek(s) {
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  s.hold(ANTICLERE, sh.gid);
  s.treasury(sh.gid, 10000);
  await s.earn(sh.gid, ANTICLERE, 500);
  s.pledge(eo.gid, ANTICLERE);
  await s.earn(eo.gid, ANTICLERE, 7000);
  const a1 = await s.member(eo, 'Arden'), d1 = await s.member(sh, 'Dorran');
  s.setNow(AFTER(W));
  await s.list(sh.gm);
  assert.equal(s.battle()?.state, 'scheduled', 'the siege placed');
  for (const who of [a1, d1]) assert.equal((await s.call('/v1/seats/siege/sign', { character: who.character, key: ANTICLERE.key }, who)).status, 200);
  return { sh, eo, a1, d1 };
}

// ─── S2 ──────────────────────────────────────────────────────────────

test('AUDIT SEATS-2 S2: A CROWN\'S TITHE PAST 15 - a crown with a tier-3 Market Hall sets 18, its board\'s cap, and the write stands (it was a 500: the column\'s CHECK said 15); 19 is refused in words; the CHECK\'s ceiling is the law\'s highest cap (mutants: the CHECK\'s 18)', async (t) => {
  assert.equal(marketHallTitheCap(TITHE_CAP.crown, fortMaxTier('market')), 18, 'a crown\'s 15 and a tier-3 Market Hall\'s 3');
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  s.hold(WAYREST, sh.gid);
  s.fort(WAYREST, 'market', 3);
  const tithe = (pct) => s.call('/v1/seats/tithe', { character: sh.gm.character, key: WAYREST.key, pct }, sh.gm);
  assert.equal((await tithe(19)).body.error, 'bad-tithe');
  const r = await tithe(18);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, tithe: 18 });
  assert.equal(s.raw.prepare('SELECT tithe FROM town_seat_holds WHERE key = ?').get(WAYREST.key).tithe, 18);
});

// ─── S4 ──────────────────────────────────────────────────────────────

test('AUDIT SEATS-2 S4: A SEASON\'S WEAR TAKES EACH WORK DOWN A TIER, NEVER BELOW NOUGHT (mutants: the wear; the floor)', async (t) => {
  const s = await stood(t);
  const db = s.svc.env.DB;
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  s.hold(ANTICLERE, sh.gid);
  s.fort(ANTICLERE, 'walls', 2);
  s.fort(ANTICLERE, 'market', 0);
  s.fort(ANTICLERE, 'forge', 1);
  await db.batch(fortsSeasonStatements(db));
  assert.deepEqual(s.works(), { forge: 0, market: 0, walls: 1 });
});

test('AUDIT SEATS-2 S4: THE TURNING THAT ENDS A SEASON - the Siege Camp\'s Ram is burnt where the wear left a palace no Gatehouse (campsSpent read the gate before the wear, and a gate standing again before the battle let it through); a crown\'s battle and a palace whose gate still stands keep theirs (mutants: the Turning\'s camps worn; the crown\'s gate; the standing gate)', async (t) => {
  // the camps' Rams after the wear, read directly
  const d = await stood(t);
  const db = d.svc.env.DB;
  const battle = (seat, rams) => d.raw.prepare("INSERT INTO town_seat_battles (week, key, kind, tier, attacker, defender, starts_at, ends_at, rams, at) VALUES (?, ?, 'siege', ?, 'ga', 'gx', ?, ?, ?, ?)")
    .run(W + 1, seat.key, seat.tier, T0 + 7 * DAY, T0 + 7 * DAY + 7200, rams, T0);
  battle(ANTICLERE, 1); battle(ASHFIELD, 1); battle(WAYREST, 2);
  d.fort(ANTICLERE, 'gatehouse', 0); d.fort(ASHFIELD, 'gatehouse', 1);
  await db.batch([campsWorn(db, W + 1)]);
  assert.deepEqual(Object.fromEntries(d.raw.prepare('SELECT key, rams FROM town_seat_battles').all().map((r) => [r.key, r.rams])),
    { [ANTICLERE.key]: 0, [ASHFIELD.key]: 1, [WAYREST.key]: 2 }, 'no gate standing: burnt; a gate, or a crown\'s: kept');
  // the Turning that ends Season 1 (W-7..W): the Oath wins its Right at Anticlere, its camp pitched
  const s = await stood(t, { SEASON_ZERO_WEEK: String(W - 11) });
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  s.hold(ANTICLERE, sh.gid);
  s.treasury(sh.gid, 10000);
  await s.earn(sh.gid, ANTICLERE, 500);
  s.pledge(eo.gid, ANTICLERE);
  await s.earn(eo.gid, ANTICLERE, 7000);
  s.fort(ANTICLERE, 'walls', 3);
  s.fort(ANTICLERE, 'gatehouse', 1);
  s.raw.prepare('INSERT INTO town_seat_camps (week, key, guild_id, at) VALUES (?, ?, ?, ?)').run(W, ANTICLERE.key, eo.gid, T0);
  s.setNow(AFTER(W));
  await s.list(sh.gm);
  const b = s.battle();
  assert.deepEqual([b?.kind, b?.attacker], ['siege', eo.gid], 'the Right won and its siege placed');
  assert.deepEqual(s.works(), { gatehouse: 0, walls: 2 }, 'the Season\'s wear');
  assert.equal(b.rams, 0, 'no Ram for a gate the same Turning wore away');
});

// ─── S5 ──────────────────────────────────────────────────────────────

test('AUDIT SEATS-2 S5: A CHARTER RELINQUISHED - the standing tiers kept; a relinquishing that moved nothing (another guild\'s Guildmaster) drops nothing (mutants: the unheld guard)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  s.hold(ANTICLERE, sh.gid);
  s.fort(ANTICLERE, 'walls', 1);
  s.fort(ANTICLERE, 'shrine', 1);
  const relinquish = (g) => s.call('/v1/seats/relinquish', { character: g.gm.character, key: ANTICLERE.key }, g.gm);
  assert.equal((await relinquish(eo)).body.error, 'seat-not-held');
  assert.equal(s.holdOf(), sh.gid, 'the Charter is still the Hand\'s');
  assert.deepEqual((await relinquish(sh)).body, { ok: true });
  assert.equal(s.holdOf(), null);
  assert.deepEqual(s.works(), { shrine: 1, walls: 1 }, 'the tiers stay');
});


