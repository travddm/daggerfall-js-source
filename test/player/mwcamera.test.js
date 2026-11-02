// The Morrowind camera machine: the zoom ladder, the first/third person switch, the eye's equation, the focal
// guard, the queued view change and the saved state. The numbers are the camera's tuning, kept from the previous
// camera so that hosts and saves see no change; test/player/mwCameraParity.test.js pins the whole behaviour against
// a recording of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createMwCamera, mwCamera,
  MW_UNITS_PER_METER, FOCAL_HEIGHT, BASE_DISTANCE, MIN_DISTANCE, MAX_DISTANCE,
  WHEEL_STEP, CAMERA_OBSTACLE_LIMIT, FOCAL_OBSTACLE_LIMIT,
} from '../../src/player/mwCamera.js';

test('MW-D25: the camera tuning constants', () => {
  assert.equal(MW_UNITS_PER_METER, 69.99125109);
  assert.equal(FOCAL_HEIGHT, 124);
  assert.equal(BASE_DISTANCE, 192);
  assert.equal(MIN_DISTANCE, 30);
  assert.equal(MAX_DISTANCE, 800);
  assert.equal(WHEEL_STEP, 10);
  assert.equal(CAMERA_OBSTACLE_LIMIT, 5);
  assert.equal(FOCAL_OBSTACLE_LIMIT, 10);
});

test('MW-D25: the camera boots in first person and the eye is the host\'s own', () => {
  // First person leaves the position to the host's own head and has no boom length.
  const cam = createMwCamera();
  assert.equal(cam.mode(), 'first');
  const fpEye = [3, 1.7, -2];
  const r = cam.eye({ fpEye, feet: [3, 0, -2], yaw: 0.4, pitch: -0.2 });
  assert.deepEqual(r.eye, fpEye);
  assert.equal(r.thirdPerson, false);
  assert.equal(cam.cameraDistance(), 0);
});

test('MW-D25: wheel-down leaves the head onto the CLOSEST ring, not the remembered one', () => {
  // Leaving the head puts the camera on the closest ring, whatever the boom length was before.
  const cam = createMwCamera();
  cam.wheel(-1);
  assert.equal(cam.mode(), 'third');
  assert.equal(cam.baseDistance(), MIN_DISTANCE);
  // and wheel-up from that ring goes straight back in
  cam.eye({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0 });   // settle cameraDistance
  cam.wheel(1);
  assert.equal(cam.mode(), 'first');
});

test('MW-D25: the zoom ladder walks 10 units a click between 30 and 800', () => {
  // The boom length moves 10 units a click, from where the eye really is, within 30 and 800.
  const cam = createMwCamera();
  cam.wheel(-1);                     // -> third at 30
  const settle = () => cam.eye({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0 });
  settle();
  cam.wheel(-1); assert.equal(cam.baseDistance(), 40);
  settle();
  cam.wheel(-3); assert.equal(cam.baseDistance(), 70);
  // clamp at the far end
  settle();
  cam.wheel(-200); assert.equal(cam.baseDistance(), MAX_DISTANCE);
  // and back down to the closest ring, never past it while > MIN
  settle();
  cam.wheel(77); assert.equal(cam.baseDistance(), MIN_DISTANCE);
  assert.equal(cam.mode(), 'third');   // the clamp landed ON 30, not through it
  settle();
  cam.wheel(1); assert.equal(cam.mode(), 'first');
});

