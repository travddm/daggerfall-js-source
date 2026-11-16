// Kit walls that reach the floor and the ceiling (world/interior/kit-wall-ends.ts): the end rows of a wall piece move
// out one unit, nothing else moves, and over the game's own residences the slits between the walls and the floor and
// ceiling tiles close without opening others.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extendKitWallEnds, type DfMesh } from '../../src/world/interior/kit-wall-ends.ts';

type Point = { x: number; y: number; z: number };
const plane = (points: number[][]) => ({ points: points.map(([x, y, z]) => ({ x, y, z })) });
const ys = (mesh: DfMesh): number[] =>
  mesh.subMeshes.flatMap((s) => s.planes.flatMap((p) => p.points.map((q: Point) => q.y)));

/** Model 3000's shape: a wall 126 units tall (y points down) with a doorway whose lintel stands at -26. */
const wall = (): DfMesh => ({
  subMeshes: [
    {
      planes: [
        plane([
          [-3, -26, 25],
          [-3, -63, 58],
          [-3, 63, 58],
          [-3, 63, 25],
        ]),
        plane([
          [-3, -26, 25],
          [3, -26, 25],
          [3, -26, -25],
          [-3, -26, -25],
        ]),
        // a row written a 1/256 grid step off, as models 3016 and 3716 write theirs
        plane([
          [0, 63.00390625, 58],
          [0, 63, 0],
          [0, -63, 0],
          [0, -62.99609375, 58],
        ]),
      ],
    },
  ],
});

test("a kit wall's foot row moves down to the floor and its top row up to the ceiling; the lintel stays where its frame meets it", () => {
  const before = wall();
  const after = extendKitWallEnds(3000, before);
  assert.notEqual(after, before, 'a copy');
  assert.deepEqual(ys(after), [-26, -64, 64, 64, -26, -26, -26, -26, 64, 64, -64, -64]);
  assert.deepEqual(
    ys(before),
    [-26, -63, 63, 63, -26, -26, -26, -26, 63.00390625, 63, -63, -62.99609375],
    'the shared mesh untouched',
  );
  const xz = (m: DfMesh) => m.subMeshes.flatMap((s) => s.planes.flatMap((p) => p.points.map((q: Point) => [q.x, q.z])));
  assert.deepEqual(xz(after), xz(before), 'nothing moves sideways');
});

test("a two-storey piece's foot moves to its floor, and its top, which meets its ceiling already, stays", () => {
  const tall: DfMesh = {
    subMeshes: [
      {
        planes: [
          plane([
            [0, 128, 58],
            [0, 128, -58],
            [0, -127, -58],
            [0, -127, 58],
          ]),
        ],
      },
    ],
  };
  assert.deepEqual(ys(extendKitWallEnds(3001, tall)), [129, 129, -127, -127]);
});

test('anything else comes back as it was: a model outside the kit, and a kit piece of another height', () => {
  const room = wall();
  assert.equal(extendKitWallEnds(31000, room), room, 'a room shell');
  assert.equal(extendKitWallEnds(1000, room), room, 'a floor tile');
  const odd: DfMesh = {
    subMeshes: [
      {
        planes: [
          plane([
            [0, 40, 0],
            [0, -40, 0],
            [0, -40, 5],
          ]),
        ],
      },
    ],
  };
  assert.equal(extendKitWallEnds(3500, odd), odd, 'a piece 80 units tall');
});

const ARENA2 = process.env.ARENA2_PATH;
test(
  'over every residence, the slits between kit walls and floor or ceiling tiles close, and no other seam opens (needs ARENA2)',
  { skip: !(ARENA2 && existsSync(join(ARENA2, 'BLOCKS.BSA'))) && 'no ARENA2' },
  async () => {
    const { BlocksFile, BLOCK_TYPES } = await import('../../src/formats/blocksFile.js');
    const { Arch3dFile } = await import('../../src/formats/arch3dFile.js');
    const { layoutInterior, hasInteriorModels } = await import('../../src/world/interior/interiorLayout.js');
    const { dfMeshToModel } = await import('../../src/world/meshReader.js');
    const { patchSeams } = await import('../../src/world/arch3dSeams.js');
    const { blockSeams } = await import('../../tools/seamCensus.mjs');
    const blocks = new BlocksFile();
    blocks.load(new Uint8Array(readFileSync(join(ARENA2 as string, 'BLOCKS.BSA'))));
    const arch = new Arch3dFile();
    arch.load(new Uint8Array(readFileSync(join(ARENA2 as string, 'ARCH3D.BSA'))));
    const isKit = (id: number) => id >= 3000 && id < 5000;
    const isTile = (id: number) => id >= 1000 && id < 3000;
    const isProp = (id: number) => id >= 41000 && id < 44000;
    /** The residences' seams with each model drawn as `draw` answers it: [kit-to-tile seams, interiors with one, others]. */
    const census = (draw: (id: number, mesh: DfMesh) => DfMesh) => {
      const meshes = new Map<number, DfMesh | null>();
      const meshOf = (id: number) => {
        if (!meshes.has(id)) {
          const index = arch.getRecordIndex(id);
          meshes.set(id, index === -1 ? null : draw(id, patchSeams(id, arch.getMesh(index))));
        }
        return meshes.get(id);
      };
      const getModel = (id: number) => {
        const mesh = meshOf(id);
        return mesh ? dfMeshToModel(mesh, () => ({ width: 64, height: 64 })) : null;
      };
      let kitSeams = 0;
      let interiors = 0;
      let others = 0;
      for (let b = 0; b < blocks.count; b++) {
        if (blocks.getBlockType(b) !== BLOCK_TYPES.Rmb || !blocks.getBlockName(b).startsWith('RESI')) continue;
        const block = blocks.getBlock(b);
        block.rmbBlock.subRecords.forEach((record: unknown, r: number) => {
          if (!hasInteriorModels(record)) return;
          const seams = blockSeams(layoutInterior(block, b, r, getModel).placements, meshOf).seams;
          const kit = seams.filter(
            (s: any) => (isKit(s.model) && isTile(s.partner)) || (isTile(s.model) && isKit(s.partner)),
          );
          kitSeams += kit.length;
          if (kit.length) interiors++;
          others += seams.filter((s: any) => !isProp(s.model)).length - kit.length;
        });
      }
      return [kitSeams, interiors, others];
    };
    const [beforeSeams, beforeInteriors, beforeOthers] = census((_, mesh) => mesh);
    const [afterSeams, afterInteriors, afterOthers] = census(extendKitWallEnds);
    assert.deepEqual([beforeSeams, beforeInteriors], [3833, 103], "the slits as Daggerfall's residences have them");
    assert.deepEqual(
      [afterSeams, afterInteriors],
      [88, 2],
      'left: walls placed one unit low, a unit short of their ceiling',
    );
    assert.equal(afterOthers, beforeOthers, 'no seam of any other pair opened');
  },
);
