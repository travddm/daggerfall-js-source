// The `untaken` mark. A source door marks every eligible piece it rolls `untaken`; the first take clears it. KIT-ROLL
// (foeLootCap.js rollCorpseKit) reads the mark to tell a body's rolled loot from the kit the foe wore, so the mark
// must keep clearing on a take whatever else listens to takes. It rides the piece (a saved field, a body's record, a
// peer's grant). The bad-luck drought that once cleared it as a side effect is gone (balance lane B4).

import { registerTakeListener } from '../inventory.js';

export const TAKEN_MARK = 'lootTakenMark';

/** A take: drop the `untaken` mark. Answers whether the piece carried it. */
/** @param {{ untaken?: boolean } | null | undefined} item */
export function clearUntaken(item) {
  if (!item || item.untaken !== true) return false;
  delete item.untaken;
  return true;
}

registerTakeListener(TAKEN_MARK, clearUntaken);
