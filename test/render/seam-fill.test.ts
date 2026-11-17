// Seams filled in a room's merged batch (render/seam-fill.ts): an edge that stops a few centimetres short of another
// face gets a strip to it, drawn from both sides; an edge that meets a face, one in open space and a prop's are left
// alone; and over the game's own residences no slit is left in the architecture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillSeams, REACH } from '../../src/render/seam-fill.ts';
import type { BatchMesh } from '../../src/render/crack-seal.ts';

type Quad = [number, number, number][];

/** A batch of quads, two triangles each, one sub-mesh a quad. */
function batch(quads: Quad[]): BatchMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const q of quads) {
    const base = positions.length / 3;
    for (const p of q) positions.push(...p);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    uvs: new Float32Array((positions.length / 3) * 2),
    indices: new Uint32Array(indices),
    subMeshes: quads.map((_, i) => ({ startIndex: i * 6, primitiveCount: 2 })),
  };
}
/** A wall in the plane z = 0 from x0 to x1, 2 m high, its foot at `foot`. */
const wall = (x0: number, x1: number, foot = 0): Quad => [
  [x0, foot, 0],
  [x1, foot, 0],
  [x1, 2, 0],
  [x0, 2, 0],
];
/** A floor at y = 0 from z -1 to 1. */
const floor: Quad = [
  [-1, 0, -1],
  [-1, 0, 1],
  [3, 0, 1],
  [3, 0, -1],
];

test("a wall's foot 2.5 cm over the floor gets a strip down to it, both windings, in the wall's own sub-mesh", () => {
  const mesh = batch([wall(0, 2, 0.025), floor]);
  const filled = fillSeams(mesh, () => true);
  assert.equal(filled, 1, 'the one slit: the foot');
  assert.equal(mesh.subMeshes[0].primitiveCount, 2 + 4, "the strip is the wall's: two triangles, each way");
  assert.equal(mesh.subMeshes[1].primitiveCount, 2, 'the floor is unchanged');
  const ys = new Set<number>();
  for (let k = mesh.subMeshes[0].startIndex + 6; k < mesh.subMeshes[0].startIndex + 18; k++)
    ys.add(+mesh.positions[mesh.indices[k] * 3 + 1].toFixed(4));
  assert.deepEqual([...ys].sort(), [0, 0.025], 'from the foot to the floor');
  assert.equal(
    fillSeams(mesh, () => true, { countOnly: true }),
    0,
    'no slit left',
  );
});

test("a wall that stands on the floor, one that stands far over it, and a prop's edge are left alone", () => {
  assert.equal(
    fillSeams(batch([wall(0, 2, 0), floor]), () => true),
    0,
    'on the floor: no slit',
  );
  assert.equal(
    fillSeams(batch([wall(0, 2, REACH * 2), floor]), () => true),
    0,
    'in open space: no slit',
  );
  const withProp = batch([wall(0, 2, 0.025), floor]);
  assert.equal(
    fillSeams(withProp, (t) => t >= 2),
    0,
    'the wall is a prop: not filled',
  );
});

test('two walls in line, a slit of 1 cm between their ends, are joined', () => {
  const mesh = batch([wall(0, 1), wall(1.01, 2)]);
  assert.ok(fillSeams(mesh, () => true) >= 1);
  assert.equal(
    fillSeams(mesh, () => true, { countOnly: true }),
    0,
  );
});

const ARENA2 = process.env.ARENA2_PATH;
test(
  "over every residence, the slits between the architecture's models are filled, none left (needs ARENA2)",
  { skip: !(ARENA2 && existsSync(join(ARENA2, 'BLOCKS.BSA'))) && 'no ARENA2' },
  async () => {
    const { BlocksFile, BLOCK_TYPES } = await import('../../src/formats/blocksFile.js');
    const { Arch3dFile } = await import('../../src/formats/arch3dFile.js');
    const { layoutInterior, hasInteriorModels, PROP_MODEL_TYPE } =
      await import('../../src/world/interior/interiorLayout.js');
    const { dfMeshToModel } = await import('../../src/world/meshReader.js');
    const { extendKitWallEnds } = await import('../../src/world/interior/kit-wall-ends.ts');
    // by a computed path: the dungeon seam patch reaches imports that need the DOM types the Node type pass lacks
    const seamsModule = '../../src/world/arch3dSeams.js';
    const { patchSeams } = await import(seamsModule);
    const { StaticBatchBuilder } = await import('../../src/render/staticBatch.js');
    const blocks = new BlocksFile();
    blocks.load(new Uint8Array(readFileSync(join(ARENA2 as string, 'BLOCKS.BSA'))));
    const arch = new Arch3dFile();
    arch.load(new Uint8Array(readFileSync(join(ARENA2 as string, 'ARCH3D.BSA'))));
    const models = new Map<number, ReturnType<typeof dfMeshToModel> | null>();
    const getModel = (id: number) => {
      if (!models.has(id)) {
        const index = arch.getRecordIndex(id);
        models.set(
          id,
          index === -1
            ? null
            : dfMeshToModel(extendKitWallEnds(id, patchSeams(id, arch.getMesh(index))), () => ({
                width: 64,
                height: 64,
              })),
        );
      }
      return models.get(id);
    };
    let before = 0;
    let after = 0;
    for (let b = 0; b < blocks.count; b++) {
      if (blocks.getBlockType(b) !== BLOCK_TYPES.Rmb || !blocks.getBlockName(b).startsWith('RESI')) continue;
      const block = blocks.getBlock(b);
      block.rmbBlock.subRecords.forEach((record: unknown, r: number) => {
        if (!hasInteriorModels(record)) return;
        const layout = layoutInterior(block, b, r, getModel);
        /** The room's architecture as the game merges it: sealed, and filled when asked. */
        const merged = (fill: boolean) => {
          const builder = new StaticBatchBuilder({ seal: true, fill });
          for (const p of layout.placements) {
            if (p.objectType === PROP_MODEL_TYPE) continue;
            const model = getModel(p.modelIdNum);
            if (model) builder.add(model, p.matrix, (a: number, k: number) => `${a}_${k}`, null, { fill: true });
          }
          return builder.finish();
        };
        const sealed = merged(false);
        if (!sealed) return;
        before += fillSeams(sealed, () => true, { countOnly: true });
        after += fillSeams(merged(true), () => true, { countOnly: true });
      });
    }
    assert.equal(before, 4303, "the slits as Daggerfall's residences have them, with the kit walls already reaching");
    assert.equal(after, 0, 'every one filled');
  },
);
