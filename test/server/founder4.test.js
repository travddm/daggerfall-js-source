// FOUNDER4. FOUNDER3 reads
// Founder off when an account FIRST PLAYED, its row's first contact - and could not reach a player whose play before the
// cutoff is on ANOTHER row: a guest in one browser who registered in another place (the desktop app is its own origin,
// so its own storage). The service links the two through a character both rows hold - its id is minted on the
// player's machine and never told to anyone else - and records the earlier first play as `first_played_at`, which
// `firstPlayed` reads. Here: the law. FOUNDER5 (test/server/founder5.test.js) drives the link itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titlesHeld, equipRefusal, FOUNDER_UNTIL } from '../../server-account/src/titles.js';

const DAY = 24 * 60 * 60;
const CUT = Date.UTC(2026, 8, 25, 12) / 1000;   // FOUNDER5 (

// ── THE LAW ─────────────────────────────────────────────────────────

test('FOUNDER4 the law: a registered account whose first_played_at is by the cutoff holds Founder whenever its own row was first seen; one past it holds none; a stamp that is not a number is no stamp; a guest none until it registers; the instant did not move (mutants: firstPlayed blind to the column)', () => {
  const late = { handle: 'Linked', created_at: CUT + 9 * DAY, registered_at: CUT + 9 * DAY };
  assert.deepEqual(titlesHeld(late, {}), [], 'first seen after the cutoff, nothing linked: none, as FOUNDER3 left it');
  assert.deepEqual(titlesHeld({ ...late, first_played_at: CUT - 4 * DAY }, {}), ['founder'], 'a row it shares a character with first played before the cutoff');
  assert.equal(equipRefusal('founder', { ...late, first_played_at: CUT - 4 * DAY }, {}), null, 'and it may be worn');
  assert.deepEqual(titlesHeld({ ...late, first_played_at: CUT }, {}), ['founder'], 'in the cutoff second');
  assert.deepEqual(titlesHeld({ ...late, first_played_at: CUT + 1 }, {}), [], 'a second past it: none');
  assert.deepEqual(titlesHeld({ ...late, first_played_at: null }, {}), [], 'NULL - nothing linked earlier - changes nothing');
  assert.deepEqual(titlesHeld({ ...late, first_played_at: 'x' }, {}), [], 'a stamp that is not a number is no stamp');
  assert.deepEqual(titlesHeld({ ...late, handle: null, registered_at: null, first_played_at: CUT - 4 * DAY }, {}), [], 'a guest holds none, linked or not');
  assert.deepEqual(titlesHeld({ handle: 'Since', created_at: CUT - DAY, registered_at: CUT + DAY, first_played_at: CUT + 5 * DAY }, {}), ['founder'], 'a later link never takes it from a row that first played in time');
  assert.equal(FOUNDER_UNTIL, CUT, 'the instant FOUNDER5 moved later, so nobody lost it');
});
