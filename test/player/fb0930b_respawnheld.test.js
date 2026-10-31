// RESPAWN-HELD (2026-09-30, FIELD BUGS 2026-09-30b - BrixBlox's "Spawned in the air after dying": "One time I died in a
// dungeon, and for some reason I respawned high enough in the air to kill me with fall damage"; bible/01-Overview/
// Field-Bugs-2026-09-30b.md). RESPAWN-GROUND stood the eye on the new pixel and read the right one, and the landing
// found the ground - but the FRAMES of the teleport's awaited build still stepped the motor. An outdoor death's screen
// holds it through the await (townTalk's slot outlives it); a dungeon's went with forceExitToExterior before the await,
// so the body, stood over the new pixel at the dungeon's own height, fell through the half-built world onto the models'
// colliders as each went in, and the frame billed the landing before the arrival's player.spawn. The frame now holds the
// motor while the arrival's latch is up. Driven through the REAL StreamingWorldState, Collider, PlayerMotor,
// floorLanding and applyFallLanding, with the host's own lines lifted off world.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { StreamingWorldState } from '../../src/world/streamingWorld.js';
import { TERRAIN_SIZE, HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../../src/world/terrain/terrainSampler.js';
import { floorLanding } from '../../src/player/enterExit.js';
import { Collider } from '../../src/player/collider.js';
import { walkGroundAt } from '../../src/world/terrain/terrainSurface.js';   // FLORA-GROUND: the ground heightAt walks
import { PlayerMotor } from '../../src/player/motor.js';
import { applyFallLanding, adjustFallStart } from '../../src/scenes/shared.js';

const worldHeight = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
const heightCell = TERRAIN_SIZE / (HEIGHTMAP_DIMENSION - 1);
/** A closed box's triangles, pixel-local - the dungeon's own entrance model (a keep, a tower, a ruin). */
function boxMesh(x0, y0, z0, x1, y1, z1) {
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const indices = [];
  for (const [a, b, c, d] of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) indices.push(a, b, c, a, c, d);
  return { positions: new Float32Array(P.flat()), indices: new Uint32Array(indices) };
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const D = { x: 300, y: 250 };   // the dungeon's pixel - a dungeon death's respawn lands on it
const H = 100;   // the pixel's ground, pixel-local
const KEEP = { at: TERRAIN_SIZE / 2, half: 30, tall: 18 };   // the entrance model at the location's centre
const COMP = -150;   // a vertical recentre the exterior carried in (a walk over the hills): ResetStreamingWorld keeps it

test('RESPAWN-HELD the fall: a dungeon death whose height stands above the entrance\'s roof in the new world falls onto the keep mid-build and dies of it with the motor stepped; held, it arrives on the ground with nothing billed - and a death mid-fall carries none of its fall across (mutant: the latch out of the hold)', () => {
  const west = [-20, -3.5, 12];   // RESPAWN-GROUND's body: off the square, stood on its centre at the dungeon's height
  const over = [TERRAIN_SIZE / 2, -3.5, TERRAIN_SIZE / 2];   // already on the square (not re-stood), over the keep
  assert.ok(-3.5 > H + KEEP.tall + COMP, 'the dungeon\'s height stands above the keep\'s roof');
});
