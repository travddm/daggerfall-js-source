// MAC6. #1: THE DUNGEON SAVE COMES
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
// carries `dungeon` (the pixel and map id) and hands it back; the
// dungeon host's load arm is split so the world host can hand it an
// envelope it already restored, without a second session restore; the
// mode machine forwards with the key route's own position applier;
// the boot's load arm teleports, enters, and restores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotPlayer, restorePlayer } from '../../../src/systems/save/save.js';

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

test('MAC6 #1: the envelope carries where the dungeon stands - `dungeon` {pixel, mapId} rides snapshotPlayer beside the interior half and comes back out of restorePlayer; an envelope without it reads null', () => {
  const dungeon = { pixel: { x: 109, y: 158 }, mapId: 187 };
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(mkEntity(), { position: [1, 2, 3], locationKey: 'dungeon:1234', dungeon })));
  assert.deepEqual(snap.dungeon, dungeon, 'PlayerPositionData_v1.worldPosX/worldPosZ beside insideDungeon (SerializablePlayer.cs:215-217)');
  const extras = restorePlayer(mkEntity(), snap, null);
  assert.deepEqual(extras.dungeon, dungeon, 'and the boot load reads it back');
  assert.equal(extras.locationKey, 'dungeon:1234');
  const old = JSON.parse(JSON.stringify(snap)); delete old.dungeon;
  assert.equal(restorePlayer(mkEntity(), old, null).dungeon, null, 'an envelope without the field: null, never undefined');
  assert.equal(snapshotPlayer(mkEntity(), { locationKey: 'world' }).dungeon, null, 'anywhere but a dungeon: null');
});

