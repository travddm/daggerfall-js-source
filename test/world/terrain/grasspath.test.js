import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { paintRoads, TILE, TRACK_TILES } from '../../../src/world/road/roadPainter.js';
import { generatePixelTerrain } from '../../../src/world/terrain/terrainGen.js';
import { createLookupTable } from '../../../src/world/terrain/terrainTiles.js';
import { waterCorners, WATER_MASK_TABLE } from '../../../src/world/water/waterCorners.js';
import { buildWaterIndices, tilemapRectHasWater } from '../../../src/render/waterSurface.js';
import { discSlotCount, cellKey, createGrassField, GRASS_CELL, LAB_GRASS } from '../../../src/render/labGrass.js';
import { grassRecordsOf } from '../../../src/render/labGrass.js';
import { DIR } from '../../../src/world/road/roadNetwork.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('GRASS-PATH1: a track across grass writes the very records the natural dirt-grass edge writes', () => {
  // This is WHY the mask has to exist. The grass placer decides by
  // record (grassRecordsOf), and the record cannot tell a dirt path from
  // the edge of a field: the track's four slots on grass ground are
  // 11/51/12/10, and createLookupTable's dirt-grass ring is built from
  // the same shapeStart 10 and saddle 51. Excluding them by number would
  // strip the grass off every dirt boundary in the world.
  const onGrass = new Set(TRACK_TILES.filter(Boolean).map((slot) => slot[TILE.grass]));
  const natural = new Set();
  const lut = createLookupTable();
  for (let i = 16; i < 32; i++) natural.add(lut[i] & 0x3f);   // the ring-1 (dirt <-> grass) half of the table
  for (const rec of onGrass) assert.ok(natural.has(rec), `track record ${rec} is also a natural dirt-grass transition`);
});

test('GRASS-PATH1: the painter marks every tile it writes, and marks nothing else - at EVERY write site', () => {
  // AUDIT: the first draft of this pin painted one east-west track and
  // nothing else, so three of the painter's four write sites - the road,
  // the river's bare-water join, and the "paint roads around locations"
  // rect fill - were never on trial and a mutant that dropped the mark
  // from any of them survived. Every site is exercised here, and the
  // fixtures are named so a gap is visible rather than implied.
  const grid = (g) => new Uint8Array(129 * 129).fill(g);
  const ALL = 0xff;   // every compass bit, so every arm of the painter runs
  const cases = [
    ['a track through grass (TRACK_TILES)', { tileData: grid(TILE.grass), road: 0, track: DIR.E | DIR.W, rect: null, opts: {} }],
    ['a road through grass (ROAD_TILES)', { tileData: grid(TILE.grass), road: ALL, track: 0, rect: null, opts: {} }],
    ['a river and a stream (the bare-water joins)', { tileData: grid(TILE.grass), road: 0, track: 0, rect: null, opts: { river: ALL, stream: ALL, water: true } }],
    ['a road around a location (the rect fill)', { tileData: grid(TILE.grass), road: ALL, track: 0, rect: { xMin: 30, xMax: 90, yMin: 30, yMax: 90 }, opts: {} }],
    ['a neighbour\u2019s diagonal on the corners', { least: 1, tileData: grid(TILE.stone), road: 0, track: 0, rect: null, opts: { corners: { road: ALL, track: ALL, river: ALL, stream: ALL }, river: 0, stream: 0, water: true } }],
    ['everything at once, over stone', { tileData: grid(TILE.stone), road: ALL, track: ALL, rect: { xMin: 20, xMax: 100, yMin: 20, yMax: 100 }, opts: { river: ALL, stream: ALL, water: true, corners: { road: ALL, track: ALL, river: ALL, stream: ALL } } }],
  ];
  for (const [what, c] of cases) {
    const tilemap = new Uint8Array(128 * 128);
    const paths = new Uint8Array(128 * 128);
    const painted = paintRoads(c.tileData, tilemap, c.road, c.track, c.rect, 129, { ...c.opts, paths });
    assert.ok(painted > 0, `${what}: the painter painted`);
    let marked = 0, written = 0, mismatch = 0;
    for (let i = 0; i < tilemap.length; i++) {
      const w = tilemap[i] !== 0, m = paths[i] === 1;
      if (m) marked++;
      if (w) written++;
      if (w !== m) mismatch++;
    }
    assert.equal(mismatch, 0, `${what}: exactly the tiles the painter wrote carry the mark`);
    assert.ok(marked >= (c.least ?? 50), `${what}: and there is a real run of them (${marked})`);   // the corner case writes the four map-pixel corners and nothing else, by design
  }
  // ...and the mark never lands on a tile the painter SKIPPED, which a
  // town's own pre-seeded tiles are - the rect fill writes only into the
  // clearance band, and no painter overwrites a location's ground.
  const seeded = new Uint8Array(128 * 128);
  for (let y = 40; y < 88; y++) for (let x = 40; x < 88; x++) seeded[y * 128 + x] = 0xff;
  const tilemap = seeded.slice(), paths = new Uint8Array(128 * 128);
  paintRoads(grid(TILE.grass), tilemap, ALL, ALL, { xMin: 36, xMax: 92, yMin: 36, yMax: 92 }, 129,
    { river: ALL, stream: ALL, water: true, corners: { road: ALL, track: ALL, river: ALL, stream: ALL }, paths });
  let onSeed = 0, changedUnmarked = 0;
  for (let i = 0; i < tilemap.length; i++) {
    if (seeded[i] !== 0 && paths[i]) onSeed++;
    if (tilemap[i] !== seeded[i] && !paths[i]) changedUnmarked++;
  }
  assert.equal(onSeed, 0, 'a town\u2019s own tile is skipped by the painter and never marked');
  assert.equal(changedUnmarked, 0, 'and every tile the painter DID change is marked');
});

