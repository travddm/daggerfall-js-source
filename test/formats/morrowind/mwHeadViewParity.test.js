// The head view (which node carries the first-person camera, and the neck turn that pitches the view) is checked
// against a recording of the implementation it replaced (test/fixtures/mw/mwHeadViewParity.json): for the human
// first-person arms, the beast first-person arms and the human third-person body, over six retail clips of up to 12
// frames each, the camera node's world position and axes under six combinations of look pitch, aiming focus and sink
// offset, the turn of one bone in the root's frame, and the aiming focus over time at three frame rates.
//
// The recording came from src/formats/morrowind/mwHeadView.js at the commit that moved the code out of
// mwFirstPerson.js unchanged: run readInputs and recordHeadView from mwHeadViewSweep.mjs over the retail files and
// that module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as headView from '../../../src/formats/morrowind/mwHeadView.js';
import * as firstPerson from '../../../src/formats/morrowind/mwFirstPerson.js';
import * as skin from '../../../src/formats/morrowind/mwSkin.js';
import { recordHeadView } from './mwHeadViewSweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mwHeadViewParity.json', import.meta.url), 'utf8'),
);

const api = {
  viewRef: headView.firstPersonCameraRef,
  applyNeck: headView.applyFirstPersonNeck,
  applyTurn: headView.applyRotateController,
  stepFocus: headView.aimingFactor,
  pitchShare: headView.neckRotateFactor,
  pitchMatrix: headView.rotNegX,
};
const now = JSON.parse(JSON.stringify(recordHeadView(api, inputs, skin)));

test('head view: the camera node of every rig and its pose under every pitch, focus and offset match the recording', () => {
  assert.deepEqual(Object.keys(now.rigs), Object.keys(recorded.rigs));
  for (const id of Object.keys(recorded.rigs)) {
    assert.equal(now.rigs[id].view, recorded.rigs[id].view, id);
    assert.deepEqual(now.rigs[id].clips, recorded.rigs[id].clips, id);
  }
});

test('head view: a turn in the root frame on one bone matches the recording', () => {
  for (const id of Object.keys(recorded.rigs)) assert.deepEqual(now.rigs[id].turns, recorded.rigs[id].turns, id);
});

test('head view: the aiming focus over time, the pitch share and the pitch matrix match the recording', () => {
  assert.deepEqual(now.focus, recorded.focus);
  assert.deepEqual(now.share, recorded.share);
  assert.deepEqual(now.matrices, recorded.matrices);
});

test('head view: the first-person host still exports it', () => {
  for (const name of Object.keys(headView)) assert.equal(firstPerson[name], headView[name], name);
});
