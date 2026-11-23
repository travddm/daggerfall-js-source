// Kit walls that reach the floor and the ceiling. Daggerfall's interior wall pieces (models 3000-4999) are 126 units
// tall, and the floor and ceiling tiles they stand between are 128 units apart: a wall placed in the middle of its storey
// stops one unit (2.5 cm) short of the floor and one short of the ceiling. Through each slit the camera sees past the
// wall: the next room, the building's hull or the background. Daggerfall Unity draws the same models in the same places
// and shows the same slits (DaggerfallInterior.cs, AddModels).
//
// The patch moves a kit wall's foot row down one unit and its top row up one unit, on a copy of the model. Only the end
// rows move: a doorway's lintel or a window's sill stays where the frame set in it meets it. A corner keeps its texture
// coordinates, so the wall's picture stretches by 1.6%. A departure from Daggerfall Unity, behind the Close interior
// gaps row (systems/interior-seams-row.ts).

/** A point of an ARCH3D face, in the model's own units; y points down. */
type Point = { x: number; y: number; z: number };
/** An ARCH3D model as formats/arch3dFile.js getMesh answers it, reduced to what the patch reads. */
export type DfMesh = { subMeshes: Array<{ planes: Array<{ points: Point[] }> }> };

/** Daggerfall's interior wall pieces. */
export const KIT_WALL_FIRST = 3000;
export const KIT_WALL_END = 5000;

/** The foot rows a kit wall is drawn with and the row each moves to: a storey-high piece's foot at 63 and a
 *  two-storey piece's at 128, each one unit over the floor where it is placed. */
const FOOT_TO: ReadonlyArray<readonly [number, number]> = [
  [63, 64],
  [128, 129],
];
/** The top row of a storey-high piece and the row it moves to. A two-storey piece's top (-127) already meets its
 *  ceiling. */
const TOP_TO: ReadonlyArray<readonly [number, number]> = [[-63, -64]];
/** How near a corner must be to a row to be in it: some models write a row's corners a 1/256 grid step apart. */
const ROW_EPS = 0.01;

/** The row a value belongs to among `rows`, as [row, moved to], or null. */
const rowOf = (value: number, rows: ReadonlyArray<readonly [number, number]>): readonly [number, number] | null =>
  rows.find(([row]) => Math.abs(value - row) <= ROW_EPS) ?? null;

export const isKitWall = (modelId: number): boolean => modelId >= KIT_WALL_FIRST && modelId < KIT_WALL_END;

/** The model's lowest and highest y, in ARCH3D units. */
function yExtent(mesh: DfMesh): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const subMesh of mesh.subMeshes) {
    for (const plane of subMesh.planes) {
      for (const point of plane.points) {
        if (point.y < low) low = point.y;
        if (point.y > high) high = point.y;
      }
    }
  }
  return [low, high];
}

/**
 * The model as it is drawn with the Close interior gaps row on: a kit wall with its foot and top rows moved out to the
 * floor and the ceiling, on a copy (the archive's mesh is shared). Any other model, or a kit wall of another height,
 * comes back as it was.
 */
export function extendKitWallEnds<M extends DfMesh>(modelId: number, mesh: M): M {
  if (!isKitWall(modelId) || !mesh?.subMeshes) return mesh;
  const [top, foot] = yExtent(mesh);
  const footRow = rowOf(foot, FOOT_TO);
  const topRow = rowOf(top, TOP_TO);
  if (!footRow && !topRow) return mesh;
  const moved = (point: Point): Point => {
    if (footRow && Math.abs(point.y - footRow[0]) <= ROW_EPS) return { ...point, y: footRow[1] };
    if (topRow && Math.abs(point.y - topRow[0]) <= ROW_EPS) return { ...point, y: topRow[1] };
    return point;
  };
  return {
    ...mesh,
    subMeshes: mesh.subMeshes.map((subMesh) => ({
      ...subMesh,
      planes: subMesh.planes.map((plane) => ({ ...plane, points: plane.points.map(moved) })),
    })),
  };
}