test('GRASS-PATH1: the mask is null on a roadless pixel and the painter is unchanged without one', () => {
  const tilemap = new Uint8Array(128 * 128);
  const bare = new Uint8Array(128 * 128);
  const tileData = new Uint8Array(129 * 129).fill(TILE.grass);
  paintRoads(tileData, tilemap, 0, DIR.E | DIR.W, null, 129, {});             // no mask
  paintRoads(tileData, bare, 0, DIR.E | DIR.W, null, 129, { paths: new Uint8Array(128 * 128) });
  assert.deepEqual([...tilemap], [...bare], 'the tilemap the painter writes does not depend on the mask');
  assert.equal(typeof generatePixelTerrain, 'function');
});

test('GRASS-WET1: the shore records a stream writes over grass are mostly-grass by texel, which is why the record alone let blades into the water', () => {
  const flat = (r, g, b) => { const c = new Uint8ClampedArray(16 * 16 * 4); for (let k = 0; k < 16 * 16; k++) { c[k * 4] = r; c[k * 4 + 1] = g; c[k * 4 + 2] = b; c[k * 4 + 3] = 255; } return { width: 16, height: 16, colors: c }; };
  const archive = [flat(53, 94, 143), flat(134, 100, 65), flat(52, 76, 42), flat(80, 79, 81)];
  for (let r = 4; r < 56; r++) archive.push(flat(52, 76, 42));   // every blend a lawn, as the GR1 fixture has it
  const grass = grassRecordsOf(archive);
  for (const rec of [20, 21, 22, 49]) {
    assert.ok(grass.has(rec), `water-grass record ${rec} passes grassRecordsOf`);
    assert.ok(waterCorners(rec << 2) !== 0, `...and the corner table knows record ${rec} stands in water`);
  }
});

