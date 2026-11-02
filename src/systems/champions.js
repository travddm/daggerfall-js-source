// @ts-check
// ═══════════════════════════════════════════════════════════════════
// LOOT7 — CHAMPION FOES.
//
// The Loot arc (; - "Champion foes.
// Single named foes with visible traits (Fiery, Swift, Vampiric) and a
// guaranteed Rare"). About one foe in fifty of level 3 or more stands as
// a CHAMPION with one TRAIT: 1.4 times its health and its blows 15% harder,
// its trait on top, its name the trait's and its own. Its loot is
// its own roll (CHAMP-LOOT: no Rare is forced onto its body - Magic and Rare
// at half a plain foe's, its Legendary as LOOT7 left it: systems/loot/lootRarity.js
// championSource).
//
// WHO DECIDES. A dungeon's foes are its LAYOUT's, built on every client
// from the location (the elite's way): `markDungeonPromotions` (eliteFoes.js) marks the
// layout's records by a HASH of the location and the marker, so every
// client marks the same records with no wire word, and the mark rides
// the record (`src`) through a rebuild or a respawn. Each client stands a
// mark at its own build's level, and a class foe is built at its builder's
// level, so a player under CHAMPION_MIN_LEVEL stands no champion there; a
// room's shared base asks the mark again at the room's level
// (CHAMP-BASE, scenes/roomLootHost.js roomBodyBase). A foe in the street
// or a building is its OWNER's: `rollStreetPromotion` hashes it, and the foe
// record carries its trait (`cp`, net/wire.js validFoeRecord) to every
// puppet, which wears the same scaling - a puppet's blow resolved on my
// side is a champion's.
//
// OFF IS DFU EXACTLY: with the loot-rarity row off, no champion stands.
// ═══════════════════════════════════════════════════════════════════

import { lootRarityOn } from './loot/lootRarity.js';
import { PROMOTION, promotionHash, promotionTierOf, promotionTrait, scalePromoted } from './foe-promotion.ts';   // the tier's numbers and the one roll/scale path
import { foeTitle } from './foeTitle.js';   // FOE-TITLE: the names' one home
import { registerPlayerStruckListener, registerPlayerStrikeListener } from '../combat/formulas.js';
import { hurtPlayer } from '../characters/playerEntity.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobile/mobileTypes.js';
import { enemyDisplayName } from '../characters/enemy/enemyBasics.js';   // LOOT7-CHECK CHAMP-SAID: the name the death line says
import { popupMessage } from './notify.js';   // LOOT7-CHECK CHAMP-SAID: DaggerfallUI.PopupMessage, the live host's line
import { markUnquiet } from './revenant/unquietMark.js';   // UNQUIET (Revenants.md section 46): one champion in four carries the mark - its own, never a puppet's

/** Per mille of the foes that may be one that stand as a champion. */
export const CHAMPION_PER_MILLE = PROMOTION.champion.perMille;
/** A champion is a foe of this level or more. */
export const CHAMPION_MIN_LEVEL = PROMOTION.minLevel;
/** Every champion: its health times this, its blows times this. */
export const CHAMPION_HEALTH = PROMOTION.champion.health;
export const CHAMPION_DAMAGE = PROMOTION.champion.damage;
/** @typedef {{ id: string, name: string, text: string, damage?: number, health?: number, speed?: number, drink?: number, thorns?: number }} ChampionTrait */
/** The traits, in the wire's order (`cp` is the index). @type {ReadonlyArray<Readonly<ChampionTrait>>} */
export const CHAMPION_TRAITS = Object.freeze([
  Object.freeze({ id: 'mighty', name: 'Mighty', text: 'Its blows hit 20% harder', damage: 1.2 }),
  Object.freeze({ id: 'stalwart', name: 'Stalwart', text: 'It has 20% more health, on top of a champion\'s', health: 1.2 }),
  Object.freeze({ id: 'swift', name: 'Swift', text: 'It has 30 more Speed, so it closes in and attacks sooner', speed: 30 }),
  Object.freeze({ id: 'vampiric', name: 'Vampiric', text: 'It heals for half the damage it deals you', drink: 50 }),
  Object.freeze({ id: 'thorned', name: 'Thorned', text: 'Your hits on it hurt you for a seventh of their damage', thorns: 7 }),
]);
export const championTrait = (id) => CHAMPION_TRAITS.find((t) => t.id === id) ?? null;
export const championIndex = (id) => CHAMPION_TRAITS.findIndex((t) => t.id === id);
/** A foe's trait, when it stands as a champion, else null. */
export const championOf = (entity) => (entity?.champion ? championTrait(entity.champion) : null);
/** What a champion is called - its trait before its own name ("Mighty Orc Warlord"); FOE-TITLE: an elite's "Elite Orc
 *  Warlord" and a revenant's own name too (systems/foeTitle.js, the one home); anyone else's name as it was. */
