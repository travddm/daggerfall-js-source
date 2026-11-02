// THE HOST'S WORD AGAINST STORING: the inventory window asks the host before anything goes into storage (the wagon, a
// companion's pack, a ship's hold, a chest), and the two transfer laws refuse a store the window says is refused. With no
// host word, nothing is refused. Taking out of storage is never asked. (systems/inventorySession.js storeRefusalOf,
// systems/item/itemTransfer.js planStore and planDropGold.)
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeRefusalOf } from '../../src/systems/inventorySession.js';
import { planStore, planDropGold, planTake } from '../../src/systems/item/itemTransfer.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';

const sword = () => createWeapon(120, 3, () => 0.5);

test('the window asks the host only when the destination is storage - the wagon, or a list marked `storage` - and says nothing without a host word', () => {
  const no = () => 'the host says no';
  assert.equal(storeRefusalOf({ storeRefusal: no }, { usingWagon: true }), 'the host says no', 'the wagon');
  assert.equal(
    storeRefusalOf({ storeRefusal: no, loot: { storage: true, playerOwned: true } }, {}),
    'the host says no',
    "a companion's pack, a hold, a chest",
  );
  assert.equal(storeRefusalOf({ storeRefusal: no }, {}), null, 'the ground');
  assert.equal(storeRefusalOf({ storeRefusal: no, loot: { playerOwned: false } }, {}), null, 'a corpse, a pile');
  assert.equal(
    storeRefusalOf({ storeRefusal: no, loot: { storage: true } }, { chooseOne: true }),
    null,
    'a choose-one list',
  );
  assert.equal(storeRefusalOf({}, { usingWagon: true }), null, 'no host word: stored');
  assert.equal(storeRefusalOf({ loot: { storage: true } }, {}), null, 'no host word: stored in a chest');
  assert.equal(storeRefusalOf({ storeRefusal: () => null }, { usingWagon: true }), null, 'a host that does not refuse');
});

test('planStore and planDropGold refuse a store the window says is refused, in its own words; taking out of storage is never refused', () => {
  const s = sword();
  const no = planStore(s, { usingWagon: true, storeRefusal: 'locked' });
  assert.deepEqual(no, { ok: false, refusal: { reason: 'store', text: 'locked' } });
  assert.equal(planStore(s, { usingWagon: true }).ok, true, 'not refused: stored');
  const gold = planDropGold('100', { carried: 500, usingWagon: true, storeRefusal: 'locked' });
  assert.deepEqual([gold.ok, gold.refusal], [false, { reason: 'store', text: 'locked' }]);
  assert.equal(planDropGold('100', { carried: 500, usingWagon: true }).ok, true);
  assert.equal(planTake(s, { usingWagon: true }).ok, true, 'out of the wagon: never refused');
});
