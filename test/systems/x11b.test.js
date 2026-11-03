// X11b: CREATE ITEM (2,255) and the CONJURED-ITEM FAMILY - the last
// tractable row of spellEffects.js's inert residue. Sources:
// CreateItem.cs, DaggerfallUnityItem.cs:405-419 (TimeForItemToDisappear
// / IsSummoned), ItemCollection.cs:120-150 (RemoveExpiredItems),
// :370-405 (GetItem priorityToConjured), :700-718 (FindExistingStack's
// expiry clause), PlayerEntity.cs:420-421 (the per-minute sweep's
// home), WeaponManager.cs:404-407 (the bow's arrow pick),
// DaggerfallInventoryWindow.cs:1464-1469 (the transfer refusal).

import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  CREATE_ITEM_ROWS, createItemLabels, createTempItem, grantCreatedItem,
  removeExpiredItems, CANNOT_REMOVE_ITEM_TEXT, MENS_PLAIN_ROBES, WOMENS_PLAIN_ROBES,
} from '../../src/systems/createItem.js';
import {
  addItem, isSummoned, isStackable, stacksWith, getItem, spendArrow, ARROW_TEMPLATE,
} from '../../src/systems/inventory.js';
import { equipItem, armorValuesOf, equipTableOf } from '../../src/systems/equip.js';
import { EQUIP_SLOTS } from '../../src/characters/paperdoll/paperdoll.js';
import { applySpell } from '../../src/systems/effects.js';
import { buildCustomSpell, blankEffectSettings } from '../../src/systems/spell/spellMaker.js';
import { effectByKey, PORTED_KEYS, SPELL_MAKER_EFFECTS } from '../../src/systems/spell/spellEffects.js';
import { ListPickerWindow, ROWS_DISPLAYED } from '../../src/ui/listPicker.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { createRandomWeapon } from '../../src/systems/loot/loot.js';
import { tickPlayerMinutes } from '../../src/systems/worldTick.js';
import { REFUSAL } from '../../src/systems/item/itemTransfer.js';   // U56
import { PotionMakerWindow } from '../../src/ui/potionMakerWindow.js';
import { potionMakerHooks } from '../../src/scenes/potionMakerHost.js';
import { POTION_RECIPES, potionRecipeKey } from '../../src/systems/potions.js';
import { mintMaterialItem } from '../../src/systems/professions/profItems.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
/** A deterministic uniform stream - never 0, never 1. */
const seq = (start = 0.37) => { let n = start; return () => { n = (n + 0.37) % 1; return n; }; };
const player = (over = {}) => ({
  stats: { luck: 50, willpower: 50, strength: 50 }, skills: [], activeEffects: [],
  level: 1, health: 30, maxHealth: 30, items: [], gender: 'male', ...over,
});

// ── the 29 rows ───────────────────────────────────────────────────
test('X11b rows: the CreateItemSelection enum, in order, with the shipped labels', () => {
  assert.equal(CREATE_ITEM_ROWS.length, 29, 'CreateItemSelection has 29 members');
  // the order IS the law - lastSelectedIndex is an index into it that
  // survives between casts, so a re-order silently moves the player's
  // remembered pick to a different item
  const labels = createItemLabels();
  assert.equal(labels[0], 'Leather Cuirass');
  assert.equal(labels[7], 'Chain Cuirass');
  assert.equal(labels[14], 'Steel Cuirass');
  assert.equal(labels[21], 'Steel Buckler');
  assert.equal(labels[22], 'Steel Dagger');
  assert.equal(labels[26], 'Arrows');
  assert.equal(labels[28], 'Robes');
  // every label is the Internal_Strings row for its enum name
  assert.equal(labels.filter((l) => /^[A-Z]/.test(l)).length, 29, 'all spaced-out display names');
  assert.deepEqual([...new Set(labels)].length, 29, 'no duplicates');
});

