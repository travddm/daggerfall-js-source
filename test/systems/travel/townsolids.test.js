// TOWN-SOLIDS: the journey's grid covers the town's solid models (fences, walls, the town mods' pieces), which no automap
// holds - so a journey's way through a town goes round a fenced yard instead of through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solidCells, coverNav, townWayCells, clearLine, SOLID_BAND } from '../../../src/systems/travel/townWalk.js';
import { createTownWalk } from '../../../src/scenes/townWalkHost.js';
import { CityNavigation, NAV_CELL } from '../../../src/world/city/cityNavigation.js';
import { mapPixelWorldOrigin } from '../../../src/systems/travel/travelPaths.js';
import { SCENE_MAP_RATIO } from '../../../src/world/streamingWorld.js';

const C = NAV_CELL;

/** A grid `w` x `h` of road. */
function road(w, h) {
  const g = new Uint8Array(w * h).fill(15 << 4);
  return {
    width: w,
    height: h,
    grid: g,
    weightAt: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? g[y * w + x] >> 4 : 0),
  };
}

/** A box model, metres, at the origin of its own frame; `at` its column-major placing (a translation). */
function box(x0, y0, z0, x1, y1, z1, at = [0, 0, 0]) {
  const positions = new Float32Array([
    x0,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y1,
    z0,
    x0,
    y1,
    z0,
    x0,
    y0,
    z1,
    x1,
    y0,
    z1,
    x1,
    y1,
    z1,
    x0,
    y1,
    z1,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
  ]);
  return { positions, indices, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, at[0], at[1], at[2], 1] };
}

/** A yard fenced on three sides, open to the west: cells 8 to 16 across, 1.75 m high fences 0.1 m thick, placed at `at`. */
function yard(at = [0, 0, 0]) {
  const lo = 8 * C + 0.8,
    hi = 16 * C + 0.8;
  return [
    box(lo, 0, lo - 0.05, hi, 1.75, lo + 0.05, at), // south
    box(lo, 0, hi - 0.05, hi, 1.75, hi + 0.05, at), // north
    box(hi - 0.05, 0, lo, hi + 0.05, 1.75, hi, at), // east
  ];
}

const inYard = ([x, y]) => x >= 9 && x <= 15 && y >= 9 && y <= 15;

test("TOWN-SOLIDS the law: a fence's faces cover the cells they cross; a step under the band, a ramp and a board hung over the head cover none; the town's own grid is never written", () => {
  const nav = road(30, 30);
  const solid = solidCells(nav, yard(), [0, 0, 0], C);
  assert.equal(solid[12 * 30 + 16], 1, 'the east fence covers its cell');
  assert.equal(solid[8 * 30 + 12], 1, 'the south fence covers its cell');
  assert.equal(solid[12 * 30 + 12], 0, 'the yard inside is open');
  assert.equal(solid[12 * 30 + 8], 0, 'the open west side is open');
  const step = solidCells(nav, [box(0, 0, 0, 5 * C, SOLID_BAND.lo - 0.1, C)], [0, 0, 0], C);
  assert.equal(
    step.reduce((a, b) => a + b, 0),
    0,
    'a step the body climbs covers nothing',
  );
  const rise = Math.tan((20 * Math.PI) / 180) * 10;
  const ramp = {
    positions: new Float32Array([0, 0, 0, 5, 0, 0, 5, rise, 10, 0, rise, 10]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
  assert.equal(
    solidCells(nav, [ramp], [0, 0, 0], C).reduce((a, b) => a + b, 0),
    0,
    'a ramp is ground',
  );
  const board = solidCells(nav, [box(0, SOLID_BAND.hi + 0.1, 0, 3, 2.6, 0.1)], [0, 0, 0], C);
  assert.equal(
    board.reduce((a, b) => a + b, 0),
    0,
    'a board over the head covers nothing',
  );
  const raised = solidCells(nav, yard([0, 10, 0]), [0, 10, 0], C);
  assert.equal(raised[12 * 30 + 16], 1, "heights are over the town's ground (origin y)");
  const before = nav.grid.slice();
  const covered = coverNav(nav, solid);
  assert.equal(covered.weightAt(16, 12), 0, "the journey's grid: covered");
  assert.equal(covered.weightAt(12, 12), 15, 'and open where nothing stands');
  assert.deepEqual(nav.grid, before, "the residents' grid untouched");
  assert.equal(coverNav(nav, new Uint8Array(900)), nav, 'nothing covered: the grid itself');
});

test("TOWN-SOLIDS the way: a way across a fenced yard's closed side goes round the yard; on the bare grid it went straight through (mutant: no stamp)", () => {
  const nav = road(30, 30);
  const bare = townWayCells(nav, [25, 12], [2, 12]);
  assert.ok(bare.cells.some(inYard) || bare.cells.length === 2, 'the bare grid: a straight line through the yard');
  const covered = coverNav(nav, solidCells(nav, yard(), [0, 0, 0], C));
  const way = townWayCells(covered, [25, 12], [2, 12]);
  assert.ok(way.reached, 'the way is found');
  for (let i = 1; i < way.cells.length; i++)
    assert.ok(clearLine(covered, way.cells[i - 1], way.cells[i]), `run ${i} clear of the fences`);
  assert.ok(!way.cells.some(inYard), 'never into the yard');
});

test("TOWN-SOLIDS the host: the journey's way is asked of the town's grid with its solid models' faces covered, in the location frame; a town with none walks its grid as before", () => {
  const o = mapPixelWorldOrigin(100, 200);
  const R = SCENE_MAP_RATIO,
    t = [0, 0, 0],
    locOrigin = [o.x / R + 2, 3, o.z / R + 5];
  const state = {
    pixelTranslation: () => t,
    localFromWorld: (x, z) => [x / R + t[0], z / R + t[2]],
    worldCoords: (p) => ({ x: (p[0] - t[0]) * R, z: (p[2] - t[2]) * R }),
  };
  const cellAt = (gx, gy) => ({ x: (locOrigin[0] + (gx + 0.5) * C) * R, z: (locOrigin[2] + (gy + 0.5) * C) * R });
  const yardCell = (q) =>
    inYard([Math.floor(q.x / R / C - locOrigin[0] / C), Math.floor(q.z / R / C - locOrigin[2] / C)]);
  const way = (solids) => {
    const nav = new CityNavigation(1, 1);
    nav.grid.fill(15 << 4);
    // the pixel's drawn models as the build keeps them (`local`, `_order` the model id) and the meshes by id
    const cpuModels = new Map((solids ?? []).map((m, i) => [9000 + i, m]));
    const models = (solids ?? []).map((m, i) => ({ local: m.matrix, _order: 9000 + i }));
    const built = new Map([['100,200', { population: { nav }, locOrigin, models }]]);
    return createTownWalk({ built, state, cpuModels }).townWay(cellAt(25, 12), cellAt(2, 12));
  };
  const fenced = way(yard(locOrigin));
  assert.ok(fenced.pts.length > 2, 'round the yard: a way of turns');
  for (let i = 1; i < fenced.pts.length; i++) {
    const a = fenced.pts[i - 1],
      b = fenced.pts[i];
    for (let s = 0; s <= 20; s++)
      assert.ok(
        !yardCell({ x: a.x + ((b.x - a.x) * s) / 20, z: a.z + ((b.z - a.z) * s) / 20 }),
        `run ${i} keeps out of the yard`,
      );
  }
  const open = way(undefined);
  assert.equal(open.pts.length, 2, 'no solids: straight across, as before');
});
