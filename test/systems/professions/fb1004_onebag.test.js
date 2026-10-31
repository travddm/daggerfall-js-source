// ONE-BAG (2026-10-04, Mac: "Right, you shouldnt be able to hold multiple gathering bags"). BAG-SHELF put the Materials
// Bag on every General Store shelf and ENDLESS-STOCK made it never sell out, so a character could buy one after another.
// A second bag is refused now wherever one is taken - the take ladder every pickup, quick loot and both trade windows'
// Buy basket run (systems/item/itemTransfer.js planTake), and the keyed shelf's purchase (scenes/worldModes.js doBuy) - while
// another is held in the pack, a trade's basket or the wagon (bible/01-Overview/bugs/Field-Bugs-2026-10-04.md).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../../../src/systems/professions/profTemplates.js';
import { stockShopShelf } from '../../../src/systems/shopStock.js';
import { BUILDING_TYPES } from '../../../src/world/buildingNames.js';
import { BAG_WORDS, isBagItem, holdsOtherBag } from '../../../src/net/bagLaw.js';
import { planTake, REFUSAL } from '../../../src/systems/item/itemTransfer.js';
import { mintMaterialItem } from '../../../src/systems/professions/profItems.js';
import { decorStandOf } from '../../../src/systems/decor/decorItems.js';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const where = globalThis.location;
afterEach(() => { globalThis.location = where; });
/** A bag off an online General Store's shelf - the record a purchase takes. */
function shelfBag() {
  globalThis.location = { search: '?online' };
  const bag = stockShopShelf({ buildingType: BUILDING_TYPES.GeneralStore, quality: 10 }, { items: [], level: 1 }, { rolls: () => 0.5, torchesFromItems: false }).find(isBagItem);
  assert.ok(bag, 'the shelf shelves one');
  return bag;
}
const body = ({ pack = [], wagon = [] } = {}) => ({ stats: { strength: 50 }, items: pack, wagonItems: wagon, goldPieces: 0 });

test('ONE-BAG: a bag off the shelf is taken by a character with none, and refused - in its own words - to one that holds a bag in its pack or its wagon (mutants: the refusal gone; the wagon unread)', () => {
  const none = body();
  assert.equal(planTake(shelfBag(), { bag: none.items, entity: none }).ok, true, 'the first bag');
  const packed = body({ pack: [shelfBag()] });
  const r = planTake(shelfBag(), { bag: packed.items, entity: packed });
  assert.deepEqual([r.ok, r.refusal], [false, REFUSAL.secondBag]);
  assert.equal(r.refusal.text, 'You already have a Materials Bag.');
  assert.equal(BAG_WORDS.second, r.refusal.text);
  const carted = body({ wagon: [shelfBag()] });
  assert.equal(planTake(shelfBag(), { bag: carted.items, entity: carted }).refusal, REFUSAL.secondBag, 'one in the wagon is held too');
});

test('ONE-BAG: the trade windows\' Buy basket - pack and basket together - takes one bag, never a second staged beside it (mutants: the refusal gone)', () => {
  const e = body();
  const basket = [shelfBag()];
  assert.equal(planTake(shelfBag(), { bag: [...e.items, ...basket], entity: e }).refusal, REFUSAL.secondBag, 'a second staged in the same purchase');
});

test('ONE-BAG: the bag being taken is not "another" - the wagon\'s own bag comes back into an empty pack, and nothing but a bag is ever refused for one (mutants: the bag counted against itself; every take refused)', () => {
  const bag = shelfBag();
  const e = body({ wagon: [bag] });
  assert.equal(planTake(bag, { bag: e.items, entity: e }).ok, true, 'from the wagon to the pack');
  const held = body({ pack: [shelfBag()] });
  assert.equal(planTake(mintMaterialItem('log:oak'), { bag: held.items, entity: held }).ok, true, 'a log, beside a bag');
  assert.deepEqual([holdsOtherBag([[bag]], bag), holdsOtherBag([[bag], null], shelfBag()), holdsOtherBag(null, bag)], [false, true, false]);
});

test('AUDIT ONE-BAG 1: a bag out of the character\'s own wagon is never refused - two held from before, both carted, come back out one after the other; a bag from anywhere else is still refused beside one (mutants: the wagon\'s own refused)', () => {
  const a = shelfBag(), b = shelfBag();
  const e = body({ wagon: [a, b] });
  assert.equal(planTake(a, { bag: e.items, entity: e }).ok, true, 'the first out of the wagon');
  e.wagonItems.splice(e.wagonItems.indexOf(a), 1); e.items.push(a);
  assert.equal(planTake(b, { bag: e.items, entity: e }).ok, true, 'the second, though the pack holds the first');
  assert.equal(planTake(shelfBag(), { bag: e.items, entity: e }).refusal, REFUSAL.secondBag, 'a third, off a shelf, refused');
});

test('AUDIT ONE-BAG 2: the Materials Bag is never set out as a piece of decor - it would leave the pack and come back past the take ladder (mutants: the bag a piece)', () => {
  assert.equal(decorStandOf(shelfBag()), null);
  assert.notEqual(decorStandOf(mintMaterialItem('log:oak')), null, 'an Oak Log of the same group still stands - the rule asks the bag alone');
});
