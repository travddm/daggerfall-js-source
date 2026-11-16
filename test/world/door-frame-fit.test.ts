// Doors fitted to their own doorway (world/interior/door-frame-fit.ts): each narrow face of a closed door is measured
// out to the room and moved by exactly that gap, so it stops on the jamb and never lies on the wall; and over the game's
// own residences no closed door keeps a gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { measureDoorGaps, fitDoorModel, MAX_GAP, type DoorModel } from '../../src/world/interior/door-frame-fit.ts';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** A box model, eight corners and its twelve triangles. */
function boxModel(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): DoorModel {
  const positions: number[] = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) positions.push(x, y, z);
  const indices = [
    0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
  ];
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
/** A quad as nine-number triangles: two of them. */
const quad = (a: number[], b: number[], c: number[], d: number[]): number[] => [...a, ...b, ...c, ...a, ...c, ...d];
/** A doorway in a wall at z = 0 to 0.15: jambs at x = -0.025 and 1.225, lintel at y = 2.25, floor at y = -0.075. */
const doorway = new Float32Array([
  ...quad([-0.025, -1, 0], [-0.025, 3, 0], [-0.025, 3, 0.15], [-0.025, -1, 0.15]),
  ...quad([1.225, -1, 0], [1.225, 3, 0], [1.225, 3, 0.15], [1.225, -1, 0.15]),
  ...quad([-1, 2.25, 0], [3, 2.25, 0], [3, 2.25, 0.15], [-1, 2.25, 0.15]),
  ...quad([-1, -0.075, -1], [3, -0.075, -1], [3, -0.075, 1], [-1, -0.075, 1]),
]);
const door = (): DoorModel => boxModel(0, 1.2, 0, 2.2, 0.01, 0.14);

test('each narrow face is measured out to the doorway: 2.5 cm at the sides, 5 cm under the lintel, 7.5 cm over the floor', () => {
  const gaps = measureDoorGaps(door(), IDENTITY, doorway);
  assert.deepEqual(Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, +v.toFixed(4)])), {
    hinge: 0.025,
    latch: 0.025,
    top: 0.05,
    foot: 0.075,
  });
});

test('the fitted door fills the doorway to its jambs, lintel and floor, and keeps its thickness; the shared model is untouched', () => {
  const original = door();
  const fitted = fitDoorModel(original, measureDoorGaps(original, IDENTITY, doorway));
  const axis = (m: DoorModel, k: number) => {
    const values = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3 + k]);
    return [+Math.min(...values).toFixed(4), +Math.max(...values).toFixed(4)];
  };
  assert.deepEqual(axis(fitted, 0), [-0.025, 1.225]);
  assert.deepEqual(axis(fitted, 1), [-0.075, 2.25]);
  assert.deepEqual(axis(fitted, 2), [0.01, 0.14], 'the thickness');
  assert.deepEqual(axis(original, 0), [0, 1.2], 'a copy');
  const again = measureDoorGaps(fitted, IDENTITY, doorway);
  assert.deepEqual([again.hinge, again.latch, again.top, again.foot], [0, 0, 0, 0], 'no gap left');
});

test('an edge that already meets its frame, or stands clear of any face within reach, does not move', () => {
  const room = new Float32Array([...doorway.slice(0, 36)]); // the jambs and lintel, no floor
  const tight = boxModel(-0.025, 1.225, 0, 2.25, 0.01, 0.14);
  const gaps = measureDoorGaps(tight, IDENTITY, room);
  assert.deepEqual(
    [gaps.hinge, gaps.latch, gaps.top, gaps.foot],
    [0, 0, 0, 0],
    `closed sides and top, and no floor within ${MAX_GAP} m`,
  );
});

const ARENA2 = process.env.ARENA2_PATH;
test(
  'over every residence, every closed door is fitted to its doorway: no gap is left (needs ARENA2)',
  { skip: !(ARENA2 && existsSync(join(ARENA2, 'BLOCKS.BSA'))) && 'no ARENA2' },
  async () => {
    const { BlocksFile, BLOCK_TYPES } = await import('../../src/formats/blocksFile.js');
    const { Arch3dFile } = await import('../../src/formats/arch3dFile.js');
    const { layoutInterior, hasInteriorModels, PROP_MODEL_TYPE } =
      await import('../../src/world/interior/interiorLayout.js');
    const { dfMeshToModel } = await import('../../src/world/meshReader.js');
    const { transformPoint } = await import('../../src/world/mat4.js');
    const { extendKitWallEnds } = await import('../../src/world/interior/kit-wall-ends.ts');
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
            : dfMeshToModel(extendKitWallEnds(id, arch.getMesh(index)), () => ({ width: 64, height: 64 })),
        );
      }
      return models.get(id);
    };
    let doors = 0;
    let gappedBefore = 0;
    let gappedAfter = 0;
    for (let b = 0; b < blocks.count; b++) {
      if (blocks.getBlockType(b) !== BLOCK_TYPES.Rmb || !blocks.getBlockName(b).startsWith('RESI')) continue;
      const block = blocks.getBlock(b);
      block.rmbBlock.subRecords.forEach((record: unknown, r: number) => {
        if (!hasInteriorModels(record)) return;
        const layout = layoutInterior(block, b, r, getModel);
        const faces: number[] = [];
        for (const p of layout.placements) {
          if (p.objectType === PROP_MODEL_TYPE) continue;
          const model = getModel(p.modelIdNum);
          if (!model) continue;
          for (let i = 0; i < model.indices.length; i++) {
            const v = model.indices[i] * 3;
            faces.push(...transformPoint(p.matrix, model.positions[v], model.positions[v + 1], model.positions[v + 2]));
          }
        }
        const room = new Float32Array(faces);
        for (const d of layout.actionDoors) {
          const model = getModel(d.modelIdNum);
          if (!model) continue;
          doors++;
          const gaps = measureDoorGaps(model, d.matrix, room);
          if (gaps.hinge || gaps.latch || gaps.top || gaps.foot) gappedBefore++;
          const after = measureDoorGaps(fitDoorModel(model, gaps), d.matrix, room);
          if (after.hinge || after.latch || after.top || after.foot) gappedAfter++;
        }
      });
    }
    assert.ok(
      doors > 2800 && gappedBefore > doors * 0.95,
      `nearly every residence door has a gap as Daggerfall hangs it (${gappedBefore} of ${doors})`,
    );
    assert.equal(gappedAfter, 0, 'every one fitted');
  },
);
