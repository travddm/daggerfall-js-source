// A named boot (`?loc=Daggerfall`) stands the player in the town by DFU's RandomStartMarker landing, not at the town's edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBootStart } from '../../src/scenes/bootStartHost.js';
import { MapsFile, longitudeLatitudeToMapPixel } from '../../src/formats/mapsFile.js';
import { REPOSITION } from '../../src/systems/ship.js';

const ARENA2 = process.env.ARENA2_PATH;
const NO_DATA = ARENA2 ? false : 'ARENA2_PATH unset (sh tools/fetch-data.sh)';

function boot(search) {
  const maps = new MapsFile();
  const rd = (f) => readFileSync(`${ARENA2}/${f}`);
  maps.load(rd('MAPS.BSA'), rd('CLIMATE.PAK'), rd('POLITIC.PAK'));
  const params = new URLSearchParams(search);
  const moves = [];
  const start = createBootStart({
    params,
    locationIndex: new Map(),
    maps,
    worldPlaces: null,
    regionName: params.get('region') || 'Daggerfall',
    locationName: params.get('loc') || 'Daggerfall',
    _teleportToPixel: async (x, y, local, opts) => {
      moves.push([x, y, local, opts]);
    },
    _worldReady: () => true,
    arenaTraced: Promise.resolve(),
    townTalk: { say() {} },
  });
  return { ...start, moves };
}

test(
  'a named start lands on its start marker (the Daggerfall boot stood in a field outside the wall)',
  { skip: NO_DATA },
  async () => {
    const b = boot('?world=1&region=Daggerfall&loc=Daggerfall');
    const px = longitudeLatitudeToMapPixel(b.startLoc.mapTableData.longitude, b.startLoc.mapTableData.latitude);
    assert.equal(typeof b.landAtStart, 'function');
    await b.landAtStart();
    assert.deepEqual(b.moves, [[px.x, px.y, null, { reposition: REPOSITION.RandomStartMarker }]]);
  },
);
