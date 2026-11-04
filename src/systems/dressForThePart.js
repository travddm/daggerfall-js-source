// @ts-check
// DRESS1: DOES WHAT YOU WEAR CHANGE HOW PEOPLE TAKE YOU? DFU has no clothing reaction: the reaction sum is faction
// reputation, the biography, live reaction mods (enchantments only) and the social group's reputation
// (TalkManager.GetReactionToPlayer). The port added a clothing term (systems/clothingStanding.js). The `dressForThePart`
// pref (a Features row) is that term: off is DFU's, on adds it. Online the room's answer is forced off (onlineLane.js).
// A leaf: the shelf only.
import { getPref } from './uiPrefs.js';

export const DRESS_FOR_THE_PART_PREF = 'dressForThePart';
/** Whether worn clothing adds to the reaction of the social groups and the temples. Read at every magic round. */
export const dressForThePartOn = () => getPref(DRESS_FOR_THE_PART_PREF) === true;
