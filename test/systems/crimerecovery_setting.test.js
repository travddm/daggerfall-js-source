import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runCalendarArms, DAY_ARMS } from '../../src/systems/worldTick.js';
import { NORMALIZE_INTERVAL_MINUTES } from '../../src/systems/court.js';
import { recoveryIntervalFor, recoveryIntervalMinutes, CRIME_RECOVERY_PREF } from '../../src/systems/repRecovery.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import { FEATURES } from '../../src/systems/features.js';
import { ONLINE_FORCED_PREFS } from '../../src/systems/online/onlineLane.js';

const DAY = 1440;
afterEach(() => setPref(CRIME_RECOVERY_PREF, 'x4'));

test("F3a: the recovery pace is the player's choice - DFU's 112 days, 4x (the default) or 16x - and an unknown value reads as the default", () => {
  assert.deepEqual(
    ['dfu', 'x4', 'x16', 'nope', undefined].map((v) => recoveryIntervalFor(v) / DAY),
    [112, 28, 7, 28, 28],
  );
  assert.equal(recoveryIntervalMinutes() / DAY, 28, 'the default');
});

test("F3a: a theft's -8 clears in 896 days on the classic pace, 224 on the default and 56 on fast (the real calendar arm, read live)", () => {
  for (const [choice, days] of [
    ['dfu', 896],
    ['x4', 224],
    ['x16', 56],
  ]) {
    setPref(CRIME_RECOVERY_PREF, choice);
    const e = { legalRep: { 1: -8 } };
    runCalendarArms(e, 1, days * DAY - 1, { arms: DAY_ARMS.own });
    assert.equal(e.legalRep[1], -1, `${choice}: one point short the minute before`);
    runCalendarArms(e, days * DAY - 1, days * DAY + 2, { arms: DAY_ARMS.own });
    assert.equal(e.legalRep[1], 0, `${choice}: clear on day ${days}`);
  }
  assert.equal(NORMALIZE_INTERVAL_MINUTES / DAY, 112);
});

test("F3a: the row declares its default and the room's pin, and the online lane forces it", () => {
  const row = FEATURES.find((f) => f.id === 'crime-recovery');
  assert.deepEqual([row.control.key, row.control.initial, row.control.online], [CRIME_RECOVERY_PREF, 'x4', 'x4']);
  assert.deepEqual(
    row.control.tiers.map((x) => x[0]),
    ['dfu', 'x4', 'x16'],
  );
  assert.equal(ONLINE_FORCED_PREFS[CRIME_RECOVERY_PREF], 'x4');
});
