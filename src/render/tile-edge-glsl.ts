// The ground's tile arrays repeat under the linear filters, so a tile's edge blends with the tile's own opposite edge:
// right where a copy of the same tile lies next to it, wrong where the tile's picture holds two grounds. A road's
// diagonal flank is half paving and half dirt or grass, and a marching-squares transition is two kinds of ground, so the
// repeat drew a thin line of the other ground along the joint. On such a tile, an edge whose neighbour is not the same
// tile in the same turn holds the tile's own coordinate inside the tile, as the clamp did. Copies of one tile, and every
// single-ground tile, keep the repeat. Point clamps in the sampler (`uGroundClamped`), and the coordinate passes
// through unchanged there.
//
// A neighbour off the pixel's tilemap is read as the tile itself, so a two-ground tile on a map pixel's border keeps
// the repeat on that edge.
import { groundKindsOf } from '../world/terrain/groundEdge.js';
import { ROAD_PAVING, ROAD_RECORDS } from '../world/road/roadEdge.js';

/** A converted tile byte whose picture holds two grounds: a marching-squares transition, or a road's diagonal flank. */
export function twoGroundTile(byte: number): boolean {
  const record = byte >> 2;
  const flank = ROAD_RECORDS.includes(record) && record !== ROAD_PAVING;
  return flank || groundKindsOf(byte) !== null;
}

/** The 256 bytes' flags, as eight 32-bit words: bit `byte & 31` of word `byte >> 5`. */
export function twoGroundWords(): number[] {
  const words = new Array<number>(8).fill(0);
  for (let byte = 0; byte < 256; byte++) {
    if (twoGroundTile(byte)) words[byte >> 5] = (words[byte >> 5] | (1 << (byte & 31))) >>> 0;
  }
  return words;
}

/**
 * The chunk: `vec2 tileEdgeHold(vec2 f, highp ivec2 cell, highp uint data, vec2 gx, vec2 gy)`, the tile's own coordinate
 * `f` (0..1 across the tile, before its turn) held off each edge where it must not wrap. `gx`/`gy` are the screen
 * gradients of the unwrapped coordinate, in tiles. It reads uTilemap, uTileArr and uGroundClamped (render/waterBedGlsl.js),
 * so it goes after the water bed's chunk.
 */
export function tileEdgeGlsl(): string {
  const words = twoGroundWords()
    .map((word) => `${word}u`)
    .join(', ');
  return `
const highp uint TE_TWO_GROUNDS[8] = uint[8](${words});
bool teTwoGrounds(highp uint d) { return ((TE_TWO_GROUNDS[d >> 5u] >> (d & 31u)) & 1u) == 1u; }
highp uint teCell(highp ivec2 c) { return texelFetch(uTilemap, clamp(c, ivec2(0), ivec2(127)), 0).r; }
// The margin is half a texel up close; at a distance it is the footprint, which covers the coarser mip level and the
// anisotropic taps. It is at most half the tile.
vec2 tileEdgeHold(vec2 f, highp ivec2 cell, highp uint data, vec2 gx, vec2 gy) {
  if (uGroundClamped > 0.5 || !teTwoGrounds(data)) return f;
  vec2 texel = 1.0 / vec2(textureSize(uTileArr, 0).xy);
  vec2 margin = min(max(0.5 * texel, max(abs(gx), abs(gy))), vec2(0.5));
  vec2 low = vec2(teCell(cell + ivec2(-1, 0)) == data ? 0.0 : margin.x, teCell(cell + ivec2(0, -1)) == data ? 0.0 : margin.y);
  vec2 high = vec2(teCell(cell + ivec2(1, 0)) == data ? 0.0 : margin.x, teCell(cell + ivec2(0, 1)) == data ? 0.0 : margin.y);
  return clamp(f, low, vec2(1.0) - high);
}`;
}