test('X11b mint: three arms, DFU\'s three ItemBuilder constructors', () => {
  const at = { nowMinutes: 1000, rounds: 30, rolls: seq() };
  // ARMOUR: the material is the ArmorMaterialTypes value, and the
  // variant comes from RandomizeArmorVariant (CreateArmor's default
  // variant is -1, which is the branch a SHOP shelf takes - not
  // CreateRandomArmor's SetVariant(0), which is loot's)
  const leather = createTempItem(0, at);
  assert.equal(leather.group, 'Armor');
  assert.equal(leather.templateIndex, 102, 'Cuirass');
  assert.equal(leather.material, 0x0000, 'Leather');
  const chain = createTempItem(7, at);
  assert.equal(chain.material, 0x0100, 'Chain');
  const steel = createTempItem(14, at);
  assert.equal(steel.material, 0x0201, 'ArmorMaterialTypes.Steel');
  assert.ok(steel.maxCondition > 0 && steel.currentCondition === steel.maxCondition, 'minted at full condition');
  // WEAPONS: WeaponMaterialTypes.Steel is 1, a DIFFERENT enum from the
  // armour one - 0x0201 there, 0x0001 here
  const dagger = createTempItem(22, at);
  assert.equal(dagger.group, 'Weapons');
  assert.equal(dagger.templateIndex, 113);
  assert.equal(dagger.material, 1, 'WeaponMaterialTypes.Steel');
  // ARROWS take CreateWeapon's other arm: the material is IGNORED and
  // forced to 0, the condition starts at ZERO, and the stack is rolled
  const arrows = createTempItem(26, at);
  assert.equal(arrows.templateIndex, ARROW_TEMPLATE);
  assert.equal(arrows.material, 0, 'nativeMaterialValue = 0, whatever was asked for');
  assert.equal(arrows.currentCondition, 0, '"not sure if this is necessary, but classic does it"');
  assert.ok(arrows.stackCount >= 1 && arrows.stackCount <= 20, `Range(1, 21) - got ${arrows.stackCount}`);
  // ROBES follow the GENDER
  assert.equal(createTempItem(28, { ...at, gender: 'male' }).templateIndex, MENS_PLAIN_ROBES);
  assert.equal(createTempItem(28, { ...at, gender: 'female' }).templateIndex, WOMENS_PLAIN_ROBES);
  assert.equal(createTempItem(28, { ...at, gender: 'female' }).group, 'WomensClothing');
  assert.equal(createTempItem(28, { ...at, gender: 'male' }).dye, 0, 'the ctor default, DyeColors.Blue');
  // an index off the end is SILENT - DFU's switch falls through and
  // `if (item != null)` skips the AddItem
  assert.equal(createTempItem(29, at), null);
  assert.equal(createTempItem(-1, at), null);
});

test('X11b mint: every one of the 29 rows produces a real, named, priced item', () => {
  const rolls = seq();
  for (let i = 0; i < 29; i++) {
    const it = createTempItem(i, { nowMinutes: 10, rounds: 5, rolls });
    assert.ok(it, `row ${i} minted nothing`);
    assert.ok(it.name, `row ${i} (${CREATE_ITEM_ROWS[i].label}) has no name`);
    assert.ok(it.value > 0, `row ${i} has no value`);
    assert.ok(it.maxCondition > 0, `row ${i} has no condition`);
    assert.equal(it.timeForItemToDisappear, 15, `row ${i} carries no lifetime`);
    assert.ok(isSummoned(it), `row ${i} does not read as summoned`);
  }
});

// ── the lifetime ─────────────────────────────────────────────────
test('X11b lifetime: now + the FULL rolled duration, and IsSummoned is derived from it', () => {
  const it = createTempItem(22, { nowMinutes: 5000, rounds: 42, rolls: seq() });
  assert.equal(it.timeForItemToDisappear, 5042);
  assert.ok(isSummoned(it));
  // "Non-summoned items have 0 in this field" - and an item that has
  // never been conjured carries no field at all, which reads the same
  assert.equal(isSummoned({ group: 'Weapons', templateIndex: 113 }), false);
  assert.equal(isSummoned({ timeForItemToDisappear: 0 }), false);
  assert.equal(isSummoned(null), false);
});

