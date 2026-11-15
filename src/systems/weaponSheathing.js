// @ts-check
// The sheathed weapon on the third-person body. The vendored Weapon Sheathing mod supplies the art (71 scabbard meshes
// and three skeleton add-ons under vendor/weapon-sheathing/, served by weaponSheathingAssets.js). The rules for using
// it are in weapon-holster.ts, and this module wires them to the mesh readers of the Morrowind layer.
//
//   1. The bones. Every .nif under `animations/<model>/` is a bone add-on: the skeleton takes the nodes it does not
//      know under the node of their parent's name (mwSkin.js injectSkeletonNodes). The add-on of the base skeleton
//      brings fourteen: twelve for the weapon kinds, "Bip01 AttachShield" and "Bip01 AttachWeapon".
//   2. The holster. A sheathed weapon hangs at the bone of its kind. If `<model>_sh.nif` exists it is the scabbard:
//      the whole file attaches at that bone and stays, its "Bip01 Weapon" node is hidden while the weapon is in the
//      hand, and an empty node is filled with the weapon's own mesh. Without a scabbard the weapon's mesh hangs at the
//      bone while sheathed. A thrown weapon is a stack and never holsters.
//   3. The quiver. A scabbard with a "Bip01 Ammo" node takes one instance of the equipped ammunition's mesh under each
//      child of the node, as many as there are rounds.
//
// Third person only. The pieces are rigid parts through the binder that the weapon in the hand uses, but bare: no bone
// offset and no mirror.

import { findNodeByName, nodeTransformOf } from '../formats/morrowind/mwCharacter.js';
import { deref } from '../formats/morrowind/mwNifFile.js';
import { holsterPartsFor } from './weapon-holster.ts';

export {
  HOLSTER_SLOTS,
  SHEATHING_BONE,
  SHEATH_AMMO_NODE,
  SHEATH_WEAPON_NODE,
  animationsDirOf,
  boneSourcesFor,
  holsterHidden,
  holsterPartPaths,
  holsters,
  sheathedMeshPath,
  vendoredDataPath,
} from './weapon-holster.ts';

/** The mesh readers of the Morrowind layer, in the shape `holsterPartsFor` takes. */
const NODE_READER = {
  findNode: findNodeByName,
  transformOf: nodeTransformOf,
  recordAt: (/** @type {any} */ nif, /** @type {number} */ ref) => deref(nif, ref),
};

/**
 * The holster's parts for the third-person body. `weaponBytes` is the base mesh already in hand, `ammo` the resolved
 * ammunition `{ bytes, type }` or null, `ammoCount` the stack. `find(path)` answers the archive holding a loaded path,
 * `hasBone` asks the skeleton after its add-ons. `parseNif` is passed in so that this module stays a leaf of the
 * format layer's parser.
 *
 * @param {Parameters<typeof holsterPartsFor>[0]} input
 * @returns {ReturnType<typeof holsterPartsFor>}
 */
export function resolveHolsterParts(input) {
  return holsterPartsFor(input, NODE_READER);
}

/** The archive of vendored files lives in urlArchive.js; it is re-exported so that every import still resolves. */
export { makeVendoredArchive } from './urlArchive.js';
