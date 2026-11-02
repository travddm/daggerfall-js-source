// AUDIT SEA VENTURES - six cold lanes read SEA VENTURES at 886f2b4a6. Each finding fixed is pinned here by its id,
// the failure it was driven through made to fail again - tools/mutants/auditsea.json. What remains is the sea's own:
// the season's boards, the vaults' rooms, the treasure fleet and the storm, the Tidemail, Veilhaven's peace and the rise,
// and the sea's lines in the language of the moment.
import '../../modsOff.js';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createSeaSeason, SEA_SEASON_FRESH_MS, SEA_SEASON_RETRY_MS } from '../../../src/scenes/seaSeasonHost.js';
import { seasonText } from '../../../src/ui/naval/navalYardWindow.js';
import { seaSeasonFigures, seaSeasonStartS, seaLegendsPossible, SEA_WORLD_DAY_S, SEA_SEASON_VENDOR } from '../../../src/net/sea/seaSeasonLaw.js';
import { SOCIAL_ROOM, seaVaultRoomId, seaVaultRoomMapId, seaVaultMapId, seaVaultKey, seaRoomCell, SEA_VAULT_LANE, SEA_FLEET_OFFSET_MS, SEA_FLEET_SAIL_MS, SEA_FLEET_PERIOD_MS } from '../../../src/net/wire.js';
import { FLEET_OFFSET_MS, FLEET_SAIL_MS } from '../../../src/systems/sea/seaEvents.js';
import { etherPlaceId } from '../../../src/world/etherPlaces.js';
import { fakeRooms } from '../../fakeRoom.mjs';
import { createCaptainLedger, ETHER_FLEETS_KEEP, ETHER_WRACK_KEEP } from '../../../src/systems/naval/captainLedger.js';
import { createEtherHost } from '../../../src/scenes/etherHost.js';
import { createSeaVentures, FLEET_TELL_MS } from '../../../src/scenes/seaVenturesHost.js';
import { createTreasureFleet } from '../../../src/scenes/naval/treasureFleet.js';
import { legendTidemail, dueOnHull } from '../../../src/scenes/naval/navalSeaSet.js';
import { classById } from '../../../src/systems/naval/navalShips.js';
import * as SE from '../../../src/systems/sea/seaEvents.js';
import { BANDS, VEIL_X, LEAGUE_PX, etherBandAt } from '../../../src/world/ethericSea.js';
import { legendById } from '../../../src/systems/naval/etherShips.js';
import { SHIP_STATES } from '../../../src/systems/naval/navalDamage.js';
import { etherInPeace, etherWildRingAt, etherRisePort, ETHER_PEACE_PX, ETHER_RISE_PX, etherWayWord } from '../../../src/systems/sea/etherRings.js';
import { veilhaven, islesNear, inEther, inVeil } from '../../../src/world/ethericSea.js';
import * as CHART from '../../../src/ui/etherChartWindow.js';
import * as tm from '../../../src/systems/textManager.js';

const RC = 'r00000000000000000a01';
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
/** A realm session whose acts run at once over `seq`. */
const sessionAt = (seq = 3) => ({ transact: (fn) => fn({ id: RC, lease: 'lease', seq }) });


test('AUDIT SEA VENTURES E1: the season\'s board read the service refused is asked again SEA_SEASON_RETRY_MS on, doubling to the fresh wait - never at once from the paint that ends it, never a page frozen in its first refusal', async () => {
  assert.deepEqual([SEA_SEASON_RETRY_MS, SEA_SEASON_FRESH_MS], [5_000, 60_000]);
  let now = 1_000_000;
  let seasonAsked = 0;
  const s = createSeaSeason({ live: () => true, session: sessionAt(), character: () => RC, door: { board: async () => { seasonAsked++; return { ok: false, error: 'server' }; } }, now: () => now });
  for (let i = 0; i < 200; i++) { s.office(); await settle(); }
  assert.equal(seasonAsked, 1);
  now += SEA_SEASON_RETRY_MS; s.office(); await settle();
  assert.equal(seasonAsked, 2);
  now += SEA_SEASON_RETRY_MS; s.office(); await settle();
  assert.equal(seasonAsked, 2, 'the season\'s wait doubles too');
});

test('AUDIT SEA VENTURES E7: the season\'s boards never read: asking, never an empty season', async () => {
  const now = 1_000_000;
  const s = createSeaSeason({ live: () => true, session: sessionAt(), character: () => RC, door: { board: async () => ({ ok: false, error: 'offline' }) }, now: () => now });
  s.office(); await settle();
  const so = s.office();
  assert.equal(so.asking, true);
  assert.deepEqual(seasonText(so).lists, [], 'no lists - "no captain has sailed this season" is never said of boards unread');
  assert.equal(so.line?.warn, true);
});


