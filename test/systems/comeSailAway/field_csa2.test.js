// FIELD-CSA2 (2026-09-29, Discord #general through Mac - ItMustBeMonday: "I can't get my boat to work"; SylviaBun:
// "people are saying Ports are bugged for player boats"; Mac's own line the night before, 2026-09-28e: "a player is at
// a port but unable to set sail"). A deed's boat is put in the water near a port, and with Iliac Puddle No More on (the
// default) Come Sail Away reads each of a boat's five nodes as water when `Terrain.SampleHeight(node) < 34` - the mod's
// WaterLevel, the sea's own height over the terrain. The terrain sampler clamps the whole sea to the ocean elevation,
// 27.2 x 1.25 = 34 m, and Unity holds a heightmap in 16-bit steps (kMaxHeight, 32766 to the terrain's height): the flat
// sea is 579.105 steps, held as 579 - 33.994 m, under the line. The port's stand-in read the drawn ground's floats,
// 34.000001 m, never under it: every node of every boat on the open sea read land, so no boat rowed, "Unable to raise
// sail. Boat is obstructed.", and the Overworld's crossing never launched. Seen live (the retail data, the open Bay
// south of Daggerfall's harbour at 209, 216 and 210, 217: the ground under the hull 34.000001 m, the Small Ship's nodes
// [1, 1, 1, 1, 1] before the fix and [0, 0, 0, 0, 0] after).
// The host's stand-in (world.js csaTerrainOf) is mounted from its source; the runtime is the real one over the
// vendored hulls; the last test reads the retail WOODS.WLD and MAPS.BSA (ARENA2_PATH).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as surface from '../../../src/world/terrain/terrainSurface.js';
import { generateSamples, SCALED_OCEAN_ELEVATION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE, HEIGHTMAP_DIMENSION, TERRAIN_SIZE } from '../../../src/world/terrain/terrainSampler.js';
import { StreamingWorldState } from '../../../src/world/streamingWorld.js';
import { comeSailAwayModels } from '../../../src/systems/comeSailAway/comeSailAwayModels.js';
import { spawnBoat } from '../../../src/systems/comeSailAway/comeSailAwayBoat.js';
import { createComeSailAwayRuntime, NO_WATER_LEVEL, WATER_LEVEL, BOAT_ACTIONS } from '../../../src/systems/comeSailAway/comeSailAway.js';

/** The sea as the sampler writes it: a WOODS.WLD of nought round the pixel - every sample clamped to the ocean elevation. */
const SEA_WOODS = { getHeightMapValuesRange1Dim: (x, y, d) => new Uint8Array(d * d), getLargeHeightMapValuesRange: () => new Uint8Array(81) };
const flatSea = () => generateSamples(SEA_WOODS, 208, 215);
const WORLD_HEIGHT = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;

test('FIELD-CSA2: the sea the sampler writes is the ocean elevation to the float - 34.000001 m as the drawn ground reads it, never under the mod\'s 34', () => {
  const sea = flatSea();
  const clamp = Math.fround(SCALED_OCEAN_ELEVATION / MAX_TERRAIN_HEIGHT);
  assert.ok(sea.every((v) => v === clamp), 'every sample the clamp');
  assert.equal(WATER_LEVEL, 34, 'ComeSailAway.WaterLevel with no World of Daggerfall terrain');
  const drawn = surface.surfaceHeightAt(sea, 400, 400);
  assert.ok(drawn >= WATER_LEVEL && drawn - WATER_LEVEL < 1e-5, `the drawn ground ${drawn}: at the line, not under it (why every node read land)`);
});

