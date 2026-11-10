import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerHalfOfStealthCheck } from '../../../src/characters/enemy/stealth-check.ts';

test('a player under half speed is not checked on odd minutes (EnemySenses.cs:635-638)', () => {
  const ai = { detected: false, hasEncounteredPlayer: true };
  assert.equal(playerHalfOfStealthCheck(ai, { movingLessThanHalfSpeed: true }, 5), false, 'the last answer stands');
  ai.detected = true;
  assert.equal(playerHalfOfStealthCheck(ai, { movingLessThanHalfSpeed: true }, 5), true);
  assert.equal(playerHalfOfStealthCheck(ai, { movingLessThanHalfSpeed: true }, 6), undefined, 'an even minute rolls');
});

test('an encountered player moving faster is detected outright (EnemySenses.cs:639-641)', () => {
  assert.equal(playerHalfOfStealthCheck({ detected: false, hasEncounteredPlayer: true }, {}, 4), true);
  assert.equal(playerHalfOfStealthCheck({ detected: false, hasEncounteredPlayer: false }, {}, 4), undefined);
});

test("the player's Stealth tallies once a minute across all foes (EnemySenses.cs:643-648)", () => {
  let tallies = 0;
  const senses = { sharedStealth: { minute: -1 }, tallyStealth: () => tallies++ };
  const ai = { detected: false, hasEncounteredPlayer: false };
  playerHalfOfStealthCheck(ai, senses, 8);
  playerHalfOfStealthCheck(ai, senses, 8);
  assert.equal(tallies, 1, 'two foes in one minute');
  playerHalfOfStealthCheck(ai, senses, 9);
  assert.equal(tallies, 2);
  assert.equal(senses.sharedStealth.minute, 9);
  const skipped = { sharedStealth: { minute: -1 }, tallyStealth: () => tallies++, movingLessThanHalfSpeed: true };
  playerHalfOfStealthCheck(ai, skipped, 11);
  assert.equal(tallies, 2, 'a skipped minute tallies nothing');
});
