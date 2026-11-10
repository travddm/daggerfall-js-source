// @ts-check
// The first-person arm's carried parts, found before the build: the weapon and the node it hangs on, the arrow on a
// drawn bow, the left hand's weapon, the held torch and the lantern at the waist. Each answer is a list of parts (slot,
// bones, mesh bytes, an optional transform applied before the bone) and the notes a missing piece leaves.
//
// The node names come from the retail files: every humanoid skeleton carries "Weapon Bone" and "Shield Bone", none
// carries "Weapon Bone Left" or an arrow bone, and every bow mesh carries an "ArrowBone" node that its own animation
// moves. The held light's turn was measured on those files (LIGHT_ATTITUDE).
import { nodeTransformOf } from '../../formats/morrowind/mwCharacter.js';
import {
  dfWeaponToMw,
  dfWeaponShape,
  pickWeaponRecord,
  weaponAttachBone,
  MW_WEAPON_TYPE,
  ammoTypeFor,
  arrowAttachBone,
  ARROW_FALLBACK_NODE,
  pickTorchRecord,
  pickLanternRecord,
} from '../../formats/morrowind/mwFirstPerson.js';
import { WEAPONS } from '../../characters/weapons.js';
import { materialName } from '../../systems/item/itemInfo.js';
import { ammoCountFor } from '../../systems/inventory.js';
import { nifBytes, parseNifOnce, skeletonHasBone } from './archiveBytes.js';

/**
 * @typedef {{ a: ArrayLike<number>, t: ArrayLike<number> }} Affine
 * @typedef {{ slot: string, bones: string[], bytes: Uint8Array | undefined, preTransform?: Affine | null,
 *   preClip?: { nif: object, node: string } | null, ammo?: boolean, hang?: object }} CarriedPart
 * @typedef {{ id: string, name: string, model: string, type: number, bone: string, speed: number }} WeaponInfo
 * @typedef {{ id: string, name: string, model: string, type: number, bone: string, viaWeaponMesh: boolean }} ArrowInfo
 */

/** Whether the pack holds Daggerfall arrows. The count is inventory.js's, next to the rule that spends them. */
export const hasDaggerfallArrows = (items) => ammoCountFor(items, null) > 0;
/** The same question asked for the held weapon, so a caller need not know which weapon takes ammunition. */
export const hasAmmoFor = (items, weapon) => ammoCountFor(items, weapon) > 0;

/** The weapon record a Daggerfall item draws as: its Morrowind type, its material, its shape, and present in the
 *  archives. weaponPartPaths and resolveWeaponParts both pick through this, so the preload reads what the build uses. */
function weaponRecordFor(weapon, mwType, allWeapons, has) {
  const material = weapon ? materialName(weapon) : null;
  return pickWeaponRecord(allWeapons, mwType, material, { has, shape: dfWeaponShape(weapon, WEAPONS) });
}

/** The ammunition record a drawn bow shows. Any unenchanted record of the ammunition type that the archives carry. */
function ammoRecordFor(ammoType, allWeapons, has) {
  return pickWeaponRecord(allWeapons, ammoType, null, { has });
}

/**
 * The archive paths resolveWeaponParts reads, so the build can load them first: the weapon's mesh, and the
 * ammunition's mesh when the weapon takes ammunition and the pack holds some. Which node a part hangs on is answered
 * from the skeleton bytes the caller already holds, so it needs no path here.
 */
export function weaponPartPaths({ weapon, hasAmmo = false, allWeapons, has = null }) {
  const paths = [];
  const mwType = dfWeaponToMw(weapon, WEAPONS);
  if (mwType === MW_WEAPON_TYPE.None) return paths;
  const rec = weaponRecordFor(weapon, mwType, allWeapons, has);
  if (rec) paths.push(`meshes/${rec.model}`);
  const ammoType = ammoTypeFor(mwType);
  if (ammoType !== MW_WEAPON_TYPE.None && hasAmmo) {
    const ammoRec = ammoRecordFor(ammoType, allWeapons, has);
    if (ammoRec) paths.push(`meshes/${ammoRec.model}`);
  }
  return paths;
}

/** The held torch's mesh path, for the same preload. */
export function torchPartPaths({ torch = false, allLights, has = null }) {
  if (!torch) return [];
  const rec = pickTorchRecord(allLights, { has });
  return rec ? [`meshes/${rec.model}`] : [];
}

