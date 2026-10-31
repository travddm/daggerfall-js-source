// FIELD BUGS 2026-09-29h (BOUNTY-LAIR) - "Bounty targets can spawn in inaccessible parts of dungeons" (a door between
// two torches, and the automap's small room the corridor never reaches).
//
// A dungeon hunt's pack stands round an anchor 25 to 90 metres from the hunter (BOUNTY1). The anchor was any of the
// dungeon's own foes - and a foe stands at every enemy marker of every block (RDBLayout's 199.15/16), in sealed rooms,
// under water and past doors held beyond any pick, none of which the game ever asks a player to reach. Daggerfall's own
// answer to "a target in this dungeon" is the QUEST SPAWN MARKER (199.11): EnumerateDungeonQuestMarkers (Place.cs:1522)
// collects them and a quest's foe is stood at one (markerScenePosition). The lair is one of those now, and a foe's place
// only in a dungeon that has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dungeonQuestSpawnSpots } from '../../src/systems/quest/place.js';

/** A laid-out block as world/rdbLayout.js hands it (archive-199 markers carry no archive; a treasure flat its 216). */
const block = (originX, originZ, markers) => ({ originX, originZ, layout: { markers } });

test('BOUNTY-LAIR: the quest spawn markers, in the scene\'s frame - 199.11 alone, under each block\'s origin', () => {
  const blocks = [
    block(0, 0, [
      { record: 11, x: 3, y: -1, z: 4 },          // a quest spawn marker
      { record: 16, x: 9, y: -1, z: 9 },          // a fixed enemy - where a foe stands, not a quest
      { record: 15, x: 7, y: -1, z: 7 },          // a random enemy
      { record: 18, x: 5, y: -1, z: 5 },          // a quest ITEM marker - an item's place, not a foe's
      { record: 10, x: 1, y: 0, z: 1 },           // the start marker
      { record: 11, archive: 216, x: 2, y: 0, z: 2 },   // a treasure flat sharing the record's number (AUDIT 39 #19)
    ]),
    block(51.2, -51.2, [{ record: 11, x: 1, y: -2, z: 2 }]),
  ];
  assert.deepEqual(dungeonQuestSpawnSpots(blocks), [[3, -1, 4], [52.2, -2, -49.2]]);
  assert.deepEqual(dungeonQuestSpawnSpots(null), [], 'no dungeon, no spots');
});

const pool = (foeFeet, spots) => ({
  collider: {}, spawnLooseFoe: async () => ({ entity: {} }),
  foes: foeFeet.map((f) => ({ ai: { feet: f } })),
  ...(spots ? { questSpawnSpots: () => spots } : {}),
});