test('MW-D25: a wall-pinned camera zooms from where it actually is, and out-zoom is pinned with it', () => {
  const cam = createMwCamera();
  cam.wheel(-1);   // third at 30
  const settle = (rc) => cam.eye({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0, raycast: rc });
  settle();
  cam.wheel(-20);  // out to 230
  assert.equal(cam.baseDistance(), 230);
  // A wall 1m behind the focal: the eye pulls in to 1m minus the
  // 5-unit clearance...
  const wall = () => 1.0;
  const r = settle(wall);
  const u = 1 / MW_UNITS_PER_METER;
  assert.ok(Math.abs(r.distance - (1.0 - CAMERA_OBSTACLE_LIMIT * u)) < 1e-9,
    `pulled-in distance backs off the clearance (${r.distance})`);
  const actual = cam.cameraDistance();
  assert.ok(actual < 70 && actual > 60, `actual distance is the pinned one in MW units (${actual})`);
  // ...zooming OUT while pinned is a no-op...
  cam.wheel(-1);
  assert.equal(cam.baseDistance(), 230);
  // ...and zooming IN subtracts the obstacle debt, so one click brings
  // the base to ten units inside the camera's REAL ring.
  cam.wheel(1);
  assert.ok(Math.abs(cam.baseDistance() - (actual - WHEEL_STEP)) < 1e-9,
    `base caught up to the pinned camera (${cam.baseDistance()} vs actual ${actual})`);
});

test('MW-D25: the third-person eye sits the boom length behind the focal point, in meters', () => {
  // The focal point is 124 units (times the actor's height scale) above the feet; the eye is the boom length
  // behind it along the look direction.
  const cam = createMwCamera();
  cam.wheel(-1);
  const settle = () => cam.eye({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0 });
  settle();
  cam.wheel(-17);   // 30 + 170 -> 200... clamp path: 30->40->... single call: 30+170=200
  const u = 1 / MW_UNITS_PER_METER;
  const feet = [10, 2, -4];
  const yaw = Math.PI / 3; const pitch = 0.3;
  const r = cam.eye({ fpEye: [0, 0, 0], feet, yaw, pitch, heightScale: 1 });
  const focalY = 2 + FOCAL_HEIGHT * u;
  assert.ok(Math.abs(r.focal[1] - focalY) < 1e-9, `focal rides 124 units above the feet (${r.focal[1]})`);
  const dist = 200 * u;
  const cp = Math.cos(pitch);
  const fwd = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(r.eye[i] - (r.focal[i] - fwd[i] * dist)) < 1e-9,
      `eye axis ${i} sits the full distance behind the focal along the pitched forward`);
  }
  // the eye is BEHIND and (looking down-range) the focal is dead centre:
  // looking along fwd from the eye for `dist` lands exactly on the focal -
  // the centred camera, with the shoulder option off.
  assert.ok(Math.abs((r.eye[0] + fwd[0] * dist) - r.focal[0]) < 1e-9);
});

test('MW-D25: the focal keeps ten units of ceiling clearance and drops at most its own offset', () => {
  // With the default zero focal offset only the ceiling clearance applies, and the focal point never drops by more
  // than that clearance.
  const cam = createMwCamera();
  cam.wheel(-1);
  const u = 1 / MW_UNITS_PER_METER;
  const feet = [0, 0, 0];
  const focalY = FOCAL_HEIGHT * u;
  // ceiling exactly AT the unguarded focal: the focal must sit 10 units
  // beneath it.
  const lowCeiling = (origin, dir) => (dir[1] > 0 ? (focalY - origin[1]) : null);
  const r = cam.eye({ fpEye: [0, 0, 0], feet, yaw: 0, pitch: 0, raycast: lowCeiling });
  assert.ok(Math.abs(r.focal[1] - (focalY - FOCAL_OBSTACLE_LIMIT * u)) < 1e-9,
    `focal dropped to ten units under the ceiling (${r.focal[1]})`);
  // a ceiling far above leaves the focal alone
  const highCeiling = () => null;
  const r2 = cam.eye({ fpEye: [0, 0, 0], feet, yaw: 0, pitch: 0, raycast: highCeiling });
  assert.ok(Math.abs(r2.focal[1] - focalY) < 1e-9, 'an open sky leaves the focal at 124');
});

test('MW-D25: a view change while the upper body is busy QUEUES, and lands when ready', () => {
  // The change waits in the queue and is applied by the next update once the upper body is ready.
  const cam = createMwCamera();
  cam.wheel(-1, { ready: false });
  assert.equal(cam.mode(), 'first', 'the crossing waits');
  assert.equal(cam.queued(), false, 'queued target is third person');
  cam.update({ ready: false });
  assert.equal(cam.mode(), 'first', 'still waiting');
  cam.update({ ready: true });
  assert.equal(cam.mode(), 'third', 'the queued change lands');
  assert.equal(cam.queued(), null);
  // distance zoom inside third person never queues - it is not a view
  // change (only crossing the first-person boundary waits for the arms).
  cam.eye({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0 });
  cam.wheel(-2, { ready: false });
  assert.equal(cam.baseDistance(), 50);
});

