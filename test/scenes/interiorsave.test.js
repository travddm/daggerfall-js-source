// IS1 (AUDIT 26 F221): BUILDING INTERIORS SAVE AND LOAD.
//
// DFU's law, read at the source: an inside player's save carries the
// entered exterior door array and the building discovery record
// (SerializablePlayer.cs:183-187), the load re-enters through the
// Respawner's building arm - StartBuildingInterior off
// exteriorDoors[0] (PlayerEnterExit.cs:559-567, :1022-1035) - and the
// saved position then lands RAW (RestorePosition's interior arm,
// transform.position = saved). A save whose door cannot be found
// takes the reposition arm (:615-621, "Building has no exterior
// doors. Repositioning player."). And the ONLY standing save block in
// all of DFU is mid-rappel (RappelMotor.cs:66, the sole
// RegisterPreventSaveCondition caller) - a building never prevented
// saving; the port's interior `savingPrevented: () => true` was a
// stopgap for the unbuilt serialization, not a law.
//
// The envelope half is behavioral below; the host wiring is
// SOURCE-pinned (headless cannot boot a canvas), the SAV3 shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotPlayer, restorePlayer, SAVE_VERSION } from '../../src/systems/save/save.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const mkEntity = () => ({
  name: 'Mac', gender: 'female', careerIndex: 4, level: 3, reflexes: 2,
  health: 22, maxHealth: 40, magicka: 15, maxMagicka: 30,
  startingLevelUpSkillSum: 90, currentLevelUpSkillSum: 120,
  readyToLevelUp: false, pendingLevel: null, chargenDone: true,
  stats: { strength: 55, luck: 60 },
  skills: [30, 28], skillUses: [100, 0],
  career: { name: 'Healer', hitPointsPerLevel: 8 },
  items: [], spells: [], activeEffects: [],
});

// The bag the world host composes: the door identity trio +
// buildingKey, and the discovery record with its insideOpenShop latch
// (F066's field) riding on it.
const INTERIOR = {
  door: { blockIndex: 341, recordIndex: 2, doorIndex: 1, buildingKey: 217134 },
  building: {
    buildingKey: 217134, buildingType: 9, factionId: 510, quality: 12,
    regionIndex: 17, name: 'The Odd Blades', insideOpenShop: true,
  },
};

test('IS1: the interior bag rides the envelope verbatim (opaque, like world), and a pre-IS1 save restores null', () => {
  const snap = snapshotPlayer(mkEntity(), { interior: INTERIOR });
  assert.equal(snap.v, SAVE_VERSION, 'an additive field never bumps the version (the save charter)');
  const extras = restorePlayer({}, snap);
  assert.deepEqual(extras.interior, INTERIOR, 'the bag comes back whole - identity, latch and all');
  // A save written before IS1 has no key at all: JSON round-trip of
  // the OLD literal - delete simulates the absent slot.
  const old = JSON.parse(JSON.stringify(snap));
  delete old.interior;
  assert.equal(restorePlayer({}, old).interior, null, 'absent slot reads as null, never undefined leaking');
  // ...and a host that passes nothing saves null, not a hole.
  assert.equal(snapshotPlayer(mkEntity(), {}).interior, null);
});

