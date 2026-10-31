// TERRAIN-SCALE1 + BUILD-FAIL1 (2026-09-23, Mac: "Make the best decisions and take care of the found properly") -
// two of the three things World of Daggerfall's AUDIT BRANCH found and left open, taken care of.
//
// TERRAIN-SCALE1: DaggerfallUnityGame.unity overrides the StreamingWorld prefab's TerrainScale to 1.25, and nothing
// writes it at run time, so every terrain DFU streams is MaxTerrainHeight * 1.25 tall. The port read the prefab's
// 1.5: every hill a fifth taller than DFU's. Every height consumer now reads the scene's value; every exterior height
// a save, a scene cache or an anchor carries is stamped with it, and one written before the stamp is stood again on
// today's ground as it lands. The interior cache moves to the building's own frame on the way (DFU restores an
// interior container by its localPosition), which also ends a house's floor drifting 819.2 off after a walk.
//
// BUILD-FAIL1: a pixel build that throws freed nothing it had made - its collider bucket stood on (invisible walls,
// and a rebuild appended every triangle twice), its GPU surfaces and batches leaked, its doors stayed E-targets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STREAMING_TERRAIN_SCALE, DEFAULT_TERRAIN_SCALE, MAX_TERRAIN_HEIGHT, HEIGHTMAP_DIMENSION, SCALED_OCEAN_ELEVATION } from '../../../src/world/terrain/terrainSampler.js';
import { surfaceHeightAt, buildTerrainGrid } from '../../../src/world/terrain/terrainSurface.js';
import { layoutNature } from '../../../src/world/terrain/terrainNature.js';
import { ringHeight } from '../../../src/render/farRing.js';
import { overworldHeight, OVERWORLD_RELIEF } from '../../../src/ui/overworldModel.js';
import { WOD_TERRAIN_HEIGHT_MAX } from '../../../src/world/worldOfDaggerfall/wodLocationLoader.js';
import { snapshotPlayer, restorePlayer } from '../../../src/systems/save/save.js';
import { createSceneCache, cacheScene, restoreCachedScene, snapshotSceneCache, restoreSceneCache } from '../../../src/systems/sceneCache.js';
import { makeAnchor } from '../../../src/systems/teleportAnchor.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2: the world host whole
import { recordFrame } from '../../../src/scenes/groundFrameHost.js';   // BAY-LEFT-GROUND (D5): the frame's law, its own export
import { createSwapBehind } from '../../../src/scenes/swapBehind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rd = (p) => hostText(p);
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('TERRAIN-SCALE1: the game streams at the scene\'s 1.25 - TerrainHelper\'s 1.5 is the prefab\'s default, and the scene overrides it', () => {
  assert.equal(STREAMING_TERRAIN_SCALE, 1.25, 'DaggerfallUnityGame.unity: propertyPath TerrainScale, value 1.25 on the one StreamingWorld');
  assert.equal(DEFAULT_TERRAIN_SCALE, 1.5, 'TerrainHelper.defaultTerrainScale = 1.5f - still DFU\'s constant, and the scale of every save written before the stamp');
  assert.equal(WOD_TERRAIN_HEIGHT_MAX, 1923.75, 'World of Daggerfall reads StreamingWorld.TerrainScale at run time - its author\'s commented 1539 * 1.25');
});

test('TERRAIN-SCALE1: every height the streamed world draws, collides with or stands things on reads it', () => {
  const s = new Float32Array(HEIGHTMAP_DIMENSION * HEIGHTMAP_DIMENSION).fill(0.2);
  const want = 0.2 * MAX_TERRAIN_HEIGHT * 1.25;
  near(surfaceHeightAt(s, 100, 100), want);   // what is PLACED
  near(buildTerrainGrid(s).positions[1], want);   // what is DRAWN and walked (the collider's heightAt reads the same samples by the same worldHeight)
  const grass = new Uint8Array(128 * 128).fill(2);
  near(layoutNature(s, grass, { mapPixelX: 10, mapPixelY: 10, rawWorldHeight: 128, climateType: 99, locationRect: null })[0].y, want);   // LayoutNature's terrainScale
  assert.equal(ringHeight(0), SCALED_OCEAN_ELEVATION * 1.25, 'the far ring');
  near(overworldHeight(100), (100 * 8 * 1.25 / 819.2) * OVERWORLD_RELIEF, 1e-9);
  // DEFAULT_TERRAIN_SCALE survives in src only as the legacy saves' scale
  for (const f of ['src/scenes/world.js', 'src/scenes/worldModes.js']) {
    for (const line of rd(f).split('\n').filter((l) => l.includes('DEFAULT_TERRAIN_SCALE') && !l.startsWith('import'))) {
      assert.match(line, /stamp|was|before/, `${f}: ${line.trim().slice(0, 100)}`);
    }
  }
});

