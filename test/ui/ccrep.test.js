// CC-REP + CC-GRID + CC-STEP (2026-09-16, Ember on the Discord, relayed
// by - "the custom class building menu being in a list is a bit
// clunky ... having to scroll around to see all the options" - "the +
// and - symbols on the buttons seem a bit small".
//
// CC-REP: CreateCharReputationWindow was the one classic window the
// enhanced view did not draw (AUDIT 39 recorded it): its only door was
// a pixel hit on a 168x189 panel. The flow has a stepping door now -
// the same value law as a bar click - and the view draws the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repStep, repClick, repPointsToDistribute, REP_GROUPS, REP_MAX } from '../../src/systems/customClass.js';
import { ChargenFlow } from '../../src/ui/chargen.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');

test('CC-REP repStep: one integer step on one group, clamped to the bar\u2019s reach, negative zero normalised, an unknown group refused (mutant: the clamp or the group test dropped)', () => {
  const reps = { merchants: 0, peasants: 0, scholars: 0, nobility: 0, underworld: 0 };
  assert.equal(repStep(reps, 'merchants', 1), 1);
  assert.equal(repStep(reps, 'merchants', -1), -1);
  assert.equal(repStep({ ...reps, nobility: REP_MAX }, 'nobility', 1), REP_MAX, 'no higher than the bar');
  assert.equal(repStep({ ...reps, nobility: -REP_MAX }, 'nobility', -1), -REP_MAX, 'no lower than the bar');
  assert.ok(Object.is(repStep({ ...reps, scholars: 1 }, 'scholars', -1), 0), 'back to a plain zero, never -0 (the ledger is a C# short)');
  assert.equal(repStep(reps, 'guilds', 1), null, 'no such group');
  assert.equal(REP_MAX, 10, 'a 50px bar in 5px steps');
  // the same reach as the bar click: the top of the bar is +10
  assert.equal(repClick(10, 26).value, REP_MAX);
  assert.equal(repPointsToDistribute({ ...reps, merchants: 3, underworld: -1 }), -2, 'the ledger is the negated sum');
});

test('CC-REP the flow: the builder opens the window, steps move the ledger, the exit gate holds until it balances, the reopened window\u2019s stale zero is DFU\u2019s own quirk (mutant: the gate reads a fresh sum)', () => {
  const careers = Array.from({ length: 18 }, (_, i) => ({ name: `C${i}`, career: { name: `C${i}` } }));
  const f = new ChargenFlow(careers, () => 0);
  f.state = 'class';
  f.classListIndex = f.careers.length;
  f.useClass();
  assert.equal(f.state, 'customClass');
  const c = f.custom;
  assert.equal(f.applyHit({ customRep: true }), true);
  assert.equal(c.sub, 'rep', 'ReputationButton opens the window');
  assert.equal(c.repPoints, 0);
  f.applyHit({ repStep: { group: 'merchants', dir: 1 } });
  f.applyHit({ repStep: { group: 'merchants', dir: 1 } });
  assert.equal(c.reps.merchants, 2);
  assert.equal(c.repPoints, -2, 'two given, two to take');
  f.applyHit({ repExit: true });
  assert.equal(c.sub, 'rep', 'unbalanced: the window stays');
  assert.ok(c.box, 'and says so (TEXT.RSC 303)');
  c.box = null;
  f.applyHit({ repStep: { group: 'underworld', dir: -1 } });
  f.applyHit({ repStep: { group: 'peasants', dir: -1 } });
  assert.equal(c.repPoints, 0);
  f.applyHit({ repExit: true });
  assert.equal(c.sub, null, 'balanced: the window lets go');
  assert.deepEqual(c.reps, { merchants: 2, peasants: -1, scholars: 0, nobility: 0, underworld: -1 });
  f.applyHit({ repStep: { group: 'nowhere', dir: 1 } });
  assert.deepEqual(c.reps, { merchants: 2, peasants: -1, scholars: 0, nobility: 0, underworld: -1 }, 'an unknown group changes nothing');
  // DFU's quirk, kept: the reopened window's field is 0 until a bar is touched
  f.applyHit({ repStep: { group: 'scholars', dir: 1 } });   // (outside the window: still the same ledger)
  f.applyHit({ customRep: true });
  assert.equal(c.repPoints, 0, 'reopened: the stale field, not the sum');
  f.applyHit({ repExit: true });
  assert.equal(c.sub, null, 'and classic really does let you leave it unbalanced this way');
});

