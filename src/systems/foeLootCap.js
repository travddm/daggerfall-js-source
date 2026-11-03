// @ts-check
// ═══════════════════════════════════════════════════════════════════
// FOE LOOT: THE PLAIN LADDER, THE KIT AND THE SUMMON.
//
// THE PORT'S OWN, not DFU's: DFU has no ladder. B4 (tame loot and economy) removed the count cap FOE-CAP put on a plain
// foe's body (three pieces, five in an Elite Dungeon): a body carries what DFU's tables and the ladder's rolls gave it.
//
// WHO IS PLAIN. A foe with no title of its own - never an elite foe
// (`eliteFoe`), a LOOT7 champion (`champion`), a revenant (`revenant`) or
// a feature's named foe (`properName`), and never a BOSS by the ladder's
// own law (lootRarity.js corpseSource: a Daedra, or level BOSS_LEVEL and
// up). An Elite DUNGEON's ordinary foe (`elite`, the place's doubling -
// not an elite foe) is plain too, but keeps the ladder it already had.
//
// ONE STAMP. spawnEnemyLoot (scenes/hostCombat.js) decides once and writes `entity.plainLadder`, which a room's bonus
// reads. A plain foe's kit is rolled at its death (KIT-ROLL), by every body door.
// ═════════════════════════════════════════════════

import {
  corpseSource, lootRarityOn, rarityEligible, rollRarity, applyRarity, lastPass, legendaryFindMult, isGarment,
  cursePass,   // LOOT16
  damnPass,   // TRUE-CURSE
  socketPass,   // LOOT20
  weaponSocketPass,   // GEM1
  techniquePass,   // TECH1
} from './loot/lootRarity.js';
import { ENEMY_BASICS } from '../characters/enemy/enemyBasics.js';   // KIT-ROLL: the row every host hands its spawn
import { renownLootQuarters, lootEased } from './renownLoot.js';

/** THE PLAIN FOE'S LADDER (per mille of reaching AT LEAST the tier, lootRarity.js RARITY_WEIGHTS' shape). White is the
 *  rule; Magic (blue) rare - 5% at level 0, 19% at most; Rare (yellow) very rare - 0.6% to 3.8%; Legendary (orange)
 *  almost impossible - 0.015% to 0.3%. Aetheric and Artifact are never rolled by a ladder at all.
 *  LOOT-EASE: a quarter more blue, half again the yellow and the orange, than FOE-CAP's first numbers
 *  (4-15%, 0.4-2.5%, 0.01-0.2%) - the ladder Mac named kept in its order, the drought it made eased. */
export const PLAIN_FOE_RARITY_WEIGHTS = Object.freeze({
  magic:     Object.freeze({ base: 50,   perTier: 5,     cap: 190 }),
  rare:      Object.freeze({ base: 6,    perTier: 1.2,   cap: 38 }),
  legendary: Object.freeze({ base: 0.15, perTier: 0.075, cap: 3 }),
});
/** FOE-CAP's first numbers - the live game's ladder before LOOT-EASE, where RENOWN-LOOT's step starts. */
export const PLAIN_FOE_RARITY_WEIGHTS_BEFORE = Object.freeze({
  magic:     Object.freeze({ base: 40,  perTier: 4,    cap: 150 }),
  rare:      Object.freeze({ base: 4,   perTier: 0.8,  cap: 25 }),
  legendary: Object.freeze({ base: 0.1, perTier: 0.05, cap: 2 }),
});
const _ladders = new Map();
/** RENOWN-LOOT (systems/renownLoot.js): the plain ladder at `quarters` of LOOT-EASE's buff - every tier's base, step and
 *  cap moved that share of the way from FOE-CAP's first numbers: 4.5% blue at level 0 at Renown 1 online, LOOT-EASE's
 *  own (PLAIN_FOE_RARITY_WEIGHTS) offline and at Renown 20, 5.5% at Renown 40. One frozen ladder a share. */