test('AUDIT SEA VENTURES B6: the day a season turns in counts for the old one - a world day past the turn, a save filing the season before\'s figures is read for it, its legends bounded by that whole season; past the day, never (mutants: the day, the season before, the legends\' bound)', () => {
  assert.equal(SEA_WORLD_DAY_S, 7200);
  const turn = seaSeasonStartS(2);
  const save = (n, deepest = 900, legends = 1) => ({ modData: { [SEA_SEASON_VENDOR]: { ether: { season: { n, deepest, legends } } } } });
  assert.deepEqual(seaSeasonFigures(save(1), turn + 60), { n: 1, deepest: 900, legends: 1 }, 'the season before, the turn\'s day');
  assert.deepEqual(seaSeasonFigures(save(1), turn + SEA_WORLD_DAY_S - 1), { n: 1, deepest: 900, legends: 1 });
  assert.equal(seaSeasonFigures(save(1), turn + SEA_WORLD_DAY_S), null, 'past the day: never');
  assert.deepEqual(seaSeasonFigures(save(2), turn + 60), { n: 2, deepest: 900, legends: 1 }, 'the new season\'s too');
  assert.equal(seaSeasonFigures(save(0), turn + 60), null, 'two seasons back: never');
  const oldMost = seaLegendsPossible(turn - 1);
  assert.ok(oldMost > seaLegendsPossible(turn + 60), 'the old season had more legends to end than the new one\'s first day');
  assert.deepEqual(seaSeasonFigures(save(1, 0, oldMost), turn + 60)?.legends, oldMost, 'bounded by the old season\'s whole');
  assert.equal(seaSeasonFigures(save(1, 0, oldMost + 1), turn + 60), null);
});

test('AUDIT SEA VENTURES D7: a vault of the deep stands in a room of its own lane - the one its gate let me into, or the day\'s I stand in - never its plain ruin\'s, and keeps no instance', () => {
  const [cx, cy] = [723, 240], place = etherPlaceId({ cx, cy }), H = seaVaultKey(cx, cy);
  assert.equal(seaVaultMapId(cx, cy), place);
  assert.equal(seaVaultRoomMapId(cx, cy) >>> 20, SEA_VAULT_LANE);
  assert.equal(seaVaultRoomMapId(cx, cy) & 0xfffff, place & 0xfffff, 'the same cell, its own lane');
  assert.notEqual(seaVaultRoomMapId(cx, cy), place, 'never the plain ruin\'s room');
  assert.equal(SEA_VAULT_LANE, 0xe8);
  assert.equal(seaVaultRoomId(place, H), seaVaultRoomMapId(cx, cy), 'the vault the gate let me into: its lane');
  assert.equal(seaVaultRoomId(place, null), place, 'its plain ruin: its own');
  assert.equal(seaVaultRoomId(place, seaVaultKey(cx + 1, cy)), place, 'another isle\'s vault: its own');
  assert.equal(seaVaultRoomId(777, H), 777, 'another dungeon');
  assert.deepEqual(seaRoomCell(`dungeon:m${seaVaultRoomMapId(cx, cy)}`), [cx, cy], 'and keeps no instance');
});


test('AUDIT SEA VENTURES A7, A10: the social room hears a treasure fleet\'s flagship sunk only while she is under way (her hour in port and the hour before scattered her before she sailed) and never from a guest (mutants: the window, the guest)', async () => {
  assert.deepEqual([SEA_FLEET_OFFSET_MS, SEA_FLEET_SAIL_MS], [FLEET_OFFSET_MS, FLEET_SAIL_MS], 'the relay\'s copy is the sea\'s');
  const n = 9000, start = n * SEA_FLEET_PERIOD_MS + SEA_FLEET_OFFSET_MS, realNow = Date.now;
  let clock = start - 60_000; Date.now = () => clock;
  try {
    const world = fakeRooms({ now: () => clock });
    const hub = world.room(SOCIAL_ROOM);
    const join = async (id, kind) => { const ws = hub.connect(); await hub.hello(ws, id, null, { name: id, acct: `acct-${id}`, asecret: `s-${id}`, kind }); clock += 700; return ws; };
    const a = await join('peer-a', 'linked'), g = await join('peer-g', 'guest');
    const fd = () => a.sent.filter((m) => m.t === 'sea' && m.k === 'fd');
    await hub.raw(a, JSON.stringify({ t: 'sea', k: 'fk', n })); clock += 700;
    assert.equal(fd().length, 0, 'in port: nothing');
    clock = start + 60_000;
    await hub.raw(g, JSON.stringify({ t: 'sea', k: 'fk', n })); clock += 700;
    assert.equal(fd().length, 0, 'a guest\'s word: nothing');
    await hub.raw(a, JSON.stringify({ t: 'sea', k: 'fk', n })); clock += 700;
    assert.deepEqual(fd().at(-1)?.fleets, [n], 'under way, a registered captain\'s: scattered');
  } finally { Date.now = realNow; }
});


