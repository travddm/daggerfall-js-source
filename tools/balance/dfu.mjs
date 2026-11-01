// Daggerfall Unity's combat rules, ported as expectations (no dice).
//
// Every function names the DFU member it ports (Assets/Scripts/Game/Formulas/FormulaHelper.cs unless said otherwise;
// fetch the source with `sh tools/parity/prepare.sh` or point DFU_PATH at a checkout). This file is deliberately
// independent of src/combat: the game's stock core still reads port-only seams (effective skills, SWING-LAW, BAL10), so
// it is not DFU, and the harness's DFU column must be.
// The one cross-check is test/tools/balanceHarness.test.js, which runs this port against src/combat/formulas.js on a
// classic case.

const trunc = Math.trunc;
const clampHit = (chance) => Math.max(3, Math.min(97, chance));

/** DamageModifier (:66). */
export const damageModifier = (strength) => Math.floor((strength - 50) / 5);
/** HitPointsModifier (:111). */
export const hitPointsModifier = (endurance) => Math.floor(endurance / 10) - 5;

/** CalculateWeaponMinDamage (:455) and CalculateWeaponMaxDamage (:490), by template index. */
export const WEAPON_DAMAGE = Object.freeze({
  113: [1, 6],    // Dagger
  114: [1, 8],    // Tanto
  115: [1, 8],    // Staff
  116: [1, 8],    // Shortsword
  117: [1, 10],   // Wakazashi
  118: [1, 12],   // Broadsword
  119: [3, 12],   // Saber
  120: [2, 16],   // Longsword
  121: [3, 16],   // Katana
  122: [2, 18],   // Claymore
  123: [3, 21],   // Dai-Katana
  124: [1, 12],   // Mace
  125: [2, 14],   // Flail
  126: [3, 18],   // Warhammer
  127: [2, 12],   // Battle Axe
  128: [2, 16],   // War Axe
  129: [4, 16],   // Short Bow
  130: [4, 18],   // Long Bow
});

/** DaggerfallUnityItem.GetWeaponMaterialModifier, iron..daedric. */
export const MATERIAL_MODIFIER = Object.freeze([-1, 0, 0, 1, 2, 3, 3, 4, 5, 6]);

/** CalculateStruckBodyPart (:863): the 20-entry table of struck parts. */
export const STRUCK_PARTS = Object.freeze([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6]);

/** EnemyEntity.SetEnemyCareer: every skill of a foe is 5 x level + 30, held at 100. */
export const foeSkill = (level) => Math.min(100, level * 5 + 30);

/**
 * Chance a blow lands, in expectation over the struck part and the critical roll.
 * CalculateSuccessfulHit (:796): base + armour of the struck part + stat differences (CalculateStatsToHit :1185)
 * - the target's Dodging / 4 and a critical bonus (CalculateSkillsToHit :1202) + adjustments (CalculateAdjustmentsToHit :1224),
 * clamped to 3..97.
 * @param {{base: number, armourParts: number[], attackerStats: object, targetStats: object, targetDodging: number,
 *   attackerCritical: number, adjustment: number}} o `adjustment` is the +40 monster bonus (when the target is a monster) and
 *   the target's biography term, less 50.
 */
export function hitChance({ base, armourParts, attackerStats, targetStats, targetDodging, attackerCritical, adjustment }) {
  const statTerm = trunc((attackerStats.luck - targetStats.luck) / 10) + trunc((attackerStats.agility - targetStats.agility) / 10);
  const dodgeTerm = -trunc(targetDodging / 4);
  const criticalChance = Math.max(0, Math.min(100, attackerCritical)) / 100;
  const criticalBonus = trunc(attackerCritical / 10);
  let total = 0;
  for (const part of STRUCK_PARTS) {
    const open = base + armourParts[part] + statTerm + dodgeTerm + adjustment;
    total += (1 - criticalChance) * clampHit(open) + criticalChance * clampHit(open + criticalBonus);
  }
  return total / STRUCK_PARTS.length / 100;
}

