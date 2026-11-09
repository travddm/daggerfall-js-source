// EQUIP-BILL (decision #69, trbcodex T10): by default a Cast-When-Held piece pays DFU's bill at every equip that is not a
// recast - the held spell's whole classic casting cost in condition - and a bill past what it has left breaks it
// (CastWhenHeld.cs InstantiateSpellBundle: `if (!recast) sourceItem.LowerCondition(amount, ...)`). A Legendary pays too,
// and a re-wear inside six hours pays again. The port's earlier laws are two options, off here; their own behaviour is
// held by fb1009f.test.js (HELD-REWEAR) and fb1011b_legendheld.test.js (LEGEND-HELD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENCHANTMENT_TYPES as T, setDefaultEnchantCtx, REROLL_MINIMUM_HOURS } from '../../src/systems/enchantments.js';
import '../../src/systems/effects.js';
import { equipItem, unequipSlot } from '../../src/systems/equip.js';
import { ITEM_GROUPS } from '../../src/characters/equipRules.js';
import { classicCastingCost } from '../../src/systems/spellcost.js';
import { getPref } from '../../src/systems/uiPrefs.js';
import { GENTLE_EQUIP_BILL_PREF, LEGENDARY_EQUIP_FREE_PREF } from '../../src/systems/equipBill.js';
import { FEATURES } from '../../src/systems/features.js';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';

// a Fortify record, CasterOnly (fb1009f's): 49 classic points at skill 40
const rec = { index: 4, name: 'Fortify', rangeType: 0, effects: [{ type: 9, subType: 0, durationBase: 3, durationMod: 0, durationPerLevel: 1, chanceBase: 0, chanceMod: 0, chancePerLevel: 1, magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 }, { type: -1 }, { type: -1 }] };
const amulet = (cond, extra = {}) => ({ name: 'Amulet', templateIndex: 133, group: ITEM_GROUPS.Jewellery, currentCondition: cond, maxCondition: 800, enchantments: [{ type: T.CastWhenHeld, param: 4 }], ...extra });
const wearer = (items) => ({ name: 'W', isPlayer: true, health: 20, maxHealth: 30, items, level: 5, stats: {}, skills: 40, career: {} });
const COST = classicCastingCost(rec, () => 40);
function withClock(fn) {
  const clock = { now: 100_000 };
  const said = [];
  setDefaultEnchantCtx({ spellsByIndex: () => new Map([[4, rec]]), now: () => clock.now, say: (s) => said.push(s) });
  try { fn(clock, said); } finally { setDefaultEnchantCtx(null); }
}

test('EQUIP-BILL: by default every equip pays the whole casting cost - a re-wear inside the six hours pays again', () => withClock((clock) => {
  assert.deepEqual([getPref(GENTLE_EQUIP_BILL_PREF), getPref(LEGENDARY_EQUIP_FREE_PREF)], [false, false], 'both options start off');
  assert.ok(COST > 0);
  const a = amulet(800);
  const w = wearer([a]);
  equipItem(w, a);
  assert.equal(a.currentCondition, 800 - COST);
  unequipSlot(w, a.equipSlot);
  clock.now += REROLL_MINIMUM_HOURS * 60 - 1;
  equipItem(w, a);
  assert.equal(a.currentCondition, 800 - 2 * COST, 'DFU has no fresh-wear exemption');
}));

test('EQUIP-BILL: by default a bill past what is left breaks the piece on the way on - it says so, comes off and is lost', () => withClock((_clock, said) => {
  const a = amulet(COST - 1);
  const w = wearer([a]);
  equipItem(w, a);
  assert.equal(a.currentCondition, 0);
  assert.equal(a.equipSlot ?? null, null, 'not worn');
  assert.equal(w.items.includes(a), false, 'a broken magic item leaves the pack, as DFU\'s LowerCondition takes it');
  assert.ok(said.some((s) => /has broken/.test(s)), `told: ${said}`);
}));

test('EQUIP-BILL: by default a Legendary pays like any other piece', () => withClock(() => {
  const a = amulet(800, { rarity: 'legendary' });
  equipItem(wearer([a]), a);
  assert.equal(a.currentCondition, 800 - COST);
}));

test('EQUIP-BILL: both rows are off by default and the room\'s, and the official profile pins both off', () => {
  for (const [id, key] of [['gentle-equip-bill', GENTLE_EQUIP_BILL_PREF], ['legendary-equip-free', LEGENDARY_EQUIP_FREE_PREF]]) {
    const row = FEATURES.find((f) => f.id === id);
    assert.deepEqual([row.control.key, row.control.initial, row.control.online], [key, false, 'room'], id);
    assert.equal(OFFICIAL_PROFILE.pins.prefs[key], false, key);
  }
});
