// AUDIT SEATS-2 - THE CLIENT'S LANE: the seat
// halls known late (C1), a fallen one's fall kept (C2), no battle drawn for the dead or a tab out of the seat (C4), the
// board's Hall of Records read after the board closed shown over nothing (C5), a Charter Room chest pressed by a visitor
// says whose it is (C6). `06-Systems/Online-Arc.md` AUDIT SEATS-2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldSiege, SIEGE_STATE_EMPTY } from '../../../src/net/siege/siegeLink.js';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const T = 1_800_000_000_000;
const F = { k: 'f', b: [[2, 0, 0], [2, 0, 0], [2, 0, 0], [2, 0, 0]], th: 0, s: T, e: T + 2_700_000, n: [2, 1, 0] };
const G = (id, o = {}) => [id, 1, 360, 360, 0, 0, 0, 0, 0, 0].map((v, i) => (o[i] !== undefined ? o[i] : v));

test('AUDIT SEATS-2 C2: a fallen one still down in the next second\'s frame keeps when (and where) it fell - its fall is played once, not each second; one that rises takes the frame\'s (mutant: the frame\'s moment over the fall\'s)', () => {
  let s = foldSiege(SIEGE_STATE_EMPTY, { ...F, np: [G('n0')] }, T);
  s = foldSiege(s, { k: 'fell', id: 'n0', by: 'att-0001' }, T + 1200);
  const fellAt = s.npcs[0].at;
  assert.equal(s.npcs[0].down, true);
  for (const t of [T + 2000, T + 3000, T + 4000]) {
    s = foldSiege(s, { ...F, np: [G('n0', { 2: 0, 8: 1 })] }, t);
    assert.equal(s.npcs[0].at, fellAt, `still the fall's moment at ${t - T}`);
    assert.equal(s.npcs[0].down, true);
  }
  s = foldSiege(s, { ...F, np: [G('n0', { 8: 0 })] }, T + 5000);
  assert.deepEqual([s.npcs[0].down, s.npcs[0].at], [false, T + 5000], 'risen: the frame\'s moment');
});