/** Mean damage of a weapon blow that lands. CalculateWeaponAttackDamage (:730): Range(min, max + 1) + the Strength modifier
 *  + the material modifier, zero when under 1. Exact over the integer rolls. */
export function weaponBlow({ template, strength, material }) {
  const [min, max] = WEAPON_DAMAGE[template];
  let sum = 0;
  for (let roll = min; roll <= max; roll++) {
    const damage = roll + damageModifier(strength) + (MATERIAL_MODIFIER[material] ?? 0);
    sum += damage < 1 ? 0 : damage;
  }
  return sum / (max - min + 1);
}

/** Player's chance and mean damage a swing against a monster row (CalculateAttackDamage :538, the weapon arm). The swing
 *  is a sideways slash (no swing modifier); no proficiency or racial modifier. */
export function playerSwing({ player, weaponSkill, weapon, foe }) {
  const ineffective = foe.row.minMetalToHit > weapon.material;   // CalculateAttackDamage :576
  const base = weaponSkill + (MATERIAL_MODIFIER[weapon.material] ?? 0) * 10;   // CalculateWeaponToHit (:1140)
  const chance = hitChance({
    base, armourParts: new Array(7).fill(foe.row.armorValue * 5),
    attackerStats: player.stats, targetStats: foe.stats, targetDodging: foeSkill(foe.row.level),
    attackerCritical: player.critical, adjustment: 40 - 50,
  });
  const damage = ineffective ? 0 : weaponBlow({ template: weapon.template, strength: player.stats.strength, material: weapon.material });
  return { chance, damage, perSwing: chance * damage };
}

/** Seconds a melee swing takes: five frames at GetMeleeWeaponAnimTime (:830) = 3 x (115 - Speed) / 980 a frame. */
export const meleeSwingSeconds = (speed) => (5 * 3 * (115 - speed)) / 980;
/** Seconds a bow shot takes: the draw (4 classic ticks of 1/16 s) plus GetBowCooldownTime (:840) = (10 x (100 - Speed) + 800) / 980. */
export const bowShotSeconds = (speed) => 4 * 0.0625 + (10 * (100 - speed) + 800) / 980;

/** Seconds between a melee monster's attacks: EnemyAttack.ResetMeleeTimer (characters/enemy/enemyAttack.js documents the
 *  formula): Random.Range(1500, 3001) ms, less 50 per player level above 10, plus 450 per Reflexes step above Average,
 *  floored at 0, over 980. Exact mean over the 1501 rolls. */
export function monsterAttackSeconds(playerLevel, reflexes = 2) {
  let sum = 0;
  for (let ms = 1500; ms <= 3000; ms++) sum += Math.max(0, ms - 50 * (playerLevel - 10) + 450 * (reflexes - 2));
  return sum / 1501 / 980;
}

/** A monster's expected damage to the player per attack: up to three attacks, each gated by Reflexes
 *  (50 - 10 x (reflexes - 2) per cent, CalculateAttackDamage :654) and by CalculateSuccessfulHit against the player. */
export function monsterAttack({ row, foeStats, player, reflexes = 2 }) {
  const skill = foeSkill(row.level);
  const chance = hitChance({
    base: skill, armourParts: player.armourParts,
    attackerStats: foeStats, targetStats: player.stats, targetDodging: player.dodging,
    attackerCritical: skill, adjustment: -50 - (player.avoidHit ?? 0),
  });
  const gate = Math.max(0, Math.min(100, 50 - 10 * (reflexes - 2))) / 100;
  const spans = [[row.minDamage, row.maxDamage], [row.minDamage2 ?? 0, row.maxDamage2 ?? 0], [row.minDamage3 ?? 0, row.maxDamage3 ?? 0]];
  let damage = 0;
  for (const [min, max] of spans) if (min > 0) damage += gate * chance * ((min + max) / 2);
  return { chance, perAttack: damage };
}

/** Mean health of a monster row: Range(minHealth, maxHealth + 1) (EnemyEntity.SetEnemyCareer :262). */
export const monsterHealth = (row) => (row.minHealth + row.maxHealth) / 2;
