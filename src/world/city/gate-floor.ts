// The city gate model's floor face, and when it is left undrawn.
//
// Daggerfall's gate models (ARCH3D 446 open, 447 closed) carry a 9.7 m by 9.6 m floor face under the arch, at the block
// plane, textured from the city-wall set's record 2. The winter swap turns that record into flat white snow. The gate
// road (world/road/gateRoads.js, a port addition) is laid on the ground tiles under the arch, and the floor face lies
// over it, so the road seems to stop under a light slab. Where the gate road is laid, the floor face is not drawn and
// the road tiles and the ground's own snow show. With no gate road the model is Daggerfall's, floor face included.

import { GATE_OPENING } from '../townWalls.js';
import { registerCustomModel } from '../customModels.js';

/** The city-wall texture set (archive number modulo 100). The model carries the temperate summer archive, 317; the
 *  climate and season swap (a remap at draw time) turns it into the winter one, 318, and the other climates' sets. */
export const CITY_WALL_TEXTURE_SET = 17;
/** The record of that set the floor face is textured from. */
export const GATE_FLOOR_RECORD = 2;
/** How far from the block plane a vertex may lie and still be on the floor, in metres. */
const ON_PLANE_M = 0.005;
/** The smallest upward normal a floor face has. */
const FLOOR_NORMAL_Y = 0.9;
/** The ground tiles' side in metres. */
const TILE_M = 6.4;
/** A pixel's tiles along one side. */
const TILES_PER_SIDE = 128;

/** The first id of the models this module registers, past every ARCH3D record and mod id. */
export const FLOORLESS_GATE_BASE = 1_000_000;

export type GateModel = {
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
  subMeshes: Array<{ textureArchive: number; textureRecord: number; startIndex: number; primitiveCount: number }>;
  [other: string]: unknown;
};

/** The id of the gate model with no floor face for a gate model id (446 or 447). */
export const floorlessGateId = (gateModelId: number): number => FLOORLESS_GATE_BASE + gateModelId;

/** Whether a triangle of a submesh is the floor face: the wall set's floor record, flat on the block plane, facing up. */
function isFloorTriangle(model: GateModel, submesh: GateModel['subMeshes'][number], first: number): boolean {
  if (submesh.textureArchive % 100 !== CITY_WALL_TEXTURE_SET || submesh.textureRecord !== GATE_FLOOR_RECORD)
    return false;
  for (let corner = 0; corner < 3; corner++) {
    const vertex = model.indices[first + corner];
    if (Math.abs(model.positions[vertex * 3 + 1]) > ON_PLANE_M) return false;
    if (model.normals[vertex * 3 + 1] < FLOOR_NORMAL_Y) return false;
  }
  return true;
}

/**
 * The gate model without its floor face. Every other triangle, vertex and submesh is kept as it is, so the arch, the
 * ceiling, the doors and the towers are unchanged. A model with no such face (a mod's own gate) is returned as it is.
 */
export function withoutGateFloor(model: GateModel): GateModel {
  const kept: number[] = [];
  const subMeshes: GateModel['subMeshes'] = [];
  let dropped = 0;
  for (const submesh of model.subMeshes) {
    const startIndex = kept.length;
    for (let first = submesh.startIndex; first < submesh.startIndex + submesh.primitiveCount * 3; first += 3) {
      if (isFloorTriangle(model, submesh, first)) {
        dropped++;
        continue;
      }
      kept.push(model.indices[first], model.indices[first + 1], model.indices[first + 2]);
    }
    const primitiveCount = (kept.length - startIndex) / 3;
    if (primitiveCount > 0) subMeshes.push({ ...submesh, startIndex, primitiveCount });
  }
  if (dropped === 0) return model;
  return { ...model, indices: new Uint32Array(kept), subMeshes };
}

/**
 * Whether a placed gate's opening stands on road tiles: the tile under the opening's middle, or under a point half way
 * to either edge of the opening, is one the road painter or the gate road holds. `placement` is the gate's matrix in
 * pixel-local metres (column-major, as the pixel build keeps it); `paths` holds a byte a tile, x + y * 128, non-zero
 * for a road tile, or is null where no road network was painted.
 */
export function gateOpensOnRoad(placement: ArrayLike<number>, paths: Uint8Array | null): boolean {
  if (!paths) return false;
  const offsets = [0, -GATE_OPENING.half / 2, GATE_OPENING.half / 2];
  for (const offset of offsets) {
    const along = GATE_OPENING.along + offset;
    const x = placement[0] * along + placement[12];
    const z = placement[2] * along + placement[14];
    const tileX = Math.floor(x / TILE_M);
    const tileY = Math.floor(z / TILE_M);
    if (tileX < 0 || tileY < 0 || tileX >= TILES_PER_SIDE || tileY >= TILES_PER_SIDE) continue;
    if (paths[tileX + tileY * TILES_PER_SIDE]) return true;
  }
  return false;
}

let installed = false;

/**
 * Registers the two floorless gate models (floorlessGateId) with the custom model door, each built from the player's
 * own ARCH3D record, so the pixel build can draw one in place of the gate model. Safe to call more than once.
 */
export function installFloorlessGates(): void {
  if (installed) return;
  installed = true;
  for (const gateModelId of [446, 447]) {
    registerCustomModel(
      floorlessGateId(gateModelId),
      (context: { classicModel?: (id: number) => GateModel | null } | null) => {
        const classic = context?.classicModel?.(gateModelId);
        return classic ? withoutGateFloor(classic) : null;
      },
      () => true,
      { needs: [gateModelId] },
    );
  }
}
