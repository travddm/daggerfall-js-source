// Doors that fill their doorway (world/interior/door-fit.ts): each edge of an interior action door moves out one unit,
// other models are left alone, and over the game's own residences no closed door leaves a gap at its edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitDoorToFrame, type DfMesh } from '../../src/world/interior/door-fit.ts';

type Point = { x: number; y: number; z: number };
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): DfMesh => ({
  subMeshes: [
    {
      planes: [
        {
          points: [
            { x: x0, y: y0, z: z0 },
            { x: x1, y: y0, z: z0 },
            { x: x1, y: y1, z: z0 },
            { x: x0, y: y1, z: z0 },
          ],
        },
        {
          points: [
            { x: x0, y: y0, z: z1 },
            { x: x1, y: y0, z: z1 },
            { x: x1, y: y1, z: z1 },
            { x: x0, y: y1, z: z1 },
          ],
        },
      ],
    },
  ],
});
const corners = (m: DfMesh) =>
  m.subMeshes.flatMap((s) => s.planes.flatMap((p) => p.points.map((q: Point) => [q.x, q.y, q.z])));

test("an interior door grows one unit at each edge and keeps its thickness; the archive's mesh is untouched", () => {
  const door = box(-1, 47, -44, 44, -7, -1);
  const fitted = fitDoorToFrame(9003, door);
  assert.deepEqual(corners(fitted), [
    [-2, -45, -7],
    [48, -45, -7],
    [48, 45, -7],
    [-2, 45, -7],
    [-2, -45, -1],
    [48, -45, -1],
    [48, 45, -1],
    [-2, 45, -1],
  ]);
  assert.deepEqual(corners(door)[0], [-1, -44, -7], 'a copy');
});

test('anything else comes back as it was: another model, and a door model of another shape', () => {
  const door = box(-1, 47, -44, 44, -7, -1);
  assert.equal(fitDoorToFrame(3000, door), door, 'a wall piece');
  assert.equal(fitDoorToFrame(55000, door), door, 'a dungeon door');
  const other = box(0, 40, -50, 50, -7, -1);
  assert.equal(fitDoorToFrame(9000, other), other, 'a replaced door model the edges were not measured on');
});

