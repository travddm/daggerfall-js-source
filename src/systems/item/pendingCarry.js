// @ts-check
// CARRY-CLAIMS: WEIGHT ON ITS WAY TO THE PACK. A take from a shared container online is a claim: the piece leaves the
// pack while the room's authority judges it and comes back on the grant (scenes/roomLootHost.js for dungeon piles,
// systems/loot/claimLedger.js for bodies outdoors and interiors). The pack alone then weighed less than what would land,
// and a run of fast takes each passed the carry gate. DFU refuses a take past MaxEncumbrance
// (DaggerfallInventoryWindow.cs CanCarryAmount), so the gate (itemTransfer.js planTake) adds the claims in flight.
// Each kind of shared loot registers one provider under its own key, so a new context replaces its old one.
// Offline none is registered and nothing changes.
import { effectiveUnitWeightInKg, GOLD_PIECE_WEIGHT_KG, isGoldPieces } from '../inventory.js';

/** @type {Map<string, (entity: any) => number>} */
const _providers = new Map();

/** A kind of shared loot says how many kilograms of an entity's claims wait for a verdict. Null removes it. */
export function setPendingCarry(kind, provider) {
  if (typeof provider === 'function') _providers.set(kind, provider);
  else _providers.delete(kind);
}

/** Kilograms of `entity`'s claims in flight, summed over every kind, 0 when none. */
export function pendingCarryKg(entity) {
  if (!entity) return 0;
  let kg = 0;
  for (const provider of _providers.values()) {
    const v = provider(entity);
    if (Number.isFinite(v) && v > 0) kg += v;
  }
  return kg;
}

/** The weight of `n` of a piece as the pack weighs it: coin by the piece, the rest by its effective unit weight. */
export const pieceCarryKg = (item, n) =>
  n > 0 ? n * (isGoldPieces(item) ? GOLD_PIECE_WEIGHT_KG : effectiveUnitWeightInKg(item)) : 0;

/** The kilograms a run of claims will land: those not answered, not lapsed and not puts, by what each lifted (`give`). */
export function inFlightKg(entries) {
  let kg = 0;
  for (const e of entries) if (!e.put && !e.done && !e.lapsed) kg += pieceCarryKg(e.item, e.give);
  return kg;
}

/** Registers a host's claims map (claim id -> { item, give, lapsed }) under `kind` for `entity`, and answers the map, so
 *  the host's declaration stays one line. */
export function weighClaims(kind, entity, map) {
  setPendingCarry(kind, (e) => (e === entity ? inFlightKg(map.values()) : 0));
  return map;
}

/** The same for a claim ledger (systems/loot/claimLedger.js): answers the ledger. */
export function weighLedger(kind, entity, ledger) {
  setPendingCarry(kind, (e) => (e === entity ? ledger.pendingKg() : 0));
  return ledger;
}
