// U8d: the native inventory window - the verbatim rects, the tab
// filter law, and the shared ItemListScroller component.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeInventoryWindow, INV_RECTS, TABS, filterByTab, isIngredientTemplate, NO_WAGON_TEXT, USE_PENDING,
  goldPanelRows,
} from '../../src/ui/native/nativeInventory.js';
import { scrollerHit, applyScroll, LIST_SLOTS, CELL_X, ARROW_H, DOWN_ARROW_Y, SLOT_H } from '../../src/ui/item/itemScroller.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeKey, typedChar } from '../../src/ui/input.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const ICONS = { getTexture: async () => ({ recordCount: 0 }), uploadRecord: () => {}, textures: new Map() };

test('nativeInventory: the verbatim DFU rects + the tab/mode click machine', () => {
  // DaggerfallInventoryWindow.cs #region UI Rects
  assert.deepEqual([...INV_RECTS.tabWeapons], [0, 0, 92, 10]);
  assert.deepEqual([...INV_RECTS.tabMagic], [93, 0, 69, 10]);
  assert.deepEqual([...INV_RECTS.tabClothing], [163, 0, 91, 10]);
  assert.deepEqual([...INV_RECTS.tabIngredients], [255, 0, 65, 10]);
  assert.deepEqual([...INV_RECTS.wagon], [226, 14, 31, 14]);
  assert.deepEqual([...INV_RECTS.info], [226, 36, 31, 14]);
  assert.deepEqual([...INV_RECTS.equip], [226, 58, 31, 14]);
  assert.deepEqual([...INV_RECTS.remove], [226, 80, 31, 14]);
  assert.deepEqual([...INV_RECTS.use], [226, 103, 31, 14]);
  assert.deepEqual([...INV_RECTS.gold], [226, 126, 31, 14]);
  assert.deepEqual([...INV_RECTS.localList], [163, 48, 59, 152]);
  assert.deepEqual([...INV_RECTS.remoteList], [261, 48, 59, 152]);
  assert.deepEqual([...INV_RECTS.exit], [222, 178, 39, 22]);
  const bag = [{ group: 'Weapons', templateIndex: 113, name: 'Dagger' }];
  const w = new NativeInventoryWindow({ items: () => bag, icons: ICONS });
  // defaults: WeaponsAndArmor tab, Equip mode (OnPush/SelectActionMode)
  assert.equal(w.tab, 'weapons');
  assert.equal(w.mode, 'equip');
  // tab clicks switch + reset scroll
  assert.ok(w.click(255 + 5, 5));
  assert.equal(w.tab, 'ingredients');
  assert.ok(w.click(0 + 5, 5));
  assert.equal(w.tab, 'weapons');
  // mode buttons select; U25: WAGON and GOLD are not modes at all -
  // they ACT, so the mode is unchanged and a box opens
  assert.ok(w.click(230, 40));
  assert.equal(w.mode, 'info');
  assert.ok(w.click(230, 16));      // wagon
  assert.equal(w.mode, 'info');
  assert.equal(w.topBox.rows[0].text, NO_WAGON_TEXT);
  assert.ok(w.click(163 + CELL_X + 5, 48 + 5));   // the box eats the click
  assert.equal(w.topBox, null);
  // info-mode slot click opens the real info box; the next click clears
  assert.ok(w.click(163 + CELL_X + 5, 48 + 5));
  assert.ok(w.topBox, 'an info box opened');
  assert.ok(w.click(163 + CELL_X + 5, 48 + 5));
  assert.equal(w.topBox, null);
  // outside every rect: not consumed; exit closes; Escape too
  assert.equal(w.click(10, 100), false);
  assert.ok(w.click(240, 185));
  assert.ok(w.done);
  const w2 = new NativeInventoryWindow({ items: () => bag, icons: ICONS });
  w2.input('Escape');
  assert.ok(w2.done);
});

