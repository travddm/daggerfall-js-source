// EnemySenses.PredictNextTargetPos :551-560: where the lead starts. A seen or heard target, or a lost one whose last
// prediction is out of range or whose no-lead prediction a ray reaches without meeting anything, starts from the last
// known position; a lost one that may still be where it was heading starts from the no-lead prediction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictNextTargetPos, type PredictingFoe } from '../../../src/characters/enemy/target-prediction.ts';

const SIGHT = 100;

/** A still foe at the origin whose target has not moved since the last pass, so the lead is the start position. */
function foe(over: Partial<PredictingFoe> & { wallAhead?: boolean }): PredictingFoe {
  const { wallAhead = false, ...rest } = over;
  return {
    inSight: false,
    _inEarshot: false,
    predictedTargetPos: [0, 0, 5],
    lastKnownTargetPos: [0, 0, 5],
    oldLastKnownTargetPos: [0, 0, 5],
    lastPositionDiff: [0, 0, 0],
    _predictedTargetPosWithoutLead: [3, 0, 5],
    _targetPosPredictTimer: 0,
    collider: { raycast: () => (wallAhead ? 4 : Infinity) },
    _centre: () => [0, 1, 0],
    _targetCentreOffset: () => 1,
    ...rest,
  };
}

test('a lost target that may still be where it was heading: the lead starts from the no-lead prediction', () => {
  assert.deepEqual(predictNextTargetPos(foe({ wallAhead: true }), 5, SIGHT), [3, 1, 5]);
});

test('a seen or heard target, or a clear ray, starts from the last known position', () => {
  assert.deepEqual(predictNextTargetPos(foe({ wallAhead: true, inSight: true }), 5, SIGHT), [0, 1, 5]);
  assert.deepEqual(predictNextTargetPos(foe({ wallAhead: true, _inEarshot: true }), 5, SIGHT), [0, 1, 5]);
  assert.deepEqual(predictNextTargetPos(foe({ wallAhead: false }), 5, SIGHT), [0, 1, 5], 'the ray met nothing');
});

test('a last prediction past sight range starts from the last known position; the foe radius wins over the default', () => {
  assert.deepEqual(
    predictNextTargetPos(foe({ wallAhead: true, predictedTargetPos: [0, 0, 200] }), 5, SIGHT),
    [0, 1, 5],
  );
  assert.deepEqual(predictNextTargetPos(foe({ wallAhead: true, sightRadius: 2 }), 5, SIGHT), [0, 1, 5]);
});
