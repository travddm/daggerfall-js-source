// SEA-RISE. An over-encumbered swimmer sinks - DFU's own rule
// (LevitateMotor.Update :83-85), which Iliac Puddle No More's forged water level carries to the sea - and three things
// the port owns turned that into a loop: the online respawn searched only the death's own region, and the open sea's
// (politic 64, region 31) holds no temple, town or graveyard, so the player rose on the seafloor where they fell;
// the sea's breath ran on under an open pack, so dropping the loot drowned them; and the autorun latch survived the
// respawn, walking them back into the water. None is DFU's: the respawn is the port's own (D-ONLINE1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearestSafeLocation, nearestSafeLocationAnywhere } from '../../src/systems/deathRespawn.js';
import { LOCATION_TYPES, longitudeLatitudeToMapPixel } from '../../src/formats/mapsFile.js';
import { PlayerMotor } from '../../src/player/motor.js';
import { Collider } from '../../src/player/collider.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** A map-table row whose pixel is (x, y): the inverse of longitudeLatitudeToMapPixel (x = lon/128, y = 499 - lat/128). */
const row = (x, y, locationType) => {
  const r = { longitude: x * 128 + 64, latitude: (499 - y) * 128 + 64, locationType, dungeonType: 0 };
  const px = longitudeLatitudeToMapPixel(r.longitude, r.latitude);
  assert.deepEqual([px.x, px.y], [x, y], 'the fixture row stands on its pixel');
  return r;
};
/** A MapsFile's region seam: autoDiscard's one resident, and its _lastRegion. */
function fakeMaps(tables) {
  const loads = [];
  return {
    loads, _lastRegion: 5, regionCount: tables.length,
    getRegion(r) { loads.push(r); this._lastRegion = r; return { mapTable: tables[r] }; },
    loadRegion(r) { loads.push(`back:${r}`); this._lastRegion = r; return true; },
  };
}

test('SEA-RISE: a death whose region holds no safe place rises at the nearest one in ANY region, and the region resident before is put back', () => {
  const sea = [row(100, 100, LOCATION_TYPES.Coven)];   // the sea's table: a crux, a mooring - nothing to wake at
  const far = [row(300, 300, LOCATION_TYPES.TownCity)];
  const near = [row(110, 104, LOCATION_TYPES.ReligionTemple), row(90, 100, 99)];
  const px = { x: 100, y: 100 };
  assert.equal(nearestSafeLocation(sea, px), null, 'the sea region alone answers none - the old fallback stood them on the seafloor');
  const maps = fakeMaps([far, sea, near]);
  const got = nearestSafeLocationAnywhere(maps, px);
  assert.equal(got.kind, 'temple');
  assert.deepEqual(got.mapPixel, { x: 110, y: 104 }, 'the nearest across every region');
  assert.deepEqual(maps.loads, [0, 1, 2, 'back:5'], 'one sweep, and the resident region put back');
  assert.equal(nearestSafeLocationAnywhere(fakeMaps([sea, sea]), px), null, 'no region with one: null, and the caller keeps its fallback');
  assert.equal(nearestSafeLocationAnywhere(null, px), null);
});

test('SEA-RISE: a player raised from death does not come up running - the respawn drops the autorun latch, as a held MoveBackwards does', () => {
  const col = new Collider(() => 0);
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  col.addMesh('floor', [-40, 0, -40, 40, 0, -40, 40, 0, 40, -40, 0, 40], [0, 1, 2, 0, 2, 3], I);
  const m = new PlayerMotor(col);
  m.spawn(0, 0.05, 0);
  const still = (over = {}) => ({ forward: 0, strafe: 0, run: false, jump: false, up: false, down: false, autoRun: false, back: false, sneak: false, ...over });
  for (let f = 0; f < 40; f++) m.update(1 / 60, still(), 0);
  m.update(1 / 60, still({ autoRun: true }), 0);
  assert.equal(m.toggleAutorun, true, 'the press latches');
  assert.equal(m.isRunning, true);
  m.update(1 / 60, still(), 0);
  m.stopAutorun();
  m.update(1 / 60, still(), 0);
  assert.equal(m.toggleAutorun, false, 'the latch is down');
  assert.equal(m.isRunning, false, 'and the run it forced goes with it');
  m.update(1 / 60, still({ autoRun: true }), 0);
  assert.equal(m.toggleAutorun, true, 'one press latches it again');
});

