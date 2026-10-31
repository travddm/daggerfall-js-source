// The guns (the Dwarven Thunderlock 560, the Dwemer Pellet 561, the Dwarven Pistolet 562) and the Hourlock were removed.
// A save written before keeps their records: the load must take it without throwing, drop every one of them from every
// list it holds (an equipped gun taken off its slot first) and leave every other item as it was.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotPlayer, restorePlayer, dropRetiredGunItems } from '../../src/systems/save/save.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { WEAPONS, WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { equipTableOf, EQUIP_SLOTS } from '../../src/systems/equip.js';

const mkEntity = (over = {}) => ({
  name: 'T', level: 3, health: 20, maxHealth: 30, fatigue: 100, magicka: 10, maxMagicka: 40,
  stats: { strength: 50 }, skills: new Array(35).fill(20), items: [], spells: [],
  ...over,
});
/** A gun's record as a save from before the removal holds it: its template, its make, its name, worn in the right hand. */
const thunderlock = { group: 'Weapons', templateIndex: 560, material: 4, name: 'Dwarven Thunderlock', value: 900, maxCondition: 4800, currentCondition: 4800, equipSlot: EQUIP_SLOTS.RightHand };
const pellets = { group: 'Weapons', templateIndex: 561, material: 0, name: 'Dwemer Pellet', stackCount: 12 };
const pistolet = { group: 'Weapons', templateIndex: 562, material: 4, name: 'Dwarven Pistolet', maxCondition: 4800, currentCondition: 4800 };
const hourlockBow = { ...createWeapon(WEAPONS.Long_Bow, WEAPON_MATERIALS.Dwarven), name: 'The Hourlock', rarity: 'gilded', gilded: 'the-hourlock' };

test('RETIRED GUNS: a save holding a Thunderlock (worn), Pellets, a Pistolet and the Hourlock loads without throwing; every one of them leaves every list, the worn gun leaves its slot, and every other item stays', () => {
  const sword = createWeapon(WEAPONS.Longsword, WEAPON_MATERIALS.Steel);
  const old = JSON.parse(JSON.stringify(snapshotPlayer(mkEntity({ items: [sword, thunderlock, pellets], wagonItems: [pistolet, hourlockBow] }), {})));
  assert.deepEqual(old.items.map((it) => it.templateIndex), [WEAPONS.Longsword, 560, 561], 'the save holds them');
  const loaded = mkEntity();
  assert.doesNotThrow(() => restorePlayer(loaded, old, null));
  assert.deepEqual(loaded.items.map((it) => it.templateIndex), [WEAPONS.Longsword], 'the pack keeps the sword alone');
  assert.deepEqual(loaded.wagonItems, [], 'the wagon keeps neither the Pistolet nor the Hourlock');
  assert.equal(equipTableOf(loaded)?.[EQUIP_SLOTS.RightHand] ?? null, null, 'no slot holds the dropped gun');
});

test('RETIRED GUNS: the drop answers how many went, in place, and leaves a list with none of them untouched', () => {
  const bow = createWeapon(WEAPONS.Long_Bow, WEAPON_MATERIALS.Iron);
  const list = [bow, { ...pellets }, { ...pistolet }, { ...hourlockBow }];
  assert.equal(dropRetiredGunItems(null, list), 3);
  assert.deepEqual(list, [bow]);
  assert.equal(dropRetiredGunItems(null, list), 0, 'a second run changes nothing');
});
