// PLACE-PINS (bible/03-World/Place-Epochs.md): a country place that holds player data stands where it was pinned, with
// the template it was pinned with, whatever the countryside's roll says now - in the world host's roll and in the roads
// worker's alike. With no pin, the roll is untouched.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { countryStandsAt, countryMayStandAt, countryPick, countryOrdinal, countryPlaceId, pinnedCountryAt } from '../../../src/world/tamrielCountry.js';
import { rollTypeAt } from '../../../src/world/tamrielRoads.js';
import { pinnedPlaces, pinnedPlacesVersion, setLocalPins } from '../../../src/world/placeEpochs/pinnedPlaces.js';
import { LOCATION_TYPES } from '../../../src/formats/mapsFile.js';

afterEach(() => setLocalPins([]));

const HAMLET = LOCATION_TYPES.TownHamlet;
const TAVERN = LOCATION_TYPES.Tavern;
const row = (mapId) => ({ mapTableData: { mapId } });
const templates = new Map([[HAMLET, [row(101), row(102), row(103)]], [TAVERN, [row(201), row(202)]]]);
// Climate 1 stands a hamlet on a quarter of its pixels and a tavern on another quarter; climate 2 stands nothing.
const rates = new Map([[1, [[HAMLET, 0.25], [TAVERN, 0.5]]]]);
const world = (climate) => ({ rates, templates, climateAt: () => climate, heightAt: () => 100, ground: () => true });
const idAt = (x, y) => countryPlaceId(countryOrdinal(x, y));

test('PLACE-PINS with no pin the roll is untouched: every pixel of a sample stands what countryPick and the ground say (mutants: a pin answered for every pixel; the roll skipped)', () => {
  assert.equal(pinnedPlaces().length, 0, 'the shipped list is empty until the first pin read');
  let stood = 0;
  for (let x = 1200; x < 1260; x++) {
    for (let y = 300; y < 330; y++) {
      const expected = countryPick(rates, templates, 1, x, y);
      assert.deepEqual(countryStandsAt(world(1), x, y), expected, `(${x}, ${y})`);
      assert.equal(countryMayStandAt(world(1), x, y), !!expected, `may (${x}, ${y})`);
      if (expected) stood++;
    }
  }
  assert.ok(stood > 300 && stood < 1500, `about half the sample stands a place (${stood} of 1800)`);
});

test('PLACE-PINS a pinned place stands on its pixel with its own template where the roll, the climate and the ground now stand nothing (mutants: the pin read before the roll removed; the template found by index, not map id; the dry-ground test applied to a pin)', () => {
  setLocalPins([{ id: idAt(1500, 400), type: TAVERN, template: 202 }]);
  const barren = { ...world(2), heightAt: () => 0, ground: () => false };
  const pick = countryStandsAt(barren, 1500, 400);
  assert.equal(pick?.type, TAVERN);
  assert.equal(pick?.template?.mapTableData.mapId, 202, 'the template it was pinned with, by map id');
  assert.equal(countryMayStandAt(barren, 1500, 400), true);
  assert.equal(countryStandsAt(barren, 1501, 400), null, 'the next pixel is the roll\'s, and the roll stands nothing there');
  assert.equal(pinnedCountryAt(1500, 400)?.template, 202);
  assert.equal(pinnedCountryAt(1501, 400), null);
});

test('PLACE-PINS a pinned place whose template is gone from its kind\'s list takes the template the roll would hash to for that kind - never no place (mutants: null returned; another kind\'s list read)', () => {
  setLocalPins([{ id: idAt(1600, 410), type: HAMLET, template: 999 }]);
  const pick = countryStandsAt(world(2), 1600, 410);
  assert.equal(pick?.type, HAMLET);
  assert.ok([101, 102, 103].includes(pick?.template?.mapTableData.mapId), 'one of the hamlet templates');
  assert.deepEqual(countryStandsAt(world(2), 1600, 410), pick, 'the same one every time');
});

test('PLACE-PINS the roads worker stands a pinned place too: its placeholder templates give the pinned type (mutants: the worker\'s roll left unpinned)', () => {
  setLocalPins([{ id: idAt(1700, 420), type: TAVERN, template: 201 }]);
  const spec = { country: { rates: [], counts: [[HAMLET, 3], [TAVERN, 2]] }, lair: { rates: [], templates: [], pools: [] } };
  const typeAt = rollTypeAt(spec, { climateAt: () => 2, heightAt: () => 0, ground: () => false });
  assert.equal(typeAt(1700, 420), TAVERN);
  assert.equal(typeAt(1701, 420), null);
});

test('PLACE-PINS local pins: a new set replaces the old, moves the version, and keeps one entry an id (mutants: the version left still; local pins appended twice)', () => {
  const before = pinnedPlacesVersion();
  setLocalPins([{ id: idAt(1800, 430), type: HAMLET, template: 101 }]);
  assert.notEqual(pinnedPlacesVersion(), before);
  assert.equal(pinnedPlaces().length, 1);
  setLocalPins([{ id: idAt(1801, 430), type: HAMLET, template: 102 }]);
  assert.equal(pinnedPlaces().length, 1);
  assert.equal(pinnedCountryAt(1800, 430), null, 'the old pin is gone');
  assert.equal(pinnedCountryAt(1801, 430)?.template, 102);
});
