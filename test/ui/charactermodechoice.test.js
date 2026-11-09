// CHARACTER MODES: the mode question (ui/characterModeChoice.js) - the five answers with their pros and cons, Classic
// first, the Legacy answer only while Project Legacy's master switch is on, and a compact screen that fits the 200.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterModeOptions, characterModeScreen, MODE_TAGS } from '../../src/ui/characterModeChoice.js';
import { choiceHeight, choiceAtNative, CHOICE_COMPACT_TOP, CHOICE_COMPACT_GAP } from '../../src/ui/choiceScreen.js';
import { CHARACTER_MODES } from '../../src/net/modeLaw.js';
import { offeredModes } from '../../src/systems/characterModes.js';
import { UNENFORCED_ONLINE_MODES, withoutUnenforcedModes } from '../../src/systems/unenforced-online-modes.ts';

test('five answers, Classic first and recommended, each with a pro and a con', () => {
  const options = characterModeOptions({ offered: {} });
  assert.deepEqual(
    options.map((o) => o.id),
    [...CHARACTER_MODES],
  );
  assert.match(options[0].title, /recommended/i);
  for (const o of options) {
    assert.equal(o.lines.length, 2, o.id);
    assert.ok(o.lines[0].startsWith('+ ') && o.lines[1].startsWith('- '), `${o.id}: pros then cons`);
    assert.ok(MODE_TAGS[o.id], `${o.id} has a tag`);
  }
});

test('the Legacy answer is offered only while the master switch is on', () => {
  assert.deepEqual(
    characterModeOptions({ offered: { legacy: false } }).map((o) => o.id),
    CHARACTER_MODES.filter((m) => m !== 'legacy'),
  );
});

test('the compact screen fits the 320x200 native frame and its blocks can all be clicked', () => {
  const answers = [];
  const s = characterModeScreen((m) => answers.push(m), { offered: {} });
  const n = s.options.length;
  const foot = s.tops[n];
  assert.ok(foot + 10 <= 200, `the footer ends at ${foot + 10}`);
  assert.equal(s.tops[0], CHOICE_COMPACT_TOP);
  for (let i = 0; i < n; i++) assert.equal(s.tops[i + 1] - s.tops[i], choiceHeight(s.options[i]) + CHOICE_COMPACT_GAP);
  for (let i = 0; i < n; i++) assert.equal(choiceAtNative(100, s.tops[i] + 5, s.options, s.tops), i);
  s.input('char:5');
  assert.deepEqual(answers, ['hardcore_ironman']);
});

test('a screen without the Legacy answer numbers the rest from 1', () => {
  const answers = [];
  const s = characterModeScreen((m) => answers.push(m), { offered: { legacy: false } });
  s.input('char:3');
  assert.deepEqual(answers, ['ironman']);
});

test("the Plus face hint counts the answers shown, and the face lists each answer's lines", () => {
  assert.match(characterModeScreen(() => {}, { offered: { legacy: false } }).faceText.hint, /1 to 4$/);
  assert.match(characterModeScreen(() => {}, { offered: {} }).faceText.hint, /1 to 5$/);
  assert.equal(characterModeScreen(() => {}, { offered: {} }).faceText.listLines, true);
});

// Decision 116 (1): an online page hides the modes online play does not enforce yet.
test('online, the offered table turns off every unenforced mode; offline it is the mod settings, as before', () => {
  const offline = offeredModes({ online: false });
  const online = offeredModes({ online: true });
  for (const mode of UNENFORCED_ONLINE_MODES) assert.equal(online[mode], false, mode);
  assert.equal(online.legacy, offline.legacy, 'Legacy follows Project Legacy either way');
  assert.equal(offline.hardcore, true, 'offline, the shipped settings offer Hardcore');
});

test('the online picker shows Classic and Legacy and numbers them from 1; offline it shows all five', () => {
  const everything = { hardcore: true, legacy: true, ironman: true, hardcore_ironman: true };
  const answers = [];
  const screen = characterModeScreen((mode) => answers.push(mode), {
    offered: withoutUnenforcedModes(everything),
  });
  assert.deepEqual(
    screen.options.map((o) => o.id),
    ['classic', 'legacy'],
  );
  screen.input('char:2');
  assert.deepEqual(answers, ['legacy']);
  assert.deepEqual(
    characterModeOptions({ offered: everything }).map((o) => o.id),
    [...CHARACTER_MODES],
  );
});