/**
 * The node a held light hangs on. Daggerfall's lit light is the player's light source, a torch lit by use. In
 * Morrowind a carried light is held in the left hand on the shield's node, as a shield is. A skeleton without the
 * node is reported, never given another node. `hasBone` answers for the skeleton as assembled; a test can pass one
 * for a skeleton without the node.
 */
export const TORCH_BONE = 'Shield Bone';
/**
 * The turn a held light is given before its node, and only a light: -90 degrees about X, row-major, in the
 * `{ a: 3x3, t: 3 }` shape of a part's preTransform.
 *
 * The retail torch mesh (light_torch10.nif) stands along its own +Z: the handle's end at z -25.5, the AttachLight
 * node at z +25.2. Placed on Shield Bone of base_anim.nif, base_animkna.nif and xbase_anim.1st.nif, posed in the
 * "torch" group, this turn stands the handle-to-flame axis within about 8 degrees of straight up (its up component is
 * 0.97 to 0.99). The mesh unturned lies nearly level (up component about 0.1), and no other quarter turn about one
 * axis comes closer to upright. A weapon gets no such turn: its meshes are made to lie along the hand.
 */
export const LIGHT_ATTITUDE = Object.freeze({
  a: Object.freeze([1, 0, 0, 0, 0, 1, 0, -1, 0]),
  t: Object.freeze([0, 0, 0]),
});
export function resolveTorchPart({ torch = false, allLights, find, skeletonBytes, has = null, hasBone = null }) {
  const notes = [];
  const parts = [];
  let torchInfo = null;
  if (!torch) return { parts, torchInfo, notes };
  const rec = pickTorchRecord(allLights, { has });
  if (!rec) {
    notes.push('torch: your archives carry no carriable Morrowind torch (a LIGH record named torch, with its mesh)');
    return { parts, torchInfo, notes };
  }
  const path = `meshes/${rec.model}`;
  const arc = find(path);
  if (!arc) {
    notes.push(`torch: ${path} (${rec.id}) is not in your archives`);
    return { parts, torchInfo, notes };
  }
  const carries = hasBone ? hasBone(TORCH_BONE) : skeletonHasBone(skeletonBytes, TORCH_BONE);
  if (!carries) {
    notes.push(`torch: this skeleton has no "${TORCH_BONE}" - nowhere to hold it`);
    return { parts, torchInfo, notes };
  }
  parts.push({ slot: 'torch', bones: [TORCH_BONE], bytes: nifBytes(arc, path), preTransform: LIGHT_ATTITUDE });
  torchInfo = { id: rec.id, name: rec.name, model: rec.model, bone: TORCH_BONE, fire: !!rec.fire, attitude: true };
  return { parts, torchInfo, notes };
}

/**
 * The lantern at the waist, on the third-person body only.
 *
 * Handheld Torches can hang a lit lantern at the waist instead of the hand (systems/playerTorch.js lanternAtWaist).
 * Morrowind hangs no light on a belt, so every value here is this game's own:
 *
 *   the record - pickLanternRecord: a carriable light named lantern, chosen as pickTorchRecord chooses a torch;
 *   the node   - `Bip01 Pelvis`, which the retail third-person skeleton carries; the pelvis stands at (0, 1.8, 76.4)
 *                in the actor's units (Z up, +Y forward, -X left), measured with buildSkeleton and poseSkeleton;
 *   the hook   - HIP_LANTERN_HOOK, off the pelvis in the same axes: the right hip, clear of the one-handed scabbard at
 *                the left (Bip01 LongBladeOneHand at (-10.8, 7.8, 86.5)) and of the thigh (Bip01 R Thigh at x 6.6),
 *                a little forward, at the scabbard's belt height;
 *   the hang   - plumb from the hook, not turned with the pelvis (mwFirstPerson.js hangAffine), swung by
 *                systems/lanternSwing.js from the body's motion each frame it is drawn;
 *   the size   - a belt lantern's (hipLanternSize), whatever size the record's mesh was made at;
 *   the body   - the third-person body alone: the first-person arms have no hip, and a lantern at the waist is a light
 *                the hand does not hold.
 *
 * The carried-left rule never hides it, because it is in no hand: only an unlit lantern is not drawn.
 */
