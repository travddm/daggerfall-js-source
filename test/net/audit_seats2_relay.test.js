// AUDIT SEATS-2 - THE RELAY'S LANE, what outlived the siege works' cut: the Throne's seconds never outrun the wire's bound
// (R3). `06-Systems/Online-Arc.md` AUDIT SEATS-2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIEGE_UNITS_PER_M, siegeFieldFrame, SIEGE_THRONE, newBattle, fieldOf } from '../../src/net/siege/siegeRef.js';
import { validSiegeOut } from '../../src/net/wire.js';

const M = SIEGE_UNITS_PER_M, SB = 1_800_000_000, T = SB * 1000;
const SF = [[0, 40], [40, 0], [-40, 0], [0, -20], [0, -40], [0, 80], [0, -60]].map(([x, z]) => [x * M, z * M]);

test('AUDIT SEATS-2 R3: the Throne\'s seconds are held to its hold, so a late beat\'s last frame still passes the wire (mutant: the clamp)', () => {
  const b = newBattle({ kind: 'siege', tier: 'crown', startMs: T, endMs: T + 2700_000, field: fieldOf(SF, 'crown') });
  b.throne = SIEGE_THRONE.crown.holdS + 1.5;
  const f = siegeFieldFrame(b, [1, 1, 0]);
  assert.equal(f.th, SIEGE_THRONE.crown.holdS);
  assert.ok(validSiegeOut({ t: 'siege', ...f }), 'the final frame reaches the screens');
});
