// The player half of DFU's StealthCheck (EnemySenses.cs:633-650): the part that runs only when the foe's target is the
// player. The foe's motor (enemyMotor.js _stealthCheck) runs the rest: the distance gate, the once-a-minute guard and
// the roll against the target's live Stealth.

/** What the player half reads of the foe's motor. */
export type StealthMotor = { detected: boolean; hasEncounteredPlayer: boolean };

/** What the player half reads of the scene's senses context (scenes/shared.js sensesContext). */
export type StealthSenses = {
  movingLessThanHalfSpeed?: boolean;
  /** PlayerEntity.TimeOfLastStealthCheck: one box shared by every foe in the scene. */
  sharedStealth?: { minute: number } | null;
  tallyStealth?: () => void;
};

/**
 * The player half: a player moving under half speed is not checked on odd minutes, and an encountered player moving
 * faster is detected outright; otherwise the player's Stealth tallies once a minute across all foes. Returns the
 * check's answer when the half decides it, and undefined when the roll must run.
 */
export function playerHalfOfStealthCheck(
  ai: StealthMotor,
  senses: StealthSenses,
  gameMinutes: number,
): boolean | undefined {
  if (senses.movingLessThanHalfSpeed) {
    if ((gameMinutes & 1) === 1) return ai.detected;
  } else if (ai.hasEncounteredPlayer) {
    return true;
  }
  if (senses.sharedStealth && senses.sharedStealth.minute !== gameMinutes) {
    senses.tallyStealth?.();
    senses.sharedStealth.minute = gameMinutes;
  }
  return undefined;
}
