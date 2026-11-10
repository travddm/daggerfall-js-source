// Whose shelves a shop has online, from the server profile (net/profile/profileKeys.ts shop.sharedShelf). DFU gives each
// player their own: a shelf is rolled for the player when the day turns, sells out as it is bought, and nobody else's
// purchases show on it (PlayerActivate.cs ActivateLootContainer, DaggerfallLoot.StockShopShelf). By default online plays
// the same. The option makes a building's shelf the room's: the first opener's roll is everyone's list, and its endless
// rows (the bag, the campfire, rations, lockpicks) never sell out and are never bought back.
//
// A piece sold at a counter is gone in DFU: its trade window clears the merchant's basket when a sale is confirmed
// (DaggerfallTradeWindow.cs ConfirmTrade, remoteItems.Clear()). The port put sold pieces on the shop's open shelf, so a
// mistaken sale could be bought back. The `soldGoodsOnShelf` pref (a Features row, sold-goods-on-shelf-row.ts) keeps that:
// off is DFU's, on is the shelf. Pinned off online (net/profile/officialProfile.ts).

import { onlineRule } from './online/serverProfile.ts';
import { getPref } from './uiPrefs.js';

/** Whether a shop's shelves are shared by everyone in the building online (shop.sharedShelf). */
export const shopShelvesShared = (): boolean => onlineRule('shop.sharedShelf') === true;

export const SOLD_GOODS_ON_SHELF_PREF = 'soldGoodsOnShelf';

/** Whether a sold piece lands on the shop's open shelf. Read at every sale. */
export const soldGoodsStayOnShelf = (): boolean => getPref(SOLD_GOODS_ON_SHELF_PREF) === true;
