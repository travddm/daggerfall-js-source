// TERRAIN-CUT (2026-10-31): EACH QUAD OF THE GROUND IS CUT ON THE DIAGONAL ITS GROUND FOLLOWS.
//
// One fixed diagonal for every quad folded a ridge or a valley that runs along the other diagonal into a row of teeth.
// world/terrain/terrainQuadCut.js now decides the cut a quad at a time from the pixel's samples, and every reader of the
// drawn ground asks it. These tests build the real mesh (buildTerrainGrid's vertices, buildTerrainIndices' triangles)
// and hold the ridge to its crest, and every reader to the triangles the mesh draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTerrainGrid, buildTerrainIndices, surfaceHeightAt, walkGroundAt, drawnGroundAt, surfaceNormalAt,
  surfaceNormalFromSamples, gridValueAt, terrainSampleHeightAt, CLIP_SENTINEL,
} from '../../../src/world/terrain/terrainSurface.js';
import { quadCutsSeNw, quadValueAt, writeQuadTriangles } from '../../../src/world/terrain/terrainQuadCut.js';
import { HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE, TERRAIN_SIZE } from '../../../src/world/terrain/terrainSampler.js';
import { carveBed } from '../../../src/world/water/waterBed.js';
import { WATER_DRAW_MASK_TABLE } from '../../../src/world/water/waterCorners.js';
import { buildPixelWaterIndices } from '../../../src/render/waterSurface.js';
import { clippedTerrainIndices } from '../../../src/world/deepWater/deepWaterCap.js';
import { groundAlong } from '../../../src/scenes/ghostfenceBuild.js';

const H = HEIGHTMAP_DIMENSION;
const CELL = TERRAIN_SIZE / (H - 1);
const WORLD_H = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;

/** Samples from a height field in world units over sample coordinates (x, z). */
function samplesOf(heightAt) {
  const data = new Float32Array(H * H);
  for (let x = 0; x < H; x++) {
    for (let z = 0; z < H; z++) data[x * H + z] = heightAt(x, z) / WORLD_H;
  }
  return data;
}

/** A knife ridge along the south-east to north-west diagonal (x + z constant), rising 0.3 m a sample along its crest:
 *  the ground the fixed cut drew as teeth. */
const knifeRidge = (x, z) => 700 - 6 * Math.abs((x + z - 128) / Math.SQRT2) + 0.3 * (x - z);

/** Rough ground for the readers: knife ridges both ways, a valley and some swell, so both cuts occur everywhere. */
const roughGround = (x, z) => 1000
  - 5 * Math.abs((x + z - 90) / Math.SQRT2)
  - 4 * Math.abs((x - z - 20) / Math.SQRT2)
  + 3 * Math.abs((x + z - 190) / Math.SQRT2)
  + 8 * Math.sin(x * 0.21) * Math.cos(z * 0.17);

/** The drawn mesh of a pixel's samples at a stride: a vertical line met with the triangle under it, off the real
 *  vertex and index buffers. Answers the triangle's three vertex indices and their weights. */
function meshOf(data, stride, positions = buildTerrainGrid(data, stride, null).positions) {
  const indices = buildTerrainIndices(stride, data);
  const quads = 128 / stride;
  const quad = CELL * stride;
  const under = (lx, lz) => {
    const qx = Math.max(0, Math.min(quads - 1, Math.floor(lx / quad)));
    const qz = Math.max(0, Math.min(quads - 1, Math.floor(lz / quad)));
    const base = (qz * quads + qx) * 6;
    for (let t = 0; t < 2; t++) {
      const v = [0, 1, 2].map((k) => indices[base + t * 3 + k]);
      const [a, b, c] = v.map((i) => [positions[i * 3], positions[i * 3 + 2]]);
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      const wa = ((b[1] - c[1]) * (lx - c[0]) + (c[0] - b[0]) * (lz - c[1])) / den;
      const wb = ((c[1] - a[1]) * (lx - c[0]) + (a[0] - c[0]) * (lz - c[1])) / den;
      const wc = 1 - wa - wb;
      // the vertices are float32: a point on a quad's edge can sit a hair outside its triangles
      if (wa >= -1e-5 && wb >= -1e-5 && wc >= -1e-5) return { v, w: [wa, wb, wc] };
    }
    return null;
  };
  const value = (lx, lz, values, width = 1, k = 0) => {
    const hit = under(lx, lz);
    return hit.v.reduce((sum, i, n) => sum + hit.w[n] * values[i * width + k], 0);
  };
  return { indices, positions, under, value, height: (lx, lz) => value(lx, lz, positions, 3, 1) };
}

