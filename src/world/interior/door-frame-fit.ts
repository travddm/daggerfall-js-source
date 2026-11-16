// Doors fitted to their own doorway. A building interior's action doors (models 9000-9004, DaggerfallInterior's
// AddActionDoors) are 48 units wide and 88 tall, and they hang in doorways a little larger, by different amounts:
// Daggerfall's kit walls leave a unit (2.5 cm) at each side, at the floor and under the lintel, and the town packs set
// some doors two or more units off. The lit room behind shows through the gap. Daggerfall Unity hangs the same models
// in the same places and shows the same gaps.
//
// Each closed door is measured against its room: from the middle of each narrow face (the two sides, the top, the
// foot), straight out, the distance to the first face of the room. An edge with a face between MIN_GAP and MAX_GAP away
// moves out by exactly that distance, so it stops on the jamb, the floor or the lintel. A fixed move would lay the
// door's border on the wall where the doorway is the door's own size, and the two would z-fight. A door that stands
// proud of its wall's surface first moves back into the wall along its thickness (measureDoorDepth). The door is moved
// on a copy of its model, one a door. Both are departures from Daggerfall Unity, behind the Close interior gaps row
// (systems/interior-seams-row.ts).

/** The door model as world/meshReader.js dfMeshToModel answers it: positions in metres, three a vertex. */
export type DoorModel = { positions: ArrayLike<number>; indices: ArrayLike<number>; [key: string]: unknown };
/** The four gaps of a closed door, in metres: 0 where an edge is closed or stands clear of any face. */
export type DoorGaps = { hinge: number; latch: number; top: number; foot: number };

/** A gap narrower than this is closed already. */
export const MIN_GAP = 0.0005;
/** A gap wider than this is not a doorway's: an arch, an open room. */
export const MAX_GAP = 0.1;
/** The rays start this far inside the door, so a face lying on the door's edge is met at once. */
const INSIDE = 0.002;

type Vec = [number, number, number];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** A point through a column-major matrix; `w` 0 for a direction. */
function apply(m: ArrayLike<number>, p: Vec, w = 1): Vec {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w,
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w,
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w,
  ];
}

/** The first face of `room` (nine numbers a triangle) along o + t d, as t; Infinity when none. */
function firstHit(room: ArrayLike<number>, o: Vec, d: Vec, tMax: number): number {
  let best = Infinity;
  for (let k = 0; k + 8 < room.length; k += 9) {
    const a: Vec = [room[k], room[k + 1], room[k + 2]];
    const e1 = sub([room[k + 3], room[k + 4], room[k + 5]], a);
    const e2 = sub([room[k + 6], room[k + 7], room[k + 8]], a);
    const p = cross(d, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(o, a);
    const u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const v = dot(d, q) / det;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) / det;
    if (t > 0 && t < best && t < tMax) best = t;
  }
  return best;
}

/** The model's box in its own space: [min, max] on x, y and z. */
function box(model: DoorModel): [Vec, Vec] {
  const low: Vec = [Infinity, Infinity, Infinity];
  const high: Vec = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < model.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      low[k] = Math.min(low[k], model.positions[i + k]);
      high[k] = Math.max(high[k], model.positions[i + k]);
    }
  }
  return [low, high];
}

/**
 * The gaps of a closed door under `matrix` (no scale: a placement's rotation and position) against `room`, the room's
 * faces in the same frame, nine numbers a triangle. The door's width runs along its own x, its height along its own y
 * (up), its thickness along z.
 */
export function measureDoorGaps(model: DoorModel, matrix: ArrayLike<number>, room: ArrayLike<number>): DoorGaps {
  const [low, high] = box(model);
  const middle: Vec = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
  const gap = (point: Vec, out: Vec): number => {
    const d = apply(matrix, out, 0);
    const o = apply(matrix, point);
    const t =
      firstHit(room, [o[0] - d[0] * INSIDE, o[1] - d[1] * INSIDE, o[2] - d[2] * INSIDE], d, MAX_GAP + INSIDE) - INSIDE;
    return t > MIN_GAP && t <= MAX_GAP ? t : 0;
  };
  return {
    hinge: gap([low[0], middle[1], middle[2]], [-1, 0, 0]),
    latch: gap([high[0], middle[1], middle[2]], [1, 0, 0]),
    top: gap([middle[0], high[1], middle[2]], [0, 1, 0]),
    foot: gap([middle[0], low[1], middle[2]], [0, -1, 0]),
  };
}

/** How far beside the door the wall is probed, past each side: two ARCH3D units. */
const WALL_PROBE = 0.05;
/** The furthest a wall's surface is looked for from the door's middle, and the furthest a door moves into its wall. */
const WALL_REACH = 0.4;
export const MAX_DEPTH_MOVE = 0.1;
/** A moved door stops this far inside its wall's surface: flush with it, its border would z-fight where the wall's face
 *  overlaps it. */
export const RECESS = 0.003;

/**
 * How far the door must move along its own z (its thickness) to sit within its wall: 0 when it does already, or when no
 * wall stands beside it. Beside each side, the wall's two surfaces are found along the door's normal; a door standing
 * out of either surface moves back by just that much, and a door thicker than its wall is set at the wall's middle.
 * Daggerfall's data and the town packs hang some doors a unit off their wall's middle, or a 6-unit door in a 5-unit
 * wall, and the door's face stands proud of the wall by up to 7.5 cm.
 */
