// BAL6-GAUNTLETS, CLAW-METAL: AN OPTION, OFF BY DEFAULT - THE BEAST'S CLAWS TAKE THE METAL ON ITS HANDS.
//
// DFU's claws are the bare hand: CalculateHandToHandAttackDamage rolls the skill's span and adds the swing and Strength,
// and reads no item. That is the default. The `clawMetal` pref (combat/clawMetalRow.js; online the server profile's pin)
// is the port's earlier rule: MorphSelf empties both hands, but the gauntlets stay on, and plate gauntlets add their
// metal's DaggerfallUnityItem.GetWeaponMaterialModifier to every claw hit (Elven +1 ... Daedric +6), never below the bare
// claws. Damage only: no to-hit, no material gate, no silver's double, no condition band; leather and chain have no metal.
// Both cores' hand-to-hand blows read it (combat/pcaao.js, combat/formulas.js), the refereed lanes' stand-in carries it
// (combat/duelCombat.js), and the stats card models it (combat/combatStats.js).
//
// AUDIT CLAWS (Balance-Arc.md section 12): the piece is what the equip rules seat in the Gloves slot (a saved slot is
// trusted on a load - a cuirass, or a mod's gloves after the mod is off, is no gauntlet), its metal the class's own
// (RRI's Brigandine Gloves are leather by their class, whatever metal they name: rriItems.js rriNativeMaterialValue, the
// port's one reader of it), and a broken one is no metal.
import { equipTableOf, getEquipSlot, isBrokenItem, EQUIP_SLOTS } from '../systems/equip.js';
import { plateMetal } from '../systems/armorMaterials.js';
import { rriNativeMaterialValue } from '../systems/roleplayRealismItems/rriItems.js';
import { weaponMaterialModifier, WEAPON_MATERIALS } from '../characters/weapons.js';
import { getPref } from '../systems/uiPrefs.js';

/** The pref combat/clawMetalRow.js writes. Off (DFU's bare claws) unless set. */
export const CLAW_METAL_PREF = 'clawMetal';
/** Whether the claws take the gauntlets' metal. Read at every hit. */
export const clawMetalOn = () => getPref(CLAW_METAL_PREF) === true;

/** The most the claws take: Daedric's modifier. */
export const CLAW_METAL_MAX = weaponMaterialModifier(WEAPON_MATERIALS.Daedric);

/** The damage a transformed lycanthrope's claws take from the gauntlets it wears: their plate metal's material
 *  modifier, never below 0. 0 with the option off (DFU's bare claws), out of beast form, bare-handed, in leather or chain,
 *  or in a broken piece. Off also zeroes a stand-in's word, so a room's one pin answers both ends. A refereed
 *  lane's stand-in (combat/duelCombat.js duelStub) has no equip table and carries this law's word as `clawMetal`. */
export function clawMetalDamage(entity) {
  if (!clawMetalOn()) return 0;
  if (Number.isInteger(entity?.clawMetal)) return entity.clawMetal;
  if (!entity?.isInBeastForm) return 0;
  const g = equipTableOf(entity)[EQUIP_SLOTS.Gloves];
  if (!g || isBrokenItem(g) || getEquipSlot(entity, g) !== EQUIP_SLOTS.Gloves) return 0;
  const metal = plateMetal(rriNativeMaterialValue(g));
  return metal === null ? 0 : Math.max(0, weaponMaterialModifier(metal));
}
