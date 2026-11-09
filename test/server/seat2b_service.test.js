// SEAT2b: A SEAT'S FORTIFICATIONS AS THE SERVICE KEEPS THEM - a tier funded in Marks alone by the holder's Guildmaster or
// Officer, burnt from the treasury and standing at once; who may raise what; the drops; the Siege Camp pitched for
// Marks and spent at the Turning (7.5, 4.2; server-account/src/seatForts.js). Driven through the
// real Worker over node:sqlite with every migration applied (test/accountDb.mjs). `06-Systems/Online-Arc.md` SEAT2b.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, T0 } from '../accountDb.mjs';
import { seatReportText, seatWeekOf, SEAT_MEMBER_WAIT_S, chronicleLine } from '../../src/net/townSeatLaw.js';
import { fortsCapturedStatements, fortsSeasonStatements, campsSpent, campsWorn } from '../../server-account/src/seatForts.js';
import { CAMP_MARKS, CAMP_RAMS } from '../../src/net/fortLaw.js';
import { readFileSync } from 'node:fs';

const ANTICLERE = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace', pixel: [402, 151] };
const ASHFIELD = { key: 3022, name: 'Ashfield', region: 21, tier: 'palace', pixel: [470, 160] };
const ALCAIRE = { key: 3034, name: 'Alcaire Keep', region: 34, tier: 'palace', pixel: [520, 130] };
const WAYREST = { key: 5023, name: 'Wayrest', region: 23, tier: 'crown', pixel: [590, 166] };
const DAY = 86400;
const W = seatWeekOf(T0 * 1000);
let _rid = 0;
const rid = () => `fort-${String(++_rid).padStart(6, '0')}`;

