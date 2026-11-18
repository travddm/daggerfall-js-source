import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelFare, travelFailedText } from '../../../src/systems/travel/travel-fare.js';
import { LETTER_OF_CREDIT_TEMPLATE } from '../../../src/systems/inventory.js';

const letter = (value) => ({ templateIndex: LETTER_OF_CREDIT_TEMPLATE, value });

test('a journey pays its inn nights in coin, and the rest from coin, or from letters of credit when the purse cannot cover it (mutants: the nights from a letter; the rest unpaid)', () => {
  const player = { goldPieces: 400, items: [letter(1000)] };
  travelFare(player, { piecesCost: 300, totalCost: 700 }).pay();
  assert.equal(player.goldPieces, 100, 'the nights in coin; the purse could not cover the rest');
  assert.equal(player.items[0].value, 600, 'the rest from the letter');
});

test('a failed journey gets back exactly what its fare took, once: the coins to the purse, each letter its value, a spent letter back in the pack (mutants: no refund; a refund in coin; a second refund)', () => {
  const kept = letter(5000);
  const spent = letter(200);
  const player = { goldPieces: 100, items: [spent, kept] };
  const fare = travelFare(player, { piecesCost: 50, totalCost: 1000 });
  fare.pay();
  assert.equal(player.goldPieces, 50, 'the nights in coin');
  assert.deepEqual(player.items, [kept], 'the small letter spent whole');
  assert.equal(kept.value, 4250);
  assert.equal(fare.refund(), true);
  assert.equal(player.goldPieces, 100, 'the coins back');
  assert.equal(kept.value, 5000, 'the letter worth what it was');
  assert.ok(player.items.includes(spent) && spent.value === 200, 'the spent letter back in the pack');
  assert.equal(fare.refund(), false, 'nothing twice');
  assert.equal(player.goldPieces, 100);
});

test('a fare never paid refunds nothing; the player is told the journey failed and the fare came back', () => {
  const player = { goldPieces: 100, items: [] };
  assert.equal(travelFare(player, { piecesCost: 10, totalCost: 20 }).refund(), false);
  assert.equal(player.goldPieces, 100);
  assert.match(travelFailedText(), /fare was returned/);
});
