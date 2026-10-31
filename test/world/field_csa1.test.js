// FIELD-CSA1 (2026-09-28, Discord, Julian: "in my case w the large deed specifically - first attempt just didn't spawn
// in the boat and the deed disappeared. i could hear ocean bout sounds as if i was on a boat in the background. lost the
// boat forever. second attempt, spawned in a large boat deed. it spawned in after a delay but i got killed by an ocean
// mob before i could climb onto it. also lost that boat forever after respawning"). The runtime's halves - the seabed
// hit floated, the sea plane held to the ray's reach, every boat riding every recentre, OnWorldReanchored - are pinned
// in csa_placing.test.js. This pins the host's: StreamingWorldState.init's own record of the move it made
// (`initOffset`), and world.js's csaReanchor - mounted from its source - called by _teleportToPixel after the init, so
// the respawn's teleport carries a placed boat by the frame's own move and it keeps its natives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StreamingWorldState } from '../../src/world/streamingWorld.js';

test('FIELD-CSA1: StreamingWorldState.init records the move it made of every scene point - a point carried by it keeps its natives across any init, the vertical untouched', () => {
  const state = new StreamingWorldState(3);
  assert.deepEqual(state.initOffset, [0, 0, 0], 'none before the first');
  state.init(100, 200);
  // the player swam two pixels east of where the world was last inited, and once crossed a mountain
  state.update([819.2 * 1.5, 30, 400]);
  state.update([819.2 * 1.5, 30, 400]);
  assert.deepEqual(state.current, { x: 102, y: 200 });
  state.compensation[1] = -501;
  for (const [px, py] of [[62, 180], [62, 180], [400, 10], [102, 200]]) {
    const boat = [300.5, 34 - 501, 612.25];
    const natives = state.worldCoords(boat);
    state.init(px, py);
    for (let k = 0; k < 3; k++) boat[k] += state.initOffset[k];
    const now = state.worldCoords(boat);
    assert.ok(Math.abs(now.x - natives.x) < 1e-6 && Math.abs(now.z - natives.z) < 1e-6, `to ${px},${py}: the boat keeps its natives (${now.x}, ${now.z} vs ${natives.x}, ${natives.z})`);
    assert.equal(state.initOffset[1], 0, 'the vertical compensation survives init: nothing to carry up or down');
    assert.equal(state.compensation[1], -501);
  }
});