test('MW-D25: state round-trips and restore clamps', () => {
  // Both halves persist: the boom length and the first/third flag.
  const cam = createMwCamera();
  cam.wheel(-1);
  cam.eye({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0 });
  cam.wheel(-5);
  const s = cam.state();
  const cam2 = createMwCamera();
  cam2.restore(s);
  assert.equal(cam2.mode(), 'third');
  assert.equal(cam2.baseDistance(), 80);
  cam2.restore({ firstPerson: false, baseDistance: 99999 });
  assert.equal(cam2.baseDistance(), MAX_DISTANCE);
});

test('MW-D25: one live instance is exported for the hosts, and the unit bridge has one home', () => {
  assert.equal(typeof mwCamera.wheel, 'function');
  const src = readFileSync(new URL('../../src/player/mwCamera.js', import.meta.url), 'utf8');
  // The bridge literal is MINTED in the format layer (one home) and
  // re-exported here; both facts are load-bearing.
  const fmt = readFileSync(new URL('../../src/formats/morrowind/mwFirstPerson.js', import.meta.url), 'utf8');
  assert.ok(/69\.99125109/.test(fmt), 'the unit bridge literal lives in the format layer');
  assert.ok(!/69\.99125109/.test(src), 'and is not restated here - one home');
});

// ── MW-D25: THE VIEW SYNC's no-data law, on the live singletons ─────
import { mwViewWheel, mwViewFrame } from '../../src/player/mwView.js';

test('MW-D25: with no Morrowind body the wheel cannot leave first person, and the eye passes through', () => {
  // A player with no data (or a refused body) has no third person: the
  // wheel does nothing rather than pulling the eye out of an invisible
  // head, and the frame's eye is the host's own.
  assert.equal(mwViewWheel(+120), false, 'scroll-down (leave the head) refuses without a body');
  const fpEye = [1, 1.7, 2];
  const r = mwViewFrame({ fpEye, feet: [1, 0, 2], yaw: 0.3, pitch: -0.1 });
  assert.equal(r.thirdPerson, false);
  assert.deepEqual(r.eye, fpEye);
  assert.equal(mwCamera.mode(), 'first', 'the live camera stayed in the view that exists');
});

// ── MW-D30: PERSISTENCE, THE FRAME-ACCUMULATED WHEEL, THE REAL CLAMP ─

import { PITCH_LIMIT } from '../../src/player/mwCamera.js';
import { mwViewPendingClicks, mwViewFrame as mwvf } from '../../src/player/mwView.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

