// @ts-check
// LOCKPICK-MODE: how a lock is picked. DFU rolls a lock once and needs no item: a front door in Steal mode rolls
// CalculateExteriorLockpickingChance, a dungeon door or chest CalculateInteriorLockpickingChance; each attempt tallies
// Lockpicking once, and a failure locks that door (FailedSkillLevel) or building (LastLockpickAttempt) until the live
// skill changes (DaggerfallActionDoor.cs l.150-185; PlayerActivate.cs l.532-566). The tumbler window with its Lockpick item
// (scenes/lockpickHost.js) is the `lockpickTumblers` pref (a Features row): off is DFU's roll, on is the window. Forced
// off online (onlineLane.js). A leaf.
import { getPref } from '../uiPrefs.js';

export const LOCKPICK_TUMBLERS_PREF = 'lockpickTumblers';
/** Whether a lock in Steal mode opens the tumbler window and asks for a Lockpick. Read at every lock. */
export const lockpickTumblersOn = () => getPref(LOCKPICK_TUMBLERS_PREF) === true;
