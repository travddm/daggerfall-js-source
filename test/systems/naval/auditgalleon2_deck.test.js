// AUDIT GALLEON-2 (2026-10-03) - HER DECK AND HER CREW, AGAIN: the second audit's deck lens over the new galleon (hull 2,
// the Small Ship) and every hull beside her - DK1 a shut cover stood on, DK2 the leash on a piece of two levels, DK3 her
// doors, DK4 the mod's galleon's count, TS9 a flight climbed square - each pinned over the real code: her deck baked by
// the real pool (test/navalSea.mjs) off her own colliders, world.js's leash lifted whole (the suites' own way,
// test/systems/naval/auditgalleon_deck.test.js), the naval host's own aboard(), and a pool whose new galleon will not load.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDeck, deckOf as deckGrid, intoDeck, outOfDeck, mainLevel, DECK_STEP, DECK_HEADROOM } from '../../../src/systems/naval/navalDeck.js';
import { Boat, spawnBoat, HULL_NAMES } from '../../../src/systems/comeSailAway/comeSailAwayBoat.js';
import { colliderPoses, boxColliderTriangles, invertAffine, BUILTIN_COLLIDER_MESHES } from '../../../src/world/prefabColliders.js';
import { multiply } from '../../../src/world/mat4.js';
import { CAPSULE_RADIUS } from '../../../src/player/motor.js';
import { MELEE_DISTANCE } from '../../../src/characters/enemy/enemyMotor.js';
import * as ships from '../../../src/systems/naval/navalShips.js';
import { createComeSailAwayPool } from '../../../src/scenes/comeSailAway/comeSailAwayPool.js';
import { MODELS, ctxFor, modCtxFor } from '../../csaScene.mjs';
import { sea, readyPool, modShipsPool } from '../../navalSea.mjs';

const { hullBuild, HULL } = ships;
const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const geometry = (c) => (c.m_Mesh?.mesh ? MODELS.geometry(c.m_Mesh.mesh) : c.m_Mesh?.builtin ? BUILTIN_COLLIDER_MESHES[c.m_Mesh.builtin] : null);
/** A hull stood at rest - her colliders, her mesh node's frame. */
const standing = (hull, variant = 0) => { const b = new Boat(hull, variant); spawnBoat(b, ctxFor({ position: [0, 0, 0], rotation: [0, 0, 0, 1] })); return b; };
/** SHIPS-2: a hull stood as the mod built it - hull 4 the mod's own Carrack, the game's when the new carrack's model will
 *  not load (test/navalSea.mjs modShipsPool): her cargo doors, her forecastle's stair and her five doors, the laws
 *  below were found on and still hold her. */
const standingMod = (hull, variant = 0) => { const b = new Boat(hull, variant); spawnBoat(b, modCtxFor({ position: [0, 0, 0], rotation: [0, 0, 0, 1] })); return b; };
/** A deck's cells' centres, `[x, y, z]` in her frame. */
const cellsOf = (d) => { const out = []; for (let j = 0; j < d.y.length; j++) if (!Number.isNaN(d.y[j])) { const i = j % d.nx, k = (j - i) / d.nx; out.push([d.minX + (i + 0.5) * d.cell, d.y[j], d.minZ + (k + 0.5) * d.cell]); } return out; };
const fmt = (p) => p.map((v) => v.toFixed(2)).join(', ');

// ── her own faces, for the probes (test/systems/naval/auditgalleon_deck.test.js's own) ──────────────────────────────────────────

const KEY = (i, k) => i * 4096 + k;
const bucketed = (faces) => {
  const map = new Map();
  for (const f of faces) for (let i = Math.floor(f.x0); i <= Math.floor(f.x1); i++) for (let k = Math.floor(f.z0); k <= Math.floor(f.z1); k++) { const key = KEY(i, k); if (!map.has(key)) map.set(key, []); map.get(key).push(f); }
  return map;
};
/** Her colliders' faces in her deck's frame (at rest; a classic model's cpu triangles aside): `floors` every face with a
 *  height at a point (`up` an upward one within 30 degrees of level), `walls` the near-vertical ones, each bucketed by
 *  the metre; `moves` whether the face is a part's that opens and shuts (a DoorTrigger under its node - the pool's own
 *  mark). `geo` reads a collider's triangles (the suites' models unless asked). */
