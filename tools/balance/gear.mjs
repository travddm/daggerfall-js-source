// The gear a reference build wears at a level, and the entity that wears it.
//
// Materials follow DFU's own loot law: FormulaHelper.RandomMaterial(playerLevel) (ported in combat/enemyEquipment.js
// `randomMaterial`) draws iron..daedric with a level bias. The harness takes the exact distribution of that draw (all
// 256 rolls) and gives the build the material at a stated percentile of it, `gearPercentile` (default 0.9): a player
// buys or finds better than the median, not the best. The same material is used for both rule sets, so a difference in
// the output is the rules' and not the gear's.
import { randomMaterial, weaponOfMaterial, armorOfMaterial, ARMOR_MATERIAL } from '../../src/combat/enemyEquipment.js';
import { equipItem } from '../../src/systems/equip.js';
import { ARMOUR_TEMPLATES, ARMOUR_KIND } from './builds.mjs';

export const DEFAULT_GEAR_PERCENTILE = 0.9;
const ROLLS = 256;

/** The material index (0 iron .. 9 daedric) at `percentile` of RandomMaterial(level)'s exact distribution. */
export function materialAtLevel(level, percentile = DEFAULT_GEAR_PERCENTILE) {
  const counts = new Array(10).fill(0);
  for (let roll = 0; roll < ROLLS; roll++) {
    counts[randomMaterial(level, () => (roll + 0.5) / ROLLS)]++;
  }
  let seen = 0;
  for (let material = 0; material < counts.length; material++) {
    seen += counts[material];
    if (seen / ROLLS >= percentile) return material;
  }
  return counts.length - 1;
}

export const MATERIAL_NAMES = Object.freeze(['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony', 'orcish', 'daedric']);

/** The armour material code for a kind at a plate material. */
export function armourMaterialCode(kind, material) {
  if (kind === ARMOUR_KIND.leather) return ARMOR_MATERIAL.Leather;
  if (kind === ARMOUR_KIND.chain) return ARMOR_MATERIAL.Chain;
  return ARMOR_MATERIAL.PLATE_BASE + material;
}

/**
 * Mint the build's weapon and armour for `level`.
 * @param {{ weaponAffix?: object|null, armourAffix?: object|null }} affixes lines for the loot layer (lootRarity affix records)
 */
export function mintKit(build, level, { gearPercentile = DEFAULT_GEAR_PERCENTILE, affixes = {}, material: forced, armourMaterial } = {}) {
  const material = forced ?? materialAtLevel(level, gearPercentile);
  const weapon = weaponOfMaterial(build.weapon, material);
  if (affixes.weaponAffix) {
    weapon.rarity = affixes.tier;
    weapon.affixes = [affixes.weaponAffix];
  }
  const armour = build.armour === ARMOUR_KIND.none
    ? []
    : ARMOUR_TEMPLATES.map((template) => {
      const piece = armorOfMaterial(template, armourMaterialCode(build.armour, armourMaterial ?? material));
      if (affixes.armourAffix) {
        piece.rarity = affixes.tier;
        piece.affixes = [affixes.armourAffix];
      }
      return piece;
    });
  return { material, weapon, armour };
}

/** Put the kit on an entity through the game's own equip seam (so armorValues and the equip table are the real ones). */
export function wearKit(entity, kit) {
  for (const item of [...kit.armour, kit.weapon]) {
    entity.items.push(item);
    equipItem(entity, item);
  }
  return entity;
}