test('nativeInventory: the AddLocalItem tab filter law (verbatim four-way)', () => {
  const bag = [
    { group: 'Weapons', templateIndex: 113 },
    { group: 'Armor', templateIndex: 102 },
    { group: 'Weapons', templateIndex: 113, enchantments: [{ type: 1, param: 5 }] },   // enchanted weapon -> magic
    { group: 'MiscItems', templateIndex: 132 },                     // Spellbook -> magic
    { group: 'PlantIngredients1', templateIndex: 0 },               // ingredient low bound
    { group: 'MiscellaneousIngredients1', templateIndex: 77 },      // ingredient high bound
    { group: 'Books', templateIndex: 277 },                         // -> clothing & misc
    { group: 'MensClothing', templateIndex: 141 },                  // -> clothing & misc
  ];
  assert.equal(isIngredientTemplate(77), true);
  assert.equal(isIngredientTemplate(78), false);
  assert.deepEqual(filterByTab(bag, 'weapons').map((i) => i.templateIndex), [113, 102]);
  assert.deepEqual(filterByTab(bag, 'magic').map((i) => i.templateIndex), [113, 132]);
  assert.deepEqual(filterByTab(bag, 'ingredients').map((i) => i.templateIndex), [0, 77]);
  assert.deepEqual(filterByTab(bag, 'clothing').map((i) => i.templateIndex), [277, 141]);
  assert.equal(TABS.length, 4);
});

test('itemScroller: the shared rail law (hit kinds + clamped paging)', () => {
  const rect = [163, 48, 59, 152];
  // the LEFT 9px rail: 16px arrows at y0/y136, the bar between
  assert.deepEqual(scrollerHit(rect, 163 + 4, 48 + 5), { kind: 'up' });
  assert.deepEqual(scrollerHit(rect, 163 + 4, 48 + DOWN_ARROW_Y + 5), { kind: 'down' });
  // AUDIT 39 F126 moved these two: the rail used to split on its own
  // midpoint (y=76), where VerticalScrollBar.cs:142-150 pages off the
  // THUMB. A 20-item list at scroll 0 puts the thumb at the bar's top,
  // so y=70 is BELOW it and pages down - it answered 'page-up' before
  // and applyScroll clamped the click into nothing.
  assert.deepEqual(scrollerHit(rect, 163 + 4, 48 + 70, 0, 20), { kind: 'page-down' });
  assert.deepEqual(scrollerHit(rect, 163 + 4, 48 + 100, 0, 20), { kind: 'page-down' });
  assert.equal(scrollerHit(rect, 162, 100), null, 'outside the scroller');
  assert.equal(scrollerHit(rect, 163 + 4, 48 + ARROW_H, 0, 20).kind, 'page-up', 'y16 is past the up arrow');
  // buttons at x>=9 map slots by 38px
  assert.deepEqual(scrollerHit(rect, 163 + CELL_X, 48 + 39), { kind: 'slot', slot: 1 });
  // paging clamps to the list
  assert.equal(applyScroll(0, 'up', 10), 0);
  assert.equal(applyScroll(0, 'down', 10), 1);
  assert.equal(applyScroll(0, 'page-down', 10), LIST_SLOTS);
  assert.equal(applyScroll(9, 'page-down', 10), 10 - LIST_SLOTS);
  assert.equal(applyScroll(3, 'down', 3), 0);   // short lists never scroll
});

// ---------------------------------------------------------------------------
// U25: the Use mode, and the four construction sites that must agree.
// ---------------------------------------------------------------------------

test('U25: Use mode uses, and an EQUIP click on a light source uses too', () => {
  const torch = { group: 'UselessItems2', templateIndex: 247, name: 'Torch', currentCondition: 10 };
  const entity = { isPlayer: true, activeEffects: [], equip: { slots: {} } };
  const bag = [torch];
  const w = new NativeInventoryWindow({ items: () => bag, icons: ICONS, entity });
  // the default mode is EQUIP, and DFU routes a light source there to
  // UseItem rather than EquipItem (:1976-1985) - which is how a torch
  // is lit in play
  assert.equal(w.mode, 'equip');
  // a torch is neither weapon/armor, magic nor an ingredient, so it
  // lives on the Clothing & Misc tab (AddLocalItem's `else`)
  w.click(163 + 5, 5);
  assert.equal(w.tab, 'clothing');
  w.click(163 + CELL_X + 5, 48 + 5);
  assert.equal(entity.lightSource, torch, 'lit from an EQUIP click');
  assert.ok(w.topBox.rows[0].text.startsWith('You light'));
  w.click(0, 0);   // dismiss
  // and Use mode douses it
  w.click(230, 108);            // the use button
  assert.equal(w.mode, 'use');
  w.click(163 + CELL_X + 5, 48 + 5);
  assert.equal(entity.lightSource, null);
});

