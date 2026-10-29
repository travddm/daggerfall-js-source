// SNOW-STAMP (2026-10-29, perf): the snow's authored mask for a family capital's slice is the tiles its build stamped
// (world/terrain/terrainTiles.js stampedTiles), not authoredTiles' scan of the location's blocks - that scan generated all
// 64 of an Imperial City slice's blocks on the page for every streamed slice. Elsewhere the scan stands as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocationTiles, stampedTiles } from '../../src/world/terrain/terrainTiles.js';
import { authoredTiles } from '../../src/scenes/snowfallHost.js';
import { createSnowGround } from '../../src/scenes/snowGround.js';

// a 2 x 2 grid of blocks, each tile's record its own: under 56 the block's ground, 56 and up the land's
const groundOf = (seed) => Array.from({ length: 16 }, (_, x) => Array.from({ length: 16 }, (_, y) => ({ textureRecord: (x * 7 + y * 3 + seed) % 80, tileBitfield: (x + y + seed) % 4 })));
const NAMES = ['TESAI00.RMB', 'TESAI01.RMB', 'TESAI02.RMB', 'TESAI03.RMB'];
const capitalSlice = () => ({
  name: 'Slice', regionIndex: 1, locationIndex: 2, capital: { k: 0, s: 0, rim: null },
  mapTableData: { mapId: 9, locationType: 0 },
  exterior: { exteriorData: { width: 2, height: 2, blockNames: NAMES } },
});
const maps = { getRmbBlockName: (loc, x, y) => loc.exterior.exteriorData.blockNames[y * 2 + x] };
const blocksOf = (reads) => ({
  checkName: (n) => n,
  getBlockIndex: (n) => NAMES.indexOf(n),
  getBlock: (i) => { reads.push(i); return { name: NAMES[i], rmbBlock: { fldHeader: { groundData: { groundTiles: groundOf(i) } } } }; },
});

test('SNOW-STAMP the stamped tiles of a capital\'s slice (no outline, no wall carrier) are authoredTiles\' mask bit for bit - every tile setLocationTiles laid, none of the land\'s (mutants: a stamped zero bitfield missed; the land\'s records marked)', () => {
  const loc = capitalSlice(), seed = new Uint8Array(16384);
  setLocationTiles(loc, maps, blocksOf([]), seed);
  const stamped = stampedTiles(seed), scanned = authoredTiles(loc, maps, blocksOf([]));
  assert.deepEqual(stamped, scanned);
  const marked = stamped.reduce((a, b) => a + b, 0);
  assert.ok(marked > 0 && marked < 4 * 256, `some of the blocks' tiles authored, not all (${marked})`);
  // a stamped tile with a zero bitfield is written 0xFF, so it still counts
  assert.ok([...seed].includes(0xff));
});

test('SNOW-STAMP the snow\'s roads read the entry\'s stamped tiles and read no block; an entry with none scans its location\'s blocks as before (mutants: the stamp unread; the scan dropped)', () => {
  const loc = capitalSlice(), px = 500, py = 250, reads = [];
  const roads = new Uint8Array(1000 * 500);
  roads[px + py * 1000] = 0b11;   // a road through the pixel, so the scan is asked
  const host = {
    blocks: blocksOf(reads), locationIndex: new Map([[`${px},${py}`, loc]]), maps,
    terrainGen: { roads: () => ({ source: 'basic-roads', roads, tracks: new Uint8Array(1000 * 500) }) },
    built: new Map(), deepWaters: null, state: {},
  };
  const { snowGround } = createSnowGround(host);
  const rect = { xMin: 0, xMax: 127, yMin: 0, yMax: 127 };
  const mask = new Uint8Array(16384).fill(1, 0, 300);
  const fromStamp = snowGround.roads({ px, py, paths: null, locationRect: rect, stampedTiles: mask });
  assert.equal(fromStamp.authored, mask);
  assert.deepEqual(reads, [], 'no block read for a stamped slice');
  const scanned = snowGround.roads({ px, py, paths: null, locationRect: rect, stampedTiles: null });
  assert.deepEqual(scanned.authored, authoredTiles(loc, maps, blocksOf([])));
  assert.equal(reads.length, 4, 'the scan reads the four blocks');
});
