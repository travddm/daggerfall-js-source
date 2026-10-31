// DE1 - ENTERING A DUNGEON PUT THE PLAYER ACROSS IT (2026-08-29).
//
// Mac: "when entering a dungeon, it places you at the end of the
// dungeon instead of the entrance."
//
// THERE ARE TWO DFU MEMBERS HERE AND THEY DO NOT AGREE:
//
//   TransitionDungeonInterior (PlayerEnterExit.cs:895-963) - WALKING
//   IN through the entrance, which is how a player actually gets into
//   a dungeon (PlayerActivate.cs:645). It uses dungeon.StartMarker
//   UNCONDITIONALLY, never consults the enter marker, and where the
//   start marker is missing it ABORTS the transition (:923-929)
//   rather than placing the player somewhere invented. It then faces
//   the player along the normal of the nearest dungeon exit door.
//
//   StartDungeonInterior (:968-1016) - starting INSIDE a dungeon with
//   no exterior: a new game, a load, a respawn, a quest teleport. The
//   ENTER marker wins, StartMarker is the fallback, and the facing is
//   plain north (SetFacing(Vector3.forward)).
//
// The port had ONE `enterMarker ?? startMarker` serving both. So the
// walk-in took the enter marker - a different point, and in a large
// starting block a long way from the door the player just opened.
//
// The sentence that stood over it explained the enter-marker
// preference as a fix for a wedging bug in Privateer's Hold, and it
// WAS one - for the standalone host, which is the StartDungeonInterior
// case and is right to prefer it. Applying that host's answer to the
// other member is what put the player across the dungeon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closestDoorTo } from '../../src/player/enterExit.js';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(HERE, '..', rel), 'utf8');

/** dungeonContext's startSpawn law, over a marker pair, with the floor
 *  landing and the collider stubbed out - the branch is what is
 *  pinned, not the snap. */
const chooseMarker = ({ enterMarker, startMarker }, preferEnterMarker = true) =>
  (preferEnterMarker ? (enterMarker ?? startMarker) : startMarker);

test('DE1: the WALK-IN takes the start marker, and never the enter marker', () => {
  const both = { enterMarker: { x: 900, y: 0, z: 900 }, startMarker: { x: 10, y: 0, z: 10 } };
  assert.deepEqual(chooseMarker(both, false), both.startMarker,
    'TransitionDungeonInterior uses dungeon.StartMarker unconditionally');
  // THE BUG, stated as the thing that must not come back: with both
  // markers present the walk-in must not drift to the enter one.
  assert.notDeepEqual(chooseMarker(both, false), both.enterMarker);
});

test('DE1: a walk-in with NO start marker refuses - it does not fall back', () => {
  // :923-929 destroys the dungeon and raises OnFailedTransition. A
  // fallback here is exactly how the player ends up somewhere they
  // did not walk to.
  const enterOnly = { enterMarker: { x: 900, y: 0, z: 900 }, startMarker: null };
  assert.equal(chooseMarker(enterOnly, false), null, 'no start marker, no transition');
});

test('DE1: starting INSIDE prefers the enter marker, and falls back to start', () => {
  const both = { enterMarker: { x: 900, y: 0, z: 900 }, startMarker: { x: 10, y: 0, z: 10 } };
  assert.deepEqual(chooseMarker(both, true), both.enterMarker, 'StartDungeonInterior prefers it');
  const startOnly = { enterMarker: null, startMarker: { x: 10, y: 0, z: 10 } };
  assert.deepEqual(chooseMarker(startOnly, true), startOnly.startMarker, 'and StartMarker is the fallback');
});

test('DE1: closestDoorTo is FindClosestDoorToPlayer - nearest world centre wins', () => {
  const door = (x, z, nx, nz) => ({
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    centre: { x, y: 0, z }, normal: { x: nx, y: 0, z: nz },
  });
  const doors = [door(100, 0, 1, 0), door(3, 0, 0, 1), door(50, 0, -1, 0)];
  const near = closestDoorTo([0, 0, 0], doors);
  assert.equal(near.index, 1, 'the nearest, not the first');
  assert.deepEqual(near.normal, [0, 0, 1]);
  // DISTANCE IS 3D, as Vector3.Distance is - and the fixture has to be
  // one where height changes the answer, or a ground-plane measure
  // passes it. Standing high above door A: on the floor plane A is
  // nearest (10 < 30), in three dimensions B is (30 < 200.2).
  const stacked = [door(10, 0, 1, 0), { ...door(30, 0, 0, 1), centre: { x: 30, y: 200, z: 0 } }];
  assert.equal(closestDoorTo([0, 200, 0], stacked).index, 1,
    'height counts toward the distance - a door on your own level beats one far below');
  assert.equal(closestDoorTo([0, 0, 0], stacked).index, 0, 'and on the ground the near one wins again');
  // and an empty array is a miss, not a throw (DFU returns false)
  assert.equal(closestDoorTo([0, 0, 0], []), null);
  assert.equal(closestDoorTo([0, 0, 0], null), null);
});

