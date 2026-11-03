// RIDE-POV. The Morrowind body
// has no saddle; the sprite body does. So the Morrowind lane stays in the
// head while the host says `riding`: a rider in third person is put there
// on the frame, and the wheel cannot take one out. The rule lives in the
// view seam, off the `riding` every host already hands it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mwViewFrame, mwViewWheel, mwViewPendingClicks, mwViewFirstPerson, setEotbBodyReady, setEotbDrawBody, eotbLane } from '../../src/player/mwView.js';
import { mwCamera } from '../../src/player/mwCamera.js';
import { fpArm } from '../../src/combat/fpArm.js';
import { eotbCamera } from '../../src/player/eyeOfTheBeholder/eotbCamera.js';
import { setModSetting, _resetModSettings } from '../../src/systems/modSettings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const EYE = [1, 1.6, 2];
const frame = (riding) => mwViewFrame({ fpEye: EYE, feet: [1, 0, 2], yaw: 0, pitch: 0, dt: 1 / 60, riding });

/** The seam as a fresh session has it, with a Morrowind third-person body the rig will SERVE (stubbed, as
 *  eotb_view.test.js stubs canThirdPerson): without it the frame's own fallback puts every third-person frame
 *  back in the head and the saddle's rule would be untestable by behaviour. */
function arm() {
  setEotbBodyReady(null); setEotbDrawBody(null);
  eotbCamera.loadSettings(null); eotbCamera.toggleOffset(false);
  _resetModSettings();
  const real = { canThirdPerson: fpArm.canThirdPerson, setViewMode: fpArm.setViewMode };
  fpArm.canThirdPerson = () => true;
  fpArm.setViewMode = () => true;
  mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
  frame(false);   // drain anything a previous test left queued
  return () => { fpArm.canThirdPerson = real.canThirdPerson; fpArm.setViewMode = real.setViewMode; mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() }); frame(false); };
}

test('RIDE-POV: a rider in third person is put in the head on the frame, keeps the zoom distance, and is left there on dismount (the wheel is where it was)', () => {
  const restore = arm();
  try {
    mwCamera.restore({ firstPerson: false, baseDistance: 300 });
    let out = frame(false);
    assert.equal(mwCamera.mode(), 'third', 'on foot, third person stands (the body serves)');
    assert.equal(out.thirdPerson, true);
    out = frame(true);
    assert.equal(mwCamera.mode(), 'first', 'in the saddle: into the head');
    assert.equal(out.thirdPerson, false);
    assert.deepEqual([...out.eye], EYE, 'and the frame\'s eye is the host\'s own first-person eye');
    assert.equal(mwCamera.baseDistance(), 300, 'the distance survives for the wheel after the ride');
    frame(false);
    assert.equal(mwCamera.mode(), 'first', 'dismounted: not put back - a transition, as MAP-POV is');
  } finally { restore(); }
});

test('RIDE-POV: the wheel cannot take a rider out of the head, and a notch queued before the saddle is dropped, not left to fire on dismount', () => {
  const restore = arm();
  try {
    frame(false);
    assert.equal(mwViewWheel(+100), true, 'on foot, a wheel down leaves the head (the body serves)');
    assert.equal(mwViewPendingClicks(), -1);
    frame(true);
    assert.equal(mwViewPendingClicks(), 0, 'the saddle drops the queued notch before it can cross');
    assert.equal(mwCamera.mode(), 'first');
    assert.equal(mwViewWheel(+100), false, 'in the saddle the wheel is refused');
    assert.equal(mwViewPendingClicks(), 0, 'and queues nothing');
    assert.equal(mwViewWheel(-100), true, 'a wheel up is still taken - it queues a zoom-in the head ignores, as it always did');
    frame(true);
    assert.equal(mwViewPendingClicks(), 0); assert.equal(mwCamera.mode(), 'first');
    frame(false);
    assert.equal(mwViewWheel(+100), true, 'dismounted, the wheel is the player\'s again');
    assert.equal(mwViewPendingClicks(), -1);
  } finally { restore(); }
});

test('RIDE-POV: the sprite body still rides - the EOTB lane is untouched by the saddle', () => {
  const restore = arm();
  try {
    fpArm.canThirdPerson = () => false;   // no Morrowind body: the sprite answers
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setEotbBodyReady(() => true);
    assert.equal(eotbLane(), true);
    eotbCamera.toggleOffset(true);
    frame(true);
    assert.equal(eotbCamera.thirdPerson(), true, 'EOTB has saddle states of its own: a riding sprite stays third person');
    assert.equal(mwViewFirstPerson(), true, 'and the map\'s door still moves it (MAP-POV)');
    assert.equal(eotbCamera.thirdPerson(), false);
  } finally { restore(); }
});

