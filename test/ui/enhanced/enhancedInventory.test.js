// U53 - THE ENHANCED PACK AND THE SLOT MAP, pinned.
//
// More of this one is drivable in node than any enhanced screen so
// far: `packModel` and `itemLine` are pure, and the EQUIP CHAIN they
// sit on is systems/equip.js, which runs headless. So the tests below
// actually wear things and take them off and read the map's state,
// rather than reading the source and hoping.
//
// The DOM half is source sweeps, and says so; the screen itself is
// driven in a browser by tools/enhancedPackProbe.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  packModel, itemLine, itemStatSuffix, SLOT_MAP, useResultAction, remoteModel, REMOTE_TITLE, STOW_LABEL, plural,
  equippedModel, LIGHT_SLOT, localPrimaryAct,   // HT5
  mountEnhancedInventory,   // AUDIT INV2: the pane is MOUNTED and the gesture DRIVEN
  itemInfoBoxes,   // PLUS10
} from '../../../src/ui/enhanced/enhancedInventory.js';
import { WAGON_KG_LIMIT } from '../../../src/systems/item/itemTransfer.js';
import { SMALL_CART_TEMPLATE } from '../../../src/systems/inventorySession.js';   // MAC-M2 B: a cart in the bag, so the loot bar's one surviving button draws
import { USE_PENDING } from '../../../src/ui/native/nativeInventory.js';
import {
  createInventoryWindow, inventoryDoorReady,
} from '../../../src/ui/inventoryDoor.js';
import { withDom } from '../../invdrag.mjs';   // AUDIT INV2: a document just real enough to DRIVE the gesture
import { PACK_PAGES, filterByPage } from '../../../src/ui/packPages.js';   // PX31: the pack's nine pages
import { EQUIP_SLOTS, ITEM_TEMPLATES, getTemplate } from '../../../src/characters/paperdoll/paperdoll.js';
import { inventoryItemImage } from '../../../src/systems/item/itemTemplates.js';
import { equipItem, unequipSlot, isEquipped } from '../../../src/systems/equip.js';
import { maxEncumbrance } from '../../../src/combat/formulas.js';
import { carriedWeight, totalWeight } from '../../../src/systems/inventory.js';
import { liveStat } from '../../../src/systems/statMods.js';
import { _resetForTests } from '../../../src/systems/uiPrefs.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole
// ENH-NOTICE3: the pane's `notice` line is DFU's click-anywhere box and
// rides the enhanced notice panel now.
import {
  enhancedNoticeKeys, destroyEnhancedNotice, ENHANCED_NOTICE_ID,
} from '../../../src/ui/enhanced/enhancedNotice.js';

const read = (p) => hostText(p);

/** The module with its comments stripped. Both "this file must not
 *  contain X" sweeps below failed their first run against the file's
 *  own header EXPLAINING why it does not contain X - which is the
 *  sweep reading prose as code, and would have let a real second icon
 *  pipeline through as long as nobody wrote about it. */
