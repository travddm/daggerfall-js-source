// CM1-CM2 - RESIDUAL CLASSIC MODALS.
//
// The big named windows were already native. What remained were the
// small windows DFU PUSHES during those flows: DaggerfallMessageBox and
// DaggerfallInputMessageBox. These pins keep the two easiest places for
// that residue to regrow on the shared SPOP.RCI renderer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChoiceWindow } from '../../src/ui/talkWindow.js';
import { RestWindow } from '../../src/ui/restWindow.js';
import { PROMPT_INITIAL } from '../../src/systems/rest/restSession.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

test('CM1: a no-options ChoiceWindow is a click-anywhere message box, not a keyed menu', () => {
  const notice = new ChoiceWindow({ lines: ['Hello.'] });
  assert.equal(notice.done, false);
  assert.equal(notice.click(), true);
  assert.equal(notice.done, true);

  const menu = new ChoiceWindow({
    lines: ['Choose.'],
    options: [{ code: 'Digit1', label: '1 - yes', action() {} }],
  });
  // a keyed menu answers a click on one of its ROWS (the mouse audit's
  // hit map, drawn on the flat panel) and swallows every other; it is
  // never click-anywhere
  assert.equal(menu.click(0, 0), true, 'swallowed, not answered');
  assert.equal(menu.done, false, 'a keyed ChoiceWindow is not ClickAnywhereToClose');
});

test('AUDIT-CM: the rest prompt behaves as the box - "0" seeded, digits typed, Escape back to the selection, and an EMPTY Return lands on the selection too (the box closed first, :298-304; TryParse fails, :742-744)', () => {
  const w = new RestWindow({ endLines: () => ['finished'], onClose: () => {}, entity: { stats: {}, skills: {} } });
  w.input('char:3');   // Loiter: the prompt without CanRest's gate
  assert.equal(w.state, 'hours'); assert.equal(w.mode, 'loiter'); assert.equal(w.value, PROMPT_INITIAL, 'TextBox.Text = "0" (:700)');
  w.input('backspace'); w.input('char:1'); w.input('char:2'); w.input('char:x');
  assert.equal(w.value, '12', 'digits only');
  w.input('back');
  assert.equal(w.state, 'selection', 'Escape closes the box');
  w.input('char:3'); w.input('backspace');
  assert.equal(w.value, '');
  w.input('confirm');
  assert.equal(w.state, 'selection', 'an empty answer: the box has closed, TryParse fails, nothing starts');
  assert.equal(w.value, PROMPT_INITIAL);
});
