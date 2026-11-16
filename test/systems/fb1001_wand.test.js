// FIELD BUGS 2026-10-01 part four (RARITY-WEAR) - Cruor in #bug-reports, "I think I found a bugged ...": a Legendary
// King's Mark came out with "completely different icon and everything", and WEAR did nothing - "If these items spawn
// as wands, they cannot be equipped as wands are not an equippable effectively being useless. Solution: Make these
// items not roll as wands".
//
// A Legendary record renames the piece a maker minted; it never picks the base. The Gate's spoils and a town's thanks
// (gateSpoils.js spoilsBase, raidSpoils.js) drew a jewel over all eight Jewellery templates, and the eighth is the Wand
// (140), which no slot takes (DFU's GetJewelleryEquipSlot answers None; equipRules.js has no row) - so one jewel in
// eight was a wand, every affix and enchantment on it read off worn pieces alone, and a King's Mark on one was dead
// weight. Now no slot, no tier: the spoils' base is made again when it is a piece nothing can wear, the ladder never
// grades one (lootRarity.js rarityEligible). Fixtures are the producers': the real rollSpoils and rollRaidSpoils over
// their seeds, the real applyRarity over a piece minted by setItemFields + mintCondition, and the real equipItem.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setItemFields, mintCondition, templateByIndex } from '../../src/systems/item/itemTemplates.js';
import { applyRarity, rarityEligible, rollLootRarity } from '../../src/systems/loot/lootRarity.js';
import { rollSpoils, spoilsBase } from '../../src/systems/gate/gateSpoils.js';
import { rollRaidSpoils } from '../../src/systems/raidSpoils.js';
import { equipItem, wearableItem } from '../../src/systems/equip.js';
import { ITEM_GROUPS } from '../../src/systems/loot/loot.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';

const WAND = 140, AMULET = 133;
const jewel = (templateIndex) => mintCondition(setItemFields({ group: 'Jewellery', templateIndex, flags: 0 }));
const hero = () => ({ name: 'Cruor', items: [], activeEffects: [], stats: { strength: 50 }, skills: [] });

test('RARITY-WEAR: the law - a Wand is the one jewel no slot takes, and no tier is rolled on a piece nothing can wear; every other jewel, armour and weapon is graded as before (mutants: the law that answers yes; the wand graded; the eligibility check gone)', () => {
  assert.deepEqual(ITEM_GROUPS.Jewellery, [133, 134, 135, 136, 137, 138, 139, 140]);
  assert.deepEqual(ITEM_GROUPS.Jewellery.filter((t) => !wearableItem(jewel(t))), [WAND], 'the Wand alone');
  for (const t of ITEM_GROUPS.Jewellery) {
    const e = hero();
    assert.equal(equipItem(e, jewel(t)) !== null, t !== WAND, `${templateByIndex(t).name}: the law is equipItem's own`);
  }
  assert.equal(rarityEligible(jewel(WAND)), false, 'a wand takes no tier');
  assert.equal(rarityEligible(jewel(AMULET)), true);
  assert.equal(rarityEligible(jewel(137)), true, 'a Mark');
  assert.equal(rarityEligible(mintCondition(setItemFields({ group: 'Armor', templateIndex: 102, material: 0x0200, flags: 0 }))), true);
  assert.equal(rarityEligible(mintCondition(setItemFields({ group: 'Weapons', templateIndex: 113, material: 0, flags: 0 }))), true);
  // the host door leaves a found wand as DFU made it, and still grades the amulet beside it (the ladder's row on)
  _resetForTests(); setPref('lootRarity', true);
  const list = [jewel(WAND), jewel(AMULET)];
  rollLootRarity(list, { kind: 'dungeon', tier: 5, boss: true }, { rolls: () => 0.0001, luck: 100 });
  assert.equal(list[0].rarity, undefined, 'the wand stays plain');
  assert.equal(list[0].name, 'Wand');
  assert.equal(list[1].rarity, 'legendary', 'the amulet beside it is graded');
});

test('RARITY-WEAR: the Gate\'s spoils and a town\'s thanks are never a wand - every piece over two thousand seeds can be worn, and a King\'s Mark still comes (mutants: the spoils\' base not made again; the base made again for a wearable piece)', () => {
  let marks = 0, jewels = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const lv = 1 + (seed % 30);
    const pieces = [...rollSpoils(seed * 7919, lv).pieces, ...rollRaidSpoils(seed * 104729, lv, 1 + (seed % 4)).pieces];
    for (const { item } of pieces) {
      assert.ok(wearableItem(item), `seed ${seed}: ${item.name} (template ${item.templateIndex}) can be worn`);
      assert.notEqual(equipItem(hero(), item), null, `seed ${seed}: ${item.name} is worn by equipItem`);
      if (item.group === 'Jewellery') jewels++;
      if (item.legendary === 'kings-mark') marks++;
    }
  }
  assert.ok(jewels > 1000, `jewels still come (${jewels})`);
  assert.ok(marks > 0, `King's Marks still come (${marks})`);
  // the base itself: a stream that draws the wand first is made again into the next piece, and the seed's stream
  // goes on from there - a stream that draws a wearable jewel first is taken as it is
  const wandFirst = [2 / 3 + 0.001, 7.5 / 8, 0.9, 0.1];   // k = 2 (a jewel), index 7 (the Wand); then k = 2, index 0
  let i = 0;
  const base = spoilsBase(5, () => wandFirst[i++]);
  assert.equal(base.templateIndex, AMULET, 'made again: the next draw, an Amulet');
  assert.equal(i, 4, 'the wand cost the stream its two draws');
  i = 0;
  const ring = spoilsBase(5, () => [2 / 3 + 0.001, 2.5 / 8][i++]);
  assert.equal(ring.templateIndex, 135, 'a Ring first is a Ring');
  assert.equal(i, 2, 'two draws, as before');
});