test('TERRAIN-SCALE1: a save carries the scale its heights stood on; one without the stamp reads as written before it', () => {
  const snap = JSON.parse(JSON.stringify(snapshotPlayer({ items: [], stats: {} }, {})));
  assert.equal(snap.terrainScale, 1.25);
  const extras = restorePlayer({ items: [], stats: {} }, snap);
  assert.equal(extras.terrainScale, 1.25);
  const old = { ...snap };
  delete old.terrainScale;
  assert.equal(restorePlayer({ items: [], stats: {} }, old).terrainScale, null, 'a save from before the stamp: null, the prefab\'s 1.5 to the host');
  assert.equal(makeAnchor({ pixel: { x: 1, y: 2 }, nativeX: 0, nativeZ: 0, y: 5, terrainScale: 1.25 }).terrainScale, 1.25, 'an anchor carries it');
  assert.equal(makeAnchor({ pixel: { x: 1, y: 2 }, nativeX: 0, nativeZ: 0, y: 5 }).terrainScale, null);
});

/** The world host's restandHeight and scaleOf, run against a stub ground. PIN MOVED (BAY-LEFT-GROUND, D5): the law is
 *  scenes/groundFrameHost.js recordFrame, run whole - never sliced - on the Bay's pixel these pins were written for. */
function restander(ground, comp = 0, { landform = null, lift = () => 0 } = {}) {
  const state = { compensation: [0, comp, 0] };
  const heightAt = (x, z) => (ground(x, z) == null ? -Infinity : ground(x, z) + comp);
  // LANDFORM1: the law's two new reads - the row's state and the lift at a spot (test/systems/landform.test.js runs them)
  const { restandHeight, scaleOf } = recordFrame({ landform, liftAt: lift, heightAt, state, bayAt: () => true });
  return { restandHeight, scaleOf };
}

test('TERRAIN-SCALE1: a height written on the old scale stands again on today\'s ground - the same height above it where the ground is built, the ratio where it is not', () => {
  const sample = 0.3;
  const hOld = sample * MAX_TERRAIN_HEIGHT * 1.5, hNew = sample * MAX_TERRAIN_HEIGHT * 1.25;
  const { restandHeight, scaleOf } = restander((x) => (x < 1000 ? hNew : null), 37);
  near(restandHeight(hOld, 10, 10, 1.5), hNew, 1e-6);   // on the ground
  near(restandHeight(hOld + 6.5, 10, 10, 1.5), hNew + 6.5, 1e-6);   // on a roof, up a stair: the same 6.5 above
  near(restandHeight(hOld + 6.5, 5000, 10, 1.5), (hOld + 6.5) * (1.25 / 1.5), 1e-6);   // unbuilt: the ratio, exact on the ground
  assert.equal(restandHeight(123.4, 10, 10, 1.25), 123.4, 'written on today\'s scale: untouched');
  assert.equal(scaleOf(undefined), 1.5, 'no stamp: the prefab\'s');
  assert.equal(scaleOf(null), 1.5);
  assert.equal(scaleOf(1.25), 1.25);
});

test('TERRAIN-SCALE1: the scene cache keeps what it is handed - its frame, its scale, and the torches and camps the save used to drop', () => {
  const cache = createSceneCache();
  cacheScene(cache, 'S', { droppedPiles: [{ pos: [1, 2, 3], items: [] }], droppedTorches: [{ position: [4, 5, 6], time: 9, itemTemplateIndex: 247 }], camps: [{ pos: [7, 8, 9] }], frame: 'building', terrainScale: 1.25 });
  cacheScene(cache, 'L', { droppedPiles: [{ pos: [1, 2, 3], items: [] }] });
  const round = restoreSceneCache(createSceneCache(), JSON.parse(JSON.stringify(snapshotSceneCache(cache))));
  const s = restoreCachedScene(round, 'S');
  assert.equal(s.frame, 'building'); assert.equal(s.terrainScale, 1.25);
  assert.deepEqual(s.droppedTorches[0].position, [4, 5, 6], 'a torch in your house survives a load now');
  assert.deepEqual(s.camps[0].pos, [7, 8, 9]);
  const l = restoreCachedScene(round, 'L');
  assert.equal(l.frame, null); assert.equal(l.terrainScale, null, 'an entry without them reads as the old raw frame on the old scale');
  // a save written before the fields: loadable, empty arrays
  const legacy = restoreSceneCache(createSceneCache(), { permanentScenes: [], scenes: [{ sceneName: 'X', lootContainers: [], actionDoors: [], droppedPiles: [] }] });
  assert.deepEqual(restoreCachedScene(legacy, 'X').droppedTorches, []);
});

// ── BUILD-FAIL1 ─────────────────────────────────────────────────────────

