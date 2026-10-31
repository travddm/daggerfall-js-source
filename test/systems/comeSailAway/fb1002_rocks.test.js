// FIELD BUGS 2026-10-02 - ROCK-FREE. Mac, testing sailing: "ships get stuck in the world of daggerfall ocean rocks".
// Come Sail Away's CheckCollision sweeps the hull's half-beam sphere along her length (SphereCastAll); the world's host
// answered it off the collider's own sphereCastAll, Unity's SphereCastAll over a BUCKET as one collider - and a static
// bucket is a pixel's whole ground, every World of Daggerfall rock of it in one. Two traps followed:
//   - a ledge under her (a rock's shelf, its foot in the sea) overlapping her sphere where the sweep starts answered the
//     zero point - a push from the scene's origin, whatever way that lay - and cast no ray at the rest of the pixel: the
//     rock ahead went unmet, and she sailed into it;
//   - once in it, every ray met its inner walls (the collider reads both faces) and pushed her back in, for good.
// Now the host asks the collider's hullSweepAll, collider by collider as Unity's SphereCastAll answers: a bucket's parts
// are its colliders (each addMesh one - a World of Daggerfall object's MeshCollider); a part her sphere overlaps where
// the sweep starts answers once, at its overlap, where it touches (never the zero point); a part that holds her centre
// answers nothing (Unity's sweep reads no back face); every other part is met by the sweep. And in a rock field a third
// held her: the response (systems/comeSailAway/comeSailAway.js lateUpdateSailing) took her way OFF what she met as well as into it,
// so a rock astern of a ship sailing away from it held her to its push, a metre a second. The pins, each red on the
// code before - every one through the REAL modules: the collider (player/collider.js), world.js's own csaSphereCastAll
// lifted from its source, and Come Sail Away's runtime over the vendored hulls (test/csaScene.mjs):
//   A LEDGE HIDES NO ROCK - over a ledge she is held off the rock ahead where open water holds her
//   THE LEDGE ALONE       - she sails over it and off it, nothing pushing her
//   ROCK-AWAY             - what she met takes only her way into it: sailing off from a rock astern, or backing off one
//                           ahead, she keeps the way open water gives her (the C#'s response took the way off it too,
//                           and held her to its push, a metre a second, while it lay in her sweep)
//   OUT OF THE ROCK       - a hull standing inside a rock (closed, or open beneath as a rock standing in the ground is)
//                           sails out of it
//   THE SWEEP'S LAW       - hullSweepAll part by part: an overlap answered once where it touches, a pitched sweep
//                           never grazing onto it again, a holding part silent (a shared edge crossed once), a mover
//                           never holding; nothing under her keel
//   THE HOST              - her keel line handed on, an overlap beside her kept where it touches
// Moved by the record's audit (2026-10-02b, `01-Overview/bugs/Field-Bugs-2026-10-02b.md`; its own pins in
// test/systems/comeSailAway/fb1002b_rocks.test.js): the sweep is the sphere's own (no spokes, so no `pass` for them), a ledge is no rock
// by the KEEL LINE where the host had dropped an overlap "beneath" her, and each sweep reaches her own end (ROCK-REACH)
// - so the rocks of these pins stand inside her own length, and the ledge under her keel.
// `01-Overview/bugs/Field-Bugs-2026-10-02.md`.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Collider } from '../../../src/player/collider.js';
import { boxColliderTriangles } from '../../../src/world/prefabColliders.js';
import { HULL_NAMES } from '../../../src/systems/comeSailAway/comeSailAwayBoat.js';
import { hullBuild } from '../../../src/systems/naval/navalShips.js';
import { scene } from '../../csaScene.mjs';

const cut = (s, start, end = '\n  }\n') => { const i = s.indexOf(start); assert.ok(i >= 0, `lifted: ${start}`); return s.slice(i, s.indexOf(end, i) + end.length); };
const cutLine = (s, start) => { const i = s.indexOf(start); assert.ok(i >= 0, `lifted: ${start}`); return s.slice(i, s.indexOf('\n', i) + 1); };

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const SMALL_SHIP = HULL_NAMES.indexOf('Small Ship');
/** A rock as a box from min to max (prefabColliders' own box, a closed skin); `open` - no bottom faces, as a model
 *  standing in the ground has none. */
function rockMesh({ min, max, open = false }) {
  const m = boxColliderTriangles({ m_Center: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 }, m_Size: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] } });
  if (!open) return m;
  const low = (v) => m.positions[v * 3 + 1] === min[1];
  const indices = [];
  for (let i = 0; i < m.indices.length; i += 3) if (!(low(m.indices[i]) && low(m.indices[i + 1]) && low(m.indices[i + 2]))) indices.push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  return { positions: m.positions, indices };
}
/** A pixel's ground: every rock its own part (addMesh) of the one bucket a pixel's static geometry stands in. */
function pixel(rocks) {
  const col = new Collider();
  for (const r of rocks) { const m = rockMesh(r); col.addMesh('pixel', m.positions, m.indices, I); }
  return col;
}
const inside = (p, r) => p[0] > r.min[0] && p[0] < r.max[0] && p[2] > r.min[2] && p[2] < r.max[2];

