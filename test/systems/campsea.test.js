// CAMP-SEA. Iliac Puddle No More's deep has its own population, and the land's rolls stand down
// over it (SuppressVanillaWaterEncounters sets PreventEnemySpawns in or above deep water). The lone roll honoured it; the
// port's own chunk-load CAMP roll did not: it runs on the pixel crossing, BEFORE the frame writes the flag, and the lone
// roll clears the flag at its tail - so at sea the camp roll read `false` every time and stood two to five land
// monsters at a time, in three groups, on the carved seabed. It asks the deep itself now, and a swimmer too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rollCampEncountersOnChunkLoad } from '../../src/systems/campEncounters.js';

test('CAMP-SEA: a chunk-load camp roll with the deep\'s suppression up stands nothing - and one without it stands camps', () => {
  const ctx = { inside: false, inLocationRect: false, climateIndex: 231, playerLevel: 5, gameMinutes: 600 };
  let seed = 7;
  const rolls = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);   // seeded: the same crossings both ways
  let open = 0, shut = 0;
  for (let i = 0; i < 200; i++) if (rollCampEncountersOnChunkLoad({ ...ctx, preventEnemySpawns: false }, rolls)) open++;
  for (let i = 0; i < 200; i++) if (rollCampEncountersOnChunkLoad({ ...ctx, preventEnemySpawns: true }, rolls)) shut++;
  assert.ok(open > 50, `the land's camps roll where nothing stands them down (${open}/200 crossings)`);
  assert.equal(shut, 0, 'suppressed: nothing, ever');
});