export const HIP_LIGHT_BONE = 'Bip01 Pelvis';
export const HIP_LIGHT_SLOT = 'hiplight';
export const HIP_LANTERN_HOOK = Object.freeze([14, 5, 9.5]);
/** The hang's rest attitude, and the portrait's: a figure standing still holds its lantern straight down, and the
 *  world frame writes the swing into the hang before the next pose, so the picture stays the same every time. */
export const PLUMB = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
export function hipLanternPartPaths({ hipLight = false, allLights, has = null }) {
  if (!hipLight) return [];
  const rec = pickLanternRecord(allLights, { has });
  return rec ? [`meshes/${rec.model}`] : [];
}
export function resolveHipLanternPart({
  hipLight = false,
  allLights,
  find,
  skeletonBytes,
  has = null,
  hasBone = null,
}) {
  const notes = [];
  const parts = [];
  let hipInfo = null;
  if (!hipLight) return { parts, hipInfo, notes };
  const rec = pickLanternRecord(allLights, { has });
  if (!rec) {
    notes.push(
      'hiplight: your archives carry no carriable Morrowind lantern (a LIGH record named lantern, with its mesh)',
    );
    return { parts, hipInfo, notes };
  }
  const path = `meshes/${rec.model}`;
  const arc = find(path);
  if (!arc) {
    notes.push(`hiplight: ${path} (${rec.id}) is not in your archives`);
    return { parts, hipInfo, notes };
  }
  const carries = hasBone ? hasBone(HIP_LIGHT_BONE) : skeletonHasBone(skeletonBytes, HIP_LIGHT_BONE);
  if (!carries) {
    notes.push(`hiplight: this skeleton has no "${HIP_LIGHT_BONE}" - nowhere to hang it`);
    return { parts, hipInfo, notes };
  }
  // The hang is the part's own: the swing writes `rot` each frame, the bind fills the hook and the anchor.
  const hang = { rot: Float32Array.from(PLUMB), hookLocal: null, anchor: null };
  parts.push({ slot: HIP_LIGHT_SLOT, bones: [HIP_LIGHT_BONE], bytes: nifBytes(arc, path), hang });
  hipInfo = { id: rec.id, name: rec.name, model: rec.model, bone: HIP_LIGHT_BONE, fire: !!rec.fire };
  return { parts, hipInfo, notes };
}

/** Whether any attached archive lists a path, which is all pickWeaponRecord asks of them. Not findLoaded: that one
 *  throws for a listed path that is not loaded yet, and a record's presence is asked before the preload loads it. */
export const archiveHas = (archives) => (p) => (archives ?? []).some((a) => a.has(p));

/** A bow that resolves with ammunition in the pack and no arrow on it is a fault the player sees and cannot name.
 *  The card notes it, but the card is a menu away, so the console says it too, once per reason. */
const saidArrow = new Set();
function sayNoArrow(notes) {
  const why = notes.filter((n) => n.startsWith('arrow')).join('; ') || 'no reason recorded';
  if (saidArrow.has(why)) return;
  saidArrow.add(why);
  console.warn(`[mw] the bow carries no arrow - ${why}`);
}

/** The node every humanoid skeleton carries for the weapon hand. */
const HAND_WEAPON_BONE = 'Weapon Bone';

/**
 * The node the left hand's weapon hangs on: the bow's node (weaponAttachBone of MarksmanBow). The binder mirrors a
 * part on a node whose name contains "Left" (mwCharacter.js bindPart), so a sword hung here is the right hand's sword
 * mirrored, which is what a second hand holds.
 */
export const OFF_WEAPON_BONE = weaponAttachBone(MW_WEAPON_TYPE.MarksmanBow);

const noBoneNote = (slot, bone, what) => `${slot}: this skeleton has no "${bone}" bone to hang ${what} on`;
/**
 * The left hand's weapon: the record and mesh the right hand's would take (resolveWeaponParts), hung on the left
 * hand's node in a slot of its own ('offweapon'). No arrow: a pair is two melee weapons
 * (combat/twoHands/handsLaw.js DUAL_TYPES).
 *
 * The node is asked of the skeleton as assembled (`hasBone`), as the holster asks. The retail skeletons carry no
 * "Weapon Bone Left" in their bytes; the player's rigs get one, made by mirroring their own Weapon Bone
 * (assembleFirstPersonArm's `offWeaponBone`, combat/twoHands/mirrorRig.js offWeaponBoneAddon). Without `hasBone` the
 * bytes are asked. A skeleton that has no such node even so draws no second weapon and says so: a sword hung on any
 * other node would hang unmirrored, the wrong way round in the hand.
 */