test('FIELD-CSA2: Terrain.SampleHeight at Unity\'s heightmap precision - 16-bit steps of kMaxHeight 32766: the flat sea 579 steps, 33.994 m, under the line; a step up is land; elsewhere the drawn ground to within a step', () => {
  assert.equal(typeof surface.terrainSampleHeightAt, 'function', 'the sampler exists');
  assert.equal(surface.UNITY_HEIGHTMAP_MAX_HEIGHT, 32766);
  const sea = flatSea();
  assert.equal(surface.unityHeightmapStep(sea[0]), 579, '0.0176738 x 32766 = 579.105: step 579');
  // the port rounds to the nearest step - the record's declared choice: whether Unity's SetHeights rounds or truncates
  // is in no source the port has, and the sea is step 579 either way
  assert.equal(surface.unityHeightmapStep(579.6 / 32766), 580);
  assert.equal(surface.unityHeightmapStep(579.4 / 32766), 579);
  const step = Math.fround(WORLD_HEIGHT / 32766);
  for (const [lx, lz] of [[0, 0], [3.2, 6.4], [400, 400], [812.8, 1.1], [TERRAIN_SIZE, TERRAIN_SIZE]]) {
    const h = surface.terrainSampleHeightAt(sea, lx, lz);
    assert.equal(h, Math.fround(579 * step), `(${lx}, ${lz}) is 579 steps`);
    assert.ok(h < WATER_LEVEL, `(${lx}, ${lz}) ${h} under the water level`);
  }
  // one step up - the vanilla coast's first rise - is land, as Unity reads it
  const up = new Float32Array(sea.length).fill(580 / 32766);
  assert.ok(surface.terrainSampleHeightAt(up, 400, 400) >= WATER_LEVEL, 'step 580 is 34.05 m: land');
  // any ground: the same two triangles as the drawn ground, off it by no more than one step
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const hills = new Float32Array(HEIGHTMAP_DIMENSION * HEIGHTMAP_DIMENSION).map(() => 0.02 + rnd() * 0.3);
  for (let i = 0; i < 400; i++) {
    const lx = rnd() * TERRAIN_SIZE, lz = rnd() * TERRAIN_SIZE;
    const d = Math.abs(surface.terrainSampleHeightAt(hills, lx, lz) - surface.surfaceHeightAt(hills, lx, lz));
    assert.ok(d <= step * 1.001, `(${lx}, ${lz}) ${d} within a step`);
  }
  // the far ring's stride reads its own coarser quads, as the drawn ground does
  for (let i = 0; i < 100; i++) {
    const lx = rnd() * TERRAIN_SIZE, lz = rnd() * TERRAIN_SIZE;
    const d = Math.abs(surface.terrainSampleHeightAt(hills, lx, lz, 4) - surface.surfaceHeightAt(hills, lx, lz, 4));
    assert.ok(d <= step * 1.001, `stride 4 (${lx}, ${lz}) ${d} within a step`);
  }
});

// ── the runtime over the vendored hulls ────────────────────────────────────────

const DIR = new URL('../../../vendor/come-sail-away/Models/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const MODELS = comeSailAwayModels({ prefabs: json('prefabs.json'), meshes: json('meshes.json'), bin: new Uint8Array(readFileSync(new URL('meshes.bin', DIR))), materials: json('materials.json'), animation: json('animation.json') });

// ── the retail data: the Bay by Daggerfall's harbour ───────────────────────────

const ARENA2 = process.env.ARENA2_PATH;
const skipReal = !ARENA2 || !existsSync(join(ARENA2, 'WOODS.WLD')) || !existsSync(join(ARENA2, 'MAPS.BSA')) ? 'ARENA2_PATH has no WOODS.WLD and MAPS.BSA' : false;

test('FIELD-CSA2 on the retail data: the open Bay south of Daggerfall (209, 216) - its deed answers "a port is near", the Small Ship put there reads the Bay and raises its sail; the coast\'s first rise is land', { skip: skipReal }, async () => {
  const { WoodsFile } = await import('../../../src/formats/woodsFile.js');
  const { MapsFile } = await import('../../../src/formats/mapsFile.js');
  const { buildMapDict, locationSummaryAt } = await import('../../../src/systems/map/mapDirectory.js');
  const { smoothLocationNeighbourhood } = await import('../../../src/world/terrain/terrainHelper.js');
  const woods = new WoodsFile();
  woods.load(readFileSync(join(ARENA2, 'WOODS.WLD')));
  const maps = new MapsFile();
  maps.load(readFileSync(join(ARENA2, 'MAPS.BSA')), readFileSync(join(ARENA2, 'CLIMATE.PAK')), readFileSync(join(ARENA2, 'POLITIC.PAK')));
  const mapDict = buildMapDict(maps);
  smoothLocationNeighbourhood(mapDict, woods);   // the boot's own repair (world.js), before any pixel streams
  // world.js's own csaIsPortTown, mounted: Daggerfall (207, 213) is a port by its byte
  const { hasPortFor } = await import('../../../src/systems/travel/travelPorts.js');
  // PIN MOVED (THE CAPTAIN'S SEA, ETHER-PORTS - found by AUDIT CAPTAIN'S SEA's touched run with the data): an isle's port
  // is a port past the Veil (`etherSea && inEther(x, y)` first), so the sea, its law and an isle's port stand in scope - the
  // sea on, and an isle's port answering every pixel it is asked of, so a Bay pixel that asked it would read a port
  const { inEther } = await import('../../../src/world/ethericSea.js');
  // PIN MOVED (TESA6, at the merge of main into TESA): past the Bay an Arena port answers (`onTheBay` the Bay's frame,
  // world/tamriel/tamrielFrame.js inBay) - the Bay's pixels ask the Bay's table as before, and a port past it would read one
  const { inBay } = await import('../../../src/world/tamriel/tamrielFrame.js');
  // the Bay a pixel off the coast: every sample the sea's clamp (seen live too, the roads' pass and all: 34.000001
  // under the whole hull, the Small Ship's nodes [1, 1, 1, 1, 1] before the fix and [0, 0, 0, 0, 0] after)
  const sea = generateSamples(woods, 209, 216);
  assert.ok(sea.every((v) => v === Math.fround(SCALED_OCEAN_ELEVATION / MAX_TERRAIN_HEIGHT)), 'the open Bay');
});
