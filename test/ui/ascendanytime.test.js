import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAT_KEYS_ORDER } from '../../src/systems/chargen.js';
import {
  viewOnlyScreen, levelUpFrame, levelUpCrown, levelProgress, rolloutRows, rolloutPool, canAscend,
  raiseAt, lowerAt, ascend,
} from '../../src/ui/levelUp/levelUpView.js';
import { crownTitle, askView } from '../../src/ui/enhanced/enhancedLevelUp.js';

// ASCEND-ANYTIME: the Ascension screen opens whenever the player asks. Nothing owed = a VIEW of the stars:
// a pool of zero, no star moves, Close, and no level / stats / pool is ever written.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const hero = () => ({
  name: 'Tester', level: 7, race: 'Breton', career: { name: 'Mage' },
  stats: Object.fromEntries(STAT_KEYS_ORDER.map((k, i) => [k, 40 + i])),
  readyToLevelUp: false, pendingLevel: null, pendingBonusPool: null,
  currentLevelUpSkillSum: 100, startingLevelUpSkillSum: 80,
});

test('ASCEND-ANYTIME: the view-only screen has nothing to spend and no star will move', () => {
  const e = hero();
  const s = viewOnlyScreen(e);
  assert.equal(rolloutPool(s), 0);
  assert.ok(rolloutRows(s).every((r) => !r.canRaise && !r.canLower), 'no star can be raised or lowered');
  for (const k of STAT_KEYS_ORDER) {
    assert.equal(raiseAt(s, k), false);
    assert.equal(lowerAt(s, k), false);
  }
  assert.deepEqual(s.working, e.stats, 'it reads the character\'s own numbers');
});

test('ASCEND-ANYTIME: it WRITES NOTHING - no level, no stats, no bonus pool, and confirm only closes it', () => {
  const e = hero();
  const before = JSON.stringify(e);
  const s = viewOnlyScreen(e);
  for (const k of STAT_KEYS_ORDER) { raiseAt(s, k); lowerAt(s, k); }
  assert.equal(canAscend(s), true, 'the button is open: it closes');
  assert.equal(ascend(s), true);
  assert.equal(s.done, true);
  assert.equal(JSON.stringify(e), before, 'entity byte-for-byte unchanged (pendingBonusPool included: no free reroll)');
});

test('ASCEND-ANYTIME: the crown promises no level, and the window says so', () => {
  const e = hero();
  const s = viewOnlyScreen(e);
  const crown = levelUpCrown(e, s);
  assert.equal(crown.viewOnly, true);
  assert.equal(crown.to, crown.from);
  assert.equal(crownTitle(crown), 'Level 7', 'no arrow to a level that is not coming');
  assert.equal(levelUpFrame(e, s).crown.to, 7);
  assert.equal(askView(), 'Your attributes');
  // A real owed level still reads its arrow.
  e.pendingLevel = 8;
  assert.equal(crownTitle(levelUpCrown(e, { pool: 3, base: e.stats, working: e.stats })), 'Level 7 → 8');
});

test('ASCEND-ANYTIME: the view reads the skill-sum bar', () => {
  const e = hero();
  assert.equal(levelProgress(e, viewOnlyScreen(e)).label, 'Skill progress to next level');
});

test('ASCEND-ANYTIME the door\'s rollout (levelUpScreenFor): none with nothing owed (the page draws the view); a level owed the rollout - and its bonus points the SAME on a second open, so a level-up left and come back to is no re-roll', async () => {
  const { levelUpScreenFor } = await import('../../src/ui/charSheetDoor.js');
  const { LevelUpScreen } = await import('../../src/ui/charsheet.js');
  const stats = Object.fromEntries(STAT_KEYS_ORDER.map((k) => [k, 50]));
  const e = { isPlayer: true, level: 4, pendingLevel: 5, readyToLevelUp: false, stats: { ...stats }, skills: new Array(35).fill(30), career: { primarySkills: [], majorSkills: [], minorSkills: [] }, maxHealth: 40, health: 40 };
  assert.equal(levelUpScreenFor(e), null, 'nothing owed: no rollout');
  e.readyToLevelUp = true;
  const first = levelUpScreenFor(e);
  assert.ok(first instanceof LevelUpScreen, 'DFU\'s own rollout');
  const again = levelUpScreenFor(e);
  assert.equal(again.pool, first.pool, 'the bonus pool remembered on the character (advancement.js bonusPoolFor): leaving the tab re-rolls nothing');
  // AUDIT GROWTH LANE5-18: ...and read off the character, not equal by chance (two draws of 4-6 match one time in three)
  assert.equal(typeof e.pendingBonusPool, 'number', 'drawn once onto the character');
  assert.equal(first.pool, e.pendingBonusPool, 'the screen\'s pool is the character\'s');
});

