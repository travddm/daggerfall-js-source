// C13: the host arrow flight (exterior/interior hosts - visible
// arrows without the dungeon missile system).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArrowFlight, arrowMatrix, ARROW_MODEL_ID } from '../../src/combat/arrowFlight.js';
import { MISSILE_SPEED, ARROW_FLIGHT_SPEED, MISSILE_LIFESPAN_S, MISSILE_COLLIDER_RADIUS } from '../../src/systems/spellcast.js';
import { Collider } from '../../src/player/collider.js';
import { GLOBAL_SCALE } from '../../src/world/meshReader.js';   // FIELD-GUN20: the pool's 48 px sprite, in units
import { readFileSync } from 'node:fs';   // FIELD-GUN14: the four hosts, by source

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const quadIdx = new Uint32Array([0, 1, 2, 0, 2, 3]);

test('arrowflight: S5 constants ride the single source + the matrix law', () => {
  // The flight is the dungeon missile's shape: same speed, lifespan,
  // sweep radius (spellcast.js), same 99800 model, same oriented trs.
  assert.equal(ARROW_MODEL_ID, 99800);
  assert.equal(MISSILE_SPEED, 25.0);
  assert.equal(MISSILE_LIFESPAN_S, 8);
  assert.equal(MISSILE_COLLIDER_RADIUS, 0.45);
  // Level flight along +z: no pitch, identity-ish yaw
  const m = arrowMatrix([1, 2, 3], [0, 0, 1]);
  assert.equal(m[12], 1); assert.equal(m[13], 2); assert.equal(m[14], 3);
  // Straight down: pitch +90 (asin(-(-1))) - r12 = -sin(rx) = -1 in
  // the column-major trs (m[9]); the dungeon path shares this law.
  const down = arrowMatrix([0, 0, 0], [0, -1, 0]);
  assert.ok(Math.abs(down[9] + 1) < 1e-5, 'nose-down transform');
});

test('arrowflight: flies at missile speed, dies on geometry (a miss is LOST)', () => {
  const c = new Collider(() => -100);
  // A wall at z=5 facing the archer
  c.addMesh('wall', new Float32Array([-5, -5, 5, 5, -5, 5, 5, 5, 5, -5, 5, 5]), quadIdx, I);
  const a = new ArrowFlight({ getGpuMesh: () => null, collider: c });
  a.fire([0, 0, 0], [0, 0, 1]);
  a.update(0.1);   // ARROW_FLIGHT_SPEED * 0.1 = 3.375: still short of the wall
  assert.equal(a.arrows[0].dead, false);
  assert.ok(Math.abs(a.arrows[0].pos[2] - 3.375) < 1e-6);
  a.update(0.1);   // the sweep reaches the wall inside this step
  assert.equal(a.arrows[0].dead, true);
  // Open air: retires on the 8s lifespan instead
  const open = new ArrowFlight({ getGpuMesh: () => null, collider: new Collider(() => -100) });
  open.fire([0, 50, 0], [0, 0, 1]);
  for (let i = 0; i < 79; i++) open.update(0.1);
  assert.equal(open.arrows[0].dead, false);
  open.update(0.2);
  assert.equal(open.arrows[0].dead, true);
});

test('arrowflight X2: an ENEMY arrow hunts the player mid-capsule; a player arrow never does', () => {
  const open = () => new ArrowFlight({ getGpuMesh: () => null, collider: new Collider(() => -100) });
  // an enemy arrow flying +z reaches the player at z=5 and fires the
  // impact (the dungeon missile's contact law: 0.45 + the 0.45 body)
  const a = open();
  const hits = [];
  a.fire([0, 0.9, 0], [0, 0, 1], { enemy: true, shooterFoe: { id: 7 }, weapon: { templateIndex: 119 } });
  for (let i = 0; i < 4; i++) a.update(0.05, { playerFeet: [0, 0, 5], onPlayerHit: (m) => hits.push(m) });
  assert.equal(hits.length, 1, 'the impact fired once');
  assert.equal(hits[0].shooterFoe.id, 7, 'the record carries its shooter');
  assert.ok(a.arrows.length === 0 || a.arrows[0].dead, 'the landed arrow retires; a faster shaft is swept on the step after it lands');
  // the SAME flight without the enemy meta sails through the player
  const p = open();
  p.fire([0, 0.9, 0], [0, 0, 1]);
  const pHits = [];
  for (let i = 0; i < 4; i++) p.update(0.05, { playerFeet: [0, 0, 5], onPlayerHit: (m) => pHits.push(m) });
  assert.equal(pHits.length, 0, 'player arrows resolve at the fire host, not here');
  assert.equal(p.arrows[0].dead, false);
  // and the bare update(dt) form still flies (the C13 hosts)
  const bare = open();
  bare.fire([0, 50, 0], [0, 0, 1]);
  bare.update(0.1);
  assert.equal(bare.arrows[0].dead, false);
});