function facesOf(hull, boat = standing(hull), geo = geometry) {
  const frame = invertAffine(boat.MeshObject.worldMatrix());
  const walls = [], floors = [];
  for (const { node, collider: c, world } of colliderPoses(boat.GameObject)) {
    if (c.m_IsTrigger || c.m_Enabled === false) continue;
    const g = c.type === 'BoxCollider' ? boxColliderTriangles(c) : geo(c);
    if (!g) continue;
    const moves = !!node?.children?.some((k) => k.name === 'DoorTrigger');
    const m = multiply(frame, world, new Float32Array(16)), p = g.positions, ix = g.indices;
    const at = (i) => [m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12], m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13], m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14]];
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const [ax, ay, az] = at(ix[t] * 3), [bx, by, bz] = at(ix[t + 1] * 3), [cx, cy, cz] = at(ix[t + 2] * 3);
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx, len = Math.hypot(nX, nY, nZ);
      if (!(len > 1e-12)) continue;
      const f = { ax, ay, az, bx, by, bz, cx, cy, cz, moves, name: node?.name ?? '', x0: Math.min(ax, bx, cx), x1: Math.max(ax, bx, cx), y0: Math.min(ay, by, cy), y1: Math.max(ay, by, cy), z0: Math.min(az, bz, cz), z1: Math.max(az, bz, cz), up: nY > Math.cos(Math.PI / 6) * len };
      if (Math.abs(nY) < 0.05 * len) { walls.push(f); continue; }
      f.det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(f.det) > 1e-12) floors.push(f);
    }
  }
  return { boat, walls: bucketed(walls), floors: bucketed(floors) };
}
/** Her parts that open and shut (a DoorTrigger under the node - the pool's own mark), each one's box in her deck's frame. */
function leavesOf(boat) {
  const frame = invertAffine(boat.MeshObject.worldMatrix()), out = [];
  for (const { node, collider: c, world } of colliderPoses(boat.GameObject)) {
    if (c.m_IsTrigger || c.m_Enabled === false || !node?.children?.some((k) => k.name === 'DoorTrigger')) continue;
    const g = c.type === 'BoxCollider' ? boxColliderTriangles(c) : geometry(c);
    if (!g) continue;
    const m = multiply(frame, world, new Float32Array(16)), p = g.positions, box = { name: node.name, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (let i = 0; i < p.length; i += 3) {
      const x = m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12], y = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13], z = m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14];
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); box.z0 = Math.min(box.z0, z); box.z1 = Math.max(box.z1, z);
    }
    out.push(box);
  }
  return out;
}
const heightOn = (f, x, z) => {
  if (x < f.x0 - 1e-9 || x > f.x1 + 1e-9 || z < f.z0 - 1e-9 || z > f.z1 + 1e-9) return NaN;
  const l1 = ((f.bz - f.cz) * (x - f.cx) + (f.cx - f.bx) * (z - f.cz)) / f.det, l2 = ((f.cz - f.az) * (x - f.cx) + (f.ax - f.cx) * (z - f.cz)) / f.det, l3 = 1 - l1 - l2;
  return l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9 ? NaN : l1 * f.ay + l2 * f.by + l3 * f.cy;
};
/** Every face of hers with a height at `(x, z)`: `[y, face]`. */
const heightsAt = (F, x, z) => { const out = []; for (const f of F.floors.get(KEY(Math.floor(x), Math.floor(z))) ?? []) { const y = heightOn(f, x, z); if (!Number.isNaN(y)) out.push([y, f]); } return out; };
const segD = (px, pz, x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz; let s = L2 ? ((px - x0) * dx + (pz - z0) * dz) / L2 : 0; s = Math.max(0, Math.min(1, s)); return Math.hypot(px - x0 - s * dx, pz - z0 - s * dz); };
/** Whether a wall of hers standing in `(lo, hi)` lies within `r` of `(x, z)` - `fixed` her fixed walls alone (a door's
 *  leaf, which opens, left out). */
const wallWithin = (F, x, z, lo, hi, r, fixed = false) => {
  for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) for (let k = Math.floor(z - r); k <= Math.floor(z + r); k++) {
    for (const w of F.walls.get(KEY(i, k)) ?? []) {
      if ((fixed && w.moves) || !(w.y1 > lo && w.y0 < hi) || x < w.x0 - r || x > w.x1 + r || z < w.z0 - r || z > w.z1 + r) continue;
      if (Math.min(segD(x, z, w.ax, w.az, w.bx, w.bz), segD(x, z, w.bx, w.bz, w.cx, w.cz), segD(x, z, w.cx, w.cz, w.ax, w.az)) < r) return true;
    }
  }
  return false;
};
/** Where a body stands on her at `(x, z)` - an upward face of hers under it with a head's room clear over it and no wall
 *  of hers in the body's band within its capsule's radius - each such floor's height. */