export function measureDoorDepth(model: DoorModel, matrix: ArrayLike<number>, room: ArrayLike<number>): number {
  const [low, high] = box(model);
  const half = (high[2] - low[2]) / 2;
  const middle: Vec = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
  const forward = apply(matrix, [0, 0, 1], 0);
  const back: Vec = [-forward[0], -forward[1], -forward[2]];
  for (const x of [low[0] - WALL_PROBE, high[0] + WALL_PROBE]) {
    const o = apply(matrix, [x, middle[1], middle[2]]);
    const front = firstHit(room, o, forward, WALL_REACH);
    const rear = firstHit(room, o, back, WALL_REACH);
    if (!Number.isFinite(front) || !Number.isFinite(rear)) continue;
    let move = 0;
    if (front + rear < 2 * half)
      move = (front - rear) / 2; // a wall thinner than the door: the door at its middle
    else if (half - front > MIN_GAP)
      move = front - half - RECESS; // proud of the front: back by that much, and a little more
    else if (half - rear > MIN_GAP) move = half - rear + RECESS; // proud of the back: forward by that much, and a little more
    return Math.abs(move) > MIN_GAP && Math.abs(move) <= MAX_DEPTH_MOVE ? move : 0;
  }
  return 0;
}

/** Whether a door has any gap to close. */
export const hasGap = (gaps: DoorGaps): boolean => gaps.hinge > 0 || gaps.latch > 0 || gaps.top > 0 || gaps.foot > 0;

/**
 * A copy of the door model with each edge moved out by its gap: the corners on the hinge side by `hinge`, on the latch
 * side by `latch`, at the top by `top`, at the foot by `foot`; and the whole door moved along its thickness by `depth`
 * (measureDoorDepth). Every other field of the model is the original's.
 */
export function fitDoorModel<M extends DoorModel>(model: M, gaps: DoorGaps, depth = 0): M {
  const [low, high] = box(model);
  const EDGE = 1e-4;
  const positions = Float32Array.from(model.positions);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    if (Math.abs(positions[i] - low[0]) < EDGE) positions[i] -= gaps.hinge;
    else if (Math.abs(positions[i] - high[0]) < EDGE) positions[i] += gaps.latch;
    if (Math.abs(positions[i + 1] - high[1]) < EDGE) positions[i + 1] += gaps.top;
    else if (Math.abs(positions[i + 1] - low[1]) < EDGE) positions[i + 1] -= gaps.foot;
    positions[i + 2] += depth;
  }
  return { ...model, positions };
}

/** A room placement as world/interior/interiorLayout.js lays it. */
type Placement = { modelIdNum: number; objectType: number; matrix: ArrayLike<number> };
/** The renderer's two mesh calls the fitter uses (render/renderer.js). */
type MeshMaker = { createMesh(model: DoorModel): unknown; destroyMesh(mesh: unknown): void };
/** Props stand free in a room: a door closes against its walls, never against its furniture. */
const PROP_MODEL_TYPE = 3;

/**
 * The doors of one room, fitted as they are hung: `door` answers the mesh and the model to draw a door with - a fitted
 * copy when the row is on (`on`) and the door has a gap, else the shared ones - and `destroy` frees the copies.
 * `models` answers a placement's model (scenes/interiorContext.js cpuModels), `shared` a model's shared mesh.
 */
export function doorFitter(
  on: boolean,
  renderer: MeshMaker,
  placements: readonly Placement[],
  models: { get(id: number): DoorModel | undefined },
) {
  const own: unknown[] = [];
  let room: Float32Array | null = null;
  /** The room's faces, nine numbers a triangle, built at the first door that asks. */
  const roomFaces = (): Float32Array => {
    if (room) return room;
    const faces: number[] = [];
    for (const placement of placements) {
      if (placement.objectType === PROP_MODEL_TYPE) continue;
      const model = models.get(placement.modelIdNum);
      if (!model) continue;
      const p = model.positions;
      for (let t = 0; t + 2 < model.indices.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          const v = model.indices[t + k] * 3;
          faces.push(...apply(placement.matrix, [p[v], p[v + 1], p[v + 2]]));
        }
      }
    }
    room = new Float32Array(faces);
    return room;
  };
  return {
    async door(modelId: number, matrix: ArrayLike<number>, shared: (id: number) => Promise<unknown>) {
      const gpu = await shared(modelId);
      const cpu = models.get(modelId);
      if (!on || !gpu || !cpu) return { gpu, cpu };
      // the depth first: the gaps are measured where the door will stand
      const depth = measureDoorDepth(cpu, matrix, roomFaces());
      const moved = depth ? fitDoorModel(cpu, { hinge: 0, latch: 0, top: 0, foot: 0 }, depth) : cpu;
      const gaps = measureDoorGaps(moved, matrix, roomFaces());
      if (!depth && !hasGap(gaps)) return { gpu, cpu };
      const fitted = fitDoorModel(cpu, gaps, depth);
      const mesh = renderer.createMesh(fitted);
      own.push(mesh);
      return { gpu: mesh, cpu: fitted };
    },
    destroy() {
      for (const mesh of own) renderer.destroyMesh(mesh);
      own.length = 0;
    },
  };
}