export function plainFoeRarityWeights(quarters = renownLootQuarters()) {
  if (quarters === 4) return PLAIN_FOE_RARITY_WEIGHTS;
  let w = _ladders.get(quarters);
  if (!w) {
    const tier = (/** @type {'magic'|'rare'|'legendary'} */ t) => Object.freeze(Object.fromEntries(['base', 'perTier', 'cap']
      .map((k) => [k, lootEased(PLAIN_FOE_RARITY_WEIGHTS_BEFORE[t][k], PLAIN_FOE_RARITY_WEIGHTS[t][k], quarters)])));
    w = Object.freeze({ magic: tier('magic'), rare: tier('rare'), legendary: tier('legendary') });
    _ladders.set(quarters, w);
  }
  return w;
}

/** Has this foe a title of its own (and so no cap)? */
export const titledFoe = (entity) => !!(entity?.eliteFoe || entity?.champion || entity?.revenant || entity?.properName || entity?.worldBoss);

/**
 * THE RULE for one freshly built foe: whether its corpse rolls on the plain ladder - or null for a foe the rule leaves
 * alone (titled, or a boss). `elite` is the Elite Dungeon's mark, which the dungeon host writes before the loot is
 * rolled (dungeonContext.js applyEliteScaling). B4 removed the count cap this rule once carried.
 * @returns {{ plainLadder: boolean } | null}
 */
export function plainFoeLootRule(entity, basics = null) {
  if (!entity || titledFoe(entity)) return null;
  if (corpseSource(basics, entity.level, entity.mobileType).boss) return null;
  return { plainLadder: !entity.elite };
}

/**
 * RPT1026-PROGRESS (a private report: the Skull's copies were looted like any foe): AN ARTIFACT'S SUMMON CARRIES NOTHING. The Skull
 * of Corruption stands an allied copy of the nearest foe and the Sanguine Rose an allied Daedroth (artifactEffects.js,
 * through the enchant ctx's spawnAlliedFoe); DFU's CreateFoe gives the copy its kind's whole loot (SetEnemyCareer's
 * table, its kit) and its corpse is looted like any foe's - so a Skull that never breaks (Repairs Objects) set a copy of
 * a Daedra Lord on its original over and over and each copy's body was a Daedra Lord's loot. A summon's body is a
 * puppet's here (exteriorFoes.js "a PUPPET carries no loot"): stood, its carried list goes (its hand and its worn kit
 * still fight - the hand is `entity.weapon`, the worn set the equip table), and at its death whatever the death's
 * handlers and the kit's ladder lay on it goes too (capFoeLoot, the last word every body door asks). Port-Ledger A.
 * Answers `f`.
 */
export function summonedBody(f) {
  const e = f?.entity;
  if (!e) return f;
  e.summoned = true;
  e.items = [];
  return f;
}

/**
 * RPT1026-PROGRESS: AND EVERY OTHER PLAYER'S COPY OF IT. Online in a dungeon a summon is its player's loose stand
 * (SUMMON-SYNC): it rides the room's own lane (dungeonContext.js ownFrame, named in `lf`) and every other player in the
 * room stands it as a puppet built on their own machine - and that build rolls its kind's whole loot there
 * (buildFoeAt's spawnEnemyLoot), its death there its kit, food and card (applyFoeRecord's copy roll). So the summoner's
 * own body was bare and a friend's copy of it was a Daedra Lord's loot, the farm with a second player. The owner's frame
 * now names its summons beside its loose stands (`sm`, these numbers); a reader marks the puppet it stands for one
 * (markSummoned) - bare from then, and capFoeLoot empties its death's finds as it empties the summoner's. The mark
 * stays on the entity, so a puppet handed over (adoptOwn) streams on as a summon from its heir. The street's and a
 * building's lane needed none of this: a puppet there carries nothing (exteriorFoes.js WORLD6b B14).
 *
 * summonedWord: the frame's field for an own frame's records - `src` its `[foe, questTag]` pairs, `out` the records
 * beside them - `{ sm: [numbers] }`, or nothing when no summon rides.
 */
export function summonedWord(src, out) {
  const sm = [];
  src.forEach(([f, qt], k) => { if (!qt && f?.entity?.summoned === true && out[k]) sm.push(out[k].i); });
  return sm.length ? { sm } : {};
}

/** RPT1026-PROGRESS: a reader's record its owner's frame named a summon (`seqs`, the frame's `sm` through
 *  validLooseSeqs) - flagged `sm: 1` for the stand and the updates after it. Answers `r`. */
