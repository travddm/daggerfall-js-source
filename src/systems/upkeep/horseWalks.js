// @ts-check
// HORSE-WALK: DOES A CARED-FOR HORSE WALK UNLESS YOU HOLD RUN? DFU rides a horse at its ride base (375, against the foot's 150)
// with no second pace (PlayerSpeedChanger.cs dfRideBase, GetBaseSpeed). Horse care (Boons) walked the ridden horse at the
// foot's base unless the rider held Run, so the horse only reached DFU's pace while galloping. The `horseWalks` pref (a Features
// row) is that rule: off is DFU's ride base, on is the walk. Horse care's other rules (stats, breath, hunger, the gallop's
// refusal on Hard) do not depend on it. Online it is the player's own, as Horse care is (the horse decides only what this player's ride pays). A leaf: the shelf only.
import { getPref } from '../uiPrefs.js';

export const HORSE_WALKS_PREF = 'horseWalks';
/** Whether a ridden horse under horse care walks until Run is held. Read at every frame of riding. */
export const horseWalksOn = () => getPref(HORSE_WALKS_PREF) === true;