export function championName(entity, base) {
  return foeTitle(entity, base);
}

/** AUDIT WB12d (D2): A FOE WITH A NAME OF ITS OWN - a feature's one foe that every line calls by it (WB12d's "the
 *  Summoner", scenes/riteHost.js) - its words as a line begins them, or null. Said with no article: "You see the
 *  Summoner.", "The Summoner just died.", "The Summoner (dead)". */
export function properName(entity) {
  const n = typeof entity?.properName === 'string' ? entity.properName : '';
  return n ? n[0].toUpperCase() + n.slice(1) : null;
}

/** THE STREET'S: an ordinary encounter's foe (never a quest's, a summons, an ally or a placed camp's - the caller says
 *  which) gets one draw from a hash of where it stands, its type and the pool's count of them - never a random draw: the
 *  pool's stream (its loot, its kit) draws as it did, and a test's seeded street stands the same foes every run. The
 *  draw lands on an elite, a champion with a trait index, or neither: `{ tier, trait }` or null. */
let _streetN = 0;
export function rollStreetPromotion(feet = null, mobileType = 0) {
  if (!lootRarityOn()) return null;
  const h = promotionHash(Math.round((Number(feet?.[0]) || 0) * 64), Math.round((Number(feet?.[2]) || 0) * 64), mobileType, ++_streetN, 0x57ee7);
  const tier = promotionTierOf(h);
  return tier ? { tier, trait: promotionTrait(h, CHAMPION_TRAITS.length) } : null;
}
/** Tests only: the street's count back to none. */
export function _resetStreetChampionsForTests() { _streetN = 0; }

/** The trait a champion's mark stands as on this entity, or null - applyChampion's gate: no trait, a foe under
 *  CHAMPION_MIN_LEVEL, the city watch, an ally, or the switch off. CHAMP-BASE:
 *  a class foe stands at its builder's level, so a room's shared base asks it again at the room's
 *  (scenes/roomLootHost.js roomBodyBase). */
export function championTraitFor(entity, traitIndex) {
  if (!entity || !Number.isInteger(traitIndex) || !lootRarityOn()) return null;
  const t = CHAMPION_TRAITS[traitIndex];
  if (!t || (entity.level | 0) < CHAMPION_MIN_LEVEL) return null;
  if (entity.mobileType === KNIGHT_CITY_WATCH || entity.team === 'PlayerAlly' || entity.mobileTeam === 'PlayerAlly') return null;
  return t;
}

/**
 * MAKE IT A CHAMPION - on its entity, in place, right after the entity is built and BEFORE its loot is rolled (the loot
 * reads the mark): its trait, twice its health (the Stalwart's half again more), its blows a quarter harder (the
 * Mighty's half again more) multiplied onto whatever `damageScale` it has (an elite's double stands under it), the
 * Swift's Speed. Nothing where championTraitFor answers none. Answers whether it stood as one. UNQUIET: `own` - one of
 * this pool's own (never a puppet, its owner's word): its mark drawn (systems/revenant/unquietMark.js).
 */
