// How the first-person view follows the head, checked on the poses of the retail clips (idle, walk, run, jump, a weapon
// swing and a punch, for the human and beast first-person arms and the human third-person body) recorded in
// test/fixtures/mw/mwHeadViewParity.json. No game files are needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as headView from '../../../src/formats/morrowind/mwHeadView.js';
import * as skin from '../../../src/formats/morrowind/mwSkin.js';
import { rigSkeleton, poseOf } from './mwHeadViewSweep.mjs';

const { inputs } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mwHeadViewParity.json', import.meta.url), 'utf8'),
);
const mats = skin.skeletonSpaceMatrices;
const ROOT = skin.GRAPH_ROOT;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Every pose of every clip of every rig, with the skeleton it belongs to. */
const frames = Object.entries(inputs.rigs).flatMap(([id, rig]) => {
  const skeleton = rigSkeleton(rig);
  return Object.entries(rig.clips).map(([clip, data]) => ({ id, clip, skeleton, poses: data.poses }));
});

/** The world position of the view node and of the head bone for one pose under a pitch and a focus. */
function viewAt(skeleton, recorded, pitch, focus = 0, offset = null) {
  const pose = poseOf(recorded);
  headView.pitchNeck(skeleton, pose, ROOT, mats, pitch, focus, offset);
  const worlds = mats(skeleton, pose, ROOT);
  const view = worlds.get(headView.headViewRef(skeleton));
  return {
    view: view.t,
    head: worlds.get(skeleton.byName.get('bip01 head')).t,
    neck: worlds.get(skeleton.byName.get('bip01 neck')).t,
    axes: view.a,
  };
}

test('head view: the camera is the Camera node where the rig has one, else the head, else nothing', () => {
  const named = (names) => ({ byName: new Map(names.map((name, i) => [name, i])) });
  assert.equal(headView.headViewRef(named(['bip01', 'head', 'camera'])), 2, 'camera wins');
  assert.equal(headView.headViewRef(named(['bip01', 'head'])), 1, 'the head is the fallback');
  assert.equal(headView.headViewRef(named(['bip01', 'bip01 neck'])), -1);
  assert.equal(headView.headViewRef(null), -1);
  const viewOf = (id) => {
    const skeleton = rigSkeleton(inputs.rigs[id]);
    return skeleton.nodes.get(headView.headViewRef(skeleton)).name;
  };
  assert.equal(viewOf('fp-human'), 'camera');
  assert.equal(viewOf('fp-beast'), 'head', 'the beast arms have no camera node');
  assert.equal(viewOf('tp-human'), 'head');
});

test('head view: under any look pitch the camera stays within 8 units of the head bone, as far from the neck as at rest', () => {
  for (const { id, clip, skeleton, poses } of frames) {
    for (const recorded of poses) {
      const rest = viewAt(skeleton, recorded, 0);
      for (const pitch of [-1.4, -0.8, 0.5, 1.4]) {
        for (const focus of [0, 1]) {
          const turned = viewAt(skeleton, recorded, pitch, focus);
          assert.ok(
            distance(turned.view, turned.head) <= 8,
            `${id} ${clip}: ${distance(turned.view, turned.head)} from the head bone`,
          );
          assert.ok(
            Math.abs(distance(turned.view, turned.neck) - distance(rest.view, rest.neck)) < 0.01,
            `${id} ${clip}: the neck turn is rigid`,
          );
        }
      }
    }
  }
});

test('head view: a fixed pitch adds no jitter: from one frame to the next the pitched camera moves like the unpitched one', () => {
  // At 30 frames a second the offset the pitch adds (pitched minus unpitched camera) may change by 0.75 units per frame (the largest on the recorded clips is 0.54, the swing at full follow and a
  // pitch of 1.4, where the arm swings the spine under a 13-unit arc).
  // The clips' own motion is not limited here: a jump moves the third-person head by 8 units a frame.
  let worst = 0;
  for (const { id, clip, skeleton, poses } of frames) {
    for (const pitch of [-1.4, 0.5, 1.4]) {
      for (const focus of [0, 1]) {
        const added = poses.map((recorded) =>
          sub(viewAt(skeleton, recorded, pitch, focus).view, viewAt(skeleton, recorded, 0).view),
        );
        for (let i = 1; i < added.length; i++) {
          const step = distance(added[i], added[i - 1]);
          worst = Math.max(worst, step);
          assert.ok(step <= 0.75, `${id} ${clip} pitch ${pitch} focus ${focus} frame ${i}: ${step}`);
        }
      }
    }
  }
  assert.ok(worst >= 0, `largest added step ${worst}`);
});

