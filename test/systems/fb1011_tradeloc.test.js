// TRADE-LOC II (FIELD BUGS 2026-10-11d #2, the Discord's "letter of credit during trade": "Cant see how much a letter of
// credit is worth when trading directly with players", a screenshot of two Letters of Credit in the pack's list, each
// "0.10kg"). TRADE-LOC said a letter's worth in the trade window's detail strip and in the row's hover -
// one a click away, the other a pointer's alone: a phone has no hover, and two letters in a list could not be told
// apart without clicking each. The row says it now, under the letter's name, on either side of the trade; and the
// pack's own card (every pack, shop and trade hover's) says it as its Worth..
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { letterWorthGold, letterWorthLine } from '../../src/systems/walletItem.js';
import { letterOfCredit } from '../../src/systems/inventory.js';
import { validLootList } from '../../src/systems/loot/loot.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('TRADE-LOC II: a letter\'s worth as gold - the letter the bank mints, and the one a peer\'s offer carries over the wire; anything else none, and the line TRADE-LOC said is the same words (mutants: the worth read off the template; anything a letter)', () => {
  assert.equal(letterWorthGold(letterOfCredit(12500)), '12,500 gold');
  assert.equal(letterWorthGold(letterOfCredit(0)), '0 gold');
  assert.equal(letterWorthGold(letterOfCredit(99.9)), '99 gold', 'a whole coin, as the bank counts it');
  const [arrived] = validLootList([JSON.parse(JSON.stringify(letterOfCredit(4321)))]);
  assert.equal(letterWorthGold(arrived), '4,321 gold', 'through the wire clamp');
  assert.equal(letterWorthGold({ templateIndex: 113, value: 900 }), null, 'a sword is not a letter');
  assert.equal(letterWorthGold(null), null);
  assert.equal(letterWorthLine(letterOfCredit(12500)), 'Worth 12,500 gold');
  assert.equal(letterWorthLine({ templateIndex: 113, value: 900 }), null);
});

