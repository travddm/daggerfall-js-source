// @ts-check
// REPAIR-PRICE: WHAT A SMITH CHARGES FOR A REPAIR. DFU asks a flat tenth of the item's value, whatever the damage
// (FormulaHelper.CalculateItemRepairCost l.2022-2043). Roleplay & Realism: Items replaces it with a price that scales with the
// damage (RoleplayRealismItemsMod.cs l.262-278), under its `conditionBasedPrices` module. That module also prices what a shop
// sells and buys by condition, which this option leaves alone. The `repairPriceByDamage` pref (a Features row) is the repair
// price alone: off is DFU's flat tenth, on is the mod's (and needs its module on). Online the room's answer is forced off
// (onlineLane.js). A leaf: the shelf only.
import { getPref } from './uiPrefs.js';

export const REPAIR_PRICE_BY_DAMAGE_PREF = 'repairPriceByDamage';
/** Whether a repair's price scales with the damage. Read at every quote. */
export const repairPriceByDamageOn = () => getPref(REPAIR_PRICE_BY_DAMAGE_PREF) === true;
