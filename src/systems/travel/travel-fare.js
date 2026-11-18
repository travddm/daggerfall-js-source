// @ts-check
// A fast travel's fare, paid the way DFU's DeductFastTravelGold pays it, and paid back exactly when the journey fails
// before it arrives. The refund is the port's own: in DFU a journey's build cannot fail.
import { deductGoldPieces, deductGoldUndoable } from '../court.js';
import { goldPiecesOf, addGoldPieces } from '../inventory.js';
import { t } from '../textManager.js';

/** @typedef {{ piecesCost?: number, totalCost?: number }} TravelCost the travel popup's computed trip */

/** What the player reads when a journey's build failed and they are back where they set out. */
export const travelFailedText = () =>
  t('travel.failedReturned', 'The journey failed. You are back where you set out, and your fare was returned.');

/**
 * The fare of one journey. `pay` takes the inn nights from coin and the rest from coin or letters of credit (taverns take
 * only gold pieces). `refund` gives back exactly what `pay` took, once: the coins to the purse, each letter its value.
 * @param {any} player
 * @param {TravelCost} cost
 */
export function travelFare(player, { piecesCost = 0, totalCost = 0 }) {
  /** @type {(() => void) | null} */
  let undo = null;
  return {
    pay() {
      const purseBefore = goldPiecesOf(player);
      deductGoldPieces(player, piecesCost);
      const coinsTaken = purseBefore - goldPiecesOf(player);
      const rest = deductGoldUndoable(player, totalCost - piecesCost);
      undo = () => {
        if (coinsTaken > 0) addGoldPieces(player, coinsTaken);
        rest.undo();
      };
    },
    /** Answers whether anything was paid back. */
    refund() {
      if (!undo) return false;
      undo();
      undo = null;
      return true;
    },
  };
}