// ── stacking ─────────────────────────────────────────────────────
test('X11b stacking: ONLY conjured arrows stack, and only with a matching lifetime', () => {
  const conjuredSword = createTempItem(23, { nowMinutes: 0, rounds: 10, rolls: seq() });
  assert.equal(isStackable(conjuredSword), false, 'a longsword never stacks anyway');
  // an ingredient WOULD stack - unless it is summoned
  const realGem = { group: 'Gems', templateIndex: 0 };
  assert.equal(isStackable(realGem), true);
  assert.equal(isStackable({ ...realGem, timeForItemToDisappear: 99 }), false,
    'summoned, and not an arrow, so it does not stack');
  const a1 = { group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 5, timeForItemToDisappear: 100 };
  const a2 = { group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 3, timeForItemToDisappear: 100 };
  const a3 = { group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 7, timeForItemToDisappear: 250 };
  const real = { group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 9 };
  assert.equal(isStackable(a1), true, 'summoned ARROWS are the one exception');
  assert.equal(stacksWith(a1, a2), true, 'same lifetime, one stack');
  assert.equal(stacksWith(a1, a3), false, 'different lifetimes stay apart');
  assert.equal(stacksWith(a1, real), false, 'and a conjured stack never joins a real one');
  assert.equal(stacksWith(real, { ...real }), true, 'two real stacks still merge');
  // through addItem, which is what the spell actually calls
  const bag = [real];
  addItem(bag, a1);
  assert.equal(bag.length, 2, 'the conjured arrows did NOT join the real stack');
  addItem(bag, a2);
  assert.equal(bag.length, 2, 'but the matching conjured stack did');
  assert.equal(bag[1].stackCount, 8);
  addItem(bag, a3);
  assert.equal(bag.length, 3, 'and the differently-timed one did not');
});

// ── the pick order ───────────────────────────────────────────────
test('X11b getItem: conjured first, SHORTEST LIFE first, and the bow spends that one', () => {
  const real = { group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 9 };
  const late = { group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 4, timeForItemToDisappear: 900 };
  const soon = { group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 2, timeForItemToDisappear: 120 };
  const bag = [real, late, soon];
  assert.equal(getItem(bag, 'Weapons', ARROW_TEMPLATE), real, 'without the flag: the FIRST match');
  assert.equal(getItem(bag, 'Weapons', ARROW_TEMPLATE, { priorityToConjured: true }), soon,
    '"pick conjured items with shortest life"');
  // the bow, through the one home all four hosts now call
  assert.equal(spendArrow(bag), true);
  assert.equal(soon.stackCount, 1, 'the shortest-lived stack paid');
  assert.equal(real.stackCount, 9, 'the real arrows are untouched');
  assert.equal(spendArrow(bag), true);
  assert.equal(bag.includes(soon), false, 'and the emptied stack is gone');
  assert.equal(spendArrow(bag), true);
  assert.equal(late.stackCount, 3, 'then the next-shortest conjured stack');
  // a QUEST arrow is never loosed (allowQuestItem: false)
  const questOnly = [{ group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0, stackCount: 5, questItem: true }];
  assert.equal(spendArrow(questOnly), false, 'the bow refuses a quest arrow');
  assert.equal(questOnly[0].stackCount, 5);
});

// ── the sweep ────────────────────────────────────────────────────
test('X11b sweep: expiry is STRICT, and a worn piece is UNEQUIPPED before it vanishes', () => {
  const e = player();
  const cuirass = createTempItem(14, { nowMinutes: 100, rounds: 50, rolls: seq() });   // Steel Cuirass, expires at 150
  const real = { group: 'Armor', templateIndex: 104, material: 0x0201, name: 'Steel Greaves' };
  e.items.push(cuirass, real);
  equipItem(e, cuirass);
  equipItem(e, real);
  const armed = armorValuesOf(e).slice();
  assert.ok(armed[3] < 100, 'the chest is protected while it is worn');
  // strictly LESS THAN: at exactly its own minute it survives
  assert.deepEqual(removeExpiredItems(e, 150), [], 'TimeForItemToDisappear < gameMinutes, not <=');
  assert.equal(e.items.length, 2);
  const gone = removeExpiredItems(e, 151);
  assert.deepEqual(gone, [cuirass]);
  assert.equal(e.items.length, 1, 'only the conjured one left');
  assert.equal(e.items[0], real);
  // the slot is clear and the armour value came back - ONCE
  assert.equal(equipTableOf(e)[EQUIP_SLOTS.ChestArmor] ?? null, null);
  const after = armorValuesOf(e);
  assert.equal(after[3], 100, 'the chest is unprotected again');
  assert.ok(after[5] < 100, 'and the REAL greaves still protect the legs');
  // a bag with nothing conjured in it is untouched, cheaply
  assert.deepEqual(removeExpiredItems(e, 99999), []);
  assert.deepEqual(removeExpiredItems({ items: [] }, 10), []);
  assert.deepEqual(removeExpiredItems({}, 10), []);
});

