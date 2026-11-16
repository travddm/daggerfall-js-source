// The head view (which node carries the first-person camera, and the neck turn that pitches the view) is compared with
// a recording of the implementation it replaced (test/fixtures/mw/mwHeadViewParity.json): for the human first-person
// arms, the beast first-person arms and the human third-person body, over six retail clips of up to 12 frames each,
// the camera node's world position and axes under eight combinations of look pitch, aiming focus and sink offset, the
// turn of one bone in the root's frame, and the aiming focus over time at three frame rates.
//
// The recording came from the code of src/formats/morrowind/mwHeadView.js at commit 1830dfcaca (the code moved out of
// mwFirstPerson.js unchanged), run through readInputs and recordHeadView from mwHeadViewSweep.mjs over the retail
// files. The new code was written without reading that code or any third-party engine source.
//
// What the rewrite keeps is compared exactly. What it changes on purpose (the three numbers in HEAD_VIEW_TUNING, and
// the parent-frame offset) is compared by the size of the difference, and each difference is explained below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as headView from '../../../src/formats/morrowind/mwHeadView.js';
import * as firstPerson from '../../../src/formats/morrowind/mwFirstPerson.js';
import * as skin from '../../../src/formats/morrowind/mwSkin.js';
import { COMBOS, recordHeadView, rigSkeleton, poseOf } from './mwHeadViewSweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mwHeadViewParity.json', import.meta.url), 'utf8'),
);

const api = {
  viewRef: headView.headViewRef,
  applyNeck: headView.pitchNeck,
  applyTurn: headView.turnInRootFrame,
  stepFocus: headView.stepAimFocus,
  pitchShare: headView.neckPitchShare,
  pitchMatrix: headView.pitchDown,
};
const now = JSON.parse(JSON.stringify(recordHeadView(api, inputs, skin)));

const comboIndex = (match) =>
  COMBOS.findIndex((combo) => Object.entries(match).every(([k, v]) => JSON.stringify(combo[k]) === JSON.stringify(v)));
const unpitched = comboIndex({ pitch: 0, focus: 0, offset: null });
const aiming = comboIndex({ pitch: 0.5, focus: 1, offset: null });
const rows = (data, combo) =>
  Object.keys(data.rigs).flatMap((id) =>
    Object.values(data.rigs[id].clips).flatMap((frames) => frames.map((frame) => frame[combo])),
  );
const distance = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]);

test('head view, kept exactly: the camera node of every rig, the unpitched pose, the root-frame turn and the pitch matrix', () => {
  for (const id of Object.keys(recorded.rigs)) {
    assert.equal(now.rigs[id].view, recorded.rigs[id].view, `${id}: the node that carries the camera`);
    assert.deepEqual(now.rigs[id].turns, recorded.rigs[id].turns, `${id}: a turn laid on spine1 in the root's frame`);
  }
  assert.deepEqual(rows(now, unpitched), rows(recorded, unpitched), 'no pitch and no offset leaves the pose alone');
  assert.deepEqual(now.matrices, recorded.matrices);
});

test('head view, kept exactly: aiming takes the whole pitch, as before', () => {
  assert.equal(now.share[1], 1);
  const after = rows(now, aiming);
  rows(recorded, aiming).forEach((old, i) => {
    old.forEach((value, k) =>
      assert.ok(Math.abs(value - after[i][k]) <= 0.0015, `frame ${i} value ${k}: ${value} vs ${after[i][k]}`),
    );
  });
});

