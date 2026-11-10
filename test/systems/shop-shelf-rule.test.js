// A shop's shelf online (systems/shop-shelf-rule.ts, net/profile/profileKeys.ts shop.sharedShelf) and where a sold piece
// goes (the same module): DFU's own shelf for each player and DFU's cleared basket by default; the shared
// shelf and the shelved sale as options.
import '../../src/systems/professions/profTemplates.js';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { shopShelvesShared, soldGoodsStayOnShelf } from '../../src/systems/shop-shelf-rule.ts';
import { stockShopShelf, restockEndless, shopBuysItem, landSoldAt } from '../../src/systems/shopStock.js';
import { interiorLootRecords, applyInteriorLoot } from '../../src/world/interior/interiorShared.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
import { isBagItem } from '../../src/net/bagLaw.js';
import { setSharedClock } from '../../src/systems/worldTick.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import { profileKeyOf } from '../../src/net/profile/profileKeys.ts';
import { playByRules } from '../profileRules.mjs';

const where = globalThis.location;
afterEach(() => {
  globalThis.location = where;
  setSharedClock(null);
});
/** A General Store's first shelf, online, as worldModes.js openShelf stocks it. */
function onlineShelf() {
  globalThis.location = /** @type {any} */ ({ search: '?online' });
  setSharedClock(() => 1000);
  return stockShopShelf(
    { buildingType: BUILDING_TYPES.GeneralStore, quality: 10 },
    { items: [], level: 1 },
    { rolls: () => 0.5, torchesFromItems: false, shelfIndex: 0 },
  );
}
const piece = (name) => ({ name, group: 'Weapons', templateIndex: 113, value: 50, stackCount: 1 });

test("the key: shop.sharedShelf is DFU's own shelf for each player online by default", () => {
  const key = profileKeyOf('shop.sharedShelf');
  assert.deepEqual([key?.dfu, key?.online, key?.offline], [false, false, false]);
  assert.equal(shopShelvesShared(), false);
});

test("online by default a shelf is the player's own: the room is told nothing of it, and the room's word never lands on it", () => {
  const ctx = { shelves: [{ items: [piece('Mine')], stockedDate: 5 }], containers: [] };
  assert.deepEqual(interiorLootRecords(ctx, ['shelf:0']), []);
  const n = applyInteriorLoot(ctx, [{ k: 'shelf:0', r: [piece('Theirs')], d: 5 }], { today: 5 });
  assert.equal(n, 0);
  assert.deepEqual(
    ctx.shelves[0].items.map((it) => it.name),
    ['Mine'],
  );
});

test("with the server profile's option, a shelf the room has opened is the room's, as before", (t) => {
  playByRules(t, { 'shop.sharedShelf': true });
  const ctx = { shelves: [{ items: [piece('Mine')], stockedDate: 5 }], containers: [] };
  assert.equal(interiorLootRecords(ctx, ['shelf:0']).length, 1);
});

test('online by default a bag bought is gone from the shelf, as DFU sells out, and a shop buys one back', () => {
  const shelf = onlineShelf();
  const bag = shelf.find(isBagItem);
  assert.ok(bag, 'a General Store stocks one');
  shelf.splice(shelf.indexOf(bag), 1);
  assert.equal(restockEndless(shelf, [bag]), 0);
  assert.equal(shelf.some(isBagItem), false, 'sold out until the day turns');
  assert.equal(
    shopBuysItem(BUILDING_TYPES.GeneralStore, bag),
    true,
    'a shop buys a bag back, as it buys any piece of its kind',
  );
});

test('with the shared shelf, the endless rows stand back and are never bought back', (t) => {
  playByRules(t, { 'shop.sharedShelf': true });
  const shelf = onlineShelf();
  const bag = shelf.find(isBagItem);
  shelf.splice(shelf.indexOf(bag), 1);
  assert.equal(restockEndless(shelf, [bag]), 1);
  assert.equal(shopBuysItem(BUILDING_TYPES.GeneralStore, bag), false);
});

test("a sold piece is gone by default (DaggerfallTradeWindow.ConfirmTrade clears the merchant's basket); the Features row shelves it", (t) => {
  assert.equal(soldGoodsStayOnShelf(), false);
  const shelf = [];
  assert.equal(landSoldAt(shelf, piece('Sold')), false);
  assert.equal(shelf.length, 0);
  setPref('soldGoodsOnShelf', true);
  t.after(() => setPref('soldGoodsOnShelf', false));
  assert.equal(landSoldAt(shelf, piece('Sold')), true);
  assert.equal(shelf.length, 1);
});
