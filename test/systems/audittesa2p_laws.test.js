// AUDIT TESA II, lane P - THE LAWS: the
// discovery store's key of a place off the Bay's pixel ids (P6), the journey into the land past the Bay (P4), and the
// nearest safe place of the world (P2/P3, A2-4's rise), each run over the producers' own ids.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { discoverLocation, hasDiscoveredLocationId, discoveryKeyOf, snapshotDiscovery, restoreDiscovery } from '../../src/systems/discovery.js';
import { countryPlaceId, countryOrdinal } from '../../src/world/tamrielCountry.js';
import { lairPlaceId, lairCellOf } from '../../src/world/tamrielDungeons.js';
import { arenaPlaceId } from '../../src/world/arenaLocations.js';
import { etherPlaceId } from '../../src/world/etherPlaces.js';
import { capitalPlaceId } from '../../src/world/tamrielCapitals.js';
import { spawnedMapId } from '../../src/world/spawnedDungeons.js';
import { getAbyssMapId } from '../../src/world/oceanHoles.js';
import { pastBayJourney, PAST_BAY_TRAVEL_TEXT } from '../../src/systems/travel/pastBayTravel.js';
import { nearestSafePlace } from '../../src/systems/deathRespawn.js';
import { LOCATION_TYPES as T } from '../../src/formats/mapsFile.js';
import { ETHER_BOX } from '../../src/world/ethericSea.js';

afterEach(() => restoreDiscovery(null));

test('AUDIT TESA II P6: a place off the Bay\'s pixel ids is filed and found by its whole id - a farm never finds the farm 64 rows away, a lair never a farm, an isle\'s place never an Arena town; a Bay place, a spawn on a Bay pixel and an Abyss pit keep DFU\'s mask; a hall is never filed (mutant: the mask kept for every id; the Bay\'s bound off by one)', () => {
  const farm = (x, y) => countryPlaceId(countryOrdinal(x, y));
  const a = farm(1900, -280), b = farm(1900, -152);   // 128 rows apart: two lanes, the same low 20 bits
  assert.equal(a & 0xfffff, b & 0xfffff, 'the producer mints them alike in the low 20 bits');
  assert.ok(discoverLocation(a, { regionName: 'Skyrim', locationName: 'The Mojens Farmstead' }));
  assert.equal(hasDiscoveredLocationId(a), true);
  assert.equal(hasDiscoveredLocationId(b), false, 'the farm two lanes away not found');
  const c = lairCellOf(2179, -359), lair = lairPlaceId(c), farmOfLair = countryPlaceId(c);   // the lair's low 20 a farm's
  assert.equal(lair & 0xfffff, farmOfLair & 0xfffff);
  discoverLocation(lair);
  assert.equal(hasDiscoveredLocationId(farmOfLair), false, 'a lair never a farm');
  const town = arenaPlaceId({ provinceIndex: 0, id: 5 }), isle = etherPlaceId({ cx: 5, cy: 0 });
  assert.equal(town & 0xfffff, isle & 0xfffff, 'an Arena town and an isle\'s place of row 0 share the low 20 bits');
  discoverLocation(isle);
  assert.equal(hasDiscoveredLocationId(town), false);
  assert.equal(discoveryKeyOf(capitalPlaceId(0)), capitalPlaceId(0), 'a capital by its whole id');
  // the Bay's own: DFU's mask - a spawn on a Bay pixel is that pixel's, an Abyss pit its pixel's
  const bayPixel = 123 * 1000 + 456;
  assert.equal(discoveryKeyOf(bayPixel), bayPixel);
  assert.equal(discoveryKeyOf(spawnedMapId(3, 456, 123)), bayPixel);
  assert.equal(discoveryKeyOf(getAbyssMapId(456, 123)), bayPixel);
  assert.equal(discoveryKeyOf(499 * 1000 + 999), 499999, 'the Bay\'s last pixel id is the Bay\'s');
  assert.equal(discoveryKeyOf((7 << 20) | 500000) >>> 0, ((7 << 20) | 500000) >>> 0, 'the first id past it is whole');
});

test('AUDIT TESA II P6: the save keeps a whole id and drops a key of before - a place past the Bay filed by its low 20 bits, which no id answers now and which named several places (mutant: the old key kept)', () => {
  const a = countryPlaceId(countryOrdinal(1900, -280));
  discoverLocation(a, { regionName: 'Skyrim', locationName: 'A Farm' });
  discoverLocation(5 * 1000 + 7, { regionName: 'Daggerfall', locationName: 'A Bay Town' });
  const snap = JSON.parse(JSON.stringify(snapshotDiscovery()));
  restoreDiscovery(snap);
  assert.deepEqual([hasDiscoveredLocationId(a), hasDiscoveredLocationId(5 * 1000 + 7)], [true, true], 'round trip');
  const old = { locations: { [a & 0xfffff]: { regionName: 'Skyrim', locationName: 'A Farm' }, [5007]: { regionName: 'Daggerfall', locationName: 'A Bay Town' } } };
  restoreDiscovery(old);
  assert.deepEqual(Object.keys(snapshotDiscovery().locations), ['5007'], 'the old key past the Bay let go, the Bay\'s kept');
});

test('AUDIT TESA II P4: no journey INTO the land past the Bay - its end past the Bay refused in the door\'s words; an end on the Bay or past the Veil is not refused (mutant: the end on the Bay refused)', () => {
  const bay = { x: 200, y: 200 }, windhelm = { x: 2215, y: -371 };
  assert.deepEqual(pastBayJourney(null, windhelm), { ok: false, text: PAST_BAY_TRAVEL_TEXT.refused });
  assert.match(PAST_BAY_TRAVEL_TEXT.refused, /Portal Stone/);
  assert.deepEqual(pastBayJourney(null, bay), { ok: true }, 'out to the Bay');
  assert.deepEqual(pastBayJourney(null, { x: 999, y: 499 }), { ok: true }, 'the Bay\'s last pixel is the Bay\'s');
  assert.equal(pastBayJourney(null, { x: 1000, y: 499 }).ok, false, 'one past it is not');
  assert.deepEqual(pastBayJourney(null, { x: ETHER_BOX.x0 + 10, y: ETHER_BOX.y0 + 10 }), { ok: true }, 'past the Veil: the Veil\'s law');
  assert.deepEqual(pastBayJourney(null, null), { ok: true }, 'no end named: nothing to refuse');
});

test('AUDIT TESA II P2/P3: the nearest safe place of the world - the three kinds over the registry\'s rows (`type`) and a list beside them (`locationType`), the crow\'s nearest the caller accepts, nearestSafeLocation\'s shape (mutant: a dungeon a rise; the nearer lost to the later; accept ignored)', () => {
  const rows = [{ type: T.TownVillage, px: 10, py: 0 }, { type: T.DungeonKeep, px: 1, py: 0 }, { type: T.ReligionTemple, px: 5, py: 0 }];
  const extra = [{ locationType: T.TownHamlet, px: 3, py: 0 }];
  const hit = nearestSafePlace([rows, extra], { x: 0, y: 0 });
  assert.deepEqual([hit.kind, hit.mapPixel, hit.locationIndex], ['city', { x: 3, y: 0 }, -1]);
  assert.equal(nearestSafePlace([rows], { x: 0, y: 0 }).kind, 'temple');
  assert.deepEqual(nearestSafePlace([rows, extra], { x: 0, y: 0 }, (h) => h.mapPixel.x > 4).mapPixel, { x: 5, y: 0 });
  assert.equal(nearestSafePlace([[{ type: T.DungeonKeep, px: 1, py: 0 }]], { x: 0, y: 0 }), null);
});
