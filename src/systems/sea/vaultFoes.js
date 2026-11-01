// @ts-check
// ═══════════════════════════════════════════════════════════════════
// SEA-VAULTS: THE VAULT HALLS' FOES.
//
// A vault hall's layout draws its foes from its template's own tables (characters/dungeonEnemies.js), which are rats and
// bats as often as not. Every monster of the low tiers is swapped for one of its ring's high tier. The pick is pure, by the
// vault's id and the foe's index, so every client builds the same hall. A water marker keeps a water foe (the Dreugh, the
// Lamia). The human classes (Mage .. Knight, 128+) are kept: they are drawn at the player's own level, never a low tier.
// (Moved from the open zone's hall file when the zone was removed; the picks are unchanged.)
// ═══════════════════════════════════════════════════════════════════
import { WATER_SPECIES } from '../../characters/dungeonEnemies.js';   // RDBLayout's water species, one home
import { isClassEnemyId } from '../../characters/enemy/enemyBasics.js';   // DFU's class test (DaggerfallEntity.IsClassEnemyId): a mod's monster past 255 is no class

/** The sea's ring count: the Shallows (1) to the Abyss (4), the same four as systems/sea/etherRings.js. */
const VAULT_RINGS = 4;

/** The monsters a vault may hold, by ring (the deeper, the worse); `water` for a water marker. */
export const VAULT_FOES = Object.freeze({
  1: Object.freeze([9, 14, 19, 22, 24, 35, 36, 37, 38]),            // Werewolf, Wereboar, Mummy, Gargoyle, Orc Warlord, the four Atronachs
  2: Object.freeze([9, 14, 19, 22, 23, 24, 25, 26, 27, 28, 36]),    // + Wraith, Frost/Fire Daedra, Daedroth, Vampire
  3: Object.freeze([22, 23, 25, 26, 27, 28, 29, 30, 32]),           // + Daedra Seducer, Vampire Ancient, Lich
  4: Object.freeze([25, 26, 27, 29, 30, 31, 32, 33]),               // the Abyss: Daedra Lord, Ancient Lich among the Daedra and the undying
  water: Object.freeze([41, 42]),                                   // Dreugh, Lamia
});

const HIGH = new Set(Object.values(VAULT_FOES).flat());

/** Is this monster one of the high tiers a vault keeps as it is? (A human class always.) */
export const vaultKeeps = (/** @type {number} */ mobileType) => isClassEnemyId(mobileType) || HIGH.has(mobileType);

/** A 32-bit hash of two integers (the vault's id and a foe's index). */
const mix = (/** @type {number} */ a, /** @type {number} */ b) => {
  let h = (a ^ Math.imul(b + 0x7f4a7c15, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * A vault's foes with every low tier swapped for its ring's high tier: `enemies` the layout's records (each
 * `{ mobileType }`), `ring` the vault's tier (1 the Shallows .. 4 the Abyss), `seed` its id. Returns a new list (the
 * records copied, a swapped one with `vaultSwapped` set).
 * @param {any[] | null | undefined} enemies @param {number} ring @param {number} seed
 */
export function vaultFoes(enemies, ring, seed) {
  const tier = Math.max(1, Math.min(VAULT_RINGS, ring | 0 || 1));
  const pool = VAULT_FOES[/** @type {1 | 2 | 3 | 4} */ (tier)];
  return (enemies ?? []).map((e, i) => {
    if (!e || vaultKeeps(e.mobileType)) return e;
    const list = WATER_SPECIES.has(e.mobileType) ? VAULT_FOES.water : pool;
    return { ...e, mobileType: list[mix(seed >>> 0, i) % list.length], gender: 'unspecified', vaultSwapped: true };
  });
}
