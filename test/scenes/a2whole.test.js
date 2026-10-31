// A2-WHOLE (2026-09-22, Discord - The Craziest Angel: "boot failed:
// ARCH3D.BSA: 404 - not in the stored ARENA2 selection ... keep getting
// this error even after uninstalling the daggerfall from steam and
// reinstalling").
//
// The picker stored ANY folder holding one Daggerfall file as a complete
// game, and the stored manifest then kept the picker from ever coming
// back - so the one fix a player can reach (reinstall the game) could
// never reach the bad copy living in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_ARENA2, missingArena2, incompleteArena2Text, KEEP } from '../../src/scenes/dataSource.js';

test('A2-WHOLE: a folder missing the files every boot reads is named as incomplete - which files, and the two ways to a whole one', () => {
  assert.deepEqual(missingArena2(REQUIRED_ARENA2), [], 'the whole set is whole');
  const partial = ['ART_PAL.COL', 'TEXT.RSC', 'FONT0003.FNT'];
  const missing = missingArena2(partial);
  assert.ok(missing.includes('ARCH3D.BSA'), 'the reporter\'s own 404 is caught at the pick, not the boot');
  assert.deepEqual(missing, REQUIRED_ARENA2.filter((n) => !partial.includes(n)));
  const say = incompleteArena2Text(missing);
  assert.match(say, /ARCH3D\.BSA/);
  assert.match(say, /DF\/DAGGER\/ARENA2/);
  assert.match(say, /DaggerfallGameFiles\.zip/);
  // every required file survives the diet, on both diets - a requirement
  // the ingest itself filters out would refuse EVERY folder
  for (const n of REQUIRED_ARENA2) { assert.ok(KEEP(n, false), `${n} is dieted out on desktop`); assert.ok(KEEP(n, true), `${n} is dieted out on a phone`); }
});

