// A location of Daggerfall's own map stands on DFU's town ground (TerrainHelper.SetLocationTiles and
// BlendLocationTerrainJob): every ground tile of its grid stamped, and a square plateau over its whole rect. Only a
// location the port makes past the Bay gets an outline of its own (terrainTiles.js isPortMadeLocation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  setLocationTiles,
  isPortMadeLocation,
  getLocationTerrainTileOrigin,
  GROUND_RECORD_LIMIT,
  WORLD_MAP_TILE_DIM,
} from '../../../src/world/terrain/terrainTiles.js';

const ARENA2 = process.env.ARENA2_PATH;
const skipReal =
  !ARENA2 || !['BLOCKS.BSA', 'MAPS.BSA', 'WOODS.WLD'].every((f) => existsSync(join(ARENA2, f)))
    ? 'ARENA2_PATH not set or missing - real-data validation skipped'
    : false;
const D = WORLD_MAP_TILE_DIM;
const H = D + 1;

/** A block whose every ground tile is grass, with one house drawn in its middle on the town map. */
function houseBlock() {
  const tile = { textureRecord: 2, tileBitfield: 2 };
  const autoMapData = new Uint8Array(64 * 64);
  for (let r = 24; r < 40; r++) for (let c = 24; c < 40; c++) autoMapData[r * 64 + c] = 5;
  const groundTiles = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => tile));
  return {
    name: 'H.RMB',
    rmbBlock: {
      fldHeader: { groundData: { groundTiles }, autoMapData },
      misc3dObjectRecords: [],
      miscFlatObjectRecords: [],
      subRecords: [],
    },
  };
}

/** A 3 x 3 town at a pixel's middle, every cell the house block. */
function town(extra = {}) {
  return {
    name: 'Testham',
    mapTableData: { mapId: 4242, locationType: 2, longitude: 300 * 128, latitude: (499 - 200) * 128 },
    exterior: { exteriorData: { width: 3, height: 3, blockNames: Array(9).fill('H.RMB') } },
    ...extra,
  };
}

function stamp(loc) {
  const block = houseBlock(),
    tilemap = new Uint8Array(D * D);
  const rect = setLocationTiles(
    loc,
    { getRmbBlockName: () => 'H.RMB' },
    { checkName: (n) => n, getBlockIndex: () => 0, getBlock: () => block },
    tilemap,
  );
  return { rect, stamped: tilemap.reduce((n, v) => n + (v ? 1 : 0), 0) };
}

test("a location of Daggerfall's own map stamps every ground tile of its grid and has no outline; a location the port makes past the Bay (a town, a lair, an isle's place, a spawned dungeon) keeps its outline (mutants: the outline on every location; on none)", () => {
  for (const flag of [
    { arena: { province: 'Skyrim' } },
    { country: { type: 2 } },
    { ether: 'isle-1' },
    { spawned: true },
  ]) {
    assert.equal(isPortMadeLocation(town(flag)), true, JSON.stringify(flag));
  }
  assert.equal(isPortMadeLocation(town()), false, 'a row of MAPS.BSA');
  const bay = stamp(town());
  assert.equal(bay.rect.shape, undefined, 'the Bay: no outline');
  assert.equal(bay.stamped, 9 * 16 * 16, 'the Bay: every tile of the grid stamped');
  const past = stamp(town({ country: { type: 2 } }));
  assert.ok(past.rect.shape, 'past the Bay: its outline');
  assert.ok(past.stamped > 0 && past.stamped < 9 * 16 * 16, `past the Bay: only the outline stamped (${past.stamped})`);
});