test('arrowflight: bare terrain lands it (heightAt floor) + late collider resolve', () => {
  // heightAt = the streaming-world terrain fallback the mesh raycast
  // never sees; an arrow arcing under it has landed.
  const c = new Collider((x) => (x > 10 ? 5 : 0));
  const a = new ArrowFlight({ getGpuMesh: () => null, collider: () => c });   // function form (rebuilding hosts)
  a.fire([0, 1, 0], [Math.SQRT1_2, -0.1, Math.SQRT1_2]);   // shallow dive: -0.042/step, ~24 steps to ground
  for (let i = 0; i < 40 && !a.arrows[0].dead; i++) a.update(1 / 60);
  assert.equal(a.arrows[0].dead, true, 'landed in the ground');
  assert.ok(a.arrows[0].pos[1] <= 0.01);
  // All-dead sweep clears the list
  a.update(1 / 60);
  assert.equal(a.arrows.length, 0);
});

// ── A player's shot is a shaft ─────────────────────────────────────
//
// The guns' orb lane (FIELD-GUN14) is gone with the guns: every player
// shot flies at ARROW_FLIGHT_SPEED and draws the 99800 shaft.

test('arrowflight: a player bow shot flies as the 99800 shaft at ARROW_FLIGHT_SPEED', async () => {
  const drawn = [];
  const f = new ArrowFlight({ getGpuMesh: async () => ({ id: ARROW_MODEL_ID }), collider: null });
  f.fire([0, 1, 0], [0, 0, 1], { fromPlayer: true, weapon: { templateIndex: 130, name: 'Long Bow' } });
  for (let i = 0; i < 4; i++) { await Promise.resolve(); f.update(1 / 60, {}); }
  f.draw({ drawMesh: (g, mat) => drawn.push(mat[14]) });

  const shot = f.arrows[0];
  assert.ok(Math.abs(shot.pos[2] - 4 * ARROW_FLIGHT_SPEED / 60) < 1e-9, 'a shaft flies at ARROW_FLIGHT_SPEED');
  assert.equal(drawn.length, 1, 'the 99800 shaft, drawn as it always was');
  assert.ok(Math.abs(drawn[0] - shot.pos[2]) < 1e-5, 'at the arrow’s own z');   // float32: the matrix is a Float32Array
});