test('X11b sweep: the real per-minute tick expires it, and only on a minute CHANGE', () => {
  // BY RUNNING IT, not by grepping for the call. The first draft of
  // this test asserted `worldTick.js includes removeExpiredItems`, and
  // the red-proof walked straight through it: commenting the call out
  // leaves the name sitting in the comment above it. A source pin that
  // its own disabling satisfies is worth nothing.
  const sinks = {
    hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {}, restoreFatigue() {},
    drainFatigue() {}, say() {},
  };
  const mk = (expiry) => {
    const e = player({ chargenDone: true, skillUses: new Array(35).fill(0), skills: 30, fatigue: 3200, lastSkillCheckTime: 0 });
    e.items.push({ group: 'Weapons', templateIndex: 113, name: 'Dagger', timeForItemToDisappear: expiry });
    return e;
  };
  // NOTE the expiry of 1, not 0: zero IS "not summoned" (the field is
  // the flag), so a fixture that expires at 0 tests nothing at all.
  // 10 real seconds = 2 classic minutes, so this crosses 0 -> 2.
  const dead = mk(1);                       // 1 < 2 -> gone
  tickPlayerMinutes({ entity: dead, classicMinutes: 0, dt: 10, sinks, rolls: () => 0.5 });
  assert.equal(dead.items.length, 0, 'the tick swept an expired conjured item');
  const alive = mk(500);
  tickPlayerMinutes({ entity: alive, classicMinutes: 0, dt: 10, sinks, rolls: () => 0.5 });
  assert.equal(alive.items.length, 1, 'and left an unexpired one alone');
  // a REAL item, with no lifetime at all, is never touched
  const realOnly = player({ chargenDone: true, skillUses: new Array(35).fill(0), skills: 30, fatigue: 3200, lastSkillCheckTime: 0 });
  realOnly.items.push({ group: 'Weapons', templateIndex: 113, name: 'Dagger' });
  tickPlayerMinutes({ entity: realOnly, classicMinutes: 0, dt: 10, sinks, rolls: () => 0.5 });
  assert.equal(realOnly.items.length, 1, 'a non-conjured item has no expiry to reach');
  // a frame that does NOT cross a minute sweeps nothing - the sweep is
  // inside DFU's `lastGameMinutes != gameMinutes` block
  const notYet = mk(1);
  tickPlayerMinutes({ entity: notYet, classicMinutes: 2.1, dt: 0.5, sinks, rolls: () => 0.5 });
  assert.equal(notYet.items.length, 1, 'no minute change, no sweep');
});

// ── the effect arm ───────────────────────────────────────────────
const castCreateItem = (target, durationBase = 20, rangeType = 0) => applySpell(
  buildCustomSpell({ slots: [{ type: 2, subType: 255, settings: { ...blankEffectSettings(), durationBase } }], rangeType }),
  1, target, {}, () => 0.5, null, {});

test('X11b effect: it hands the host a picker and lands NOTHING on the entity', () => {
  const e = player();
  const out = castCreateItem(e);
  assert.equal(out.skipped, 0, 'the library honours it now');
  assert.ok(out.createItem, 'the window seam fires');
  assert.deepEqual(e.activeEffects, [], 'no entry - the ITEM carries the clock, not an effect');
  // AUDIT 63 F17: the rounds handed over are the rolled duration MINUS
  // ONE. blankEffectSettings puts every spinner at 1, so durationBase 20
  // rolls 20 + 1*floor(1/1) = 21 - and AssignBundle then spends one of
  // them at once ("At this point effect is ready and gets initial magic
  // round", EntityEffectManager.cs:593-594 -> EntityEffect.cs:572-575 ->
  // :583-588 `return --roundsRemaining`), because CreateItem overrides
  // neither MagicRound nor RemoveRound and its Start only PUSHES the
  // picker (CreateItem.cs:96-100). CreateTempItem reads that decremented
  // value at CreateItem.cs:237. This pin used to assert 21 with the
  // opposite reasoning, and was the defect's guard.
  assert.equal(out.createItem.rounds, 20);
  // "Target must be player - no effect on other entities"
  const foe = player({ mobileType: 4 });
  const r = castCreateItem(foe);
  assert.equal(r.createItem, undefined);
  assert.equal(r.skipped, 0, 'and it is not "skipped" either - DFU returns, silently');
});