async function stood(t) {
  let now = T0;
  t.mock.method(Date, 'now', () => now * 1000);
  const svc = await standService({ SEATS_OPEN: 'on', MARKS_OPEN: 'on', PROFESSIONS_OPEN: 'on', BOARD_OPEN: 'on' });
  const raw = svc.env.DB._raw;
  const witnesses = [await svc.guest(), await svc.guest(), await svc.guest()];
  for (const seat of [ANTICLERE, ASHFIELD, ALCAIRE, WAYREST]) for (const w of witnesses) raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('seat', ?, ?, ?, ?, ?)").run(String(seat.key), w.id, seatReportText(seat), seat.region, T0 - DAY);
  raw.prepare('INSERT INTO town_seat_weeks (week, settled_at) VALUES (?, ?)').run(W - 1, T0);
  const guild = async (handle, name, tag) => {
    const gm = await svc.registered(handle, { renown: 12 });
    assert.equal((await svc.found(gm, { name, tag })).status, 200);
    const gid = raw.prepare('SELECT guild_id FROM guild_members WHERE player = ? AND char_id = ?').get(gm.id, gm.character).guild_id;
    raw.prepare('UPDATE guild_members SET joined_at = ? WHERE guild_id = ?').run(T0 - SEAT_MEMBER_WAIT_S - DAY, gid);
    return { gm, gid };
  };
  const member = async (g, handle, rank) => {
    const m = await svc.registered(handle);
    raw.prepare('INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, ?, ?, ?, ?)').run(m.id, m.character, g.gid, rank, handle, T0 - 30 * DAY);
    return m;
  };
  const treasury = (gid, n) => raw.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
    VALUES ('mint', NULL, 'guild', ?, 'test', ?, 1, 1, 'seed', NULL, ?)`).run(gid, n, `seed-${gid}-${n}-${Math.random().toString(36).slice(2, 10)}`);
  const purse = (gid) => Number(raw.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').get(gid)?.balance ?? 0);
  const hold = (seat, gid) => raw.prepare(`INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at, tithe, owed)
    VALUES (?, ?, ?, ?, ?, 50, NULL, ?, 6, 0)`).run(seat.key, gid, seat.region, seat.tier, W - 1, T0 - 7 * DAY);
  const fund = async (who, key, work, o = {}) => (await svc.call('/v1/seats/fort/fund', { character: who.character, key, work, rid: rid(), ...o }, who.secret));
  const forts = async (who, key) => (await svc.call('/v1/seats/forts', { key }, who.secret)).body;
  const chronicle = (key) => raw.prepare('SELECT kind, week, data FROM town_seat_history WHERE key = ? ORDER BY seq').all(key).map((r) => ({ kind: r.kind, week: r.week, data: JSON.parse(r.data) }));
  return { svc, raw, guild, member, treasury, purse, hold, fund, forts, chronicle, at: (s) => { now = s; } };
}

test('SEAT2b A TIER FUNDED: the holder\'s Officer raises the Walls\' first tier for its 700 Marks, burnt from the treasury, and it stands at once; a Member, another guild, a short treasury, a work the seat may not raise and a work at its top tier refused; the same rid twice is one burn; the next tier costs its own Marks (mutants: the rank; the holder; the Marks; the next tier; the rid)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  s.hold(ANTICLERE, sh.gid);
  const off = await s.member(sh, 'Ofelia', 1), mem = await s.member(sh, 'Menno', 2);
  assert.equal((await s.fund(off, ANTICLERE.key, 'walls')).body.error, 'seat-treasury');
  s.treasury(sh.gid, 3500);
  assert.equal((await s.fund(mem, ANTICLERE.key, 'walls')).body.error, 'guild-rank');
  assert.equal((await s.fund(eo.gm, ANTICLERE.key, 'walls')).body.error, 'seat-not-held');
  assert.equal((await s.fund(off, ANTICLERE.key, 'moat')).body.error, 'bad-work');
  assert.equal((await s.fund(off, ANTICLERE.key, 'walls', { rid: 'x' })).body.error, 'bad-rid');
  assert.equal((await s.fund(off, ANTICLERE.key, 'gatehouse')).body.error, 'fort-not-here', 'a palace without tier-3 Walls has no gate');
  assert.equal((await s.fund(off, ANTICLERE.key, 'harbour')).body.error, 'fort-not-here', 'nor a harbour inland');
  assert.deepEqual((await s.forts(off, ANTICLERE.key)).works, {}, 'nothing refused raised a thing');
  assert.equal(s.purse(sh.gid), 3500, 'nothing refused burnt a Mark');
  const r = await s.fund(off, ANTICLERE.key, 'walls', { rid: 'fort-walls-01' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.tier, r.body.marks, r.body.forts.works.walls], [1, 700, { tier: 1 }]);
  assert.equal(s.purse(sh.gid), 2800, 'burnt');
  assert.deepEqual(s.raw.prepare("SELECT src_kind, dst_kind, amount FROM marks_ledger WHERE kind = 'fort'").all().map((x) => [x.src_kind, x.dst_kind, x.amount]), [['guild', 'burn', 700]]);
  assert.deepEqual((await s.forts(mem, ANTICLERE.key)).works, { walls: { tier: 1 } }, 'the tier stands at once, to every reader');
  assert.equal((await s.fund(off, ANTICLERE.key, 'walls', { rid: 'fort-walls-01' })).body.repeat, true, 'the same rid: no second tier, no second burn');
  assert.equal(s.purse(sh.gid), 2800);
  const two = await s.fund(off, ANTICLERE.key, 'walls');
  assert.deepEqual([two.body.tier, two.body.marks], [2, 2000]);
  assert.equal(s.purse(sh.gid), 800);
  assert.equal((await s.fund(off, ANTICLERE.key, 'walls')).body.error, 'seat-treasury', 'tier 3 costs 5,300');
  assert.equal((await s.fund(off, ANTICLERE.key, 'shrine')).status, 200, 'another work beside it');
  assert.equal(s.purse(sh.gid), 100);
  const row = s.chronicle(ANTICLERE.key).filter((c) => c.kind === 'fort-raised')[0];
  assert.equal(row.data.work, 'walls');
  assert.equal(chronicleLine(row, ANTICLERE), 'In week ' + W + ', Anticlere\'s Walls stood at their first tier.');
});

test('SEAT2b WHAT MAY STAND: a palace\'s Gatehouse once its Walls stand at tier 3; a crown\'s at once; a work at its last tier refused (mutants: the gate\'s rule; the last tier)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  s.hold(ANTICLERE, sh.gid); s.hold(WAYREST, eo.gid);
  s.treasury(sh.gid, 50_000); s.treasury(eo.gid, 50_000);
  assert.equal((await s.fund(eo.gm, WAYREST.key, 'gatehouse')).status, 200, 'a crown\'s gate');
  s.raw.prepare("INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?, 'walls', 3, ?)").run(ANTICLERE.key, T0);
  assert.equal((await s.fund(sh.gm, ANTICLERE.key, 'walls')).body.error, 'fort-max');
  assert.equal((await s.fund(sh.gm, ANTICLERE.key, 'gatehouse')).status, 200, 'tier 3 Walls gain a gate of their own');
  s.raw.prepare("INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?, 'shrine', 2, ?)").run(ANTICLERE.key, T0);
  assert.equal((await s.fund(sh.gm, ANTICLERE.key, 'shrine')).body.error, 'fort-max', 'a Shrine has two');
});

test('SEAT2b THE DROPS: a capture takes every work a tier down; a Season\'s end every work a tier down and the Tithe to the worn Market Hall\'s cap; a worn palace\'s camp Rams burn where no Gatehouse is left (mutants: the drop; the floor; the Tithe clamp; the Rams)', async (t) => {
  const s = await stood(t);
  const db = s.svc.env.DB;
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  s.hold(ANTICLERE, sh.gid);
  const put = (work, tier) => s.raw.prepare('INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?, ?, ?, ?)').run(ANTICLERE.key, work, tier, T0);
  put('walls', 2); put('shrine', 1); put('market', 1); put('gatehouse', 1);
  const tiers = () => Object.fromEntries(s.raw.prepare('SELECT work, tier FROM town_seat_forts WHERE key = ?').all(ANTICLERE.key).map((r) => [r.work, r.tier]));
  await db.batch(fortsCapturedStatements(db, ANTICLERE.key));
  assert.deepEqual(tiers(), { walls: 1, shrine: 0, market: 0, gatehouse: 0 }, 'a tier down, none under nought');
  s.raw.prepare("UPDATE town_seat_forts SET tier = 3 WHERE work = 'walls'").run();
  s.raw.prepare("UPDATE town_seat_forts SET tier = 1 WHERE work IN ('market', 'gatehouse')").run();
  s.raw.prepare('UPDATE town_seat_holds SET tithe = 11 WHERE key = ?').run(ANTICLERE.key);
  s.raw.prepare("INSERT INTO town_seat_battles (week, key, kind, tier, attacker, defender, starts_at, ends_at, at, rams) VALUES (?, ?, 'siege', 'palace', 'ga', 'gx', ?, ?, ?, 3)").run(W + 1, ANTICLERE.key, T0 + 7 * DAY, T0 + 7 * DAY + 7200, T0);
  await db.batch(fortsSeasonStatements(db));
  assert.deepEqual(tiers(), { walls: 2, shrine: 0, market: 0, gatehouse: 0 }, 'a Season\'s wear');
  assert.equal(s.raw.prepare('SELECT tithe FROM town_seat_holds WHERE key = ?').get(ANTICLERE.key).tithe, 10, 'a palace\'s 11% under a Market Hall worn to nought: its bare 10');
  await db.batch([campsWorn(db, W + 1)]);
  assert.equal(s.raw.prepare('SELECT rams FROM town_seat_battles WHERE week = ? AND key = ?').get(W + 1, ANTICLERE.key).rams, 0, 'no Gatehouse left: the Rams burnt');
});

test('SEAT2b THE MARKET HALL: the holder\'s Tithe may stand a point higher a tier; an account listing at a board in its town may hold a quarter more listings a tier - not at another town\'s board (mutants: the cap\'s point; the town\'s board; the quarter)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  s.hold(ANTICLERE, sh.gid);
  const tithe = (pct) => s.svc.call('/v1/seats/tithe', { character: sh.gm.character, key: ANTICLERE.key, pct }, sh.gm.secret);
  assert.equal((await tithe(11)).body.error, 'bad-tithe', 'a palace\'s ten');
  s.raw.prepare("INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?, 'market', 1, ?)").run(ANTICLERE.key, T0);
  assert.equal((await tithe(12)).body.error, 'bad-tithe');
  assert.deepEqual((await tithe(11)).body, { ok: true, tithe: 11 });
  const seller = await s.svc.registered('Selma');
  s.raw.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, 'ore:mithril', 'own', 4000)`).run(seller.id, seller.character);
  s.raw.prepare('INSERT INTO marks (account, balance) VALUES (?, 100000)').run(seller.id);
  const list = async (board) => (await s.svc.call('/v1/market/list', { character: seller.character, kind: 'material', material: 'ore:mithril', region: 21, units: 1, price: 5, hubs: { 21: [402, 151] }, rid: rid(), ...(board ? { board } : {}) }, seller.secret)).body;
  for (let i = 0; i < 30; i++) assert.equal((await list([470, 160])).ok, true, `listing ${i}`);
  // the market's own window: posts an hour - so the clock moves on between batches
  s.at(T0 + 3 * 3600);
  assert.equal((await list([470, 160])).error, 'market-listings-max', 'another town\'s board: thirty');
  assert.equal((await list([402, 160])).error, 'market-listings-max', 'a board in Anticlere\'s column, another row: thirty');
  for (let i = 0; i < 7; i++) assert.equal((await list([402, 151])).ok, true, `Anticlere's board, listing ${31 + i}`);
  assert.equal((await list([402, 151])).error, 'market-listings-max', 'thirty-seven at a tier-1 Market Hall');
});

