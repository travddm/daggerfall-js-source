// The crack seal (render/crack-seal.ts): a merged batch whose faces meet at T-junctions, or whose corners stand a hair
// apart, comes out with every seam's vertices shared, the same area, the same winding and its texture places blended.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sealCracks, type BatchMesh } from '../../src/render/crack-seal.ts';
import { StaticBatchBuilder } from '../../src/render/staticBatch.js';

type Vec = [number, number, number];

/** A batch from quads on the floor (y = 0): each quad [x0, z0, x1, z1], two triangles, up-facing, its uv its x and z. */
function floor(quads: number[][]): BatchMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const [x0, z0, x1, z1] of quads) {
    const base = positions.length / 3;
    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ]) {
      positions.push(x, 0, z);
      uvs.push(x, z);
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    subMeshes: [{ startIndex: 0, primitiveCount: indices.length / 3 }],
  };
}

const corner = (m: BatchMesh, v: number): Vec => [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]];

function triangles(m: BatchMesh): Vec[][] {
  const out: Vec[][] = [];
  for (let i = 0; i < m.indices.length; i += 3) out.push([0, 1, 2].map((k) => corner(m, m.indices[i + k])));
  return out;
}

/** Up-facing area, signed by winding: (b - a) x (c - a), its y. */
const signedArea = (t: Vec[]): number =>
  ((t[2][0] - t[0][0]) * (t[1][2] - t[0][2]) - (t[1][0] - t[0][0]) * (t[2][2] - t[0][2])) / 2;

/** Vertices lying inside another triangle's edge, not at its ends. */
function tJunctions(m: BatchMesh): number {
  const faces = triangles(m);
  let n = 0;
  faces.forEach((t, i) => {
    for (const v of t) {
      faces.forEach((u, j) => {
        if (i === j) return;
        for (let e = 0; e < 3; e++) {
          const a = u[e];
          const b = u[(e + 1) % 3];
          const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const l2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
          const s = ((v[0] - a[0]) * d[0] + (v[1] - a[1]) * d[1] + (v[2] - a[2]) * d[2]) / l2;
          if (s <= 1e-4 || s >= 1 - 1e-4) continue;
          if (Math.hypot(v[0] - a[0] - s * d[0], v[1] - a[1] - s * d[1], v[2] - a[2] - s * d[2]) < 1e-4) n++;
        }
      });
    }
  });
  return n;
}

test('a floor face beside two smaller ones: the T-junction is split, the area and the winding kept', () => {
  // One quad 2 m wide, and beside it two quads 1 m wide: the corner at x = 1 lies inside the wide quad's edge.
  const mesh = floor([
    [0, 0, 2, 1],
    [0, 1, 1, 2],
    [1, 1, 2, 2],
  ]);
  assert.ok(tJunctions(mesh) > 0, 'the floor has its T-junction before');
  const before = triangles(mesh).reduce((s, t) => s + signedArea(t), 0);
  const result = sealCracks(mesh);
  assert.equal(tJunctions(mesh), 0);
  assert.ok(result.split >= 1);
  const after = triangles(mesh);
  assert.ok(Math.abs(after.reduce((s, t) => s + signedArea(t), 0) - before) < 1e-6, 'the same area');
  assert.ok(
    after.every((t) => signedArea(t) * Math.sign(before) > -1e-9),
    'no triangle turned over',
  );
});

test('a split corner takes its texture place along its own edge, and its normal stays the face normal', () => {
  const mesh = floor([
    [0, 0, 2, 1],
    [0, 1, 1, 2],
  ]);
  sealCracks(mesh);
  // The new vertex on the wide quad's edge at (1, 0, 1): its uv blended along that edge is (1, 1).
  let found = false;
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    const [x, y, z] = corner(mesh, v);
    if (x === 1 && y === 0 && z === 1) {
      assert.deepEqual([mesh.uvs[v * 2], mesh.uvs[v * 2 + 1]], [1, 1]);
      assert.deepEqual([mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]], [0, 1, 0]);
      found = true;
    }
  }
  assert.ok(found);
});

test('corners a few millimetres apart take one position; corners further apart do not move', () => {
  const mesh = floor([
    [0, 0, 1, 1],
    [1.005, 0, 2, 1],
    [3, 0, 4, 1],
  ]);
  const result = sealCracks(mesh);
  assert.ok(result.welded >= 2);
  const xs = new Set<number>();
  for (let v = 0; v < mesh.positions.length / 3; v++) xs.add(mesh.positions[v * 3]);
  assert.ok(!xs.has(Math.fround(1.005)), 'the near corner joined its neighbour');
  assert.ok(xs.has(3) && xs.has(4), 'the far quad kept its corners');
});

