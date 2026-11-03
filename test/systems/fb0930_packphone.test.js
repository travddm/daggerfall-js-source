// FIELD BUGS 2026-09-30 (PACK-PHONE) - "Still can't use my bag/Inventory on mobile" - "Mobile trully is a mess to work
// with huh?", the screenshots the Enhanced Plus pack on a phone, the paperdoll filling the view and the item list out of
// reach; "I would also love to see this fixed"; "we dont really need paperdoll on phone or at least if it could be
// hidden".
//
// The stacked pack (under the 1000px column layout) held its character region at its content's height in a window
// capped at 660px, and the dock took what was left. With the doll's art there was nothing left: the doll's cell is
// height-driven in a map whose rows are auto, a height that resolves to nothing, so the sprite stood at its 4x bitmap
// size. Measured in Chromium on the real pack with a 440x736 figure standing in for the art: a phone on its side
// (915x412) had a 0px list and none of its five tiles could be tapped; upright (412x915) the worn panels' columns came
// to 0px and the list to 8px; a tablet upright and a 900px mouse window read 0px too. The layout is a MEDIA QUERY and
// node cannot see one, so this pins the rules and their conditions on the real sheet and the Body switch's wiring on
// the pack's own fake document; tools/enhancedPackLayoutProbe.mjs measures them in a browser.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withDom } from '../invdrag.mjs';
import { mountEnhancedInventory } from '../../src/ui/enhanced/enhancedInventory.js';
import { getPref, setPref, PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';
import { ONLINE_PLAYERS_OWN_PREFS, ONLINE_FORCED_PREFS } from '../../src/systems/online/onlineLane.js';
import { equipItem, isEquipped } from '../../src/systems/equip.js';
import { mintCondition, setItemFields } from '../../src/systems/item/itemTemplates.js';

const STACKED = '@media (max-width: 999px) {';
const PHONE = '@media (pointer: coarse) and (hover: none) and (max-width: 640px), (pointer: coarse) and (hover: none) and (max-height: 540px) {';
const SIDE = '@media (pointer: coarse) and (hover: none) and (orientation: landscape) and (max-height: 540px) {';

test('PACK-PHONE: the Body switch - hidden by default, the header\'s button beside Close says which, a press shows the body and the choice is remembered on the player\'s own shelf, never the room\'s; with the body hidden a worn piece is still a tap from its card and its Take off (mutants: the choice never drawn; the choice forgotten; the body shown by default; the lane never told)', () => {
  assert.equal(PREF_DEFAULTS.packPhoneDoll, false, 'a phone opens on the panels and the list');
  assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes('packPhoneDoll') && !Object.hasOwn(ONLINE_FORCED_PREFS, 'packPhoneDoll'),
    'what THIS screen draws - the player\'s online too');
  setPref('packPhoneDoll', false);
  withDom((dom) => {
    const e = { isPlayer: true, name: 'Vaelkistae', career: { name: 'Spellsword' }, level: 3,
      stats: { strength: 50, endurance: 48, agility: 50, speed: 50, luck: 50, willpower: 50, intelligence: 50, personality: 50 },
      skills: new Array(35).fill(30), activeEffects: [], spells: [], items: [], goldPieces: 0 };
    const cloak = mintCondition(setItemFields({ group: 'MensClothing', templateIndex: 154 }));
    e.items.push(cloak); equipItem(e, cloak);
    const host = dom.mk('div');
    dom.body.append(host);
    const was = globalThis.window;
    globalThis.window = { innerWidth: dom.w, innerHeight: dom.h, getComputedStyle: () => ({ position: 'absolute' }) };
    let view = mountEnhancedInventory(host, { entity: e, items: () => e.items, onExit: () => {} });
    try {
      const shell = () => host.querySelector('.pack-shell');
      const btn = () => host.querySelector('.pack-id').querySelector('.dolltoggle');
      const acts = () => host.querySelector('.pack-id').children.filter((n) => n.tagName === 'BUTTON').map((n) => n.textContent);
      assert.deepEqual(acts(), ['Codex', 'Body', 'Close'], 'Body stands before Close in the header (PIN MOVED, LOOT10: the Codex before it, while the loot rarity row is on)');
      assert.equal(shell().classList.contains('showdoll'), false, 'hidden by default');
      assert.equal(btn().getAttribute('aria-pressed'), 'false');
      assert.equal(btn().type, 'button');
      btn().onclick();
      assert.equal(getPref('packPhoneDoll'), true, 'the choice is on the shelf');
      assert.equal(shell().classList.contains('showdoll'), true, 'and drawn at once');
      assert.deepEqual(acts(), ['Codex', 'Hide body', 'Close']);
      assert.equal(btn().getAttribute('aria-pressed'), 'true');
      // a pack opened later opens as it was left
      view.unmount();
      view = mountEnhancedInventory(host, { entity: e, items: () => e.items, onExit: () => {} });
      assert.equal(shell().classList.contains('showdoll'), true, 'remembered');
      btn().onclick();
      assert.equal(getPref('packPhoneDoll'), false);
      assert.equal(shell().classList.contains('showdoll'), false);
      // the body hidden: the cloak's panel is a button still, its tap the card, the card's first act Take off
      const panel = host.querySelectorAll('.wornrow').find((n) => n.querySelector('.wornslot')?.textContent === 'Cloaks');
      assert.equal(panel?.tagName, 'BUTTON', 'the worn panel is a control with the body hidden');
      panel.onclick({});
      const off = host.querySelector('.packtip').querySelectorAll('button').find((b) => b.textContent === 'Take off');
      assert.ok(off, 'the card offers Take off');
      off.onclick();
      assert.equal(isEquipped(cloak), false, 'and takes it off');
    } finally {
      view.unmount();
      globalThis.window = was;
      setPref('packPhoneDoll', false);
    }
  });
});
