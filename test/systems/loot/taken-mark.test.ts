import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearUntaken } from '../../../src/systems/loot/taken-mark.ts';

test('a take clears the untaken mark once and says whether the piece carried it', () => {
  const piece: { untaken?: boolean } = { untaken: true };
  assert.equal(clearUntaken(piece), true);
  assert.equal('untaken' in piece, false);
  assert.equal(clearUntaken(piece), false, 'a piece taken again carries no mark');
});

test('a missing piece or a mark that is not true is left alone', () => {
  assert.equal(clearUntaken(null), false);
  assert.equal(clearUntaken(undefined), false);
  assert.equal(clearUntaken({ untaken: false }), false);
});
