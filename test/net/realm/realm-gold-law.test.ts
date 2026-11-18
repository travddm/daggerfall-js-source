// The service pays and credits a realm character's record with payFromSave. A record is the client's own checkpoint,
// so every value in it may be forged: a payment must never succeed without taking what it costs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Loaded by a computed path, which tsconfig.node.json does not follow: the law's imports reach src/net modules that
// name the DOM's crypto types, and the node config has no DOM library.
const GOLD_LAW_PATH: string = '../../../src/net/realm/realmGoldLaw.js';
type Save = object;
const { payFromSave, payableOf, REALM_LETTER_TEMPLATE, REALM_EMPIRE_ACCOUNT } = (await import(GOLD_LAW_PATH)) as {
  payFromSave: (save: Save, amount: number, region?: unknown) => boolean;
  payableOf: (save: Save, region?: unknown) => number;
  REALM_LETTER_TEMPLATE: number;
  REALM_EMPIRE_ACCOUNT: number;
};

const letter = (value: unknown) => ({
  group: 'MiscItems',
  templateIndex: REALM_LETTER_TEMPLATE,
  name: 'Letter of Credit',
  value,
  stackCount: 1,
});

const bankWith = (accountGold: unknown) => {
  const bankAccounts: { accountGold: unknown }[] = [];
  for (let i = 0; i <= REALM_EMPIRE_ACCOUNT; i++) bankAccounts.push({ accountGold: 0 });
  bankAccounts[REALM_EMPIRE_ACCOUNT].accountGold = accountGold;
  return bankAccounts;
};

test('a letter whose value is not a number pays nothing, so a save with nothing else cannot pay', () => {
  for (const value of ['5000', 'lots', null, {}, Number.NaN, Infinity, 1.5, -100]) {
    const save = { goldPieces: 10, items: [letter(value)] };
    assert.equal(payFromSave(save, 100), false, `letter value ${String(value)}`);
    assert.equal(save.goldPieces, 10);
  }
});

test('a letter whose value is not a number never leaves the debt unpaid behind a success', () => {
  const save = { goldPieces: 50, items: [letter('lots'), letter(80)], bankAccounts: bankWith(0) };
  assert.equal(payableOf(save, 1), 130);
  assert.equal(payFromSave(save, 120, 1), true);
  // 120 came out of the good letter (80) and the purse (40): the forged letter paid nothing
  assert.equal(save.goldPieces, 10);
  assert.equal(save.items.filter((it) => it.value === 80).length, 0);
});

test('a bank balance that is not a safe whole number pays nothing', () => {
  for (const accountGold of [Infinity, 1e300, Number.NaN, '9000', 2.5]) {
    const save = { goldPieces: 0, items: [], bankAccounts: bankWith(accountGold) };
    assert.equal(payFromSave(save, 1000, 1), false, `accountGold ${String(accountGold)}`);
    assert.equal(save.bankAccounts[REALM_EMPIRE_ACCOUNT].accountGold, accountGold);
  }
});

test('a payment from a sound bank balance takes exactly what it costs', () => {
  const save = { goldPieces: 0, items: [], bankAccounts: bankWith(5000) };
  assert.equal(payFromSave(save, 1200, 1), true);
  assert.equal(save.bankAccounts[REALM_EMPIRE_ACCOUNT].accountGold, 3800);
});