test('U25: the gold button drops gold into the remote pile, refusing bad amounts', () => {
  // E4: `int playerGold = PlayerEntity.GoldPieces` (:1288) - the purse
  // is the COUNTER, and the amount that leaves it mints a fresh pile
  // (ItemBuilder.CreateGoldPieces) in the remote container (:1307).
  const bag = [];
  const entity = { isPlayer: true, items: bag, goldPieces: 500 };
  const w = new NativeInventoryWindow({ items: () => bag, icons: ICONS, entity });
  w.click(230, 130);            // the gold button
  // CM5: DropGoldPopup (:1246-1256) is a pushed DaggerfallInputMessageBox - numeric, 8 characters, seeded "0"
  assert.ok(w.inputBox, 'the prompt is a pushed box');
  assert.equal(w.inputBox.numeric, true); assert.equal(w.inputBox.maxCharacters, 8);
  assert.equal(w.inputBox.label, '', 'GoldButton_OnMouseClick sets tokens (record 25) and no label (:1275)'); assert.ok(w.inputBox.lines.length, 'the record above the field');
  assert.equal(w.inputBox.value, '0', 'TextBox.Text = "0"');
  // 0 is refused outright - DFU returns without clamping
  w.input('Enter');
  assert.equal(w.inputBox, null, 'Return closes the box');
  assert.equal(entity.goldPieces, 500);
  // so is more than you carry
  w.click(230, 130);
  w.inputBox.value = '9999';
  w.input('Enter');
  assert.equal(entity.goldPieces, 500);
  // a real amount lands in the remote pile
  w.click(230, 130);
  w.inputBox.value = '120';
  w.input('Enter');
  assert.equal(entity.goldPieces, 380);
  assert.equal(w._remote().find((it) => it.group === 'Currency')?.stackCount, 120);
  assert.equal(bag.length, 0, 'and the pack never held a coin');
});

test('U42: USING the Spellbook item closes the inventory FIRST, then opens the book', () => {
  // DaggerfallInventoryWindow.cs:1748-1764 posts the open; the port
  // has ONE overlay slot, so the order matters exactly as AUDIT B-C1
  // found for the book reader: hand off before the close law runs and
  // the window that just took the slot is torn back down, and a
  // session's dropped pile never mints.
  const order = [];
  const w = new NativeInventoryWindow({
    items: () => [], wagonItems: () => [], entity: { items: [] },
    icons: { getTexture: () => null, uploadRecord: () => null, textures: {} },
    rows: () => [], nowMinute: () => 0,
    onClose: () => order.push('close'),
    openSpellbook: () => order.push('open'),
  });
  w._useResult({ kind: 'spellbook' });
  assert.deepEqual(order, ['close', 'open'], 'the close law runs BEFORE the hand-off');
  assert.equal(w.done, true);
  assert.equal(w.boxes?.length ?? 0, 0, 'and no message box is left behind');

  // a host with no hook keeps the window and says so
  const bare = new NativeInventoryWindow({
    items: () => [], wagonItems: () => [], entity: { items: [] },
    icons: { getTexture: () => null, uploadRecord: () => null, textures: {} },
    rows: () => [], nowMinute: () => 0,
  });
  bare._useResult({ kind: 'spellbook' });
  assert.equal(bare.done, false);
  assert.equal(bare.boxes[0].rows[0].text, USE_PENDING.spellbook);
});

test('U26: the dungeon routes RAW KEY CODES to a native overlay', () => {
  // routeKey handed every overlay an ACTION ('back'/'confirm'/'up'),
  // which is the keyed windows' vocabulary and cannot express F6, a
  // mode button or a digit - so the native window could not have
  // worked in this host without the branch.
  let got = null;
  const ctx = {
    uiOverlayActive: true, overlayIsNative: true,
    overlayInput: (a) => { got = a; },
  };
  routeKey({ code: 'KeyU', key: 'u' }, ctx, () => ({}));
  assert.equal(got, 'KeyU', 'the raw code, not char:u');
  // a KEYED overlay still gets the action map
  const keyed = { uiOverlayActive: true, overlayIsNative: false, overlayInput: (a) => { got = a; } };
  routeKey({ code: 'Escape', key: 'Escape' }, keyed, () => ({}));
  assert.equal(got, 'back');
  // typedChar reads BOTH hosts' vocabularies
  assert.equal(typedChar('char:7'), '7');
  assert.equal(typedChar('Digit7'), '7');
  assert.equal(typedChar('Numpad7'), '7');
  assert.equal(typedChar('KeyA', { key: 'a' }), 'a');
  assert.equal(typedChar('Escape'), null);
});

// ---------------------------------------------------------------
// U47 - THE HOVER INFO PANEL
// ---------------------------------------------------------------

/** The vertical centre of list slot `slot` (SLOT_H = 38). */
const CELL_Y = (slot) => INV_RECTS.localList[1] + slot * SLOT_H + 10;

