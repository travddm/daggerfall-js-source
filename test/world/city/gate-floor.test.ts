// The city gate's floor face is left undrawn where the gate road is laid (world/city/gate-floor.ts): the face is found
// by its geometry and its texture, only a gate whose opening stands on a road tile loses it, and the model a gate
// swaps to at dusk and dawn is made the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { customModelFor } from '../../../src/world/customModels.js';
import { GATE_OPENING } from '../../../src/world/townWalls.js';
import {
  floorlessGateId,
  gateOpensOnRoad,
  installFloorlessGates,
  withoutGateFloor,
  FLOORLESS_GATE_BASE,
} from '../../../src/world/city/gate-floor.ts';

type SubMesh = { textureArchive: number; textureRecord: number; startIndex: number; primitiveCount: number };
type Model = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; subMeshes: SubMesh[] };

/**
 * A gate in the shape the pipeline mints: submesh 0 is the wall set's record 2 with two floor triangles on the block
 * plane (facing up) and one ceiling triangle 6.4 m up (facing down); submesh 1 is a wall face standing on the plane
 * (record 0, facing sideways). The model wears the temperate summer archive; the winter swap is made at draw time.
 */
function gate(): Model {
  const archive = 317;
  const corners: Array<[number, number, number, number]> = [
    [-8, 0, -4.8, 1],
    [1.6, 0, -4.8, 1],
    [1.6, 0, 4.8, 1],
    [-8, 0, 4.8, 1],
    [-8, 6.4, -4.8, -1],
    [1.6, 6.4, -4.8, -1],
    [1.6, 6.4, 4.8, -1],
    [-8, 0, 4.8, 0],
    [1.6, 0, 4.8, 0],
    [1.6, 5, 4.8, 0],
  ];
  const positions = new Float32Array(corners.flatMap(([x, y, z]) => [x, y, z]));
  const normals = new Float32Array(corners.flatMap(([, , , ny]) => [0, ny, ny === 0 ? 1 : 0]));
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9]);
  return {
    positions,
    normals,
    indices,
    subMeshes: [
      { textureArchive: archive, textureRecord: 2, startIndex: 0, primitiveCount: 3 },
      { textureArchive: archive, textureRecord: 0, startIndex: 9, primitiveCount: 1 },
    ],
  };
}

const trianglesOf = (model: Model, submesh: number): number[][] => {
  const { startIndex, primitiveCount } = model.subMeshes[submesh];
  const out: number[][] = [];
  for (let first = startIndex; first < startIndex + primitiveCount * 3; first += 3) {
    out.push([model.indices[first], model.indices[first + 1], model.indices[first + 2]]);
  }
  return out;
};

test('the floor face is dropped, and nothing else', () => {
  const before = gate();
  const after = withoutGateFloor(before) as Model;
  assert.deepEqual(trianglesOf(after, 0), [[4, 5, 6]], 'only the ceiling is left of the floor record');
  assert.deepEqual(trianglesOf(after, 1), [[7, 8, 9]], 'the wall face is kept');
  assert.equal(after.positions, before.positions, 'the vertices are shared, not copied');
  assert.deepEqual(
    after.subMeshes.map((s) => [s.textureArchive, s.textureRecord]),
    before.subMeshes.map((s) => [s.textureArchive, s.textureRecord]),
  );
});

test("a face is the floor only when it lies on the plane, faces up and wears the wall set's record 2", () => {
  const other = gate();
  other.subMeshes[0].textureRecord = 1;
  assert.equal(withoutGateFloor(other), other, 'another record of the set is no floor');

  const otherSet = gate();
  otherSet.subMeshes[0].textureArchive = 302;
  assert.equal(withoutGateFloor(otherSet), otherSet, 'a ground texture set is no floor');

  const raised = gate();
  for (const vertex of [0, 1, 2, 3]) raised.positions[vertex * 3 + 1] = 0.5;
  assert.equal(withoutGateFloor(raised), raised, 'a face off the plane is no floor');

  const upsideDown = gate();
  for (const vertex of [0, 1, 2, 3]) upsideDown.normals[vertex * 3 + 1] = -1;
  assert.equal(withoutGateFloor(upsideDown), upsideDown, 'a face looking down is no floor');
});

