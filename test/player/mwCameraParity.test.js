// The Morrowind camera was rewritten without the third-party source it had been ported from. These tests replay fixed
// sessions (test/player/mwCameraSweep.mjs) on the current camera and compare every observable with a recording of the
// implementation it replaced (test/fixtures/mw/mwCameraParity.json), so the hosts see the same camera as before.
//
// The recording came from src/player/mwCamera.js at commit 0ff2a7ba66 (origin/feat/tamriel-review before the rewrite):
// copy that file out with `git show`, point its two imports at the repository, run makeSession and recordSession
// from mwCameraSweep.mjs over sessions 0-49 and makeFocalSession and recordFocalSession over sessions 0-39, and
// write { sessions, focal } as JSON. The new code was written from the module's exports, its call sites and its
// existing tests, and from the old module's outputs; no third-party engine source was read.
//
// Not covered by the recording, and different on purpose:
// - Wheel input that is not a whole number of clicks (the hosts send whole notches only).
// - Changing the focal shift's speed while a transition is under way without retargeting it. The camera always sets
//   the speed together with a new target; the two differ by about 1e-2 units in that case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFocalOffset, createMwCamera } from '../../src/player/mwCamera.js';
import { makeFocalSession, makeSession, recordFocalSession, recordSession } from './mwCameraSweep.mjs';

const recording = JSON.parse(readFileSync(new URL('../fixtures/mw/mwCameraParity.json', import.meta.url), 'utf8'));

const closeWithin = (tolerance) => (actual, expected) => {
  if (typeof expected !== 'number') return actual === expected;
  return typeof actual === 'number' && Math.abs(actual - expected) <= tolerance + 1e-9 * Math.abs(expected);
};

/** Index of the first value that differs, as a readable message, or null. */
function firstDifference(actual, expected, close = closeWithin(1e-8)) {
  for (let step = 0; step < expected.length; step++) {
    if (actual[step].length !== expected[step].length) {
      return `step ${step}: ${actual[step].length} values against ${expected[step].length}`;
    }
    for (let i = 0; i < expected[step].length; i++) {
      if (!close(actual[step][i], expected[step][i])) {
        return `step ${step}, value ${i}: ${actual[step][i]} against ${expected[step][i]}`;
      }
    }
  }
  return null;
}

test('camera sessions: modes, zoom, queue, shoulder shift, casts, eye and focal point match the recording', () => {
  assert.equal(recording.sessions.length, 50);
  recording.sessions.forEach((expected, index) => {
    const actual = recordSession(createMwCamera(), makeSession(index));
    assert.equal(actual.length, expected.length);
    assert.equal(firstDifference(actual, expected), null, `session ${index}`);
  });
});

test('focal shift sessions: steps, retargets, speed changes and instant jumps match the recording', () => {
  assert.equal(recording.focal.length, 40);
  recording.focal.forEach((expected, index) => {
    const actual = recordFocalSession(createFocalOffset(), makeFocalSession(index));
    assert.equal(firstDifference(actual, expected, closeWithin(1e-8)), null, `focal session ${index}`);
  });
});

test('a retarget keeps the shift moving the way it was going, then pays the carry back', () => {
  const offset = createFocalOffset();
  offset.setSpeed(5);
  offset.setTarget([30, -10]);
  offset.instant();
  offset.step(1 / 60);
  offset.setTarget([0, 15]);
  for (let i = 0; i < 4; i++) offset.step(1 / 60);
  const before = [...offset.current()];
  offset.setTarget([0, 15]);
  const moved = [];
  let last = before;
  for (let i = 0; i < 6; i++) {
    const now = [...offset.step(1 / 60)];
    moved.push(Math.hypot(now[0] - last[0], now[1] - last[1]));
    last = now;
  }
  assert.ok(moved[0] > moved[1] * 0.9, 'the first step after the retarget is as fast as the one before it');
  for (let i = 0; i < 200; i++) offset.step(1 / 60);
  assert.ok(Math.hypot(offset.current()[0], offset.current()[1] - 15) < 1e-6, 'and the shift still ends on its target');
});