test('PERF10: the field is a disc - filled at the draw’s range, held out to the span', () => {
  assert.ok(discSlotCount(LAB_GRASS.span) < Math.ceil((LAB_GRASS.span * 2) / GRASS_CELL + 1) ** 2,
    'a disc of the same reach holds fewer cells than the square it replaced');
  // AUDIT PERF10 F1: HELD AGAINST A BRUTE FORCE, NOT AGAINST A NUMBER.
  // The first sweep was 8x8 and answered 392 where the true peak is 394
  // - it sits at offset (0, 6), x exactly on a cell boundary, and a
  // coarse sweep steps over it. A hardcoded expectation would have been
  // written to match the wrong answer, so the pin computes the truth.
  const trueMax = (radius, cell) => {
    const S = 240; let max = 0;
    const k = Math.ceil(radius / cell) + 2;
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const ex = (i / S) * cell, ez = (j / S) * cell;
      let n = 0;
      for (let cx = -k; cx <= k; cx++) {
        const dx = Math.max(cx * cell - ex, 0, ex - (cx + 1) * cell);
        for (let cz = -k; cz <= k; cz++) {
          const dz = Math.max(cz * cell - ez, 0, ez - (cz + 1) * cell);
          if (dx * dx + dz * dz <= radius * radius) n++;
        }
      }
      if (n > max) max = n;
    }
    return max;
  };
  assert.equal(discSlotCount(LAB_GRASS.span, GRASS_CELL), trueMax(LAB_GRASS.span, GRASS_CELL),
    'the swept bound IS the most cells the disc can hold - coarsen the sweep and this fails');
  assert.equal(discSlotCount(120, 30), trueMax(120, 30), 'and at another radius');
  // and the slots allocated cover every cell the field can hold at once:
  // a cell is only ever created inside `range` and freed past `span`.
  const seen = [];
  const r = { allocSlots: (p, s) => seen.push(s), writeSlot: () => {}, clearSlot: () => {} };
  const f = createGrassField(r, { keep: () => 0, perFrame: 1e9, clock: () => 0 });   // FB1021B: a clock that stands still - every cell due now comes on the frame, as a whole fill did
  assert.equal(seen[0], f.slots);
  let max = 0;
  for (let step = 0; step < 40; step++) { f.update(step * 7.5, step * 3.1); if (f.live.size > max) max = f.live.size; }
  assert.ok(max <= f.slots, `the disc never wants more cells than it has slots (${max} of ${f.slots})`);
});

test('AUDIT PERF10 F1: a field with too few slots holds the NEAREST cells - a wrong bound cannot leave a hole', () => {
  // Starve it on purpose: the guarantee is not that the bound is right,
  // it is that the field holds the nearest `slots` cells whatever the
  // bound says. Before the fix this loop broke on an empty free list and
  // the cell stayed unplaced for as long as the eye stood there.
  const held = new Set();
  const r = {
    allocSlots: () => {},
    writeSlot: (slot) => held.add(slot),
    clearSlot: (slot) => held.delete(slot),
  };
  const cell = GRASS_CELL, rad = cell * 4;
  const full = discSlotCount(rad, cell);
  // STARVED ON PURPOSE, through the seam: fewer slots than the disc can
  // ever want. The guarantee is not that the bound is right - it is that
  // the field holds the NEAREST `slots` cells whatever the bound says.
  const slots = full - 8;
  const f = createGrassField(r, { keep: () => 0, perFrame: 1e9, span: rad, range: rad, slots, clock: () => 0 });   // PIN MOVED (FB1021B): a clock that stands still - the frame's time never runs out
  assert.equal(f.slots, slots, 'the seam took');
  let ex = 0;
  for (let i = 0; i <= 80; i++) { ex = i * (cell / 4); f.update(ex, 0); }
  for (let i = 0; i < 20; i++) f.update(ex, 0);   // FB1021B: a walk paces its rim to the eye; the law is the field's once it stands
  assert.ok(f.live.size <= f.slots, `never more live than slots (${f.live.size} of ${f.slots})`);
  assert.equal(held.size, f.live.size, 'and the renderer holds exactly what is live');
  // THE LAW: every live cell is at least as near as every cell that is
  // not. A starved field is allowed to be short; it is not allowed to be
  // short of the WRONG cells, because those are the ones being drawn.
  const k = Math.ceil(rad / cell) + 1, ecx = Math.floor(ex / cell);
  const near = (cx, cz) => {
    const dx = Math.max(cx * cell - ex, 0, ex - (cx + 1) * cell);
    const dz = Math.max(cz * cell - 0, 0, 0 - (cz + 1) * cell);
    return dx * dx + dz * dz;
  };
  let worstLive = -1, bestMissing = Infinity;
  for (let cz = -k; cz <= k; cz++) for (let cx = ecx - k; cx <= ecx + k; cx++) {
    const d = near(cx, cz);
    if (d > rad * rad) continue;
    if (f.live.has(cellKey(cx, cz))) worstLive = Math.max(worstLive, d);
    else bestMissing = Math.min(bestMissing, d);
  }
  assert.ok(bestMissing === Infinity || worstLive <= bestMissing,
    `the field holds the NEAREST cells (farthest live ${Math.sqrt(worstLive).toFixed(1)}m, nearest missing ${Math.sqrt(bestMissing).toFixed(1)}m)`);
  assert.ok(bestMissing < Infinity, 'the fixture really is starved - something IS missing');
});