test('AUDIT SEA VENTURES D1, D12: a legend\'s Tidemail comes with her purse alone - another\'s copy of her, sunk again before the aether raises her, gives none; the Captain\'s Due and the piece out of the naval host (mutants: the purse\'s gate)', () => {
  const legend = legendById('starless') ?? { name: 'a legend', band: 'abyss' };
  const out = { gave: [], said: [] };
  const o = { give: (items) => out.gave.push(...items), say: (x) => out.said.push(x) };
  assert.equal(legendTidemail({ ...legend, band: 'abyss' }, 1111, 0, o), null, 'no purse: no piece');
  assert.equal(legendTidemail({ ...legend, band: 'abyss' }, 1111, undefined, o), null);
  assert.deepEqual(out.gave, []);
  const piece = legendTidemail({ ...legend, band: 'abyss' }, 1111, 12000, o);
  assert.ok(piece, 'her purse paid: the Abyss\'s piece every time');
  assert.deepEqual(out.gave, [piece]);
  assert.deepEqual(dueOnHull({ hull: 10, sail: 4 }, { hull: 0.5 }), { hull: 5, sail: 2 });
  const n = readFileSync(new URL('../../../src/scenes/naval/navalHost.js', import.meta.url), 'utf8');
  assert.doesNotMatch(n, /function legendTidemail\(|function dueOnHull\(/, 'never inside createNavalHost');
});

test('AUDIT SEA VENTURES D2, D4, D5, D9, D10: a treasure fleet\'s flagship pays each captain once a sailing - kept in the save, so a second end, another\'s copy or a reload pays nothing and gives no piece - and a reload never stands her again; the hub\'s hello never puts my own sinking out, and the hub is told until it says so; her piece rolls the sailing\'s band; each ship stands on water deep enough for her own hull (mutants: the once, the save, the piece\'s gate, the stood, the hello, the telling, the band, the hull)', () => {
  // the ledger keeps them, newest ETHER_FLEETS_KEEP, through the save
  const L = createCaptainLedger();
  assert.deepEqual([L.endFleet(7), L.endFleet(7), L.fleetEnded(7), L.fleetEnded(8)], [true, false, true, false]);
  for (let n = 10; n < 20; n++) L.endFleet(n);
  assert.equal(L.getSaveData().ether.fleets.length, ETHER_FLEETS_KEEP);
  const back = createCaptainLedger();
  back.restoreSaveData(JSON.parse(JSON.stringify({ ...L.getSaveData(), ether: { ...L.getSaveData().ether, fleets: [19, 19, 'x', -1, 18] } })));
  assert.deepEqual(back.getSaveData().ether.fleets, [19, 18], 'read back: whole sailings, once each');
  // the sea's host: once a sailing, never put out by the hub, told until it hears
  let now = 0;
  for (let k = 9000; k < 9100 && !SE.fleetAt(now); k++) now = k * SEA_FLEET_PERIOD_MS + SEA_FLEET_OFFSET_MS + 60_000;
  const f = SE.fleetAt(now);
  assert.ok(f);
  const ledger = createCaptainLedger(), credits = [], sent = [], fed = [];
  const host = createEtherHost({ ledger, day: () => 1, credit: (x) => credits.push(x) });
  const make = () => createSeaVentures({
    live: () => false, day: () => 0, pixel: () => ({ x: Math.floor(f.from.x), y: Math.floor(f.from.y) }),
    clock: () => now, naval: () => ({ fleet: (list, o) => fed.push(o) }), state: { localFromWorld: (x, z) => [x / 40, z / 40] },
    link: () => ({ status: 'open', sendSea: (w) => { sent.push(w); return true; } }), ether: host,
  });
  const v = make();
  assert.equal(v.fleetEnded(f.n, 'sink'), f.purse);
  assert.equal(v.fleetEnded(f.n, 'board'), 0, 'a second end of the sailing: nothing');
  assert.deepEqual(credits, [f.purse]);
  const fresh = make();
  fresh.step(0);
  assert.equal(fed.at(-1)?.sunk, true, 'after a reload she is never stood again - the save says so, before any word');
  assert.equal(fresh.chartWord().fleet.sunk, true);
  const reloaded = make();
  assert.equal(reloaded.fleetEnded(f.n, 'sink'), 0, 'after a reload: nothing (the save keeps it)');
  reloaded.step(0);
  assert.equal(fed.at(-1)?.sunk, true);
  reloaded.hubWord({ k: 'st', fleets: [] });
  assert.equal(reloaded.chartWord().fleet.sunk, true, 'the hub\'s hello puts my own sinking out never');
  sent.length = 0;
  now += FLEET_TELL_MS; reloaded.step(0);
  assert.deepEqual(sent, [{ k: 'fk', n: f.n }], 'the hub not having said it: told again');
  now += FLEET_TELL_MS - 1; reloaded.step(0);
  assert.equal(sent.length, 1, 'no sooner than FLEET_TELL_MS');
  reloaded.hubWord({ k: 'fd', fleets: [f.n] });
  now += FLEET_TELL_MS; reloaded.step(0);
  assert.equal(sent.length, 1, 'the hub has it: no more');
  // the fleet's module: no purse, no piece; the sailing's band; her hull's water
  const out = { gave: [], said: [], water: [] };
  let paid = 0;
  const sea = new Map();
  const fl = createTreasureFleet({
    sea, launch: (spec) => { const e = { id: `e${spec.seed}`, owner: null, ship: { seed: spec.seed, pos: spec.pos, names: { name: 'Her' }, damage: { state: SHIP_STATES.afloat } }, ether: spec.ether }; sea.set(e.id, e); return e; },
    retire: () => {}, busy: () => false, feet: () => [0, 0, 0], isWater: (x, z, hull) => { out.water.push(hull); return true; }, seaY: () => 0, launches: () => true,
    give: (items) => out.gave.push(...items), say: (x) => out.said.push(x), fleetEnded: () => paid,
  });
  const list = { n: f.n, band: f.band, ships: f.ships.map((s, i) => ({ seed: s.seed, classId: s.classId, flag: s.flag, pos: [i * 10, 0, 0], ahead: [i * 10, 0, 100], yaw: 0 })) };
  fl.step(list);
  assert.deepEqual(out.water, f.ships.map((s) => classById(s.classId).hull), 'each on water deep enough for her own hull');
  const flag = [...sea.values()].find((e) => e.fleet?.flag);
  flag.ether = 'reaches';   // a copy stood in the Reaches' waters
  assert.equal(fl.ended(flag, 'sink'), null, 'no purse: no piece');
  assert.deepEqual(out.gave, []);
  paid = f.purse;
  const piece = fl.ended(flag, 'sink');
  assert.ok(f.band === 'abyss' ? piece : true, 'the sailing\'s band rolls it, never the waters her copy stood in');
  if (piece) assert.deepEqual(out.gave, [piece]);
});

test('AUDIT SEA VENTURES D6, D11: a storm\'s wrack cask hauled is kept in the save - a reload floats it never again; a storm is born far enough west that its drift and reach never touch the Reaches (mutants: the haul kept, the haul read, the birth)', () => {
  const L = createCaptainLedger();
  assert.deepEqual([L.haulWrack('strand:wrack:5:1'), L.haulWrack('strand:wrack:5:1'), L.wrackHauled('strand:wrack:5:1')], [true, false, true]);
  for (let i = 0; i < 40; i++) L.haulWrack(`strand:wrack:6:${i}`);
  assert.equal(L.getSaveData().ether.wrack.length, ETHER_WRACK_KEEP);
  const back = createCaptainLedger();
  back.restoreSaveData(JSON.parse(JSON.stringify(L.getSaveData())));
  assert.equal(back.wrackHauled('strand:wrack:6:39'), true, 'read back');
  // the host over the ledger: hauled once, across a reload
  let s = null, now = 0;
  for (let n = 1000; n < 1100 && !s; n++) { s = SE.stormOf(n); now = s.start + 600_000; }
  const e = SE.stormEye(s, now), px = { x: Math.floor(e.x), y: Math.floor(e.y) };
  const ledger = createCaptainLedger();
  const host = createEtherHost({ ledger, day: () => 1 });
  const make = () => createSeaVentures({ live: () => false, day: () => 0, pixel: () => px, locks: new Map(), crows: new Map(), mine: () => null, clock: () => now, naval: () => null, state: { localFromWorld: (x, z) => [x, z] }, link: () => null, ether: host });
  const v = make();
  const site = v.wrackSites(px.x, px.y)[0];
  assert.ok(site);
  assert.ok(v.gather(site.id).items.length, 'hauled');
  const again = make();
  assert.deepEqual(again.wrackSites(px.x, px.y), [], 'a reload floats it never again');
  assert.deepEqual(again.gather(site.id).items, []);
  // D11: the storm's reach, its whole life, west of the Reaches
  const deepEast = VEIL_X - BANDS.find((b) => b.id === 'deep').from * LEAGUE_PX;
  for (let n = 0; n < 4000; n++) {
    const st = SE.stormOf(n);
    assert.ok(Math.max(st.x0, st.x1) + st.r <= deepEast + 1e-9, `storm ${n} reaches the Reaches`);
  }
  assert.equal(etherBandAt(deepEast - 1).id, 'deep');
});

test('AUDIT SEA VENTURES C2: Veilhaven\'s peace holds the way home - her own rows east of her to the Veil, so a captain reaches the crossing without leaving the peace (mutant: the corridor)', () => {
  const h = veilhaven();
  for (let x = h.px; x <= h.px + 60; x++) assert.equal(etherWildRingAt(x, h.py), 0, `her row at ${x}: peace`);
  for (const dy of [-ETHER_PEACE_PX, ETHER_PEACE_PX]) assert.equal(etherInPeace(h.px + 30, h.py + dy), true);
  for (const dy of [-ETHER_PEACE_PX - 1, ETHER_PEACE_PX + 1]) assert.equal(etherInPeace(h.px + 30, h.py + dy), false, 'a row past the band: open');
  assert.equal(etherInPeace(h.px - ETHER_PEACE_PX - 1, h.py), false, 'west of her: the ring alone');
  // reached from Veilhaven without leaving the peace: the Veil
  const seen = new Set([`${h.px},${h.py}`]), q = [[h.px, h.py]];
  let veil = false;
  while (q.length && !veil) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !inEther(nx, ny) || !etherInPeace(nx, ny)) continue;
      if (inVeil(nx, ny)) veil = true;
      seen.add(k); q.push([nx, ny]);
    }
  }
  assert.ok(veil, 'the Veil, by the peace alone');
});