test('head view, changed on purpose: at rest the neck takes less of the pitch, so the camera moves less than it did', () => {
  // Share at focus 0 went from 0.75 to 0.7 and at focus 0.5 from 0.875 to 0.85, so the camera arc is shorter. Between two
  // shares on the same turn the eye of a rig whose camera sits r from the neck moves 2 * r * sin(pitch * change / 2) at
  // most, and r is at most 10.7 units on the recorded rigs; 0.01 covers the recording's rounding.
  assert.deepEqual(now.share, { 0: 0.7, 0.25: 0.775, 0.5: 0.85, 1: 1 });
  const rMax = 10.7;
  const cases = [
    [{ pitch: 0.5, focus: 0, offset: null }, 0.5 * 0.05],
    [{ pitch: -0.8, focus: 0, offset: null }, 0.8 * 0.05],
    [{ pitch: 1, focus: 0.5, offset: null }, 1 * 0.025],
  ];
  for (const [combo, turn] of cases) {
    const at = comboIndex(combo);
    const before = rows(recorded, at);
    const after = rows(now, at);
    const flat = rows(recorded, unpitched);
    let largest = 0;
    before.forEach((old, i) => {
      const moved = distance(after[i], old);
      largest = Math.max(largest, moved);
      assert.ok(moved <= 2 * rMax * Math.sin(turn / 2) + 0.01, `${JSON.stringify(combo)} frame ${i}: moved ${moved}`);
      assert.ok(
        distance(after[i], flat[i]) <= distance(old, flat[i]) + 0.005,
        'and never farther from the unpitched eye than before',
      );
    });
    assert.ok(largest > 0.1, `${JSON.stringify(combo)} differs from the recording (it uses the new share)`);
  }
});

test('head view, changed on purpose: a sink offset moves the neck by exactly the offset in the root frame', () => {
  // The recording shifted the neck by the offset seen from the neck's own frame, but a local translation lives in the
  // parent's frame, so the neck's world position moved by the offset turned by the neck's rest rotation: up to 1.2
  // units off for an offset of 12 on the retail rigs. The new shift is exact.
  const sinking = comboIndex({ pitch: 0, focus: 0, offset: [0, 0, -12] });
  const sideways = comboIndex({ pitch: 0, focus: 0, offset: [5, -3, 2] });
  const error = (data, combo) =>
    Math.max(
      ...rows(data, combo).map((row, i) => {
        const flat = rows(data, unpitched)[i];
        const wanted = COMBOS[combo].offset;
        return Math.hypot(row[1] - flat[1] - wanted[0], row[2] - flat[2] - wanted[1], row[3] - flat[3] - wanted[2]);
      }),
    );
  assert.ok(error(now, sinking) < 0.01, 'the eye moves by exactly the offset');
  assert.ok(error(now, sideways) < 0.01);
  assert.ok(error(recorded, sinking) > 0.1 && error(recorded, sideways) > 0.1, 'the recording did not');
});

test('head view, changed on purpose: the aiming focus rises over about an eighth of a second and falls over most of a second', () => {
  // Recorded: the focus jumped to 1 in one step and fell by 0.5 a second. Now: it rises by 8 and falls by 1.2 a second,
  // so the step at 30 frames a second is at most 8/30, and what it reaches after any time does not depend on the rate.
  for (const fps of [30, 60, 144]) {
    const old = recorded.focus[fps];
    const next = now.focus[fps];
    assert.equal(old.length, next.length);
    assert.equal(Math.max(...old.slice(1).map((v, i) => v - old[i])), 1, `${fps} fps: recorded rise is one step`);
    assert.ok(
      Math.max(...next.slice(1).map((v, i) => v - next[i])) <= 8 / fps + 1e-3,
      `${fps} fps: new rise is gradual`,
    );
    assert.equal(Math.max(...next), 1);
    assert.equal(next.at(-1), 0);
  }
  // The aiming lasts until 0.9 s into each run, so half a second later the focus is 1 - 0.5 * 1.2 on every rate.
  const held = (fps) => Math.round(0.9 * fps);
  const halfSecond = (fps) => now.focus[fps][held(fps) + Math.round(fps / 2) - 1];
  for (const fps of [30, 60, 144]) assert.ok(Math.abs(halfSecond(fps) - 0.4) < 0.02, `${fps} fps: ${halfSecond(fps)}`);
});

test('head view: the first-person host still exports it', () => {
  for (const name of Object.keys(headView)) assert.equal(firstPerson[name], headView[name], name);
});

test('head view: the recorded inputs build skeletons the module can use', () => {
  for (const rig of Object.values(inputs.rigs)) {
    const skeleton = rigSkeleton(rig);
    assert.ok(headView.headViewRef(skeleton) >= 0);
    const pose = poseOf(Object.values(rig.clips)[0].poses[0]);
    assert.equal(headView.pitchNeck(skeleton, pose, skin.GRAPH_ROOT, skin.skeletonSpaceMatrices, 0.3), true);
  }
});