test('head view: the view follows the pitch: the camera turns about the root X by exactly share * pitch, more pitch turns it further', () => {
  for (const { id, clip, skeleton, poses } of frames) {
    const recorded = poses[Math.floor(poses.length / 2)];
    const rest = viewAt(skeleton, recorded, 0);
    for (const focus of [0, 0.5, 1]) {
      let previous = 0;
      for (const pitch of [0.2, 0.6, 1.0, 1.4]) {
        const turned = viewAt(skeleton, recorded, pitch, focus);
        // turned axes = turn * rest axes, so turn = turned * rest^T; the angle of a rotation is acos((trace - 1) / 2).
        const a = turned.axes;
        const b = rest.axes;
        const turn = [0, 1, 2].flatMap((r) =>
          [0, 1, 2].map((c) => a[r * 3] * b[c * 3] + a[r * 3 + 1] * b[c * 3 + 1] + a[r * 3 + 2] * b[c * 3 + 2]),
        );
        const expected = headView.pitchDown(pitch * headView.neckPitchShare(focus));
        for (let i = 0; i < 9; i++)
          assert.ok(Math.abs(turn[i] - expected[i]) < 2e-3, `${id} ${clip} pitch ${pitch} focus ${focus} element ${i}`);
        const angle = Math.acos(Math.min(1, Math.max(-1, (turn[0] + turn[4] + turn[8] - 1) / 2)));
        assert.ok(angle > previous, 'more pitch, more turn');
        previous = angle;
      }
    }
  }
});

test('head view: a look down (positive pitch) swings the eye forward along its arc, a look up swings it back', () => {
  for (const { id, skeleton, poses } of frames.filter((entry) => entry.clip === 'idle')) {
    const rest = viewAt(skeleton, poses[0], 0).view;
    const down = viewAt(skeleton, poses[0], 0.5).view;
    const up = viewAt(skeleton, poses[0], -0.5).view;
    assert.ok(down[2] < rest[2], `${id}: looking down lowers the eye`);
    assert.ok(Math.abs(down[0] - rest[0]) < 0.05 && Math.abs(up[0] - rest[0]) < 0.05, `${id}: never sideways`);
    assert.ok(down[1] - rest[1] > 1 && rest[1] - up[1] > 1, `${id}: forward for down, back for up`);
  }
});

test('head view: nothing to apply changes nothing', () => {
  const { skeleton, poses } = frames[0];
  const pose = poseOf(poses[0]);
  assert.equal(headView.pitchNeck(skeleton, pose, ROOT, mats, 0, 1, null), false);
  assert.equal(headView.pitchNeck(skeleton, pose, ROOT, mats, 0, 0, [0, 0, 0]), false);
  assert.deepEqual(pose, poseOf(poses[0]));
  assert.equal(
    headView.pitchNeck({ byName: new Map(), nodes: new Map() }, pose, ROOT, mats, 0.5),
    false,
    'a rig with no neck',
  );
});

test('head view: a sink offset moves the neck and everything above it by the offset, in the root frame', () => {
  for (const { id, clip, skeleton, poses } of frames) {
    const rest = viewAt(skeleton, poses[0], 0);
    const sunk = viewAt(skeleton, poses[0], 0, 0, [4, -7, -12]);
    for (const key of ['view', 'head', 'neck']) {
      const moved = sub(sunk[key], rest[key]);
      assert.ok(distance(moved, [4, -7, -12]) < 0.01, `${id} ${clip} ${key}: ${moved}`);
    }
  }
});

