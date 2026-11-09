// @ts-check
// ═════════════════════════════════════════════════════════════════
// SEAT2b: A SEAT'S FORTIFICATIONS AS THE SERVICE KEEPS THEM (7.5; the law src/net/fortLaw.js).
//
// THE SEAT'S, NOT THE GUILD'S: a work's tier stands at the seat whoever holds it. The holder's Guildmaster or an Officer
// raises the next tier at the board: its Marks are burnt from the treasury, once, and the tier stands at once for the
// rest of the Season. There are no materials, no stockpile and no writs.
//
// THE DROPS: a capture takes every work a tier down (fortLaw.js fortsAfterCapture); a Season's end takes every work a
// tier down; Season 0's end wipes them (seatTurning.js SEASON_ZERO_WIPED). A Charter relinquished or lapsed keeps them (16).
//
// THE SIEGE CAMP (4.2): a challenger's guild that pledged a seat this week pitches a camp for SIEGE_CAMP_MARKS from its
// treasury, once. If the guild wins the Right of Siege there and a Gatehouse stands, the camp brings CAMP_RAMS Rams to the
// siege; a camp that wins no Right is burnt whole.
//
// DECIDED: any number of works at once; a Harbour is raised where the funding client names its town a port (DFU's own port
// flag, read by the client - bounded: a lie spends the liar's own treasury on a harbour nothing docks at).
// ═════════════════════════════════════════════════════════════════
import { accountKind, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { seatsOpenFor, confirmedSeats } from './townSeats.js';
import { mustChange } from './realm.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { seatWeekOf, seatKeyOk, SEAT_LEVER_RANKS, SEAT_EDICTS_HOUR } from '../../src/net/townSeatLaw.js';
import { FORT_WORKS, fortWork, fortMaxTier, fortMayRaise, fortCost, marketHallListings, marketHallTitheCap, campRams, SIEGE_CAMP_MARKS } from '../../src/net/fortLaw.js';
import { MARKET_LISTINGS_MAX } from '../../src/net/marketLaw.js';
import { TITHE_CAP } from '../../src/net/townSeatLaw.js';

const weekAt = (nowS) => seatWeekOf(nowS * 1000);
const ORDER = new Map(FORT_WORKS.map((w, i) => [w.id, i]));
const byOrder = (a, b) => (ORDER.get(a.work) ?? 99) - (ORDER.get(b.work) ?? 99);
/** A Chronicle row at `key` this week. */
const historyRow = (db, key, nowS, kind, data) => db.prepare('INSERT INTO town_seat_history (key, week, kind, data, at) VALUES (?, ?, ?, ?, ?)')
  .bind(key, weekAt(nowS), kind, JSON.stringify(data), nowS);

/** A seat's works' rows, `[{ work, tier }]`, in the table's order. */
async function rowsOf(db, key) {
  const { results = [] } = await db.prepare('SELECT work, tier FROM town_seat_forts WHERE key = ?').bind(key).all();
  return results.map((r) => ({ work: r.work, tier: Number(r.tier) })).filter((r) => fortWork(r.work)).sort(byOrder);
}

/** A seat's works as the board shows them: `{ [work]: { tier } }` for every work with a row. */
export async function fortsOf(db, key) {
  return { works: Object.fromEntries((await rowsOf(db, key)).map((r) => [r.work, { tier: r.tier }])) };
}
/** ONE WORK'S TIER at the seat - nought for none. */
export async function fortTierAt(db, key, work) {
  const r = await db.prepare('SELECT tier FROM town_seat_forts WHERE key = ? AND work = ?').bind(key, work).first();
  return r ? Number(r.tier) : 0;
}
/** A seat's standing tiers alone - `{ [work]: tier }` - the effects' input (the pass, the Tithe's cap, the Shrine). */
export async function fortTiersOf(db, key) {
  return Object.fromEntries((await rowsOf(db, key)).map((r) => [r.work, r.tier]));
}

/**
 * RAISE THE NEXT TIER OF A WORK (`/v1/seats/fort/fund`, 7.5): `character`'s guild must hold the seat `key` and the
 * character be its Guildmaster or an Officer (the levers' ranks); `work` one the seat may raise and not at its top tier. Its
 * Marks are burnt from the treasury in the same batch as the tier (`fort`, once a `rid`). Answers `{ ok, work, tier,
 * marks, forts }` or `{ error }`.
 * @param {{db: any, nowS: number}} ctx
 */
export async function fundFort(ctx, player, env, { character, key, work, port = false, rid } = {}) {
  const { db, nowS } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  if (typeof rid !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(rid)) return { error: 'bad-rid' };
  const w = fortWork(work);
  if (!w) return { error: 'bad-work' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!SEAT_LEVER_RANKS.includes(Number(a.me.rank))) return { error: 'guild-rank' };
  const hold = await db.prepare('SELECT key, guild_id, tier FROM town_seat_holds WHERE key = ?').bind(key).first();
  if (!hold || hold.guild_id !== a.me.guild_id) return { error: 'seat-not-held' };
  const prior = await db.prepare("SELECT 1 FROM marks_ledger WHERE actor = ? AND rid = ? AND kind = 'fort'").bind(player.id, `${rid}:fort`).first();
  if (prior) return { ok: true, repeat: true, work, forts: await fortsOf(db, key) };
  const tiers = await fortTiersOf(db, key);
  if (!fortMayRaise(work, { tier: hold.tier, coastal: port === true, walls: tiers.walls ?? 0 })) return { error: 'fort-not-here' };
  const t = (tiers[work] ?? 0) + 1;
  if (t > fortMaxTier(work)) return { error: 'fort-max' };
  const marks = /** @type {number} */ (fortCost(work, t));
  // the rate, once the ask is one the board would take - its own bucket, beside the levers' (Appendix B's five an hour)
  if (await overRate(ctx, `seat-fort:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  const g = hold.guild_id;
  const guild = await db.prepare('SELECT name, tag FROM guilds WHERE id = ?').bind(g).first();
  try {
    await db.batch([
      // the treasury's Marks, burnt - the rank and the Charter still the guild's, asked in the write
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'guild', ?1, 'burn', NULL, 'fort', ?2, ?3, ?4, ?5, ?6, ?7
        WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?2
          AND EXISTS (SELECT 1 FROM town_seat_holds WHERE key = ?8 AND guild_id = ?1)
          AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?9 AND guild_id = ?1 AND rank IN (${SEAT_LEVER_RANKS.join(', ')}))`)
        .bind(g, marks, utcDay(nowS), nowS, player.id, w.name, `${rid}:fort`, key, Number(a.me.rid)),
      mustChange(db),
      // the tier: the next one above the one standing, or the write changes nothing and the batch rolls back
      db.prepare(`INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT (key, work) DO UPDATE SET tier = excluded.tier, at = excluded.at WHERE town_seat_forts.tier = ?3 - 1`).bind(key, work, t, nowS),
      mustChange(db),
      historyRow(db, key, nowS, 'fort-raised', { guild: { name: guild?.name ?? '', tag: guild?.tag ?? '' }, work, tier: t }),
    ]);
  } catch {
    const has = Number((await db.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').bind(g).first())?.balance ?? 0);
    if (has < marks) return { error: 'seat-treasury' };
    return { error: 'fort-max' };
  }
  return { ok: true, work, tier: t, marks, forts: await fortsOf(db, key) };
}

/** THE BOARD'S READ (`/v1/seats/forts`): `{ ok, key, works }` - anyone the seats are open to. */
export async function readForts({ db }, player, env, { key } = {}) {
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  return { ok: true, key, ...(await fortsOf(db, key)) };
}

// ─── THE DROPS (7.5, 6.8, 9.1) ───────────────────────────────────────

/** THE CAPTURE'S STATEMENTS, for the result's own batch (seatSiege.js applyResult): every work at `key` a tier down. */
export function fortsCapturedStatements(db, key) {
  return [db.prepare('UPDATE town_seat_forts SET tier = MAX(0, tier - 1) WHERE key = ?').bind(key)];
}

// ─── THE SIEGE CAMP (4.2) ─────────────────────────────────────────────

/**
 * PITCH A SIEGE CAMP (`/v1/seats/camp`): `character`'s guild must have pledged the seat `key` this seat week and not hold
 * it, and the character be its Guildmaster or an Officer. SIEGE_CAMP_MARKS burnt from the treasury, once a guild and seat a week
 * (`camp`, once a `rid`). Answers `{ ok, key, marks }` or `{ error }`.
 * @param {{db: any, nowS: number}} ctx
 */
export async function pitchCamp(ctx, player, env, { character, key, rid } = {}) {
  const { db, nowS } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  if (typeof rid !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(rid)) return { error: 'bad-rid' };
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!SEAT_LEVER_RANKS.includes(Number(a.me.rank))) return { error: 'guild-rank' };
  const g = a.me.guild_id;
  const week = weekAt(nowS);
  const prior = await db.prepare("SELECT 1 FROM marks_ledger WHERE actor = ? AND rid = ? AND kind = 'camp'").bind(player.id, `${rid}:camp`).first();
  if (prior) return { ok: true, repeat: true, key, marks: SIEGE_CAMP_MARKS };
  if (await db.prepare('SELECT 1 FROM town_seat_holds WHERE key = ? AND guild_id = ?').bind(key, g).first()) return { error: 'camp-holder' };
  if (!(await db.prepare('SELECT 1 FROM town_seat_pledges WHERE week = ? AND key = ? AND guild_id = ?').bind(week, key, g).first())) return { error: 'seat-not-pledged' };
  if (await db.prepare('SELECT 1 FROM town_seat_camps WHERE week = ? AND key = ? AND guild_id = ?').bind(week, key, g).first()) return { error: 'camp-pitched' };
  if (await overRate(ctx, `seat-camp:${player.id}`, SEAT_EDICTS_HOUR, 3600)) return { error: 'seats-rate' };
  try {
    await db.batch([
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'guild', ?1, 'burn', NULL, 'camp', ?2, ?3, ?4, ?5, 'Siege Camp', ?6
        WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?2
          AND EXISTS (SELECT 1 FROM town_seat_pledges WHERE week = ?7 AND key = ?8 AND guild_id = ?1)
          AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?9 AND guild_id = ?1 AND rank IN (${SEAT_LEVER_RANKS.join(', ')}))`)
        .bind(g, SIEGE_CAMP_MARKS, utcDay(nowS), nowS, player.id, `${rid}:camp`, week, key, Number(a.me.rid)),
      mustChange(db),
      db.prepare('INSERT INTO town_seat_camps (week, key, guild_id, at) VALUES (?, ?, ?, ?)').bind(week, key, g, nowS),
    ]);
  } catch {
    const has = Number((await db.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').bind(g).first())?.balance ?? 0);
    return { error: has < SIEGE_CAMP_MARKS ? 'seat-treasury' : 'camp-pitched' };
  }
  return { ok: true, key, marks: SIEGE_CAMP_MARKS };
}

/**
 * THE SIEGE CAMPS AT THE TURNING (4.2): the week's camps read, each guild's Rams (fortLaw.js campRams) set on the battle the
 * Turning placed for `next` where its Right was won and a Gatehouse stands (`tierOf` the seat's tier), and every camp of the
 * week emptied.
 */
export async function campsSpent(db, week, next, rights, tierOf) {
  const { results = [] } = await db.prepare('SELECT key, guild_id FROM town_seat_camps WHERE week = ?').bind(week).all();
  if (!results.length) return [];
  const out = [];
  for (const c of results) {
    const key = Number(c.key);
    const won = (rights ?? []).some((r) => r.key === key && r.guild === c.guild_id);
    const gate = await fortTierAt(db, key, 'gatehouse');
    const rams = campRams({ paid: true, won, gated: tierOf(key) === 'crown' || gate >= 1 });
    if (rams > 0) out.push(db.prepare('UPDATE town_seat_battles SET rams = rams + ? WHERE week = ? AND key = ? AND attacker = ?').bind(rams, next, key, c.guild_id));
  }
  out.push(db.prepare('DELETE FROM town_seat_camps WHERE week = ?').bind(week));
  return out;
}

/**
 * A Season's end (9.1): every seat's works a tier down. AUDIT SEATS-3 A2 (7.5: "the Tithe's cap +1%" a tier): and a Tithe set
 * under a Market Hall the wear lowered, down to the cap its worn tier gives (marketHallTitheCap over the holder's tier, the
 * law's own numbers spelt out for SQL) - a palace's 11% under a first-tier Hall worn to nought is 10% from this Turning.
 */
export const fortsSeasonStatements = (db) => {
  const capSql = `CASE ${Object.entries(TITHE_CAP).flatMap(([t, c]) => Array.from({ length: fortMaxTier('market') + 1 }, (_, m) =>
    `WHEN town_seat_holds.tier = '${t}' AND COALESCE((SELECT f.tier FROM town_seat_forts f WHERE f.key = town_seat_holds.key AND f.work = 'market'), 0) = ${m} THEN ${marketHallTitheCap(c, m)}`)).join(' ')} END`;
  return [
    db.prepare('UPDATE town_seat_forts SET tier = MAX(0, tier - 1) WHERE tier > 0'),
    db.prepare(`UPDATE town_seat_holds SET tithe = ${capSql} WHERE tithe > ${capSql}`),
  ];
};
/**
 * AUDIT SEATS-2 S4: THE CAMPS' RAMS AFTER A SEASON'S WEAR, for the Turning's batch after fortsSeasonStatements: a palace's
 * battle placed for `next` keeps the Rams its challenger's camp sent it (campsSpent) only where a Gatehouse still stands once
 * the works are worn - the rest burnt (rams 0). A crown's gate always stands (6.2).
 */
export const campsWorn = (db, next) => db.prepare(`UPDATE town_seat_battles SET rams = 0 WHERE week = ? AND rams > 0 AND tier <> 'crown'
  AND NOT EXISTS (SELECT 1 FROM town_seat_forts f WHERE f.key = town_seat_battles.key AND f.work = 'gatehouse' AND f.tier >= 1)`).bind(next);

// ─── THE MARKET HALL (7.5: "the town's boards list 25% more; the Tithe's cap +1%") ───

/** A seat's Market Hall tier, or nought. */
const marketTierOf = async (db, key) => (await fortTiersOf(db, key)).market ?? 0;
/**
 * THE OPEN LISTINGS an account may hold, listing at the board at map pixel `board` (`[x, y]`, or null): the market's
 * MARKET_LISTINGS_MAX, a quarter more a tier where the board stands in a seat town with a Market Hall. DECIDED: the
 * board's town, not its bailiwick - "the town's boards".
 */
export async function listingsCapAt(db, nowS, board) {
  if (!Array.isArray(board)) return MARKET_LISTINGS_MAX;
  if (!(await db.prepare("SELECT 1 FROM town_seat_forts WHERE work = 'market' AND tier > 0 LIMIT 1").first())) return MARKET_LISTINGS_MAX;
  // MARKET-SPEED: the seats' places off the isolate's kept witness rows - every market read asked them whole
  const seat = [...(await confirmedSeats(db, nowS)).values()].find((x) => x.pixel?.[0] === board[0] && x.pixel?.[1] === board[1]);
  return seat ? marketHallListings(MARKET_LISTINGS_MAX, await marketTierOf(db, seat.key)) : MARKET_LISTINGS_MAX;
}
/** A held seat's Tithe cap: its tier's, a point more a Market Hall tier. */
export const titheCapAt = async (db, key, tier) => marketHallTitheCap(TITHE_CAP[tier] ?? 0, await marketTierOf(db, key));
