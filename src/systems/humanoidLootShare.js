// @ts-check
// HUMANOID-LOOT: how much of a humanoid foe's loot reaches its body. DFU gives every foe its whole table roll and drops
// its whole worn kit (EnemyDeath.cs l.108-123); the port cut both to a quarter. The `humanoidLoot` pref (a Features row)
// picks: DFU's whole loot (default) or the cut. Online the lane forces one answer (onlineLane.js). A leaf, so
// scenes/hostCombat.js can ask without a cycle.
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
