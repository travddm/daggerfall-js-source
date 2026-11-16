// The ground's tile edges under the repeat wrap (render/tile-edge-glsl.ts): a tile whose picture holds two grounds does
// not wrap into a neighbour that is not its own copy. The chunk runs through test/glsl.mjs over a tilemap of bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glslFunctions } from '../glsl.mjs';
import { tileEdgeGlsl, twoGroundTile, twoGroundWords } from '../../src/render/tile-edge-glsl.ts';
import { sharpenWorldFs } from '../../src/render/sharp-texels.ts';
import { ROAD_PAVING } from '../../src/world/road/roadEdge.js';

const SIZE = 64;
const FLANK = (47 << 2) | 0;
const PAVING = (ROAD_PAVING << 2) | 0;
const PAVING_TURNED = (ROAD_PAVING << 2) | 2;
type Vec = number[];

const SOURCE = `precision highp sampler2DArray;
precision highp usampler2D;
uniform sampler2DArray uTileArr;
uniform usampler2D uTilemap;
uniform float uGroundClamped;
${tileEdgeGlsl()}`;

/** The chunk over a tilemap: `cells` maps "x,y" to a byte; any other cell is `fill`. */
function chunk(cells: Record<string, number>, fill: number, { clamped = 0, sharp = false } = {}) {
  return glslFunctions(sharp ? sharpenWorldFs(SOURCE) : SOURCE, {
    uGroundClamped: clamped,
    texelFetch: (_sampler: unknown, c: Vec) => [cells[`${c[0]},${c[1]}`] ?? fill, 0, 0, 0],
    textureSize: () => [SIZE, SIZE, 56],
  });
}

const near = [0.2 / SIZE, 0];
const nearY = [0, 0.2 / SIZE];
const far = [3 / SIZE, 0];
const farY = [0, 3 / SIZE];

test('the two-ground flags: a road flank and a marching-squares transition hold two grounds; paving, grass and water hold one', () => {
  assert.equal(twoGroundTile(FLANK), true);
  assert.equal(twoGroundTile((55 << 2) | 3), true);
  assert.equal(twoGroundTile((5 << 2) | 0), true, 'a shore transition');
  for (const record of [0, 1, 2, 3, ROAD_PAVING]) {
    for (let turn = 0; turn < 4; turn++) assert.equal(twoGroundTile((record << 2) | turn), false, `record ${record}`);
  }
  const words = twoGroundWords();
  assert.equal(words.length, 8);
  assert.equal((words[FLANK >> 5] >>> (FLANK & 31)) & 1, 1);
  assert.equal((words[PAVING >> 5] >>> (PAVING & 31)) & 1, 0);
});

test('a flank beside paving holds its coordinate off that edge: half a texel up close, the footprint at a distance', () => {
  // The flank at (10, 10); paving to its east, the flank's own copies on its other sides.
  const fns = chunk({ '11,10': PAVING }, FLANK);
  const edge = [1 - 0.01 / SIZE, 0.5];
  const heldNear = fns.tileEdgeHold(edge, [10, 10], FLANK, near, nearY);
  assert.ok(Math.abs(heldNear[0] - (1 - 0.5 / SIZE)) < 1e-9, `up close: ${heldNear[0]}`);
  const heldFar = fns.tileEdgeHold(edge, [10, 10], FLANK, far, farY);
  assert.ok(Math.abs(heldFar[0] - (1 - 3 / SIZE)) < 1e-9, `at a distance: ${heldFar[0]}`);
  assert.equal(heldNear[1], 0.5, 'the other axis is untouched');
  const west = fns.tileEdgeHold([0.01 / SIZE, 0.5], [10, 10], FLANK, near, nearY);
  assert.equal(west[0], 0.01 / SIZE, 'its west neighbour is its own copy: the wrap stays');
});

test('a flank turned differently from its neighbour is not its copy, and is held', () => {
  const turned = (47 << 2) | 1;
  const fns = chunk({ '9,10': turned }, FLANK);
  const held = fns.tileEdgeHold([0.01 / SIZE, 0.5], [10, 10], FLANK, near, nearY);
  assert.ok(held[0] > 0.4 / SIZE);
});

test('paving keeps the wrap on every edge, whatever lies beside it: a single-ground tile wraps into its own picture', () => {
  const fns = chunk({ '11,10': FLANK, '9,10': PAVING_TURNED, '10,11': (2 << 2) | 0 }, PAVING);
  for (const f of [
    [1 - 0.01 / SIZE, 0.5],
    [0.01 / SIZE, 0.5],
    [0.5, 1 - 0.01 / SIZE],
  ]) {
    assert.deepEqual(fns.tileEdgeHold(f, [10, 10], PAVING, far, farY), f);
  }
});

test('where the sampler clamps (Point), every coordinate passes through unchanged', () => {
  const fns = chunk({ '11,10': PAVING }, FLANK, { clamped: 1 });
  for (const f of [
    [1 - 0.01 / SIZE, 0.5],
    [0.01 / SIZE, 0.99],
    [0.5, 0.5],
  ]) {
    assert.deepEqual(fns.tileEdgeHold(f, [10, 10], FLANK, far, farY), f);
  }
});

test('the hold is never more than half the tile, and the Sharp form of the chunk holds the same', () => {
  const fns = chunk({}, PAVING);
  assert.deepEqual(fns.tileEdgeHold([0.01, 0.99], [10, 10], FLANK, [4, 0], [0, 4]), [0.5, 0.5]);
  const sharp = chunk({ '11,10': PAVING }, FLANK, { sharp: true });
  const held = sharp.tileEdgeHold([1 - 0.01 / SIZE, 0.5], [10, 10], FLANK, near, nearY);
  assert.ok(Math.abs(held[0] - (1 - 0.5 / SIZE)) < 1e-9);
});

test('a neighbour off the pixel is read as the tile itself, so a flank on the border keeps the wrap there', () => {
  const fns = chunk({ '127,10': FLANK }, PAVING);
  const f = [1 - 0.01 / SIZE, 0.5];
  assert.deepEqual(fns.tileEdgeHold(f, [127, 10], FLANK, near, nearY), f);
});
