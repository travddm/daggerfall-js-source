// MACRO-3: FOUR BOXES THAT NEVER WALKED.
// The broken-item line (TEXT.RSC 29, "%it is broken."), the drop-gold
// prompt (25, "You have %gii gold pieces"), the classic skin's mastery
// box (4020, "Congratulations, %pcn, You are now a Master of %ski") and
// the item-powers box (1016, "Item powers: %mpw") all handed TEXT.RSC to
// the screen raw. And %mpw had no source anywhere in the port -
// DaggerfallUnityItemMCP.MagicPowers is ported here (systems/item/itemPowers.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { magicPowersLines, itemPowers, POWERS_UNKNOWN_TEXT, ARTIFACT_POWERS_TEXT_BASE } from '../../../src/systems/item/itemPowers.js';
import { ENCHANTMENT_TYPES as T } from '../../../src/formats/magicDef.js';
import { powersRows } from '../../../src/ui/native/nativeInventory.js';
import { expandRowValues, setMacroWorld } from '../../../src/systems/quest/questMacros.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('MACRO-3: %mpw is MagicPowers - one line per power, DFU’s words, DFU’s order', () => {
  const ench = (type, param) => ({ type: T[type], param });
  const item = { enchantments: [ench('CastWhenUsed', 4), ench('PotentVs', 1), ench('ExtraSpellPts', 0),
    ench('EnhancesSkill', 0), ench('SoulBound', 0), ench('FeatherWeight', -1), ench('HealthLeech', 2),
    { type: T.None, param: -1 }, ench('RepairsObjects', -1)] };
  assert.deepEqual(magicPowersLines(item), [
    'Cast when used: Levitate', 'Potent vs Daedra', 'Extra spell pts during Winter',
    'Enhances skill Medical', 'Soul bound Rat', 'Feather weight', 'Health leech unless used weekly',
  ], 'the list stops at the first None, as DFU’s loop breaks');
  assert.equal(itemPowers().length, 26, 'every EnchantmentTypes row from CastWhenUsed to BadRepWith');
  assert.deepEqual(magicPowersLines(item, { identified: false }), [POWERS_UNKNOWN_TEXT], 'unidentified: the powers are unknown');
  // an artifact reads its own description record, identified or not
  const art = { artifact: true, artifactIndexBitfield: (9 << 1) | 1, enchantments: item.enchantments };
  const seen = [];
  assert.deepEqual(magicPowersLines(art, { identified: false, lines: (id) => { seen.push(id); return [{ text: 'Azura’s Star holds a soul.' }]; } }),
    ['Azura’s Star holds a soul.']);
  assert.deepEqual(seen, [ARTIFACT_POWERS_TEXT_BASE + 9]);
  assert.deepEqual(magicPowersLines({ artifact: true, artifactIndexBitfield: 0 }, { lines: () => [{ text: 'x' }] }), [],
    'an artifact with no index shows nothing - GetArtifactSubType throws and MagicPowers returns null');
});

test('MACRO-3: record 1016’s %mpw row becomes one row per power, keeping its alignment', () => {
  const record = [{ text: 'Item powers:', center: false }, { text: '%mpw', center: true }];
  assert.deepEqual(powersRows(record, ['Cast when used: Levitate', 'Feather weight']), [
    { text: 'Item powers:', center: false },
    { text: 'Cast when used: Levitate', center: true },
    { text: 'Feather weight', center: true },
  ]);
});

test('MACRO-3: the four boxes walk their records, each with the source DFU hands it', () => {
  // and the walks really fill them
  setMacroWorld(() => ({ nowSeconds: () => 0, hooks: { playerName: () => 'Aldric Vane', getGoldPieces: () => 412 } }));
  try {
    assert.deepEqual(expandRowValues([{ text: '%it is broken.', center: true }], { it: 'Dwarven Mace' }), [{ text: 'Dwarven Mace is broken.', center: true }]);
    assert.deepEqual(expandRowValues(['Congratulations, %pcn,'], null), ['Congratulations, Aldric Vane,']);
  } finally { setMacroWorld(null); }
});