const standable = (F, x, z) => {
  const hs = heightsAt(F, x, z), out = [];
  for (const [y, f] of hs) {
    if (!f.up || hs.some(([o]) => o > y + 1e-3 && o < y + DECK_HEADROOM)) continue;
    if (wallWithin(F, x, z, y + DECK_STEP, y + DECK_HEADROOM, CAPSULE_RADIUS)) continue;
    out.push(y);
  }
  return out;
};

// ── DK2: the leash on a piece of two levels ───────────────────────────────────────────────────────────────────────

test('AUDIT GALLEON-2 DK2: NEVER ONTO ANOTHER PIECE\'S FLOOR, WITHIN A FLIGHT\'S RISE OR PAST IT - two pieces of a deck beside each other across a 0.8 m ledge and no tread (past the motors\' step, within FLIGHT_JOIN): a body on either pressed over the ledge is put back on its own piece\'s edge at its own level, never stepped up or down onto the other (AUDIT GN-D1\'s law: the leash\'s threshold alone would let it) (mutants: any piece\'s floor in the cell, the piece filter unread, her open deck read in every piece)', () => {
  const P = [], I = [];
  const quad = (a, b, c, e) => { const n = P.length / 3; P.push(...a, ...b, ...c, ...e); I.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  quad([-4, 0, -3], [-4, 0, 3], [0, 0, 3], [0, 0, -3]);   // her deck at 0
  quad([0, 0.8, -3], [0, 0.8, 3], [3, 0.8, 3], [3, 0.8, -3]);   // a platform 0.8 m up beside it
  quad([0, 0, -3], [0, 0.8, -3], [0, 0.8, 3], [0, 0, 3]);   // the ledge's face
  const d = buildDeck([{ positions: Float64Array.from(P), indices: Uint32Array.from(I) }], { minX: -4, maxX: 3, minZ: -3, maxZ: 3 }, { inset: 0 });
  const low = d.pieceAt(-2, 0, 0), high = d.pieceAt(1.5, 0, 0.8);
  assert.ok(low === 0 && high > 0, `her deck her open piece, the platform a piece of its own (${low}, ${high})`);
  const boat = { hull: 0, GameObject: { activeSelf: true }, MeshObject: { worldMatrix: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
});

// ── DK1: a shut cover stood on ────────────────────────────────────────────────────────────────────────────────────

// ── DK3: her doors ────────────────────────────────────────────────────────────────────────────────────────────────

test('AUDIT GALLEON-2 DK3: HER DOORS ARE WAYS IN - a door\'s leaf is baked a wall as it stands shut (D7), so the cells of its doorway and her deck\'s margin either side were no floor to the leash, and no boarder went through any door of hers: one chasing a player in the new galleon\'s great cabin stood 4.59 m off him at her castle\'s front; now the floor under each doorway a leaf alone walls, and her margin either side of it, are baked beside her deck (`ajar`) - the leash lets a body through (the motor\'s collider holds a shut door) and, pressed off one, puts it back on the floor of the room it came from; her deck itself the bake it was - her great cabin a piece of its own, her walk, her spots and her crew never through a door (mutants: the doorways unbaked, a leaf unmarked, a leaf no wall, the margin unbaked, the room a body came from unread, its band unread)', async () => {
  const pool = await readyPool();
  const d = pool.deckOf(HULL.SmallShip, 0), boat = standing(HULL.SmallShip), main = mainLevel(d);
  const mod = await modShipsPool();
  // her deck the bake it was: her great cabin a piece of its own, her castle's doorway no deck, her walk never in
  assert.ok(d.pieceAt(0, -14, main) > 0, 'her great cabin a piece of its own');
  assert.equal(d.walkable(0, -10.4), false, 'her castle\'s doorway no deck');
});

// ── TS9: a flight climbed square ──────────────────────────────────────────────────────────────────────────────────

test('AUDIT GALLEON-2 TS9: A FLIGHT IS CLIMBED SQUARE, AND A STRAIGHT LINE UP IT IS ONE LEG - a walk steps over a flight\'s riser side to side, never across a corner (`steps`), and its corners are cut along a straight line up a flight that stays on it (`lineOnDeck` reads the flights): the diagonal over a riser allowed and the line blind to the flights both survived every suite (mutants: the corner step over a riser, the line blind to a flight)', () => {
  const nx = 7, nz = 9, N = nx * nz;
  // a flight four cells wide (i 1..4), its rows k 1..7 rising 0.6 m a row - past the motors' step, within a flight's - each
  // row joined to the next by its tread (bit 2: a cell's +z side)
  const y = new Float32Array(N).fill(NaN), flights = new Uint8Array(N);
  for (let k = 1; k <= 7; k++) for (let i = 1; i <= 4; i++) { y[k * nx + i] = 0.6 * (k - 1); if (k < 7) flights[k * nx + i] |= 2; }
  const d = deckGrid({ cell: 0.5, minX: 0, minZ: 0, nx, nz, y, flights });
  // a walk straight up it: one leg, every riser a tread's
  const up = d.path([1.25, 0.75], [1.25, 3.25]);
  assert.ok(up && up.length === 2, `up the flight from (2, 1) to (2, 6) in one leg: ${up?.map(fmt).join(' | ')}`);
  assert.ok(Math.abs(up[1][1] - 3) < 1e-6, 'onto the sixth row, 3 m up');
  // a straight line through a riser's corner (from (1, 1) to (4, 6), the corner at (3, 4)) is no leg: a body there would
  // step across a riser at a corner
  const corner = d.path([0.75, 0.75], [2.25, 3.25]);
  assert.ok(corner && corner.length > 2, `through a riser's corner, more than one leg: ${corner?.map(fmt).join(' | ')}`);
  // a diagonal over a riser is no step: (1, 1) at 0, the two beside it toward (2, 2) at 0.3, (2, 2) 0.85 up - its corner
  // a flight's rise past the motors' step, no tread to it from either side: no walk
  const y2 = new Float32Array(16).fill(NaN);
  y2[5] = 0; y2[6] = 0.3; y2[9] = 0.3; y2[10] = 0.85;
  const d2 = deckGrid({ cell: 0.5, minX: 0, minZ: 0, nx: 4, nz: 4, y: y2, flights: new Uint8Array(16) });
  assert.equal(d2.path([0.75, 0.75], [1.25, 1.25]), null, 'no walk across a riser\'s corner');
});

// ── the mod's galleon (her model would not load) ──────────────────────────────────────────────────────────────────

/** A pool whose new galleon will not load: hull 2 the mod's own galleon (test/systems/naval/auditgalleon_guns.test.js G4's own). */
async function fallbackPool() {
  const failing = async (url) => {
    if (String(url).includes('galleon.json')) return { ok: false, status: 404, json: async () => null, arrayBuffer: async () => null };
    const { fileURLToPath } = await import('node:url');
    const bytes = readFileSync(fileURLToPath(url));
    return { ok: true, json: async () => JSON.parse(bytes.toString('utf8')), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
  };
  const renderer = { createMesh: (m) => ({ model: m, buffers: [{}, {}], bounds: [0, 0, 0, 0], subMeshes: m.subMeshes.map((s) => ({ ...s, _bounds: [0, 0, 0, 0] })) }), drawMesh() {}, updateMeshVertices() {}, createBillboardBatch: () => ({}), destroyBillboardBatch() {}, destroyMesh() {} };
  const pipeline = { getTexture: async () => ({ recordCount: 100, getSize: () => ({ width: 40, height: 64 }), getScale: () => ({ width: 0, height: 0 }) }), uploadRecord() {}, getGpuMesh: async (id) => ({ classic: id }) };
  const pool = createComeSailAwayPool({ renderer, pipeline, fetchFn: failing, log: { warn() {} } });
  assert.equal(await pool.preload(), true);
  assert.equal(pool.models.galleon, false, 'her model missing: hull 2 is the mod\'s own galleon');
  return pool;
}

test('AUDIT GALLEON-2 DK2 and DK4: THE MOD\'S GALLEON - where the new galleon will not load, hull 2 is the mod\'s own galleon on her own build (MOD_SMALL_SHIP_BUILD): her deck 727 cells (the D-wall comment said 714 -> 750, measured over the new galleon\'s extent; 690 -> 727 over her own), and the walk everywhere never set off its floor (43 of her 19880 walks were, 6.77 <-> 8.84-9.40 under her forecastle) (mutants: as DK2\'s)', async () => {
  assert.notEqual(hullBuild(HULL.SmallShip), ships.MOD_SMALL_SHIP_BUILD, 'standing again: hers');
});
