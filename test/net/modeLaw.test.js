// CHARACTER MODES: the shared law (src/net/modeLaw.js) - the codes, the predicates and the drop table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES,
  MODE_CODES,
  DEFAULT_MODE,
  isMode,
  codeOf,
  modeOfCode,
  modeClaimOk,
  permadeath,
  ironman,
  legacy,
  creatableModes,
  offeredFromList,
  canDrop,
  dropsFrom,
} from '../../src/net/modeLaw.js';

test('the codes are one to one with the modes and the default is Classic', () => {
  assert.equal(DEFAULT_MODE, 'classic');
  assert.deepEqual(Object.keys(MODE_CODES), [...MODES]);
  assert.equal(new Set(Object.values(MODE_CODES)).size, MODES.length);
  for (const m of MODES) assert.equal(modeOfCode(codeOf(m)), m);
});

test('a code outside the table is no mode, and an unknown mode reads as the default', () => {
  for (const bad of [-1, 5, 1.5, '1', null, NaN]) assert.equal(modeOfCode(bad), null);
  assert.equal(codeOf('nonsense'), MODE_CODES.classic);
  assert.equal(isMode('toString'), false);
  assert.equal(modeClaimOk(undefined), true);
  assert.equal(modeClaimOk(4), true);
  assert.equal(modeClaimOk(5), false);
  assert.equal(modeClaimOk('1'), false);
});

test('the death and Ironman switches make the five modes', () => {
  const row = (m) => [permadeath(m), ironman(m), legacy(m)];
  assert.deepEqual(row('classic'), [false, false, false]);
  assert.deepEqual(row('hardcore'), [true, false, false]);
  assert.deepEqual(row('legacy'), [false, false, true]);
  assert.deepEqual(row('ironman'), [false, true, false]);
  assert.deepEqual(row('hardcore_ironman'), [true, true, false]);
  assert.deepEqual(row('bogus'), [false, false, false]);
});

test('a server offers the modes its profile names; Classic is always offered', () => {
  assert.deepEqual(creatableModes(), [...MODES]);
  assert.deepEqual(
    creatableModes({ legacy: false }),
    MODES.filter((m) => m !== 'legacy'),
  );
  assert.deepEqual(
    creatableModes({ classic: false, hardcore: false }),
    MODES.filter((m) => m !== 'hardcore'),
  );
  assert.deepEqual(creatableModes(offeredFromList('classic,hardcore,bogus')), ['classic', 'hardcore']);
  assert.deepEqual(creatableModes(offeredFromList('hardcore')), ['classic', 'hardcore']);
  for (const none of [undefined, '', ' , ', 'bogus', 7])
    assert.deepEqual(creatableModes(offeredFromList(none)), [...MODES], String(none));
});

test('a mode is only loosened, never tightened', () => {
  for (const from of MODES) {
    for (const to of MODES) {
      if (!canDrop(from, to)) continue;
      assert.ok(!(!permadeath(from) && permadeath(to)), `${from} -> ${to} adds permadeath`);
      assert.ok(!(!ironman(from) && ironman(to)), `${from} -> ${to} adds Ironman`);
    }
  }
});

test('the drop table', () => {
  assert.deepEqual(dropsFrom('classic'), []);
  assert.deepEqual(dropsFrom('legacy'), []);
  assert.deepEqual(dropsFrom('hardcore'), ['classic']);
  assert.deepEqual(dropsFrom('ironman'), ['classic']);
  assert.deepEqual(dropsFrom('hardcore_ironman'), ['classic', 'hardcore', 'ironman']);
  assert.equal(canDrop('classic', 'hardcore'), false);
  assert.equal(canDrop('classic', 'legacy'), false);
  assert.equal(canDrop('hardcore', 'legacy'), false);
  assert.equal(canDrop('legacy', 'classic'), false);
  assert.equal(canDrop('ironman', 'ironman'), false);
  assert.equal(canDrop('ironman', 'bogus'), false);
});

test('a dead character changes nothing', () => {
  for (const from of MODES) assert.deepEqual(dropsFrom(from, { dead: true }), []);
});
