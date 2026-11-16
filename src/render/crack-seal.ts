// Daggerfall's models meet without sharing vertices: a floor face's corner often lies partway along the next face's
// edge (a T-junction), and two placements' corners can stand a hair apart. The rasterizer leaves single-pixel gaps
// along such seams, and the frame's background shows through them as dots. This seals a merged batch once, as it is
// built: corners within a centimetre take one position, and a triangle with another vertex lying on one of its edges is
// split there, so both sides of every seam share their vertices. Nothing moves further than the weld distance, and the
// split triangles keep their own texture mapping, so only the gaps change.

/** A merged batch, as render/staticBatch.js makes it. */
export type BatchMesh = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  subMeshes: Array<{ startIndex: number; primitiveCount: number }>;
};

/** Corners closer than this take one position, in world units (metres). */
export const WELD_DISTANCE = 0.01;
/** A vertex this close to an edge, and not at its ends, lies on it. */
export const ON_EDGE_DISTANCE = 0.001;
const CELL = 1;

type Grid = Map<number, number[]>;

/** A cell's key from its whole coordinates: one number, so a lookup builds no string. */
const keyOf = (cx: number, cy: number, cz: number): number => (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
const cellKey = (x: number, y: number, z: number): number =>
  keyOf(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));

/** Corners within WELD_DISTANCE of an earlier corner take its position. Returns how many moved. */
function weld(positions: Float32Array): number {
  const grid: Grid = new Map();
  const count = positions.length / 3;
  let moved = 0;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    let target = -1;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1 && target < 0; dx++) {
      for (let dy = -1; dy <= 1 && target < 0; dy++) {
        for (let dz = -1; dz <= 1 && target < 0; dz++) {
          for (const j of grid.get(keyOf(cx + dx, cy + dy, cz + dz)) ?? []) {
            const ex = positions[j * 3] - x;
            const ey = positions[j * 3 + 1] - y;
            const ez = positions[j * 3 + 2] - z;
            if (ex * ex + ey * ey + ez * ez < WELD_DISTANCE * WELD_DISTANCE) {
              target = j;
              break;
            }
          }
        }
      }
    }
    if (target >= 0) {
      if (positions[target * 3] !== x || positions[target * 3 + 1] !== y || positions[target * 3 + 2] !== z) moved++;
      positions[i * 3] = positions[target * 3];
      positions[i * 3 + 1] = positions[target * 3 + 1];
      positions[i * 3 + 2] = positions[target * 3 + 2];
      continue;
    }
    const key = cellKey(x, y, z);
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  }
  return moved;
}

/** One vertex per distinct position, on a grid, for the edge search. */
function positionGrid(positions: Float32Array): Grid {
  const grid: Grid = new Map();
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const key = cellKey(x, y, z);
    const list = grid.get(key);
    if (!list) {
      grid.set(key, [i]);
      continue;
    }
    const same = list.some((j) => positions[j * 3] === x && positions[j * 3 + 1] === y && positions[j * 3 + 2] === z);
    if (!same) list.push(i);
  }
  return grid;
}

/** The vertices lying on the edge a-b, not at its ends, as [vertex, s] with s its place along the edge, in order. */
function onEdge(positions: Float32Array, grid: Grid, a: number, b: number): Array<[number, number]> {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const dx = positions[b * 3] - ax;
  const dy = positions[b * 3 + 1] - ay;
  const dz = positions[b * 3 + 2] - az;
  const length2 = dx * dx + dy * dy + dz * dz;
  if (length2 < ON_EDGE_DISTANCE * ON_EDGE_DISTANCE) return [];
  const length = Math.sqrt(length2);
  const found: Array<[number, number]> = [];
  const low = (v: number, d: number): number => Math.floor((Math.min(v, v + d) - ON_EDGE_DISTANCE) / CELL);
  const high = (v: number, d: number): number => Math.floor((Math.max(v, v + d) + ON_EDGE_DISTANCE) / CELL);
  const hx = high(ax, dx);
  const hy = high(ay, dy);
  const hz = high(az, dz);
  for (let cx = low(ax, dx); cx <= hx; cx++) {
    for (let cy = low(ay, dy); cy <= hy; cy++) {
      for (let cz = low(az, dz); cz <= hz; cz++) {
        for (const p of grid.get(keyOf(cx, cy, cz)) ?? []) {
          const px = positions[p * 3] - ax;
          const py = positions[p * 3 + 1] - ay;
          const pz = positions[p * 3 + 2] - az;
          const s = (px * dx + py * dy + pz * dz) / length2;
          if (s * length < ON_EDGE_DISTANCE || (1 - s) * length < ON_EDGE_DISTANCE) continue;
          const ox = px - s * dx;
          const oy = py - s * dy;
          const oz = pz - s * dz;
          if (ox * ox + oy * oy + oz * oz < ON_EDGE_DISTANCE * ON_EDGE_DISTANCE) found.push([p, s]);
        }
      }
    }
  }
  return found.sort((x, y) => x[1] - y[1]);
}