test('head view: turnInRootFrame leaves the node where it is and turns its orientation by the given turn', () => {
  const { skeleton, poses } = frames[0];
  const rest = mats(skeleton, poseOf(poses[0]), ROOT);
  const pose = poseOf(poses[0]);
  const ref = skeleton.byName.get('bip01 spine2');
  const turn = headView.pitchDown(0.4);
  assert.equal(headView.turnInRootFrame(skeleton, pose, ROOT, mats, ref, turn), true);
  const after = mats(skeleton, pose, ROOT);
  assert.ok(distance(after.get(ref).t, rest.get(ref).t) < 1e-3, 'position stays');
  const m0 = rest.get(ref).a;
  const m1 = after.get(ref).a;
  const expected = [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => turn[r * 3] * m0[c] + turn[r * 3 + 1] * m0[3 + c] + turn[r * 3 + 2] * m0[6 + c]),
  );
  for (let i = 0; i < 9; i++) assert.ok(Math.abs(m1[i] - expected[i]) < 2e-3, `element ${i}`);
  assert.equal(headView.turnInRootFrame(skeleton, pose, ROOT, mats, undefined, turn), false, 'no node, no turn');
  assert.equal(headView.turnInRootFrame(skeleton, pose, ROOT, mats, 9999, turn), false);
});

test('head view: a scaled parent chain still turns by the given angle and shifts by the given offset', () => {
  // root (scale 2) -> neck: the world matrix of the neck carries the scale, the turn must not.
  const identity = Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const skeleton = {
    nodes: new Map([
      [0, { ref: 0, name: 'bip01', parent: -1, rest: { rotation: identity, translation: [0, 0, 0], scale: 2 } }],
      [1, { ref: 1, name: 'bip01 neck', parent: 0, rest: { rotation: identity, translation: [0, 0, 5], scale: 1 } }],
      [2, { ref: 2, name: 'head', parent: 1, rest: { rotation: identity, translation: [0, 0, 3], scale: 1 } }],
    ]),
    byName: new Map([
      ['bip01', 0],
      ['bip01 neck', 1],
      ['head', 2],
    ]),
  };
  const worlds = (pose) => mats(skeleton, pose, ROOT);
  const rest = worlds(new Map());
  const pose = new Map();
  headView.pitchNeck(skeleton, pose, ROOT, mats, 0.5, 1, [0, 0, -2]);
  const after = worlds(pose);
  // The neck's world position moved by exactly the offset.
  assert.ok(distance(after.get(1).t, [rest.get(1).t[0], rest.get(1).t[1], rest.get(1).t[2] - 2]) < 1e-4);
  // The head turned about the neck by the pitch: its distance from the neck is unchanged and the angle between the two
  // rest and turned offsets is 0.5.
  const before = sub(rest.get(2).t, rest.get(1).t);
  const turned = sub(after.get(2).t, after.get(1).t);
  assert.ok(Math.abs(Math.hypot(...turned) - Math.hypot(...before)) < 1e-4);
  const cos =
    (before[0] * turned[0] + before[1] * turned[1] + before[2] * turned[2]) /
    (Math.hypot(...before) * Math.hypot(...turned));
  assert.ok(Math.abs(Math.acos(cos) - 0.5) < 1e-4);
});

test('head view: the aiming focus is 0 at rest, 1 while aiming, and the same after any time whatever the frame rate', () => {
  assert.equal(headView.stepAimFocus(0, false, 1 / 60), 0);
  assert.equal(headView.stepAimFocus(undefined, false, 1 / 60), 0);
  assert.equal(headView.stepAimFocus(0.95, true, 1), 1, 'clamped at one');
  assert.equal(headView.stepAimFocus(0.1, false, 10), 0, 'clamped at zero');
  const fall = (fps) => {
    let focus = 1;
    for (let i = 0; i < fps / 2; i++) focus = headView.stepAimFocus(focus, false, 1 / fps);
    return focus;
  };
  assert.ok(Math.abs(fall(30) - fall(144)) < 1e-9, 'half a second falls the same at 30 and 144 frames a second');
  const rise = (fps) => {
    let focus = 0;
    for (let i = 0; i < fps / 20; i++) focus = headView.stepAimFocus(focus, true, 1 / fps);
    return focus;
  };
  assert.ok(Math.abs(rise(40) - rise(160)) < 1e-9, 'and so does a rise');
  assert.ok(headView.stepAimFocus(0, true, 1 / 30) < 0.3, 'the rise is not a jump');
  assert.equal(headView.neckPitchShare(0), headView.HEAD_VIEW_TUNING.restShare);
  assert.equal(headView.neckPitchShare(1), 1);
  assert.ok(headView.neckPitchShare(0.5) > headView.neckPitchShare(0.25));
  assert.equal(headView.neckPitchShare(), headView.neckPitchShare(0), 'no focus means at rest');
});