/** Points spread over the pixel, a fixed sequence. */
function points(count, seed, span = TERRAIN_SIZE) {
  let s = seed >>> 0;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return Array.from({ length: count }, () => [next() * span, next() * span]);
}

/** A triangle as a key that does not depend on which corner it starts at. */
const triangleKeys = (indices) => {
  const keys = new Set();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    const first = tri.indexOf(Math.min(...tri));
    keys.add([0, 1, 2].map((k) => tri[(first + k) % 3]).join(','));
  }
  return keys;
};

test('TERRAIN-CUT: a knife ridge across the grid draws its crest, not a row of teeth - near and at the far ring\'s stride', () => {
  const data = samplesOf(knifeRidge);
  for (const stride of [1, 4]) {
    const mesh = meshOf(data, stride);
    const fixed = meshOf(data, stride);
    fixed.indices.set(buildTerrainIndices(stride));   // the old law: every quad on the south-west to north-east diagonal
    // the crest, x + z = 128, between its samples - the true ridge is a straight line there
    let worstCut = 0;
    let worstFixed = 0;
    for (let t = 8; t <= 120; t += 0.37) {
      const lx = t * CELL;
      const lz = (128 - t) * CELL;
      const crest = knifeRidge(t, 128 - t);
      worstCut = Math.max(worstCut, Math.abs(mesh.height(lx, lz) - crest));
      worstFixed = Math.max(worstFixed, crest - fixed.height(lx, lz));
    }
    assert.ok(worstCut < 1e-3, `stride ${stride}: the crest is drawn where it stands, to ${worstCut} m`);
    assert.ok(worstFixed > 6 * stride * 0.7, `stride ${stride}: the fixed cut dipped ${worstFixed.toFixed(2)} m between crest samples (the teeth)`);
    // and every crest quad took the south-east to north-west cut
    for (let q = 4; q < 128 / stride - 4; q++) assert.equal(quadCutsSeNw(data, q, 128 / stride - 1 - q, stride), true, `crest quad ${q}`);
  }
  // a valley the same way, and a ridge along the other diagonal, are drawn whole too
  const valley = samplesOf((x, z) => 100 + 6 * Math.abs((x + z - 128) / Math.SQRT2) + 0.3 * (x - z));
  const mainRidge = samplesOf((x, z) => 400 - 6 * Math.abs((x - z) / Math.SQRT2) + 0.3 * (x + z));
  const valleyMesh = meshOf(valley, 1);
  const ridgeMesh = meshOf(mainRidge, 1);
  for (let t = 8; t <= 120; t += 0.41) {
    assert.ok(Math.abs(valleyMesh.height(t * CELL, (128 - t) * CELL) - (100 + 0.3 * (2 * t - 128))) < 1e-3, `valley floor at ${t}`);
    assert.ok(Math.abs(ridgeMesh.height(t * CELL, t * CELL) - (400 + 0.6 * t)) < 1e-3, `the other ridge's crest at ${t}`);
  }
});

