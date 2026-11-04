// @ts-check
// F3a: HOW FAST A BAD NAME RECOVERS - the player's choice. DFU walks every standing one point toward zero every 112 days
// (PlayerEntity.NormalizeReputations, court.js NORMALIZE_INTERVAL_MINUTES). The port's REP4 sped that up for a standing
// below zero; the `crimeRecovery` pref (a Features row) says by how much: DFU's own pace, 4x (the default) or 16x (REP4's
// first week). Online the room's answer is forced (onlineLane.js), so every player's name recovers at one pace.
// A leaf: the shelf and court.js's constant only, so worldTick.js and the guild text can ask without a cycle.
import { getPref } from './uiPrefs.js';
import { NORMALIZE_INTERVAL_MINUTES } from './court.js';

export const CRIME_RECOVERY_PREF = 'crimeRecovery';
export const CRIME_RECOVERY_DEFAULT = 'x4';
/** The stored value of each choice, and how many times DFU's pace it is. Every multiple divides 112 days evenly, so the
 *  112-day walk still lands on the interval's own boundary and no minute pays twice. */
export const CRIME_RECOVERY_MULTIPLES = Object.freeze({ dfu: 1, x4: 4, x16: 16 });
/** Minutes between a bad name's points back, for a stored choice (an unknown value reads as the default). */
export const recoveryIntervalFor = (stored) =>
  NORMALIZE_INTERVAL_MINUTES / (CRIME_RECOVERY_MULTIPLES[stored] ?? CRIME_RECOVERY_MULTIPLES[CRIME_RECOVERY_DEFAULT]);
/** The live choice's interval, read at every call: the pick takes effect at once. */
export const recoveryIntervalMinutes = () => recoveryIntervalFor(getPref(CRIME_RECOVERY_PREF));
