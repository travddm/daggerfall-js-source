// SILVER: THE CURRENCY IS CALLED silver WHEREVER A PLAYER READS IT. A mass
// noun, so no plural ("1 silver", "1,240 silver") and every sentence reworded to read right ("You do not hold that much
// silver."). Only the words changed: the balances, the ledger, the routes, MARKS_OPEN, the constants and the code's own
// name for them (marks, MARKS1) stand, so no account's balance moved and no stored row was touched. The metal keeps
// its own name ("Silver", "Silver Ingot", metal:silver).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { marksText } from '../../src/net/marksLaw.js';
import { accountRefusalText } from '../../src/net/accountClient.js';
import { bountyPaidText } from '../../src/systems/seatEdicts.js';
import { TIDE_WORDS } from '../../src/net/tideLaw.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** A source with its comments blanked - what is left is code and the words it shows (test/ui/drakes.test.js's). */
function code(text) {
  const out = text.split('');
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (text.startsWith('/*', i)) { const j = text.indexOf('*/', i + 2); const end = j < 0 ? text.length : j + 2; for (let k = i; k < end; k++) if (out[k] !== '\n') out[k] = ' '; i = end - 1; continue; }
    if (text.startsWith('//', i)) { const j = text.indexOf('\n', i); const end = j < 0 ? text.length : j; for (let k = i; k < end; k++) out[k] = ' '; i = end - 1; }
  }
  return out.join('');
}

/** Every file that shows the currency to a player - DRAKES' twelve and the seats' seven. */
const SHOWN = [
  'src/net/marksLaw.js', 'src/net/marksBook.js', 'src/net/accountClient.js', 'src/scenes/world.js', 'src/ui/bankWindow.js',
  'src/ui/enhanced/enhancedAccount.js', 'src/ui/enhanced/enhancedPorts.js', 'src/ui/marketTab.js', 'src/ui/workTab.js', 'src/ui/noticeWindow.js',
  'src/ui/professions/profPages.js', 'src/ui/socialPanel.js',
  'src/net/royalLink.js', 'src/net/tideLaw.js', 'src/net/townSeatBook.js', 'src/net/townSeatLaw.js', 'src/systems/seatEdicts.js',
  'src/ui/seatTab.js', 'src/ui/seatWorks.js',
];

/** Where the old name is left on purpose: a CSS comment inside a style sheet's string, and SQL comments in the service's
 *  statements - no player reads either. */
const LEFT = new Set(['src/ui/enhanced/enhancedPlusStyle.js', 'server-account/src/market.js', 'server-account/src/writs.js']);

const DRAKE = /\bDrakes?\b|Drake's/;

test('SILVER a balance reads in silver - the same word for one, none and many (mutants: the old name back; a plural)', () => {
  for (const [n, w] of [[0, '0 silver'], [1, '1 silver'], [2, '2 silver'], [1240, '1,240 silver'], [10000000, '10,000,000 silver']]) assert.equal(marksText(n), w);
  assert.equal(accountRefusalText('marks-short'), 'You do not hold that much silver.');
  assert.equal(accountRefusalText('guild-marks-short'), 'The treasury does not hold that much silver.');
  assert.equal(accountRefusalText('marks-need-account'), 'Silver is kept by registered accounts. Add a username to hold it.');
  assert.equal(accountRefusalText('marks-rate'), 'You have moved too much silver this hour. Try again later.');
  assert.equal(accountRefusalText('heraldry-drakes'), 'Changing the heraldry costs 500 silver from the guild\'s silver treasury, and it holds less.');
  assert.equal(bountyPaidText(20), 'The Bounty pays you 20 silver for the camp.');
  assert.equal(TIDE_WORDS.daedra, 'Gate kills give double influence and double silver.');
});

