// A foe's gold by the killer's level.
//
// DFU rolls a body's gold as the table's range times the player's level, so gold grows without end (level 45 finds
// forty-five times what level 1 finds). Unleveled Loot divides the level back out, which leaves gold flat for the
// whole game. This curve sits between the two: it grows early and flattens late, so a mid-level character is paid
// well and a late one is not buried in coin. A departure from both, chosen by the owner (balance lane B4).

/** The slope of the curve, per natural-log step of level. */
export const KILL_GOLD_LOG_SLOPE = 1.5;

/** How many times its table range a body pays at this level: 1 at level 1, about 4.5 at level 10, 6.7 at level 45. */
export function killGoldScale(level: number): number {
  const lv = Math.max(1, Math.trunc(Number(level) || 1));
  return 1 + KILL_GOLD_LOG_SLOPE * Math.log(lv);
}

/** A body's gold stack once the level's own multiple is divided out: the stack rescaled to the curve, never under 1. */
export function killGoldFromRange(rangeGold: number, level: number): number {
  return Math.max(1, Math.trunc(rangeGold * killGoldScale(level)));
}