export function resolveOffWeaponParts({ weapon, allWeapons, find, skeletonBytes, has = null, hasBone = null }) {
  if (!weapon) return { parts: [], info: null, notes: [] };
  const r = resolveWeaponParts({ weapon, hasAmmo: false, allWeapons, find, skeletonBytes, has });
  const main = r.parts.find((p) => p.slot === 'weapon');
  const notes = r.notes.filter((n) => /^weapon[ :@]/.test(n)).map((n) => n.replace(/^weapon/, 'offweapon'));
  if (!main) return { parts: [], info: null, notes };
  const carries = hasBone ? hasBone(OFF_WEAPON_BONE) : skeletonHasBone(skeletonBytes, OFF_WEAPON_BONE);
  if (!carries) {
    return {
      parts: [],
      info: null,
      notes: [...notes, noBoneNote('offweapon', OFF_WEAPON_BONE, r.weaponInfo?.name ?? main.slot)],
    };
  }
  return {
    parts: [{ slot: 'offweapon', bones: [OFF_WEAPON_BONE], bytes: main.bytes }],
    info: { ...r.weaponInfo, bone: OFF_WEAPON_BONE },
    notes,
  };
}

/**
 * The node a weapon of this type hangs on, on this skeleton. Each type names its own node (weaponAttachBone): the
 * bow's is "Weapon Bone Left", every other type's is the hand's "Weapon Bone". A skeleton that lacks the type's own
 * node holds the weapon in the hand instead of dropping it. No retail skeleton carries "Weapon Bone Left", so on the
 * retail files a bow hangs on "Weapon Bone"; a skeleton that does carry it draws the bow mirrored, by the binder's
 * "Left" rule.
 * @param {Uint8Array} skeletonBytes
 * @param {number} mwType
 * @returns {string}
 */
function weaponNodeOn(skeletonBytes, mwType) {
  const own = weaponAttachBone(mwType);
  if (own === HAND_WEAPON_BONE) return own;
  return skeletonHasBone(skeletonBytes, own) ? own : HAND_WEAPON_BONE;
}

/**
 * Where the arrow on a drawn bow sits. Two places are tried, in this order:
 *
 *   1. a node of the actor's skeleton named for the ammunition (arrowAttachBone of the weapon's type);
 *   2. the ArrowBone node inside the weapon's own mesh. The arrow then hangs on the weapon's node with the ArrowBone's
 *      transform in the mesh applied first, so it goes where the bow goes, mirror included. The bow's animation moves
 *      that node from the quiver to the string and back (formats/morrowind/mwPartClock.js): `preClip` names it so the
 *      clock can pose it each frame, and `pre` is its rest.
 *
 * No retail skeleton carries an arrow node, so on the retail files every bow takes the second place. Answers null
 * when neither exists.
 * @returns {{ bone: string, pre: Affine | null, preClip: { nif: object, node: string } | null,
 *   viaWeaponMesh: boolean } | null}
 */
function arrowPlacement(skeletonBytes, mwType, weaponBytes, weaponBone) {
  const actorNode = arrowAttachBone(mwType);
  if (actorNode && skeletonHasBone(skeletonBytes, actorNode)) {
    return { bone: actorNode, pre: null, preClip: null, viaWeaponMesh: false };
  }
  const weaponNif = parseNifOnce(weaponBytes);
  const pre = nodeTransformOf(weaponNif, ARROW_FALLBACK_NODE);
  if (!pre) return null;
  return { bone: weaponBone, pre, preClip: { nif: weaponNif, node: ARROW_FALLBACK_NODE }, viaWeaponMesh: true };
}

/**
 * The arrow part for a drawn bow, appended to `parts` and `notes`. Ammunition is a rigid part like the weapon, but it
 * takes no node offset of its own: `ammo: true` tells the binder so.
 * @returns {ArrowInfo | null}
 */