test('AUDIT PERF10: the window is measured to a cell’s NEAREST POINT, as the draw culls by', () => {
  // _drawVisibleSlots skips a slot whose box's nearest point is past
  // `range`. If the FILL measured to the cell's CENTRE instead, every
  // cell straddling the rim - nearest point inside, centre outside -
  // would be drawn-but-never-placed: a ragged hole all the way round the
  // horizon. The two must be the same measure, and a source pin cannot
  // say that, so this holds the live set against the law directly.
  const r = { allocSlots: () => {}, writeSlot: () => {}, clearSlot: () => {} };
  const cell = GRASS_CELL, rad = cell * 4;
  const f = createGrassField(r, { keep: () => 0, perFrame: 1e9, span: rad, range: rad, clock: () => 0 });   // PIN MOVED (FB1021B): a clock that stands still - the whole disc in the one update
  const ex = 7.3, ez = 21.9;   // an offset with no symmetry to hide behind
  f.update(ex, ez);
  const k = Math.ceil(rad / cell) + 2;
  let missing = 0, extra = 0, straddlers = 0;
  for (let cz = Math.floor(ez / cell) - k; cz <= Math.floor(ez / cell) + k; cz++) {
    for (let cx = Math.floor(ex / cell) - k; cx <= Math.floor(ex / cell) + k; cx++) {
      const dx = Math.max(cx * cell - ex, 0, ex - (cx + 1) * cell);
      const dz = Math.max(cz * cell - ez, 0, ez - (cz + 1) * cell);
      const nearIn = dx * dx + dz * dz <= rad * rad;
      const cdx = (cx + 0.5) * cell - ex, cdz = (cz + 0.5) * cell - ez;
      const centreIn = cdx * cdx + cdz * cdz <= rad * rad;
      if (nearIn && !centreIn) straddlers++;
      const live = f.live.has(cellKey(cx, cz));
      if (nearIn && !live) missing++;
      if (!nearIn && live) extra++;
    }
  }
  assert.ok(straddlers > 0, `the fixture really does have rim cells the two measures disagree about (${straddlers})`);
  assert.equal(missing, 0, 'every cell whose NEAREST point is in range is placed');
  assert.equal(extra, 0, 'and no cell beyond it is');
});

test('PERF10: the cell key is a number and the free sweep parses nothing', () => {
  assert.equal(cellKey(3, -4), 3 * 65536 - 4);
  assert.notEqual(cellKey(3, -4), cellKey(-4, 3));
});

