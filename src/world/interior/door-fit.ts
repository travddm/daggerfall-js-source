// Doors that fill their doorway. A building interior's action doors (models 9000-9004, DaggerfallInterior's
// AddActionDoors) are 48 units wide and 88 tall, and the doorways of the wall pieces they hang in are 50 wide and 90
// tall from the floor: a closed door leaves a gap of one unit (2.5 cm) at each side, at the floor and under the lintel,
// and the lit room behind shows through it. Daggerfall Unity hangs the same models in the same places and shows the
// same gaps.
//
// The patch moves each edge of the door out by one unit, on a copy of the model: the two sides, the foot and the top.
// The door still turns about its own origin, one unit in from its hinge side, so its hinge edge sweeps a unit into the
// jamb as it opens. A corner keeps its texture coordinates. A departure from Daggerfall Unity, behind the Close
// interior gaps row (systems/interior-seams-row.ts).

/** A point of an ARCH3D face, in the model's own units; y points down. */
type Point = { x: number; y: number; z: number };
/** An ARCH3D model as formats/arch3dFile.js getMesh answers it, reduced to what the patch reads. */
export type DfMesh = { subMeshes: Array<{ planes: Array<{ points: Point[] }> }> };

/** The interior action doors (world/interior/interiorLayout.js DOOR_MODEL_BASE_ID and DOOR_MODEL_COUNT). */
const DOOR_FIRST = 9000;
const DOOR_END = 9005;
/** The door's edges as Daggerfall draws them, and where each moves to: [axis, from, to]. */
const EDGES: ReadonlyArray<readonly ['x' | 'y', number, number]> = [
  ['x', -1, -2],
  ['x', 47, 48],
  ['y', -44, -45],
  ['y', 44, 45],
];
/** How near a corner must be to an edge to be on it. */
const EDGE_EPS = 0.01;

export const isInteriorDoor = (modelId: number): boolean => modelId >= DOOR_FIRST && modelId < DOOR_END;

/** The point with each of its coordinates that lies on a door edge moved out to that edge's new place. */
function movedOut(point: Point): Point {
  let out = point;
  for (const [axis, from, to] of EDGES) {
    if (Math.abs(out[axis] - from) > EDGE_EPS) continue;
    out = { ...out, [axis]: to };
  }
  return out;
}

/** Whether the mesh is the door these edges were measured on: its corners all on them, across x and y. */
function isMeasuredDoor(mesh: DfMesh): boolean {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const subMesh of mesh.subMeshes) {
    for (const plane of subMesh.planes) {
      for (const point of plane.points) {
        xs.add(point.x);
        ys.add(point.y);
      }
    }
  }
  const on = (values: Set<number>, edges: number[]) =>
    [...values].every((v) => edges.some((e) => Math.abs(v - e) <= EDGE_EPS));
  return on(xs, [-1, 47]) && on(ys, [-44, 44]);
}

/**
 * The model as it is drawn with the Close interior gaps row on: an interior action door one unit larger at each edge,
 * on a copy (the archive's mesh is shared). Any other model, or a door model of another shape, comes back as it was.
 */
export function fitDoorToFrame<M extends DfMesh>(modelId: number, mesh: M): M {
  if (!isInteriorDoor(modelId) || !mesh?.subMeshes || !isMeasuredDoor(mesh)) return mesh;
  return {
    ...mesh,
    subMeshes: mesh.subMeshes.map((subMesh) => ({
      ...subMesh,
      planes: subMesh.planes.map((plane) => ({ ...plane, points: plane.points.map(movedOut) })),
    })),
  };
}
