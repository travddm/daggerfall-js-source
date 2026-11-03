// NAME-WORDS ("Not sure how the filter didnt catch this" - then "Yes" to adding both words): net/nameFilter.js
// reads `prostitute` and `strangler` ANYWHERE, so the handle is refused at entry and the words starred in a line.
// Driven over the real worker and the real migrations.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService } from '../accountDb.mjs';
import { checkName } from '../../src/net/nameFilter.js';
import { sanitizeChat } from '../../src/net/wire.js';
import { ACCEPTED } from '../../src/net/legalLaw.js';

const OLD = 'PROSTITUTE_STRANGLER', NEW = 'SanguinePanguine';

test('NAME-WORDS: the report\'s handle is refused at entry, naming the word; either word is caught glued to another or padded; a line stars them; SanguinePanguine and Stranglehold pass (mutants: either word left out)', async () => {
  const s = await standService();
  const g = await s.guest();
  const reg = await s.call('/v1/auth/register', { handle: OLD, password: 'a good long one', ...ACCEPTED }, g.secret);
  assert.deepEqual([reg.status >= 400, reg.body?.error], [true, 'handle-refused']);
  assert.deepEqual([checkName(OLD).ok, checkName(OLD).word], [false, 'prostitute']);
  assert.deepEqual([checkName('xXStranglerXx').ok, checkName('xXStranglerXx').word], [false, 'strangler']);
  assert.equal(sanitizeChat('a prostitute and a strangler'), 'a ********** and a *********');
  assert.deepEqual([NEW, 'Stranglehold'].map((n) => checkName(n).ok), [true, true]);
});
