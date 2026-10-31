// FIELD 2026-09-27 (michelle!! on the Discord, "unable to add attributes (mobile)": "i can't see the different
// options. i've tried safari and firefox and switching to landscape"). Her screenshot: the Strength description, "What
// these buy you", "12 left to spend", Roll again, Back - and no attribute rows anywhere, under a "CRASH (2) / unknown
// error" box. Reproduced in Chromium at her sizes with the real wizard mounted: the phone block's `grid-template-rows:
// 1fr auto` (written so the race map keeps its room) handed the STATS stage's list the leftover of a ~454px card -
// 0-5px, each part scrolling inside its own box on a page that cannot scroll. The Review stage the same. And a touch
// screen wider than 860px had the stats card's Continue (and the review's Begin) pushed below the screen as a closed
// sheet, because the menu's sheet rule answers a coarse pointer and the wizard's undo only a narrow width. The CRASH
// box was neither: it discarded the error event's own message and said "unknown error". Fixed and re-measured at eight
// sizes (390x664 to 1280x720): every attribute's stepper and the primary are reachable, and a tap lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crashText } from '../../../src/ui/crashText.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const body = (src, head) => src.slice(src.indexOf(head), src.indexOf('\nfunction ', src.indexOf(head) + head.length));

test('FIELD 2026-09-27: a crash with no error object says the event\'s own message - "Script error.", a worker\'s - not "unknown error" (mutant: the event\'s message discarded again)', () => {
  assert.equal(crashText(null, { message: 'Script error.' }), 'Script error.', 'a muted cross-origin error');
  assert.equal(crashText(undefined, { message: 'Uncaught TypeError: x is null', filename: 'nav.worker.js', lineno: 1, colno: 26 }),
    'Uncaught TypeError: x is null\nat nav.worker.js:1:26', 'a worker\'s error, where it came from');
  assert.equal(crashText(null), 'unknown error', 'nothing to say is still said');
  assert.equal(crashText(null, {}), 'unknown error');
  // an Error object is still its own word, never the event's
  assert.equal(crashText(new TypeError('mesh is null'), { message: 'Uncaught TypeError: mesh is null' }).split('\n')[0], 'TypeError: mesh is null');
});