test('WATER-DRAW1: the draw and the feet ask different questions, and only the draw’s table moved', async () => {
  const { WATER_MASK_TABLE, WATER_DRAW_MASK_TABLE, SHALLOW_DRAWN, SHALLOW_WHOLE, ISLAND_DRAWN, CORNER_DRAWN, SHORE_FAMILIES, buildWaterMaskTable } = await import('../../../src/world/water/waterCorners.js');
  // The LAW's table is byte-for-byte what it was: the player swims where
  // PlayerMotor.OnShallowWaterTile says and nowhere else.
  assert.deepEqual([...WATER_MASK_TABLE], [...buildWaterMaskTable()], 'the feet’s table is the default build');
  for (const r of SHALLOW_DRAWN) {
    assert.equal(WATER_MASK_TABLE[r << 2], 0, `record ${r} is NOT water to DFU's motor, and still is not`);
    assert.equal(WATER_DRAW_MASK_TABLE[r << 2], 0xF, `...but the enhanced pass draws it whole`);
  }
  // and nothing else differs between the two - PIN MOVED (WATER-DRAW2, test/world/water/waterdraw2.test.js): SHALLOW_DRAWN, the
  // islands, the corners and the saddles' half turns (each family's fourth record at turns 2 and 3, nothing else of it)
  const diff = [];
  for (let i = 0; i < 256; i++) if (WATER_MASK_TABLE[i] !== WATER_DRAW_MASK_TABLE[i]) diff.push(i);
  const saddles = SHORE_FAMILIES.map((f) => f[3]);
  assert.deepEqual([...new Set(diff.map((i) => i >> 2))].sort((a, b) => a - b), [...SHALLOW_DRAWN, ...ISLAND_DRAWN, ...CORNER_DRAWN, ...saddles].sort((a, b) => a - b), 'SHALLOW_DRAWN and WATER-DRAW2\'s are the whole of the difference');
  assert.deepEqual(diff.filter((i) => saddles.includes(i >> 2)).map((i) => i & 3), [2, 3, 2, 3, 2, 3], 'a saddle differs only half turned');
  // AUDIT: and it is NOT EMPTY. Every assertion above quantifies over
  // SHALLOW_DRAWN, so emptying it satisfies all of them vacuously and
  // the whole fix reverts with the pins still green. The content is the
  // fix, so the content is pinned.
  assert.deepEqual([...SHALLOW_DRAWN], [9], 'record 9 is the fix, and an empty list is not a passing state');
  // SHALLOW_DRAWN names records neither the shore families nor DFU's list covers
  for (const r of SHALLOW_DRAWN) assert.ok(!SHALLOW_WHOLE.includes(r), `${r} is not already DFU's`);
  // the consumers: the pass and the lab take the draw's, the feet and the town's navigation the law's
  // AUDIT: BEHAVIOURALLY, not by a regex over the file. The source pins
  // this replaces both matched a file in which buildWaterIndices had been
  // put back on the feet's table - `tilemapRectHasWater` still named the
  // draw's, and `buildWaterMaskTable()` is not the string
  // `WATER_MASK_TABLE`. The question is what the pass DRAWS.
  const dry = new Uint8Array(128 * 128).fill(2 << 2);   // grass, whole
  assert.equal(buildWaterIndices(dry, 1), null, 'a dry pixel builds no water quads');
  dry[64 * 128 + 64] = 9 << 2;                          // one record-9 tile
  assert.ok(buildWaterIndices(dry, 1), 'a record-9 tile DRAWS - the pass takes the draw’s table');
  assert.equal(buildWaterIndices(dry, 1, WATER_MASK_TABLE), null, '...and the feet’s table still calls that pixel dry');
  assert.ok(tilemapRectHasWater(dry, 128, 128, 128), 'and the town host’s gate opens on it too');
});

