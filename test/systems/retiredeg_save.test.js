// The Elite Gates were removed: the Weir Key (template 575) and the Battlemage's Panoply (Aetheric records `panoply-*`,
// sigil set 'panoply') with them. A save written before keeps their records: the load must take it without throwing,
// drop every one of them from every list it holds (a worn piece taken off its slot first) and from the rooms' placed
// things, and leave every other item as it was.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotPlayer, restorePlayer, dropRetiredEgItems } from '../../src/systems/save/save.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { WEAPONS, WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { equipTableOf, EQUIP_SLOTS } from '../../src/systems/equip.js';

const mkEntity = (over = {}) => ({
  name: 'T', level: 3, health: 20, maxHealth: 30, fatigue: 100, magicka: 10, maxMagicka: 40,
  stats: { strength: 50 }, skills: new Array(35).fill(20), items: [], spells: [],
  ...over,
});
/** A Weir Key's record as a save from before the removal holds it. */
const weirKeys = { group: 'UselessItems2', templateIndex: 575, name: 'Weir Key', stackCount: 3 };
/** A Panoply piece as the Aetheric mint made it: the record's id and the set's sigil, worn on the chest. */
const cuirass = { group: 'Armor', templateIndex: 102, material: 0x0209, name: "The Battlemage's Cuirass", aetheric: 'panoply-cuirass', sigil: { set: 'panoply', party: false, xp: 0 }, maxCondition: 3000, currentCondition: 3000, equipSlot: EQUIP_SLOTS.ChestArmor };
const saber = { ...createWeapon(WEAPONS.Saber, WEAPON_MATERIALS.Mithril), name: 'The Spire-Saber', aetheric: 'panoply-saber', sigil: { power: 1, set: 'panoply', party: false, xp: 0 } };

test('RETIRED ELITE GATES: a save holding Weir Keys, a worn Panoply cuirass and a Panoply saber loads without throwing; every one of them leaves every list, the worn piece leaves its slot, and every other item stays', () => {
  const sword = createWeapon(WEAPONS.Longsword, WEAPON_MATERIALS.Steel);
  const old = JSON.parse(JSON.stringify(snapshotPlayer(mkEntity({ items: [sword, weirKeys, cuirass], wagonItems: [saber] }), {})));
  assert.deepEqual(old.items.map((it) => it.templateIndex), [WEAPONS.Longsword, 575, 102], 'the save holds them');
  const loaded = mkEntity();
  assert.doesNotThrow(() => restorePlayer(loaded, old, null));
  assert.deepEqual(loaded.items.map((it) => it.templateIndex), [WEAPONS.Longsword], 'the pack keeps the sword alone');
  assert.deepEqual(loaded.wagonItems, [], 'the wagon keeps no Panoply saber');
  assert.equal(equipTableOf(loaded)?.[EQUIP_SLOTS.ChestArmor] ?? null, null, 'no slot holds the dropped cuirass');
});

test('RETIRED ELITE GATES: the drop answers how many went, from the lists and the rooms, in place, and leaves the rest untouched', () => {
  const bow = createWeapon(WEAPONS.Long_Bow, WEAPON_MATERIALS.Iron);
  const list = [bow, { ...weirKeys }, { ...saber }];
  const room = { a: { ...weirKeys }, b: bow };
  assert.equal(dropRetiredEgItems(null, [list], [room]), 3);
  assert.deepEqual(list, [bow]);
  assert.deepEqual(room, { b: bow });
  assert.equal(dropRetiredEgItems(null, [list], [room]), 0, 'a second run changes nothing');
});
