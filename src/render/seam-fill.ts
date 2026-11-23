// Seams filled in a room's merged batch. Daggerfall's interior models, and the town packs that lay them out again, often
// stop a few millimetres to a few centimetres short of the face they meet: a wall's end beside another wall set a unit
// further out, a stair's side short of the shaft, a piece moved by a pack's rounding. The camera sees past the edge
// into the slit, and a line shows, black or the colour of what lies behind. Daggerfall Unity draws the same models in
// the same places and shows the same lines.
//
// The fill finds every such edge the way tools/seamCensus.mjs does: an edge of a room triangle whose every sample stands
// clear of every other triangle by more than CLEAR, and within REACH of one. It then adds a strip from the edge to its
// projection on the face nearest the edge's middle, drawn from both sides, in the edge's own picture. The strip is
// thinner than REACH, so it shows only where the slit was. Only the triangles the caller marks take part, on either
// side: a room's architecture, never its furniture. A departure from Daggerfall Unity, behind the Close interior gaps
// row (systems/interior-seams-row.ts).

import type { BatchMesh } from './crack-seal.ts';

/** An edge closer than this to another face already meets it, in metres. */
export const CLEAR = 0.0002;
/** An edge further than this from every other face stands in open space: not a slit. Two ARCH3D units and a half. */
export const REACH = 0.0625;
const CELL = 1;

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const along = (a: Vec, d: Vec, t: number): Vec => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];

/** The point of triangle a b c nearest p (Ericson, Real-Time Collision Detection 5.1.5). */
function closestOnTriangle(p: Vec, a: Vec, b: Vec, c: Vec): Vec {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return along(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return along(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return along(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const denominator = 1 / (va + vb + vc);
  return along(along(a, ab, vb * denominator), ac, vc * denominator);
}

const distance = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Fills the batch's slits, in place: each sub-mesh gains the strips of the edges of its own triangles. `takesPart`
 * answers, for a triangle (its index in the batch's index list over three), whether it is architecture. Returns how many
 * edges were filled. With `countOnly`, it counts the slits and changes nothing.
 */
export function fillSeams(
  mesh: BatchMesh,
  takesPart: (triangle: number) => boolean,
  { countOnly = false } = {},
): number {
  const triangleCount = mesh.indices.length / 3;
  const corner = (t: number, k: number): Vec => {
    const v = mesh.indices[t * 3 + k];
    return [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
  };
  // A grid of the architecture's triangles, each in every cell its box, grown by REACH, touches.
  const grid = new Map<string, number[]>();
  const parts: number[] = [];
  for (let t = 0; t < triangleCount; t++) {
    if (!takesPart(t)) continue;
    parts.push(t);
    const c = [corner(t, 0), corner(t, 1), corner(t, 2)];
    const low = [0, 1, 2].map((k) => Math.floor((Math.min(c[0][k], c[1][k], c[2][k]) - REACH) / CELL));
    const high = [0, 1, 2].map((k) => Math.floor((Math.max(c[0][k], c[1][k], c[2][k]) + REACH) / CELL));
    for (let x = low[0]; x <= high[0]; x++) {
      for (let y = low[1]; y <= high[1]; y++) {
        for (let z = low[2]; z <= high[2]; z++) {
          const key = `${x},${y},${z}`;
          const list = grid.get(key);
          if (list) list.push(t);
          else grid.set(key, [t]);
        }
      }
    }
  }
  /** The nearest other triangle to p and how far it stands. */
  const nearest = (p: Vec, own: number): [number, number] => {
    let best = Infinity;
    let which = -1;
    const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)},${Math.floor(p[2] / CELL)}`;
    for (const t of grid.get(key) ?? []) {
      if (t === own) continue;
      const d = distance(p, closestOnTriangle(p, corner(t, 0), corner(t, 1), corner(t, 2)));
      if (d < best) {
        best = d;
        which = t;
      }
    }
    return [best, which];
  };

  const positions = Array.from(mesh.positions);
  const normals = Array.from(mesh.normals);
  const uvs = Array.from(mesh.uvs);
  const added = mesh.subMeshes.map(() => [] as number[]);
  const subMeshOf = (t: number): number =>
    mesh.subMeshes.findIndex((s) => t * 3 >= s.startIndex && t * 3 < s.startIndex + s.primitiveCount * 3);
  const seen = new Set<string>();
  let filled = 0;
  for (const t of parts) {
    for (let e = 0; e < 3; e++) {
      const ia = mesh.indices[t * 3 + e];
      const ib = mesh.indices[t * 3 + ((e + 1) % 3)];
      const a = corner(t, e);
      const b = corner(t, (e + 1) % 3);
      if (distance(a, b) < CLEAR) continue;
      const key = [a, b]
        .map((p) => p.map((v) => Math.round(v * 1e4)).join(','))
        .sort()
        .join('|');
      if (seen.has(key)) continue;
      // Clear of every other face, and near one, at a quarter, the middle and three quarters.
      const samples = [0.25, 0.5, 0.75].map((s) => nearest(along(a, sub(b, a), s), t));
      if (samples.some(([d]) => d <= CLEAR || d > REACH)) continue;
      seen.add(key);
      if (countOnly) {
        filled++;
        continue;
      }
      // The strip runs to the plane of the face nearest the middle.
      const partner = samples[1][1];
      const p0 = corner(partner, 0);
      const normal = cross(sub(corner(partner, 1), p0), sub(corner(partner, 2), p0));
      const length = Math.hypot(...normal);
      if (length < 1e-12) continue;
      const n: Vec = [normal[0] / length, normal[1] / length, normal[2] / length];
      const onPlane = (p: Vec): Vec => along(p, n, -dot(sub(p, p0), n));
      const a2 = onPlane(a);
      const b2 = onPlane(b);
      if (distance(a, a2) > REACH * 1.5 || distance(b, b2) > REACH * 1.5) continue;
      // Four new corners: the edge's own two again, and their two on the plane, each with its edge corner's normal
      // and texture place, so the strip continues the picture the edge ends.
      const base = positions.length / 3;
      for (const [p, source] of [
        [a, ia],
        [b, ib],
        [b2, ib],
        [a2, ia],
      ] as Array<[Vec, number]>) {
        positions.push(p[0], p[1], p[2]);
        normals.push(normals[source * 3], normals[source * 3 + 1], normals[source * 3 + 2]);
        uvs.push(uvs[source * 2], uvs[source * 2 + 1]);
      }
      const list = added[subMeshOf(t)];
      // both windings: the strip is seen from the room on whichever side it faces
      list.push(base, base + 1, base + 2, base, base + 2, base + 3);
      list.push(base, base + 2, base + 1, base, base + 3, base + 2);
      filled++;
    }
  }
  if (!filled || countOnly) return filled;
  const indices: number[] = [];
  mesh.subMeshes.forEach((s, i) => {
    const start = indices.length;
    for (let k = 0; k < s.primitiveCount * 3; k++) indices.push(mesh.indices[s.startIndex + k]);
    indices.push(...added[i]);
    s.startIndex = start;
    s.primitiveCount = (indices.length - start) / 3;
  });
  mesh.positions = new Float32Array(positions);
  mesh.normals = new Float32Array(normals);
  mesh.uvs = new Float32Array(uvs);
  mesh.indices = new Uint32Array(indices);
  return filled;
}
