import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nearestSafeLocation, respawnFlavorText, respawnHealth, RESPAWN_HEALTH_FRACTION } from '../../src/systems/deathRespawn.js';
import { LOCATION_TYPES, DUNGEON_TYPES, longitudeLatitudeToMapPixel } from '../../src/formats/mapsFile.js';

// ═══ D-ONLINE1: ONLINE, A DEATH RESPAWNS INSTEAD OF ENDING THE RUN ══
//
// Mac, 2026-09-17 ("daggerfalljsWildlifeSpawnsRespawn"; players: "when
// i die i just end up at the title menu", "still see you have died
// then main menu", "you should just respawn in this case"): in online
// play the death sequence still plays, and then, instead of the death
// video and the title menu, the player wakes at the nearest temple,
// town or graveyard - or, dead underground, on the dungeon's own door
// - with half their health and a line saying so. F11 on the death
// screen respawns too where it used to quickload. Offline is untouched.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
/** A map-table row at a map pixel: the reader's own lon/lat encoding, inverted. */
const at = (x, y, locationType, dungeonType = DUNGEON_TYPES.NoDungeon) => ({ longitude: x * 128, latitude: (499 - y) * 128, locationType, dungeonType });

test('D-ONLINE1: nearestSafeLocation picks the closest temple, town (city, hamlet or village) or CEMETERY graveyard by map-pixel distance, and ignores everything else', () => {
  const table = [
    at(10, 10, LOCATION_TYPES.Tavern),                                   // not safe
    at(12, 10, LOCATION_TYPES.DungeonLabyrinth),                         // not safe
    at(11, 10, LOCATION_TYPES.Graveyard, DUNGEON_TYPES.Crypt ?? 0),      // a graveyard that is NOT the small cemetery
    at(20, 10, LOCATION_TYPES.ReligionTemple),
    at(10, 16, LOCATION_TYPES.TownVillage),
    null,
    at(10, 14, LOCATION_TYPES.Graveyard, DUNGEON_TYPES.Cemetery),
  ];
  assert.deepEqual(longitudeLatitudeToMapPixel(table[6].longitude, table[6].latitude), { x: 10, y: 14 }, 'the fixture inverts the reader\'s own mapping');
  const pick = nearestSafeLocation(table, { x: 10, y: 10 });
  assert.deepEqual(pick, { kind: 'graveyard', locationIndex: 6, mapPixel: { x: 10, y: 14 } }, 'four pixels south: the cemetery, past the tavern, the dungeon and the crypt-graveyard next door');
  assert.equal(nearestSafeLocation(table, { x: 19, y: 10 }).kind, 'temple');
  assert.equal(nearestSafeLocation(table, { x: 10, y: 17 }).kind, 'city', 'a village is a town');
  assert.equal(nearestSafeLocation([at(0, 0, LOCATION_TYPES.TownHamlet)], { x: 5, y: 5 }).kind, 'city', 'so is a hamlet');
  assert.equal(nearestSafeLocation([at(0, 0, LOCATION_TYPES.Tavern), at(1, 1, LOCATION_TYPES.DungeonKeep)], { x: 0, y: 0 }), null, 'a region with none of the three: null, not a throw');
  assert.equal(nearestSafeLocation(null, { x: 0, y: 0 }), null);
});

test('D-ONLINE1: half health back, never none; one flavour line per kind, the pick pinned by the roll, an unknown kind falling to the city\'s', () => {
  assert.equal(RESPAWN_HEALTH_FRACTION, 0.5);
  assert.equal(respawnHealth(50), 25);
  assert.equal(respawnHealth(51), 25, 'floored');
  assert.equal(respawnHealth(1), 1, 'never zero - they have to be able to walk away');
  assert.equal(respawnHealth(0), 1);
  assert.equal(respawnHealth(undefined), 1);
  for (const kind of ['temple', 'city', 'graveyard', 'dungeon']) {
    const a = respawnFlavorText(kind, () => 0), b = respawnFlavorText(kind, () => 0.999);
    assert.ok(typeof a === 'string' && a.length > 20 && a !== b, `${kind}: two lines, the roll picks`);
  }
  assert.match(respawnFlavorText('temple', () => 0), /temple/i);
  assert.match(respawnFlavorText('dungeon', () => 0), /dungeon door/i);
  assert.equal(respawnFlavorText('nowhere', () => 0), respawnFlavorText('city', () => 0), 'an unknown kind reads as the city');
  assert.equal(respawnFlavorText('city', () => 1), respawnFlavorText('city', () => 0.999), 'a roll of exactly 1 stays in the pool');
});

// ── MAC-D3 (Seanobi on Discord, 2026-09-21: "stuck in an infinite
// deathloop. Instant death after respawning") ────────────────────────
test('MAC-D3: a respawn answers a LIVING number for any maxHealth, and the loop that needs a dead player mid-flight cannot form', async () => {
  const { respawnHealth, RESPAWN_HEALTH_FRACTION } = await import('../../src/systems/deathRespawn.js');
  assert.equal(RESPAWN_HEALTH_FRACTION, 0.5);
  assert.equal(respawnHealth(50), 25, 'half, as it always was');
  // A NaN health is neither alive (health > 0 false) nor dead
  // (health <= 0 false), so a player carrying one stands up with a bar
  // no comparison can satisfy. Math.max(1, NaN) is NaN, which is how
  // it used to get out of here.
  for (const bad of [0, -5, NaN, undefined, null, 'x']) {
    const h = respawnHealth(bad);
    assert.ok(Number.isFinite(h) && h >= 1, `maxHealth ${String(bad)} -> ${h}: alive, and a number`);
  }

  // THE LOOP ITSELF. The heal used to be the LAST line of the async
  // arm, after `await _teleportToPixel` and after forceExitToExterior
  // had torn the death screen down. The frame loop only holds off
  // raising death while a DeathScreen is up, so every frame of that
  // await saw a dead player and no screen: death, reset, respawn,
  // death - and a teleport loads a map pixel, so under the lag spike
  // Seanobi reported the window is many frames wide.
  const { readFileSync } = await import('node:fs');

});
