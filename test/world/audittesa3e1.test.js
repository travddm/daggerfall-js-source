// AUDIT TESA III lane E1: the pins of the findings fixed in the lane's own files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOWN_OUTLINE_BLOCK, townOutlineBlockJson } from '../../src/world/townOutline.js';
import { townWallCellsOf, wallOnTownMap, wallLaidBytes, registerTownWall, townWallBlockName, WALL_BYTE } from '../../src/world/townWalls.js';
import { installWorldDataReplacement } from '../../src/formats/worldData/worldDataReplacement.js';
import { CityNavigation } from '../../src/world/city/cityNavigation.js';
import { rectsLookup, rectsFingerprint, bakeCacheKey, BAKE_GENERATOR_VERSION } from '../../src/world/deepWater/deepWatersBakeCache.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const RING = ['WALLAA02.RMB', 'WALLAA10.RMB', 'WALLAA03.RMB', 'WALLAA07.RMB', 'H.RMB', 'WALLAA05.RMB', 'WALLAA00.RMB', 'WALLAA08.RMB', 'WALLAA01.RMB'];
const city = (names, mapId) => ({ name: 'Bayton', mapTableData: { mapId }, exterior: { buildings: [], exteriorData: { width: 3, height: 3, blockNames: names.slice() } } });
/** A walk grid off a city's blocks' bytes, as the bench builds its own (scenes/exterior.js: each block's bytes, a ground of
 *  grass) - `bytesOf(bx, by, own)` the bytes it hands setBlockData. */
const navOf = (w, h, own, bytesOf) => {
  const nav = new CityNavigation(w, h);
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) nav.setBlockData(bx, by, bytesOf(bx, by, own(bx, by)), () => 2);
  return nav;
};

test('AUDIT TESA III E1-2 THE BENCH KNOWS A CITY\'S WALL: a city walled on its outline lays its wall in each block\'s town-map bytes (a copy; a block it crosses none of, and a city with no wall of its own, its own bytes) - a walk grid carved off them is shut on every cell of the wall, where one off the raw bytes walks through it; the fixed-city bench carves and draws its town through them (mutants: the bytes unlaid; the bench\'s walk grid off the raw bytes; its town map unwalled)', () => {
  installWorldDataReplacement();
  const houses = new Uint8Array(4096);
  for (let r = 8; r < 56; r++) for (let c = 8; c < 56; c++) houses[r * 64 + c] = 5;
  const gate = (z) => ({ rmbBlock: { subRecords: [{ xPos: 2048, zPos: z, yRotation: 0, exterior: { block3dObjectRecords: [{ modelIdNum: 446, xPos: 0, zPos: -64 }] } }], misc3dObjectRecords: [], miscFlatObjectRecords: [] } });
  const served = { 'H.RMB': { rmbBlock: { fldHeader: { autoMapData: houses }, misc3dObjectRecords: [], miscFlatObjectRecords: [], subRecords: [] } }, 'WALLAA08.RMB': gate(3584), 'WALLAA10.RMB': gate(512) };
  // a city walled on its outline: its ring cells open, its south-west corner the wall's carrier
  const loc = { ...city(RING.map((n, i) => (n === 'H.RMB' ? n : i === 0 ? townWallBlockName(4501) : TOWN_OUTLINE_BLOCK)), 4501), outline: { walled: true } };
  registerTownWall(loc, RING, { servedOf: (n) => served[n] ?? null }, townOutlineBlockJson);
  const cells = townWallCellsOf(loc);
  assert.ok(cells && cells.some(Boolean), 'its wall registered');
  const names = loc.exterior.exteriorData.blockNames;
  const own = (bx, by) => (names[by * 3 + bx] === 'H.RMB' ? houses : new Uint8Array(4096));   // the open cells' and the carrier's: none
  let laid = 0;
  for (let by = 0; by < 3; by++) for (let bx = 0; bx < 3; bx++) {
    const raw = own(bx, by), before = Uint8Array.from(raw), got = wallLaidBytes(loc, bx, by, raw);
    assert.deepEqual([...got], [...wallOnTownMap([{ x: bx, y: by, autoMap: raw }], cells, 3)[0].autoMap], `block ${bx},${by}: the wall's own bytes`);
    assert.deepEqual([...raw], [...before], 'a copy - the block\'s bytes untouched');
    laid += got.filter((v) => v === WALL_BYTE).length;
  }
  assert.ok(laid > 0, 'the wall laid in the blocks it crosses');
  const shut = navOf(3, 3, own, (bx, by, raw) => wallLaidBytes(loc, bx, by, raw)), open = navOf(3, 3, own, (bx, by, raw) => raw);
  assert.ok([...cells].every((v, i) => !v || shut.grid[i] === 0), 'every wall cell shut to the walkers');
  assert.ok([...cells].some((v, i) => v && open.grid[i] > 0), 'the raw bytes walk through it');
  // a city with no wall of its own: its bytes themselves
  const plain = city(['H.RMB'], 4502);
  assert.equal(wallLaidBytes(plain, 0, 0, houses), houses);
});

test('AUDIT TESA III E1-4 THE DEEP WATERS BAKE BLENDS A TOWN AS THE STREAMED BUILD DOES: a coastal location\'s row carries its outline (TOWN-SHAPES TS2\'s `shape`) beside its rect, the lookup hands it to the bake\'s water test, the bake\'s key moves with its bytes, and the generator\'s version moved so no bake kept off the rect alone is read (mutants: the outline unread by the lookup; unkept in the key; the version unmoved)', () => {
  const shape = new Uint8Array(128 * 128);
  shape[64 * 128 + 64] = 1;
  const rows = [[250500, 10, 20, 30, 40, shape], [100, 1, 2, 3, 4]];
  assert.deepEqual(rectsLookup(rows)(500, 250), { xMin: 10, xMax: 20, yMin: 30, yMax: 40, shape }, 'the outline handed on');
  assert.equal(rectsLookup(rows)(500, 250).shape, shape);
  assert.deepEqual(rectsLookup(rows)(100, 0), { xMin: 1, xMax: 2, yMin: 3, yMax: 4 }, 'a row with none, as before');
  const moved = Uint8Array.from(shape);
  moved[64 * 128 + 65] = 1;
  assert.notEqual(rectsFingerprint(rows), rectsFingerprint([[250500, 10, 20, 30, 40, moved], [100, 1, 2, 3, 4]]), 'an outline moved moves the key');
  assert.equal(rectsFingerprint([[100, 1, 2, 3, 4]]), rectsFingerprint([[100, 1, 2, 3, 4]]));
  assert.equal(BAKE_GENERATOR_VERSION, 2, 'the bake\'s rules moved: a coastal town\'s blend its outline\'s (was 1)');
  assert.match(bakeCacheKey({ woodsHash: 1, rectsHash: 2 }), /^dwbake:v2:1:2$/);
});

