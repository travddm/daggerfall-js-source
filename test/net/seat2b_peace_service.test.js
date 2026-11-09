// SEAT2b part two: THE WORKS AT PEACE AS THE SERVICE KEEPS
// THEM - the Shrine's 50 a gate felled in the region to its holder, at the board
// and at the Turning, and its Standing a week; the Watchtowers' word to the holder's members alone; the crafting halls'
// steps for the holder's members crafting in its town; each seat's works on the seats' list (7.5; Professions-Arc 3.3, 4.8;
// server-account/src/seatForts.js, seatInfluence.js, seatTurning.js, professions.js). Driven through the real
// Worker over node:sqlite with every migration applied (test/accountDb.mjs). `06-Systems/Online-Arc.md` SEAT2b part two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, T0 } from '../accountDb.mjs';
import { seatReportText, seatWeekOf, seatWeekStartMs, SEAT_MEMBER_WAIT_S } from '../../src/net/townSeatLaw.js';
import { gameDayAt, gateTimes } from '../../src/net/gate/gateLaw.js';
import { xpForRank } from '../../src/net/professionLaw.js';
import { recipeById } from '../../src/net/recipeLaw.js';

const ANTICLERE = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace', pixel: [402, 151] };
const ASHFIELD = { key: 3022, name: 'Ashfield', region: 21, tier: 'palace', pixel: [470, 160] };
const ALCAIRE = { key: 3034, name: 'Alcaire Keep', region: 34, tier: 'palace', pixel: [520, 130] };
const YKALON = { key: 3040, name: 'Ykalon', region: 40, tier: 'palace', pixel: [560, 100] };
const WAYREST = { key: 5023, name: 'Wayrest', region: 23, tier: 'crown', pixel: [590, 166] };
const DAY = 86400;
const W = seatWeekOf(T0 * 1000);
const turning = (w) => Math.floor(seatWeekStartMs(w + 1) / 1000);
const AFTER = (w) => turning(w) + 3 * 3600;   // three hours past week w's Turning
let _rid = 0;
const rid = () => `peace-${String(++_rid).padStart(6, '0')}`;
const realRandom = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
/** The service's dice steered: every four-byte draw all `b` while `fn` runs (prof3_service.test.js's). */
async function steered(b, fn) {
  globalThis.crypto.getRandomValues = (arr) => (arr.byteLength === 4 ? (new Uint8Array(arr.buffer, arr.byteOffset, 4).fill(b), arr) : realRandom(arr));
  try { return await fn(); } finally { globalThis.crypto.getRandomValues = realRandom; }
}

