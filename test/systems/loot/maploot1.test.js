// DISC10-C / MAPLOOT1 (2026-09-23, Discord through
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NativeInventoryWindow } from '../../../src/ui/native/nativeInventory.js';
import { mountEnhancedInventory, itemLine } from '../../../src/ui/enhanced/enhancedInventory.js';
import { withDom } from '../../invdrag.mjs';
import { randomlyAddMap, randomlyAddPotionRecipe } from '../../../src/systems/loot/loot.js';
import { potionRecipeIngredientNames } from '../../../src/systems/item/itemInfo.js';
import { restoreDiscovery, hasDiscoveredLocationId, discoverRandomLocation } from '../../../src/systems/discovery.js';

const ICONS = { getTexture: async () => ({ recordCount: 0 }), uploadRecord: () => {}, textures: new Map() };

test('MAPLOOT1: with the seam, taking a map off a corpse reads it, spends it and discovers the place (DaggerfallInventoryWindow.cs:1471-1478)', () => {
  restoreDiscovery(null);
  const region = [{ mapId: 1001, discovered: false, name: 'Castle Hidden', regionName: 'X' }];
  const loot = []; randomlyAddMap(100, loot, () => 0);
  const w = new NativeInventoryWindow({ items: () => [], icons: ICONS, loot: { items: () => loot },
    rows: () => [{ text: '%map' }], revealMap: () => discoverRandomLocation(region)?.name ?? null });
  w._pickRemote(0, w.mode);
  assert.deepEqual(loot, [], 'off the body');
  assert.equal(hasDiscoveredLocationId(1001), true, 'on the travel map');
  assert.equal(w.boxes[0].rows[0].text, 'Castle Hidden', 'record 499 names it');
});

test('MAPLOOT1: the enhanced card READS a recipe - the potion it makes and its ingredients, PotionRecipeIngredients\' list (MCP :245-260)', () => {
  const r = []; randomlyAddPotionRecipe(100, r, () => 0.3); const recipe = r[0];
  assert.deepEqual(potionRecipeIngredientNames(recipe), ['Turquoise', 'Pine Branch', 'White Rose', 'Ichor']);
  assert.equal(potionRecipeIngredientNames({ group: 'MiscItems', templateIndex: 287 }), null, 'a map is not a recipe');
  assert.deepEqual(itemLine(recipe).recipe, { potion: 'Potion of Resist Frost', ingredients: ['Turquoise', 'Pine Branch', 'White Rose', 'Ichor'] });
  withDom((dom) => {
    const host = dom.mk('div'); dom.body.append(host);
    const e = { items: [recipe], stats: {}, level: 1 };
    const view = mountEnhancedInventory(host, { entity: e, items: () => e.items, onExit: () => {} });
    let row = dom.doc.querySelectorAll('.itemrow')[0];
    for (const b of dom.doc.querySelectorAll('button')) { if (row) break; if (/\bstatflip-btn\b/.test(b.className ?? '')) continue; b.onclick?.({}); row = dom.doc.querySelectorAll('.itemrow')[0]; }   // STATS-CARD: the paperdoll's Stats button turns the card, it opens no list
    row.onclick?.({});
    const dd = dom.doc.querySelectorAll('.card')[0].querySelectorAll('dd').map((n) => n.textContent);
    assert.ok(dd.includes('Potion of Resist Frost'));
    assert.ok(dd.includes('Turquoise, Pine Branch, White Rose, Ichor'));
    view.unmount();
  });
});
