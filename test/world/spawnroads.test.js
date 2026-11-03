// SPAWN-ROADS - no spawned ruin on a pixel a
// road, track, river or stream crosses. The audit of the EliteDungeons drop counted 7,547 road pixels holding a
// ruin's flattened plateau at their centre once the rate went to 40% (1,921 at 10%); every path in the network runs
// through its pixel's centre, so the pixel's own compass byte is the whole question.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pathFreePixel, spawnsDungeon, WORLD_SALT } from '../../src/world/spawnedDungeons.js';
import { MAP_W, MAP_H } from '../../src/world/road/roadNetwork.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const bytes = (name) => new Uint8Array(readFileSync(join(ROOT, 'vendor/roads-hazelnut', name)));
const blank = () => new Uint8Array(MAP_W * MAP_H);

test('SPAWN-ROADS: a pixel any path crosses stands no ruin - roads, tracks, rivers and streams alike; a bare pixel does', () => {
  const at = (x, y) => x + y * MAP_W;
  for (const kind of ['roads', 'tracks', 'rivers', 'streams']) {
    const net = { roads: blank(), tracks: blank(), rivers: blank(), streams: blank() };
    net[kind][at(10, 20)] = 128;   // N: one edge is enough
    assert.equal(pathFreePixel(net, 10, 20), false, `${kind} crosses 10,20`);
    assert.equal(pathFreePixel(net, 11, 20), true, `${kind} does not cross the pixel beside it`);
  }
  // the generated network carries no water arrays: its roads and tracks still count, the absent arrays read as no path
  const gen = { roads: blank(), tracks: blank() };
  gen.tracks[at(3, 4)] = 17;
  assert.equal(pathFreePixel(gen, 3, 4), false);
  assert.equal(pathFreePixel(gen, 4, 4), true);
  assert.equal(pathFreePixel(gen, -1, 4), true, 'off the map is no path (dataPoint\'s 0)');
});

test('SPAWN-ROADS: over the shipped Basic Roads bytes, every spawn pixel a path crosses is refused and none other', () => {
  const net = { roads: bytes('roadData.bytes'), tracks: bytes('trackData.bytes'), rivers: bytes('riverData.bytes'), streams: bytes('streamData.bytes') };
  let spawns = 0, crossed = 0, refused = 0, wrong = 0;
  for (let py = 0; py < MAP_H; py++) {
    for (let px = 0; px < MAP_W; px++) {
      if (!spawnsDungeon(WORLD_SALT, px, py)) continue;
      spawns++;
      const i = px + py * MAP_W;
      const hasPath = !!(net.roads[i] | net.tracks[i] | net.rivers[i] | net.streams[i]);
      if (hasPath) crossed++;
      if (!pathFreePixel(net, px, py)) refused++;
      if (pathFreePixel(net, px, py) === hasPath) wrong++;
    }
  }
  assert.equal(wrong, 0, 'the gate is exactly "a path crosses this pixel"');
  assert.ok(crossed > 5000, `the shipped network crosses thousands of spawn pixels (${crossed}) - the case is real`);
  assert.equal(refused, crossed);
  assert.ok(spawns - refused > 100000, 'and the rest of the world still stands its ruins');
});

