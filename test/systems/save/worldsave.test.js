// P-slice: the ABOVE-GROUND QUICKSAVE. The envelope is the dungeon's
// snapshotPlayer; the world half stores the map pixel + NATIVE world
// coordinates so a save survives every floating-origin recenter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotPlayer, restorePlayer } from '../../../src/systems/save/save.js';
import { StreamingWorldState } from '../../../src/world/streamingWorld.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT (at the merge of main into TESA): the world host read whole - its save is scenes/worldQuickSave.js's

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('worldsave: the envelope round-trips the world half and the streamer inverts natives exactly', () => {
  const entity = {
    name: 'T', level: 3, health: 20, maxHealth: 30, fatigue: 100, magicka: 10, maxMagicka: 40,
    stats: { strength: 50 }, skills: new Array(35).fill(20), items: [], spells: [],
  };
  const snap = snapshotPlayer(entity, {
    classicMinutes: 999999, readiedSpellIndex: 7, locationKey: 'world',
    world: { pixel: { x: 207, y: 213 }, nativeX: 6789012, nativeZ: 9372160, y: 379.1 },
  });
  const restored = { stats: {}, skills: [], items: [] };
  const extras = restorePlayer(restored, JSON.parse(JSON.stringify(snap)), null);
  assert.ok(extras, 'the version round-trips');
  assert.equal(extras.classicMinutes, 999999);
  assert.equal(extras.readiedSpellIndex, 7);
  assert.equal(extras.locationKey, 'world');
  assert.deepEqual(extras.world.pixel, { x: 207, y: 213 });
  assert.equal(extras.world.nativeX, 6789012);
  assert.equal(extras.world.y, 379.1);
  // the streamer's native inverse: worldCoords(localFromWorld(n)) === n,
  // under a re-origined state (the load teleports first)
  const st = new StreamingWorldState();
  st.init(207, 213);
  const [lx, lz] = st.localFromWorld(extras.world.nativeX, extras.world.nativeZ);
  const back = st.worldCoords([lx, 0, lz]);
  assert.ok(Math.abs(back.x - extras.world.nativeX) < 1e-6 && Math.abs(back.z - extras.world.nativeZ) < 1e-6,
    'localFromWorld is the exact inverse of worldCoords');
  // ...and under a RECENTERED state (nonzero compensation) - the whole
  // point of storing natives is surviving the floating origin
  st.compensation = [819.2, 3, -819.2];
  const [cx, cz] = st.localFromWorld(extras.world.nativeX, extras.world.nativeZ);
  const cback = st.worldCoords([cx, 0, cz]);
  assert.ok(Math.abs(cback.x - extras.world.nativeX) < 1e-6 && Math.abs(cback.z - extras.world.nativeZ) < 1e-6,
    'the inverse holds through compensation');
});