test('U47: hovering a list slot fills the info panel, and the panel is STICKY', () => {
  const bag = [
    { group: 'Weapons', templateIndex: 113, name: 'Dagger' },
    { group: 'Weapons', templateIndex: 121, name: 'Longsword' },
  ];
  const w = new NativeInventoryWindow({ items: () => bag, icons: ICONS, rows: () => [{ text: 'x' }] });
  assert.equal(w.infoItem ?? null, null, 'nothing looked at yet');
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(0));
  assert.equal(w.infoItem?.name, 'Dagger');
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(1));
  assert.equal(w.infoItem?.name, 'Longsword');
  // DFU has NO OnMouseLeave arm: moving off an item leaves the panel
  // exactly as it was, which is what makes a 37-pixel panel usable.
  w.hover(10, 100);
  assert.equal(w.infoItem?.name, 'Longsword', 'the panel is sticky over dead space');
  // ...and over an EMPTY SLOT INSIDE the list, which is the arm that
  // matters: DFU's scroller raises OnHover only for a slot that HOLDS
  // an item, so slot 2 of a two-item bag reaches the miss branch and
  // must leave the panel alone.
  assert.equal(bag.length, 2);
  assert.ok(scrollerHit(INV_RECTS.localList, INV_RECTS.localList[0] + 20, CELL_Y(2))?.kind === 'slot',
    'slot 2 really is a slot, and really is empty');
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(2));
  assert.equal(w.infoItem?.name, 'Longsword', 'an empty slot changes nothing');
  // ...and the scroll ARROWS raise nothing either (:2224-2242)
  w.hover(INV_RECTS.localList[0] + 2, INV_RECTS.localList[1] + 2);
  assert.equal(w.infoItem?.name, 'Longsword', 'the up arrow is not an item');
  // MUTATION: clearing infoItem on a miss empties the panel the moment
  // the pointer moves and both of the last two fail.
});

test('U47: the panel CLEARS on a tab change and behind a box - DFU\'s only two clear sites', () => {
  const bag = [{ group: 'Weapons', templateIndex: 113, name: 'Dagger' }];
  const w = new NativeInventoryWindow({ items: () => bag, icons: ICONS, rows: () => [{ text: 'x' }] });
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(0));
  assert.equal(w.infoItem?.name, 'Dagger');
  // SelectTabPage (:814-816)
  w.click(INV_RECTS.tabIngredients[0] + 5, 5);
  assert.equal(w.infoItem, null, 'a tab change empties it');
  // ...and a pushed window owns the pointer: hovering behind a box
  // changes nothing (the push itself cleared it at :663-664).
  w.click(INV_RECTS.tabWeapons[0] + 5, 5);
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(0));
  assert.equal(w.infoItem?.name, 'Dagger');
  const second = { group: 'Weapons', templateIndex: 121, name: 'Longsword' };
  bag.push(second);
  w.boxes = [{ rows: [{ text: 'a box' }] }];
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(1));   // squarely on the second item
  assert.equal(w.infoItem?.name, 'Dagger', 'a box holds the panel where it was');
  w.boxes = [];
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(1));
  assert.equal(w.infoItem?.name, 'Longsword', '...and it moves again once the box is gone');
});

test('U47: the GOLD button fills the panel with its own two generated lines', () => {
  // Internal_Strings goldAmount / goldWeight, verbatim, and the
  // CONDITIONAL format: `weight % 1 == 0 ? "F0" : "F2"`.
  assert.deepEqual(goldPanelRows(400, 1).map((r) => r.text), ['400 gold pieces', 'Weight: 1 kg']);
  assert.deepEqual(goldPanelRows(1, 0.0025).map((r) => r.text), ['1 gold pieces', 'Weight: 0.00 kg']);
  assert.deepEqual(goldPanelRows(1000, 2.5).map((r) => r.text), ['1000 gold pieces', 'Weight: 2.50 kg']);
  // MUTATION: an unconditional toFixed(2) writes "1.00 kg" for a whole
  // number and the first line fails.
  const bag = [{ group: 'Weapons', templateIndex: 113, name: 'Dagger' }];
  const w = new NativeInventoryWindow({ items: () => bag, icons: ICONS, rows: () => [{ text: 'x' }] });
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(0));
  assert.equal(w.infoGold, false);
  w.hover(INV_RECTS.gold[0] + 5, INV_RECTS.gold[1] + 5);
  assert.equal(w.infoGold, true, 'the gold button takes the panel');
  assert.equal(w.infoItem, null, '...and it is not an item');
  w.hover(INV_RECTS.localList[0] + 20, CELL_Y(0));
  assert.equal(w.infoGold, false, 'an item takes it back');
});

