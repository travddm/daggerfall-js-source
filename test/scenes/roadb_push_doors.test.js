// ROAD TO 1:1, WAVE B / B5 - THE REFUSAL-GUARD WALK B1 RECORDED.
//
// B1's report: "What is left is a scatter of older `if (slot) return` /
// `if (!slot) slot = ...` REFUSALS written when a single slot had no
// other safe answer... Each is a place DFU would PushWindow and the
// port still drops the message on the floor. Converting them is a
// per-site judgement."
//
// THE JUDGEMENT, site by site. DaggerfallUI.MessageBox is
// `new DaggerfallMessageBox(uiManager, uiManager.TopWindow); mb.Show()`
// (DaggerfallUI.cs:1330-1360), and Show() is uiManager.PushWindow - it
// has NEVER asked whether something else is open. So every site whose
// C# is a MessageBox is a push, and the ones that are not are the ones
// that stay:
//
//   CONVERTED (9):
//     the exhaustion box, in all THREE hosts that can collapse
//     the infection popup, in all FOUR hosts that wire it (the two
//       streaming hosts joined at ROAD review-p: they had no refusal
//       guard, so the walk passed them by, but a bare showOverlay is a
//       replace-and-dispose and MessageBox is not)
//     DaggerfallAction's ShowText and ShowTextWithInput (dungeon)
//     the rest mastery box (dungeon - the interior twin was already one)
//   LEFT, with the reason on each: the key-dispatch gates (DFU's own
//   `if (!IsPlayingGame)`), the async book-reader race the port has and
//   DFU does not, the level-up screen's PopToHUD pairing, and
//   mountSpellWindow's boolean contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createTownTalk } from '../../src/scenes/townTalk.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const src = (p) => hostText(p);

const talkHost = () => createTownTalk({
  renderer: { uploadTexture: () => ({}) }, canvas: { width: 640, height: 400 },
  fetchBytes: async () => { throw new Error('this pin loads no ARENA2'); },
  playerEntity: { name: 'T', stats: { personality: 50 }, skills: 30, skillUses: [] },
  regionIndex: 0,
});

// ---------------------------------------------------------------------
// The behaviour, on the door itself: a push over an open window keeps
// BOTH, where the old refusal kept only the first and lost the message.
// ---------------------------------------------------------------------

test('B5: pushOverlay over an open window keeps both - the shape every converted site now has', () => {
  const host = talkHost();
  const open = { name: 'the map the player had up' };
  host.showOverlay(open);
  const box = { name: 'You collapse from exhaustion.' };
  host.pushOverlay(box);
  assert.equal(host.overlay, box, 'the message is what the player reads');
  host.closeOverlay();
  assert.equal(host.overlay, open, 'and the window it was laid over comes back');
  // The refusal it replaces: `if (!townTalk.overlay) showOverlay(box)`
  // would have left `open` up and dropped `box` entirely.
});

// ---------------------------------------------------------------------
// The seven converted sites, one pin each.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// The sites deliberately LEFT, and why. A pin on a decision not taken
// is what stops the next sweep from taking it by accident.
// ---------------------------------------------------------------------

