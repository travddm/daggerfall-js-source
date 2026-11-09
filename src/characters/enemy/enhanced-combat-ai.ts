// DFU's Enhanced Combat AI setting ([Enhancements] EnhancedCombatAI, DFU's default True). DFU reads it live in
// EnemySenses, EnemyMotor, EnemyAttack and DaggerfallMissile; the survey of every read is
// dfo-plans/future-work/dfu-parity/enhanced-combat-ai-port.md. The foe pools hand `enhancedCombatAIEnabled` to each
// EnemyAI as a thunk, so a bare EnemyAI (every motor test) keeps the classic path. Online the server profile forces the
// setting (net/profile/profileKeys.ts `combat.enhancedAI`), so every player in a room meets the same foes. The port's
// own Enhanced AI layer (ai/tactics.js, the `enhancedAI` pref) is a separate option on top of this one (decision 117).
//
// Ported so far, the senses: the field of view, the lead on the target (target-prediction.ts), the rate of approach
// and the melee reach (enemyAttack.js), and the runner-up target (enemyTargets.js).

import { getBool } from '../../systems/settings/settings.js';

/** Whether DFU's Enhanced Combat AI is on: the player's setting offline, the room's online. */
export const enhancedCombatAIEnabled = (): boolean => getBool('Enhancements', 'EnhancedCombatAI');

/** EnemySenses.Start (:239-241): "180 degrees is classic's value. 190 degrees is actual human FOV according to online
 *  sources." Read once, when the foe is made, as DFU's Start does. */
export const ENHANCED_FIELD_OF_VIEW = 190;

/** The fields EnemySenses' rate-of-approach block reads and writes, on the foe's AI. */
export type ApproachTracker = {
  readonly enhancedCombatAI: boolean;
  targetRateOfApproach: number;
  _lastDistanceToTarget: number;
  _approachTarget: unknown;
};

/** The fields this setting adds to a foe's AI (EnemyAI in characters/enemy/enemyMotor.js), which reads
 *  `enhancedCombatAI` through `_enhancedCombatAIOn` every time it is asked, as DFU reads the setting every frame. */
export type EnhancedCombatAIFields = ApproachTracker & {
  _enhancedCombatAIOn: () => boolean;
  fieldOfView: number;
  secondaryTargetPos: number[] | null;
  _inEarshot: boolean;
};

/**
 * Sets up a new foe's fields. `option` is the pool's reader (a thunk) or a plain boolean; with neither the foe runs the
 * classic path. EnemySenses.Start (:239-241) sets the field of view once, when the foe is made, so `fieldOfView` keeps
 * the value it had then. `classicFieldOfView` is the motor's 180.
 */
export function initEnhancedCombatAI(ai: EnhancedCombatAIFields, option: unknown, classicFieldOfView: number): void {
  ai._enhancedCombatAIOn = typeof option === 'function' ? (option as () => boolean) : () => option === true;
  ai.fieldOfView = ai._enhancedCombatAIOn() === true ? ENHANCED_FIELD_OF_VIEW : classicFieldOfView;
  ai.targetRateOfApproach = 0;
  ai._lastDistanceToTarget = 0;
  ai._approachTarget = null;
  // EnemySenses.secondaryTargetPos (:63), written only by the enhanced GetTargets (:868-872). null is DFU's
  // Vector3.zero, which the classic secondary switch reads (enemyTargets.js runTargetMachine).
  ai.secondaryTargetPos = null;
  ai._inEarshot = false; // EnemySenses.targetInEarshot, which PredictNextTargetPos reads (:551)
}

/**
 * EnemySenses.Update (:353-370), run once per classic update after the target machine. While the target is the one
 * the last update had, the enhanced AI reads how much closer it came (`lastDistanceToTarget - distanceToTarget`), and
 * EnemyAttack.MeleeAnimation (:162-164) adds that to its reach, so a foe swings at a target that is walking into it.
 * The classic path keeps the rate at 0. `distance` is the previous step's distance to the target, as DFU's field is
 * at that point of Update; `target` is null when the foe has none.
 */
export function trackRateOfApproach(ai: ApproachTracker, target: unknown, distanceIn: number): void {
  // The motor has measured no distance before its first senses pass (Infinity); DFU's field starts at 0.
  const distance = Number.isFinite(distanceIn) ? distanceIn : 0;
  if (target != null && target === ai._approachTarget) {
    if (ai.enhancedCombatAI) ai.targetRateOfApproach = ai._lastDistanceToTarget - distance;
  } else {
    ai._lastDistanceToTarget = 0;
    ai.targetRateOfApproach = 0;
  }
  if (target != null) {
    ai._lastDistanceToTarget = distance;
    ai._approachTarget = target;
  }
}

/** The unarmed motor's target for the rate of approach: always the player. */
const PLAYER_APPROACH = 'player';

/** The rate of approach for an unarmed motor (no target machine), whose target is the player, or none while it is
 *  pacified. The armed target machine keeps it itself (enemyTargets.js runTargetMachine). */
export function trackUnarmedRateOfApproach(ai: ApproachTracker & { isHostile: boolean; _dist: number }): void {
  trackRateOfApproach(ai, ai.isHostile ? PLAYER_APPROACH : null, ai._dist);
}
