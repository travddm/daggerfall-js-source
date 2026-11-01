// PERK-TRIAL - the law's reads (src/net/professionLaw.js), the track as the service says it (server-account/src/professions.js
// trackView). The service's walk through a choice,
// its trial, a paid change and its lock is test/net/prof1_service.test.js; the page's, test/net/fb1016b_firstpick.test.js.
// Recorded in PERK-TRIAL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESPEC, SPEC_TRIAL_S, specTrialUntil, respecLockUntil, specTrialShown, specsAt } from '../../src/net/professionLaw.js';
import { trackView } from '../../server-account/src/professions.js';

const DAY = 86_400;
const NOW = 2_000_000_000;

test('PERK-TRIAL the law: a choice is on trial SPEC_TRIAL_S (a day) from when it was made, its rank\'s own; the lock is the track\'s, open from respec_at; the week and the fee stand (mutants: the trial a week; the trial\'s end inside it; the ranks crossed; the lock read at its end)', () => {
  assert.equal(SPEC_TRIAL_S, DAY);
  assert.deepEqual(RESPEC, { marks: 1000, days: 7 });
  const row = { spec50_at: NOW - 100, spec100_at: NOW - DAY, respec_at: NOW + 5 };
  assert.equal(specTrialUntil(row, 50, NOW), NOW - 100 + DAY, 'its day from its choice');
  assert.equal(specTrialUntil(row, 100, NOW), null, 'a day out at its end');
  assert.equal(specTrialUntil(row, 100, NOW - 1), NOW, 'and open a second before');
  assert.equal(specTrialUntil({ spec50_at: null }, 50, NOW), null, 'a choice made before PERK-TRIAL: no trial');
  assert.equal(specTrialUntil(row, 75, NOW), null);
  assert.equal(respecLockUntil(row, NOW), NOW + 5);
  assert.equal(respecLockUntil(row, NOW + 5), null, 'open at its end');
  assert.equal(respecLockUntil({}, NOW), null);
  assert.equal(specTrialShown({ trial: { 50: NOW + 1 } }, 50, NOW), true, 'the client\'s read of the service\'s word');
  assert.equal(specTrialShown({ trial: { 50: NOW } }, 50, NOW), false, 'run out on an open page');
  assert.equal(specTrialShown({ trial: { 50: NOW + 1 } }, 100, NOW), false);
});

test('PERK-TRIAL the track as said: `trial` its ranks on trial and until when, `lock` the next paid change\'s second - each said only where there is one; a change still written as waiting stands at once, its week the lock (mutants: the trial unsaid; the lock unsaid; a waiting change kept waiting)', () => {
  const v = trackView({ xp: 0, spec50: 'gardener', spec50_at: NOW - 10, spec100_at: NOW - 2 * DAY, respec_rank: 50, respec_at: NOW + DAY }, 'herbalism', NOW);
  assert.deepEqual([v.trial, v.lock, v.respec], [{ 50: NOW - 10 + DAY }, NOW + DAY, null]);
  const bare = trackView({ xp: 0, spec50: 'gardener' }, 'herbalism', NOW);
  assert.equal('trial' in bare || 'lock' in bare, false, 'nothing said where there is nothing');
  // AUDIT PERK-TRIAL P8 (
  // service's, across the deploy - stands at once, its week the lock
  const old = trackView({ xp: 0, spec50: 'gardener', respec_rank: 50, respec_to: 'botanist', respec_at: NOW + DAY }, 'herbalism', NOW);
  assert.deepEqual([old.specs[50], old.respec, old.lock], ['botanist', null, NOW + DAY]);
  assert.deepEqual(specsAt({ spec50: 'gardener', respec_rank: 50, respec_to: 'botanist', respec_at: NOW + 6 * DAY }, NOW), { 50: 'botanist', 100: null }, 'whatever its time');
});