test('SEAT2b ASKED AGAIN: a work the seat may not raise is refused before the hour\'s rate is asked - six refusals spend none of it, and a work begins after them (mutants: the order of the checks)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  s.hold(ANTICLERE, sh.gid);
  s.treasury(sh.gid, 20_000);
  for (let i = 0; i < 6; i++) assert.equal((await s.fund(sh.gm, ANTICLERE.key, 'gatehouse')).body.error, 'fort-not-here', 'ask ' + (i + 1));
  assert.equal((await s.fund(sh.gm, ANTICLERE.key, 'shrine')).status, 200, 'the rate untouched by the refusals');
});

test('SEAT2b THE TURNING WIRES THE CAMPS AND THE WEAR: the Turning spends the camps and a Season\'s end wears the works and burns the Rams of a worn-out gate (mutants: the hooks)', () => {
  const src = (f) => readFileSync(new URL('../../server-account/src/' + f, import.meta.url), 'utf8');
  assert.match(src('seatTurning.js'), /stmts.push(\.\.\.(await campsSpent(db, week, next, plan.rights, (k) => registry.get(k)?.tier ?? 'palace')));/, 'the Turning spends the camps');
  assert.match(src('seatTurning.js'), /if (!wipe) stmts.push(\.\.\.fortsSeasonStatements(db));/, 'a Season\'s end wears the works');
  assert.match(src('seatTurning.js'), /if (!wipe) stmts.push(campsWorn(db, next));/, 'and the worn gate\'s Rams');
});

