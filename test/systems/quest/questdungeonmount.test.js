// B2 (AUDIT 25 blocker 2): the DUNGEON half of the quest scene mount.
//
// AddQuestResourceObjects(SiteTypes.Dungeon) (Place.cs:511-533) and
// IsPlayerHere's dungeon arm (:539-556). The interior adapter shipped
// with Q4-v; the dungeon one did not - Persons, Items and Foes placed
// at a dungeon never stood, and PcAt never saw the player as inside
// one, which is where the majority of the quest corpus sends them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addQuestResourceObjects, markerScenePosition } from '../../../src/systems/quest/sceneMount.js';
import { SITE_TYPES } from '../../../src/systems/quest/place.js';
import { GENDERS } from '../../../src/characters/nameHelper.js';
import { hostText } from '../../hostText.mjs';   // TESA's merge (HOST-SPLIT): the quest world and the quick save moved out of bootWorld - the host read whole

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('B2: the walk stands a dungeon marker foe through standFoe, spanning RDB blocks', () => {
  const foe = {
    isFoe: true, isPerson: false, isItem: false,
    killCount: 0, spawnCount: 1, gender: GENDERS.Male, foeType: 3,
    symbol: { name: '_foe_' },
    parentQuest: { uid: 9 },
    rearmInjured() { this.rearmed = true; },
  };
  const marker = {
    dungeonX: 2, dungeonZ: 1,
    flatPosition: { x: 4, y: -1, z: 6 },
    targetResources: [foe.symbol],
  };
  const quest = {
    uid: 9,
    getPlace: () => ({ siteDetails: { selectedMarker: marker, questSpawnMarkers: null } }),
    getResource: (s) => (s === foe.symbol ? foe : null),
  };
  const machine = {
    getSiteLinks: (siteType, mapId, buildingKey) => {
      assert.equal(siteType, SITE_TYPES.Dungeon);
      assert.equal(mapId, 777);
      assert.equal(buildingKey, 0);
      return [{ questUID: 9, placeSymbol: { name: '_place_' } }];
    },
    getQuest: (uid) => (uid === 9 ? quest : null),
  };
  const stood = [];
  const adapter = {
    currentMapId: () => 777,
    findBehaviours: () => [],
    loadInProgress: () => false,
    standFoe: (a) => { stood.push(a); return null; },
  };
  addQuestResourceObjects(machine, adapter, SITE_TYPES.Dungeon, 0);
  assert.equal(stood.length, 1);
  assert.equal(stood[0].gender, 'male');
  // markerScenePosition spans blocks: dungeonX/Z * RDBSide + flatPosition
  const pos = markerScenePosition(marker);
  assert.deepEqual(stood[0].position, pos);
  assert.ok(pos.x > 100 && pos.z > 50, 'the block origin term is in the point');
  assert.equal(foe.questResourceBehaviour, stood[0].behaviour);   // addQuestFoe couples both ways
  assert.equal(foe.rearmed, true);                                // the injured trigger REARMS at placement
});

