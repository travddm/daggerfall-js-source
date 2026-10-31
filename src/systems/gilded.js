// @ts-check
// ═══════════════════════════════════════════════════════════════════
// GILDED1 - THE GILDED RUNG. Design and record:.
//
// ═══ GILDED ════════════════════════════════════════════════════════
//
// The ladder's TOP rung (systems/loot/lootRarity.js RARITIES: rank 6, over
// the Artifact's 5): a colour of its own - gold leaf, warm and bright -
// two stars for pips, a frame, a price. It sits over DFU's artifacts too:
// an artifact is a Daedra's gift for a quest done, there to be had by
// anyone who asks the right Prince. NOTHING ROLLS IT: the ladder's roll
// (applyRarity) takes the rolled tiers alone, so no drop, pile, shelf,
// Broker or Reforge ever lands on it.
//
// Each record is a STATIC ROLL - every number is its record's, minted whole
// and KNOWN, never rolled, reforged, honed, socketed, imprinted, cursed or
// enchanted - so the wire holds it to its record EXACTLY (validGildedMarks),
// as no other tier can be held.
//
// ═══ GILDED2: THE WORLD'S TWO ═══════════════════════════════════════
//
// GILDED2: each record is the last roll of a world boss's spoils - THE
// DRAGONFIRE OATH off the gate's Warden (systems/gate/gateSpoils.js), THE
// SUNKEN SOVEREIGN off the Old Coil's hoard for a ship that dealt
// (systems/serpent/serpentSpoils.js). DFU weapons both, minted by the game's
// own CreateWeapon (combat/enemyEquipment.js createWeapon). Each a STATIC
// ROLL, its lines the Legendary band's top, and its power the one thing
// nothing else has (DRAGONFIRE, UNDERTOW below; systems/loot/lootPowers.js
// does them). Measured:
//
// ═══ GILDED-RARER ══════════════════
//
// The owner: "Reduce the drop rate of gilded weapons across the board".
// The Dragonfire Oath one Warden in two hundred and fifty (was a hundred:
// a gate opens every two hours), the Sunken Sovereign one dealing ship's
// hoard in two hundred and fifty (was a hundred: a serpent every four).
// ═══════════════════════════════════════════════════════════════════

import { WEAPON_MATERIALS, WEAPONS } from '../characters/weapons.js';
import { createWeapon } from '../combat/enemyEquipment.js';   // GILDED2: a DFU weapon's own mint (CreateWeapon)
import { itemBaseValue } from './item/itemTemplates.js';
import { affixesWorth, validAffix, registerGildedRecords } from './loot/lootRarity.js';
import { SKILLS } from './skills.js';

/** The tier's id, as `item.rarity` wears it. */
export const GILDED = 'gilded';
/** What a Gilded piece adds to its price, over its make and its affixes - the Aetheric's 2500 five times over. */
export const GILDED_WORTH = 12500;
/** GILDED2: the share of the gate Warden's spoils that carry the Dragonfire Oath - one in two hundred and fifty (a gate every
 *  two hours; GILDED-RARER - it was one in a hundred). */
export const GATE_GILDED_CHANCE = 1 / 250;
/** GILDED2: the share of a dealing ship's serpent hoards that carry the Sunken Sovereign - one in two hundred and fifty (a
 *  serpent every four hours, a ship that stood never; GILDED-RARER - it was one in a hundred). */
export const SERPENT_GILDED_CHANCE = 1 / 250;

/** GILDED2: DRAGONFIRE - the Dragonfire Oath's power (systems/loot/lootPowers.js, kind 'dragonfire'). A landed blow on a foe of
 *  `group` burns it again for `share`% of the blow, and every OTHER foe of it within `metres` for as much - Akatosh's fire,
 *  which no Daedra resists (no element's share is taken of it). AUDIT WORLD-REWARDS B1: the struck one's burn is what
 *  reaches a body the relay runs (the gate's Warden and his host) - owed to its blow's own claim,
 *  as Open Hand's second blow is (playerDoor.js oweFoe); the burst on the others reaches only the foes the world runs.
 *  Read once at import, frozen. */
