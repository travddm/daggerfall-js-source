// WW7 (2026-10-25, the owner: "we need the same city nodes populating the entire map of tamriel", "We also need to fully
// integrate our living world into the entirety of tamriel"; bible/03-World/World-Wide.md WW7): TESA's places in the
// world's registry, the living world's ways over the land past the Bay, a town by its map id the registry's past it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTownTable } from '../../../src/world/worldWide/townTable.js';
import { createWorldPlaces } from '../../../src/world/worldWide/worldPlaces.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('WW7-1 a town by its map id: the Bay\'s own table first, else the registry\'s place past the Bay in the table\'s shape, else none (mutants: the registry unasked; the table\'s own row overridden)', () => {
  const places = createWorldPlaces();
  places.register('tesa-arena', [{ mapId: 0xa7_7a120, name: 'Northpoint', px: -40, py: 12, type: 0, w: 6, h: 6 }]);
  const table = createTownTable(() => places);
  table.set(5, { name: 'Daggerfall', px: 207, py: 213, region: 17, type: 0, location: 3 });
  assert.equal(table.get(5).name, 'Daggerfall', 'the Bay\'s own');
  assert.equal(table.get(5).location, 3);
  const past = table.get(0xa7_7a120);
  assert.deepEqual({ ...past }, { name: 'Northpoint', px: -40, py: 12, region: past.region, type: 0 });
  assert.equal(table.get(12345), undefined, 'none');
  assert.equal(createTownTable(() => null).get(0xa7_7a120), undefined, 'no registry yet: none');
  assert.ok(table.has(0xa7_7a120) && !table.has(12345));
  assert.equal(table.size, 1, 'the Bay\'s own count');
});

