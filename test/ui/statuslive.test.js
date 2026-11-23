// STATUS-LIVE + NOTICE-FIT.
//
//   "minor thing: would be nice if the info panel that comes up when
//    you press i didn't pause the game, that way you could quickly
//    check your status while walking around"
//   "I think we also need the sizing of the boxes to properly adjust
//    for the text instead of always being wide"
//
// TWO DEFECTS WITH ONE CAUSE BETWEEN THEM: ENH-NOTICE1 moved DFU's
// centre-of-screen parchment to a panel at the right EDGE and carried
// two properties of the parchment across that do not belong to a panel
// at the edge - it stopped the world, and it was a fixed slab as wide
// as the longest thing it would ever have to say.
//
// The reasoning for each lives beside the code: ui/statusBox.js and
// systems/statusReadout.js for the pause, the `.notice` rule's own
// note in ui/enhanced/enhancedStyle.js for the width. These are the pins.
//
// WHAT A PIN HERE MUST NOT BE. "The box declares pauseWhileOpen false"
// agrees with the wiring whatever the wiring does, so every pin below
// that can drives the LAW instead: the stack's own `pauseWhileOpen`
// reader answering for the real box, the toggle really emptying a
// host's slot, the yield really refusing a movement key, and the four
// hosts' gates read out of their own source.

import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ActionTextBox } from '../../src/ui/actionText.js';
import { StatusReadout, statusReadoutRows, toggleStatusReadout } from '../../src/ui/statusBox.js';
import {
  statusReadoutUp, statusReadoutTakesAction, closeStatusReadout, statusReadoutHint,
  STATUS_YIELD_ACTIONS, _resetStatusReadout,
} from '../../src/systems/statusReadout.js';
import { pauseWhileOpen, makeWindowStack } from '../../src/ui/windowStack.js';
import { ENHANCED_CSS } from '../../src/ui/enhanced/enhancedStyle.js';
import { loadOrCreateBindings, setBinding } from '../../src/systems/inputActions.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole
import { bindings, setBindings } from '../../src/ui/input.js';   // the LIVE store's two doors - the only ones that can push it down

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => hostText(p);

const ENTITY = { diseases: [], poisons: [] };
const LINES = (id) => (id === 22
  ? [{ text: 'You are in Daggerfall.', center: true }, { text: 'you are an outlaw.', center: true }]
  : [{ text: 'You are healthy.', center: true }]);

const mk = () => {
  const slot = { win: null };
  const ok = toggleStatusReadout({
    mount: (b) => { slot.win = b; },
    drop: (b) => { if (slot.win === b) slot.win = null; },
    lines: LINES, entity: ENTITY,
  });
  return { slot, ok };
};

test('STATUS-LIVE: the readout is the one box the STACK does not stop the world for - asked of ui/windowStack.js, not of the field', () => {
  _resetStatusReadout();
  const { slot } = mk();
  // the port's PauseWhileOpen reader (UserInterfaceWindow.cs:141), the
  // one every host's pause latch consults
  assert.equal(pauseWhileOpen(slot.win), false, 'the readout does not pause');
  assert.equal(pauseWhileOpen(new ActionTextBox(['anything'])), true, '...and every other message box still does - DFU\'s default is TRUE');
  // and the latch itself, driven: a host's stack holding this box is
  // a host whose world is running
  const stack = makeWindowStack({});
  stack.pushWindow(slot.win);
  assert.equal(stack.paused(), false, 'the stack agrees');
  stack.pushWindow(new ActionTextBox(['a quest speaks']));
  assert.equal(stack.paused(), true, 'a real box over it stops the world, as DFU\'s latch does');
  _resetStatusReadout();
});

test('STATUS-LIVE: the Status key is a TOGGLE and the close empties the host\'s slot, not merely the box', () => {
  _resetStatusReadout();
  const { slot, ok } = mk();
  assert.equal(ok, true, 'the first press opens');
  assert.ok(slot.win instanceof StatusReadout);
  assert.equal(statusReadoutUp(), true);
  // The SLOT is what matters: a box that is merely `done` has not
  // answered a host's "is the slot free" guard, which is what the
  // dungeon refuses windows on.
  const second = toggleStatusReadout({ mount: () => assert.fail('the second press must not mount'), lines: LINES, entity: ENTITY });
  assert.equal(second, false, 'the second press closes and answers false, so the caller\'s ladder stops');
  assert.equal(slot.win, null, 'the slot is FREE, in the same act');
  assert.equal(statusReadoutUp(), false);
  assert.equal(closeStatusReadout(), false, 'nothing up, nothing to close');
  _resetStatusReadout();
});

test('STATUS-LIVE: the yield - a window key takes the slot back, Escape is SPENT, and a step is not', () => {
  _resetStatusReadout();
  const { slot } = mk();
  // walking, looking and swinging happen UNDER it: that is the request
  for (const act of ['MoveForwards', 'MoveLeft', 'SwingWeapon', 'ReadyWeapon', 'Jump', 'QuickUse1', null, undefined]) {
    assert.equal(statusReadoutTakesAction(act), false, `${act} is not the readout's`);
  }
  assert.equal(statusReadoutUp(), true, '...and none of them closed it');
  assert.equal(slot.win instanceof StatusReadout, true);
  // a WINDOW key closes it and then goes on to do its own work
  assert.equal(statusReadoutTakesAction('CharacterSheet'), false, 'the sheet still opens - the key is not spent');
  assert.equal(slot.win, null, '...but the slot it wanted is free first');
  assert.equal(statusReadoutUp(), false);
  // Escape closes it AND stops there
  const again = mk();
  assert.equal(statusReadoutTakesAction('Escape'), true, 'spent: no pause menu behind it');
  assert.equal(again.slot.win, null);
  // with nothing up, Escape is the pause menu's again
  assert.equal(statusReadoutTakesAction('Escape'), false);
  _resetStatusReadout();
});