test('TERRAIN-CUT: flat and planar ground keep the old cut, and both cuts wind up', () => {
  const flat = new Float32Array(H * H).fill(0.3);
  assert.deepEqual(buildTerrainIndices(1, flat), buildTerrainIndices(1), 'a flat pixel draws the old triangles exactly');
  const plane = samplesOf((x, z) => 50 + 2 * x - 3 * z);
  const mesh = meshOf(plane, 1);
  for (const [lx, lz] of points(300, 0x7a11)) {
    assert.ok(Math.abs(mesh.height(lx, lz) - (50 + 2 * lx / CELL - 3 * lz / CELL)) < 2e-3, 'and a plane is its own height everywhere');
  }
  // every triangle of both cuts faces up (counter-clockwise from above), as the ground's culling needs
  const rough = samplesOf(roughGround);
  const { positions } = buildTerrainGrid(rough, 1, null);
  const indices = buildTerrainIndices(1, rough);
  let seNw = 0;
  for (let t = 0; t < 128 * 128 * 6; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => indices[t + k] * 3);
    const e1 = [positions[b] - positions[a], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 2] - positions[a + 2]];
    assert.ok(e1[1] * e2[0] - e1[0] * e2[1] > 0, `triangle ${t / 3} faces up`);
  }
  for (let qx = 0; qx < 128; qx++) for (let qz = 0; qz < 128; qz++) seNw += quadCutsSeNw(rough, qx, qz) ? 1 : 0;
  assert.ok(seNw > 1000 && seNw < 128 * 128 - 1000, `rough ground takes both cuts (${seNw} of 16384 the other way)`);
  // the quad helpers agree with each other: a corner field read on the written triangles
  const out = new Uint32Array(6);
  for (const cut of [false, true]) {
    writeQuadTriangles(out, 0, 0, 2, cut);
    const corner = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const values = [1, 5, 2, 11];
    for (const [ax, az] of points(50, 0x51 + Number(cut), 1)) {
      const inFirst = cut ? ax + az <= 1 : az >= ax;
      const tri = inFirst ? out.subarray(0, 3) : out.subarray(3, 6);
      const [p, q, r] = [...tri].map((i) => corner[i === 2 ? 2 : i === 3 ? 3 : i]);
      const den = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]);
      const wp = ((q[1] - r[1]) * (ax - r[0]) + (r[0] - q[0]) * (az - r[1])) / den;
      const wq = ((r[1] - p[1]) * (ax - r[0]) + (p[0] - r[0]) * (az - r[1])) / den;
      const want = wp * values[tri[0]] + wq * values[tri[1]] + (1 - wp - wq) * values[tri[2]];
      assert.ok(Math.abs(quadValueAt(...values, ax, az, cut) - want) < 1e-9, `cut ${cut}: (${ax}, ${az})`);
    }
  }
});

