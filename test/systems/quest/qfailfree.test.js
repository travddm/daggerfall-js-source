// A quest's end online (Quest.cs EndQuest): DFU's -2 on failure, propagated, by default; a failure that costs
// its faction nothing is the server profile's option (quest.failureFree). A success's +5 is DFU's on both lanes.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quest } from '../../../src/systems/quest/quest.js';
import { playByRules } from '../../profileRules.mjs';   // a server profile's rule keys, for one test

function ended({ online, success }) {
  const reps = [];
  const q = new Quest({ hooks: { sharedClock: () => online, changeReputation: (f, a, p) => reps.push([f, a, p]) } });
  q.factionId = 42;
  q.questSuccess = success;
  q.endQuest();
  return reps;
}

test('offline a failed quest costs DFU\'s -2, propagated', () => {
  assert.deepEqual(ended({ online: false, success: false }), [[42, -2, true]]);
});

test("online a failed quest costs DFU's -2, propagated, by default", () => {
  assert.deepEqual(ended({ online: true, success: false }), [[42, -2, true]]);
});

test("with the server profile's option, online a failed quest costs its faction nothing; offline DFU's -2 stands", (t) => {
  playByRules(t, { 'quest.failureFree': true });
  assert.deepEqual(ended({ online: true, success: false }), []);
  assert.deepEqual(ended({ online: false, success: false }), [[42, -2, true]]);
  assert.deepEqual(ended({ online: true, success: true }), [[42, 5, true]]);
});

test('a success pays DFU\'s +5 on both lanes', () => {
  assert.deepEqual(ended({ online: false, success: true }), [[42, 5, true]]);
  assert.deepEqual(ended({ online: true, success: true }), [[42, 5, true]]);
});