export function summonedRecord(r, seqs) {
  if (r && seqs?.has?.(r.i)) r.sm = 1;
  return r;
}

/** AUDIT RPT1026 F4 (SUMMON-BARE's left item): A SUMMON IS SAVED ONE, AND LOADED ONE. The street's and a building's pool
 *  save a living foe and re-mint it on a load (exteriorFoes.js snapshotWorld / restoreWorld) - its kind's loot rolled
 *  again, the save's list laid over it, and no mark: so a summon loaded stood as a foe, and its death's finds (a bear's
 *  meat, a card) lay on its body. savedSummon carries the mark in the foe's saved record `rec` (answers it);
 *  restoredSummon marks the foe a record carrying it stands (answers `f`, null kept null). */
export const savedSummon = (f, rec) => (f?.entity?.summoned === true ? { ...rec, summoned: true } : rec);
export const restoredSummon = (f, sf) => (sf?.summoned === true && f?.entity ? summonedBody(f) : f);

/** RPT1026-PROGRESS: a puppet whose record says it is a summon is one here too (summonedBody, once). Answers `f`. */
export function markSummoned(f, r) {
  if (r?.sm === 1 && f?.entity && f.entity.summoned !== true) summonedBody(f);
  return f;
}

/** A summon's body carries nothing at all (`summoned`): whatever its death's handlers laid on it goes. Any other body keeps
 *  what its rolls and handlers gave it (B4 removed the count cap). Answers the items taken off. */
export function capFoeLoot(entity) {
  if (entity?.summoned === true && Array.isArray(entity.items)) return entity.items.splice(0);   // RPT1026-PROGRESS: a summon's body (summonedBody)
  return [];
}

/**
 * KIT-ROLL (LOOT-EASE, 2026-10-05). LR4 rolls a foe's
 * ladder over what it CARRIES and never what it WEARS - a piece the ladder made would be fought with
 * (lootRarity.js rollCorpseLoot) - and a humanoid's droppable kit is 85-98% of the gear its body leaves: measured
 * through the spawn chain, that gear was Common 99 times in 100 at every level, the Iron and Steel blades and the
 * leather, chain and plate the kit is minted in, and nothing else. AT ITS DEATH NOBODY WEARS IT. Each piece of its kit
 * its body still carries rolls, once, on the PLAIN ladder (at the roller's Renown, RENOWN-LOOT) at the foe's own tier:
 * the source its carried loot rolled at the spawn (the row every host hands spawnEnemyLoot, ENEMY_BASICS by its mobile
 * type), the player's luck, the finders, the door's last pass. Every body door calls it BEFORE anything reads the
 * body's tiers - the chime (LR3), the sigil (SIGIL1), the cap. Off, nothing. Answers the pieces it laddered.
 *
 * AUDIT 625:
 *  - L1, THE KIT IS WHAT THE SPAWN'S ROLL LEFT UNMARKED. It was found by the foe's table (`equipTableOf`), object by
 *    object - and every restore lays the save's COPIES over a foe's list and leaves its table alone (the dungeon's
 *    in-place patch, the street's and the watch's re-spawn and overlay), so after any load no foe standing rolled its
 *    kit: the "only steel" back. The spawn's roll marks every piece it rolls `untaken` (LOOT8's mark, a saved field)
 *    and passes the worn kit by, so a rarity-eligible piece of a body WITHOUT the mark is its kit - and the mark rides
 *    every copy.
 *  - L2, A COPY IS LADDERED, never the live piece. The droppable cut shares its objects with the foe's table and its
 *    hand (`entity.weapon`), and a foe brought back to life in place (the save's rewind, the stream's un-death) fought
 *    on with the piece its death had laddered - LR4's own rule broken. The body now holds a marked copy; the table's
 *    piece is what it was minted.
 *  - L3, EVERY FOE. It was a plain foe's alone, and that flipped the order it was meant to
 *    keep: a champion's, an Elite Dungeon foe's and a boss's kit stayed Common - every humanoid's from level 18, when a
 *    class foe stands a boss (lootRarity.js BOSS_LEVEL) - so they left less colour than a plain foe of their kind. Every
 *    foe's kit rolls the plain ladder now, never a boss's multiplied one (`boss: false`) or an Elite Dungeon's quality;
 *    their better ladders stay their carried loot's. A revenant never: its list holds a player's own pieces.
 */
