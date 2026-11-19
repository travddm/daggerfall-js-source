// The relay's reading of a foes frame's ally lists: which named allies skip the health bound, and which may ride with no
// spawn grant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAllies, namedAlly, skipsHealthBound, ridesWithoutGrant } from '../../server/src/frame-allies.ts';

const DAEDROTH = 27;
const RAT = 0;
const MAGE = 128;
const KNIGHT_CITY_WATCH = 146;

test('a summon or any other monster ally is held to the health bound, whichever list names it', () => {
  const allies = frameAllies({ cp: [1], cw: [2], al: [3] });
  assert.equal(skipsHealthBound({ i: 1, t: DAEDROTH }, allies), false, 'a summon in cp');
  assert.equal(skipsHealthBound({ i: 2, t: RAT }, allies), false, 'a monster in cw');
  assert.equal(skipsHealthBound({ i: 3, t: RAT }, allies), false, 'a monster in al');
});

test('a class-type companion or crewman skips the health bound, since its carried health may come from a higher level', () => {
  const allies = frameAllies({ cp: [1], cw: [2] });
  assert.equal(skipsHealthBound({ i: 1, t: MAGE }, allies), true);
  assert.equal(skipsHealthBound({ i: 2, t: MAGE }, allies), true);
  assert.equal(skipsHealthBound({ i: 9, t: MAGE }, allies), false, 'a class foe the frame does not name');
});

test('the allied-watch list names only a watchman, as its readers read it', () => {
  const allies = frameAllies({ al: [1, 2] });
  assert.equal(namedAlly({ i: 1, t: KNIGHT_CITY_WATCH }, allies), true);
  assert.equal(skipsHealthBound({ i: 1, t: KNIGHT_CITY_WATCH }, allies), true);
  assert.equal(ridesWithoutGrant({ i: 1, t: KNIGHT_CITY_WATCH }, allies), true);
  assert.equal(namedAlly({ i: 2, t: MAGE }, allies), false, 'a class foe in al is no ally');
  assert.equal(skipsHealthBound({ i: 2, t: MAGE }, allies), false);
  assert.equal(ridesWithoutGrant({ i: 2, t: MAGE }, allies), false);
});

test('a companion or a summon needs a grant; crew on a deck does not', () => {
  const allies = frameAllies({ cp: [1, 3], cw: [2, 3] });
  assert.equal(ridesWithoutGrant({ i: 1, t: DAEDROTH }, allies), false, 'a summon');
  assert.equal(ridesWithoutGrant({ i: 1, t: MAGE }, allies), false, 'a companion');
  assert.equal(ridesWithoutGrant({ i: 2, t: MAGE }, allies), true, 'a crewman');
  assert.equal(ridesWithoutGrant({ i: 3, t: MAGE }, allies), false, 'named in both: the companion list decides');
  assert.equal(ridesWithoutGrant({ i: 9, t: MAGE }, allies), false, 'a record no list names');
});

test('a frame with no lists, or lists that are not arrays, names no ally', () => {
  for (const frame of [{}, { cp: 'x', cw: 1, al: null }]) {
    const allies = frameAllies(frame);
    assert.equal(namedAlly({ i: 1, t: MAGE }, allies), false);
    assert.equal(skipsHealthBound({ i: 1, t: MAGE }, allies), false);
  }
});
