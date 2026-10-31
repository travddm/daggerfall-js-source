// ENEMY-PACE: the slowest pace the clock runs at with enemies holding a journey. RATE-LAW (2026-10-04, Mac: "Remove
// travel options dials"): the pace is FIXED now - the panel's near-enemies stepper is gone - and the law has one home,
// systems/travel/travelThreat.js `foePaced`, which both of the host's governed paths call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JOURNEY_FOE_PACE, foePaced } from '../../../src/systems/travel/travelThreat.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

test('ENEMY-PACE x RATE-LAW: the enemies\' cap is floored at the fixed pace on both governed paths, and no stepper is wired (mutants: a path left on the raw cap, the floor moved)', () => {
  assert.equal(JOURNEY_FOE_PACE, 5, 'the stepper\'s own default, kept');
});

test('ENEMY-PACE floor arithmetic: eased toward the enemy, never under the pace, never over what was asked', () => {
  assert.equal(foePaced(1, 60), 5, 'an enemy inside its reach: the pace, not walking pace');
  assert.equal(foePaced(30, 100), 30, 'eased, not cut');
  assert.equal(foePaced(Infinity, 100), 100, 'nothing near: the ground\'s rate');
  assert.equal(foePaced(1, 3), 3, 'never above what was asked');
});