test('a floor with no T-junction is left as it was', () => {
  const mesh = floor([
    [0, 0, 1, 1],
    [1, 0, 2, 1],
  ]);
  const indices = Array.from(mesh.indices);
  const result = sealCracks(mesh);
  assert.deepEqual(result, { welded: 0, split: 0 });
  assert.deepEqual(Array.from(mesh.indices), indices);
});

test('the batch builder seals when asked, and its shadow cells cover the sealed triangles', () => {
  const quad = floor([
    [0, 0, 2, 1],
    [0, 1, 1, 2],
    [1, 1, 2, 2],
  ]);
  const cpu = {
    ...quad,
    subMeshes: [{ textureArchive: 1, textureRecord: 2, startIndex: 0, primitiveCount: quad.indices.length / 3 }],
  };
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const plain = new StaticBatchBuilder();
  plain.add(cpu, identity, (a: number, r: number) => `${a}_${r}`);
  const unsealed = plain.finish();
  const sealing = new StaticBatchBuilder({ seal: true, shadowCell: 16 });
  sealing.add(cpu, identity, (a: number, r: number) => `${a}_${r}`);
  const sealed = sealing.finish();
  assert.ok(tJunctions(unsealed) > 0);
  assert.equal(tJunctions(sealed), 0);
  assert.equal(sealed.triangles, sealed.indices.length / 3);
  assert.equal(sealed.shadowIndices.length, sealed.indices.length, 'every sealed triangle is in a shadow cell');
});

const ARENA2 = process.env.ARENA2_PATH;
test(
  `RESIAL02.RMB` + "'s first interior, the game's own floors: sealed, no floor T-junction is left (needs ARENA2)",
  { skip: !(ARENA2 && existsSync(join(ARENA2, 'BLOCKS.BSA'))) && 'no ARENA2' },
  async () => {
    const { BlocksFile } = await import('../../src/formats/blocksFile.js');
    const { Arch3dFile } = await import('../../src/formats/arch3dFile.js');
    const { layoutInterior } = await import('../../src/world/interior/interiorLayout.js');
    const { dfMeshToModel } = await import('../../src/world/meshReader.js');
    const { patchSeams } = await import('../../src/world/arch3dSeams.js');
    const blocks = new BlocksFile();
    blocks.load(readFileSync(join(ARENA2 as string, 'BLOCKS.BSA')));
    const arch = new Arch3dFile();
    arch.load(readFileSync(join(ARENA2 as string, 'ARCH3D.BSA')));
    const getModel = (id: number) => {
      const i = arch.getRecordIndex(id);
      return i === -1 ? null : dfMeshToModel(patchSeams(id, arch.getMesh(i)), () => ({ width: 64, height: 64 }));
    };
    const index = blocks.getBlockIndex(`RESIAL02.RMB`);
    const layout = layoutInterior(blocks.getBlock(index), index, 0, getModel);
    const merge = (seal: boolean) => {
      const builder = new StaticBatchBuilder({ seal });
      for (const p of layout.placements) {
        const model = getModel(p.modelIdNum);
        if (model) builder.add(model, p.matrix, (a: number, r: number) => `${a}_${r}`);
      }
      return builder.finish();
    };
    const upFacing = (m: BatchMesh): BatchMesh => {
      const kept: number[] = [];
      for (let i = 0; i < m.indices.length; i += 3) {
        const t = [0, 1, 2].map((k) => corner(m, m.indices[i + k]));
        const ux = t[1][0] - t[0][0];
        const uz = t[1][2] - t[0][2];
        const wx = t[2][0] - t[0][0];
        const wz = t[2][2] - t[0][2];
        const uy = t[1][1] - t[0][1];
        const wy = t[2][1] - t[0][1];
        const n = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
        if (Math.abs(n[1]) / (Math.hypot(n[0], n[1], n[2]) || 1) > 0.95)
          kept.push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
      }
      return { ...m, indices: new Uint32Array(kept), subMeshes: [{ startIndex: 0, primitiveCount: kept.length / 3 }] };
    };
    assert.ok(tJunctions(upFacing(merge(false))) > 0, 'the floors meet at T-junctions as the game data has them');
    assert.equal(tJunctions(upFacing(merge(true))), 0);
  },
);