/** A shelf under the sea's line 0.65 m under her keel (her collider's box's foot) - under her where she starts and
 *  running on under the rock ahead (its foot). PIN MOVED (AUDIT GALLEON, the merge with main, 2026-10-02): the Small
 *  Ship is Mac's galleon, her keel 4.64 m down where the mod's galleon's was 3.35 - at 4 m the shelf stood over it. */
const LEDGE = { min: [60, 20, 150], max: [140, 34 + hullBuild(SMALL_SHIP).keel - 0.65, 300] };
/** A rock ahead, standing out of the sea. */
const ROCK = { min: [70, 0, 280], max: [130, 80, 320] };

test('ROCK-FREE THE SWEEP\'S LAW: hullSweepAll answers part by part - an overlap once, where it touches; a pitched sweep never grazes onto it again; a part holding her centre answers nothing (its top\'s shared edge crossed once); a mover never holds; nothing wholly under her keel is met', () => {
  const o = [0, 0, 0], r = 3;
  // a ledge beneath (part 0) and a rock ahead (part 1)
  const col = pixel([{ min: [-20, -10, -20], max: [20, -2, 60] }, { min: [-5, -10, 30], max: [5, 10, 40] }]);
  const flat = col.hullSweepAll(o, r, [0, 0, 1], 30);
  assert.deepEqual(flat.filter((h) => h.start).map((h) => [h.dist, h.point.map((v) => Math.round(v * 1e9) / 1e9 + 0)]), [[0, [0, -2, 0]]], 'the ledge: once, where it touches - never the zero point');
  const ahead = flat.filter((h) => !h.start);
  assert.equal(ahead.length, 1);
  assert.ok(Math.abs(ahead[0].dist - 27) < 1e-6 && Math.abs(ahead[0].point[2] - 30) < 1e-6, `the rock's face, met by the sweep (${ahead[0].dist})`);
  // the swell pitches her sweep down: the ledge she overlaps is never met again as a rock ahead (its top 20 m on)
  const d = [0, -0.1, 1], l = Math.hypot(...d);
  const pitched = col.hullSweepAll(o, r, d.map((v) => v / l), 30).filter((h) => !h.start);
  assert.equal(pitched.length, 1);
  assert.ok(Math.abs(pitched[0].point[2] - 30) < 1e-6, `still the rock's face (${pitched[0].point.map((v) => v.toFixed(2))}), not the ledge's top grazed`);
  // a part holding her centre, its north wall in her sphere's reach (5 m off, the sphere 7) - and her centre under its
  // top's shared edge (the box's top is two faces on its diagonal, (30, -12) to (-10, 8), which crosses (0, 3): two
  // faces, one crossing) - and the same rock beyond
  const o2 = [0, 0, 3], r2 = 7, box = { min: [-10, -10, -12], max: [30, 10, 8] };
  for (const open of [false, true]) {
    const held = pixel([{ ...box, open }, { min: [-5, -10, 30], max: [5, 10, 40] }]);
    const out = held.hullSweepAll(o2, r2, [0, 0, 1], 30);
    assert.equal(out.filter((h) => h.start).length, 0, `${open ? 'open beneath' : 'closed'}: the holding part answers no overlap, its wall in reach`);
    assert.deepEqual(out.filter((h) => !h.start).map((h) => Math.round(h.dist)), [20], 'nor its inner wall (5 m on): the rock beyond is met, 27 m on less her radius');
  }
  // a rock over her - an arch's span, its underside and its top two crossings - holds her not: its overlap answers
  const arch = pixel([{ min: [-5, 2, -5], max: [5, 6, 5] }]);
  assert.deepEqual(arch.hullSweepAll(o, r, [0, 0, 1], 30).filter((h) => h.start).map((h) => h.point), [[0, 2, 0]], 'the span over her, where it touches');
  // a mover (a boat's collider, carried) holds no hull: the same box's overlap answers
  const boats = new Collider();
  const hull = rockMesh(box);
  boats.addMesh('boat', hull.positions, hull.indices, I, () => [0, 0, 0], () => [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(boats.hullSweepAll(o2, r2, [0, 0, 1], 30).filter((h) => h.start).map((h) => h.point), [[0, 0, 8]], 'a mover\'s overlap answers, where it touches');
  // the keel line (2026-10-02b): the ledge wholly under her keel is not met at all - the rock ahead is, as it was
  const keeled = col.hullSweepAll(o, r, [0, 0, 1], 30, { keelY: -1 });
  assert.deepEqual(keeled.map((h) => [h.part, Math.round(h.dist * 1e6) / 1e6]), [[1, 27]], 'the ledge (its top 1 m under her keel) unmet; the rock\'s face at 27');
  assert.equal(col.hullSweepAll(o, r, [0, 0, 1], 30, { keelY: -3 }).filter((h) => h.start).length, 1, 'a keel under the ledge\'s top: its overlap answers');
});

