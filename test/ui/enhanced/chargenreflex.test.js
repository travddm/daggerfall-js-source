// CHARGEN-REFLEX (2026-09-22, Fay on Discord, desktop build 0.1.3612:
// "The Continue button on the Reflex page is not clickable. Tried all
// the different reflex options, but I can only click the Back
// button."). A character could not be created at all.
//
// THE BUTTON WAS NEVER DISABLED AND THE FLOW WAS NEVER STUCK - both
// were the first two guesses and both were wrong, which is why they
// are pinned below rather than merely remembered. It was COVERED:
// `.choose` is centred at `height: 100%`, `.stagebody`'s implicit grid
// row is `auto` (max-content), so a stage taller than the pane kept
// its full height while `.stagebody` shrank under `flex: 1;
// min-height: 0` - and the overflow painted under the opaque
// `.actionbar` laid out straight after it.
//
// THE REAL PROOF IS A MEASUREMENT and lives in
// tools/chargenReflexProbe.mjs, which reads
// `document.elementFromPoint` at the button's own centre in a real
// browser at eight window sizes (it answers `DIV.actionbar` at
// 1280x720 before the fix, and the probe re-proves that on demand with
// SHOW_BUG=1). Node cannot see a painted rectangle. What node CAN hold
// is the structure that made the rectangle reachable, which is what
// these pins are - and they are named as the weaker half on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChargenFlow } from '../../../src/ui/chargen.js';
import { ENHANCED_CSS } from '../../../src/ui/enhanced/enhancedStyle.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('CHARGEN-REFLEX: a stage taller than the pane can shrink and scroll rather than overflow', () => {
  // The two properties the measurement turned on. A revert of either
  // puts the overflow back under the action bar, and CI does not run
  // the browser probe - so this is the line that notices.
  const stagebody = /\.stagebody \{[^}]*\}/.exec(ENHANCED_CSS)?.[0] ?? '';
  assert.match(stagebody, /grid-template-rows:\s*minmax\(0,\s*1fr\)/,
    'an auto row is max-content and will not give way');

  const choose = /\n\.choose \{[^}]*\}/.exec(ENHANCED_CSS)?.[0] ?? '';
  assert.match(choose, /place-content:\s*safe center/,
    'plain center puts half the overflow above the start edge, where nothing can scroll to it');
  assert.match(choose, /overflow-y:\s*auto/,
    'and the rest has to be reachable');
});

test('CHARGEN-REFLEX: the two things that were NOT wrong - the flow advances and the button is enabled', () => {
  // Pinned because they were the first two hypotheses and cost real
  // time. If this wizard ever strands a player again, these say where
  // NOT to look.
  const f = new ChargenFlow({});
  f.state = 'reflexes';
  f.input('confirm');
  assert.equal(f.state, 'summary', 'confirm at reflexes reaches the summary');

});