export const DRAGONFIRE = Object.freeze({
  name: 'Dragonfire', kind: 'dragonfire', group: 'daedra', share: 33, metres: 3,
  brief: 'Daedra burn +33%, and all in 3m',   // inside the card's row (sigilSets.js BRIEF_MAX)
  text: 'Each hit on a Daedra burns it with Dragonfire for a third of the damage, and burns every other Daedra within 3 m for the same. No Daedra resists it',
});
/** GILDED2: UNDERTOW - the Sunken Sovereign's power (systems/loot/lootPowers.js, kind 'undertow'). Each of its blows that LANDS on
 *  a foe drags it deeper: its next blows on that foe strike `pct`% harder for each landed before, up to `max`, while the
 *  tide holds - a foe it has not struck for `seconds` is let go (AUDIT WORLD-REWARDS B4: a body kept for a whole fight, a
 *  crystal of the next Reckoning, kept its stacks for good); a foe it fells gives `heal`% of my health back. Read once at
 *  import, frozen. */
export const UNDERTOW = Object.freeze({
  name: 'Undertow', kind: 'undertow', pct: 10, max: 5, seconds: 6, heal: 10,
  brief: '+10%/hit on a foe; kills heal',   // inside the card's row (sigilSets.js BRIEF_MAX)
  text: 'Each hit drags the foe deeper: +10% damage to your next hits on it for 6 s, up to +50%. A kill heals you for 10% of your health',
});

/** A record's line, frozen. */
const line = (id, value, param) => Object.freeze(param === undefined ? { id, value } : { id, param, value });

/** GILDED2: THE DRAGONFIRE OATH - the gate Warden's. A Daedric Dai-Katana (two hands, Long Blade): an Akaviri Dragonguard's
 *  blade, carried through the first gate and never carried back. Its lines the Legendary band's top; its power DRAGONFIRE
 *  (AUDIT WORLD-REWARDS B1: its fourth line Endurance, no longer a slayer of the Daedra - the power's burn on the struck
 *  Daedra is its edge there now, and the two together were three quarters over the best of the melee). */
export const DRAGONFIRE_OATH = Object.freeze({
  id: 'the-dragonfire-oath',
  name: 'The Dragonfire Oath',
  group: 'Weapons',
  templateIndex: WEAPONS.Dai_Katana,
  material: WEAPON_MATERIALS.Daedric,
  affixes: Object.freeze([
    line('damage', 40),
    line('stat', 15, 'strength'),
    line('skill', 30, SKILLS.LongBlade),
    line('stat', 15, 'endurance'),
  ]),
  power: DRAGONFIRE,
  lore: 'A Dragonguard carried it through the first gate and never carried it back. The Deadlands blackened its steel; the Dragonfire in its gilding never went out.',
  hint: 'Said to fall from the Warden of the Burning Gate, once in a long while',
});
/** GILDED2: THE SUNKEN SOVEREIGN - the Old Coil's. An Ebony Saber (one hand, Long Blade - a shield beside it): a Sentinel
 *  admiral's, swallowed with her flagship. */
export const SUNKEN_SOVEREIGN = Object.freeze({
  id: 'the-sunken-sovereign',
  name: 'The Sunken Sovereign',
  group: 'Weapons',
  templateIndex: WEAPONS.Saber,
  material: WEAPON_MATERIALS.Ebony,
  affixes: Object.freeze([
    line('damage', 40),
    line('stat', 15, 'agility'),
    line('skill', 30, SKILLS.LongBlade),
    line('leech', 10),
  ]),
  power: UNDERTOW,
  lore: 'A Sentinel admiral\'s saber, swallowed with her flagship off Stros M\'kai. The Old Coil gave back only the blade, and the sea never touched its gilding.',
  hint: 'Said to lie in the Old Coil\'s belly, once in a long while',
});

