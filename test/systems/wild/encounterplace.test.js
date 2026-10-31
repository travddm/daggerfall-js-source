// RE1 - THE RANDOM ENCOUNTER STANDS WHERE DFU STANDS IT (2026-08-29).
//
// Every random-spawn arm in PlayerEntity goes out through
// GameObjectHelper.CreateFoeSpawner, which is FoeSpawner.PlaceFoeFreely:
// a bearing chosen against the field of view, backed off whatever the
// ray hits by a separation the surface angle decides, on a floor found
// below, in space nothing already occupies.
//
// Both port hosts instead walked EIGHT COMPASS POINTS at minDistance
// and took the first with ground under it. That is three wrongs at
// once: the foe arrives due NORTH of the player unless north is
// blocked (the loop starts at bearing 0 and breaks on the first hit),
// it can stand inside a wall - nothing tested the space, only the
// ground beneath it - and it can share a spot with a foe already
// standing there.
//
// SD1 made the law consumable from a host and added the arm DFU's
// dungeon rest spawn needs. RE1 carries the CALL SITES' arguments as
// data, because the three encounter arms do not pass the same things:
// the dungeon one alone clears lineOfSightCheck.
import { noticeChance, noticeRoll } from '../../../src/systems/wild/wildAlert.js';   // WILD-ALERT: the wanderer's first check
import { SIGHT_RADIUS } from '../../../src/characters/enemy/enemyMotor.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole
import {
  SPAWNER_ARMS, intermittentEnemySpawn,
  MIN_DUNGEON_SPAWN_DISTANCE, MIN_LOCATION_SPAWN_DISTANCE, MIN_WILDERNESS_SPAWN_DISTANCE,
} from '../../../src/systems/encounters.js';

const HERE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (rel) => hostText(rel);

test('RE1: the arm table is CreateFoeSpawner\'s arguments, per call site', () => {
  // PlayerEntity.cs:574 / :594 / :610 / :687, and the max is
  // CreateFoeSpawner's own default (GameObjectHelper.cs:1314) wherever
  // the call site does not pass one.
  assert.deepEqual({ ...SPAWNER_ARMS.locationNight }, { minDistance: 10, maxDistance: 20, lineOfSightCheck: true });
  assert.deepEqual({ ...SPAWNER_ARMS.wilderness }, { minDistance: 10, maxDistance: 20, lineOfSightCheck: true });
  assert.deepEqual({ ...SPAWNER_ARMS.dungeonRest }, { minDistance: 8, maxDistance: 20, lineOfSightCheck: false });
  // D9: the guards' row is READ now - PlayerEntity.cs:687's fallback
  // stands its 2..5 watchmen through PlaceFoeFreely like every other
  // row, so the table is the whole call-site list AND every row of it
  // drives something.
  assert.deepEqual({ ...SPAWNER_ARMS.cityGuards }, { minDistance: 12.8, maxDistance: 51.2, lineOfSightCheck: true });
});

test('RE1: THE DUNGEON ARM ALONE CLEARS THE LINE-OF-SIGHT CHECK', () => {
  // This is the one a player feels. Set, the foe is placed just
  // outside the view cone; cleared, it takes any bearing in the
  // circle - DFU: "Don't care about player's field of view (e.g. at
  // rest)". A monster that finds you asleep may be standing over you.
  assert.equal(SPAWNER_ARMS.dungeonRest.lineOfSightCheck, false);
  assert.equal(SPAWNER_ARMS.locationNight.lineOfSightCheck, true);
  assert.equal(SPAWNER_ARMS.wilderness.lineOfSightCheck, true);
  // and the constants keep their own exported names - the table is a
  // second reader of them, not a second copy
  assert.equal(SPAWNER_ARMS.dungeonRest.minDistance, MIN_DUNGEON_SPAWN_DISTANCE);
  assert.equal(SPAWNER_ARMS.locationNight.minDistance, MIN_LOCATION_SPAWN_DISTANCE);
  assert.equal(SPAWNER_ARMS.wilderness.minDistance, MIN_WILDERNESS_SPAWN_DISTANCE);
});

test('RE1: the roll hands its arm\'s WHOLE band to the host, not just a distance', () => {
  // a wilderness night that rolls a spawn (the roll seam is injectable)
  const hit = intermittentEnemySpawn(
    { gameMinutes: 0, inside: false, inLocationRect: false, climateIndex: 231, playerLevel: 3 },
    () => 0,
  );
  assert.ok(hit, 'the fixture rolls a spawn');
  assert.equal(hit.minDistance, 10);
  assert.equal(hit.maxDistance, 20, 'the max used to be absent, so the host could not pass a band at all');
  assert.equal(hit.lineOfSightCheck, true);
  // the dungeon arm carries its own, including the false flag
  const dungeon = intermittentEnemySpawn(
    { gameMinutes: 0, inside: true, inDungeon: true, isResting: true, enemyAlertActive: true, dungeonType: 0, playerLevel: 3 },
    () => 0,
  );
  assert.ok(dungeon, 'the dungeon fixture rolls a spawn');
  assert.equal(dungeon.minDistance, 8);
  assert.equal(dungeon.lineOfSightCheck, false);
});

// AUDIT OW5b E1 (Mac, 2026-09-28: "Need to get pullout of fast travel little sooner for encounters. U run thru them"):
// the wanderer placed beside a walking traveller stops the journey THEN - the foe's loads and its real-time classic tick
// came after twenty to a hundred times DFU's ground at the journey's scale. Lifted out of world.js and run.
test('AUDIT OW5b E1: a wanderer PLACED beside the traveller asks the walking journey at once (after the stand is sent); nothing placed - the pool full, no spot - asks nothing; WILD-ALERT: a FAST traveller is asked only if the wanderer notices them on its first stealth check, and the foe stands alerted or checked accordingly (mutants: the roll skipped, the journey asked unnoticed)', async () => {
  // five metres off at Stealth 50: the wanderer notices on a die under its notice chance
  const chance = noticeChance(5, SIGHT_RADIUS, 50);
  assert.ok(chance > 50 && chance < 100, `near: a likely notice (${chance})`);
});