test('X11b effect: the whole round trip, cast to bagged item', () => {
  const e = player();
  const out = castCreateItem(e, 30);
  const made = grantCreatedItem(e, 22, { gender: 'male', nowMinutes: 700, rounds: out.createItem.rounds, rolls: seq() });
  assert.equal(made.name, 'Dagger');
  assert.equal(e.items.length, 1);
  // AUDIT 63 F17: durationBase 30 rolls 31, the initial magic round
  // spends one, so the item disappears at cast + 30 (CreateItem.cs:237).
  assert.equal(made.timeForItemToDisappear, 700 + 30);
  // ...and it goes away on schedule, through the same sweep the tick
  // runs. Tight to the minute either side of 730, so a revert to the
  // full duration (expiry 731) fails BOTH lines: ItemCollection's own
  // test is strict `<` (ItemCollection.cs:132).
  assert.deepEqual(removeExpiredItems(e, 730), []);
  assert.deepEqual(removeExpiredItems(e, 731), [made]);
  assert.equal(e.items.length, 0);
});

// ── the picker ───────────────────────────────────────────────────
test('X11b picker: AllowCancel false really refuses, and the selection is remembered', () => {
  let cancelled = 0, picked = null;
  const w = new ListPickerWindow({
    items: createItemLabels(), allowCancel: false, selectedIndex: 26,
    onPick: (i) => { picked = i; }, onCancel: () => { cancelled++; },
  });
  // ScrollToSelected put row 26 on screen without moving the selection
  assert.equal(w.selectedIndex, 26);
  assert.ok(w.scrollIndex > 0 && w.selectedIndex >= w.scrollIndex
    && w.selectedIndex < w.scrollIndex + ROWS_DISPLAYED, 'the remembered row is visible');
  w.input('Escape');
  assert.equal(cancelled, 0, 'Escape is refused');
  assert.equal(w.done, false);
  w.click(0, 0);   // outside the panel entirely
  assert.equal(cancelled, 0, 'and so is a click outside it');
  assert.equal(w.done, false);
  w.input('Enter');
  assert.equal(picked, 26, 'Arrows - the row it opened on');
  assert.equal(w.done, true);
  // a cancellable picker still cancels
  let c2 = 0;
  const ok = new ListPickerWindow({ items: ['a', 'b'], onCancel: () => { c2++; } });
  ok.input('Escape');
  assert.equal(c2, 1);
});

// ── the transfer refusal ─────────────────────────────────────────
test('X11b transfer: a summoned item cannot leave the pack, and it says so', () => {
  assert.equal(CANNOT_REMOVE_ITEM_TEXT, 'You cannot remove this item.');
  // U56 moved TransferItem's ladder OUT of the classic window and
  // into systems/item/itemTransfer.js so a second screen could run it.
  // The law this pin holds did not move with it: ONE guard, BOTH
  // callers, sitting where DFU puts it.
  assert.equal(REFUSAL.summoned.text, CANNOT_REMOVE_ITEM_TEXT, 'the refusal lost its words');
});

// ── the unified CreateWeapon, and what it fixed on the way ───────
test('X11b: ItemBuilder.CreateWeapon has ONE home again, both arms', () => {
  const rolls = seq();
  const arrow = createWeapon(ARROW_TEMPLATE, 9, rolls);   // material 9 = Daedric, and IGNORED
  assert.equal(arrow.material, 0, 'the arrow arm forces nativeMaterialValue = 0');
  assert.equal(arrow.currentCondition, 0);
  assert.ok(arrow.stackCount >= 1 && arrow.stackCount <= 20);
  assert.equal(arrow.name, 'Arrow');
  const sword = createWeapon(120, 1, rolls);
  assert.equal(sword.material, 1, 'the melee arm keeps its material');
  assert.equal(sword.currentCondition, sword.maxCondition);
  assert.equal(sword.stackCount, undefined, 'and does not stack');
  // and it still produces arrows when the roll lands on slot 18
  let sawArrow = false;
  const r = seq(0.001);
  for (let i = 0; i < 400 && !sawArrow; i++) {
    const w = createRandomWeapon(3, r);
    if (w.templateIndex === ARROW_TEMPLATE) {
      sawArrow = true;
      assert.equal(w.currentCondition, 0);
      assert.ok(w.stackCount >= 1 && w.stackCount <= 20);
    }
  }
  assert.ok(sawArrow, 'the loot roll never produced an arrow at all');
});