test('FIELD-GUN14: the pool grew a flat that FLIES - it moves, it loops, and the flight ends it', async () => {
  const { createHitEffects } = await import('../../src/scenes/hitEffects.js');
  const { MISSILE_FPS } = await import('../../src/render/flatAnimation.js');
  // The flying flat outlived the guns' orb: the spell impacts' sparks (hostMagic.js) fly a missile archive through it.
  const { missileArchive, ELEMENTS } = await import('../../src/systems/spellcast.js');
  const ORB_ARCHIVE = missileArchive(ELEMENTS.Shock);
  const settle = () => new Promise((r) => setImmediate(r));

  const built = [], destroyed = [];
  const renderer = {
    createBillboardBatch: (archive, record, size, centres) => {
      const b = { archive, record, size, centres, frame: null, origin: null };
      built.push(b); return b;
    },
    destroyBillboardBatch: (b) => destroyed.push(b),
  };
  const fx = createHitEffects({
    renderer,
    getTexture: async () => ({ recordCount: 8, getFrameCount: () => 4, getSize: () => ({ width: 64, height: 48 }), getScale: () => ({ width: 0, height: 0 }) }),
    uploadRecordFrame: () => {},
  });

  const orb = fx.showFlyingFlat(ORB_ARCHIVE, [0, 1, 0]);
  // before the archive warms, the handle is still safe to drive - a
  // shot does not wait for its texture
  assert.doesNotThrow(() => orb.move([0, 1, 2]));
  await settle();
  assert.equal(built.length, 1);
  assert.deepEqual(built[0].centres[0], [0, 1 - (48 * GLOBAL_SCALE) / 2, 0], 'the batch is built at the FIRE position - centres are baked STATIC_DRAW - and FIELD-GUN20: at its BASE, half a height under the centre (DaggerfallMissile.cs:601-602 never AlignToBase), so the orb sits ON the barrel');
  assert.deepEqual(built[0].origin, [0, 0, 2], 'and the flight it already had rides the origin uniform');

  orb.move([0, 1, 5]);
  assert.deepEqual(built[0].origin, [0, 0, 5], 'flight is the origin, not a rebuilt batch - zero GL churn');

  // IT LOOPS. Every other entry in this pool is a one-shot that ends
  // on its own animation; a projectile in flight must not freeze on
  // its last frame or vanish mid-air. So BOTH halves are pinned: it is
  // never destroyed, AND its frame is still turning at the end.
  const seen = [];
  for (let i = 0; i < 60; i++) { fx.tick(1 / MISSILE_FPS); seen.push(built[0].frame); }
  assert.equal(destroyed.length, 0, 'fifteen animation lengths later it is still flying');
  assert.equal(fx.batches().length, 1, 'and still drawn');
  assert.deepEqual(seen.slice(0, 8), [1, 2, 3, 0, 1, 2, 3, 0], 'the four frames WRAP - display-then-advance, as DFU loops them');
  assert.equal(new Set(seen.slice(-8)).size, 4, 'and it is still turning at the end, not frozen on a last frame');

  // A ONE-FRAME record is not "one tick and gone" for a projectile
  // either - there is no animation to end, and the shot is still in
  // the air.
  {
    const still = createHitEffects({
      renderer: { createBillboardBatch: (a, r, sz, c) => ({ archive: a, record: r, size: sz, centres: c, frame: null, origin: null }), destroyBillboardBatch: () => {} },
      getTexture: async () => ({ recordCount: 8, getFrameCount: () => 1, getSize: () => ({ width: 8, height: 8 }), getScale: () => ({ width: 0, height: 0 }) }),
      uploadRecordFrame: () => {},
    });
    still.showFlyingFlat(ORB_ARCHIVE, [0, 0, 0]);
    await settle();
    still.tick(1 / 60); still.tick(1 / 60);
    assert.equal(still.batches().length, 1, 'a still orb is still an orb');
    // ...while a still SPLASH is retired on the next tick, as it always was
    still.showBloodSplash(0, [0, 0, 0]);
    await settle();
    still.tick(1 / 60);
    assert.equal(still.batches().length, 1, 'and the one-shot beside it ended');
  }

  // A RECENTRE CARRIES IT. The four hosts rule: a floating-origin
  // shift rebuilds the batch, and the flight's delta has to go back on
  // or the orb snaps to the muzzle it left.
  fx.offsetAll([100, 0, 0]);
  const rebuilt = built[built.length - 1];
  assert.equal(built.length, 2);
  assert.deepEqual(rebuilt.centres[0], [100, 1 - (48 * GLOBAL_SCALE) / 2, 0]);
  assert.deepEqual(rebuilt.origin, [0, 0, 5], 'the delta survives the rebuild');

  // AND THE FLIGHT ENDS IT, not the clock.
  orb.retire();
  assert.equal(fx.batches().length, 0);
  assert.equal(destroyed.length, 2);
  assert.doesNotThrow(() => { orb.retire(); orb.move([0, 0, 0]); }, 'both doors are safe after the flat is gone');

  // and nothing above changed the one-shots this pool was built for
  fx.showBloodSplash(0, [0, 0, 0]);
  await settle();
  const splash = built[built.length - 1];
  for (let i = 0; i < 40; i++) fx.tick(1 / 10);
  assert.ok(destroyed.includes(splash), 'a splash still ends on its own animation');
});
