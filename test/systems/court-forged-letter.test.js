// A forged letter of credit (a value that is no positive number) is no tender: paying never reads it as money, and a
// debt it cannot cover stays owed instead of turning into NaN and answering "paid".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deductGold, deductGoldUndoable, creditAmount, totalGoldAmount } from '../../src/systems/court.js';
import { LETTER_OF_CREDIT_TEMPLATE } from '../../src/systems/inventory.js';

const letter = (value) => ({ templateIndex: LETTER_OF_CREDIT_TEMPLATE, value });
const player = (goldPieces, items) => ({ goldPieces, items });

for (const bad of [NaN, -500, 'lots', undefined, Infinity]) {
  test(`deductGold: a letter worth ${String(bad)} is not money, and the debt stays owed`, () => {
    const p = player(10, [letter(bad)]);
    assert.equal(deductGold(p, 100), 90, 'the shortfall is answered');
    assert.equal(p.goldPieces, 0);
    assert.equal(p.items.length, 1, 'the forged letter is left where it was');
  });
}

test('deductGold: a real letter after a forged one still pays, and the forged one is untouched', () => {
  const forged = letter(NaN);
  const real = letter(500);
  const p = player(10, [forged, real]);
  assert.equal(deductGold(p, 100), 0);
  assert.equal(real.value, 400);
  assert.ok(Number.isNaN(forged.value));
});

test('creditAmount and totalGoldAmount count only letters that are tender', () => {
  const p = player(10, [letter(NaN), letter(250), letter(-9)]);
  assert.equal(creditAmount(p), 250);
  assert.equal(totalGoldAmount(p), 260);
});

test('deductGoldUndoable: a forged letter is not moved by the payment or by its undo', () => {
  const forged = letter(NaN);
  const p = player(10, [forged, letter(500)]);
  const { owed, undo } = deductGoldUndoable(p, 100);
  assert.equal(owed, 0);
  undo();
  assert.equal(p.goldPieces, 10);
  assert.equal(p.items.length, 2);
  assert.ok(Number.isNaN(forged.value));
  assert.equal(p.items.find((it) => it !== forged).value, 500);
});
