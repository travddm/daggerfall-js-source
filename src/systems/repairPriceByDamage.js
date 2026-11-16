// @ts-check
// REPAIR-PRICE: what a smith charges for a repair. DFU asks a flat tenth of the item's value (FormulaHelper
// CalculateItemRepairCost l.2022-2043). Roleplay & Realism: Items scales it with the damage (RoleplayRealismItemsMod.cs
// l.262-278) under its `conditionBasedPrices` module, which also prices shop stock by condition; this option leaves that
// alone. The `repairPriceByDamage` pref (a Features row): off is DFU's flat tenth, on is the mod's (needs its module on).
// Forced off online (onlineLane.js). A leaf.
import { getPref } from './uiPrefs.js';

export const REPAIR_PRICE_BY_DAMAGE_PREF = 'repairPriceByDamage';
/** Whether a repair's price scales with the damage. Read at every quote. */
export const repairPriceByDamageOn = () => getPref(REPAIR_PRICE_BY_DAMAGE_PREF) === true;