export function applyChampion(entity, traitIndex, { own = true } = {}) {
  const t = championTraitFor(entity, traitIndex);
  if (!t) return false;
  entity.champion = t.id;
  scalePromoted(entity, { health: CHAMPION_HEALTH * (t.health ?? 1), damage: CHAMPION_DAMAGE * (t.damage ?? 1) });
  if (t.speed && entity.stats) entity.stats.speed = Math.min(100, (entity.stats.speed ?? 50) + t.speed);
  if (own) markUnquiet(entity);   // UNQUIET: the mark that lets it rise
  return true;
}

// ── the traits that answer a blow ───────────────────────────────────
/** VAMPIRIC: a champion's blow that reached me (formulas.js's struck tail) heals it half of it. */
export function championStruck(attacker, target, damage) {
  const t = championOf(attacker);
  if (!t?.drink || !(damage > 0) || !target?.isPlayer || !(attacker.health > 0)) return;
  attacker.health = Math.min(attacker.maxHealth ?? attacker.health, attacker.health + Math.max(1, Math.round((damage * t.drink) / 100)));
}
/** THORNED: my blow that landed on a champion (formulas.js's strike tail) hurts me a seventh of it, through my one
 *  damage door - a hurt as any other, never a blow of a foe's. */
export function championStrike(attacker, target, damage) {
  const t = championOf(target);
  if (!t?.thorns || !(damage > 0) || !attacker?.isPlayer || attacker.peer) return;
  hurtPlayer(attacker, Math.max(1, Math.round(damage / t.thorns)));
}
export const CHAMPIONS = 'champions';
registerPlayerStruckListener(CHAMPIONS, championStruck);
registerPlayerStrikeListener(CHAMPIONS, championStrike);

// ── LOOT7-CHECK CHAMP-SAID: a champion said, on either skin ─────────
// Mac asked for "single named foes with visible traits", and a LIVING champion was named only on the enhanced skin's
// target frame (ui/hud/hudFoeTarget.js) and its plaque (the World Tooltips plaque is the enhanced skin's - ui/worldPlaque.js
// worldPlaqueOn): on the classic skin nothing said one stood until it died, and no screen anywhere said what its trait
// does (CHAMPION_TRAITS' `text` was read by nothing). So the first blow that lands EITHER WAY - its on me, or mine on
// it - says it on the line every skin draws (notify.js popupMessage: DaggerfallUI.PopupMessage, the line "%s just
// died." is said on), in two rows: who it is, then what its trait does. Once per champion (a rebuild or a load is a
// new one, and says it again at its first blow). The blow seams are the one home every pool already shares - the
// dungeon's, the street's, a building's, a puppet's - so no host stands it. Off, no champion stands and nothing is said.
/** The two rows a champion is said by - its name and that it stands as one, then what its trait does - or null. */
export function championLines(entity) {
  const t = championOf(entity);
  const base = t ? enemyDisplayName(entity.mobileType) : null;
  return base ? [`${championName(entity, base)} stands as a champion.`, `${t.text}.`] : null;
}
const _said = new WeakSet();
/** Say a champion's rows, once per champion (`say` the live host's line unless a caller hands its own). Answers
 *  whether they were said now. */
export function sayChampion(entity, say = popupMessage) {
  if (!entity || _said.has(entity)) return false;
  const lines = championLines(entity);
  if (!lines) return false;
  _said.add(entity);
  for (const line of lines) say(line);
  return true;
}
export const CHAMPIONS_SAID = 'champions-said';
// its blow that reached ME (never a peer's copy: another player's screen is theirs), and mine that landed on it
registerPlayerStruckListener(CHAMPIONS_SAID, (attacker, target, damage) => { if (damage > 0 && target?.isPlayer && !target.peer) sayChampion(attacker); });
registerPlayerStrikeListener(CHAMPIONS_SAID, (attacker, target, damage) => { if (damage > 0 && attacker?.isPlayer && !attacker.peer) sayChampion(target); });