test('TERRAIN-CUT: every reader of the drawn ground agrees with the triangles it draws, at sampled points', () => {
  const data = samplesOf(roughGround);
  for (const stride of [1, 4]) {
    const grid = buildTerrainGrid(data, stride, null);
    const mesh = meshOf(data, stride, grid.positions);
    const g = 128 / stride + 1;
    // the bed's depths, carved off the vertices as the build carves them
    const depths = new Float32Array(g * g).map((_, i) => ((i * 7) % 5 === 0 ? 1 + (i % 3) : 0));
    const carved = meshOf(data, stride, carveBed(grid.positions, grid.normals, depths, g, g).positions);
    let worst = { height: 0, drawn: 0, normal: 0, value: 0, unity: 0 };
    for (const [lx, lz] of points(3000, 0x7e44 + stride, TERRAIN_SIZE - 0.01)) {
      const want = mesh.height(lx, lz);
      worst.height = Math.max(worst.height, Math.abs(surfaceHeightAt(data, lx, lz, stride) - want));
      worst.drawn = Math.max(worst.drawn, Math.abs(drawnGroundAt(data, lx, lz, stride, depths) - carved.height(lx, lz)));
      worst.value = Math.max(worst.value, Math.abs(gridValueAt(depths, g, g, CELL * stride, lx, lz, data, stride) - mesh.value(lx, lz, depths)));
      worst.unity = Math.max(worst.unity, Math.abs(terrainSampleHeightAt(data, lx, lz, stride) - want));
      const normal = surfaceNormalFromSamples(data, lx, lz, stride);
      const meshNormal = [0, 1, 2].map((k) => mesh.value(lx, lz, grid.normals, 3, k));
      const length = Math.hypot(...meshNormal);
      worst.normal = Math.max(worst.normal, ...normal.map((v, k) => Math.abs(v - meshNormal[k] / length)));
      if (stride === 1) {
        assert.ok(Math.abs(walkGroundAt(data, lx, lz) - want) < 1e-3, 'the walk floor is the near mesh');
        const kept = surfaceNormalAt(grid.normals, data, lx, lz);
        worst.normal = Math.max(worst.normal, ...kept.map((v, k) => Math.abs(v - meshNormal[k] / length)));
      }
    }
    assert.ok(worst.height < 1e-3, `stride ${stride}: surfaceHeightAt is the mesh to ${worst.height}`);
    assert.ok(worst.drawn < 1e-3, `stride ${stride}: drawnGroundAt is the carved mesh to ${worst.drawn}`);
    assert.ok(worst.value < 1e-4, `stride ${stride}: gridValueAt reads the bed on the mesh's triangles to ${worst.value}`);
    assert.ok(worst.normal < 1e-5, `stride ${stride}: the normals are the mesh's to ${worst.normal}`);
    assert.ok(worst.unity < 0.1, `stride ${stride}: terrainSampleHeightAt is the mesh to Unity's step, ${worst.unity}`);
  }
});

test('TERRAIN-CUT: the water\'s sheet, the coast\'s clip and the fence\'s ground walk take the ground\'s own triangles', () => {
  const data = samplesOf(roughGround);
  const water = WATER_DRAW_MASK_TABLE.findIndex((wet) => wet);
  for (const stride of [1, 4]) {
    const ground = triangleKeys(buildTerrainIndices(stride, data));
    const bytes = new Uint8Array(128 * 128);
    for (let tz = 20; tz < 90; tz++) for (let tx = 10; tx < 100; tx++) bytes[tz * 128 + tx] = water;
    const sheet = buildPixelWaterIndices(bytes, stride, data);
    assert.ok(sheet.length > 0 && [...triangleKeys(sheet)].every((k) => ground.has(k)), `stride ${stride}: every water triangle is one the ground draws`);
    const clip = new Uint8Array(128 * 128);
    for (let tz = 0; tz < 40; tz++) for (let tx = 0; tx < 128; tx++) clip[tz * 128 + tx] = CLIP_SENTINEL;
    const kept = clippedTerrainIndices(clip, stride, false, data);
    const keptQuads = [...triangleKeys(kept.subarray(0, (128 / stride) * (128 / stride - 40 / stride) * 6))];
    assert.ok(keptQuads.every((k) => ground.has(k)), `stride ${stride}: the clip keeps the ground's own triangles`);
  }
  // a fence's ground walk is exact on either cut: its lowest and highest are the drawn ground's along the segment
  for (const [ax, az, bx, bz] of [[30, 700, 760, 40], [100, 100, 700, 650], [410.3, 12.2, 409.1, 800.7]]) {
    const [lo, hi] = groundAlong(data, ax, az, bx, bz);
    let fineLo = Infinity;
    let fineHi = -Infinity;
    for (let t = 0; t <= 1; t += 1 / 200000) {
      const y = surfaceHeightAt(data, ax + (bx - ax) * t, az + (bz - az) * t);
      fineLo = Math.min(fineLo, y);
      fineHi = Math.max(fineHi, y);
    }
    assert.ok(lo <= fineLo + 1e-9 && lo > fineLo - 2e-2, `lowest along (${ax}, ${az})-(${bx}, ${bz}): ${lo} against ${fineLo}`);
    assert.ok(hi >= fineHi - 1e-9 && hi < fineHi + 2e-2, `highest along it: ${hi} against ${fineHi}`);
  }
});
