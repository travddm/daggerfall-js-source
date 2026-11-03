// AUDIT-SEATS: THE
// SHARED LAW'S FINDINGS, FIXED - the audit's law lane read every pure rule of the Seats arc against its design
//  and each test below is one finding it proved: the Rights
// of Siege ranked as risen (L2), a split sale's Tithe (L4), the crown sieges' fixed slots (L5), the Chronicle's words (L7), an ignored witness's week (L8), the law's drift (L10)
// and the arrival line's siege (G2). `06-Systems/Online-Arc.md` AUDIT-SEATS. The service is driven through the real
// Worker over node:sqlite where it is touched (test/accountDb.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { standService, T0 } from '../accountDb.mjs';
import {
  seatReportText, seatWeekOf, SEAT_MEMBER_WAIT_S, turningPlan, placeBattles, CROWN_SIEGE_SLOT,
  siegeStartMs, chronicleLine, edictWords, seatRuleLine, seatArrivalNews, seatTitleText, seatIgnoredAccounts, SEAT_WITNESS_IGNORED_S,
  accountSeatInfluence, tributeRoom, claimTotal, SIEGE_STANDING, STANDING_CHANGES, KINGDOM_METALS, SEAT_RING_UNHELD, FREE_LAND_RING,
  seatArrivalLine, siegeCalledClause, battleWhenText,
} from '../../src/net/townSeatLaw.js';
import { saleTithe, saleTitheOn, saleTax } from '../../src/net/marketLaw.js';
import { isMarch } from '../../src/net/kingdomLaw.js';
import { HERALDRY_COLOURS } from '../../src/net/heraldryLaw.js';
import { MARKS_KINDS } from '../../src/net/marksLaw.js';
import { readdirSync } from 'node:fs';

const ANTICLERE = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace', pixel: [402, 151] };
const WAYREST = { key: 5023, name: 'Wayrest', region: 23, tier: 'crown', pixel: [590, 166] };
const DAY = 86400;
const W = seatWeekOf(T0 * 1000);
const HUBS = { 21: [402, 151] };
let _rid = 0;
const rid = () => `als-${String(++_rid).padStart(6, '0')}`;
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

