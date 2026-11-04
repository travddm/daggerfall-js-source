// @ts-check
// LOCKPICK-MODE: HOW A LOCK IS PICKED - the player's choice. DFU rolls a lock once and needs no item: a building's front
// door in Steal mode rolls CalculateExteriorLockpickingChance, a dungeon's door and a locked chest roll
// CalculateInteriorLockpickingChance, each attempt tallies Lockpicking once, and a failed attempt locks that door
// (FailedSkillLevel) or that building (LastLockpickAttempt) until the live skill changes (DaggerfallActionDoor.cs
// AttemptLockpicking l.150-185; PlayerActivate.cs l.532-566). The port's tumbler window (scenes/lockpickHost.js) with its
// Lockpick item is the `lockpickTumblers` pref (a Features row): off is DFU's roll, on is the window. Online the room's
// answer is forced off (onlineLane.js). A leaf: the shelf only.
import { getPref } from '../uiPrefs.js';

export const LOCKPICK_TUMBLERS_PREF = 'lockpickTumblers';
/** Whether a lock in Steal mode opens the tumbler window and asks for a Lockpick. Read at every lock. */
export const lockpickTumblersOn = () => getPref(LOCKPICK_TUMBLERS_PREF) === true;
