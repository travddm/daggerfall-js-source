// BOUNTY-ROCK (FIELD BUGS 2026-10-03, Flylight on Discord: "Bounty packs can spawn inside rocks" - an Orc Warlord pack's
// mark on a World of Daggerfall rock face). The open-ground stand (_standCampEncounter: a bounty's pack, a camp, an
// Overworld band) put its anchor on the TERRAIN's floor and its members round it by the ring law; under a rock the
// terrain is still there, and from inside one the ring's ray meets its inner walls and its open-space test sees no face
// near - so the pack stood inside the rock. Now a spot inside static solid is refused: the collider's own point-in-solid
// (partsHolding's odd count of crossings straight up, ROCK-FREE's), the real collider, and the stand lifted from
// world.js's own source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Collider } from '../../../src/player/collider.js';
import { boxColliderTriangles } from '../../../src/world/prefabColliders.js';
import { partyGroupMembers } from '../../../src/systems/party/partyScale.js';
import { PACK_SPACING, PACK_ALERT_RADIUS } from '../../../src/systems/campEncounters.js';

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** A rock as a box (prefabColliders' own closed skin); `open` - no bottom faces, as a model standing in the ground has. */
function rockMesh({ min, max, open = false }) {
  const m = boxColliderTriangles({ m_Center: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 }, m_Size: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] } });
  if (!open) return m;
  const low = (v) => m.positions[v * 3 + 1] === min[1];
  const indices = [];
  for (let i = 0; i < m.indices.length; i += 3) if (!(low(m.indices[i]) && low(m.indices[i + 1]) && low(m.indices[i + 2]))) indices.push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  return { positions: m.positions, indices };
}
const pixel = (rocks) => { const col = new Collider(); for (const r of rocks) { const m = rockMesh(r); col.addMesh('pixel', m.positions, m.indices, I); } return col; };

test('BOUNTY-ROCK insideSolid: a point in a rock - closed, or open beneath as one standing in the ground - is inside; beside it, over it, or under an arch it is not; a moving bucket (a boat\'s) holds nothing (mutants: the line\'s parity; movers counted)', () => {
  const ROCK = { min: [100, -5, 100], max: [400, 180, 400] };   // a field's rock, 300 m across, its foot in the ground
  for (const open of [false, true]) {
    const col = pixel([{ ...ROCK, open }]);
    assert.equal(col.insideSolid([250, 0.5, 250]), true, `${open ? 'open beneath' : 'closed'}: the middle of it, at the ground`);
    assert.equal(col.insideSolid([101, 0.5, 399]), true, 'by its edge, still in it');
    assert.equal(col.insideSolid([99, 0.5, 250]), false, 'a metre off its face');
    assert.equal(col.insideSolid([250, 181, 250]), false, 'on top of it');
  }
  // an arch: a slab overhead, open ground beneath it - two skins crossed, an even count
  const arch = pixel([{ min: [0, 20, 0], max: [50, 30, 50] }]);
  assert.equal(arch.insideSolid([25, 0.5, 25]), false, 'under an arch is open ground');
  // a mover's bucket (a ship) never holds a spawn point out
  const boats = new Collider();
  const hull = rockMesh({ min: [-10, -5, -10], max: [10, 10, 10] });
  boats.addMesh('boat', hull.positions, hull.indices, I, () => [0, 0, 0], () => [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(boats.insideSolid([0, 0, 0]), false);
  assert.equal(new Collider().insideSolid([0, 0, 0]), false, 'no geometry, nothing inside');
});

// ---- the stand, lifted from world.js (the auditbounty1 / auditpscale1 mount) ----
const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const mount = (src, scope, tail) => { const k = Object.keys(scope); return new Function(...k, `${src}\n${tail}`)(...k.map((x) => scope[x])); };
function balanced(text, from, open = '(', close = ')') {
  let depth = 0;
  for (let i = text.indexOf(open, from); i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(from, i + 1);
  }
  throw new Error('unbalanced');
}

