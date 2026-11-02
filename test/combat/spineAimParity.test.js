// The spine-aim code was rewritten without the third-party source it had been ported from. These tests run the
// current code over the inputs of test/combat/spineAimSweep.mjs and compare with a recording of the implementation it
// replaced (test/fixtures/mw/spineAimParity.json): the pitch weight over every combination of state, weapon type,
// animation group, playhead, key times and follow-through, and the spine bones' world pose on the retail biped over a
// range of look pitches.
//
// The recording came from src/combat/spineAim.js at commit 0ff2a7ba66 (origin/feat/tamriel-review before the rewrite):
// run pitchFactorDigest and recordSpineAim from spineAimSweep.mjs with that file's exports and write { factor, aim } as
// JSON. No third-party engine source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import {
  buildSkeleton,
  skeletonSpaceMatrices,
  injectSkeletonNodes,
  GRAPH_ROOT,
} from '../../src/formats/morrowind/mwSkin.js';
import { offWeaponBoneAddon } from '../../src/combat/twoHands/mirrorRig.js';
import { applySpineAim, spineAimSlot, spinePitchFactor } from '../../src/combat/spineAim.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';
import { pitchFactorDigest, recordSpineAim } from './spineAimSweep.mjs';

const recording = JSON.parse(readFileSync(new URL('../fixtures/mw/spineAimParity.json', import.meta.url), 'utf8'));
const space = (skeleton, pose, rootRef) => skeletonSpaceMatrices(skeleton, pose, rootRef);
const file = parseNif(retailSkeleton());
const skeleton = buildSkeleton(file);
injectSkeletonNodes(skeleton, offWeaponBoneAddon(skeleton, GRAPH_ROOT, space, file));

test('the pitch weight is the same for every state, weapon type, group, time, key pair and follow-through', () => {
  assert.deepEqual(pitchFactorDigest(spinePitchFactor), recording.factor);
});

test('the spine bones end in the same pose at every pitch', () => {
  const now = recordSpineAim(applySpineAim, skeleton, space, GRAPH_ROOT);
  assert.equal(now.length, recording.aim.length);
  now.forEach((entry, i) => {
    const expected = recording.aim[i];
    assert.equal(entry.turned, expected.turned, `pitch ${entry.pitch}: bones turned`);
    entry.bones.forEach((bone, b) => {
      bone.forEach((value, k) => {
        assert.ok(Math.abs(value - expected.bones[b][k]) < 1e-5, `pitch ${entry.pitch}, bone ${b}, value ${k}`);
      });
    });
  });
});

test('the slot is a step that applies the aim, and nothing when there is no pitch to apply', () => {
  for (const pitch of [0, NaN, undefined, null]) assert.equal(spineAimSlot(pitch), null, `${pitch}`);
  const slot = spineAimSlot(0.3);
  assert.equal(typeof slot, 'function');
  const viaSlot = new Map();
  const direct = new Map();
  assert.equal(slot(skeleton, viaSlot, GRAPH_ROOT, space), 2);
  applySpineAim(skeleton, direct, GRAPH_ROOT, space, 0.3);
  const a = space(skeleton, viaSlot, GRAPH_ROOT);
  const b = space(skeleton, direct, GRAPH_ROOT);
  for (const [node, matrix] of a) assert.deepEqual([...matrix.a], [...b.get(node).a]);
});
