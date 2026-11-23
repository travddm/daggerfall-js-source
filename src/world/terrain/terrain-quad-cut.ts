// Which diagonal each quad of the streamed terrain is cut on, and a corner field's value on the triangle that holds a
// point. Every reader of the drawn ground (the index buffer, the height and normal reads, the bed, the snow, the placers)
// asks this module, so what is drawn, walked on and stood on stays one surface. One fixed diagonal for every quad folds
// a ridge or a valley that runs along the other diagonal into a row of teeth. The cut chosen here is the one whose fold
// best fits the ground: a Catmull-Rom (cubic) read of the 4 x 4 samples estimates the quad's centre, and the diagonal
// whose midpoint lies nearer that estimate wins, so a crest joins along the crest. Joining the corners that differ least
// keeps a rising ridge's teeth, so that rule is not used.
// Departure from DFU, so an option (the `terrainSlopeCut` row, systems/terrainSlopeCutRow.js), off by default: Unity
// cuts every terrain quad on one diagonal, (x, z) to (x+1, z+1), and off is that cut.

import { HEIGHTMAP_DIMENSION } from './terrainSampler.js';

const LAST_SAMPLE = HEIGHTMAP_DIMENSION - 1;

/** Whether quads follow their slope. A flag of the module, not a parameter, so every reader of the drawn ground (on
 *  this thread and on the terrain worker) reads one switch and the walked, drawn and water ground stay one surface. Set
 *  as a world mounts (terrainGenClient.js), before any pixel is built. */
let slopeCut = false;

export function setSlopeCut(on: boolean): void {
  slopeCut = on;
}

export function slopeCutIsOn(): boolean {
  return slopeCut;
}

/** The Catmull-Rom weights at a cell's middle (t = 0.5), times 16: for the samples one before, the two corners, and
 *  one after. Integers, so the estimate's sign does not depend on the order the products are summed in. */
const MIDDLE_WEIGHTS = [-1, 9, 9, -1] as const;

const clampSample = (index: number): number => Math.max(0, Math.min(LAST_SAMPLE, index));

/** One column of the 4 x 4 read, its four samples weighted along z. A function of its own, not a closure: the height
 *  reads ask the cut once a read, so the grass placer pays it once a blade. */
function columnSum(
  heightmapData: ArrayLike<number>,
  column: number,
  zBefore: number,
  z0: number,
  stride: number,
  zAfter: number,
): number {
  return (
    MIDDLE_WEIGHTS[0] * heightmapData[column + zBefore] +
    MIDDLE_WEIGHTS[1] * heightmapData[column + z0] +
    MIDDLE_WEIGHTS[2] * heightmapData[column + z0 + stride] +
    MIDDLE_WEIGHTS[3] * heightmapData[column + zAfter]
  );
}

/** Whether quad (qx, qz) of a pixel's grid at `stride` is cut south-east to north-west, (x+1, z) to (x, z+1), rather
 *  than south-west to north-east, (x, z) to (x+1, z+1). Decided from the pixel's own samples alone (data[x * 129 + z],
 *  clamped at its edge), so every reader that holds them decides the same cut; the bed's carve and the snow do not move
 *  it. A quad whose corners make no saddle keeps the south-west to north-east cut: flat ground draws as it did.
 *  With the option off, every quad keeps that cut. Returns true for the south-east to north-west cut. */
export function quadCutsSeNw(heightmapData: ArrayLike<number>, qx: number, qz: number, stride = 1): boolean {
  if (!slopeCut) return false;
  const x0 = qx * stride;
  const z0 = qz * stride;
  const column0 = x0 * HEIGHTMAP_DIMENSION;
  const column1 = (x0 + stride) * HEIGHTMAP_DIMENSION;
  const h00 = heightmapData[column0 + z0];
  const h10 = heightmapData[column1 + z0];
  const h01 = heightmapData[column0 + z0 + stride];
  const h11 = heightmapData[column1 + z0 + stride];
  // The south-west to north-east midpoint lies `saddle / 4` above the corners' mean, the other one as far below it.
  const saddle = h00 + h11 - h10 - h01;
  if (saddle === 0) return false;
  const zBefore = clampSample(z0 - stride);
  const zAfter = clampSample(z0 + 2 * stride);
  const columnBefore = clampSample(x0 - stride) * HEIGHTMAP_DIMENSION;
  const columnAfter = clampSample(x0 + 2 * stride) * HEIGHTMAP_DIMENSION;
  const centreTimes256 =
    MIDDLE_WEIGHTS[0] * columnSum(heightmapData, columnBefore, zBefore, z0, stride, zAfter) +
    MIDDLE_WEIGHTS[1] * columnSum(heightmapData, column0, zBefore, z0, stride, zAfter) +
    MIDDLE_WEIGHTS[2] * columnSum(heightmapData, column1, zBefore, z0, stride, zAfter) +
    MIDDLE_WEIGHTS[3] * columnSum(heightmapData, columnAfter, zBefore, z0, stride, zAfter);
  const centreOverMean = centreTimes256 / 256 - (h00 + h10 + h01 + h11) / 4;
  return centreOverMean * saddle < 0;
}

/** A corner field's value (heights, a normal's component, the bed's depths) at (ax, az), 0 to 1 from the quad's (x, z)
 *  corner, on the triangle of the quad's cut (`seNw`, from quadCutsSeNw) that holds the point. v00 is the value at
 *  (x, z), v10 at (x+1, z), v01 at (x, z+1) and v11 at (x+1, z+1). */
export function quadValueAt(
  v00: number,
  v10: number,
  v01: number,
  v11: number,
  ax: number,
  az: number,
  seNw: boolean,
): number {
  if (seNw) {
    return ax + az <= 1
      ? v00 + ax * (v10 - v00) + az * (v01 - v00)
      : v11 + (1 - ax) * (v01 - v11) + (1 - az) * (v10 - v11);
  }
  return az >= ax ? v00 + az * (v01 - v00) + ax * (v11 - v01) : v00 + ax * (v10 - v00) + az * (v11 - v10);
}

/** The two triangles of a grid quad as vertex indices, wound counter-clockwise seen from above as the terrain draws
 *  them, written into `out` at `offset`. i00 is the (x, z) vertex and `rowLength` the grid's vertices per row; `seNw`
 *  is the quad's cut (quadCutsSeNw). Returns the offset after the six indices. */
export function writeQuadTriangles(
  out: Uint32Array | Uint16Array | number[],
  offset: number,
  i00: number,
  rowLength: number,
  seNw: boolean,
): number {
  const i10 = i00 + 1;
  const i01 = i00 + rowLength;
  const i11 = i01 + 1;
  const corners = seNw ? [i00, i01, i10, i10, i01, i11] : [i00, i01, i11, i00, i11, i10];
  for (let k = 0; k < 6; k++) out[offset + k] = corners[k];
  return offset + 6;
}
