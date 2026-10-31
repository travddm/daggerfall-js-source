import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MODERN_TEXT_SCALE, MODERN_BLOCK_SIZE, MODERN_QUESTION_BG, MODERN_ANSWER_BG,
} from '../../../src/ui/native/nativeTalk.js';
import { LIVE } from '../../../src/systems/settings/settings.js';

// UI6 - THE MODERN CONVERSATION STYLE (DaggerfallTalkWindow :53-60,
// :645-650, :1262-1267, :1273-1278), the last of AUDIT 28's six UI-only
// keys. With the setting on, the three conversation labels - the NPC's
// greeting, each question and each answer - are drawn SMALLER
// (TextScale 0.8), WRAPPED NARROWER (MaxWidth x 0.75) and on their own
// BACKGROUND BLOCK, one colour for questions and one for answers.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('UI6: the four constants are DFU\'s (:53-54, :59-60)', () => {
  assert.equal(MODERN_TEXT_SCALE, 0.8);
  assert.equal(MODERN_BLOCK_SIZE, 0.75);
  assert.deepEqual([...MODERN_QUESTION_BG], [0.3, 0.35, 0.43, 1]);
  assert.deepEqual([...MODERN_ANSWER_BG], [0.32, 0.31, 0.06, 1]);
  assert.notDeepEqual([...MODERN_QUESTION_BG], [...MODERN_ANSWER_BG], 'the two speakers differ');
});

test('UI6: the classic path is untouched and the key is LIVE', () => {
  assert.equal(LIVE['GUI/EnableModernConversationStyleInTalkWindow'], 'src/ui/native/nativeTalk.js');
});