async function stood(t, env = {}) {
  t.mock.method(Date, 'now', () => T0 * 1000);
  const svc = await standService({ SEATS_OPEN: 'on', MARKS_OPEN: 'on', PROFESSIONS_OPEN: 'on', BOARD_OPEN: 'on', ...env });
  const raw = svc.env.DB._raw;
  const witnesses = [await svc.guest(), await svc.guest(), await svc.guest()];
  for (const w of witnesses) raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('seat', ?, ?, ?, ?, ?)").run(String(ANTICLERE.key), w.id, seatReportText(ANTICLERE), ANTICLERE.region, T0 - DAY);
  raw.prepare('INSERT INTO town_seat_weeks (week, settled_at) VALUES (?, ?)').run(W - 1, T0);
  const gm = await svc.registered('Gamal', { renown: 12 });
  assert.equal((await svc.found(gm, { name: 'The Silver Hand', tag: 'SH' })).status, 200);
  const gid = raw.prepare('SELECT guild_id FROM guild_members WHERE player = ? AND char_id = ?').get(gm.id, gm.character).guild_id;
  raw.prepare('UPDATE guild_members SET joined_at = ? WHERE guild_id = ?').run(T0 - SEAT_MEMBER_WAIT_S - DAY, gid);
  const hold = (o = {}) => raw.prepare(`INSERT INTO town_seat_holds (key, guild_id, region, tier, since_week, standing, truce_week, at, tithe, owed)
    VALUES (?, ?, ?, ?, ?, 50, NULL, ?, ?, 0)`).run(ANTICLERE.key, gid, ANTICLERE.region, ANTICLERE.tier, W - 1, T0 - 7 * DAY, o.tithe ?? 6);
  const purse = () => Number(raw.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').get(gid)?.balance ?? 0);
  return { svc, raw, gm, gid, hold, purse };
}

// ─── L2 ──────────────────────────────────────────────────────────────

test('AUDIT-SEATS L2 THE RIGHTS OF SIEGE RANKED AS RISEN: a challenger\'s influence at a seat in Unrest, a quarter more, is what it is ranked by - "highest first, at its strongest seat" (5.2 step 4) (mutants: the risen influence carried)', () => {
  const holder = (g, standing) => ({ guild: g, standing, truceWeek: null, tithe: 0, watched: true });
  const seats = [
    { key: 1, tier: 'palace', holder: holder('h1', 15), guilds: [{ guild: 'h1', influence: 100, legacy: 0 }, { guild: 'Y', influence: 7000, legacy: 0, pledgedAt: 1 }, { guild: 'Z', influence: 6500, legacy: 0, pledgedAt: 2 }] },
    { key: 2, tier: 'palace', holder: holder('h2', 50), guilds: [{ guild: 'h2', influence: 100, legacy: 0 }, { guild: 'Y', influence: 8000, legacy: 0, pledgedAt: 1 }] },
  ];
  const plan = turningPlan({ week: 3, seats, treasuries: new Map([['h1', 1e6], ['h2', 1e6]]) });
  assert.deepEqual(plan.rights.map((r) => [r.key, r.guild, r.total]), [[1, 'Y', 8750]], 'Y at its strongest, the Unrest seat at 8,750; Z (8,125 there) has none');
});

// ─── L4 ──────────────────────────────────────────────────────────────

test('AUDIT-SEATS L4 A SPLIT SALE\'S TITHE: the rate\'s share of the listing\'s running total, as the tax - ten 9-Drake units bought one at a time pay the holder what they would have bought whole (mutants: the running total; the market\'s use)', async (t) => {
  assert.equal(saleTithe(90, 10), 9);
  let paid = 0;
  for (let i = 0; i < 10; i++) paid += saleTitheOn(i * 9, 9, 10);
  assert.equal(paid, 9, 'a unit at a time: 9, not 0');
  assert.deepEqual([saleTitheOn(0, 9, 10), saleTitheOn(81, 9, 10)], [0, 1]);
  const s = await stood(t);
  s.hold({ tithe: 10 });
  const seller = await s.svc.registered('Selma'), buyer = await s.svc.registered('Bruno');
  s.raw.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, 'ore:mithril', 'own', 100)`).run(seller.id, seller.character);
  s.raw.prepare('INSERT INTO marks (account, balance) VALUES (?, 100000), (?, 100000)').run(seller.id, buyer.id);
  const l = (await s.svc.call('/v1/market/list', { character: seller.character, kind: 'material', material: 'ore:mithril', region: 21, units: 10, price: 9, board: [405, 150], hubs: HUBS, rid: rid() }, seller.secret)).body.listing;
  for (let i = 0; i < 10; i++) {
    const r = await s.svc.call('/v1/market/buy', { character: buyer.character, region: 21, listing: l.id, units: 1, max: 1_000_000, board: [405, 150], hubs: HUBS, rid: rid() }, buyer.secret);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.equal(s.purse(), 9, 'the holder\'s whole tenth');
  const got = s.raw.prepare("SELECT SUM(amount) AS n FROM marks_ledger WHERE kind = 'market-sale'").get().n;
  assert.equal(got, 90 - saleTax(90) - 9, 'the seller\'s proceeds less the whole tax and the whole Tithe');
});

// ─── L5 ──────────────────────────────────────────────────────────────

test('AUDIT-SEATS L5 THE CROWN SIEGES\' SLOTS: placed first, at Saturday\'s hour "whatever the holder\'s window" (6.3) - a lower-keyed siege of the same guild moves round it, never it round the siege (mutants: the crown first)', () => {
  const palace = { key: 1, kind: 'siege', tier: 'palace', kingdom: null, attacker: 'A', defender: 'G', window: { day: 3, hour: 19 } };
  const crown = { key: 2, kind: 'siege', tier: 'crown', kingdom: 'daggerfall', attacker: 'B', defender: 'G' };
  const { placed } = placeBattles(20, [palace, crown]);
  const by = new Map(placed.map((p) => [p.key, p]));
  const slot = CROWN_SIEGE_SLOT.daggerfall;
  assert.equal(by.get(2).startsAt, siegeStartMs(20, slot.day, slot.hour), 'Saturday 20:00, its own');
  assert.equal(by.get(2).moved, false);
  assert.equal(by.get(1).moved, true, 'the palace siege moved off the crown\'s hour');
  assert.ok(by.get(1).startsAt >= by.get(2).endsAt || by.get(1).startsAt + 2 * 3600_000 <= by.get(2).startsAt, 'no overlap');
  const alone = placeBattles(20, [palace]).placed[0];
  assert.equal(alone.moved, false, 'alone, its window stands');
});

// ─── L7 ──────────────────────────────────────────────────────────────

test('AUDIT-SEATS L7 THE CHRONICLE\'S WORDS: "1 bout"; Drakes, the players\' word, on Conscription\'s and fealty\'s sums; an Edict with its article ("proclaimed a Festival", 9.2) but Market Day and Open Gates bare; a title won with no Season counted names none (mutants: the plural; the Drakes; the article; the Season\'s tail)', () => {
  const seat = { key: 5023, name: 'Wayrest', region: 23, tier: 'crown' };
  const line = (kind, data) => chronicleLine({ week: 9, kind, data }, seat);
  assert.equal(line('royal-champion', { name: 'Arden', kingdom: 'wayrest', wins: 1 }), 'In week 9, Arden won the Royal Tourney at Wayrest with 1 bout - Champion of Wayrest.');
  assert.match(line('royal-champion', { name: 'Arden', kingdom: 'wayrest', wins: 4 }), /with 4 bouts/);
  const SH = { name: 'The Silver Hand', tag: 'SH' };
  assert.match(line('conscription', { guild: SH, marks: 1 }), /brought the Silver Hand <SH> 1 silver of its kingdom's Tithe\.$/);
  assert.match(line('conscripted', { guild: SH, crown: SH, marks: 1200 }), /paid 1,200 silver of its Tithe/);
  assert.equal(line('edict', { guild: SH, edict: 'festival' }), 'In week 9, the Silver Hand <SH> proclaimed a Festival at Wayrest.');
  assert.equal(line('edict', { guild: SH, edict: 'market-day' }), 'In week 9, the Silver Hand <SH> proclaimed Market Day at Wayrest.');
  assert.equal(line('edict', { guild: SH, edict: 'nonsense' }), 'In week 9, the Silver Hand <SH> proclaimed an Edict at Wayrest.');
  assert.deepEqual(['curfew', 'bounty', 'conscription', 'royal-tourney', 'open-gates', 'x'].map(edictWords),
    ['a Curfew', 'a Bounty', 'a Conscription', 'a Royal Tourney', 'Open Gates', null]);
  assert.equal(seatRuleLine({ tier: 'palace' }, { tithe: 6, edict: 'curfew', standing: 50 }), 'Tithe 6%. A Curfew is proclaimed.');
  assert.equal(seatArrivalNews({ holder: { standing: 50, edict: 'open-gates' } }), 'Open Gates is proclaimed.');
  const place = (k) => (k === 5023 ? seat : null);
  assert.deepEqual([seatTitleText('champion', [5023, 0], place), seatTitleText('champion', [5023, 2], place)], ['Champion of Wayrest', 'Champion of Wayrest, Season 2']);
});

// ─── L8 ──────────────────────────────────────────────────────────────

test('AUDIT-SEATS L8 AN IGNORED WITNESS\'S WEEK: three unmatched answers inside a week ignore the account for a week from the third - not until the first ages out; three spread past a week ignore none (mutants: the week from the third; the window)', () => {
  const confirmed = new Map([['1', 'A'], ['2', 'A'], ['3', 'A']]);
  const rows = (ats) => ats.map((at, i) => ({ key: String(i + 1), account: 'liar', report: `B${i}`, at }));
  const three = rows([0, 6 * DAY, 6 * DAY + 10]);
  const at = (nowS) => seatIgnoredAccounts(three, confirmed, nowS).has('liar');
  assert.equal(at(6 * DAY + 20), true);
  assert.equal(at(7 * DAY + 1), true, 'the first aged out, the week from the third stands');
  assert.equal(at(6 * DAY + 10 + SEAT_WITNESS_IGNORED_S - 1), true);
  assert.equal(at(6 * DAY + 10 + SEAT_WITNESS_IGNORED_S), false, 'a week on, heard again');
  assert.equal(at(6 * DAY + 5), false, 'not before the third');
  assert.equal(seatIgnoredAccounts(rows([0, 4 * DAY, 8 * DAY]), confirmed, 8 * DAY + 1).has('liar'), false, 'three spread past a week');
  // an answer someone else gave too is no disagreement of one
  const shared = [...rows([0, 1, 2]), { key: '1', account: 'friend', report: 'B0', at: 3 }];
  assert.equal(seatIgnoredAccounts(shared, confirmed, 10).has('liar'), false);
});

// ─── L10 ─────────────────────────────────────────────────────────────

test('AUDIT-SEATS L10 THE LAW\'S DRIFT: a NaN is no count; a negative sale pays no Tithe; a region is a number; the held siege\'s Standing written once; the map\'s marks the heraldry\'s own colours (mutants: each)', () => {
  assert.equal(accountSeatInfluence({ gates: NaN }), 0);
  assert.equal(accountSeatInfluence({ watch: NaN, gates: 1 }, NaN), accountSeatInfluence({ gates: 1 }));
  assert.equal(tributeRoom(NaN), 0);
  assert.equal(tributeRoom(300, NaN), tributeRoom(300));
  assert.equal(claimTotal({ influence: NaN, legacy: 5 }), 5);
  assert.equal(claimTotal({ influence: 7, legacy: NaN }), 7);
  assert.equal(claimTotal({ influence: Infinity, legacy: 2 }), 2, 'a finite count, not a boundless one');
  assert.deepEqual([saleTithe(-50, 10), saleTithe(50, -10), saleTithe(50, 10)], [0, 0, 5]);
  assert.deepEqual([isMarch(21), isMarch('21'), isMarch(23)], [true, false, false]);
  assert.equal(SIEGE_STANDING.held, STANDING_CHANGES.siegeHeld);
  const hex = (k) => HERALDRY_COLOURS.find((c) => c.key === k).hex;
  assert.deepEqual([SEAT_RING_UNHELD, FREE_LAND_RING], [hex('ash'), hex('vert')]);
  assert.deepEqual({ ...KINGDOM_METALS }, { daggerfall: hex('azure'), wayrest: hex('crimson'), sentinel: hex('gold'),
    skyrim: hex('argent'), morrowind: hex('sanguine'), summerset: hex('celeste'), valenwood: hex('teal'), elsweyr: hex('tenne'), blackmarsh: hex('umber'), cyrodiil: hex('purpure') });
  assert.deepEqual([SEAT_RING_UNHELD, KINGDOM_METALS.daggerfall], ['#8a8a8a', '#3b6fd8'], 'the same hex as before');
});

// ─── G2 ──────────────────────────────────────────────────────────────

test('AUDIT-SEATS G2 THE ARRIVAL LINE\'S SIEGE: a seat under siege this week gains " A siege is called for Wednesday at 20:00 UTC." (3.3) until its battle ends - not a Tourney\'s, not one no hour held; the seats\' list carries each battle\'s start and end (mutants: the clause; its end; the service\'s times)', async (t) => {
  const start = siegeStartMs(W, 0, 20), end = start + 30 * 60_000;
  const siege = { kind: 'siege', startsAt: start / 1000, endsAt: end / 1000 };   // seconds, as the service sends them
  const SH = { name: 'The Silver Hand', tag: 'SH' };
  assert.equal(seatArrivalLine({ ...ANTICLERE, battle: siege }, SH, start - 1), `Anticlere, held by the Silver Hand <SH>. A siege is called for ${battleWhenText(start)}.`);
  assert.match(battleWhenText(start), /^Wednesday at 20:00 UTC$/);
  assert.equal(seatArrivalLine({ ...ANTICLERE, battle: siege }, SH, start + 60_000), `Anticlere, held by the Silver Hand <SH>. A siege is called for ${battleWhenText(start)}.`, 'while it is fought');
  assert.equal(seatArrivalLine({ ...ANTICLERE, battle: siege }, SH, end), 'Anticlere, held by the Silver Hand <SH>.', 'over');
  assert.match(seatArrivalLine({ ...WAYREST, battle: siege }, null, start), /^Wayrest, capital of the Kingdom of Wayrest\. Its Crown Charter is unheld\. A siege is called for /);
  assert.equal(siegeCalledClause({ kind: 'tourney', startsAt: start / 1000, endsAt: end / 1000 }, start), '', 'a Tourney is no siege');
  assert.equal(siegeCalledClause({ ...siege, state: 'void' }, start), '', 'a void battle calls nothing');
  assert.equal(siegeCalledClause({ kind: 'siege', startsAt: null, endsAt: null }, start), '', 'a battle no hour held');
  assert.equal(siegeCalledClause(null, start), '');
  assert.equal(seatArrivalLine(ANTICLERE, null, start), 'Anticlere. Its Charter is unheld.');
  // the service: the list's dressed battle carries its times
  const s = await stood(t);
  s.hold();
  const eo = await s.svc.registered('Horst', { renown: 12 });
  assert.equal((await s.svc.found(eo, { name: 'Ebon Oath', tag: 'EO' })).status, 200);
  const eoGid = s.raw.prepare('SELECT guild_id FROM guild_members WHERE player = ?').get(eo.id).guild_id;
  s.raw.prepare("INSERT INTO town_seat_rights (week, key, kind, guild_id, against, total, defence, at) VALUES (?, ?, 'siege', ?, ?, 7000, 5000, ?)").run(W, ANTICLERE.key, eoGid, s.gid, T0);
  s.raw.prepare("INSERT INTO town_seat_battles (week, key, kind, tier, attacker, defender, starts_at, ends_at, moved, at) VALUES (?, ?, 'siege', 'palace', ?, ?, ?, ?, 0, ?)")
    .run(W, ANTICLERE.key, eoGid, s.gid, start / 1000, end / 1000, T0);
  const b = (await s.svc.call('/v1/seats/list', {}, s.gm.secret)).body.seats.find((x) => x.key === ANTICLERE.key).battle;
  assert.deepEqual([b.kind, b.guild.tag, b.startsAt, b.endsAt, b.moved, b.state], ['siege', 'EO', start / 1000, end / 1000, false, 'scheduled']);
});

test('AUDIT-SEATS THE LEDGER\'S KINDS: every kind a service statement writes to the one ledger is named in MARKS_KINDS, with the way it moves Marks (the guilds\' and the seats\' had drifted off it) (mutants: a kind dropped)', () => {
  const dir = new URL('../../server-account/src/', import.meta.url);
  const written = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    for (const m of text.matchAll(/'(?:mint|account|guild|escrow)', [^,]+, (?:'(?:burn|account|guild|escrow)'|CASE[^']*'[a-z]+'[^']*'[a-z]+' END), [^,]+, '([a-z-]+)'/g)) written.add(m[1]);
    for (const m of text.matchAll(/END, '([a-z-]+)', /g)) written.add(m[1]);
    // AUDIT-SEATS S2: the Sellswords' settle binds its kind - a paid fee's or a fee home's (seatSiege.js swordsSettled)
    for (const m of text.matchAll(/paid \? 'sellsword-([a-z]+)' : 'sellsword-([a-z]+)'/g)) { written.add(`sellsword-${m[1]}`); written.add(`sellsword-${m[2]}`); }
  }
  for (const k of ['siege-honours', 'conscription', 'royal-prize', 'heraldry', 'sellsword-fee', 'tribute', 'seat-claim']) assert.ok(written.has(k), `the sweep finds ${k}`);
  for (const k of written) assert.ok(Object.hasOwn(MARKS_KINDS, k), `${k} is written to the ledger and named nowhere`);
  assert.deepEqual(['siege-honours', 'conscription', 'heraldry'].map((k) => MARKS_KINDS[k]), ['mint', 'move', 'burn']);
});

// ─── G21: A CROWN'S FIELD AT ITS CASTLE'S ENTRANCE ───────────────────

test('AUDIT-SEATS G21 A CROWN\'S FIELD AT ITS CASTLE\'S ENTRANCE (6.2: "the Gatehouse stands at the castle\'s entrance in the city", "the Throne (the castle entrance)"): where the town stands the castle\'s door, a crown\'s Throne, defenders\' camp and Palace square stand before it; a palace seat\'s never; a crown with none found, its palace\'s door (mutants: the castle\'s face; the tier\'s gate; the fallback)', async () => {
  const { siegeFieldOf, SIEGE_FIELD } = await import('../../src/systems/siegeField.js');
  const door = (a, b, box) => ({ door: { a, b }, box });
  const frames = new Map([['palace', door([-1, 0, 0], [1, 0, 0], [-10, 0, -20, 10, 10, 0])]]);
  // the castle's entrance faces -x (away from its middle at x = +80)
  const castle = door([60, 0, -1], [60, 0, 1], [60, 0, -20, 100, 30, 20]);
  const base = { frames, palaceKeys: ['palace'], gates: [{ box: [-1, 0, 299, 1, 6, 301] }], centre: [0, 100] };
  const crown = siegeFieldOf({ ...base, tier: 'crown', castle });
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
  assert.ok(near(crown.throne, [60 - SIEGE_FIELD.thronePaceM, 0]), `the Throne a pace before the castle door: ${crown.throne}`);
  assert.ok(near(crown.camps.defend, [60 - SIEGE_FIELD.defendCampM, 0]));
  assert.ok(near(crown.banners[3], [60 - SIEGE_FIELD.squareM, 0]), 'the Palace square before the castle');
  const palace = siegeFieldOf({ ...base, tier: 'palace', castle });
  assert.ok(near(palace.throne, [0, SIEGE_FIELD.thronePaceM]), 'a palace seat\'s Throne at its palace door');
  assert.equal(palace.banners.length, 3);
  const none = siegeFieldOf({ ...base, tier: 'crown', castle: null });
  assert.ok(near(none.throne, [0, SIEGE_FIELD.thronePaceM]) && near(none.banners[3], [0, SIEGE_FIELD.squareM]), 'no castle door found: the palace\'s');
  assert.equal(siegeFieldOf({ frames: new Map(), palaceKeys: [], tier: 'crown', castle }) !== null, true, 'a castle alone holds a crown\'s field');
});
