// WW-C2: THE PIXEL PAST THE BAY. A world point's map pixel is FLOORED: DFU's truncation on the Bay, the pixel it stands
// in past the Bay's west and south edges, and every copy of the law (the streamer's, the map file's, the wire's, the
// serpent's site) says the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldCoordToMapPixel as fileWorldToPixel } from '../../../src/formats/mapsFile.js';
import { worldCoordToMapPixel, mapPixelToWorldCoords } from '../../../src/world/streamingWorld.js';
import { sitePixelOfNative } from '../../../src/systems/serpent/serpentSite.js';
import { mapPixelOfWire, cellRoomOfWire, worldRoom, PIXEL_UNITS } from '../../../src/net/wire.js';

test('WW-C2 THE PIXEL PAST THE BAY: a world point\'s map pixel is FLOORED - DFU\'s truncation on the Bay, the pixel it stands in past its west and south edges; every copy of the law alike (mutants: one copy truncated)', () => {
  const N = 32768;
  for (const [px, py] of [[0, 0], [999, 499], [2400, 900], [-300, 1200], [1500, 600]]) {
    const c = mapPixelToWorldCoords(px, py);
    for (const [fx, fz] of [[0.5, 0.5], [0.01, 0.99], [0.99, 0.01]]) {
      const x = c.x + fx * N, z = c.z + fz * N;
      assert.deepEqual(worldCoordToMapPixel(x, z), { x: px, y: py }, `${px},${py} at (${fx}, ${fz})`);
      assert.deepEqual(fileWorldToPixel(x, z), { x: px, y: py });
      assert.deepEqual(mapPixelOfWire(x / N * PIXEL_UNITS, z / N * PIXEL_UNITS), [px, py]);
      assert.deepEqual(sitePixelOfNative(x / N * PIXEL_UNITS, z / N * PIXEL_UNITS), [px, py]);
      assert.equal(cellRoomOfWire(x / N * PIXEL_UNITS, z / N * PIXEL_UNITS), worldRoom(px, py));
    }
  }
  assert.deepEqual(worldCoordToMapPixel(-1, -1), { x: -1, y: 500 }, 'a hair past the corner is the pixel past it');
  assert.deepEqual(worldCoordToMapPixel(1, 1), { x: 0, y: 499 }, 'on the Bay, DFU\'s own');
});
