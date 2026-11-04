// @ts-check
// HUMANOID-LOOT: HOW MUCH OF A HUMANOID FOE'S LOOT REACHES ITS BODY - the player's choice.
// DFU gives every foe its whole loot table roll (EnemyEntity.cs SetEnemyCareer, LootTables.cs GenerateRandomLoot) and drops
// its whole worn kit on the corpse (EnemyDeath.cs l.108-123 unequips every piece and TransferAll moves it). The port cut
// both to a quarter for class, Orc, Centaur and human-affinity foes. The `humanoidLoot` pref (a Features row) says which:
// DFU's whole loot (the default) or the quarter cut. Online the room's answer is forced (onlineLane.js), so every
// player's foes carry one share. A leaf: the shelf only, so scenes/hostCombat.js can ask without a cycle.
import { getPref } from './uiPrefs.js';

export const HUMANOID_LOOT_PREF = 'humanoidLoot';
export const HUMANOID_LOOT_DEFAULT = 'dfu';
/** What share of a humanoid foe's item chance and worn pieces each stored choice keeps. */
export const HUMANOID_LOOT_SHARES = Object.freeze({ dfu: 1, cut: 0.25 });
/** The share for a stored choice (an unknown value reads as the default). */
export const humanoidLootShareFor = (/** @type {unknown} */ stored) =>
  HUMANOID_LOOT_SHARES[/** @type {'dfu' | 'cut'} */ (stored)] ?? HUMANOID_LOOT_SHARES[HUMANOID_LOOT_DEFAULT];
/** The share to roll with: the caller's own (a room's terms) when it names one, else the live choice, read at every call so
 *  the pick takes effect on the next foe. */
export const humanoidLootShare = (/** @type {number | undefined} */ named) =>
  named ?? humanoidLootShareFor(getPref(HUMANOID_LOOT_PREF));
/** The pieces of a worn kit that reach the body at `share`: all of them at 1 (no dice rolled), else a coin each. */
export const droppableKit = (
  /** @type {any[]} */ kit,
  /** @type {number} */ share,
  /** @type {() => number} */ rolls,
) => (share < 1 ? kit.filter(() => rolls() < share) : kit);