test('MW-D30: the pitch clamp keeps the look off the vertical, and every host rides it', () => {
  // The limit is a hair under straight up or down; a hand-rolled +/-1.5 stopped the look ~4 degrees short.
  assert.equal(PITCH_LIMIT, Math.PI / 2 - 0.000001);
  // AUDIT 68 S22: the clamp is the look filter's (lookFilter.js), and a host rides it by driving its camera through
  // one - an import of PITCH_LIMIT the host never read satisfied this pin while proving nothing.
  assert.match(readFileSync(new URL('../../src/player/lookFilter.js', import.meta.url), 'utf8'), /Math\.min\(PITCH_LIMIT, cam\.pitch \+ this\.residualPitch\)/);
  for (const host of ['src/scenes/world.js', 'src/scenes/exterior.js', 'src/scenes/dungeon.js', 'src/scenes/interior.js']) {
    const src = hostText(host);
    assert.ok(!/Math\.max\(-1\.5, Math\.min\(1\.5,/.test(src), `${host} clamps at PITCH_LIMIT, not 1.5`);
    assert.ok(/const lookFilter = new LookFilter\(\);/.test(src), `${host} rides the one clamp`);
  }
});

test('MW-D30: wheel clicks ACCUMULATE and flush once per frame', () => {
  // Every notch adds to a pending count, and the camera zooms ONCE per frame on the total.
  assert.equal(mwViewPendingClicks(), 0);
  assert.equal(mwViewWheel(-120), true, 'wheel-up queues even in first person');
  mwViewWheel(-120); mwViewWheel(-120);
  assert.equal(mwViewPendingClicks(), 3, 'three notches, one pending sum');
  mwvf({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0 });
  assert.equal(mwViewPendingClicks(), 0, 'the frame flushed them in one zoom() call');
  assert.equal(mwCamera.mode(), 'first', 'zoom-in inside the head does nothing');
});

test('MW-D30: the pose carries the camera and the load FORCES it', () => {
  // A save carries the flag and the boom length, and a load forces the live camera to match. The one pose-apply
  // does both through mwCamera.restore, and a pose without a camera (an older save, the classic import) leaves the
  // live camera standing.
  const src = hostText('src/scenes/world.js');
  // AUDIT 39 (#24) MOVED THIS PIN: the pose grew `transport` after the
  // camera (the mount rides the quicksave now), so the camera is no
  // longer the pose's last key. The law pinned is the CARRY, not the tail.
  assert.ok(/camera: mwViewSaveCamera\(\),/.test(src), 'the saved pose carries mwCamera.state() - through mwViewSaveCamera, the player\'s own under a travel view\'s hold (AUDIT DEEP X-3)');
  // AUDIT-EOTB2: the one pose-apply goes through the view seam's load
  // door, which restores the Morrowind camera AND re-seeds the sprite
  // camera (the mod's OnLoad) - the restore itself is unchanged
  // EOTB-IL: the door also carries WHERE the player stands (the mod's
  // OnLoad reads PlayerEnterExit.IsPlayerInside); the restore is unchanged
  assert.ok(/mwViewLoadPose\(pose\.camera, .*\);/.test(src), 'and the one pose-apply restores it, through the seam');
  assert.match(readFileSync(new URL('../../src/player/mwView.js', import.meta.url), 'utf8'), /export function mwViewLoadPose\(pose, inside = false\) \{\s*heldFirst = null;[^\n]*\n\s*if \(pose\) mwCamera\.restore\(pose\);/, 'the seam restores exactly as the host did');
  // restore(undefined) is the older-save no-op, behaviorally:
  const cam = createMwCamera();
  cam.wheel(-1);
  cam.restore(undefined);
  assert.equal(cam.mode(), 'third', 'a pose without a camera leaves the live camera standing');
});

test('MW-D34: the focal height rides the race HEIGHT through the one seam', () => {
  // adjustScale's z (npc.cpp:1127/1134) scales the actor the camera
  // tracks, so the third-person focal height scales with it. The
  // answer comes from the rig itself, in mwViewFrame - the hosts stay
  // out of the seam (MW-D25's law) and a caller may still pass an
  // explicit value.
  const view = readFileSync(new URL('../../src/player/mwView.js', import.meta.url), 'utf8');
  assert.match(view, /heightScale = null/, 'the default is "ask the rig", not 1');
  assert.match(view, /if \(heightScale == null\) heightScale = fpArm\.raceHeightScale\(\);/);
  const arm = readFileSync(new URL('../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(arm, /raceHeightScale: \(\) => \(built && built\.ok && built\.raceScale \? built\.raceScale\.height : 1\)/,
    'and the rig answers its race height, 1 unbuilt');
  // The camera really multiplies it into the focal height.
  const tall = createMwCamera();
  tall.restore({ firstPerson: false, baseDistance: 100 });
  const feet = [1, 2, 3];
  const out = tall.eye({ fpEye: [0, 0, 0], feet, yaw: 0, pitch: 0, heightScale: 1.1 });
  assert.ok(Math.abs(out.focal[1] - (feet[1] + (FOCAL_HEIGHT * 1.1) / MW_UNITS_PER_METER)) < 1e-9);
});