test('U47: the window is the guard, not its click method - and F11 no longer goes fullscreen', () => {
  const code = (rel) => hostText(`src/${rel}`);
  // AUDIT 18 routed 62: townTalk tested `overlay?.click`, so a click
  // on a window with no click handler fell through to requestLook and
  // grabbed pointer lock from under the menu.
  // ...and the guard has to be read INSIDE pointerdown: `hover` a few
  // lines below carries the same line, so a whole-file regex matches
  // whatever pointerdown says. The first draft of this pin did, and
  // survived restoring the defect.
  const tt = code('scenes/townTalk.js');
  const pd = tt.slice(tt.indexOf('function pointerdown(e) {'), tt.indexOf('function hover(e) {'));
  // STATUS-LIVE: the guard is still on the WINDOW - what
  // it asks is the PAUSE. A box the game is not stopped for (the
  // status readout, ui/statusBox.js) is standing in this slot while
  // the player walks, and a press then belongs to the world.
  assert.match(pd, /if \(!overlay \|\| !talkPaused\(\)\) return false;/, 'the guard is on the WINDOW');
  assert.doesNotMatch(pd, /if \(!overlay\) return false;/, 'and not on the slot alone any more');
  assert.doesNotMatch(pd, /if \(!overlay\?\.click\)/, 'and not on its click method');
  assert.match(pd, /overlay\.click\?\.\(/, 'the call is what is optional');
  // AUDIT 18: F11 is QuickLoad AND the browser's fullscreen key. One
  // list now, called first in every host that registers a keydown -
  // including the exterior host, which has nothing to quickload and
  // must still not go fullscreen.
  assert.match(code('ui/input.js'), /BROWSER_STEALS = Object\.freeze\(\['F1', 'F3', 'F5', 'F6', 'F11'\]\)/);
  // AUDIT 58 (f2/hosts): DISCOVERED, not enumerated. This loop named
  // four hosts, and the U47 rollout that wrote it named the same four -
  // so scenes/interior.js, the FIFTH host-level keydown, registered one
  // and never swallowed: F5 in the ?interior route reloaded the page and
  // destroyed the session (AUDIT 17e F41's own failure) and F11 went
  // fullscreen. A list a lane has to remember to extend is what let that
  // happen, so the pin now asks the tree which hosts register a keydown
  // and holds every one of them to ui/input.js:"One list, because"'s "every host
  // that registers a keydown calls this FIRST".
  const SCENES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'scenes');
  const hosts = readdirSync(SCENES, { recursive: true }).map(String).filter((f) => f.endsWith('.js')   // AUDIT TIDY TEST-3: the folders too
    && /\n  addEventListener\('keydown', \(e\) => \{/.test(readFileSync(join(SCENES, f), 'utf8')));
  assert.deepEqual(hosts.sort(), ['dungeon.js', 'exterior.js', 'interior.js', 'world.js', 'worldModes.js'],
    'the host-level keydowns in the tree - a sixth joins this list by existing, not by being remembered');
  for (const host of hosts.map((f) => `scenes/${f}`)) {
    assert.match(code(host), /swallowBrowserKey\(e\)/, `${host} swallows them`);
    assert.match(code(host), /import \{[^}]*swallowBrowserKey[^}]*\} from '\.\.\/ui\/input\.js'/, `${host} takes them from the one list`);
    assert.doesNotMatch(code(host), /e\.code === 'F5' \|\| e\.code === 'F6'/, `${host} keeps no second list`);
  }
  // ...and FIRST, ahead of the early returns. interior.js's handler
  // returns out of its overlay arm and its KeyM arm before either
  // reaches preventDefault, so a swallow placed after them is no
  // swallow at all - which is why the law says first and not merely
  // present.
  const body = code('scenes/interior.js');
  const kd = body.slice(body.indexOf("\n  addEventListener('keydown', (e) => {"));
  assert.ok(kd.indexOf('swallowBrowserKey(e);') < kd.indexOf('if (overlay)'),
    'interior.js swallows BEFORE the overlay arm returns');
  assert.ok(kd.indexOf('swallowBrowserKey(e);') < kd.indexOf("if (actionsOf(e, keys).includes('AutoMap'))"),   // FIX-F: the registry's key; UXB1-S: shared or not
    'interior.js swallows BEFORE the automap arm returns');
});
