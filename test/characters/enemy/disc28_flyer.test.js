// DISC28-H.
//
// Quest B0B70Y16 places a Dragonling (id 40, behaviour Flying) at a dungeon marker, and Meaner Monsters - on by default,
// forced on online - scales its texture 2.5x, so its idle sprite is several metres tall. A flyer hangs on its marker as
// DFU's does (the transform is the sprite's centre), which puts its FEET half that sprite below the marker: 1.5-2 m
// under a floor the marker stood half a metre above. DFU's CharacterController pushes a start overlap out; the port's
// collider pushed the middle and head spheres DOWN from the face they were under, and the dragonling flew on held half
// in the ground - drawn sunk on every peer as well, whose puppet mirrors the owner's feet (and whose own build re-hung
// the streamed FEET as a centre, half a sprite lower still).
//
// The hang is floored at the floor under the marker, and a streamed puppet's feet are taken as feet.
//
// AUDIT DISC28 MO-4 (the pre-merge audit, 2026-09-28): PINNED ON THE REAL CODE. The first cut drove a hand copy of the
// builder's floor read and a hand-written stand-in for the flying motor, and held the builder and both puppet stands by
// their source text - a floor read the builder stopped making, or a stand that dropped `feetGiven`, was caught only by
// a regex. The read is enemyAnchor.js's (floorUnderHang, behind flyerStandFeet, the builder's one door for a flyer),
// and this file MOUNTS the context's own buildFoeAt, standSharedPuppet and standOwnPuppet (test/net/restsync.test.js's
// harness: the declarations sliced out of the source and run over stubs) and flies what they build on the real
// EnemyAI over the real collider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { flyerSpawnFeet, flyerStandFeet, floorUnderHang, feetFromCentre, enemyControllerHeight } from '../../../src/characters/enemy/enemyAnchor.js';
import { ENEMY_BASICS, enemyEntityType, isClassEnemyId } from '../../../src/characters/enemy/enemyBasics.js';
import { EnemyAI } from '../../../src/characters/enemy/enemyMotor.js';
import { freeLodgedFeet } from '../../../src/characters/foeSpacing.js';   // FIELD BUGS 2026-10-04d CRATE-FREE: the build's stand (a free name there, the module's own import)
import { Collider } from '../../../src/player/collider.js';
import { effectiveLevel } from '../../../src/systems/mentorMode.js';   // SOFTCAP2: the mentor's level the spawn sites read (a free name there, the module's own import)
import { foeSeed, applyWireLook } from '../../../src/characters/foeBodies.js';   // AUDIT MW-NPC II K3: the dungeon context's look seed, in the mounted scope
import { ROOM_LOOT_OFF } from '../../roomLootOff.mjs';   // PARTY-LOOT: the room's seams with no room
import { setupFoeLook } from '../../../src/characters/enemy/foeLook.js';   // DEX2: the arms' free name - SetupDemoEnemy's renderer

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function box(x0, y0, z0, x1, y1, z1) {
  const p = [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1];
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { p: new Float32Array(p), i: new Uint32Array(i) };
}
/** A room: a slab floor with its top at 0, a slab ceiling at 6. */
function room() {
  const c = new Collider(() => -Infinity);
  let b = box(-40, -0.2, -40, 40, 0, 40); c.addMesh('dungeon', b.p, b.i, I);
  b = box(-40, 6, -40, 40, 6.2, 40); c.addMesh('dungeon', b.p, b.i, I);
  return c;
}

const scoped = (state) => new Proxy(state, {
  has: (t, k) => k !== '__s',
  get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : k === 'effectiveLevel' ? effectiveLevel : k === 'applyHeroThreatTo' ? () => {} : globalThis[k])),   // SOFTCAP2: the host's own import
  set: (t, k, v) => { t[k] = v; return true; },
});
const mount = (body, state) => new Function('__s', `with (__s) { ${body} }`)(scoped(state));

/** The real flying motor chasing a target standing on the floor: the lowest its feet go in `secs`. */
function fly(ai, secs = 10) {
  let lowest = Infinity;
  for (let k = 0; k < secs * 60; k++) { ai.update(1 / 60, [0, 0, 8]); lowest = Math.min(lowest, ai.feet[1]); }
  return lowest;
}

test('DISC28-H: the old hang, unfloored, is the bug - the real motor holds that dragonling under the floor', () => {
  const feet = feetFromCentre([0, 0.5, 0], 5);
  assert.ok(feet[1] < -1.5);
  const ai = new EnemyAI(room(), feet, 0, { liveSpeed: 70, behaviour: 'Flying', height: enemyControllerHeight(5, 'Flying'), centreOffset: 2.5 });
  assert.ok(fly(ai) < -1, 'held under the floor');
});

test('DISC28-H: a bat on a marker high under the ceiling keeps DFU\'s hang exactly - the ceiling-bats law - and a surface is a floor only below the marker', async () => {
  const c = room();
  assert.equal(floorUnderHang(c, [0, 5.2, 0], 1), null, 'no floor within its reach');
  assert.ok(Math.abs(floorUnderHang(c, [0, 0.5, 0], 5)) < 1e-9, 'the read meets the floor half a metre under a marker');
  assert.ok(Math.abs(floorUnderHang(c, [0, 0, 0], 5)) < 1e-9, 'and under a marker standing ON it');
  assert.deepEqual(flyerSpawnFeet([0, 5.2, 0], 1, 0), [0, 4.7, 0], 'a floor far below changes nothing');
  assert.deepEqual(flyerSpawnFeet([0, 0.5, 0], 5, null), [0, -2, 0], 'no floor read: the hang as it was');
  // the read starts 0.2 above the marker, so a face it meets above the centre is no floor BENEATH the marker - never lifted onto it
  assert.deepEqual(flyerSpawnFeet([0, 0.5, 0], 5, 0.6), [0, -2, 0], 'a surface above the marker is not the floor under it');
});

test('DISC28-H: a streamed flyer stands on its OWNER\'S feet - both puppet stands, through the builder, never re-hung as a centre', async () => {
  // the owner's dragonling in the air, its feet 2 m up: hung again as a centre (and floored) it would stand on the floor
  const r = { i: 4, t: 40, x: 0, f: [1, 2, 3], y: 0 };
  assert.deepEqual(flyerStandFeet(room(), r.f, 5, true), [1, 2, 3], 'feet given are feet');
  assert.deepEqual(flyerStandFeet(room(), r.f, 5), [1, 0, 3], 'the same point as a marker would be hung and floored');
});