/** EVERY GILDED RECORD - the gate's and the serpent's; the one list every reader asks. */
/** @type {readonly GildedRecord[]} */
export const GILDED_RECORDS = Object.freeze([DRAGONFIRE_OATH, SUNKEN_SOVEREIGN]);
export const gildedById = (id) => GILDED_RECORDS.find((r) => r.id === id) ?? null;
/** The record AN ITEM was minted to, or null. */
export const gildedRecordOf = (item) => gildedById(item?.gilded);
/** Is this a Gilded piece (its tier's own field)? */
export const isGilded = (item) => item?.rarity === GILDED;
// the ladder reads a Gilded piece's power and lore through these (it imports nothing of this file - this file imports it)
registerGildedRecords({ powerOf: (id) => gildedById(id)?.power ?? null, loreOf: (item) => gildedRecordOf(item)?.lore ?? null });

/** @typedef {{ id: string, name: string, group: string, templateIndex: number, material: number, affixes: readonly any[], power: any, lore: string, hint?: string }} GildedRecord */
/**
 * Mint a record as an item: a DFU weapon's own mint (CreateWeapon - its make's value, its span and its condition), its
 * name, its tier, its lines (a copy), KNOWN, and its price. A fresh item every call.
 * @param {GildedRecord} r
 */
export function mintGilded(r) {
  const item = createWeapon(r.templateIndex, r.material);
  const affixes = r.affixes.filter(validAffix).map((a) => ({ ...a }));
  item.name = r.name;
  item.rarity = GILDED;
  item.gilded = r.id;
  item.affixes = affixes;
  item.isIdentified = true;
  item.value = itemBaseValue(item) + affixesWorth(affixes) + GILDED_WORTH;
  return item;
}
/** GILDED2: the gate Warden's spoils' last roll - null most times; else the Dragonfire Oath. One draw, always. */
export function rollDragonfireOath(rolls = Math.random) {
  return rolls() < GATE_GILDED_CHANCE ? mintGilded(DRAGONFIRE_OATH) : null;
}
/** GILDED2: a dealing ship's serpent hoard's last roll - null most times; else the Sunken Sovereign. One draw, always. */
export function rollSunkenSovereign(rolls = Math.random) {
  return rolls() < SERPENT_GILDED_CHANCE ? mintGilded(SUNKEN_SOVEREIGN) : null;
}

/** The fields a static roll keeps off itself: every mark another door lays on a piece (a sigil, a Legendary's or an
 *  Aetheric's record, the Reforge's line, imprint, hones and socket, a curse, an Exalted's line) - each would make it
 *  something its record is not. */
const NEVER_ON_GILDED = Object.freeze(['sigil', 'legendary', 'aetheric', 'imprint', 'cursed', 'socket', 'sockets', 'reforged', 'reforges', 'honed', 'exalted']);   // GEM1: nor a socket list; REFORGE-REPLACE: nor the Reforge's count

/**
 * THE MARKS AGREE WITH THE ITEM (the wire's check - systems/loot/loot.js validLootItem, beside the Aetheric's validSetMarks):
 * a Gilded piece only as its record mints it - a record that exists, its group, its template and its make, its lines
 * EXACTLY its record's (a static roll has no band to sit inside: one number off is a forgery), and nothing else laid on
 * it, no DFU enchantment among it. A piece that names no Gilded record and wears no Gilded tier passes untouched.
 * Answers the item or null.
 * @param {any} item an item whose fields are each their declared kind (itemFields.js validItemFields)
 */
export function validGildedMarks(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.rarity !== GILDED && item.gilded == null) return item;
  const r = gildedRecordOf(item);
  if (!r || item.rarity !== GILDED || r.group !== item.group || r.templateIndex !== item.templateIndex || item.material !== r.material) return null;
  const want = r.affixes, have = Array.isArray(item.affixes) ? item.affixes : [];
  if (have.length !== want.length) return null;
  for (let i = 0; i < want.length; i++) {
    const a = have[i], w = want[i];
    if (a?.id !== w.id || (a.param ?? null) !== (w.param ?? null) || a.value !== w.value) return null;
  }
  for (const k of NEVER_ON_GILDED) if (item[k] != null) return null;
  if (item.enchantments?.length || item.customEnchantments?.length) return null;
  return item;
}
