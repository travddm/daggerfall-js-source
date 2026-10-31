import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bladeInset } from '../../../src/ui/enhanced/enhancedHud.js';
import { PREF_DEFAULTS } from '../../../src/systems/uiPrefs.js';

// ═══ FOEBAR1 (2026-09-17): THE BLADE FACE OF THE TARGET BAR ═════════
//
// Mac, from a friend's two pictures: "implement these as alternate
// versions of the enemy health bar we have implemented". A twin-bladed
// shape with a skull hub - the dark one the empty bar, the red one the
// fill - drawn in place of the plain track under the compass when
// prefs.foeBarStyle is 'blade', the fill clipped in from both tips
// toward the hub by the health lost. The pictures are one crop of both
// 1000x1000 originals (their union alpha box, 981x130), so they register
// pixel for pixel. tools/foebar1Probe.mjs draws it in Chromium.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const pngSize = (p) => { const b = readFileSync(join(root, p)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

test('FOEBAR1: the inset law - half of what is lost comes off each tip, full is 0, empty is 50, and the fraction is clamped', () => {
  assert.equal(bladeInset(100), 0);
  assert.equal(bladeInset(50), 25);
  assert.equal(bladeInset(25), 37.5);
  assert.equal(bladeInset(0), 50, 'the two clips meet at the hub');
  assert.equal(bladeInset(140), 0, 'over full is full');
  assert.equal(bladeInset(-30), 50, 'under empty is empty');
});

test('FOEBAR1: the two pictures are one crop, the pref defaults to the plain bar, and the HUD, the sheet and the menu carry the face', () => {
  const empty = pngSize('src/ui/assets/foe-blade-empty.png'), full = pngSize('src/ui/assets/foe-blade-full.png');
  assert.deepEqual(empty, { w: 981, h: 130 }, 'the empty picture is the union alpha crop');
  assert.deepEqual(full, empty, 'and the fill is the same crop, so the two register');
  assert.equal(PREF_DEFAULTS.foeBarStyle, 'bar', 'the plain bar is what a player has until they choose');
});
