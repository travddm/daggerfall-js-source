// @ts-check
// A realm character's leveling, reconciled at the realm boot (scenes/world.js `releveled`). The boot reads the
// character's save from the service and runs crossLeveling on it before it is restored, so the save the realm holds
// is the only input: a character that still levels the Oblivion way is switched to the online law's system, and every
// realm character's level is read again from its skills under the online cap.

import { LEVELING_CLASSIC, newCharacterLevelingSystem } from './oblivionLeveling.js';
import { levelUpSkillSumAnchor } from './advancement.js';
import { onlineLevelConvert } from './levelClimb.js';
import { releaseCapLatch } from './levelCap.js';

/**
 * Puts a realm character's save on the online law's leveling, in place. The switch (switchLeveling) runs first, then
 * the level is read again from the skills and capped at the online cap (systems/levelClimb.js onlineLevelConvert). A
 * save already on the online law's system passes the switch untouched. Answers whether the system switched.
 * @param {any} snap
 */
export function crossLeveling(snap) {
  const switched = switchLeveling(snap);
  onlineLevelConvert(snap);
  return switched;
}

/**
 * Moves an Oblivion-leveling save onto the system a new online character gets (oblivionLeveling.js
 * newCharacterLevelingSystem). The Oblivion bar is dropped and the Daggerfall skill sum is re-anchored at the start of
 * the level the character has (advancement.js levelUpSkillSumAnchor): Daggerfall's sum was never the Oblivion
 * character's measure, so read raw it could pay out several levels at once or owe them. A level-up already earned is
 * kept, since the anchor is the pending level's. Answers whether it switched.
 * @param {any} snap
 */
function switchLeveling(snap) {
  const system = newCharacterLevelingSystem(snap.levelingSystem, { online: true });
  if ((snap.levelingSystem ?? LEVELING_CLASSIC) === system) return false;
  snap.levelingSystem = system;
  snap.levelProgress = 0;
  snap.levelRollUp = 0;
  const level = Number.isFinite(snap.level) ? snap.level : 1;
  releaseCapLatch(snap);   // a latch at the cap owes no level online either
  const target = snap.readyToLevelUp === true ? level + 1 : level;
  if (Number.isFinite(snap.currentLevelUpSkillSum)) {
    snap.startingLevelUpSkillSum = levelUpSkillSumAnchor(snap.currentLevelUpSkillSum, target);
  }
  return true;
}

/** The words the realm boot says once the world stands, when crossLeveling switched the character's system. */
export const LEVELING_SWITCHED_LINE = 'Online characters now level the classic way: you will level by your skills from here on, starting from your current level.';