test('a model with no floor face comes back unchanged', () => {
  const model = gate();
  model.indices = new Uint32Array([4, 5, 6, 7, 8, 9]);
  model.subMeshes = [
    { textureArchive: 317, textureRecord: 2, startIndex: 0, primitiveCount: 1 },
    { textureArchive: 317, textureRecord: 0, startIndex: 3, primitiveCount: 1 },
  ];
  assert.equal(withoutGateFloor(model), model);
});

/** A gate's matrix, column-major: its +x axis turned `turns` quarter turns about y, standing at (x, z). */
function placement(x: number, z: number, turns = 0): number[] {
  const cos = [1, 0, -1, 0][turns % 4];
  const sin = [0, 1, 0, -1][turns % 4];
  return [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, x, 0, z, 1];
}

/** The road tile map with one tile marked at pixel-local metres (x, z). */
function roadAt(x: number, z: number): Uint8Array {
  const paths = new Uint8Array(128 * 128);
  paths[Math.floor(x / 6.4) + Math.floor(z / 6.4) * 128] = 1;
  return paths;
}

test('a gate opens on the road when the tile under its opening is a road tile', () => {
  for (const turns of [0, 1, 2, 3]) {
    const matrix = placement(300, 200, turns);
    const middleX = matrix[0] * GATE_OPENING.along + matrix[12];
    const middleZ = matrix[2] * GATE_OPENING.along + matrix[14];
    assert.equal(gateOpensOnRoad(matrix, roadAt(middleX, middleZ)), true, `turned ${turns} quarter turns`);
    assert.equal(
      gateOpensOnRoad(matrix, roadAt(middleX + 40, middleZ + 40)),
      false,
      `a road 40 m off is no gate road (${turns})`,
    );
  }
});

test('a pixel with no road paint, or a gate off the pixel, leaves the floor face', () => {
  assert.equal(gateOpensOnRoad(placement(300, 200), null), false, "no paths: the model is Daggerfall's");
  assert.equal(gateOpensOnRoad(placement(300, 200), new Uint8Array(128 * 128)), false, 'no road tile');
  assert.equal(gateOpensOnRoad(placement(-50, 2000), roadAt(300, 200)), false, 'off the pixel');
});

test('the floorless gate models are registered once, built from the classic record, under ids past every other model', () => {
  installFloorlessGates();
  installFloorlessGates();
  const classic = gate();
  const asked: number[] = [];
  for (const gateModelId of [446, 447]) {
    const built = customModelFor(floorlessGateId(gateModelId), {
      classicModel: (id: number) => {
        asked.push(id);
        return classic;
      },
    }) as Model;
    assert.deepEqual(trianglesOf(built, 0), [[4, 5, 6]]);
  }
  assert.deepEqual(asked, [446, 447]);
  assert.equal(floorlessGateId(446), FLOORLESS_GATE_BASE + 446);
});

// Daggerfall's own gate models, when the player's ARCH3D is at hand (ARENA2_PATH): the face is found by its geometry in
// the real record - exactly the two floor triangles - and the 9.7 m opening is what is left bare.
const arena2 = process.env.ARENA2_PATH;
test(
  'in the real gate models the floor face is two triangles, and dropping them leaves the arch',
  { skip: !(arena2 && existsSync(join(arena2, 'ARCH3D.BSA'))) },
  async () => {
    const { Arch3dFile } = await import('../../../src/formats/arch3dFile.js');
    const { dfMeshToModel } = await import('../../../src/world/meshReader.js');
    const arch = new Arch3dFile();
    arch.load(new Uint8Array(readFileSync(join(arena2 as string, 'ARCH3D.BSA'))));
    for (const gateModelId of [446, 447]) {
      const model = dfMeshToModel(arch.getMesh(arch.getRecordIndex(gateModelId)), () => ({
        width: 64,
        height: 64,
      })) as Model;
      const stripped = withoutGateFloor(model) as Model;
      const before = model.subMeshes.reduce((sum, s) => sum + s.primitiveCount, 0);
      const after = stripped.subMeshes.reduce((sum, s) => sum + s.primitiveCount, 0);
      assert.equal(before - after, 2, `model ${gateModelId}: the two triangles of the floor face`);
    }
  },
);
