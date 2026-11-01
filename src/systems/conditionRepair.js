// @ts-check
// Weapon condition laws shared by more than one producer.
//
// The questions' dagger: Roleplay & Realism's skill-based kit wears a biography dagger finer than steel to 20% of its
// condition (rriKits.js assignSkillEquipment). The test and the share live here so the kit and its tests read one law.
//
// The one weapon pool: every weapon type wears from one pool (characters/weapons.js WEAPON_CONDITION_POOL), while a
// weapon minted on its row's own pool still carries that row's number. repoolWeapon moves such a piece to the pool,
// its condition and its found mark at the same share, before it wears (equip.js lowerCondition) or is mended
// (enchantments.js). The fingerprint is the old mint's own number: a row's hitPoints through the material ladder, on
// Daggerfall's row or on Roleplay & Realism: Items' patch of it, and through the smith's quality for a made piece.
// A magic item's or an artifact's uses, ammunition, a piece already on the pool, a piece booked at a smith and a
// piece matching no old mint are left as they are. A moved piece is on the pool, so nothing moves it again.

import { mintCondition, ITEM_TEMPLATES, templateByIndex } from './item/itemTemplates.js';
import { scaleFoundMark } from './item/foundMark.js';   // AUDIT MEND-THIRD: the mark's one home
import { WEAPONS, WEAPON_MATERIALS, conditionMultipliersByMaterial } from '../characters/weapons.js';
import { RRI_TEMPLATE_PATCHES } from './roleplayRealismItems/rriItems.js';
import { QUALITY_EFFECTS } from '../net/recipeLaw.js';

/** Roleplay & Realism's worn questions' dagger: "Set condition of ebony dagger if player has one from char creation
 *  questions" - a dagger finer than steel. One home, read by the kit. */
export const isQuestionsDagger = (item) => item?.group === 'Weapons' && item.templateIndex === WEAPONS.Dagger && (item.material ?? 0) > WEAPON_MATERIALS.Steel;
/** The kit's wear: `(int)(maxCondition * 0.2f)`. */
export const QUESTIONS_DAGGER_WEAR = 0.2;

/** Roleplay & Realism: Items' hitPoints patches to classic weapon rows (a Tanto at 40, a Short Bow at 80): a piece
 *  minted while the mod was on carries its patch's pool, whether or not the mod is on at this load. */
const RRI_ROW_POOLS = new Map(RRI_TEMPLATE_PATCHES.map((/** @type {any} */ p) => [p.index, p.hitPoints]));

/** The pools a weapon of this template may have been minted on before WEAPON-POOL: Daggerfall's row, a custom
 *  template's own, and the mod's patch of the row.
 * @param {number} templateIndex
 * @returns {number[]} */
const rowPools = (templateIndex) => [ITEM_TEMPLATES[templateIndex]?.hitPoints, templateByIndex(templateIndex)?.hitPoints, RRI_ROW_POOLS.get(templateIndex)]
  .filter((hp) => typeof hp === 'number');

/** A pool through a piece's own mint: the material ladder (mintCondition's arithmetic - no material is x4 / 4), then a
 *  made piece's quality (smithItems.js mintPiece's `round(maxCondition * condition)`; its floor at 1 never reaches a
 *  weapon's pool).
 * @param {number} pool @param {any} it
 * @returns {number} */
function mintedOn(pool, it) {
  const max = Math.trunc((pool * (conditionMultipliersByMaterial[it.material] ?? 4)) / 4);
  const made = QUALITY_EFFECTS[it.quality]?.condition;
  return made == null ? max : Math.round(max * made);
}

/**
 * WEAPON-POOL: move ONE weapon minted on its row's pool to the one pool, its condition (and SELL-AS-FOUND's mark) the
 * same share. Ammunition needs no guard: its mint is its row's either side, so it is always on its pool already.
 * @param {any} it
 * @returns {boolean} whether it moved
 */
export function repoolWeapon(it) {
  // a magic item's condition is its uses (a classic save's artifact carries `artifact` alone - AUDIT WEAPON-POOL P4); a
  // piece at a smith keeps its booked job (P3); a frozen record cannot be written
  if (!it || it.group !== 'Weapons' || it.magic || it.artifact || it.repairData != null || !Object.isExtensible(it)
    || !Number.isFinite(it.currentCondition)) return false;
  const max = it.maxCondition;
  const pool = mintedOn(mintCondition({ group: 'Weapons', templateIndex: it.templateIndex }).maxCondition, it);
  if (pool === max || !rowPools(it.templateIndex).some((hp) => mintedOn(hp, it) === max)) return false;
  // the same share: a whole piece whole, a broken one broken - and the pool is never below a row's, so a worn piece
  // is never rounded to either
  const share = (/** @type {number} */ n) => Math.round((n * pool) / max);
  it.currentCondition = share(it.currentCondition);
  scaleFoundMark(it, max, pool);   // P1: the online counter reads the mark (and MEND-THIRD its owner's mends) over the maximum
  it.maxCondition = pool;
  return true;
}
