// MASTER-CAP (decision 122 (8)): a Master's work is Rare, below Legendary (decision 23f). The record's mint version carries
// the tier, so every reader mints the piece its record names; the service's PROF_MASTER_LEGENDARY setting makes it
// Legendary as before.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  masterTierFor,
  masterBand,
  rollMasterLines,
  masterRecordLines,
  masterOptions,
  masterRecipe,
  isMasterWork,
} from '../../src/net/masterLaw.js';
import { RECIPES, recipeById, MASTERWORK } from '../../src/net/recipeLaw.js';
import {
  productRecordValid,
  MINT_V_MASTER,
  MINT_V_MASTER_RARE,
  masterTierOfVersion,
  masterVersionOf,
} from '../../src/net/productRecord.js';
import { AFFIX_RANGES, reforgeableLines, honeableLines } from '../../src/systems/loot/lootRarity.js';
import { mintPiece } from '../../src/systems/smithItems.js';
import { itemFindings } from '../../src/systems/item/itemLaw.js';
import { isDeclaredItemField, validItemField } from '../../src/systems/item/itemFields.js';
import { keptEnchantments } from '../../src/systems/enchanting.js';
import { imprintRefusal } from '../../src/systems/loot/lootCodex.js';
import { LOOT_RARITY_KEY } from '../../src/systems/loot/lootRarity.js';
import { setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { asMinted } from '../../src/systems/smithItems.js';

const SWORD = recipeById('longsword:daedric');
const LINES = ['damage', 'stat:strength', 'elemental:fire'];
const PROVENANCE = 'a1b2c3d4e5f60718';
const made = (version, lines) =>
  mintPiece(
    { recipe: SWORD.id, quality: MASTERWORK, seed: 4242, maker: 'Mac', marked: true, version, lines },
    PROVENANCE,
  );

test("the service makes a Master's work Rare unless its PROF_MASTER_LEGENDARY setting is on", () => {
  assert.equal(masterTierFor({}), 'rare');
  assert.equal(masterTierFor(undefined), 'rare');
  assert.equal(masterTierFor({ PROF_MASTER_LEGENDARY: 'off' }), 'rare');
  assert.equal(masterTierFor({ PROF_MASTER_LEGENDARY: 'on' }), 'legendary');
  assert.equal(masterTierFor({ PROF_MASTER_LEGENDARY: ' ON ' }), 'legendary');
});

test('every line a Master may choose has a Rare band, and the roll stays inside it', () => {
  const kinds = new Set(RECIPES.filter(masterRecipe).flatMap((r) => masterOptions(r).map((o) => o.id)));
  for (const id of kinds) assert.ok(Array.isArray(masterBand(id, 'rare')), `${id} has a Rare band`);
  for (let seed = 0; seed < 200; seed++) {
    for (const a of rollMasterLines(SWORD, LINES, seed)) {
      const [lo, hi] = AFFIX_RANGES[a.id].rare;
      assert.ok(a.value >= lo && a.value <= hi, `${a.id} ${a.value} in [${lo}, ${hi}] at seed ${seed}`);
    }
  }
  const legendary = rollMasterLines(SWORD, LINES, 7, 'legendary');
  for (const a of legendary)
    assert.ok(a.value >= AFFIX_RANGES[a.id].legendary[0], 'the option rolls the Legendary band');
});

test("the record's version names the tier: MINT_V_MASTER Legendary, MINT_V_MASTER_RARE Rare", () => {
  assert.equal(MINT_V_MASTER_RARE, MINT_V_MASTER + 1);
  assert.deepEqual(
    [masterTierOfVersion(MINT_V_MASTER), masterTierOfVersion(MINT_V_MASTER_RARE)],
    ['legendary', 'rare'],
  );
  assert.deepEqual([masterVersionOf('rare'), masterVersionOf('legendary')], [MINT_V_MASTER_RARE, MINT_V_MASTER]);
  const base = { p: PROVENANCE, s: 'acct-0001', h: 'char-0001', r: SWORD.id, q: MASTERWORK, m: 'Mac', c: 4242, i: 1 };
  const l = masterRecordLines(rollMasterLines(SWORD, LINES, 4242));
  assert.equal(productRecordValid({ ...base, v: MINT_V_MASTER_RARE, l }), true);
  assert.equal(productRecordValid({ ...base, v: MINT_V_MASTER, l }), true, "the Legendary option's record still reads");
});

test("a Rare record mints a Rare Master's work the item law holds lawful, closed to the reforge, the hone and the imprint", () => {
  const lines = masterRecordLines(rollMasterLines(SWORD, LINES, 4242));
  const piece = made(MINT_V_MASTER_RARE, lines);
  assert.deepEqual([piece.rarity, piece.master, piece.legendary, piece.quality], ['rare', true, undefined, MASTERWORK]);
  assert.deepEqual(
    piece.affixes.map((a) => a.value),
    lines.map((x) => x[1]),
  );
  assert.equal(isMasterWork(piece), true);
  assert.deepEqual(itemFindings(piece), []);
  assert.equal(isDeclaredItemField('master'), true);
  assert.equal(validItemField('master', true), true);
  assert.equal(validItemField('master', 1), undefined, 'a boolean or nothing');
  assert.deepEqual(reforgeableLines(piece), []);
  assert.deepEqual(honeableLines(piece), []);
  assert.equal(keptEnchantments(piece), null, 'the item maker refuses it');
  assert.equal(asMinted(piece), true, 'the market takes it as minted');
  setPref(LOOT_RARITY_KEY, true);
  try {
    assert.equal(imprintRefusal(piece, 'any', { items: [piece], goldPieces: 0 }), 'not', 'the imprint refuses it');
    assert.notEqual(
      imprintRefusal({ ...piece, master: undefined }, 'any', { items: [], goldPieces: 0 }),
      'not',
      'as it does not an ordinary Rare',
    );
  } finally {
    resetPrefs();
  }
});

test('a Legendary record (the option, or one made before the cap) mints Legendary as it always did', () => {
  const lines = masterRecordLines(rollMasterLines(SWORD, LINES, 4242, 'legendary'));
  const piece = made(MINT_V_MASTER, lines);
  assert.deepEqual([piece.rarity, piece.master], ['legendary', true]);
  assert.equal(isMasterWork(piece), true);
  assert.deepEqual(itemFindings(piece), []);
  assert.equal(
    isMasterWork({ ...piece, master: undefined }),
    true,
    "a Legendary of no record is a Master's work without the mark",
  );
});

test("the item law holds a Master's work to its own tier's band, and an ordinary Masterwork is no Master's work", () => {
  const legendaryLines = masterRecordLines(rollMasterLines(SWORD, LINES, 4242, 'legendary'));
  const forged = { ...made(MINT_V_MASTER, legendaryLines), rarity: 'rare' };
  assert.ok(itemFindings(forged).includes('affixes'), 'Legendary values on a Rare piece');
  const plain = mintPiece(
    { recipe: SWORD.id, quality: MASTERWORK, seed: 4242, maker: 'Mac', marked: true, version: 4 },
    PROVENANCE,
  );
  assert.equal(plain.rarity, 'rare');
  assert.equal(isMasterWork(plain), false);
  assert.equal(
    isMasterWork({
      ...made(MINT_V_MASTER_RARE, masterRecordLines(rollMasterLines(SWORD, LINES, 1))),
      master: undefined,
    }),
    false,
    'a Rare without the mark is read as an ordinary Rare',
  );
});
