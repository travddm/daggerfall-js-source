// WW7-5: the town books past the Bay - every region's (the Bay's 62
// and the provinces' 62-70), the seven tables whose CHECKs take every region, the Watch on the land past the Bay and
// never past the Veil, a town past the Bay a report of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1 } from '../accountDb.mjs';
import { regionOk, bayRegionOk } from '../../src/net/nodeLaw.js';
import { homeRegionOk, HOME_REGION_MAX } from '../../src/net/homeLaw.js';
import { watchPixelOk, WATCH_VEIL_BOX } from '../../src/net/watchReceipt.js';
import { ETHER_BOX } from '../../src/world/ethericSea.js';
import { hubPixelOk, parseHubReport, hubReport } from '../../src/net/marketLaw.js';
import { townReportOf, parseTownReport, townReportText, TOWN_PLACE_ID_MIN } from '../../src/net/townEconLaw.js';
import { capitalPlaceId, capitalLocationIndex } from '../../src/world/tamrielCapitals.js';
import { arenaPlaceId, arenaLocationIndex } from '../../src/world/arenaLocations.js';
import { placeOfRow } from '../../src/world/worldWide/worldPlaces.js';
import { createTownTable } from '../../src/world/worldWide/townTable.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const BOOKS = ['market', 'professions', 'writs', 'contracts', 'seaBounty', 'npcChapters', 'npcHalls', 'npcReceipts'];
const TABLES = ['market_listings', 'market_orders', 'market_auctions', 'market_bids', 'guild_writs', 'commissions', 'guild_contracts'];

test('WW7-5 the books every region\'s: no town book asks the Bay\'s alone - the market, the writs, the contracts, the cards, the sea bounty, the chapters, their halls and receipts read every region\'s; a home any region\'s; the staff\'s filter too (mutants: a book the Bay\'s; a home the Bay\'s)', () => {
  for (const b of BOOKS) {
    const s = rd(`server-account/src/${b}.js`);
    assert.ok(!/bayRegionOk/.test(s), `${b}: the Bay's no more`);
    assert.match(s, /regionOk\(/, `${b}: every region's`);
  }
  assert.deepEqual([regionOk(64), regionOk(70), regionOk(71), bayRegionOk(64)], [true, true, false, false]);
  assert.equal(HOME_REGION_MAX, REGION_NAMES.length - 1);
  assert.deepEqual([homeRegionOk(0), homeRegionOk(64), homeRegionOk(70), homeRegionOk(71), homeRegionOk(-1)], [true, true, true, false, false]);
});

test('WW7-5 the Watch on the land past the Bay: the world\'s grid is its ground, never the Veil\'s box (the Eltheric Ocean\'s, pinned equal) - so a town, a seat and a node past the Bay are watched, and the isles still are not; a market\'s board a pixel of the world\'s grid (mutants: the Bay\'s alone; the Veil watched; the board the Bay\'s)', () => {
  assert.deepEqual({ ...WATCH_VEIL_BOX }, { ...ETHER_BOX });
  assert.deepEqual([watchPixelOk(500, 250), watchPixelOk(1000, 0), watchPixelOk(-300, -500), watchPixelOk(4000, 2000)], [true, true, true, true]);
  assert.deepEqual([watchPixelOk(100, -3000), watchPixelOk(8127, -7680), watchPixelOk(8192, 0), watchPixelOk(0, -8192), watchPixelOk(0.5, 1)], [false, false, false, false, false]);
  assert.equal(watchPixelOk(63, -3000), true, 'west of the Veil\'s box');
  assert.deepEqual([hubPixelOk(-40, 1200), hubPixelOk(8192, 0)], [true, false]);
  assert.deepEqual(parseHubReport(hubReport(-40, 1200)), { x: -40, y: 1200 });
  assert.deepEqual(parseHubReport('12,34'), { x: 12, y: 34 });
  assert.equal(parseHubReport('99999,1'), null);
});

test('WW7-5 a town past the Bay reports itself: on the world\'s grid, its map id a place of the port\'s own (never a MAPS row\'s), its location its own negative, its region its province\'s; the Bay\'s towns as before (mutants: a MAPS id past the Bay; a Bay location past it; the Bay\'s identity dropped)', () => {
  const sol = { map: capitalPlaceId(1, 0), px: 1810, py: -420, region: 64, location: capitalLocationIndex(1, 0) };
  assert.deepEqual(townReportOf(sol), sol);
  assert.deepEqual(parseTownReport(townReportText(sol)), sol);
  const city = { map: arenaPlaceId({ provinceIndex: 3, id: 7 }), px: -300, py: 900, region: 66, location: arenaLocationIndex({ provinceIndex: 3, id: 7 }) };
  assert.deepEqual(townReportOf(city), city);
  assert.ok((capitalPlaceId(1, 0) & 0xfffff) >= TOWN_PLACE_ID_MIN && (city.map & 0xfffff) >= TOWN_PLACE_ID_MIN && 499 * 1000 + 999 < TOWN_PLACE_ID_MIN);
  assert.equal(townReportOf({ ...sol, map: (17 << 20) | 400123 }), null, 'a MAPS id past the Bay');
  assert.equal(townReportOf({ ...sol, location: 12 }), null, 'a Bay location past it');
  assert.equal(townReportOf({ ...sol, px: 9000 }), null, 'off the grid');
  assert.equal(townReportOf({ ...sol, region: 71 }), null);
  const bay = { map: (5 << 20) | (120 * 1000 + 450), px: 450, py: 120, region: 17, location: 3 };
  assert.deepEqual(townReportOf(bay), bay);
  assert.equal(townReportOf({ ...bay, px: 451 }), null, 'the Bay\'s map id names its own pixel');
  assert.equal(townReportOf({ ...bay, location: -1 }), null);
  assert.deepEqual(townReportOf({ ...bay, region: 64 }), { ...bay, region: 64 }, 'a region the law takes any of the world\'s');
});

test('WW7-5 a place past the Bay carries its location\'s index through the registry to the town table (mutant: the index dropped)', () => {
  const row = placeOfRow({ mapId: capitalPlaceId(1, 0), name: 'Solitude', px: 1810, py: -420, type: 0, location: capitalLocationIndex(1, 0) }, 'tesa-capitals');
  assert.equal(row.location, capitalLocationIndex(1, 0));
  assert.equal(placeOfRow({ mapId: 9, name: 'x', px: 1810, py: -420, type: 0 }, 's').location, null);
  const towns = createTownTable(() => ({ byMapId: (id) => (id === row.mapId ? row : null) }));
  assert.equal(towns.get(row.mapId).location, capitalLocationIndex(1, 0));
});

test('WW7-5 the market\'s listings, orders, auctions and bids, the guild writs, the commissions and the contracts take every region (mutant: a table\'s CHECK the Bay\'s)', () => {
  const raw = d1()._raw;
  for (const t of TABLES) assert.match(raw.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(t).sql, /CHECK \(region >= 0 AND region <= 70\)/, t);
});
