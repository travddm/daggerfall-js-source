// PLACE-PINS (bible/03-World/Place-Epochs.md): every place past the Bay that can hold player data, by map id and kind,
// and the breaks a later list makes in an earlier one - a place gone, or its kind changed. A rename or a new place is no
// break: homes key on the id, and their buildings on the kind's template.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { placeIdentities, identityBreaks } from '../../../src/world/placeEpochs/placeIdentity.js';
import { setLocalPins } from '../../../src/world/placeEpochs/pinnedPlaces.js';
import { arenaPlaceId } from '../../../src/world/arenaLocations.js';
import { CAPITALS, capitalDims, capitalPlaceId } from '../../../src/world/tamrielCapitals.js';
import { LOCATION_TYPES } from '../../../src/formats/mapsFile.js';

afterEach(() => setLocalPins([]));

const PLACES = Object.freeze([
  { provinceIndex: 2, id: 0, kind: 'city-state', name: 'Solitude' },
  { provinceIndex: 2, id: 16, kind: 'town', name: 'Dragon Bridge' },
  { provinceIndex: 2, id: 24, kind: 'village', name: 'Riverwood' },
]);
const capitalSlices = CAPITALS.reduce((sum, capital) => sum + capitalDims(capital).w * capitalDims(capital).h, 0);

test('PLACE-PINS the identities: the made places by their slot\'s map id, every slice of every capital, and every pin (mutants: a capital\'s slices but its centre left out; the pins left out; a place keyed by its slot alone)', () => {
  setLocalPins([{ id: 0x30080001, type: LOCATION_TYPES.TownHamlet, template: 5 }]);
  const ids = placeIdentities(PLACES);
  assert.equal(ids.size, PLACES.length + capitalSlices + 1);
  assert.deepEqual(ids.get(arenaPlaceId(PLACES[1])), { id: arenaPlaceId(PLACES[1]), kind: 'town', name: 'Dragon Bridge' });
  const lastCapital = CAPITALS.length - 1;
  const lastSlice = capitalDims(CAPITALS[lastCapital]).w * capitalDims(CAPITALS[lastCapital]).h - 1;
  assert.equal(ids.get(capitalPlaceId(lastCapital, lastSlice))?.kind, 'capital');
  assert.equal(ids.get(0x30080001)?.kind, `pinned:${LOCATION_TYPES.TownHamlet}`);
});

test('PLACE-PINS the breaks: a place gone and a kind changed are breaks; a rename and a new place are not (mutants: a kind change passed; a gone place passed; an added place counted)', () => {
  const before = placeIdentities(PLACES);
  assert.deepEqual(identityBreaks(before, placeIdentities(PLACES)), []);
  const renamed = PLACES.map((p) => (p.id === 0 ? { ...p, name: 'Snowhawk' } : p));
  const added = [...PLACES, { provinceIndex: 2, id: 9, kind: 'city-state', name: 'Falkreath' }];
  assert.deepEqual(identityBreaks(before, placeIdentities(renamed)), [], 'a rename keeps the id and the kind');
  assert.deepEqual(identityBreaks(before, placeIdentities(added)), [], 'a new place breaks nothing');
  const kindChanged = PLACES.map((p) => (p.id === 16 ? { ...p, kind: 'village' } : p));
  const gone = PLACES.filter((p) => p.id !== 24);
  assert.deepEqual(identityBreaks(before, placeIdentities(kindChanged)).map((b) => [b.id, b.problem]), [[arenaPlaceId(PLACES[1]), 'kind']]);
  assert.deepEqual(identityBreaks(before, placeIdentities(gone)).map((b) => [b.id, b.problem]), [[arenaPlaceId(PLACES[2]), 'gone']]);
});
