// @ts-check
// DRESS1: does what you wear change how people take you? DFU has no clothing reaction: the reaction sum is faction
// reputation, the biography, live reaction mods (enchantments only) and the social group's reputation
// (TalkManager.GetReactionToPlayer). The port added a clothing term (systems/clothingStanding.js). The `dressForThePart`
// pref (a Features row): off is DFU's, on adds it. Forced off online (onlineLane.js). A leaf.
import { getPref } from './uiPrefs.js';

export const DRESS_FOR_THE_PART_PREF = 'dressForThePart';
/** Whether worn clothing adds to the reaction of the social groups and the temples. Read at every magic round. */
export const dressForThePartOn = () => getPref(DRESS_FOR_THE_PART_PREF) === true;
