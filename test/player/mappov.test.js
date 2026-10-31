// MAP-POV (2026-09-20, Mac: "If you're in 3rd person and decide to use the
// map, it should transition you to first person and then open the map.
// Both for the morrowind/non morrowind").
//
// What Mac saw: the enhanced map on the Morrowind model showed the painted
// sprite. Driven through the REAL weapon rig with the world host's holder
// verbatim, the hands lane took the sheet in every first-person condition
// (sheathed, drawn, the widgets on) and never in third person - the arm's
// draw predicate is first-person only, and AUDIT-MAP2 decided the
// third-person body holds nothing. He was in third person. So the map
// goes into the head first, for whichever body answers, and the seam is
// the one home for that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mwViewFirstPerson, eotbLane, setEotbBodyReady, setEotbDrawBody } from '../../src/player/mwView.js';
import { mwCamera } from '../../src/player/mwCamera.js';
import { fpArm } from '../../src/combat/fpArm.js';
import { eotbCamera } from '../../src/player/eyeOfTheBeholder/eotbCamera.js';
import { setModSetting, _resetModSettings } from '../../src/systems/modSettings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/** The seam as a fresh session has it (eotb_view.test.js's reset). */
function reset() {
  setEotbBodyReady(null);
  setEotbDrawBody(null);
  mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
  eotbCamera.loadSettings(null);
  eotbCamera.toggleOffset(false);
  _resetModSettings();
}

test('MAP-POV: the Morrowind lane - third person goes into the head at once, keeps its zoom distance, moves the rig, and a view already first is left alone', () => {
  reset();
  try {
    mwCamera.restore({ firstPerson: false, baseDistance: 300 });
    assert.equal(mwCamera.mode(), 'third');
    assert.equal(eotbLane(), false, 'the Morrowind camera answers');
    assert.equal(mwViewFirstPerson(), true, 'the view moved');
    assert.equal(mwCamera.mode(), 'first', 'into the head NOW - not queued behind the upper body, the map opens this frame');
    assert.equal(mwCamera.queued(), null, 'nothing left queued to undo it');
    assert.equal(mwCamera.baseDistance(), 300, 'the remembered distance survives: a wheel out lands where the player left the camera');
    assert.equal(fpArm.viewMode(), 'first', 'the rig is first-person before the window\'s first tick asks the arm');
    assert.equal(mwViewFirstPerson(), false, 'already in the head: nothing to move');
    assert.equal(mwCamera.mode(), 'first');
  } finally { reset(); }
});

test('MAP-POV: the Eye of the Beholder lane - the mod\'s own ToggleOffset(false), and the Morrowind camera untouched', () => {
  reset();
  try {
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setEotbBodyReady(() => true);
    assert.equal(eotbLane(), true, 'the sprite body answers');
    eotbCamera.toggleOffset(true);
    assert.equal(eotbCamera.thirdPerson(), true);
    assert.equal(mwViewFirstPerson(), true, 'the view moved');
    assert.equal(eotbCamera.thirdPerson(), false, 'through the mod\'s own toggle');
    assert.equal(eotbCamera.mode(), 'first');
    assert.equal(mwCamera.mode(), 'first', 'the other camera was never third and is not touched');
    assert.equal(mwViewFirstPerson(), false, 'already in the head');
  } finally { reset(); }
});

