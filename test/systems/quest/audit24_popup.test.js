// AUDIT 24 (the full-codebase parity sweep), wave 21:
// Quest.ShowMessagePopup (Quest.cs:775-844).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { chunkMessageTokens } from '../../../src/systems/quest/quest.js';

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'vendor', 'dfu-quests');
const sources = {};
for (const f of readdirSync(join(VENDOR, 'Tables'))) {
  if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = readFileSync(join(VENDOR, 'Tables', f), 'utf8').replace(/^\ufeff/, '');
}
loadQuestTables(sources);

const rd = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const text = (tokens) => tokens.map((t) => t.text ?? '').join('').trim();

// A message with two variants, so the variant draw is observable.
const TWO_VARIANTS = [
  'Quest: __POP', 'QRC:',
  'Message:  1011',
  ' FIRST',
  '<--->',
  ' SECOND',
  '',
  'QBN:',
  'variable _x_', '',
];

test('audit24 wave21: the tokens are read at QUEUE time, not at pop time', () => {
  // Quest.cs:785 - `TextFile.Token[] tokens = message.GetTextTokens();`
  // sits between the null check and the chunk loop, and it is that
  // array the boxes carry. The port pushed the Message and let the
  // host read tokens when the box finally opened, which moved the
  // variant draw, the whole macro expansion and the dialog reveal to
  // pop time.
  const popups = [];
  const m = new QuestMachine({ nowSeconds: () => 0, showPopup: (_q, tk) => popups.push(text(tk)) });
  const q = m.scheduleQuest(TWO_VARIANTS, 0, { rolls: () => 0 });
  m.tick();

  q.showMessagePopup(1011);          // rolls() === 0 -> variant 0
  q.rolls = () => 0.99;              // the world moves on before the box opens
  q._showPendingTaskMessages();
  assert.deepEqual(popups, ['FIRST'],
    'the variant was drawn when the task said to show it, not when the box opened');

  // and the other way round, so this is not just "index 0 always wins"
  popups.length = 0;
  q.rolls = () => 0.99;
  q.showMessagePopup(1011);
  q.rolls = () => 0;
  q._showPendingTaskMessages();
  assert.deepEqual(popups, ['SECOND']);
});

test('audit24 wave21: the empty check reads the CHOSEN expanded tokens', () => {
  // C# tests `tokens == null || tokens.Length == 0` on the array it
  // just read. The port tested `message.variants.some(v => v.tokens
  // .length)` - ANY variant, RAW - so a chosen variant that expanded
  // to nothing still queued a box and still burned the oncePerQuest
  // record.
  const popups = [];
  const m = new QuestMachine({ nowSeconds: () => 0, showPopup: (_q, tk) => popups.push(text(tk)) });
  const q = m.scheduleQuest(TWO_VARIANTS, 0, { rolls: () => 0 });
  m.tick();
  const message = q.getMessage(1011);
  assert.ok(message.variants.some((v) => v.tokens.length), 'a variant DOES carry raw tokens');
  message.getTextTokens = () => [];

  assert.equal(q.showMessagePopup(1011, false, true), null);
  assert.equal(q.pendingPopups.length, 0, 'nothing queued');
  assert.equal(q.oneTimeDisplayedMessages.has(1011), false,
    'and the oncePerQuest record is NOT burned - C# returns above that line');
});

test('audit24 wave21: the 22-line chunker, with C#\'s own off-by-one', () => {
  // Quest.cs:793-819. `if (++lineCount > chunkSize)` fires on the
  // TWENTY-THIRD counted line, which has already been added to the
  // chunk being closed - so a full chunk holds 23 lines, not 22.
  const line = (i) => [{ formatting: 'text', text: `L${i}` }, { formatting: 'nothing', text: '' }];
  const tokens = [];
  for (let i = 0; i < 50; i++) tokens.push(...line(i));
  const chunks = chunkMessageTokens(tokens);
  const counted = chunks.map((c) => c.filter((t) => t.formatting === 'nothing').length);
  assert.deepEqual(counted, [23, 23, 4], 'twenty-THREE per full chunk');
  assert.equal(chunks.flat().length, tokens.length, 'and no token is lost between chunks');

  // exactly 23 lines is one chunk; the 24th opens a second
  assert.equal(chunkMessageTokens([].concat(...Array.from({ length: 23 }, (_, i) => line(i)))).length, 1);
  assert.equal(chunkMessageTokens([].concat(...Array.from({ length: 24 }, (_, i) => line(i)))).length, 2);
  // "Add final chunk only if not empty" - and no tokens at all is no chunks
  assert.equal(chunkMessageTokens([]).length, 0);
  // a trailing token that is not a counted line still rides a chunk
  assert.equal(chunkMessageTokens([{ formatting: 'text', text: 'x' }]).length, 1);
});

test('audit24 wave21: a long message queues every chunk and drains them in reading order', () => {
  const popups = [];
  const m = new QuestMachine({ nowSeconds: () => 0, showPopup: (_q, tk) => popups.push(text(tk)) });
  const long = ['Quest: __LONG', 'QRC:', 'Message:  1011'];
  for (let i = 0; i < 30; i++) long.push(` L${i}`);
  long.push('', 'QBN:', 'variable _x_', '');
  const q = m.scheduleQuest(long, 0, { rolls: () => 0 });
  m.tick();

  q.showMessagePopup(1011);
  assert.equal(q.pendingPopups.length, 2, '30 lines is two boxes');
  // C# returns pendingMessageBoxStack.Peek() - the LAST chunk pushed.
  const peek = q.showMessagePopup(1011);
  assert.equal(peek, q.pendingPopups[q.pendingPopups.length - 1]);

  popups.length = 0;
  q.pendingPopups.length = 0;
  q.showMessagePopup(1011);
  q._showPendingTaskMessages();
  // The drain pops, so the host is handed the LAST chunk first: each
  // Show() is a PushWindow, and the last one pushed is the one the
  // player reads first. The host stacks them back into reading order.
  assert.equal(popups.length, 2);
  assert.match(popups[0], /L29$/, 'the tail chunk is Shown first (pushed deepest last)');
  assert.match(popups[1], /^L0/, 'and chunk 0 lands on top, where the player sees it');
});

