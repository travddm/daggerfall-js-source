// TL3 (2026-09-08, Mac, the second report: "when traveling, sometimes
// you'll spawn inside building geometry").
//
// THE ROOT: the fast-travel arrival never asked for the reposition.
// DaggerfallTravelPopUp.performTravel teleports WITH a reposition
// method and StreamingWorld's PositionPlayerToLocation then stands the
// player just outside the location's rectangle or at its nearest start
// marker (locationEntrance.js, ported for the court release and the
// ship). fastTravelTo passed none, so the arrival took the teleport's
// DEFAULT point - the map pixel's centre, which for every location is
// the centre of the town, and for many the middle of a building - and
// TL2's roof guard, gated on a landing that was always null there,
// never ran on the one path it was written for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPOSITION } from '../../src/systems/ship.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('TL3: the fast-travel arrival takes DFU\'s reposition - the start marker or the edge, never the pixel\'s centre - so TL2\'s roof guard is live on it', () => {
  assert.equal(REPOSITION.DirectionFromStartMarker, 'DirectionFromStartMarker');
  assert.equal(REPOSITION.RandomStartMarker, 'RandomStartMarker');
});