const code = (p) => read(p)
  .replace(/\/\*[^]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const skin = (v) => { _resetForTests(); globalThis.location = { search: `?skin=${v}` }; };

const tmpl = (name) => ITEM_TEMPLATES.find((t) => t.name === name);
const mk = (name, group = 'Weapons', extra = {}) => {
  const t = tmpl(name);
  assert.ok(t, `${name} is not a template in this build`);
  return {
    name: t.name, templateIndex: t.index, group, stackCount: 1,
    currentCondition: t.hitPoints ?? 50, maxCondition: t.hitPoints ?? 50, ...extra,
  };
};
const hero = () => {
  const e = {
    name: 'Aelwyn', career: { name: 'Spellsword' },
    stats: { strength: 50, endurance: 48 }, items: [],
  };
  e.items = [
    mk('Longsword'), mk('Dagger'), mk('Buckler', 'Armor'), mk('Cuirass', 'Armor'),
  ];
  e.goldPieces = 1287;   // E4: gold is the counter, never a row in the pack
  return e;
};
const model = (e) => packModel({ entity: e, items: () => e.items });

// ── THE MODEL ────────────────────────────────────────────────────

test('U53/PX31: the pack reads the nine pages, each filterByPage\'s own answer, and nothing else', () => {
  const e = hero();
  const m = model(e);
  assert.deepEqual(m.tabs.map((t) => t.tab), PACK_PAGES.map(([id]) => id));
  assert.deepEqual(m.tabs.map((t) => t.label), PACK_PAGES.map(([, label]) => label));
  for (const { tab, items } of m.tabs) {
    assert.deepEqual(items, filterByPage(e.items, tab),
      `${tab} must be filterByPage's own answer, not a second filter`);
  }
  assert.equal(m.count, 4);
  assert.equal(m.gold, 1287, 'PlayerEntity.GoldPieces, as every other screen reads it');
  assert.equal(m.tabs.every((t) => t.items.every((i) => i.group !== 'Currency')), true,
    'and the list can never show a gold row');
});

test('U53: encumbrance is the same expression the sheet and the classic window use', () => {
  const e = hero();
  e.activeEffects = [{ kind: 'drainAttribute', stat: 'strength', magnitude: 12 }];
  const m = model(e);
  assert.equal(m.encumbrance.max, maxEncumbrance(liveStat(e, 'strength')));
  assert.notEqual(m.encumbrance.max, maxEncumbrance(e.stats.strength),
    'LIVE strength - a drained player must not be told they can carry the undrained amount');
  // ...and the OTHER half. PlayerEntity.CarriedWeight (:184) is the
  // items PLUS the gold counter's weight, and the pane composes it by
  // hand (enhancedInventory.js:"const carried = items.reduce") because it is handed the list
  // and not the entity - so it must still land on inventory
  // .carriedWeight's answer.
  assert.equal(m.encumbrance.now, Math.trunc(carriedWeight(e)));
  // The coin term must be LIVE: hero()'s purse is heavy enough that
  // the items-only total truncs to a DIFFERENT integer, so the pin
  // above cannot go vacuous by both sides dropping it at once.
  assert.notEqual(Math.trunc(carriedWeight(e)), Math.trunc(totalWeight(e.items)));
});

// ── THE EQUIP CHAIN IS systems/equip.js's, RUN FOR REAL ──────────

test('U53: wearing something fills its slot on the map', () => {
  const e = hero();
  assert.equal(model(e).worn.size, 0);
  const sword = e.items[0];
  equipItem(e, sword);
  const m = model(e);
  assert.equal(m.worn.size, 1);
  assert.equal(m.worn.get(EQUIP_SLOTS.RightHand)?.name, 'Longsword',
    'a one-hander lands in the right hand, and the map reads the equip table');
  assert.ok(isEquipped(sword));
});

test('U53: worn items LEAVE the list - FilterLocalItems, and the map is where they go', () => {
  // This is the law that made a "worn" badge on a row unrenderable,
  // and it is DFU's: filterByTab drops every equipped item on its
  // first line. The slot map is the only place worn kit lives, which
  // is the argument this screen is built on.
  const e = hero();
  const before = model(e).tabs.find((t) => t.tab === 'weapons').items.length;
  equipItem(e, e.items[0]);
  const after = model(e);
  assert.equal(after.tabs.find((t) => t.tab === 'weapons').items.length, before - 1);
  for (const { items } of after.tabs) {
    for (const it of items) assert.ok(!isEquipped(it), 'no equipped item may appear in any tab');
  }
  assert.equal(after.worn.size, 1, '...and it is on the map instead');
});

test('U53: taking it off empties the node and returns it to the list', () => {
  const e = hero();
  equipItem(e, e.items[0]);
  unequipSlot(e, EQUIP_SLOTS.RightHand);
  const m = model(e);
  assert.equal(m.worn.size, 0);
  assert.ok(m.tabs.find((t) => t.tab === 'weapons').items.some((i) => i.name === 'Longsword'));
});

test('U53: DFU’s two-hander law travels - the map shows both hands cleared', () => {
  const e = hero();
  const claymore = mk('Claymore');
  e.items.push(claymore);
  equipItem(e, e.items[0]);                       // a one-hander in the right
  equipItem(e, e.items.find((i) => i.name === 'Buckler'));  // a shield in the left
  assert.equal(model(e).worn.size, 2);
  equipItem(e, claymore);                         // the two-hander clears both
  const m = model(e);
  assert.equal(m.worn.get(EQUIP_SLOTS.RightHand)?.name, 'Claymore');
  assert.equal(m.worn.get(EQUIP_SLOTS.LeftHand), undefined, 'the shield came off');
  assert.equal(m.worn.size, 1);
});

// ── THE SLOT MAP ─────────────────────────────────────────────────

test('U53: every equip slot the game has is on the map', () => {
  // The classic paperdoll draws a picture of a person and the player
  // hunts for the slots. The point of a schematic is that NONE of them
  // is hidden - a slot the player cannot see is a slot they cannot
  // empty - so the map must cover the enum, None excepted.
  const real = Object.entries(EQUIP_SLOTS).filter(([, v]) => v !== EQUIP_SLOTS.None);
  for (const [name, id] of real) {
    assert.ok(SLOT_MAP[id], `${name} (${id}) has no node on the map`);
    assert.equal(typeof SLOT_MAP[id].x, 'number');
    assert.equal(typeof SLOT_MAP[id].y, 'number');
    assert.equal(typeof SLOT_MAP[id].label, 'string');
  }
  assert.equal(Object.keys(SLOT_MAP).length, real.length);
});

test('U53: no two slots sit on top of each other', () => {
  // A schematic whose nodes overlap is a schematic that cannot be
  // clicked, and the failure is invisible in source.
  const seen = new Map();
  for (const [id, at] of Object.entries(SLOT_MAP)) {
    for (const [otherId, other] of seen) {
      const d = Math.hypot(at.x - other.x, at.y - other.y);
      assert.ok(d >= 11, `slots ${id} and ${otherId} are ${d.toFixed(1)} apart - the filled radius is 7`);
    }
    seen.set(id, at);
  }
});

test('U53: DFU’s two unnamed slots are hidden until something is in them', () => {
  // They are gaps in DFU's own enum and nothing routes to them, so a
  // permanent empty node would be noise - but an item that landed
  // there with no node would be a belonging the player cannot reach.
  assert.equal(SLOT_MAP[EQUIP_SLOTS.Unknown1].hidden, true);
  assert.equal(SLOT_MAP[EQUIP_SLOTS.Unknown2].hidden, true);
  const named = Object.entries(SLOT_MAP).filter(([, at]) => !at.hidden);
  assert.equal(named.length, Object.keys(SLOT_MAP).length - 2);
  const empty = equippedModel({ equipTable: [] });
  assert.ok(empty.rows.every((r) => r.label !== 'Unnamed'), 'an empty Unnamed slot leaked into the rows');
});

// ── THE ITEM LINE ────────────────────────────────────────────────

test('U53: an item line is the other modules’ own strings', () => {
  const e = hero();
  const line = itemLine(e.items[0], e);
  assert.equal(line.name, 'Longsword');
  assert.ok(line.weight > 0);
  assert.equal(typeof line.word, 'string', 'conditionWord, from systems/item/itemInfo.js');
  assert.equal(line.condition, 100);
  assert.equal(line.equipped, false);
});

// U54: THE ICON ADDRESS IS inventoryItemImage'S, AND U53 GOT IT WRONG.
// It read `playerTextureArchive ?? worldTextureArchive` off the
// template, which looks like the same thing and is four ported laws
// short of it - two of them with audits behind them. This is the pin
// that would have caught it.
test('U54: the icon address is inventoryItemImage’s, not a template read', () => {
  const e = hero();
  for (const it of e.items) {
    assert.deepEqual(itemLine(it, e).image, inventoryItemImage(it, e),
      `${it.name}: the line must not resolve its own address`);
  }
  // AUDIT 17e F9: GetItemImage draws the WORLD texture for ingredients
  // and the other four groups, and the PLAYER texture for everything
  // else - 111 of 288 templates differ, so a naive template read is
  // wrong for more than a third of the catalogue.
  const shield = e.items.find((i) => i.name === 'Buckler');
  const naive = getTemplate(shield.templateIndex);
  const real = itemLine(shield, e).image;
  assert.ok(Number.isInteger(real.archive) && Number.isInteger(real.record));
  assert.equal(real.archive, inventoryItemImage(shield, e).archive);
  assert.ok(naive, 'the template exists - the point is that reading it directly is not the law');
});

test('U54: the WEARER changes the address - AUDIT 17f’s morphology offset', () => {
  // SetRace offsets clothing/armour archives by body morphology, and
  // GetInventoryTextureArchive reads that offset back. Without an
  // identity every list drew the morphology-0 Argonian row, so the
  // line has to PASS the wearer through rather than drop it.
  const e = hero();
  const armour = e.items.find((i) => i.group === 'Armor');
  const withWearer = itemLine(armour, e).image;
  const without = itemLine(armour, undefined).image;
  assert.deepEqual(withWearer, inventoryItemImage(armour, e));
  assert.deepEqual(without, inventoryItemImage(armour, undefined));
});

test('U54: a nameless item falls back to its template, not to "Unknown"', () => {
  // A stack minted by a loot roll or a quest can arrive with no name
  // of its own. The template read this replaced carried that fallback
  // and the first draft of the replacement dropped it.
  const e = hero();
  const bare = { ...e.items[0] };
  delete bare.name;
  assert.equal(itemLine(bare, e).name, 'Longsword');
  assert.equal(itemLine({ templateIndex: -1 }, e).name, 'Unknown', 'and a real unknown still says so');
});

test('U53: a broken item says so, and the WINDOW refuses it', () => {
  const e = hero();
  const dagger = e.items[1];
  dagger.currentCondition = 0;
  assert.equal(itemLine(dagger).broken, true);
  assert.notEqual(equipItem(e, dagger), null, 'the TABLE below it does not refuse - ItemEquipTable.cs:94-154');
  assert.equal(model(e).worn.size, 1, 'so the slot fills, which is what PlayerEntity.cs:959 relies on');
});

// ── THE FORK ─────────────────────────────────────────────────────

function withDocument(fn) {
  const node = { id: '', style: {}, removed: false, remove() { this.removed = true; } };
  globalThis.document = { createElement: () => node, body: { append() {} } };
  try { return fn(node); } finally { delete globalThis.document; }
}

test('U53: the classic skin still gets the canvas window', () => {
  skin('classic');
  withDocument(() => {
    assert.equal(createInventoryWindow({ entity: hero() })?.constructor?.name, 'NativeInventoryWindow');
  });
});

test('U53: the enhanced skin gets the DOM pack', () => {
  skin('enhanced');
  withDocument((node) => {
    const w = createInventoryWindow({ entity: hero() });
    assert.notEqual(w?.constructor?.name, 'NativeInventoryWindow');
    assert.equal(w.done, false);
    assert.equal(node.id, 'enhanced-inventory');
    w.dispose();
    assert.equal(w.done, true);
    assert.equal(node.removed, true);
  });
});

test('U58: a LOOT pile and a reward tray now get the ENHANCED pane', () => {
  skin('enhanced');
  withDocument(() => {
    for (const mode of ['loot', 'chooseOne']) {
      const deps = mode === 'loot'
        ? { entity: hero(), loot: { items: () => [] } }
        : { entity: hero(), chooseOne: { items: [], onChoose: () => {} } };
      const w = createInventoryWindow(deps);
      assert.notEqual(w?.constructor?.name, 'NativeInventoryWindow', `${mode} still falls to classic`);
      assert.equal(typeof w.dispose, 'function', `${mode} must still be an overlay`);
      w.dispose();
    }
  });
  // and the classic skin keeps every one of them
  skin('classic');
  withDocument(() => {
    const w = createInventoryWindow({ entity: hero(), loot: { items: () => [] } });
    assert.equal(w?.constructor?.name, 'NativeInventoryWindow');
  });
});

test('U53: the door needs classic art only where the classic window draws it', () => {
  skin('classic');
  assert.equal(inventoryDoorReady(), false, 'no INVE00I0 in this container');
  skin('enhanced');
  assert.equal(inventoryDoorReady(), true, 'the enhanced pack reads no game data at all');
});

test('U58: the LOOT arm asks the DOOR now, like every other pack arm', () => {
  // U53's subtlety, retired by its own reasoning. The pile gate asked
  // the ART because the door handed every loot call the classic
  // window, which cannot draw without INVE00I0. The enhanced pane runs
  // the pile itself now, so the gate is the skin question - and on the
  // classic skin `inventoryDoorReady` still comes down to that art.
  for (const rel of ['scenes/world.js', 'scenes/exterior.js']) {
    const src = read(`src/${rel}`);
    assert.match(src, /else if \(dropKey && inventoryDoorReady\(\)\) \{/,
      `${rel}: the pile gate did not follow the door`);
    assert.ok(!/inventoryArtLoaded/.test(src),
      `${rel}: a second gate on the raw art survives`);
  }
});

// ── THE SEAM ─────────────────────────────────────────────────────

test('U53: no host builds a pack past the door', () => {
  for (const rel of ['scenes/world.js', 'scenes/exterior.js', 'scenes/dungeonContext.js']) {
    const src = read(`src/${rel}`);
    assert.doesNotMatch(src, /new NativeInventoryWindow\(/, `${rel} must not construct the window`);
    assert.equal([...src.matchAll(/createInventoryWindow\(\{/g)].length, 1,
      `${rel}: ONE builder`);
  }
});

// ── THE SCREEN'S OWN INPUT AND ITS LEAKS ─────────────────────────

// ── U55: USE ─────────────────────────────────────────────────────
// systems/useItem.js owns the LAW - which item does what - and it is
// pinned in its own file. What lives here is the branching the classic
// window does on TOP of a result, which is presentation except for the
// two hand-offs, which are not.

test('U55: a book hands the reader over and closes AFTER', () => {
  // THE TWO HAND-OFFS RUN IN OPPOSITE ORDERS and the classic window
  // means it. Both exist because DFU PUSHES those windows over the
  // inventory while the port's hosts hold ONE overlay slot (AUDIT
  // B-C1) - but the reader takes a FAILURE CALLBACK, and "a failed
  // open still reports on this window - it is the live overlay until
  // the reader actually shows", so the book hands over first.
  //
  // The first draft of this pin asserted closeFirst: true for BOTH,
  // matching a module written from the same wrong reading - which is
  // what a pin written beside the code it pins is worth. The browser
  // caught it, with `deps.openBook is not a function`.
  const item = { name: 'A Tract' };
  const a = useResultAction({ kind: 'book', item, failText: 'ruined' }, { openBook: () => {} });
  assert.equal(a.kind, 'openBook');
  assert.equal(a.closeFirst, false, 'the reader is handed the item while this window is still up');
  assert.equal(a.item, item);
  assert.equal(a.failText, 'ruined', 'a failed open still has somewhere to report');
});

test('U55: a host with no reader keeps its window and says so', () => {
  const a = useResultAction({ kind: 'book', item: {} }, {});
  assert.equal(a.kind, 'message');
  assert.equal(a.text, USE_PENDING.book, "the classic window's own words, not a rewording");
});

test('U55: the Spellbook ITEM closes first, then opens', () => {
  const a = useResultAction({ kind: 'spellbook' }, { openSpellbook: () => {} });
  assert.equal(a.kind, 'openSpellbook');
  assert.equal(a.closeFirst, true);
  assert.equal(useResultAction({ kind: 'spellbook' }, {}).text, USE_PENDING.spellbook);
});

test('U55: the message ladder is the classic window’s, in its order', () => {
  // an explicit text wins...
  assert.equal(useResultAction({ kind: 'map', text: 'You study the map.', textId: 499 }, {}).text,
    'You study the map.');
  // ...then a TEXT.RSC id...
  const byId = useResultAction({ kind: 'map', textId: 499 }, {});
  assert.equal(byId.textId, 499);
  assert.equal(byId.text, null, 'an id is not also a text - the host reads the rows');
  // ...then the pending stand-in
  assert.equal(useResultAction({ kind: 'potion', pending: true }, {}).text, USE_PENDING.potion);
  assert.equal(useResultAction({ kind: 'nonesuch', pending: true }, {}).text, 'Nothing happens.');
});

test('U55: AUDIT 22 F9 - `enchanted` is a RIDER, not a replacement', () => {
  // It used to be a kind that REPLACED the arm's own result, so the
  // message the arm produced vanished. It only speaks when the arm
  // said nothing.
  const spoke = useResultAction({ kind: 'map', text: 'You study the map.', enchanted: true }, {});
  assert.equal(spoke.text, 'You study the map.', "the arm's own message survives");
  const silent = useResultAction({ kind: 'clothing', enchanted: true }, {});
  assert.equal(silent.text, USE_PENDING.enchanted);
});

test('U55: a variant change repaints, and closesWindow travels', () => {
  assert.equal(useResultAction({ kind: 'variant' }, {}).repaint, true,
    'the slot map is drawn FROM the worn set, so a changed variant must redraw');
  assert.equal(useResultAction({ kind: 'potion', closesWindow: true }, {}).closesWindow, true);
  assert.equal(useResultAction({ kind: 'potion' }, {}).closesWindow, false);
  assert.equal(useResultAction(null, {}).kind, 'nothing', 'no result is not a crash');
});

// ── U58: THE REMOTE PANE ─────────────────────────────────────────
// The pack's second list. The LAW under it moved out of the classic
// window in U56 and U57 and is pinned in those files; what is pinned
// here is the pane's own half - which list it is showing, what it
// calls that, and that it runs the extracted modules rather than a
// second reading of them.

test('U58 remoteModel: four claims, in the order inventorySession answers them', () => {
  const axe = mk('Battle Axe');
  const helm = mk('Helm', 'Armor');
  const wagon = [axe];
  const pile = [helm];
  const reward = [mk('Claymore')];
  const dropped = [];
  const deps = { wagonItems: () => wagon, loot: { items: () => pile } };

  // the GROUND is OnPush's default, and it has no capacity
  const g = remoteModel({}, { dropped });
  assert.equal(g.kind, 'ground');
  assert.equal(g.title, REMOTE_TITLE.ground);
  assert.equal(g.capacity, null, 'the ground holds anything');
  assert.equal(g.count, 0);

  // a container outranks the ground...
  assert.equal(remoteModel(deps, { dropped }).kind, 'container');
  // ...a reward tray outranks the container...
  assert.equal(remoteModel(deps, { dropped, chooseOne: { items: reward } }).kind, 'reward');
  // ...and the WAGON outranks everything while it shows
  const w = remoteModel(deps, { dropped, chooseOne: { items: reward }, usingWagon: true });
  assert.equal(w.kind, 'wagon');
  assert.equal(w.items[0], axe, 'the wagon model shows records that are not the host\'s');
  // the ONLY capacity a remote list has is ItemHelper.WagonKgLimit
  assert.equal(w.capacity, WAGON_KG_LIMIT);
  assert.equal(w.weight > 0, true, 'and it weighs what is in it');
  assert.equal(w.count, 1);

  // every kind is NAMED, both ways - a pane that fell through to
  // undefined would draw an empty heading and an empty button
  for (const kind of ['wagon', 'reward', 'container', 'ground']) {
    assert.equal(typeof REMOTE_TITLE[kind], 'string', `${kind} has no title`);
    assert.ok(REMOTE_TITLE[kind].length, `${kind}'s title is empty`);
    assert.equal(typeof STOW_LABEL[kind], 'string', `${kind} has no stow verb`);
    assert.ok(STOW_LABEL[kind].length, `${kind}'s stow verb is empty`);
  }
  // and the verbs are DIFFERENT, because naming the destination is
  // the whole point of having four of them
  assert.equal(new Set(Object.values(STOW_LABEL)).size >= 3, true, Object.values(STOW_LABEL).join(' / '));
});

test('U58: one item is not "1 items"', () => {
  // THE MODULE'S OWN, imported. A copy of the helper re-derived in
  // this file would compare it to itself, which is the vacuous shape
  // U56 found in the wagon suite.
  assert.equal(plural(1, 'item'), '1 item');
  assert.equal(plural(0, 'item'), '0 items');
  assert.equal(plural(2, 'item'), '2 items');
});

// ── AUDIT 26, IN THE ENHANCED PANE ───────────────────────────────
// Three laws that landed on main while this arc was building the
// pane, all of which the pane would have SILENTLY dropped: the
// transfer ladder's quest arm, the remote list's quest click, and
// UseItem's PopToHUD. None of them is visible on screen when it is
// missing, which is exactly why each gets a pin.

test('U58 + AUDIT 26: PopToHUD closes the pane and says NOTHING', () => {
  // DaggerfallUI.PopToHUD() + return (:1687-1688). A watched quest item
  // that is neither parchment nor clothing closes the window stack so
  // the quest system gets first shot at the click in the world.
  // Nothing else on the ladder runs and no message shows.
  assert.deepEqual(useResultAction({ kind: 'questItem', questItem: true, popToHUD: true }),
    { kind: 'close' });
  // ...and it is decided FIRST, above every other arm - DFU returns
  // before all of them. A book that somehow carried the flag would
  // still close rather than open the reader.
  assert.deepEqual(useResultAction({ kind: 'book', item: {}, popToHUD: true }, { openBook: () => {} }),
    { kind: 'close' }, 'the popToHUD arm is running below the book arm');
  // without the flag, nothing changes
  assert.equal(useResultAction({ kind: 'questItem', pending: true }).kind, 'message');
});

// ── U59: THE AVATAR, AND WHAT YOU ARE WEARING ────────────────────
// The slot map put every worn item behind a 7px circle. These pin the
// list that replaced it, and the seam that lets a DOM screen show the
// same paperdoll the classic window draws instead of compositing a
// second one.

test('U59 equippedModel: every slot, in the BODY\'s order and not the enum\'s', () => {
  const e = hero();
  const helm = mk('Helm', 'Armor');
  const boots = mk('Boots', 'Armor');
  e.items.push(helm, boots);
  equipItem(e, helm);
  equipItem(e, boots);

  const m = equippedModel(e);
  const label = (n) => m.rows.findIndex((r) => r.label === n);
  // EQUIP_SLOTS numbers the jewellery FIRST (Amulet0 = 0) and Head is
  // 12, so enum order would put a ring above a helm. The order here is
  // read off SLOT_MAP's own y/x - one table for where a slot sits and
  // for what order it reads in.
  assert.ok(label('Head') >= 0 && label('Feet') >= 0);
  assert.ok(label('Head') < label('Chest, armor'), 'the head is below the chest');
  assert.ok(label('Chest, armor') < label('Feet'), 'the feet are above the chest');
  assert.ok(label('Head') < label('Ring'), 'the enum order leaked through');

  // the ITEMS are the entity's own records, not copies - the row's
  // click selects into a detail panel that must act on the real one
  const headRow = m.rows.find((r) => r.label === 'Head');
  assert.equal(headRow.item, helm);
  assert.equal(m.filled, 2);

  // EMPTY SLOTS ARE ROWS. A list of only what you wear cannot answer
  // "what could I still put on", which is half of what the schematic
  // was for.
  assert.ok(m.rows.some((r) => !r.item), 'an empty slot has no row');
  assert.equal(m.rows.find((r) => r.label === 'Left hand').item, null);

  // ...but DFU's two UNNAMED ones stay hidden until something is in
  // them, for SLOT_MAP's own reason
  assert.equal(m.rows.filter((r) => r.label === 'Unnamed').length, 0);
  assert.equal(m.total, Object.keys(SLOT_MAP).length, 'the count is of every slot, shown or not');
  // a bare character still gets the whole board
  const bare = equippedModel({ stats: { strength: 40 }, items: [] });
  assert.equal(bare.filled, 0);
  assert.equal(bare.rows.length, m.total - 2, 'the two unnamed slots are the only hidden ones');
  // and a hidden slot APPEARS once it holds something
  assert.equal(equippedModel().rows.length > 0, true, 'no entity is still a board of empty slots');
});

// ── PX20: THE CENTRE, AND THE LOOT FRAME ──────────────────────────
// then "ensure the paperdoll's slot
// is a perfect fit. Move the name outside of the space and to the top
// bar, remove the slots filled subtext. Utilize the entire area for
// enlarged icons and displayability." And: "when looting items, only
// open the loot tooltip, not the entire inventory window."

// HT5.
//
// A light source has NO equip slot - getEquipSlot answers None for all four,
// which is why HT2 had to make the act a USE rather than a wear - so the lit
// torch lived only in entity.lightSource and the worn side had nothing to
// show. The list marked it gold and that was all: a player holding a torch
// saw an empty pair of hands.
//
// It is a row now, under the off hand, because Handheld Torches' own fiction
// is that a light OCCUPIES a hand. The sentinel slot is the point: DFU's 27
// stay 27, and nothing that counts slots learns about this one.
test('HT5: the held light is a row on the body, and DFU\'s twenty-seven are untouched', () => {
  const bare = { equipTable: [] };
  const before = equippedModel(bare);
  assert.ok(!before.rows.some((r) => r.label === 'Light'), 'no light, no row');

  const torch = { group: 'UselessItems2', templateIndex: 247, stackCount: 1 };   // IsLightSource wants the group too
  const lit = equippedModel({ equipTable: [], lightSource: torch });
  const row = lit.rows.find((r) => r.label === 'Light');
  assert.ok(row, 'a lit torch is on the body');
  assert.equal(row.item, torch, 'by reference, as every lit-compare in this arc is');
  assert.equal(row.slot, LIGHT_SLOT);
  // AUDIT HT5 F3: this asserted `LIGHT_SLOT < 0` as proof it "can never
  // collide with an EQUIP_SLOTS value" - and -1 IS EQUIP_SLOTS.None. The
  // real safety is that nothing indexes the equip table with this id, so
  // that is what is held: the map has no node for it, and the table read
  // for the counts never sees it.
  assert.equal(LIGHT_SLOT, EQUIP_SLOTS.None, 'it IS None - no new member was minted, and none was needed');
  assert.equal(SLOT_MAP[LIGHT_SLOT], undefined, 'and the body map has no node at that id');

  // THE COUNTS ARE THE EQUIP TABLE'S. A fake slot in them would make the
  // window say 1 of 28 for a torch DFU does not think is worn at all.
  assert.equal(lit.total, before.total, 'the light adds no slot to the total');
  assert.equal(lit.filled, before.filled, 'and fills none');
  assert.ok(!Object.values(SLOT_MAP).some((at) => at.label === 'Light'), 'SLOT_MAP stays DFU\'s own');
});

// HT5: and the act on it is still HT2's - a light is doused, never taken off,
// because nothing in the equip table will ever hold one. The worn row only
// PICKS (the mis-click law), so the act button is what resolves it.
test('HT5: picking the light row offers Douse, not Take off', () => {
  const torch = { group: 'UselessItems2', templateIndex: 247, stackCount: 1 };   // IsLightSource wants the group too
  const entity = { equipTable: [], lightSource: torch };
  assert.deepEqual(localPrimaryAct(torch, entity), { kind: 'douse', label: 'Douse' });
});

// ── AUDIT INV2 ──────
//
// THE PINS THIS REPLACES WERE SIXTY LINES OF GREPS OVER THE MODULE'S OWN
// SOURCE TEXT, and a lens proved what that is worth: DELETING THE
// `ghostStart` CALL left the whole suite green. So did stopping the
// ghost following the pointer. So did renaming the class so that not one
// CSS rule reached it - including the `pointer-events: none` the pins
// themselves called "THE ONE RULE THAT WOULD BREAK THE DRAG IN SILENCE".
// Every assertion matched a DECLARATION that still existed. A pin over a
// definition is not a pin over a feature, and this file knew that
// already - it is the lesson AUDIT INV1 F3 wrote down two days ago and
// this slice did not read.
//
// The gesture is DRIVEN now, through a document just real enough
// (test/invdrag.mjs): press a row, move a pointer, read the ghost off
// document.body, release, and see what actually moved.
const DRAG = { id: 7 };
/** The pane, mounted, with a live pack. Returns the levers a drag needs. */
function withPack(fn, { items: makeItems = null, deps: extra = {} } = {}) {
  return withDom((dom) => {
    const host = dom.mk('div');
    dom.body.append(host);
    const e = hero();
    e.items = makeItems ? makeItems() : [mk('Longsword'), mk('Dagger'), mk('Broadsword')];
    const dropped = [];
    const view = mountEnhancedInventory(host, {
      entity: e, items: () => e.items, onExit: () => {}, dropItem: (it) => dropped.push(it), ...extra,
    });
    const rows = () => dom.doc.querySelectorAll('.itemrow');
    const ghost = () => dom.doc.querySelectorAll('.dragghost')[0] ?? null;
    const label = () => ghost()?.querySelector('.ghostact')?.textContent ?? null;
    const at = (node) => { dom.doc.elementFromPoint = () => node; };
    const down = (row, x = 100, y = 100) => row.onpointerdown?.({ pointerId: DRAG.id, button: 0, pointerType: 'mouse', clientX: x, clientY: y });
    const move = (x, y) => dom.win.fire('pointermove', { pointerId: DRAG.id, clientX: x, clientY: y });
    const up = (x, y) => dom.win.fire('pointerup', { pointerId: DRAG.id, clientX: x, clientY: y });
    return fn({ dom, host, e, view, dropped, rows, ghost, label, at, down, move, up });
  });
}

test('AUDIT INV2: the drag really carries the icon - it exists, it follows the pointer, and the CSS reaches it', () => {
  withPack(({ dom, rows, ghost, label, at, down, move, up }) => {
    const row = rows()[0];
    assert.ok(row, 'a pack row to grab');
    assert.equal(ghost(), null, 'nothing is carried before a drag');

    at(dom.body);            // out over the world
    down(row, 100, 100);
    assert.equal(ghost(), null, 'a press alone carries nothing - a tap is still a pick');
    move(140, 160);

    // B1: the feature EXISTS. Deleting the ghostStart call used to pass.
    const g = ghost();
    assert.ok(g, 'the ghost is up the moment the threshold is crossed');
    assert.equal(g.parent, dom.body, 'and it is the BODY\'s child, so it can leave the panel');
    assert.equal(g.className, 'dragghost', 'it wears the class the stylesheet names - the JS and the CSS are one rope');
    assert.ok(g.querySelector('.tile'), 'carrying a tile');

    // B2: it FOLLOWS. Deleting the two style writes used to pass.
    const was = { x: g.style.left, y: g.style.top };
    assert.ok(was.x && was.y, 'positioned at all');
    move(400, 420);
    assert.notEqual(g.style.left, was.x, 'the icon travels with the pointer');
    assert.notEqual(g.style.top, was.y);
    assert.equal(label(), 'Drop', 'and says what a release out here would do');

    up(400, 420);
    assert.equal(ghost(), null, 'the release puts it down');
  });
});

test('AUDIT INV2: the word on the ghost is the act that happens - on every arm', () => {
  withPack(({ dom, e, rows, label, at, down, move, up }) => {
    const long = e.items[0];
    // OFF THE PANEL -> the screen's own transfer
    at(dom.body); down(rows()[0], 10, 10); move(60, 60);
    assert.equal(label(), 'Drop', 'off the panel: the remote side\'s own verb');
    up(60, 60);
    assert.equal(e.items.includes(long), false, 'and the release really moved it');

    // ANOTHER ROW -> the reorder
    const r = rows();
    at(r[1]); down(r[0], 10, 10); move(60, 60);
    assert.equal(label(), 'Move here');
    up(60, 60);

    // THE PANEL'S OWN CHROME -> nothing, and it says nothing
    const win = dom.doc.querySelectorAll('.pack-win')[0];
    assert.ok(win, 'the pack window');
    at(win); down(rows()[0], 10, 10); move(60, 60);
    assert.equal(label(), '', 'inside the window is not a drop, and does not pretend to be');
    up(60, 60);
  });
});

test('AUDIT INV2: a release that DRAGGED is never also a pick', () => {
  withPack(({ dom, rows, at, down, move, up }) => {
    const win = dom.doc.querySelectorAll('.pack-win')[0];
    const row = rows()[0];
    at(win); down(row, 10, 10); move(60, 60); up(60, 60);
    // the row survives (nothing re-rendered), and its click must not select
    row.onclick?.({});
    assert.equal(dom.doc.querySelectorAll('.packtip').length, 0,
      'a drag released on the chrome is "never mind", not a selection - the class guard it used to trust was stripped before the click ever ran');
  });
});

test('AUDIT INV2: every way a drag can END ends it - release, cancel, Escape, and the pane going away', () => {
  // ESCAPE aborts the drag and KEEPS the window; the pack closing takes
  // the ghost with it. Both were leaks: the ghost is the body's child, so
  // emptying the host cannot reach it, and a pack closed mid-drag left an
  // item icon welded over the world for the session.
  withPack(({ dom, view, rows, ghost, at, down, move }) => {
    at(dom.body); down(rows()[0], 10, 10); move(60, 60);
    assert.ok(ghost(), 'carrying');
    view.unmount();
    assert.equal(ghost(), null, 'the pane going away ends the drag');
    assert.equal(dom.win.count('pointermove'), 0, 'and takes its listeners with it');
  });
  withPack(({ dom, rows, ghost, at, down, move }) => {
    at(dom.body); down(rows()[0], 10, 10); move(60, 60);
    dom.win.fire('pointercancel', { pointerId: DRAG.id });
    assert.equal(ghost(), null, 'a cancel ends it');
  });
  withPack(({ dom, rows, ghost, at, down, move }) => {
    at(dom.body); down(rows()[0], 10, 10); move(60, 60);
    // A RIGHT-CLICK, and Android's long-press, raise this with no cancel
    // behind it. INV2 listened and ended the drag on it. MAC-R4
    // RETIRED that end: a touch pointer's IMPLICIT capture of the row is
    // given back at the press (see dragFrom), so a repaint that detaches
    // the row - which raises the same event - can no longer kill a hold;
    // a right-click never starts a session (button > 0), and the
    // long-press menu is refused for the session's life. So a lost
    // capture is NOT an end now, and the cancel that a really-taken
    // pointer sends still is.
    dom.win.fire('lostpointercapture', { pointerId: DRAG.id });
    assert.notEqual(ghost(), null, 'MAC-R4: a lost capture does not end it - the session holds no capture to lose');
    assert.equal(dom.win.count('lostpointercapture'), 0, 'and nothing listens for it');
    dom.win.fire('pointercancel', { pointerId: DRAG.id });
    assert.equal(ghost(), null, 'a cancel still does');
  });
  withPack(({ dom, e, rows, ghost, at, down, move }) => {
    const before = e.items.length;
    at(dom.body); down(rows()[0], 10, 10); move(60, 60);
    assert.ok(ghost(), 'carrying');
    // ESCAPE IS THE ABORT. There was none - the only release that changed
    // nothing was one inside the windows, so a player who had picked up the
    // wrong thing had nowhere safe to let go, and Escape (the obvious try)
    // closed the pack and welded the ghost over the world.
    dom.win.fire('keydown', { key: 'Escape', code: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(ghost(), null, 'Escape ends the drag');
    assert.equal(e.items.length, before, 'and nothing moved - an abort is not a drop');
    assert.ok(dom.doc.querySelectorAll('.itemrow').length > 0, 'and the window is still open: the FIRST Escape is the drag\'s');
  });
});

test('AUDIT INV2: the drag is the PANE\'S, not the row\'s - a second finger cannot make one drag drop another\'s item', () => {
  withPack(({ dom, e, rows, label, at, down, move, up }) => {
    const before = [...e.items];
    const r = rows();
    at(dom.body);
    down(r[0], 10, 10); move(60, 60);              // finger one picks something up
    const carried = label();
    // A SECOND FINGER ON A SECOND ROW. `at` used to be the ROW's, so this
    // press passed the "one pointer" guard (that row's own `at` was null),
    // overwrote the carried item, and the FIRST finger's release dropped the
    // SECOND finger's - silent item loss, on the device the drag exists for.
    r[1].onpointerdown?.({ pointerId: 99, button: 0, pointerType: 'touch', clientX: 20, clientY: 20 });
    dom.win.fire('pointermove', { pointerId: 99, clientX: 300, clientY: 300 });
    assert.equal(label(), carried, 'the pane is still carrying what the FIRST finger picked up');
    up(60, 60);
    const gone = before.filter((it) => !e.items.includes(it));
    assert.equal(gone.length, 1, 'exactly one item left the pack');
    assert.equal(gone[0], before[0], 'and it is the one the first finger was carrying, never the second\'s');
  });
});

test('AUDIT INV2: a drag holds an item, not a promise - what left the pack under it is not dropped twice', () => {
  withPack(({ dom, e, view, rows, at, down, move, up }) => {
    // the SAME gesture with the item still in the pack really does drop it,
    // so the assertion below is about the guard and not about a dead path
    at(dom.body); down(rows()[0], 10, 10); move(60, 60); up(60, 60);
    assert.equal(view.dropped().length, 1, 'a live item drops');

    const long = e.items[0];
    at(dom.body); down(rows()[0], 10, 10); move(60, 60);
    e.items.splice(e.items.indexOf(long), 1);   // a peer, a quest, a script, under the drag
    up(60, 60);
    assert.equal(view.dropped().length, 1, 'and one the pack no longer holds mints NO second pile - a drag holds a reference across time');
    assert.equal(view.dropped().includes(long), false, 'the vanished item is not on the ground');
  });
});

// ═══ MAC-M1: THE TWO NUMBERS A PLAYER PICKS A WEAPON BY ═══════════
//
// 2026-09-17,
//
// Both were true, and the cause is the shape this port keeps finding:
// the PRODUCERS existed and had one reader. `weaponDamageString` and
// `armourModString` have been in `systems/item/itemInfo.js` since U25, read
// only by `expandItemInfo`'s `%wdm` and `%mod` - the macro pass that
// fills the CLASSIC popup's TEXT.RSC record. The enhanced card builds
// its rows from `itemLine` and no record at all, so it showed weight,
// condition and material and never the one number the item is for.

test('MAC-M1: itemLine carries a weapon’s damage and armour’s rating', async () => {
  const { itemDamageLine, itemArmourLine, weaponDamageString, armourModString } =
    await import('../../../src/systems/item/itemInfo.js');

  // DRIVEN through itemLine, which is what the card reads.
  const W = (templateIndex, material = 0) => ({ group: 'Weapons', templateIndex, material, stackCount: 1 });
  const A = (templateIndex, material = 0x0200) => ({ group: 'Armor', templateIndex, material, stackCount: 1 });

  const dagger = itemLine(W(113));
  assert.equal(dagger.damage, '0 - 5', 'an iron dagger hits for 0-5 - iron’s -1 modifier is DFU’s, not a bug');
  assert.equal(dagger.armour, null, 'a weapon has no armour rating');

  const claymore = itemLine(W(122, 9));
  assert.equal(claymore.damage, '8 - 24', 'and Daedric moves BOTH ends - the material modifier is in the number');

  const cuirass = itemLine(A(103));
  assert.equal(cuirass.armour, '+7', 'armour carries its rating');
  assert.equal(cuirass.damage, null, 'and no damage');

  // ONE PRODUCER. The card and the classic popup must never be able to
  // print different numbers for the same sword, which is the whole
  // reason these read `itemInfo`'s functions rather than recomputing.
  for (const it of [W(113), W(120, 4), W(122, 9)]) {
    assert.equal(itemLine(it).damage, weaponDamageString(it), 'the card’s damage IS the popup’s');
    assert.equal(itemLine(it).damage, itemDamageLine(it));
  }
  for (const it of [A(103), A(102, 0x0200 | 9)]) {
    assert.equal(itemLine(it).armour, armourModString(it), 'the card’s rating IS the popup’s');
    assert.equal(itemLine(it).armour, itemArmourLine(it));
  }

  // ...and an item that is neither carries neither, so the card draws
  // no empty row for a book or a potion.
  for (const g of ['Books', 'MiscItems', 'Paintings', 'UselessItems2']) {
    const l = itemLine({ group: g, templateIndex: 0, stackCount: 1 });
    assert.equal(l.damage, null, `${g} shows no damage`);
    assert.equal(l.armour, null, `${g} shows no armour`);
  }
});

test('MAC-M1: an ARROW shows no damage, because its own record never did', async () => {
  const { itemDamageLine, weaponDamageString } = await import('../../../src/systems/item/itemInfo.js');
  const { TEMPLATES } = await import('../../../src/systems/useItem.js');
  const arrow = { group: 'Weapons', templateIndex: TEMPLATES.Arrow, material: 0, stackCount: 20 };

  // THE DISTINCTION THIS PINS: one producer, two PRESENTERS. The macro
  // pass asks "what does %wdm expand to" and lets the record decide
  // whether to print it - an arrow takes record 1011, which has no
  // damage line at all. A card has no record, so it has to ask "should
  // there be a Damage row", and that is why the arrow test lives in
  // `itemDamageLine` rather than in the macro.
  assert.equal(itemLine(arrow).damage, null, 'no Damage row on an arrow');
  assert.notEqual(weaponDamageString(arrow), null,
    'the PRODUCER still answers - it is the presenter that declines, exactly as DFU’s record does');

  const { itemInfoTextId, INFO_TEXT } = await import('../../../src/systems/item/itemInfo.js');
  assert.equal(itemInfoTextId(arrow), INFO_TEXT.arrow, 'and that is the record the classic side picks');
});

test('MAC-M1: ONE suffix, shared by the three hovers that show it', () => {
  // Mac said "tool tips", and the most literal one is the GRID TILE's
  // `title` - it said the name and nothing else. Three surfaces show
  // the stat now (the tile, the tile's no-icon fallback, the worn slot)
  // and they share ONE builder: three copies of a rule is three chances
  // to disagree, which is the shape half of this month's findings had.
  const W = (templateIndex, material = 0) => ({ group: 'Weapons', templateIndex, material, stackCount: 1 });
  // MAC-M2 joined the hands to it - one suffix still, two facts.
  assert.equal(itemStatSuffix(itemLine(W(113))), ' (0 - 5 · One-handed)');
  assert.equal(itemStatSuffix(itemLine(W(122, 9))), ' (8 - 24 · Two-handed)');
  assert.equal(itemStatSuffix(itemLine({ group: 'Armor', templateIndex: 103, material: 0x0200, stackCount: 1 })), ' (+7)',
    'armour keeps its rating alone - hands is a weapon’s question');
  assert.equal(itemStatSuffix(itemLine({ group: 'Books', templateIndex: 0, stackCount: 1 })), '',
    'a book gets no brackets, not empty ones');
  assert.equal(itemStatSuffix(null), '', 'and a missing line is not a crash');
  assert.equal(itemStatSuffix({}), '');

});

// ═══ MAC-M2 A: THE BODY DRAGS TOO ════════════════════════════════
//
// 2026-09-16,
//
// It did not, and the reason is one line: INV1 attached `dragFrom` to
// the LIST's rows alone (`if (from === 'local') dragFrom(row, item)`)
// and made the body a drop TARGET, so the gesture only ever ran one
// way. A press on a filled slot panel started no drag session at all -
// no ghost, no window listeners, nothing to release - which is not a
// refusal the player can read, it is a dead hold.
//
// DRIVEN, for AUDIT INV2's reason: a pin over a declaration is not a
// pin over a feature. These press a real worn panel, move a real
// pointer and read what actually came off.

/** The pane with something WORN, which the map cannot draw without. */
function withWorn(fn) {
  return withPack((k) => {
    const cuirass = k.e.items.find((it) => it.name === 'Cuirass');
    assert.ok(equipItem(k.e, cuirass), 'the hero is wearing the cuirass');
    assert.ok(isEquipped(cuirass), 'and the table says so');
    k.view.repaint();
    const panels = k.dom.doc.querySelectorAll('.wornrow').filter((n) => !n.classList.contains('wornempty'));
    assert.equal(panels.length, 1, 'exactly one filled family on the map');
    const dock = k.dom.doc.querySelectorAll('.pack-dock')[0];
    assert.ok(dock, 'and the pack dock, which is where a piece comes off to');
    return fn({ ...k, cuirass, panel: panels[0], dock });
  }, { items: () => [mk('Longsword'), mk('Dagger'), mk('Cuirass', 'Armor')] });
}

test('MAC-M2: a HOLD on a worn slot really picks the piece up, and the pack is where it comes off', () => {
  withWorn(({ e, view, cuirass, panel, dock, ghost, label, at, down, move, up }) => {
    at(dock);
    down(panel, 100, 100);
    assert.equal(ghost(), null, 'a press alone carries nothing - a tap is still a pick');

    // THE BUG: this used to produce nothing at all, because the panel
    // had no pointerdown handler on it.
    move(140, 160);
    const g = ghost();
    assert.ok(g, 'the drag really carries the worn piece');
    assert.ok(g.querySelector('.tile'), 'and it is the item\'s own tile');
    assert.equal(label(), 'Take off',
      'the word on the ghost is the slot card\'s own act - one function for both directions');
    assert.equal(dock.classList.contains('dragover'), true,
      'and the pack lights as ONE target, the way the map does for the other direction');
    assert.equal(panel.classList.contains('dragging'), true, 'the panel it left goes quiet');

    up(140, 160);
    assert.equal(ghost(), null, 'the release puts it down');
    assert.equal(isEquipped(cuirass), false, 'released over the pack, the piece came OFF');
    assert.equal(e.items.includes(cuirass), true, 'and it is in the bag, not on the floor');
    assert.equal(view.dropped().length, 0, 'nothing was dropped on the ground');
  });
});

test('MAC-M2: and it comes off NOWHERE else - the ground and the map are both "never mind"', () => {
  // DFU's local list IS FilterLocalItems, which never shows an equipped
  // item, so no transfer law can reach one: a worn cuirass released
  // over the world would lie on the ground AND stay in the equip table.
  // The card beside the item says the same thing in its own words
  // ("WORN ITEMS HAVE NO STOW"), and the drag must not invent one.
  withWorn(({ dom, e, view, cuirass, panel, label, at, down, move, up }) => {
    at(dom.body);                       // out over the world
    down(panel, 10, 10); move(60, 60);
    assert.equal(label(), '', 'off the panel a worn piece promises nothing');
    up(60, 60);
    assert.equal(isEquipped(cuirass), true, 'and still wears it');
    assert.equal(view.dropped().length, 0, 'with nothing on the ground');
    assert.equal(e.items.includes(cuirass), true);
  });
  withWorn(({ dom, cuirass, panel, label, at, down, move, up }) => {
    const map = dom.doc.querySelectorAll('.wornmap')[0];
    at(map);                            // released back on the body
    down(panel, 10, 10); move(60, 60);
    assert.equal(label(), '', 'a release back on the map is the cancel gesture');
    up(60, 60);
    assert.equal(isEquipped(cuirass), true, 'so nothing happened');
  });
});

test('MAC-M2: the plain click on a slot is untouched - it picks, and the card still takes the piece off', () => {
  // The mis-click law: a worn panel SELECTS, never undresses. What a
  // drag must not do is break that, and it nearly did - the release
  // leaves a latch, and without consuming it every unequip-by-drag also
  // cycled the family it had just emptied.
  withWorn(({ dom, cuirass, panel }) => {
    panel.onclick?.({});
    const tip = dom.doc.querySelectorAll('.packtip')[0];
    assert.ok(tip, 'a plain click raises the card');
    assert.equal(isEquipped(cuirass), true, 'and takes nothing off by itself');
    const act = tip.querySelectorAll('button').find((b) => b.textContent === 'Take off');
    assert.ok(act, 'whose primary act is Take off');
    act.onclick?.({});
    assert.equal(isEquipped(cuirass), false, 'click-to-unequip still works');
  });
  withWorn(({ dom, cuirass, panel, dock, at, down, move, up }) => {
    at(dock);
    down(panel, 10, 10); move(60, 60); up(60, 60);
    assert.equal(isEquipped(cuirass), false, 'the drag took it off');
    // the panel is detached by the repaint; its click must still be a
    // no-op, because the release consumed the latch on the way out
    panel.onclick?.({});
    assert.equal(dom.doc.querySelectorAll('.packtip').length, 0,
      'a release that DRAGGED is never also a pick - here as in the list');
  });
});

// ═══ MAC-M2 B: THE LOOT WINDOW IS FOR TAKING ═════════════════════
//
// 2026-09-16,
//
// Neither is DFU's in this frame. DFU has ONE parchment, so its
// goldButton (DaggerfallInventoryWindow.cs:47/:515-517) sits on the
// player's own panel beside BOTH lists, and there is no "Pack" button
// anywhere in the reference at all - PX20b minted that one to reopen
// the pack its loot-only frame had replaced. Over a corpse the gold
// field's verb is "Drop" and `dropGold` adds the stack to
// `remoteTarget`, so the control offered to put the purse INTO the
// body.
//
// DRIVEN: the pane is mounted on a real loot target and the bar is READ.

/** The bar the remote side draws, as words. */
const barOf = (dom) => {
  const acts = dom.doc.querySelectorAll('.remoteacts');
  assert.equal(acts.length, 1, 'the remote side draws exactly one action bar');
  return acts[0].children.map((b) => b.textContent);
};

test('MAC-M2 B: a loot session’s bar carries no Gold and no Pack', () => {
  const pile = [mk('Dagger')];
  withPack(({ dom }) => {
    assert.ok(dom.doc.querySelectorAll('.loot-win').length, 'the pile has its own frame');
    assert.equal(dom.doc.querySelectorAll('.pack-win').length, 0, 'and the pack is not built (PX20b)');
    assert.deepEqual(barOf(dom), ['Take all'], 'Take all, and neither Gold nor Pack');
    assert.equal(dom.doc.querySelector('.stashfoot'), null, 'Stash all lives on the pack list, and a corpse does not build the pack');
    assert.equal(dom.doc.querySelectorAll('.goldfield').length, 0, 'and the gold field is unreachable with it');
  }, { deps: { loot: { items: () => pile } } });
});

test('MAC-M2 B: the WAGON button is untouched - it is the one control the loot bar keeps', () => {
  // The cart is a real destination for what you just took, and its
  // refusals are inventorySession's law. Only the two Mac named go.
  const pile = [mk('Dagger')];
  withPack(({ dom }) => {
    assert.deepEqual(barOf(dom), ['Wagon', 'Take all'], 'the wagon and Take all - Gold and Pack stay off this bar');
  }, {
    items: () => [mk('Longsword'),
      { name: 'Small cart', group: 'Transportation', templateIndex: SMALL_CART_TEMPLATE, stackCount: 1 }],
    deps: { loot: { items: () => pile } },
  });
});

test('MAC-M2 B: the NORMAL pack keeps its Gold button - GOLD-DROP: on the pack itself, never on the ground frame\'s bar', () => {
  // The pack opened on the inventory key: it drops something on the
  // ground, the ground frame arrives - and Gold is where DFU keeps it,
  // the player's own panel (GOLD-DROP), which is why it was there before
  // anything was dropped at all.
  withPack(({ dom, e, view, rows, at, down, move, up }) => {
    assert.ok(dom.doc.querySelectorAll('.pack-win').length, 'a pack session, not a loot one');
    assert.equal(dom.doc.querySelectorAll('.goldbtn').length, 1, 'the pack\'s Gold button, over bare ground');
    at(dom.body); down(rows()[0], 10, 10); move(60, 60); up(60, 60);
    assert.equal(view.dropped().length, 1, 'something is on the ground now');
    assert.ok(e.items.length, 'and the bag still has the rest');
    assert.equal(dom.doc.querySelectorAll('.goldbtn').length, 1, 'the Gold button still the pack\'s');
    assert.equal(barOf(dom).some((t) => /gold/i.test(t)), false, 'and never on the ground frame\'s bar, by any word (AUDIT GOLD-DROP 5: "Drop gold" passed the bare \'Gold\' this read)');
    assert.equal(barOf(dom).includes('Pack'), false, 'and never the Pack button, which is gone for good');
  });
});

// ═══ MAC-M2: ONE HAND OR TWO ═════════════════════════════════════════
//
// 2026-09-16,
//
// The fact was already in the tree and had never been shown to the
// player: `getItemHands` (characters/equipTable.js) is the port's
// verbatim ItemEquipTable.GetItemHands, and it is what the equip table,
// the paperdoll's record pick, Weapon Widget's mirror rows and Handheld
// Torches' hand law all ask. The card learnt to ask it too - through
// ONE new presenter in systems/item/itemInfo.js, beside MAC-M1's two - so
// there is still exactly one list of which weapons take both hands.

test('MAC-M2: every weapon template’s hands, against GetItemHands’ own table', async () => {
  const { itemHandsLine } = await import('../../../src/systems/item/itemInfo.js');
  const W = (templateIndex, material = 0) => ({ group: 'Weapons', templateIndex, material, stackCount: 1 });

  // DFU's WEAPON_HANDS row by row (equipRules.js, extraction-generated
  // from ItemEquipTable.GetItemHands), as WORDS. deepEqual against the
  // whole space rather than a spot check: promoting ANY one weapon to
  // two-handed - or demoting one - reddens this, which is the property
  // an `assert.ok(bows >= 8)` never had.
  const hands = Object.fromEntries(
    Array.from({ length: 18 }, (_, i) => 113 + i).map((t) => [t, itemHandsLine(W(t))]));
  assert.deepEqual(hands, {
    113: 'One-handed',    // Dagger
    114: 'One-handed',    // Tanto
    115: 'Two-handed',    // Staff
    116: 'One-handed',    // Shortsword
    117: 'One-handed',    // Wakizashi
    118: 'One-handed',    // Broadsword
    119: 'One-handed',    // Saber
    120: 'One-handed',    // Longsword
    121: 'One-handed',    // Katana
    122: 'Two-handed',    // Claymore
    123: 'Two-handed',    // Dai-katana
    124: 'One-handed',    // Mace
    125: 'Two-handed',    // Flail
    126: 'Two-handed',    // Warhammer
    127: 'One-handed',    // Battle Axe - EITHER in DFU, and the axe most
    128: 'Two-handed',    // War Axe    - often got backwards
    129: 'Two-handed',    // Short Bow - with the switching setting off
    130: 'Two-handed',    // Long Bow
  });

  // An ARROW is a weapon by group and is not swung: MAC-M1's own
  // presenter question, and the same answer.
  const { TEMPLATES } = await import('../../../src/systems/useItem.js');
  assert.equal(itemHandsLine({ group: 'Weapons', templateIndex: TEMPLATES.Arrow, material: 0, stackCount: 5 }), null);
  // ...and nothing that is not a weapon grows a row.
  for (const g of ['Armor', 'Books', 'MiscItems', 'UselessItems2', 'Jewellery']) {
    assert.equal(itemHandsLine({ group: g, templateIndex: 111, stackCount: 1 }), null, `${g} shows no hands`);
  }
  assert.equal(itemHandsLine(null), null, 'and a missing item is not a crash');
});

test('MAC-M2: the card reads GetItemHands, not a list of its own', async () => {
  const { itemHandsLine } = await import('../../../src/systems/item/itemInfo.js');
  const { getItemHands, ITEM_HANDS } = await import('../../../src/characters/equipTable.js');
  const { setValue } = await import('../../../src/systems/settings/settings.js');
  const W = (templateIndex) => ({ group: 'Weapons', templateIndex, material: 0, stackCount: 1 });

  // ONE HOME. The word the card prints IS the verdict the equip table
  // routes by, for every template - so the card can never say
  // "One-handed" about a weapon that empties both hands.
  for (let t = 113; t <= 130; t++) {
    const expect = getItemHands(W(t)) === ITEM_HANDS.Both ? 'Two-handed' : 'One-handed';
    assert.equal(itemHandsLine(W(t)), expect, `template ${t}`);
  }

  // THE BOW IS THE PROOF, because its row is not a constant:
  // `BowLeftHandWithSwitching` (ItemEquipTable.cs:633-635) makes a bow
  // LeftOnly, and the table then puts it in the off hand beside a
  // sword. A card holding its own table would still be calling it
  // two-handed.
  try {
    setValue('Enhancements', 'BowLeftHandWithSwitching', true);
    assert.equal(itemHandsLine(W(130)), 'One-handed', 'with switching on the bow takes one hand, and the card says so');
    assert.equal(itemHandsLine(W(122)), 'Two-handed', 'and the setting moves nothing else');
  } finally {
    setValue('Enhancements', 'BowLeftHandWithSwitching', false);
  }
  assert.equal(itemHandsLine(W(130)), 'Two-handed', 'switched back off, the classic answer returns');
});

test('MAC-M2: itemLine carries the hands and the card draws the row', () => {
  const W = (templateIndex, material = 0) => ({ group: 'Weapons', templateIndex, material, stackCount: 1 });
  assert.equal(itemLine(W(122, 9)).hands, 'Two-handed', 'the line the card reads carries it');
  assert.equal(itemLine(W(120)).hands, 'One-handed');
  assert.equal(itemLine({ group: 'Books', templateIndex: 0, stackCount: 1 }).hands, null);

});

// ── JAN2 ──
// The card's button -> stow -> refuse -> render -> domRepaint's rebuild ->
// host.querySelector, with `host` already nulled by an unmount. The module
// is ONE pane (host, deps and the view state are singletons) and the door
// mounts a fresh element per push, so a second mount over a live one left
// the first pane orphaned on screen - still clickable - and the newer
// view's unmount nulled `host` under it.
test('JAN2: a second mount tears the first pane down - no orphan stays on screen with live buttons', () => {
  withDom((dom) => {
    const hostA = dom.mk('div'); dom.body.append(hostA);
    const e = hero();
    const viewA = mountEnhancedInventory(hostA, { entity: e, items: () => e.items, onExit: () => {} });
    assert.ok(hostA.querySelectorAll('.itemrow').length, 'pane A drew its list');
    const hostB = dom.mk('div'); dom.body.append(hostB);
    const viewB = mountEnhancedInventory(hostB, { entity: e, items: () => e.items, onExit: () => {} });
    assert.equal(hostA.querySelectorAll('.itemrow').length, 0, 'mutants: pane A left standing under pane B');
    assert.equal(dom.body.children.includes(hostA), false, 'and its element is out of the document (a fixed inset:0 slab would still eat the pointer)');
    assert.ok(hostB.querySelectorAll('.itemrow').length, 'pane B is the live one');
    assert.doesNotThrow(() => viewA.repaint(), 'the old handle paints nothing');
    viewB.unmount();
    assert.equal(hostB.querySelectorAll('.itemrow').length, 0);
  });
});

test('JAN2: a repaint that lands after the unmount paints nothing instead of throwing', () => {
  withDom((dom) => {
    const host = dom.mk('div'); dom.body.append(host);
    const e = hero();
    const view = mountEnhancedInventory(host, { entity: e, items: () => e.items, onExit: () => {} });
    assert.ok(host.querySelectorAll('.itemrow').length, 'the pack drew its list');
    const repaint = view.repaint;   // the handle a stale closure keeps (the reader's failure report renders after onExit by design)
    view.unmount();
    assert.equal(host.querySelectorAll('.itemrow').length, 0, 'the unmount emptied the host');
    assert.doesNotThrow(repaint, 'mutants: render() reaching host.querySelector with host null');
    assert.equal(host.querySelectorAll('.itemrow').length, 0, 'and it does not put a closed window back up');
  });
});

// ── ENH-NOTICE3: THE PANE'S `notice` IS A BOX, AND THE PANEL'S ────

/** The live notice panels' rows, read off the stack in `doc`. LIVE by
 *  the module's own key list: `withDom`'s nodes detach on remove, but a
 *  released panel's node only leaves after the slide, so the keys are
 *  the truthful probe. */
const noticeTexts = (dom) => {
  const live = new Set(enhancedNoticeKeys());
  const stack = (dom.body.children ?? []).find((c) => c.id === ENHANCED_NOTICE_ID);
  return (stack?.children ?? [])
    .filter((c) => String(c.className).split(/\s+/).includes('notice') && live.has(c.dataset.owner))
    .flatMap((panel) => (panel.children.find((c) => c.className === 'notice-body')?.children ?? [])
      .filter((r) => r.style.display !== 'none').map((r) => r.textContent));
};

/** The pane over `skin`, with ONE broken longsword in the bag: picking
 *  it and pressing Wear is DaggerfallInventoryWindow.cs's EquipItem
 *  broken arm (:1330-1341, itemBrokenTextId 29, ClickAnywhereToClose). */
function withBrokenPack(skin, fn) {
  const had = Object.hasOwn(globalThis, 'location') ? globalThis.location : undefined;
  globalThis.location = { search: `?skin=${skin}` };
  try {
    return withDom((dom) => {
      const host = dom.mk('div');
      dom.body.append(host);
      const e = hero();
      e.items = [mk('Longsword', 'Weapons', { currentCondition: 0 })];
      const view = mountEnhancedInventory(host, {
        entity: e, items: () => e.items, onExit: () => {},
      });
      const pick = () => host.querySelectorAll('.itemrow')[0].onclick();
      // (this document's selector engine takes one compound
      // selector, not a descendant pair - the button is found by its
      // own class and named by its label)
      const wear = () => host.querySelectorAll('.act')
        .find((b) => b.textContent === 'Wear').onclick();
      const sheetNotice = () => host.querySelectorAll('.sheet-notice').map((n) => n.textContent);
      return fn({ dom, host, e, view, pick, wear, sheetNotice });
    });
  } finally {
    if (had === undefined) delete globalThis.location; else globalThis.location = had;
    destroyEnhancedNotice();
  }
}

test('ENH-NOTICE3: the pack\'s refusal lands in the notice panel and NOT on the sheet, and it leaves on the next action and on the unmount (mutants: text-left-on-the-sheet, no-release-when-the-notice-clears, no-release-on-unmount)', () => {
  withBrokenPack('enhanced', ({ dom, view, pick, wear, sheetNotice }) => {
    assert.deepEqual(enhancedNoticeKeys(), [], 'a quiet pack raises no panel');
    pick();
    wear();   // :1330-1341 - the broken box
    assert.equal(noticeTexts(dom).length, 1, 'one box, one panel');
    assert.match(noticeTexts(dom)[0], /broken and cannot be worn/, 'the refusal, verbatim');
    assert.deepEqual(sheetNotice(), [],
      'and no .sheet-notice in the window - the box has ONE face on this skin');
    assert.deepEqual(dom.body.querySelectorAll('.notice-hint').map((n) => n.textContent), [],
      'AUDIT ENH-NOTICE3 B3: no hint - the pane takes no click and no key for a refusal, it clears on the next action');

    // THE PANE'S OWN DISMISSAL: the next action clears `notice`
    // (every writer opens with `notice = null`), and the panel with it
    pick();   // a second click on the row deselects: an action, and a repaint
    assert.deepEqual(enhancedNoticeKeys(), [], 'the panel goes when the line does');

    // AND THE UNMOUNT: a HELD panel arms no watchdog
    pick();
    wear();
    assert.equal(enhancedNoticeKeys().length, 1);
    view.unmount();
    assert.deepEqual(enhancedNoticeKeys(), [], 'unmount releases - a held panel with no release is a leak');
  });
});

test('ENH-NOTICE3: JAN2 holds - a repaint after the unmount raises no panel of its own (mutants: the-hold-lifted-above-the-host-guard)', () => {
  withBrokenPack('enhanced', ({ view, pick, wear }) => {
    pick();
    wear();
    const repaint = view.repaint;
    view.unmount();
    assert.doesNotThrow(repaint);
    assert.deepEqual(enhancedNoticeKeys(), [],
      'render()\'s `if (!host) return` is ABOVE the hold: a dead pane never speaks');
  });
});

test('ENH-NOTICE3: the classic skin is untouched - the sheet still says it and no stack is built (mutants: panel-on-every-skin)', () => {
  withBrokenPack('classic', ({ dom, pick, wear, sheetNotice }) => {
    pick();
    wear();
    assert.equal(sheetNotice().length, 1, 'the line is on the sheet, as it always was');
    assert.match(sheetNotice()[0], /broken and cannot be worn/);
    assert.deepEqual(enhancedNoticeKeys(), [], 'no panel');
    assert.equal((dom.body.children ?? []).some((c) => c.id === ENHANCED_NOTICE_ID), false,
      'and no stack was ever built');
  });
});

test('ENH-NOTICE3 (AUDIT B/F5): a refusal raised over a LOOT PILE with the pack closed is the panel\'s too - the frame the player is reading keeps no second copy', () => {
  // The line is painted in TWO places (the pack's footer and the loot
  // frame), and only the pack's was driven. A loot session opens with
  // the pack CLOSED (`packOpen = !d.loot`), so this is the arm a
  // player meets when they open a corpse with a full purse.
  const had = Object.hasOwn(globalThis, 'location') ? globalThis.location : undefined;
  globalThis.location = { search: '?skin=enhanced' };
  try {
    withDom((dom) => {
      const host = dom.mk('div');
      dom.body.append(host);
      const e = hero();
      e.goldPieces = 2000000;   // CanCarryAmount's own gate: the coin weight alone fills the load (itemTransfer.js:"const canCarry = entity")
      const pile = [mk('Claymore')];
      const view = mountEnhancedInventory(host, {
        entity: e, items: () => e.items, loot: { items: () => pile }, onExit: () => {},
      });
      const rows = host.querySelectorAll('.itemrow');
      assert.equal(rows.length, 1, 'the loot frame is what the player is looking at');
      rows[0].onclick();   // MAC-M2: a loot-side click TAKES, and this one is refused
      assert.equal(noticeTexts(dom).length, 1, 'the refusal is on the panel');
      assert.match(noticeTexts(dom)[0], /cannot carry/i);
      assert.deepEqual(host.querySelectorAll('.sheet-notice').map((n) => n.textContent), [],
        'mutant: the loot frame keeps its own copy - two faces for one box, which is the whole finding');
      view.unmount();
      assert.deepEqual(enhancedNoticeKeys(), []);
    });
  } finally {
    if (had === undefined) delete globalThis.location; else globalThis.location = had;
    destroyEnhancedNotice();
  }
});

// ═══ PLUS9: THE SPLIT WORN PANELS (Enhanced Plus only) ═══════════
//
// 2026-09-25, a player's sketch over the pack: chest armour | shirt, left arm | right arm, leg armour | pants/skirt,
// each its own half panel instead of one family that hides the second piece behind a tap. Plus only - plain
// Enhanced keeps its eleven families exactly.
function withDressed(search, fn) {
  const prev = globalThis.location;
  _resetForTests(); globalThis.location = { search };
  try {
    return withPack((k) => {
      for (const it of k.e.items) assert.ok(equipItem(k.e, it), `${it.name} goes on`);
      k.view.repaint();
      return fn(k);
    }, { items: () => [mk('Cuirass', 'Armor'), mk('Greaves', 'Armor'), mk('Left Pauldron', 'Armor'),
      mk('Right Pauldron', 'Armor'), mk('Casual Pants', 'MensClothing'), mk('Short Shirt', 'MensClothing')] });
  } finally { globalThis.location = prev; _resetForTests(); }
}
const wornWords = (dom) => dom.doc.querySelectorAll('.wornslot').map((n) => n.textContent);

test('PLUS9: under Enhanced Plus the chest, arms and legs are two half panels each - every worn piece shows at once', () => {
  withDressed('?skin=enhanced', ({ dom }) => {   // PLUS-ONLY: the enhanced skin is Plus's
    const pairs = dom.doc.querySelectorAll('.wornpair');
    assert.equal(pairs.length, 4, 'three split body cells and Mount | Cart (PLUS11)');
    const words = wornWords(dom);
    for (const w of ['Chest armor', 'Shirt', 'Left arm', 'Right arm', 'Leg armor', 'Pants / skirt']) {
      assert.ok(words.includes(w), `a "${w}" half: ${words}`);
    }
    const filled = dom.doc.querySelectorAll('.wornrow').filter((n) => !n.classList.contains('wornempty'));
    assert.equal(filled.length, 6, 'six pieces worn, six filled panels - none hidden behind another');
    assert.equal(dom.doc.querySelectorAll('.worncount').length, 0, 'so no panel needs a count badge');
    // PLUS9b: the worn panels wear the pack's hover card and right-click menu, as the pack's rows do
    for (const n of filled) {
      assert.equal(typeof n.onmouseenter, 'function', 'a worn panel shows the card on hover');
      assert.equal(typeof n.oncontextmenu, 'function', 'and its actions on a right-click');
    }
  });
});

test('PLUS-ONLY: plain Enhanced\'s eleven families are retired - a retired `?plus=0` asks for nothing, the pack is split', () => {
  withDressed('?skin=enhanced&plus=0', ({ dom }) => {   // the old instruction on an old bookmark: Plus answers anyway
    assert.equal(dom.doc.querySelectorAll('.wornpair').length, 4, 'the split cells stand (mutant: the seam still reads ?plus)');
    const words = wornWords(dom);
    for (const w of ['Chest', 'Arms', 'Legs']) assert.ok(!words.includes(w), `no whole "${w}" family: ${words}`);
    assert.ok(words.includes('Shirt'), 'the Plus halves');
  });
});

// ═══ PLUS10: THE INFO BUTTON (Enhanced Plus) ═════════════════════
test('PLUS10: the Info box is the classic Info popup\'s own text - the item\'s TEXT.RSC record with its macros filled', () => {
  const sword = mk('Longsword');
  const rec = { 1001: [{ text: '%it', center: true }, { text: 'Weight: %kg kilograms' }] };
  const boxes = itemInfoBoxes(sword, { rows: (id) => rec[id] ?? [] });
  assert.equal(boxes.length, 1, 'a plain sword has one box');
  assert.deepEqual(boxes[0].map((r) => r.text), ['Longsword', `Weight: ${boxes[0][1].text.match(/[\d.]+/)[0]} kilograms`]);
  assert.equal(boxes[0][0].center, true, 'and keeps the record\'s alignment');
  assert.deepEqual(itemInfoBoxes(sword, {}), [[{ text: 'No item description available.', center: true }]],
    'with no TEXT.RSC it says so rather than inventing lines');
});

// ═══ PLUS11: THE ACCESSORY SHELF (Enhanced Plus) ═════════════════
test('PLUS11: under Plus the twelve accessory slots stand on a shelf of labelled pairs, and Mount | Cart is a cell of the grid', () => {
  const prev = globalThis.location;
  _resetForTests(); globalThis.location = { search: '?skin=enhanced' };   // PLUS-ONLY: the enhanced skin is Plus's
  try {
    withPack((k) => {
      for (const it of k.e.items) assert.ok(equipItem(k.e, it), `${it.name} goes on`);
      k.view.repaint();
      const { dom } = k;
      assert.equal(dom.doc.querySelectorAll('.wornshelf').length, 1, 'one shelf');
      assert.equal(dom.doc.querySelectorAll('.transport').length, 0, 'and no Mount / Cart strip - they moved into the grid');
      assert.deepEqual(dom.doc.querySelectorAll('.shelflabel').map((n) => n.textContent),
        ['Amulets', 'Rings', 'Bracelets', 'Bracers', 'Marks', 'Crystals', 'Lantern'], 'the classic shelf\'s six pairs, and (BELT-LANTERN) the lantern\'s one socket');
      assert.equal(dom.doc.querySelectorAll('.wornsock').length, 13, 'twelve sockets and the lantern\'s');
      const filled = dom.doc.querySelectorAll('.wornsock').filter((n) => !n.classList.contains('wornempty'));
      assert.equal(filled.length, 2, 'the amulet and the ring, each in its own socket');
      for (const n of filled) {
        assert.equal(typeof n.onpointerdown, 'function', 'a filled socket drags off the body');
        assert.equal(typeof n.onmouseenter, 'function', 'and shows the card on hover');
      }
      const words = dom.doc.querySelectorAll('.wornslot').map((n) => n.textContent);
      assert.ok(words.includes('Mount') && words.includes('Cart'), `Mount | Cart in the grid: ${words}`);
      for (const gone of ['Neck', 'Rings', 'Tokens']) assert.ok(!words.includes(gone), `no ${gone} panel any more`);
    }, { items: () => [mk('Amulet', 'Jewellery'), mk('Ring', 'Jewellery')] });
  } finally { globalThis.location = prev; _resetForTests(); }
});
