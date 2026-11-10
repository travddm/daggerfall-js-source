// @ts-check
// What putting on a Cast-When-Held piece costs. DFU bills the held spell's whole classic casting cost in
// condition at every equip that is not a recast, and the bill can break the piece (CastWhenHeld.cs
// InstantiateSpellBundle: `if (!recast) sourceItem.LowerCondition(amount, ...)`). That is the default.
// Two prefs (systems/equipBillRows.js; online the server profile's pins) keep the port's earlier laws:
// `legendaryEquipFree` (a Legendary pays nothing) and `gentleEquipBill` (a re-wear within
// REROLL_MINIMUM_HOURS is free, and the bill stops at 1 condition). A leaf, so enchantments.js can ask.
import { getPref } from './uiPrefs.js';

export const LEGENDARY_EQUIP_FREE_PREF = 'legendaryEquipFree';
export const GENTLE_EQUIP_BILL_PREF = 'gentleEquipBill';
/** Whether a Legendary goes on for nothing. Read at every equip. */
export const legendaryEquipFree = () => getPref(LEGENDARY_EQUIP_FREE_PREF) === true;
/** Whether the bill skips a fresh re-wear and never breaks a piece. Read at every equip. */
export const gentleEquipBill = () => getPref(GENTLE_EQUIP_BILL_PREF) === true;