function resolveArrowPart({ weaponInfo, weaponBytes, allWeapons, find, skeletonBytes, has, parts, notes }) {
  const ammoType = ammoTypeFor(weaponInfo.type);
  const ammoRec = ammoRecordFor(ammoType, allWeapons, has);
  if (!ammoRec) {
    notes.push(`arrow: your archives carry no unenchanted Morrowind ammunition of type ${ammoType}`);
    return null;
  }
  const ammoPath = `meshes/${ammoRec.model}`;
  const ammoArc = find(ammoPath);
  if (!ammoArc) {
    notes.push(`arrow: ${ammoPath} (${ammoRec.id}) is not in your archives`);
    return null;
  }
  const place = arrowPlacement(skeletonBytes, weaponInfo.type, weaponBytes, weaponInfo.bone);
  if (!place) {
    notes.push(
      `arrow: neither this skeleton's "${arrowAttachBone(weaponInfo.type)}" bone nor an ` +
        `"${ARROW_FALLBACK_NODE}" node in ${weaponInfo.model} - nowhere to put it`,
    );
    return null;
  }
  parts.push({
    slot: 'arrow',
    bones: [place.bone],
    bytes: nifBytes(ammoArc, ammoPath),
    preTransform: place.pre,
    preClip: place.preClip,
    ammo: true,
  });
  return {
    id: ammoRec.id,
    name: ammoRec.name,
    model: ammoRec.model,
    type: ammoType,
    bone: place.bone,
    viaWeaponMesh: place.viaWeaponMesh,
  };
}

/**
 * The parts a held Daggerfall weapon draws as: the Morrowind record of its type, material and shape, hung on its
 * type's node (weaponNodeOn), and, for a weapon that takes ammunition when the pack holds some, the arrow on it
 * (arrowPlacement). A weapon is a rigid part with an explicit `bones` list, not a body part from PART_BONES. A live
 * equip change resolves through this function too, so the build and the swap agree.
 *
 * Every piece that cannot be found leaves a note in the player's words, and the card shows them.
 * @returns {{ mwType: number, parts: CarriedPart[], weaponInfo: WeaponInfo | null, arrowInfo: ArrowInfo | null,
 *   notes: string[] }}
 */
export function resolveWeaponParts({ weapon, hasAmmo = false, allWeapons, find, skeletonBytes, has = null }) {
  /** @type {string[]} */
  const notes = [];
  /** @type {CarriedPart[]} */
  const parts = [];
  /** @type {WeaponInfo | null} */
  let weaponInfo = null;
  /** @type {ArrowInfo | null} */
  let arrowInfo = null;
  const mwType = dfWeaponToMw(weapon, WEAPONS);
  const takesAmmo = ammoTypeFor(mwType) !== MW_WEAPON_TYPE.None;
  if (mwType === MW_WEAPON_TYPE.None) {
    if (weapon) notes.push('weapon: Morrowind has no weapon type for what you are holding');
    return { mwType, parts, weaponInfo, arrowInfo, notes };
  }
  const rec = weaponRecordFor(weapon, mwType, allWeapons, has);
  const path = rec ? `meshes/${rec.model}` : null;
  const arc = rec ? find(path) : null;
  if (!rec) notes.push(`weapon: your archives carry no unenchanted Morrowind weapon of type ${mwType}`);
  else if (!arc) notes.push(`weapon: ${path} (${rec.id}) is not in your archives`);
  else {
    const bone = weaponNodeOn(skeletonBytes, mwType);
    const weaponBytes = nifBytes(arc, path);
    parts.push({ slot: 'weapon', bones: [bone], bytes: weaponBytes });
    // The record's own attack speed paces the weapon's groups; a record without one plays at 1.
    weaponInfo = { id: rec.id, name: rec.name, model: rec.model, type: mwType, bone, speed: rec.speed || 1 };
    if (takesAmmo && hasAmmo) {
      arrowInfo = resolveArrowPart({ weaponInfo, weaponBytes, allWeapons, find, skeletonBytes, has, parts, notes });
    }
  }
  if (hasAmmo && weaponInfo && takesAmmo && !arrowInfo) sayNoArrow(notes);
  return { mwType, parts, weaponInfo, arrowInfo, notes };
}