test('SEAT2b A SIEGE CAMP PITCHED: the pledged challenger\'s Guildmaster or Officer burns 1,500 Marks from its treasury, once a guild and seat a week; the holder, an unpledged guild, a Member, a short treasury and the option off refused; the same rid twice is one burn, a new rid for the same week is camp-pitched (mutants: the rank; the pledge; the holder; the price; the once-a-week; the rid)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  const dg = await s.guild('Doran', 'Daggers', 'DG');
  s.hold(ANTICLERE, sh.gid);
  for (const g of [sh, dg]) s.treasury(g.gid, 5000);
  s.raw.prepare('INSERT INTO town_seat_pledges (week, guild_id, region, key, set_by, at) VALUES (?, ?, ?, ?, ?, ?)').run(W, eo.gid, ANTICLERE.region, ANTICLERE.key, 'x', T0);
  const off = await s.member(eo, 'Ofelia', 1), mem = await s.member(eo, 'Menno', 2);
  const camp = async (who, key = ANTICLERE.key, o = {}) => (await s.svc.call('/v1/seats/camp', { character: who.character, key, rid: rid(), ...o }, who.secret));
  const camps = () => s.raw.prepare('SELECT week, key, guild_id FROM town_seat_camps').all().map((r) => [r.week, r.key, r.guild_id]);
  assert.equal((await camp(sh.gm)).body.error, 'camp-holder', 'the holder pitches none, whatever its treasury');
  assert.equal((await camp(dg.gm)).body.error, 'seat-not-pledged', 'a guild that pledged nothing');
  assert.equal((await camp(eo.gm, WAYREST.key)).body.error, 'seat-not-pledged', 'nor another seat than the one pledged');
  assert.equal((await camp(mem)).body.error, 'guild-rank');
  assert.equal((await camp(eo.gm, ANTICLERE.key, { rid: 'x' })).body.error, 'bad-rid');
  assert.equal((await camp(eo.gm)).body.error, 'seat-treasury', 'the Oath holds no Marks yet');
  assert.deepEqual(camps(), []);
  s.treasury(eo.gid, 1499);
  assert.equal((await camp(eo.gm)).body.error, 'seat-treasury', 'one Mark short');
  s.treasury(eo.gid, 2501);
  const a = await camp(off, ANTICLERE.key, { rid: 'camp-pitch-01' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.deepEqual([a.body.ok, a.body.key, a.body.marks], [true, ANTICLERE.key, CAMP_MARKS]);
  assert.equal(CAMP_MARKS, 1500);
  assert.equal(s.purse(eo.gid), 2500, 'burnt');
  assert.deepEqual(s.raw.prepare("SELECT src_kind, dst_kind, amount FROM marks_ledger WHERE kind = 'camp'").all().map((x) => [x.src_kind, x.dst_kind, x.amount]), [['guild', 'burn', 1500]]);
  assert.deepEqual(camps(), [[W, ANTICLERE.key, eo.gid]]);
  assert.equal((await camp(off, ANTICLERE.key, { rid: 'camp-pitch-01' })).body.repeat, true, 'the same rid: one camp, one burn');
  assert.equal((await camp(eo.gm)).body.error, 'camp-pitched', 'a new rid, the same guild, seat and week');
  assert.equal(s.purse(eo.gid), 2500);
  assert.equal(camps().length, 1);
  s.svc.env.SEATS_SIEGE_WORKS = 'off';
  try { assert.equal((await camp(eo.gm)).body.error, 'seat-option-off'); } finally { delete s.svc.env.SEATS_SIEGE_WORKS; }
});

test('SEAT2b THE CAMPS SPENT: a camp whose guild won the Right brings its Rams to next week\'s battle where a Gatehouse stands (a crown\'s own, or one raised); a palace with none and a camp that lost the Right bring none; every camp of the week emptied, another week\'s kept (mutants: the gate; the Right; the Rams; the emptying; the week)', async (t) => {
  const s = await stood(t);
  const db = s.svc.env.DB;
  const camp = (week, key, g) => s.raw.prepare('INSERT INTO town_seat_camps (week, key, guild_id, at) VALUES (?, ?, ?, ?)').run(week, key, g, T0);
  const battle = (seat, attacker) => s.raw.prepare("INSERT INTO town_seat_battles (week, key, kind, tier, attacker, defender, starts_at, ends_at, at) VALUES (?, ?, 'siege', ?, ?, 'gx', ?, ?, ?)")
    .run(W + 1, seat.key, seat.tier, attacker, T0 + 7 * DAY, T0 + 7 * DAY + 7200, T0);
  camp(W, WAYREST.key, 'ga'); battle(WAYREST, 'ga');       // a crown: its gate always stands
  camp(W, ANTICLERE.key, 'gb'); battle(ANTICLERE, 'gb');   // a palace with a raised Gatehouse
  camp(W, ASHFIELD.key, 'gc'); battle(ASHFIELD, 'gc');     // a palace with none
  camp(W, ALCAIRE.key, 'gd'); battle(ALCAIRE, 'gx');       // a Gatehouse, but the Right went to another guild
  camp(W + 5, ANTICLERE.key, 'gz');
  for (const seat of [ANTICLERE, ALCAIRE]) s.raw.prepare("INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?, 'gatehouse', 1, ?)").run(seat.key, T0);
  const rights = [{ key: WAYREST.key, guild: 'ga' }, { key: ANTICLERE.key, guild: 'gb' }, { key: ASHFIELD.key, guild: 'gc' }, { key: ALCAIRE.key, guild: 'gx' }];
  const tierOf = (k) => [WAYREST, ANTICLERE, ASHFIELD, ALCAIRE].find((x) => x.key === k).tier;
  const rams = () => Object.fromEntries(s.raw.prepare('SELECT key, rams FROM town_seat_battles WHERE week = ?').all(W + 1).map((r) => [r.key, r.rams]));
  await db.batch(await campsSpent(db, W, W + 1, rights, tierOf));
  assert.equal(CAMP_RAMS, 3);
  assert.deepEqual(rams(), { [WAYREST.key]: CAMP_RAMS, [ANTICLERE.key]: CAMP_RAMS, [ASHFIELD.key]: 0, [ALCAIRE.key]: 0 });
  assert.deepEqual(s.raw.prepare('SELECT week, key FROM town_seat_camps').all().map((r) => [r.week, r.key]), [[W + 5, ANTICLERE.key]], 'the week\'s camps emptied, another week\'s kept');
  assert.deepEqual(await campsSpent(db, W, W + 1, rights, tierOf), [], 'no camp, nothing to run');
});
