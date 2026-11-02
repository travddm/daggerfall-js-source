// Elite and champion foes: the two tiers of a promoted foe, and the one path that rolls, marks and scales them.
//
// A promoted foe is rare, marked on screen, and has stats of its own: an elite stands at about twice its kind's health
// and a third more damage, a champion at a smaller step and one trait (systems/champions.js). A promoted foe takes no
// other foe layer: the hero's threat (systems/heroThreat.js) and a place's scaling skip it, so what its tier says is
// what applies. Loot differs by tier and lives with the tier (eliteFoes.js, champions.js).
//
// The roll is one draw per foe from a hash of where the foe stands, so every client that builds the same foe list marks
// the same records without a message: the draw lands in the elite band, the champion band, or neither.

export type PromotionTier = 'elite' | 'champion';

/** Per mille of eligible foes that stand as each tier, and the tier's health and damage factors. */
export const PROMOTION = Object.freeze({
  /** A promoted foe is a foe of this level or more, so a new character's first road holds none. */
  minLevel: 3,
  elite: Object.freeze({ perMille: 10, health: 2, damage: 1.3 }),
  champion: Object.freeze({ perMille: 20, health: 1.4, damage: 1.15 }),
});

/** FNV-1a over a few integers: the same answer on every client and every load. */
export function promotionHash(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    let v = Math.trunc(Number(part) || 0) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      v >>>= 8;
    }
  }
  return h >>> 0;
}

/** The tier a hash rolls: the elite band first, then the champion band, else none. */
export function promotionTierOf(hash: number): PromotionTier | null {
  const m = hash % 1000;
  if (m < PROMOTION.elite.perMille) return 'elite';
  if (m < PROMOTION.elite.perMille + PROMOTION.champion.perMille) return 'champion';
  return null;
}

/** The champion trait index a hash picks, out of `traits` traits. */
export const promotionTrait = (hash: number, traits: number): number => (hash >>> 10) % traits;

type Scalable = { maxHealth?: number; health?: number; healthMult?: number; damageScale?: number };

/**
 * Multiply a built foe's health and blows by a tier's factors (or the caller's, for a trait or a dungeon's own step).
 * The health is written on `healthMult` too, which ai/tells.js divides out to get the kind's own health.
 * `ownHealth` false stands a peer's puppet: its maximum health is its owner's word, so only the blows scale.
 */
export function scalePromoted(
  entity: Scalable,
  { health, damage, ownHealth = true }: { health: number; damage: number; ownHealth?: boolean },
): void {
  if (ownHealth) {
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * health));
    entity.health = entity.maxHealth;
    entity.healthMult = (entity.healthMult ?? 1) * health;
  }
  const prior =
    Number.isFinite(entity.damageScale) && (entity.damageScale as number) > 0 ? (entity.damageScale as number) : 1;
  entity.damageScale = prior * damage;
}

export type PromotionRecord = {
  mobileType?: number;
  allied?: boolean;
  reaction?: string;
  eliteFoe?: boolean;
  eliteSeed?: number;
  champion?: number | null;
};

const keyNumber = (key: string | number): number => {
  if (typeof key === 'number') return key;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return h;
};

/**
 * Mark the promoted foes of a dungeon's foe records in place, from a hash of the place and the record's position, so every
 * client marks the same records. An elite mark sets `eliteFoe` and `eliteSeed`; a champion mark sets `champion` to a trait
 * index. A record already marked, an ally, a passive foe, and (for an elite) a kind under the level floor are left alone.
 * Returns how many records were marked.
 */
export function markPromotions(
  records: PromotionRecord[],
  locationKey: string | number,
  opts: {
    eliteOpen: boolean;
    championOpen: boolean;
    traits: number;
    kindLevel: (mobileType: number | undefined) => number;
    eliteSeed: (index: number) => number;
  },
): number {
  if (!Array.isArray(records)) return 0;
  const key = keyNumber(locationKey);
  let marked = 0;
  records.forEach((record, index) => {
    if (!record || record.allied || record.reaction === 'passive' || record.eliteFoe || record.champion != null) return;
    const hash = promotionHash(key, index, 0x10071);
    const tier = promotionTierOf(hash);
    if (tier === 'elite' && opts.eliteOpen && opts.kindLevel(record.mobileType) >= PROMOTION.minLevel) {
      record.eliteFoe = true;
      record.eliteSeed = opts.eliteSeed(index);
      marked++;
    } else if (tier === 'champion' && opts.championOpen) {
      record.champion = promotionTrait(hash, opts.traits);
      marked++;
    }
  });
  return marked;
}