/** Seals a merged batch: welds near corners, then splits every triangle at the vertices lying on its edges. The batch's
 *  arrays are replaced; each sub-mesh keeps its triangles, in its own range. Returns what changed. */
export function sealCracks(mesh: BatchMesh): { welded: number; split: number } {
  const welded = weld(mesh.positions);
  const grid = positionGrid(mesh.positions);
  // An edge two triangles share is searched once.
  const edges = new Map<number, Array<[number, number]>>();
  const vertexCount = mesh.positions.length / 3;
  const pointsOn = (a: number, b: number): Array<[number, number]> => {
    const key = Math.min(a, b) * vertexCount + Math.max(a, b);
    let found = edges.get(key);
    if (!found) {
      found = onEdge(mesh.positions, grid, Math.min(a, b), Math.max(a, b));
      edges.set(key, found);
    }
    return a < b ? found : found.map(([p, s]) => [p, 1 - s] as [number, number]).reverse();
  };
  const positions = Array.from(mesh.positions);
  const normals = Array.from(mesh.normals);
  const uvs = Array.from(mesh.uvs);
  /** A new vertex: `p` the position it takes (another vertex's, exactly), its normal and texture place blended. */
  const addVertex = (p: [number, number, number], from: number[], weights: number[]): number => {
    const at = positions.length / 3;
    positions.push(...p);
    const n = [0, 0, 0];
    const t = [0, 0];
    from.forEach((v, k) => {
      for (let c = 0; c < 3; c++) n[c] += normals[v * 3 + c] * weights[k];
      for (let c = 0; c < 2; c++) t[c] += uvs[v * 2 + c] * weights[k];
    });
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    normals.push(n[0] / l, n[1] / l, n[2] / l);
    uvs.push(t[0], t[1]);
    return at;
  };
  const indices: number[] = [];
  let split = 0;
  for (const sub of mesh.subMeshes) {
    const start = indices.length;
    for (let t = 0; t < sub.primitiveCount; t++) {
      const corners = [0, 1, 2].map((k) => mesh.indices[sub.startIndex + t * 3 + k]);
      const loop: number[] = [];
      let inserted = 0;
      for (let e = 0; e < 3; e++) {
        const a = corners[e];
        const b = corners[(e + 1) % 3];
        loop.push(a);
        for (const [p, s] of pointsOn(a, b)) {
          const at: [number, number, number] = [
            mesh.positions[p * 3],
            mesh.positions[p * 3 + 1],
            mesh.positions[p * 3 + 2],
          ];
          loop.push(addVertex(at, [a, b], [1 - s, s]));
          inserted++;
        }
      }
      if (!inserted) {
        indices.push(...corners);
        continue;
      }
      // A fan about the centroid keeps every piece's winding and area: the loop goes round the triangle as its corners do.
      const c = corners.map((v) => [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]]);
      const centre: [number, number, number] = [0, 1, 2].map((k) => (c[0][k] + c[1][k] + c[2][k]) / 3) as [
        number,
        number,
        number,
      ];
      const middle = addVertex(centre, corners, [1 / 3, 1 / 3, 1 / 3]);
      for (let i = 0; i < loop.length; i++) indices.push(middle, loop[i], loop[(i + 1) % loop.length]);
      split++;
    }
    sub.startIndex = start;
    sub.primitiveCount = (indices.length - start) / 3;
  }
  mesh.positions = new Float32Array(positions);
  mesh.normals = new Float32Array(normals);
  mesh.uvs = new Float32Array(uvs);
  mesh.indices = new Uint32Array(indices);
  return { welded, split };
}
