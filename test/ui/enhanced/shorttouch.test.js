// SHORT-TOUCH (2026-09-27, Discord - players on an AYN Thor and an Android phone: "I can login, get to the main
// screen but I'm unable to select online, load game, anything"; "I luckily have a tiny, tiny space under the title I
// can use to scroll"). The coarse-pointer layout stacked the section screen's brand, pane and rail in one column;
// on a landscape handheld 411 px tall the pane - every Continue, Load, Begin and Play online - came to 5 px (0 on a
// 393 px screen). A short landscape touch screen keeps the desk's two columns now, and the first visit's sign-in
// window takes the short screen's height. MEASURED by tools/shortTouchProbe.mjs (24 failures before, none after, on
// four handheld viewports); pinned here as the rules that make it so, and their order against the rules they beat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SHORT = '@media (pointer: coarse) and (orientation: landscape) and (min-width: 600px), (orientation: landscape) and (min-width: 600px) and (max-width: 860px) {';

test('TALL-TOUCH: any landscape screen the stack would take keeps the two columns - not only a short one (the Ally X, 1280x720: the stacked logo stood ~470 px of 720)', () => {
  const head = SHORT.slice('@media '.length, -2).split(', ');
  assert.equal(head.length, 2, 'both ways into the stack: a coarse pointer, and a window under 860 px');
  for (const q of head) {
    assert.match(q, /\(orientation: landscape\)/);
    assert.match(q, /\(min-width: 600px\)/, 'never a phone held upright - its stack is right');
    assert.doesNotMatch(q, /max-height/, 'no height ceiling: the stacked logo is half a landscape screen at any height');
  }
  assert.match(head[0], /^\(pointer: coarse\)/);
  assert.match(head[1], /\(max-width: 860px\)$/, 'the narrow window\'s half is the stack\'s own width bound');
});
