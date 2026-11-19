// The relay's reading of a foes frame's ally lists: the record the health bound reads for a named ally, and which allies
// may ride with no spawn grant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAllies, namedAlly, healthBoundRecord, ridesWithoutGrant } from '../../server/src/frame-allies.ts';
import { foeStatsRefusal } from '../../src/net/foeBounds.js';
import { FOE_LEVEL_MAX } from '../../src/net/wire.js';

const DAEDROTH = 27;
const RAT = 0;
const MAGE = 128;
const KNIGHT_CITY_WATCH = 146;

const refused = (record: object, allies: ReturnType<typeof frameAllies>): boolean =>
  foeStatsRefusal(healthBoundRecord(record, allies), { lane: 'street', camp: false }) != null;

test('a summon or any other monster ally is read as it is, so the bound refuses a forged one', () => {
  const allies = frameAllies({ cp: [1], cw: [2], al: [3] });
  const summon = { i: 1, t: DAEDROTH, k: 99_999, h: 99_999 };
  assert.equal(healthBoundRecord(summon, allies), summon);
  assert.equal(refused(summon, allies), true, 'a summon in cp');
  assert.equal(refused({ i: 2, t: RAT, k: 99_999 }, allies), true, 'a monster in cw');
  assert.equal(refused({ i: 3, t: RAT, k: 99_999 }, allies), true, 'a monster in al');
  assert.equal(refused({ i: 1, t: DAEDROTH, k: 100 }, allies), false, 'a summon at its own health');
});

test("a class-type companion or crewman is read at the wire's highest level: carried health passes, a forged one does not", () => {
  const allies = frameAllies({ cp: [1], cw: [2] });
  assert.equal(healthBoundRecord({ i: 1, t: MAGE, l: 5 }, allies).l, FOE_LEVEL_MAX);
  assert.equal(healthBoundRecord({ i: 2, t: MAGE }, allies).l, FOE_LEVEL_MAX, 'a record that states no level');
  const carried = { i: 1, t: MAGE, l: 5, k: 900, h: 900 }; // rolled at a higher level, now stood at a mentored 5
  assert.equal(
    foeStatsRefusal(carried, { lane: 'street', camp: false }) != null,
    true,
    'its own level would refuse it',
  );
  assert.equal(refused(carried, allies), false, 'as an ally it passes');
  assert.equal(refused({ i: 2, t: MAGE, l: 5, k: 99_999 }, allies), true, 'a forged crewman');
  assert.equal(healthBoundRecord({ i: 9, t: MAGE, l: 5 }, allies).l, 5, 'a class foe the frame does not name');
});

test('the allied-watch list names only a watchman, as its readers read it', () => {
  const allies = frameAllies({ al: [1, 2] });
  assert.equal(namedAlly({ i: 1, t: KNIGHT_CITY_WATCH }, allies), true);
  assert.equal(ridesWithoutGrant({ i: 1, t: KNIGHT_CITY_WATCH }, allies), true);
  assert.equal(namedAlly({ i: 2, t: MAGE }, allies), false, 'a class foe in al is no ally');
  assert.equal(healthBoundRecord({ i: 2, t: MAGE, l: 5 }, allies).l, 5);
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
    assert.equal(healthBoundRecord({ i: 1, t: MAGE, l: 5 }, allies).l, 5);
  }
});
