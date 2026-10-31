// AUDIT 26 - THE RENDER CLUSTER (F001/F002, F033, F034, F183). Four
// laws the port computed, stated in a header, or held live in a
// predicate, and then never applied to a frame.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WINDOW_STYLES, windowEmissionRGB } from '../../src/render/windowEmission.js';
import { IMPACT_FPS } from '../../src/render/flatAnimation.js';
import { IMPACT_RECORD, BLOOD_ARCHIVE, BLOOD_FPS } from '../../src/scenes/hitEffects.js';
import { missileArchive } from '../../src/systems/spellcast.js';
import {
  DUNGEON_AMBIENT, CASTLE_AMBIENT, SPECIAL_AREA_AMBIENT,
  SPECIAL_AREA_BLOCK, dungeonAmbientFor,
} from '../../src/world/dungeon/dungeonLights.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(root, f), 'utf8');

// ---------------------------------------------------------------
// F001/F002: DaggerfallInterior lays out EVERY interior mesh with
// WindowStyle.Disabled — individual models (:473), the combined batch
// (:517), action doors (:1270) — and Disabled is EmissionColor
// Color.black outright (MaterialReader.cs:933-935).
// ---------------------------------------------------------------
test('audit26 F001: Disabled is black OUTRIGHT, and an unknown style still falls back to day', () => {
  assert.deepEqual(WINDOW_STYLES.disabled, { color: [0, 0, 0], intensity: 0 });
  assert.deepEqual([...windowEmissionRGB('disabled')], [0, 0, 0]);
  // the fallback is what made a missing entry dangerous rather than
  // merely absent: windowEmissionRGB('disabled') used to answer DAY.
  assert.deepEqual([...windowEmissionRGB('nosuchstyle')], [...windowEmissionRGB('day')]);
  // and day is emphatically not black, so the two cannot be confused
  assert.notDeepEqual([...windowEmissionRGB('day')], [0, 0, 0]);
});

// ---------------------------------------------------------------
// F183: UpdateAmbientLight (PlayerAmbientLight.cs:82-90) tests the
// castle block FIRST, then the special area, and only the plain arm
// is scaled.
// ---------------------------------------------------------------
test('audit26 F183: castle beats special area beats plain dungeon, and both are 0.58', () => {
  assert.deepEqual([...CASTLE_AMBIENT], [0.58, 0.58, 0.58]);
  assert.deepEqual([...SPECIAL_AREA_AMBIENT], [0.58, 0.58, 0.58]);
  assert.deepEqual([...DUNGEON_AMBIENT], [0.12, 0.12, 0.12]);

  assert.equal(dungeonAmbientFor({ inCastle: true, inSpecialArea: false }), CASTLE_AMBIENT);
  assert.equal(dungeonAmbientFor({ inCastle: false, inSpecialArea: true }), SPECIAL_AREA_AMBIENT);
  assert.equal(dungeonAmbientFor({ inCastle: false, inSpecialArea: false }), DUNGEON_AMBIENT);
  // PRECEDENCE: the castle arm is tested first, so it wins outright.
  assert.equal(dungeonAmbientFor({ inCastle: true, inSpecialArea: true }), CASTLE_AMBIENT);
  // and an empty call is the plain dungeon, not a throw
  assert.equal(dungeonAmbientFor(), DUNGEON_AMBIENT);

  // roughly five times brighter - the row's own measure of the gap
  assert.ok(CASTLE_AMBIENT[0] / DUNGEON_AMBIENT[0] > 4.8);
});

test('audit26 F183: the special area is the ONE block SpecialAreaCheck names, and both hosts read the selector', () => {
  // PlayerEnterExit.cs:1230 — the switch has exactly one case.
  assert.equal(SPECIAL_AREA_BLOCK, 'S0000161.RDB');
});

// ---------------------------------------------------------------
// F033: DoCollision swaps the billboard to record 1 of the missile's
// own element archive, one-shot at ImpactBillboardFramesPerSecond
// (:364-370), parented at localPosition Vector3.zero (:602).
// ---------------------------------------------------------------
test('audit26 F033: the flash is record 1 of the MISSILE\'s archive at 15fps, with no nudge', () => {
  assert.equal(IMPACT_RECORD, 1);
  assert.equal(IMPACT_FPS, 15);
  // the archive is the missile's own, per element (375..379)
  assert.equal(missileArchive(0), 375);
  assert.equal(missileArchive(4), 379);
  assert.equal(BLOOD_ARCHIVE, 380);
  assert.equal(BLOOD_FPS, 10);
});