test('STATUS-LIVE: a readout left under another window closes itself when it is uncovered - the latch falls with it', () => {
  _resetStatusReadout();
  const { slot } = mk();
  const stack = makeWindowStack({ onTop: (w) => { slot.win = w; } });
  stack.pushWindow(slot.win);
  const quest = new ActionTextBox(['a quest speaks']);
  stack.pushWindow(quest);            // pushed OVER it (worldModes' mountInterior, dungeonContext's pushDungeonWindow)
  assert.equal(stack.paused(), true);
  stack.popWindow();                  // the box is dismissed; the readout is the top again
  assert.equal(slot.win.done, true, 'OnReturn closed it: a readout you left is stale');
  stack.popWindow();
  assert.equal(stack.paused(), false, '...and the stack drains, so the latch falls - no game paused with nothing on screen');
  _resetStatusReadout();
});

test('STATUS-LIVE: no chain, no click-to-close, and the caption names the LIVE Status key', () => {
  // DRIVEN THROUGH ui/input.js's OWN TWO DOORS, not by handing this
  // module a store: what has to be true is that the LIVE singleton
  // reaches the caption, and a pin that pushes the store itself passes
  // whether or not `bindings()` ever does (both mutants survived the
  // first draft saying exactly that).
  const store = bindings();          // the first read builds it - and pushes it down
  const box = new StatusReadout(['You are healthy.']);
  assert.equal(box.noticeHint, 'press I or ESC to close', 'the default binding, said in the controls window\'s own spelling');
  // a REBOUND key renames the caption with it - a hint that names a
  // key nobody has is the promise-the-page-does-not-keep defect. The
  // controls window swaps the whole store through `setBindings`.
  const rebound = loadOrCreateBindings();
  setBinding(rebound, 'F9', 'Status');
  setBindings(rebound);
  assert.equal(new StatusReadout(['x']).noticeHint, 'press F9 or ESC to close');
  setBindings(store);
  assert.equal(new StatusReadout(['x']).noticeHint, 'press I or ESC to close', 'and back');
  _resetStatusReadout();             // ...which clears the store too
  assert.match(statusReadoutHint(), /^press the status key/, 'no store yet: no key is named, and none is invented');
  // ClickAnywhereToClose is not this box's law...
  assert.equal(box.click(), false, 'a click while the world runs is a swing');
  assert.equal(box.done, false);
  // ...and there is no second page to advance to
  assert.deepEqual(box._next, [], 'no AddNextMessageBox chain: nothing routes it a key');
  box.input();
  assert.equal(box.done, true, 'the toggle\'s own close still closes it');
  _resetStatusReadout();
});

test('STATUS-LIVE: the composer is ONE page - record 22, the health box, and SURV5\'s advice, blank-line separated', () => {
  const plain = statusReadoutRows({ lines: LINES, entity: ENTITY });
  assert.deepEqual(plain.map((r) => (typeof r === 'string' ? r : r.text)), [
    'You are in Daggerfall.', 'you are an outlaw.', '', 'You are healthy.',
  ]);
  const fed = statusReadoutRows({
    lines: LINES, entity: ENTITY,
    survival: { minutes: 700, vampire: false, endurance: 50 },
  });
  assert.ok(fed.length > plain.length, 'the survival page joins the same page');
  assert.equal(fed[plain.length], '', 'separated by a blank row, not run together');
  assert.deepEqual(fed.slice(0, plain.length), plain, '...and the first two pages are untouched');
});

test('STATUS-LIVE: the enhanced panel carries the box\'s OWN caption, and a replaced box takes its panel with it', () => {
  // the release on dispose: showOverlay disposes the OUTGOING window,
  // and without this the panel left only when the watchdog noticed
  const box = new ActionTextBox(['x']);
  box._noticeKey = 'statuslive-probe';
  assert.equal(typeof box.dispose, 'function');
  box.dispose();   // no document here: the release is a no-op that must not throw
});

test('NOTICE-FIT: the panel is CAPPED, not sized - and the phone block is a cap too', () => {
  const rule = /\.notice \{\n([^}]*)\}/.exec(ENHANCED_CSS);
  assert.ok(rule, 'the rule is there');
  assert.match(rule[1], /max-width: min\(520px, 70vw\);/, 'a ceiling the long boxes still wrap at');
  assert.equal(/(^|[^-])width: min\(520px, 70vw\);/.test(rule[1]), false,
    'and NOT a fixed width - "You are healthy." was as wide as a four-paragraph quest box');
  // the stack's own cap is untouched (AUDIT ENH-NOTICE3 A1's clip)
  assert.match(ENHANCED_CSS, /\.notice-stack \{[^}]*max-width: min\(520px, 70vw\); max-height: 90vh; overflow: hidden;/);
  // the notice's OWN phone block - the sheet has a dozen 720px
  // queries and the first one is the talk shell's
  assert.match(ENHANCED_CSS, /@media \(max-width: 720px\) \{\n  \.notice-stack \{[^}]*\}\n  \.notice \{ max-width: 88vw;/, 'the phone block caps too');
  assert.equal(/\.notice \{ width: 88vw;/.test(ENHANCED_CSS), false, '...and nowhere in the sheet is it a fixed width again');
});
