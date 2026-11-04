// @ts-check
// HORSE-WALK: does a cared-for horse walk unless you hold Run? DFU rides a horse at its ride base (375, against the foot's
// 150) with no second pace (PlayerSpeedChanger.cs dfRideBase). Horse care (Boons) walked the ridden horse at the foot's
// base unless Run was held. The `horseWalks` pref (a Features row): off is DFU's ride base, on is the walk. Horse care's
// other rules (stats, breath, hunger, the Hard gallop refusal) do not depend on it. Online it is the player's own, as
// Horse care is. A leaf.
import { getPref } from '../uiPrefs.js';

export const HORSE_WALKS_PREF = 'horseWalks';
/** Whether a ridden horse under horse care walks until Run is held. Read at every frame of riding. */
export const horseWalksOn = () => getPref(HORSE_WALKS_PREF) === true;