test('AUDIT SEA VENTURES C5/F2: a drowned captain rises at the nearest freeport, by distance, however far - Veilhaven only when she is the nearest', () => {
  const h = veilhaven();
  // C5/F2: the nearest freeport, by distance, however far - Veilhaven only when she is the nearest
  for (const [x, y] of [[6900, -5108], [7699, -4976], [7000, -5400], [6950, -4800], [7500, -5600]]) {
    const port = etherRisePort(x, y);
    let best = null;
    for (const i of islesNear(x, y, 1400)) if (i.kind === 'port' && (!best || Math.hypot(i.px - x, i.py - y) < Math.hypot(best.px - x, best.py - y))) best = i;
    assert.equal(port.key, best.key, `${x},${y}: the nearest, ${Math.round(Math.hypot(best.px - x, best.py - y))} px`);
  }
  assert.equal(etherRisePort(h.px + 3, h.py).key, h.key, 'at Veilhaven: her');
  assert.equal(etherRisePort(NaN, 0).key, h.key, 'nowhere: Veilhaven');
  assert.equal(ETHER_RISE_PX, 60);
});


test('AUDIT SEA VENTURES F4: the sea\'s lines say a way and a ring\'s loot in the language of the moment - the sixteen points of the compass and the compass through the text core, in the harbourmaster\'s talk, the storm\'s and the fleet\'s words, and the chart\'s ways (mutants: the way, the bonus, the chart)', () => {
  const POINTS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
  assert.deepEqual(POINTS.map(etherWayWord), POINTS, 'in English as they were');
  assert.equal(etherWayWord(null), '');
  const was = tm.currentLocale();
  try {
    tm.setLocale(tm.PSEUDO_LOCALE);
    for (const p of POINTS) assert.notEqual(etherWayWord(p), p, `${p}: said in the language`);
    const english = /\b(north|south|east|west)(-|\b)/;
    const h = veilhaven();
    const v = createSeaVentures({ live: () => false, day: () => 0, pixel: () => ({ x: h.px, y: h.py }), clock: () => 9000 * SEA_FLEET_PERIOD_MS + SEA_FLEET_OFFSET_MS + 60_000, naval: () => null, state: { localFromWorld: (x, z) => [x, z] }, link: () => null, ether: {} });
    for (const line of v.rumours({ px: h.px, py: h.py })) assert.doesNotMatch(line, english, line);
    assert.doesNotMatch(CHART.wayWords({ px: h.px, py: h.py }, { px: h.px - 300, py: h.py - 120 }), english);
  } finally { tm.setLocale(was); }
});