export function rollCorpseKit(entity, opts = {}) {
  const kit = [...rollKitPieces(entity, opts), ...rollKitGarments(entity, opts)];   // LOOT14: the garments after every draw the kit made
  cursePass(kit, opts.rolls ?? Math.random);   // LOOT16: a body's own Rares and Legendaries, one in twelve cursed - after all of it
  socketPass(kit, opts.rolls ?? Math.random);   // LOOT20: and a socket, after the curse
  weaponSocketPass(kit, opts.rolls ?? Math.random);   // GEM1: and a weapon's own sockets, after that (law 9)
  damnPass(kit, opts.rolls ?? Math.random);   // TRUE-CURSE: a cursed Legendary weapon damned, after every draw the kit made (law 9)
  techniquePass(kit, opts.rolls ?? Math.random);   // TECH1: and a weapon's technique, LAST of the kit's draws (law 9)
  return kit;
}
/** The first arc's kit roll, whole: every piece of the kit but its garments. */
function rollKitPieces(entity, { rolls = Math.random, luck = 50, quarters = undefined, find: findIn = undefined } = {}) {   // PARTY-LOOT: the roll's RENOWN-LOOT share and finders when named (a room's base), else the roller's
  if (!lootRarityOn() || !entity || !Array.isArray(entity.items) || entity.revenant) return [];
  const source = { ...corpseSource(ENEMY_BASICS[entity.mobileType] ?? null, entity.level, entity.mobileType), boss: false, weights: plainFoeRarityWeights(quarters) };   // RENOWN-LOOT: the death's roller's Renown; AUDIT 625 L3: the plain ladder for every foe
  const find = findIn ?? legendaryFindMult();
  const minted = [];
  entity.items.forEach((it, i) => {
    if (isGarment(it)) return;   // LOOT14: the kit's garments roll after all of this (rollKitGarments)
    if (!it || it.untaken === true || !rarityEligible(it)) return;   // AUDIT 625 L1: no mark - the kit the spawn's roll passed by
    const piece = { ...it, untaken: true };   // AUDIT 625 L2: a copy in the body; the table's piece stays as it was minted
    entity.items[i] = piece;
    const tier = rollRarity({ ...source, luck, find }, rolls);
    if (tier !== 'common') { applyRarity(piece, tier, rolls, null, { family: source.family ?? null }); minted.push(piece); }
  });
  lastPass(minted, rolls);
  return minted;
}
/** LOOT14 (the Loot arc II): THE KIT'S GARMENTS - the shirt, the breeches, the
 *  cloak a foe wore, on the same ladder and source as its kit (AUDIT 625's laws whole: unmarked is kit, a COPY laddered,
 *  every foe's, never a revenant's), each copy marked; then their own last pass. After every draw the kit made. */
function rollKitGarments(entity, { rolls = Math.random, luck = 50, quarters = undefined, find: findIn = undefined } = {}) {   // PARTY-LOOT: as rollKitPieces
  if (!lootRarityOn() || entity?.revenant || !Array.isArray(entity?.items)) return [];
  // the kit's own source, as its pieces' (AUDIT 625 L3: the plain ladder at the roller's Renown, never a boss's)
  const kit = corpseSource(ENEMY_BASICS[entity.mobileType] ?? null, entity.level, entity.mobileType);
  kit.boss = false;
  kit.weights = plainFoeRarityWeights(quarters);
  const find = findIn ?? legendaryFindMult();
  const dressed = [];
  entity.items.forEach((g, i) => {
    if (!isGarment(g) || g.untaken === true || !rarityEligible(g)) return;
    const copy = { ...g, untaken: true };
    entity.items[i] = copy;
    const rung = rollRarity({ ...kit, luck, find }, rolls);
    if (rung !== 'common') { applyRarity(copy, rung, rolls, null, { family: kit.family ?? null }); dressed.push(copy); }
  });
  lastPass(dressed, rolls);
  return dressed;
}
