// Which diagonal each quad of the streamed terrain is cut on, and the value of a corner field on the triangle that
// holds a point. Every reader of the drawn ground (the index buffer, the height and normal laws, the bed's carve, the
// snow, the placers) asks this module, so what is drawn, walked on and stood on stays one surface.
//
// A quad of four samples has two cuts, and they are different surfaces wherever the four corners do not lie on one
// plane. One fixed diagonal for every quad (the grid's old law, from (x, z) to (x+1, z+1)) folds a ridge or a valley
// that runs along the OTHER diagonal into a row of teeth: each crest sample becomes its own small peak. The cut chosen
// here is the one whose fold best matches the ground the samples describe: the quad's centre is estimated by a
// Catmull-Rom (cubic) read of its 4 x 4 neighbourhood, and the diagonal whose midpoint lies nearer that estimate wins.
// A ridge's crest samples then join along the crest, and a valley's floor along the floor.
//
// The corner-difference rule ("join the two corners whose heights differ least") was measured and rejected: on a ridge
// that rises along its length the crest corners differ by that rise and the flank corners by nothing, so it cut
// across the crest and kept the teeth (test/world/terrain/terraincut.test.js, a rising ridge along that diagonal).
//
// Daggerfall Unity draws a Unity Terrain, whose mesh and Terrain.SampleHeight cut every quad on one fixed diagonal;
// this per-quad cut is the port's departure from it (bible/03-World/World-Arc.md, TERRAIN-CUT).

import { HEIGHTMAP_DIMENSION } from './terrainSampler.js';

const LAST_SAMPLE = HEIGHTMAP_DIMENSION - 1;

/** The Catmull-Rom weights at a cell's middle (t = 0.5), times 16: for the samples one before, the two corners, and
 *  one after. Integers, so the estimate's sign does not depend on the order the products are summed in. */
const MIDDLE_WEIGHTS = [-1, 9, 9, -1];

const clampSample = (index) => Math.max(0, Math.min(LAST_SAMPLE, index));

/**
 * Whether the quad at (qx, qz) of a pixel's grid at `stride` is cut on its south-east to north-west diagonal, from
 * (x+1, z) to (x, z+1), rather than the south-west to north-east one, from (x, z) to (x+1, z+1).
 *
 * Decided from the pixel's own samples only (clamped at its edge, never the neighbour's), so every reader that holds
 * the samples decides the same cut. The bed's carve and the snow do not move it: they read the cut of the ground the
 * samples describe. A quad whose corners lie on one plane, or whose centre estimate lies on both midpoints, keeps the
 * south-west to north-east cut, the old law, so flat and planar ground draws exactly as it did.
 * @param {ArrayLike<number>} heightmapData sample(x, z) = data[x * 129 + z]
 * @param {number} qx the quad's column at this stride, 0 .. 128 / stride - 1
 * @param {number} qz the quad's row at this stride
 * @param {number} [stride] the ring class the pixel is drawn at
 * @returns {boolean} true for the south-east to north-west cut
 */
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

/**
 * A corner field's value at (ax, az) inside a quad, on the triangle of the quad's cut that holds the point: heights,
 * a normal's component, the bed's depths. `ax` and `az` run 0 to 1 from the quad's (x, z) corner.
 * @param {number} v00 the value at (x, z)
 * @param {number} v10 the value at (x+1, z)
 * @param {number} v01 the value at (x, z+1)
 * @param {number} v11 the value at (x+1, z+1)
 * @param {number} ax
 * @param {number} az
 * @param {boolean} seNw the quad's cut (quadCutsSeNw)
 * @returns {number}
 */
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

/**
 * The two triangles of a grid quad as vertex indices, wound as the terrain draws them (counter-clockwise seen from
 * above), written into `out` at `offset`. i00 is the (x, z) vertex and `rowLength` the grid's vertices per row.
 * @param {Uint32Array} out
 * @param {number} offset
 * @param {number} i00
 * @param {number} rowLength
 * @param {boolean} seNw the quad's cut (quadCutsSeNw)
 * @returns {number} the offset after the six indices
 */
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
