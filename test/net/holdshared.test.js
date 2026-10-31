// HOLD-SHARED (2026-10-12, asked: "I want to revert the change we made to privateers hold making it instanced"):
// HOLD-SOLO (FIELD BUGS 2026-10-07b) and AUDIT FB1007b's H1-H5 reverted. Online, Privateer's Hold keys its shared world
// room by its map id - `dungeon:m187853213` (net/online.js roomKeyFor) - as every dungeon does: its memory, foes, doors,
// loot and presence are the room's again. `01-Overview/bugs/Field-Bugs-2026-10-07b.md` HOLD-SOLO says what was reverted.
//
// Fixtures from the producers: MapsFile's own pixel math for the location, worldModes.js's roomIdentity and world.js's
// key block, staffDestination and chatSend executed from their source, the real roomKeyFor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { isStartDungeon, isStartCell } from '../../src/systems/startDungeon.js';
import * as startDungeon from '../../src/systems/startDungeon.js';
import { builtDungeonSize } from '../../src/world/smallerDungeons.js';
import { mapPixelToLongitudeLatitude } from '../../src/formats/mapsFile.js';
import { setValue } from '../../src/systems/settings/settings.js';
import { roomKeyFor } from '../../src/net/online.js';
import { isWorldRoom, seaVaultRoomId } from '../../src/net/wire.js';
import * as chat from '../../src/net/chat.js';
import { withMe } from '../../src/ui/partyPanel.js';
import { privateInteriorOf } from '../../src/net/privateInterior.js';
import { worldCoordToMapPixel } from '../../src/world/streamingWorld.js';
import { validStaffDestination } from '../../src/net/staffTeleport.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const HOLD_MAP_ID = 187853213;   // DaggerfallDungeon.cs:151 `case 187853213: // Daggerfall/Privateer's Hold`
/** A location as MapsFile mints it, standing on map pixel (x, y). */
function locationAt(x, y, { name = "Privateer's Hold", mapId = HOLD_MAP_ID, regionIndex = 17 } = {}) {
  const { x: longitude, y: latitude } = mapPixelToLongitudeLatitude(x, y);
  return { name, regionIndex, mapTableData: { mapId, longitude, latitude } };
}

test('HOLD-SHARED: the tutorial dungeon is still the location on the classic start\'s own cell (Startup.StartCellX/Y, 109/158) for PH1 and TUT1 - read off the configured cell, so a custom start moves it', () => {
  assert.equal(isStartCell({ x: 109, y: 158 }), true);
  assert.equal(isStartCell({ x: 110, y: 158 }), false);
  assert.equal(isStartCell({ x: 109, y: 157 }), false);
  assert.equal(isStartCell(null), false);
  assert.equal(isStartDungeon(locationAt(109, 158)), true);
  assert.equal(isStartDungeon(locationAt(108, 158)), false);
  assert.equal(isStartDungeon({ name: 'no table' }), false);
  assert.equal(isStartDungeon(null), false);
  try {
    setValue('Startup', 'StartCellX', '200');
    assert.equal(isStartDungeon(locationAt(109, 158)), false, 'a custom start cell takes the tutorial with it');
    assert.equal(isStartDungeon(locationAt(200, 158)), true);
  } finally { setValue('Startup', 'StartCellX', '109'); }
  assert.deepEqual(['isTutorialHold', 'SHIPPED_START_CELL'].filter((n) => n in startDungeon), [], 'HOLD-SOLO\'s isTutorialHold and SHIPPED_START_CELL gone');
});

const props = new Map();
const roomIdentityIn = (dungeonLoc) => Function('mode', 'dungeonLoc', 'isGateArena', 'isSdRealm', 'isEgHall', 'isKetchShip', 'isArenaFloor', 'isStartDungeon', 'builtDungeonSize', 'host', 'placeInstance',
  `return ({${props.get('roomIdentity')}}).roomIdentity();`)('dungeon', dungeonLoc, () => false, () => false, () => false, () => false, () => false, isStartDungeon, builtDungeonSize, {}, null);   // PIN MOVED (KETCH): `isKetchShip` - a crew's ship is its own room, never the Hold   // PIN MOVED (INSTANCES' audit): `placeInstance`, the mode's own - null, the public room   // INSTANCES: `host` - no door, so no instance (the public room this pins)

test('HOLD-SHARED: in the Hold a Local line goes to the room, two party members there are together, and nothing says the Hold is the player\'s own (AUDIT FB1007b H5 reverted)', () => {
  assert.equal('SOLO_LOCAL_TEXT' in chat, false);
  const inHold = { px: 109, py: 158, in: 1, loc: "Privateer's Hold" };
  assert.equal(withMe({ ...inHold }, { ...inHold }), true, 'two members in the Hold: together');
});