const ARENA2 = process.env.ARENA2_PATH;
test(
  'over every residence, a closed door leaves no gap at its sides, its top or its foot (needs ARENA2)',
  { skip: !(ARENA2 && existsSync(join(ARENA2, 'BLOCKS.BSA'))) && 'no ARENA2' },
  async () => {
    const { BlocksFile, BLOCK_TYPES } = await import('../../src/formats/blocksFile.js');
    const { Arch3dFile } = await import('../../src/formats/arch3dFile.js');
    const { layoutInterior, hasInteriorModels } = await import('../../src/world/interior/interiorLayout.js');
    const { dfMeshToModel, GLOBAL_SCALE } = await import('../../src/world/meshReader.js');
    const { transformPoint } = await import('../../src/world/mat4.js');
    const { extendKitWallEnds } = await import('../../src/world/interior/kit-wall-ends.ts');
    const blocks = new BlocksFile();
    blocks.load(new Uint8Array(readFileSync(join(ARENA2 as string, 'BLOCKS.BSA'))));
    const arch = new Arch3dFile();
    arch.load(new Uint8Array(readFileSync(join(ARENA2 as string, 'ARCH3D.BSA'))));
    type Vec = number[];
    const sub = (a: Vec, b: Vec) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a: Vec, b: Vec) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    /** How far along d from o the triangle a b c is met, or Infinity. */
    const hit = (o: Vec, d: Vec, a: Vec, b: Vec, c: Vec) => {
      const e1 = sub(b, a);
      const e2 = sub(c, a);
      const p = cross(d, e2);
      const det = dot(e1, p);
      if (Math.abs(det) < 1e-12) return Infinity;
      const s = sub(o, a);
      const u = dot(s, p) / det;
      if (u < 0 || u > 1) return Infinity;
      const q = cross(s, e1);
      const v = dot(d, q) / det;
      if (v < 0 || u + v > 1) return Infinity;
      const t = dot(e2, q) / det;
      return t > 1e-6 ? t : Infinity;
    };
    /** Doors of the residences with a gap between a narrow face and the room, the room's models as `draw` answers. */
    const gaps = (draw: (id: number, mesh: DfMesh) => DfMesh) => {
      const meshOf = (id: number) => {
        const index = arch.getRecordIndex(id);
        return index === -1 ? null : draw(id, arch.getMesh(index));
      };
      const models = new Map<number, any>();
      const getModel = (id: number) => {
        if (!models.has(id)) {
          const mesh = meshOf(id);
          models.set(id, mesh ? dfMeshToModel(mesh, () => ({ width: 64, height: 64 })) : null);
        }
        return models.get(id);
      };
      let open = 0;
      for (let b = 0; b < blocks.count; b++) {
        if (blocks.getBlockType(b) !== BLOCK_TYPES.Rmb || !blocks.getBlockName(b).startsWith('RESI')) continue;
        const block = blocks.getBlock(b);
        block.rmbBlock.subRecords.forEach((record: unknown, r: number) => {
          if (!hasInteriorModels(record)) return;
          const layout = layoutInterior(block, b, r, getModel);
          const triangles: Vec[][] = [];
          for (const placement of layout.placements) {
            if (placement.modelIdNum >= 41000) continue;
            const model = getModel(placement.modelIdNum);
            if (!model) continue;
            const at = (i: number) =>
              transformPoint(
                placement.matrix,
                model.positions[i * 3],
                model.positions[i * 3 + 1],
                model.positions[i * 3 + 2],
              );
            for (let t = 0; t < model.indices.length; t += 3)
              triangles.push([at(model.indices[t]), at(model.indices[t + 1]), at(model.indices[t + 2])]);
          }
          for (const door of layout.actionDoors) {
            const mesh = meshOf(door.modelIdNum) as DfMesh;
            const xs = corners(mesh).map((c) => c[0]);
            const ys = corners(mesh).map((c) => c[1]);
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            // the middle of each narrow face, and out from it (ARCH3D y points down; the slab's middle is z -4)
            const faces: Array<[Vec, Vec]> = [
              [
                [x0, 0, -4],
                [-1, 0, 0],
              ],
              [
                [x1, 0, -4],
                [1, 0, 0],
              ],
              [
                [(x0 + x1) / 2, y0, -4],
                [0, -1, 0],
              ],
              [
                [(x0 + x1) / 2, y1, -4],
                [0, 1, 0],
              ],
            ];
            for (const [p, n] of faces) {
              const o = transformPoint(door.matrix, p[0] * GLOBAL_SCALE, -p[1] * GLOBAL_SCALE, p[2] * GLOBAL_SCALE);
              const tip = transformPoint(
                door.matrix,
                (p[0] + n[0]) * GLOBAL_SCALE,
                -(p[1] + n[1]) * GLOBAL_SCALE,
                p[2] * GLOBAL_SCALE,
              );
              const d = sub(tip, o).map((v) => v / GLOBAL_SCALE);
              // from 2 mm inside the door, so a face lying on the floor or the jamb meets it at once
              const inside = [o[0] - d[0] * 0.002, o[1] - d[1] * 0.002, o[2] - d[2] * 0.002];
              let nearest = Infinity;
              for (const [a, bb, c] of triangles) nearest = Math.min(nearest, hit(inside, d, a, bb, c) - 0.002);
              if (nearest > 0.005 && nearest < 0.1) open++; // a face 5 mm to 10 cm from the room: a gap
            }
          }
        });
      }
      return open;
    };
    const before = gaps((_, mesh) => mesh);
    const after = gaps((id, mesh) => fitDoorToFrame(id, extendKitWallEnds(id, mesh)));
    assert.equal(before, 11377, "the narrow faces of the residences' doors with a gap, as Daggerfall has them");
    assert.equal(after, 0, 'every closed door meets its frame and its floor');
  },
);