test('X11b: the potion maker really consumes its ingredients now', () => {
  // Found while reading item removal for this lane: the takeOne hook
  // passed `list[i]` - the ITEM - to removeOne, which takes a TEMPLATE
  // INDEX. Its findIndex compared a number against an object, matched
  // nothing, and returned false, so brewing never spent a reagent.
  // AUDIT 26 F176 grew the call: the group rides along so the walk
  // spends only un-enchanted reagents (GetItem's allowEnchantedItem
  // false, :338/:345). The X11b lesson - index, not item - stands.
  // POTION-DOOR moved the hook to scenes/potionMakerHost.js, so this
  // brews through the real hooks and window rather than reading text.
  const berries = mintMaterialItem('p1:16');
  const southernBerries = mintMaterialItem('p2:16');   // template 16 too, the other plant group
  const enchantedBerries = { ...mintMaterialItem('p1:16'), enchantments: [{ type: 1, param: 0 }] };
  const trollBlood = mintMaterialItem('reagent:troll-blood');
  const elixirVitae = mintMaterialItem('reagent:elixir-vitae');
  const mercury = mintMaterialItem('metal:mercury');
  // Both twins stand before the plain berries: a spend that drops the
  // group or the enchantment rule takes a twin, and a spend that passes
  // the item where the index goes takes nothing.
  const player = { items: [southernBerries, enchantedBerries, berries, trollBlood, elixirVitae, mercury] };
  const icons = { getTexture: async () => ({ recordCount: 0 }), uploadRecord: () => {}, textures: new Map() };
  // No door is the offline maker: DFU's own mix, spent by the window's walk.
  const hooks = potionMakerHooks({ player, icons, door: () => null });
  const maker = new PotionMakerWindow(hooks);
  const grid = maker.ingredients();
  for (const reagent of [berries, trollBlood, elixirVitae, mercury]) {
    const unit = grid.find((it) => it.group === reagent.group && it.templateIndex === reagent.templateIndex);
    assert.ok(unit, `${reagent.name} of ${reagent.group} is on the grid`);
    maker._addToCauldron(unit);
  }
  maker._mix();
  const healing = POTION_RECIPES.find((r) => r.name === 'healing');
  assert.deepEqual(maker.cauldron, [], 'the walk spent every unit, so the cauldron emptied');
  assert.deepEqual(player.items.slice(0, 2), [southernBerries, enchantedBerries], 'the plain berries were spent by index and group; neither twin was');
  assert.equal(player.items.length, 3, 'the four reagents went and one potion came');
  assert.equal(player.items[2].potionRecipeKey, potionRecipeKey(healing.ingredients), 'the potion is Healing');
  assert.equal(hooks.takeOne(berries.templateIndex, 'pack', berries.group), false, 'an enchanted twin is never spent');
});

// ── the catalog ──────────────────────────────────────────────────
test('X11b catalog: Create Item goes live and MORPH SELF is the last row standing', () => {
  assert.equal(effectByKey('2,255').ported, true);
  assert.ok(PORTED_KEYS.has('2,255'));
  const inert = SPELL_MAKER_EFFECTS.filter((e) => !e.ported).map((e) => e.key);
  // "the last row standing" stood until V2a built its consumer - the
  // racial override - and the arm rides applySpell's own ladder (not
  // BUFF_KINDS: a one-round call, not a duration buff)
  assert.deepEqual(inert, [], 'V2a took Morph Self; nothing is inert');
  assert.equal(effectByKey('29,255').ported, true);
  assert.equal(effectByKey('29,255').craftable, false, 'AllowedCraftingStations = None, still');
});