async function stood(t) {
  let now = T0;
  t.mock.method(Date, 'now', () => now * 1000);
  const svc = await standService({ SEATS_OPEN: 'on', MARKS_OPEN: 'on', PROFESSIONS_OPEN: 'on', BOARD_OPEN: 'on' });
  const raw = svc.env.DB._raw;
  const witnesses = [await svc.guest(), await svc.guest(), await svc.guest()];
  for (const seat of [ANTICLERE, ASHFIELD, ALCAIRE, YKALON, WAYREST]) for (const w of witnesses) raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('seat', ?, ?, ?, ?, ?)").run(String(seat.key), w.id, seatReportText(seat), seat.region, T0 - DAY);
  raw.prepare('INSERT INTO town_seat_weeks (week, settled_at) VALUES (?, ?)').run(W - 1, T0);
  const guild = async (handle, name, tag) => {
    const gm = await svc.seated(handle, { renown: 12 });
    assert.equal((await svc.found(gm, { name, tag })).status, 200);
    const gid = raw.prepare('SELECT guild_id FROM guild_members WHERE player = ? AND char_id = ?').get(gm.id, gm.character).guild_id;
    raw.prepare('UPDATE guild_members SET joined_at = ? WHERE guild_id = ?').run(T0 - SEAT_MEMBER_WAIT_S - DAY, gid);
    return { gm, gid };
  };
  const member = async (g, handle, rank) => {
    const m = await svc.seated(handle);
    raw.prepare('INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, ?, ?, ?, ?)').run(m.id, m.character, g.gid, rank, handle, T0 - 30 * DAY);
    return m;
  };
  const treasury = (gid, n) => raw.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
    VALUES ('mint', NULL, 'guild', ?, 'test', ?, 1, 1, 'seed', NULL, ?)`).run(gid, n, `seed-${gid}-${n}-${Math.random().toString(36).slice(2, 10)}`);
  const hold = (seat, gid, o = {}) => raw.prepare(`INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at, tithe, owed)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`).run(seat.key, gid, seat.region, seat.tier, W - 1, o.standing ?? 50, T0 - 7 * DAY, o.tithe ?? 6);
  const held = (key) => raw.prepare('SELECT * FROM town_seat_holds WHERE key = ?').get(key) ?? null;
  const pledge = (gid, seat, week = W) => raw.prepare('INSERT INTO town_seat_pledges (week, guild_id, region, key, set_by, at) VALUES (?, ?, ?, ?, ?, ?)').run(week, gid, seat.region, seat.key, 'x', T0);
  /** `amount` of the Watch for `gid` at `seat`, from a fresh account bound to it (seat1d_service.test.js's) */
  const watch = async (gid, seat, amount = 100, week = W) => {
    const a = await svc.guest();
    raw.prepare('INSERT INTO town_seat_binds (week, account, guild_id, char_id, at) VALUES (?, ?, ?, ?, ?)').run(week, a.id, gid, 'c', T0);
    raw.prepare(`INSERT INTO town_seat_influence (week, key, guild_id, account, char_id, source, amount, region, day, ref, at)
      VALUES (?, ?, ?, ?, 'c', 'watch', ?, ?, 1, ?, ?)`).run(week, seat.key, gid, a.id, amount, seat.region, `t:${a.id}:${week}`, T0);
  };
  const work = (seat, w, tier) => raw.prepare(`INSERT INTO town_seat_forts (key, work, tier, at) VALUES (?, ?, ?, ?)
    ON CONFLICT (key, work) DO UPDATE SET tier = excluded.tier`).run(seat.key, w, tier, T0);
  const give = (who, m, origin, qty) => raw.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = excluded.qty`).run(who.id, who.character, m, origin, qty);
  const stores = (who, m) => raw.prepare('SELECT origin, qty FROM prof_stores WHERE player = ? AND char_id = ? AND material = ? AND qty > 0 ORDER BY origin').all(who.id, who.character, m).map((r) => [r.origin, Number(r.qty)]);
  const setXp = (who, prof, xp, { spec50 = null, spec100 = null } = {}) => raw.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, spec50, spec100, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = excluded.xp, spec50 = excluded.spec50, spec100 = excluded.spec100`).run(who.id, who.character, prof, xp, spec50, spec100, T0);
  const standings = async (who, key) => (await svc.call('/v1/seats/standings', { key, character: who.character }, who.secret)).body;
  const list = async (who) => (await svc.call('/v1/seats/list', {}, who.secret)).body;
  /** `n` game days whose gate rose in week W before `beforeS`, each agreed on `region` by three claims (GATE_REGION_AGREE) -
   *  and one more that only two agree on */
  const gates = async (region, n, beforeS) => {
    const start = seatWeekStartMs(W);
    const days = [];
    for (let d = gameDayAt(start); days.length < n + 1; d++) { const r = gateTimes(d).riseAt; if (r >= start && r < beforeS * 1000) days.push(d); else if (r >= beforeS * 1000) break; }
    assert.equal(days.length, n + 1, 'the week holds the gate days the test asks');
    const claimers = [await svc.guest(), await svc.guest(), await svc.guest()];
    for (const d of days.slice(0, n)) for (const c of claimers) raw.prepare("INSERT INTO gate_kills (day, account, boss, earned, at, region) VALUES (?, ?, 'ruhn', 'x', ?, ?)").run(d, c.id, T0, region);
    for (const c of claimers.slice(0, 2)) raw.prepare("INSERT INTO gate_kills (day, account, boss, earned, at, region) VALUES (?, ?, 'ruhn', 'x', ?, ?)").run(days[n], c.id, T0, region);   // two agree: no region
  };
  return { svc, raw, guild, member, treasury, hold, held, pledge, watch, work, give, stores, setXp, standings, list, gates, at: (s) => { now = s; } };
}

test('SEAT2b part two THE SHRINE: its holder\'s week at the seat gains 50 a tier for each gate felled in the region this week (two agreed days at tier 2: 200), shown as the Shrine\'s; a challenger and a seat without one gain none, a day two claims agree on is no gate; the Turning counts it in the defence - a challenger past the bare defence wins no Right where the Shrine stands - and its Standing a week (mutants: the 50; the tier; the region; the agreement; the holder alone; the Turning\'s defence; the Standing row)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  const ic = await s.guild('Cyril', 'Iron Circle', 'IC');
  const dg = await s.guild('Doran', 'Daggers', 'DG');
  const lo = await s.guild('Lorna', 'Low Tide', 'LT');
  const yk = await s.guild('Yorick', 'Yew Keepers', 'YK');
  for (const g of [sh, eo, ic, dg, lo, yk]) s.treasury(g.gid, 20_000);
  s.hold(ANTICLERE, sh.gid); s.hold(ASHFIELD, eo.gid); s.hold(ALCAIRE, lo.gid); s.hold(YKALON, yk.gid);
  s.work(ANTICLERE, 'shrine', 2);
  s.work(ALCAIRE, 'shrine', 1);
  for (let i = 0; i < 3; i++) { await s.watch(sh.gid, ANTICLERE, 2000); await s.watch(eo.gid, ASHFIELD, 2000); }
  s.pledge(ic.gid, ANTICLERE); s.pledge(dg.gid, ASHFIELD);
  for (let i = 0; i < 3; i++) { await s.watch(ic.gid, ANTICLERE, 2000); await s.watch(dg.gid, ASHFIELD, 2000); }
  await s.watch(ic.gid, ANTICLERE, 100); await s.watch(dg.gid, ASHFIELD, 100);
  await s.watch(lo.gid, ALCAIRE, 500); await s.watch(yk.gid, YKALON, 500);
  const late = turning(W) - 3600;
  await s.gates(ANTICLERE.region, 2, late);
  s.at(late);
  const st = await s.standings(sh.gm, ANTICLERE.key);
  const mine = st.standings.find((x) => x.guild.id === sh.gid);
  assert.deepEqual([mine.influence, mine.shrine], [6000 + 200, 200], 'two gates at tier 2: 2 x 100');
  assert.equal(st.standings.find((x) => x.guild.id === ic.gid).shrine, undefined, 'a challenger\'s week has no Shrine');
  assert.equal(st.defence, 6200, 'the defence stands on it');
  const ash = await s.standings(eo.gm, ASHFIELD.key);
  assert.deepEqual([ash.standings.find((x) => x.guild.id === eo.gid).influence, ash.standings.find((x) => x.guild.id === eo.gid).shrine], [6000, undefined], 'the same region\'s gates, no Shrine');
  const alc = await s.standings(lo.gm, ALCAIRE.key);
  assert.equal(alc.standings.find((x) => x.guild.id === lo.gid).influence, 500, 'a Shrine in a region no gate fell in: nothing');
  s.at(AFTER(W));
  const seats = (await s.list(sh.gm)).seats;
  const battle = (k) => seats.find((x) => x.key === k)?.battle ?? null;
  assert.equal(battle(ANTICLERE.key), null, 'the Iron Circle\'s 6,100 does not pass a defence of 6,200');
  assert.deepEqual([battle(ASHFIELD.key)?.kind, battle(ASHFIELD.key)?.guild.tag], ['siege', 'DG'], 'the Daggers\' 6,100 passes a bare 6,000');
  assert.equal(s.held(ALCAIRE.key).standing - s.held(YKALON.key).standing, 1, 'a tier-1 Shrine: Standing +1 a week, the rest the same');
});

test('SEAT2b part two THE WATCHTOWERS: the holder\'s members read every challenger at or past half the defence (tier 1) - a quarter at tier 2 - named; a challenger\'s reader and a seat without towers hear nothing (mutants: the share; the members alone; the tier; the names)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  const eo = await s.guild('Horst', 'Ebon Oath', 'EO');
  const dg = await s.guild('Doran', 'Daggers', 'DG');
  s.hold(ANTICLERE, sh.gid); s.hold(ASHFIELD, dg.gid);
  await s.watch(sh.gid, ANTICLERE, 1000);
  s.pledge(eo.gid, ANTICLERE); s.pledge(dg.gid, ANTICLERE);
  await s.watch(eo.gid, ANTICLERE, 600); await s.watch(dg.gid, ANTICLERE, 400);
  const mem = await s.member(sh, 'Menno', 2);
  let st = await s.standings(mem, ANTICLERE.key);
  assert.equal(st.defence, 1000);
  assert.equal('towers' in st, false, 'no towers, no word');
  s.work(ANTICLERE, 'watchtowers', 1);
  st = await s.standings(mem, ANTICLERE.key);
  assert.deepEqual(st.towers, [{ guild: eo.gid, influence: 600, share: 0.5, name: 'Ebon Oath', tag: 'EO' }], 'half of 1,000: the Oath\'s 600, not the Daggers\' 400');
  assert.equal('towers' in (await s.standings(eo.gm, ANTICLERE.key)), false, 'a challenger hears nothing');
  assert.equal('towers' in (await s.standings(dg.gm, ANTICLERE.key)), false, 'another seat\'s holder neither');
  s.work(ANTICLERE, 'watchtowers', 2);
  st = await s.standings(sh.gm, ANTICLERE.key);
  assert.deepEqual(st.towers.map((w) => [w.tag, w.share]), [['EO', 0.25], ['DG', 0.25]], 'tier 2 stood: a quarter - the Daggers\' 400 past 250');
  s.work(ANTICLERE, 'watchtowers', 1);
  assert.deepEqual((await s.standings(sh.gm, ANTICLERE.key)).towers.map((w) => w.share), [0.5], 'a tier dropped at a Season: half again');
});

test('SEAT2b part two THE CRAFTING HALLS: a holder\'s member crafting in its town takes a step a tier of the hall of its profession - the Forge\'s two for a smith, the Workshop\'s one for a carpenter; nobody else, nowhere else, and no other profession\'s hall (mutants: the member; the seat; the tier; the profession)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  s.hold(ANTICLERE, sh.gid);
  s.work(ANTICLERE, 'forge', 2);
  s.work(ANTICLERE, 'workshop', 1);
  const smith = await s.member(sh, 'Smithson', 2);
  const stranger = await s.svc.seated('Stranger');
  const craft = async (who, recipe, seat, b = 0x00) => {
    for (const inp of recipeById(recipe).inputs) s.give(who, inp.key, 'own', inp.n);
    const res = await steered(b, () => s.svc.call('/v1/prof/craft', { character: who.character, recipe, clean: false, name: 'Hollin', rid: rid(), ...(seat == null ? {} : { seat }) }, who.secret));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.quality;
  };
  for (const who of [smith, stranger]) { s.setXp(who, 'smithing', xpForRank(55)); }
  assert.equal(await craft(smith, 'longsword:mithril', null), 0, 'margin 0, the roll\'s bottom: Crude');
  assert.equal(await craft(smith, 'longsword:mithril', ANTICLERE.key), 2, 'the Forge at tier 2: two steps - Fine');
  assert.equal(await craft(stranger, 'longsword:mithril', ANTICLERE.key), 0, 'not the holder\'s');
  assert.equal(await craft(smith, 'longsword:mithril', ASHFIELD.key), 0, 'a town the guild does not hold');
  assert.equal(await craft(smith, 'longsword:mithril', -1), 0, 'a bad word is none');
  s.setXp(smith, 'building', xpForRank(recipeById('chair:oak').rank));
  assert.equal(await craft(smith, 'chair:oak', ANTICLERE.key), 1, 'the Workshop at tier 1: a carpenter\'s step');
  s.raw.prepare("DELETE FROM town_seat_forts WHERE key = ? AND work = 'workshop'").run(ANTICLERE.key);
  assert.equal(await craft(smith, 'chair:oak', ANTICLERE.key), 0, 'the Forge steps no carpenter');
});

test('SEAT2b part two THE SEATS\' LIST CARRIES THE WORKS: each seat\'s works as tiers - so every client knows a Harbour, the Watchtowers and the halls; a seat with none carries none (mutants: the tiers; none)', async (t) => {
  const s = await stood(t);
  const sh = await s.guild('Gamal', 'The Silver Hand', 'SH');
  s.hold(ANTICLERE, sh.gid);
  s.work(ANTICLERE, 'harbour', 1);
  s.work(ANTICLERE, 'watchtowers', 1);
  s.work(ANTICLERE, 'forge', 2);
  s.work(ANTICLERE, 'walls', 3);
  const seats = (await s.list(sh.gm)).seats;
  assert.deepEqual(seats.find((x) => x.key === ANTICLERE.key).forts, { harbour: 1, watchtowers: 1, forge: 2, walls: 3 }, 'each work at its tier');
  assert.equal('forts' in seats.find((x) => x.key === WAYREST.key), false);
});
