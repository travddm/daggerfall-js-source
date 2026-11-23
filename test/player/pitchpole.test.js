import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LookFilter } from '../../src/player/lookFilter.js';
import { CameraRecoiler } from '../../src/player/cameraRecoiler.js';
import { HeadBobber } from '../../src/player/headBobber.js';
import { PITCH_LIMIT } from '../../src/player/pitchLimit.js';

// The view must never flip over at the vertical. Each host builds its look direction from the camera's Euler angles,
// forward = [sin(yaw) cos(pitch), sin(pitch), cos(yaw) cos(pitch)], and draws it with lookAt against world up. A pitch
// past +/-90 degrees makes cos(pitch) negative, so the heading turns round by 180 degrees and the picture turns
// upside down. Daggerfall Unity cannot flip there: PlayerMouseLook clamps its Pitch to 0.99 of 90 degrees, and the
// head bob and the hit recoil are Transform.Rotate calls on top of it, which compose as quaternions. The port adds
// the bob's nod and the recoil to the same Euler pitch, so each frame's look must stay inside the limit after them.

const DT = 1 / 60;
const DEG = Math.PI / 180;

/** The hosts' own order: the look filter, then the recoil, then the head bob, then the look direction. */
function frame(rig, { lookUp, moving, running = false, hit = 0 }) {
  const { cam, filter, recoiler, bobber } = rig;
  filter.add(0, lookUp);
  filter.tick(DT, cam, { smoothing: 0.5 });
  recoiler.update(DT, cam, { healthLost: hit, healthLostPercent: hit / 100, setting: 4, rolls: () => 0 });
  bobber.update(DT, cam, { enabled: true, moving, running, velocity: running ? 8 : 4 });
  const c = Math.cos(cam.pitch);
  return { heading: [Math.sin(cam.yaw) * c, Math.cos(cam.yaw) * c], pitch: cam.pitch };
}

function rig(pitch = 0) {
  return {
    cam: { yaw: 0.7, pitch },
    filter: new LookFilter(),
    recoiler: new CameraRecoiler(),
    bobber: new HeadBobber(),
  };
}

/** Drives `frames` frames and fails on the first one whose pitch passes the limit or whose heading turns back. */
function assertNeverFlips(r, frames, input) {
  const facing = [Math.sin(r.cam.yaw), Math.cos(r.cam.yaw)];
  for (let i = 0; i < frames; i++) {
    const f = frame(r, typeof input === 'function' ? input(i) : input);
    assert.ok(
      Math.abs(f.pitch) <= PITCH_LIMIT,
      `frame ${i}: pitch ${(f.pitch / DEG).toFixed(3)} degrees is past the limit`,
    );
    const along = f.heading[0] * facing[0] + f.heading[1] * facing[1];
    assert.ok(along >= 0, `frame ${i}: the view's heading turned round (pitch ${(f.pitch / DEG).toFixed(3)} degrees)`);
  }
}

test("the pitch limit is Daggerfall Unity's: 0.99 of a right angle, short of the pole", () => {
  assert.equal(PITCH_LIMIT, (Math.PI / 2) * 0.99);
});

test('looking straight up and walking, then running, never flips the view', () => {
  const r = rig();
  assertNeverFlips(r, 600, (i) => ({ lookUp: 0.05, moving: true, running: i > 300 }));
});

test('a hit while looking straight up never flips the view', () => {
  const r = rig();
  assertNeverFlips(r, 120, { lookUp: 0.05, moving: true, running: true });
  // A heavy hit: the recoil's first frame tilts the camera by tens of degrees.
  assertNeverFlips(r, 1, { lookUp: 0.05, moving: true, running: true, hit: 80 });
  assertNeverFlips(r, 600, { lookUp: 0.05, moving: true, running: true });
});

test('a hit while looking down as far as the look goes never flips the view', () => {
  const r = rig();
  assertNeverFlips(r, 120, { lookUp: -0.05, moving: true, running: true });
  assertNeverFlips(r, 1, { lookUp: -0.05, moving: true, running: true, hit: 80 });
  assertNeverFlips(r, 600, { lookUp: -0.05, moving: true, running: true });
});

test('stopping or leaving the ground at the pole leaves the look inside the limit', () => {
  const r = rig();
  assertNeverFlips(r, 300, { lookUp: 0.05, moving: true, running: true });
  // The bob takes its nod back off and returns early when the body leaves the ground.
  r.filter.tick(DT, r.cam, { smoothing: 0.5 });
  r.bobber.update(DT, r.cam, { enabled: true, moving: true, running: true, velocity: 8, grounded: false });
  assert.ok(Math.abs(r.cam.pitch) <= PITCH_LIMIT, `airborne: pitch ${(r.cam.pitch / DEG).toFixed(3)} degrees`);
});

test('the bob and the recoil still give the look back when it comes away from the pole', () => {
  // Level look, walking, then a hit: once the sway has died and the walk has stopped, the look is where the mouse left it.
  const r = rig(0.2);
  for (let i = 0; i < 200; i++) frame(r, { lookUp: 0, moving: true, hit: i === 50 ? 30 : 0 });
  for (let i = 0; i < 600; i++) frame(r, { lookUp: 0, moving: false });
  assert.ok(Math.abs(r.cam.pitch - 0.2) < 1e-9, `pitch ${r.cam.pitch} came back to 0.2`);
  assert.ok(Math.abs(r.cam.yaw - 0.7) < 1e-9, `yaw ${r.cam.yaw} came back to 0.7`);
});
