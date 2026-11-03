// FIELD BUGS 2026-10-18 HUD-HEAD (, found reading Anon-e-moose's "Gradual
// FPS loss then crash" - not that report's proven cause, a leak on the way to it). With Morrowind's data attached the
// large HUD's head is a Morrowind picture, each its own texture (ui/hud/hudLarge.js loadHudLargeHead, PORTRAIT3D), and
// largeHudOptions loads a new one whenever the head's key moves - every helm put on or taken off. The picture it
// replaced was never let go, and two loads in flight landed in the order they finished. The law (swapHudHead) executes;
// the wiring is text-pinned (the bar's art needs ARENA2's pictures to load).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { swapHudHead } from '../../../src/ui/hud/hudLarge.js';

test('HUD-HEAD A HEAD REPLACED IS LET GO, AND A LATE ONE NEVER GOES UP: the Morrowind picture a new head replaces is released by its name; an answer for a key the bar no longer asks for is released and the bar keeps its head; a Daggerfall head (no name of its own - an archive\'s picture) is never released (mutants: the replaced head kept; the late answer put up; the late answer kept)', () => {
  const released = [];
  const release = (k) => released.push(k);
  const art = { head: { tex: 't1', mwKey: 'mwhead#hud#1' } };
  assert.equal(swapHudHead(art, 'helm', 'helm', { tex: 't2', mwKey: 'mwhead#hud#2' }, release), true);
  assert.equal(art.head.tex, 't2');
  assert.deepEqual(released, ['mwhead#hud#1'], 'the helm taken off: its picture let go');
  // two loads in flight: the bare head asked, then the helm again - the bare head's answer comes last
  assert.equal(swapHudHead(art, 'bare', 'helm', { tex: 't3', mwKey: 'mwhead#hud#3' }, release), false);
  assert.equal(art.head.tex, 't2', 'the bar keeps the head it asks for');
  assert.deepEqual(released, ['mwhead#hud#1', 'mwhead#hud#3'], 'and the late picture is let go, not left');
  // a classic head replacing a Morrowind one, then a Morrowind one replacing it
  assert.equal(swapHudHead(art, 'k', 'k', { tex: 'classic' }, release), true);
  assert.deepEqual(released.at(-1), 'mwhead#hud#2');
  released.length = 0;
  assert.equal(swapHudHead(art, 'k2', 'k2', { tex: 't4', mwKey: 'mwhead#hud#4' }, release), true);
  assert.deepEqual(released, [], 'a classic head is an archive\'s picture - never released here');
  assert.equal(swapHudHead(null, 'k', 'k', { tex: 't5', mwKey: 'mwhead#hud#5' }, release), false, 'no bar: nothing up');
  assert.deepEqual(released, ['mwhead#hud#5']);
  assert.equal(swapHudHead(art, 'k', 'k', null, release), false, 'no answer: nothing moves');
});

