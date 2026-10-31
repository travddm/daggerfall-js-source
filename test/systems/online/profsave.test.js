// PROF-SAVE (2026-09-29, Mac, asked whether to switch Marks and the professions on: "Board now, rest after fixes"; MERGE
// 2's open question 2, bible/06-Systems/Online-Arc.md PROF-SAVE): A PROFESSIONS ACT THAT CHANGES THE SAVE IS SAVED AT
// ONCE, as a trade is. The law (systems/online/onlineCheckpoint.js createSaveSoon): every change of one task is ONE checkpoint on
// the next, the checkpoint handed in once the host has built it, a change made before it saved then. The host
// (scenes/world.js): a withdrawal from the Stores, a craft's pieces and its fee, a smelt's fee, a market piece minted,
// listed away, put back or settled away each ask it; the Bank's Marks sale asks it through the credit the modes build
// (systems/banking.js marksSaleCredit's `saved`, scenes/worldModes.js - a sale and a kept sale settled).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSaveSoon } from '../../../src/systems/online/onlineCheckpoint.js';
import { marksSaleCredit } from '../../../src/systems/banking.js';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

/** A queue of next tasks a pin runs by hand. */
function tasks() {
  const q = [];
  return { schedule: (run) => { q.push(run); }, next() { const run = q.shift(); run?.(); return !!run; }, get size() { return q.length; } };
}

test('PROF-SAVE the law: every change of one task is ONE checkpoint on the next; a change after it is another; none is asked with nothing changed; a change made before the checkpoint is handed in is saved then, once (mutants: a checkpoint a change; the change before it lost; saved at once, inside the act)', () => {
  const q = tasks();
  let saves = 0;
  const s = createSaveSoon(q.schedule);
  s.ready(() => { saves++; });
  assert.equal(q.size, 0, 'nothing changed: nothing asked');
  s.changed(); s.changed(); s.changed();
  assert.deepEqual([saves, q.size, s.due], [0, 1, true], 'three changes in one task: one checkpoint asked, not yet run - never inside the act');
  q.next();
  assert.deepEqual([saves, s.due], [1, false], 'the next task: ONE checkpoint');
  assert.equal(q.next(), false, 'and no second');
  s.changed();
  q.next();
  assert.equal(saves, 2, 'a change after it is its own checkpoint');
  // BEFORE THE CHECKPOINT IS BUILT: a kept act settled as the page boots
  const b = tasks();
  let early = 0;
  const e = createSaveSoon(b.schedule);
  e.changed();
  b.next();
  assert.deepEqual([early, e.due], [0, true], 'no checkpoint to run yet: the change is kept');
  e.ready(() => { early++; });
  assert.equal(b.size, 1, 'handed in: asked at once');
  b.next();
  assert.deepEqual([early, e.due], [1, false], 'saved then, once');
  const idle = tasks();
  createSaveSoon(idle.schedule).ready(() => { throw new Error('nothing changed'); });
  assert.equal(idle.size, 0, 'handed in with nothing changed: nothing asked');
});

test('PROF-SAVE the Bank: a Marks sale\'s credit tells `saved` once the gold is in the account - a credit of nothing, or none, tells nothing; the modes hand the host\'s saveSoon to the sale and to the kept sale\'s settle (mutants: saved unasked; saved for nothing)', () => {
  const accounts = [{ accountGold: 0 }, { accountGold: 10 }];
  let saved = 0;
  const credit = marksSaleCredit(() => accounts, () => 1, () => { saved++; });
  assert.equal(credit(250), 260);
  assert.equal(saved, 1, 'the gold in the account: the save asked');
  assert.equal(credit(40, 0), 40, 'a kept sale into the account it was made at');
  assert.equal(saved, 2);
  for (const nothing of [0, -5, 1.5, null]) credit(nothing);
  assert.equal(saved, 2, 'no gold, no save asked');
  assert.equal(marksSaleCredit(() => accounts, () => 1)(5), 265, 'with no `saved`, the credit it always was');
});

