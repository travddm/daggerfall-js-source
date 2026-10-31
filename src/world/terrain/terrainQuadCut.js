// Which diagonal each quad of the streamed terrain is cut on, and a corner field's value on the triangle that holds a
// point. Every reader of the drawn ground (the index buffer, the height and normal laws, the bed, the snow, the placers)
// asks this module, so what is drawn, walked on and stood on stays one surface. One fixed diagonal for every quad folded
// a ridge or a valley along the OTHER diagonal into a row of teeth. The cut chosen here is the one whose fold best fits
// the ground: the quad's centre is estimated by a Catmull-Rom (cubic) read of its 4 x 4 samples, and the diagonal whose
// midpoint lies nearer it wins, so a crest joins along the crest. Joining the corners that differ least keeps a rising
// ridge's teeth. Unity cuts its terrain on one diagonal: the departure is bible/03-World/World-Arc.md TERRAIN-CUT.

import { HEIGHTMAP_DIMENSION } from './terrainSampler.js';

const LAST_SAMPLE = HEIGHTMAP_DIMENSION - 1;

/** The Catmull-Rom weights at a cell's middle (t = 0.5), times 16: for the samples one before, the two corners, and
 *  one after. Integers, so the estimate's sign does not depend on the order the products are summed in. */
const MIDDLE_WEIGHTS = [-1, 9, 9, -1];

const clampSample = (index) => Math.max(0, Math.min(LAST_SAMPLE, index));

/** Whether quad (qx, qz) of a pixel's grid at `stride` is cut south-east to north-west, (x+1, z) to (x, z+1), rather
 *  than south-west to north-east, (x, z) to (x+1, z+1). Decided from the pixel's own samples alone (data[x * 129 + z],
 *  clamped at its edge), so every reader that holds them decides the same cut; the bed's carve and the snow do not move
 *  it. A quad whose corners make no saddle keeps the south-west to north-east cut: flat ground draws as it did.
 *  @param {ArrayLike<number>} heightmapData @param {number} qx @param {number} qz @param {number} [stride]
 *  @returns {boolean} true for the south-east to north-west cut */
export function quadCutsSeNw(heightmapData, qx, qz, stride = 1) {
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
  let centreTimes256 = 0;
  for (let i = 0; i < 4; i++) {
    const column = clampSample(x0 + (i - 1) * stride) * HEIGHTMAP_DIMENSION;
    let rowSum = 0;
    for (let j = 0; j < 4; j++) {
      rowSum += MIDDLE_WEIGHTS[j] * heightmapData[column + clampSample(z0 + (j - 1) * stride)];
    }
    centreTimes256 += MIDDLE_WEIGHTS[i] * rowSum;
  }
  const centreOverMean = centreTimes256 / 256 - (h00 + h10 + h01 + h11) / 4;
  return centreOverMean * saddle < 0;
}

/** A corner field's value (heights, a normal's component, the bed's depths) at (ax, az), 0 to 1 from the quad's (x, z)
 *  corner, on the triangle of the quad's cut that holds the point. v00 is the value at (x, z), v10 at (x+1, z), v01 at
 *  (x, z+1) and v11 at (x+1, z+1).
 *  @param {number} v00 @param {number} v10 @param {number} v01 @param {number} v11 @param {number} ax @param {number} az
 *  @param {boolean} seNw the quad's cut (quadCutsSeNw) @returns {number} */
export function quadValueAt(v00, v10, v01, v11, ax, az, seNw) {
  if (seNw) {
    return ax + az <= 1
      ? v00 + ax * (v10 - v00) + az * (v01 - v00)
      : v11 + (1 - ax) * (v01 - v11) + (1 - az) * (v10 - v11);
  }
  return az >= ax
    ? v00 + az * (v01 - v00) + ax * (v11 - v01)
    : v00 + ax * (v10 - v00) + az * (v11 - v10);
}

/** The two triangles of a grid quad as vertex indices, wound counter-clockwise seen from above as the terrain draws
 *  them, written into `out` at `offset`. i00 is the (x, z) vertex and `rowLength` the grid's vertices per row.
 *  @param {Uint32Array|number[]} out @param {number} offset @param {number} i00 @param {number} rowLength
 *  @param {boolean} seNw the quad's cut (quadCutsSeNw) @returns {number} the offset after the six indices */
export function writeQuadTriangles(out, offset, i00, rowLength, seNw) {
  const i10 = i00 + 1;
  const i01 = i00 + rowLength;
  const i11 = i01 + 1;
  const corners = seNw
    ? [i00, i01, i10, i10, i01, i11]
    : [i00, i01, i11, i00, i11, i10];
  for (let k = 0; k < 6; k++) out[offset + k] = corners[k];
  return offset + 6;
}