/** The Bay's checks on one location laid on its pixel: DFU's stamp, a flat rect at the plateau, no terrain tree in it. */
async function assertDfuGround(loc, maps, blocks, woods, label) {
  const { generatePixelTerrain } = await import('../../../src/world/terrain/terrainGen.js');
  const px = Math.trunc(loc.mapTableData.longitude / 128),
    py = 499 - Math.trunc(loc.mapTableData.latitude / 128);
  const tilemap = new Uint8Array(D * D);
  const rect = setLocationTiles(loc, maps, blocks, tilemap);
  assert.equal(rect.shape, undefined, `${label}: no outline`);
  // DFU's stamp: every tile of every block under the ground record limit
  const pos = getLocationTerrainTileOrigin(loc),
    { width, height } = loc.exterior.exteriorData;
  for (let by = 0; by < height; by++)
    for (let bx = 0; bx < width; bx++) {
      const block = blocks.getBlockByName(blocks.checkName(maps.getRmbBlockName(loc, bx, by)));
      const ground = block?.rmbBlock?.fldHeader?.groundData?.groundTiles;
      if (!ground) continue;
      for (let ty = 0; ty < 16; ty++)
        for (let tx = 0; tx < 16; tx++) {
          if (ground[tx][15 - ty].textureRecord >= GROUND_RECORD_LIMIT) continue;
          assert.ok(
            tilemap[pos.x + bx * 16 + tx + (pos.y + by * 16 + ty) * D],
            `${label}: block ${bx},${by} tile ${tx},${ty} stamped`,
          );
        }
    }
  const t = generatePixelTerrain({
    woods,
    px,
    py,
    tilemap,
    locationRect: rect,
    hasLocation: true,
    climateType: maps.getClimateIndex(px, py),
  });
  let off = 0;
  for (let y = Math.max(0, rect.yMin); y <= Math.min(D, rect.yMax); y++)
    for (let x = Math.max(0, rect.xMin); x <= Math.min(D, rect.xMax); x++) {
      if (Math.abs(t.samples[y + x * H] - t.avg) > 1e-6) off++;
    }
  assert.equal(off, 0, `${label}: the whole rect at the plateau, the sea in it lifted`);
  const tile = 819.2 / D;
  const inRect = (t.nature ?? []).filter((n) => {
    const x = Math.floor(n.x / tile),
      y = Math.floor(n.z / tile);
    return x >= rect.xMin && x <= rect.xMax && y >= rect.yMin && y <= rect.yMax;
  });
  assert.equal(inRect.length, 0, `${label}: no terrain tree inside the rect`);
}

const COAST = ['Antelibuton', 'Westhead Moor'];

test(
  "with ARENA2, the town packs off: Antelibuton and Westhead Moor (a sea channel between blocks, a sheer wall over the sea on the outline) stand on DFU's ground; Deep Waters gets their rects without an outline (mutant: the outline on every location)",
  { skip: skipReal },
  async () => {
    const { BlocksFile } = await import('../../../src/formats/blocksFile.js');
    const { MapsFile } = await import('../../../src/formats/mapsFile.js');
    const { WoodsFile } = await import('../../../src/formats/woodsFile.js');
    const { deepWatersLocationRects } = await import('../../../src/world/deepWater/deepWatersClient.js');
    const bytes = (n) => new Uint8Array(readFileSync(join(ARENA2, n)));
    const blocks = new BlocksFile();
    blocks.load(bytes('BLOCKS.BSA'));
    const maps = new MapsFile();
    maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK'));
    maps.autoDiscard = false;
    const woods = new WoodsFile();
    woods.load(bytes('WOODS.WLD'));
    const found = [];
    for (let r = 0; r < 62; r++) {
      const reg = maps.getRegion(r);
      for (let l = 0; reg && l < reg.locationCount; l++) {
        const loc = maps.getLocation(r, l);
        if (!loc || !COAST.includes(loc.name)) continue;
        await assertDfuGround(loc, maps, blocks, woods, loc.name);
        const px = Math.trunc(loc.mapTableData.longitude / 128),
          py = 499 - Math.trunc(loc.mapTableData.latitude / 128);
        const rows = deepWatersLocationRects(woods, [[px, py, loc]], maps, blocks);
        assert.ok(rows.length === 1 && rows[0].length === 5, `${loc.name}: Deep Waters' row is the rect alone`);
        found.push(loc.name);
      }
    }
    assert.deepEqual(found.sort(), [...COAST].sort());
  },
);

test(
  "with ARENA2, the town packs on (both packs on the door, as online): the same two towns stand on DFU's ground, and a city past the Bay still stands on its outline (mutants: the outline on every location; on none)",
  { skip: skipReal, timeout: 600_000 },
  async () => {
    const { openSweep, sweepClone } = await import('../../../tools/townBoardsSweep.mjs');
    const sw = await openSweep(ARENA2);
    const towns = sw.rows.filter((l) => COAST.includes(l.name));
    assert.equal(towns.length, COAST.length);
    for (const loc of towns) await assertDfuGround(loc, sw.maps, sw.blocks, sw.woodsOf(), `${loc.name} (packs on)`);
    const clone = sweepClone(sw, 'city-state', 0);
    const rect = setLocationTiles(clone, sw.maps, sw.blocks, new Uint8Array(D * D));
    assert.ok(rect.shape, 'a city past the Bay: its outline');
  },
);
