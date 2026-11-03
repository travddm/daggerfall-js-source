// THE HANDEDNESS LAW (mat4.js) + the guards-run-in-place fix - the two
// playtest bugs of 2026-08-23, pinned at the math.
//
// 1. The world data is DFU's left-handed (x east, y up, z north); the
//    right-handed lookAt put world +x on screen-LEFT, so the port
//    presented classic's MIRROR IMAGE since M1 - signs read backwards,
//    towns flipped east-west, sprite handedness swapped - with every
//    input sign tuned to the mirror so it PLAYED correctly. The fix is
//    one mirror at the projection (mirrorProjectionX), the winding
//    swap, and the input signs back to Unity's own.
// 2. Guards ran in place because wave 34's FallCheck probed for floor
//    with a triangle raycast alone - the exterior ground is the
//    collider's ANALYTIC heightAt floor, so every step found a phantom
//    cliff and was refused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { perspective, mirrorProjectionX, lookAt, multiply } from '../../src/world/mat4.js';
import { Collider } from '../../src/player/collider.js';
import { EnemyAI } from '../../src/characters/enemy/enemyMotor.js';
import { placeFoeEnv } from '../../src/scenes/quest/questFoeHost.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => hostText(p);

const ndc = (pv, [x, y, z]) => {
  const w = pv[3] * x + pv[7] * y + pv[11] * z + pv[15];
  return [(pv[0] * x + pv[4] * y + pv[8] * z + pv[12]) / w, (pv[1] * x + pv[5] * y + pv[9] * z + pv[13]) / w, w];
};

test('handedness: world +x lands screen-RIGHT through the mirrored projection (Unity\'s own presentation)', () => {
  const proj = mirrorProjectionX(perspective(Math.PI / 3, 16 / 9, 0.1, 100));
  const view = lookAt([0, 0, 0], [0, 0, 1], [0, 1, 0]);   // facing +z (north)
  const pv = multiply(proj, view);
  const east = ndc(pv, [1, 0, 5]);
  assert.ok(east[2] > 0, 'in front of the camera');
  assert.ok(east[0] > 0, `east on screen-right (ndc x = ${east[0].toFixed(3)})`);
  assert.ok(ndc(pv, [-1, 0, 5])[0] < 0, 'west on screen-left');
  assert.ok(ndc(pv, [0, 1, 5])[1] > 0, 'up stays up');
  // and WITHOUT the mirror the same east point lands screen-left - the
  // mirror-image presentation this law retired
  const pv0 = multiply(perspective(Math.PI / 3, 16 / 9, 0.1, 100), view);
  assert.ok(ndc(pv0, [1, 0, 5])[0] < 0, 'the unmirrored projection was the mirror image');
});

test('guards: the analytic heightAt floor is ground - chase works on triangle-less exterior ground', () => {
  // The exterior collider holds only the location MODELS as triangles;
  // terrain and the town surface are heightAt. FallCheck must see that
  // floor or every guard and encounter foe stands running at a phantom
  // cliff (Mac's playtest).
  const c = new Collider(() => 0);   // no tris at all - the open-street shape
  const ai = new EnemyAI(c, [0, 0.1, 0], 0, { liveSpeed: 50, playerInside: false, rolls: () => 0.4 });
  const player = [0, 0.1, 14];
  ai.makeHostileToPlayer(600, player);
  const senses = { gameMinutes: 0, playerStealth: 0, rolls: () => 0.5 };
  for (let s = 0; s < 480; s++) ai.update(1 / 60, player, senses, false);
  assert.ok(!ai.fallDetected, 'no phantom cliff on flat analytic ground');
  const moved = Math.hypot(ai.feet[0], ai.feet[2]);
  assert.ok(moved > 8, `the guard closed the distance (moved ${moved.toFixed(2)})`);

  // ...and a REAL heightAt cliff still refuses the step
  const c2 = new Collider((x, z) => (z > 4 ? -1000 : 0));
  const ai2 = new EnemyAI(c2, [0, 0.1, 0], 0, { liveSpeed: 50, playerInside: false, rolls: () => 0.4 });
  ai2.makeHostileToPlayer(600, player);
  for (let s = 0; s < 480; s++) ai2.update(1 / 60, player, senses, false);
  assert.ok(ai2.feet[2] < 4.2, `stopped at the real edge (z = ${ai2.feet[2].toFixed(2)})`);
  assert.ok(ai2.feet[1] > -5, 'and did not walk the void');
});

test('guards: the quest placement floor probe sees the analytic floor too', () => {
  const c = new Collider(() => 0);   // no tris - open exterior ground
  const env = placeFoeEnv({ collider: c, playerFeet: [0, 1, 0], playerYawRad: 0, fovDegrees: 60, rolls: () => 0.5 });
  const hit = env.raycast({ x: 3, y: 2, z: 3 }, { x: 0, y: -1, z: 0 }, 4);
  assert.ok(hit, 'the straight-down probe answers on heightAt ground');
  assert.equal(hit.point.y, 0);
  assert.equal(hit.normal.y, 1);
  // a directional ray still sees only triangles (the open-area arm)
  assert.equal(env.raycast({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 10), null);
});
