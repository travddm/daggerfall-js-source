// STREAM1 (2026-09-19): A PROMOTION IS QUEUED, NOT PAID ON THE CROSSING.
//
// EV4 lets a surviving pixel cross between the full-res core and the
// strided far ring by swapping its terrain SURFACE, and world.js did all
// of them inline on the frame the player crossed a map pixel. Measured,
// `buildTerrainGrid` at stride 1 is ~3 ms of main thread - 16,641
// vertices, each with a central-difference normal - and a crossing
// promotes FIVE pixels at once, so the crossing frame paid ~15 ms and
// dropped. Promotions queue now and the frame loop spends one a frame;
// demotions are ~0.11 ms and stay inline.
//
// The five is not a guess and it does not depend on the land view
// distance: the ring boundary is LOD_NEAR, a Chebyshev radius of 3, and
// the pin below counts the class changes directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTerrainGrid } from '../../../src/world/terrain/terrainSurface.js';
import { HEIGHTMAP_DIMENSION } from '../../../src/world/terrain/terrainSampler.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const read = (p) => readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');

test('STREAM1: the expensive direction is the one that is queued, and it is expensive', () => {
  // THE COST, measured here rather than asserted: a stride-1 grid is a
  // 129x129 lattice with a central difference per vertex; a stride-4 one
  // is a 33x33. The ratio is what makes one worth queueing and the other
  // not - the numbers themselves are a machine's and are not pinned.
  const hDim = HEIGHTMAP_DIMENSION;
  const samples = new Float32Array(hDim * hDim);
  for (let x = 0; x < hDim; x++) for (let z = 0; z < hDim; z++) samples[x * hDim + z] = 0.5 + 0.006 * Math.sin(x * 0.025) * Math.cos(z * 0.02);
  const ghost = () => 0.5;
  // HOW IT IS MEASURED, and why it is measured that way. This arm took
  // the MEDIAN of nine single builds, and it went red on a CI runner
  // at 1.34 ms against 0.54 - the stride-1 figure matching this
  // machine's exactly, and the stride-4 one FIVE TIMES its honest
  // cost. Nothing about the code had changed: a stride-4 build is
  // about 0.1 ms, which is below a shared runner's noise floor, and a
  // median of nine does not survive a scheduler that preempts a few of
  // them. The denominator was inflated, so the ratio collapsed.
  //
  // Two changes, and they are the standard two for a microbenchmark:
  //
  //   TIME A BATCH, so the measured unit is milliseconds rather than
  //   tenths of one and the noise is proportionally smaller;
  //
  //   take the MINIMUM across repetitions, because noise only ever
  //   ADDS time - the fastest run is the closest thing to the work
  //   itself, where a median is a statement about the machine's mood.
  //
  // The ratio this reads on an idle machine is 11-22x. The bar below
  // is 4x, which is not a tight fit round a measurement; it is the
  // loosest bar that still says "far dearer", and it now has three
  // orders of headroom over the noise that broke it.
  // Twenty-four puts the stride-4 window - the one that broke - at
  // about 2.5 ms rather than 0.1, so the ratio can only collapse if a
  // THREEFOLD inflation survives the best of seven batches instead of
  // a few preempted singles moving a median. The whole arm costs
  // about a quarter of a second.
  //
  // DEPLOY-FLAKE (2026-10-04, the owner: "A test failed on deploy" - the site's deploy of PR #592, its verify shard 3/4,
  // read 1.30 ms against 0.36: the stride-4 window still three times its honest cost through the best of seven
  // batches). Two more changes of the same kind:
  //
  //   BOTH STRIDES ARE WARMED, THEN TIMED IN TURN. The stride-4 arm used to be warmed and timed only after
  //   the stride-1 arm had run alone, so the first stride-4 build met code tuned on stride 1 alone and could
  //   be re-optimised in the middle of its own window. Warming both first and taking one batch of each in
  //   turn puts a pause on a shared runner across both minimums, not across one arm's.
  //
  //   UP TO THREE ROUNDS, and the minimums kept across them. More samples only bring each minimum closer to
  //   the work. A real regression - a stride-4 grid as dear as a stride-1 one - reads about 1x in every
  //   round and still fails. Only noise that survives twenty-one batches of each passes as a regression.
  const BATCH = 24;
  const batch = (stride) => {
    const t = process.hrtime.bigint();
    for (let i = 0; i < BATCH; i++) buildTerrainGrid(samples, stride, ghost);
    return Number(process.hrtime.bigint() - t) / 1e6 / BATCH;
  };
  for (let i = 0; i < 5; i++) { buildTerrainGrid(samples, 1, ghost); buildTerrainGrid(samples, 4, ghost); }   // warm the JIT on both before anything is timed
  let one = Infinity, four = Infinity;
  for (let round = 0; round < 3 && !(one > four * 4); round++) {
    for (let r = 0; r < 7; r++) { one = Math.min(one, batch(1)); four = Math.min(four, batch(4)); }
  }
  assert.ok(one > four * 4, `a stride-1 grid is far dearer than a stride-4 one (${one.toFixed(2)} ms against ${four.toFixed(2)})`);
  const g1 = buildTerrainGrid(samples, 1, ghost), g4 = buildTerrainGrid(samples, 4, ghost);
  assert.equal(g1.positions.length / 3, hDim * hDim, 'stride 1 is every sample');
  assert.ok(g4.positions.length < g1.positions.length / 10, 'and stride 4 is a sixteenth of the lattice plus a skirt');
});

