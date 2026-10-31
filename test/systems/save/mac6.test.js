// MAC6 (Mac, 2026-09-12: "A bug. 1. When playing online it doesnt place
// you where you last saved your account"). #1: THE DUNGEON SAVE COMES
// HOME. A save taken inside a world-hosted dungeon is the dungeon
// host's own envelope - keyed dungeon:<id>, a dungeon-local position,
// no map pixel - and the world host's boot load (the Load door and the
// Online door alike) answered it with "(saved elsewhere - character
// restored; travel there yourself)" and left the player at the start
// cell. DFU's load respawns at the save's own map pixel and re-enters
// the dungeon BEFORE it restores the position - RespawnPlayer's
// insideDungeon arm (PlayerEnterExit.cs:534-537: TeleportToCoordinates,
// GetLocation, StartDungeonInterior) then RestorePosition
// (SerializablePlayer.cs:441-454) - off worldPosX/worldPosZ saved
// beside insideDungeon (:215-217). THE ARM EXECUTES: the envelope
// carries `dungeon` (the pixel and map id) and hands it back; a save
// from before it did is found by its id across the locations; the
// dungeon host's load arm is split so the world host can hand it an
// envelope it already restored, without a second session restore; the
// mode machine forwards with the key route's own position applier;
// the boot's load arm teleports, enters, and restores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotPlayer, restorePlayer, dungeonPixelFor } from '../../../src/systems/save/save.js';

const rd = (p) => readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');

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

test('MAC6 #1: the envelope carries where the dungeon stands - `dungeon` {pixel, mapId} rides snapshotPlayer beside the interior half and comes back out of restorePlayer; a save from before it reads null; the finder resolves an old save by its dungeon id across the locations, through the host\'s pixel law, and answers null for anything else', () => {
  const dungeon = { pixel: { x: 109, y: 158 }, mapId: 187 };
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(mkEntity(), { position: [1, 2, 3], locationKey: 'dungeon:1234', dungeon })));
  assert.deepEqual(snap.dungeon, dungeon, 'PlayerPositionData_v1.worldPosX/worldPosZ beside insideDungeon (SerializablePlayer.cs:215-217)');
  const extras = restorePlayer(mkEntity(), snap, null);
  assert.deepEqual(extras.dungeon, dungeon, 'and the boot load reads it back');
  assert.equal(extras.locationKey, 'dungeon:1234');
  const old = JSON.parse(JSON.stringify(snap)); delete old.dungeon;
  assert.equal(restorePlayer(mkEntity(), old, null).dungeon, null, 'a save from before the field: null, never undefined');
  assert.equal(snapshotPlayer(mkEntity(), { locationKey: 'world' }).dungeon, null, 'anywhere but a dungeon: null');
  // the finder, for the old save: the dungeon's own record id, the host's pixel law injected
  const loc = (id, longitude, latitude, hasDungeon = true) => ({ hasDungeon, dungeon: { recordElement: { header: { locationId: id } } }, mapTableData: { longitude, latitude } });
  const toPixel = (mt) => ({ x: mt.longitude, y: mt.latitude });
  const locations = [loc(7, 1, 2), loc(1234, 5, 6, false), { hasDungeon: true, dungeon: null, mapTableData: { longitude: 0, latitude: 0 } }, { ...loc(1234, 3, 4), mapTableData: null }, loc(1234, 109, 158)];   // AUDIT WORLD D5: the decoys sit BEFORE the match, so every guard is walked
  assert.deepEqual(dungeonPixelFor('dungeon:1234', locations, toPixel), { x: 109, y: 158 }, 'found by id, a location with no dungeon skipped');
  assert.equal(dungeonPixelFor('dungeon:99', locations, toPixel), null, 'no such dungeon');
  assert.equal(dungeonPixelFor('world', locations, toPixel), null, 'not a dungeon key');
  assert.equal(dungeonPixelFor('dungeon:probe', locations, toPixel), null, 'the probe\'s key names no id');
  assert.equal(dungeonPixelFor(null, locations, toPixel), null);
  assert.equal(dungeonPixelFor('dungeon:1234', null, toPixel), null, 'no locations to walk');
  let walked = 0;
  const lazy = { *[Symbol.iterator]() { walked++; yield loc(1234, 3, 4); walked++; yield loc(5, 9, 9); } };
  assert.deepEqual(dungeonPixelFor('dungeon:1234', lazy, toPixel), { x: 3, y: 4 });
  assert.equal(walked, 1, 'any iterable, and the walk stops at the first match');
});

