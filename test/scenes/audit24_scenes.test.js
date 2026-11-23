// AUDIT 24 (the full-codebase parity sweep), scenes + render.
// The guard pool and the magic host both need ARENA2 to drive end to
// end, so the laws that changed are pinned where they are written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESS_BUTTON_TO_FIRE_SPELL } from '../../src/systems/mysticism.js';

const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('audit24 scenes: the ready-spell HUD line is SetReadySpell\'s own string', () => {
  assert.equal(PRESS_BUTTON_TO_FIRE_SPELL, 'Press button to fire spell.');
});

// ---- AUDIT 24, wave 20: the StaticNPC click chain ------------------
// PlayerActivate.StaticNPCClick (:1512-1570) runs three things in a
// fixed order before any routing happens, and the port had the first
// and the third.

