// The first-person arm's carried parts, found before the build: the weapon and the bone it hangs on, the arrow on a
// drawn bow, the left hand's weapon, the held torch and the lantern at the waist. Each answer is a list of parts
// (slot, bones, mesh bytes, an optional transform before the bone) and the notes a missing piece leaves.
// Moved out of fpArm.js unchanged; fpArm.js re-exports what it exported before.
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

/** Daggerfall's arrows in the pack. This test existed as THREE
 *  literals (the rig's out-of-arrows auto-sheathe, the card's build
 *  button, and the swap seam wanted a fourth) - one export now.
 *  AUDIT 68 S27-ammoCount-dup: and the COUNT under it is inventory.js's
 *  ammoCountFor, beside the spend law - this file carried a copy of it,
 *  and the copy was the one the rig read. */
export const hasDaggerfallArrows = (items) => ammoCountFor(items, null) > 0;
/** THE SAME QUESTION, ASKED OF THE WEAPON: a bow is out of ammunition
 *  when there are no Arrows, and every other weapon answers the same
 *  arrow test, so no caller has to know which it is holding. */
export const hasAmmoFor = (items, weapon) => ammoCountFor(items, weapon) > 0;

/**
 * MW-LOAD: THE ARCHIVE PATHS resolveWeaponParts WILL READ, before it
 * reads them - the picked weapon's model, and the ammunition's when the
 * type takes one and the player has it.
 *
 * It asks the SAME two record questions resolveWeaponParts asks, in the
 * same order, off the same records (dfWeaponToMw, then pickWeaponRecord
 * on the type; ammoTypeFor, then pickWeaponRecord on the ammo type), so
 * the preload cannot drift from the read. Everything else that function
 * decides - the attach bone, rule 13's mirror, getArrowBone's two
 * branches - is answered off skeleton bytes the caller already holds and
 * needs nothing from an archive.
 */
export function weaponPartPaths({ weapon, hasAmmo = false, allWeapons, has = null }) {
  const paths = [];
  const mwType = dfWeaponToMw(weapon, WEAPONS);
  if (mwType === MW_WEAPON_TYPE.None) return paths;
  const rec = pickWeaponRecord(allWeapons, mwType, weapon ? materialName(weapon) : null, {
    has,
    shape: dfWeaponShape(weapon, WEAPONS),
  }); // MW-D50: a record the archives carry
  if (rec) paths.push(`meshes/${rec.model}`);
  const ammoType = ammoTypeFor(mwType);
  if (ammoType !== MW_WEAPON_TYPE.None && hasAmmo) {
    const ammoRec = pickWeaponRecord(allWeapons, ammoType, null, { has });
    if (ammoRec) paths.push(`meshes/${ammoRec.model}`);
  }
  return paths;
}

/** MW-D51: THE HELD TORCH's mesh paths, for the build's one preload
 *  round - weaponPartPaths' twin. */
export function torchPartPaths({ torch = false, allLights, has = null }) {
  if (!torch) return [];
  const rec = pickTorchRecord(allLights, { has });
  return rec ? [`meshes/${rec.model}`] : [];
}

/** MW-D51: THE HELD TORCH, resolveWeaponParts' twin for Slot_CarriedLeft.
 *  Daggerfall's lit light is PlayerEntity.LightSource (the
 *  Torch item, lit by use - and Handheld Torches' hand law stows it
 *  when no hand is free); Morrowind's is the carried-left slot, whose
 *  LIGH record is instanced under "Shield Bone" exactly as a shield is
 *  (sPartList's PRT_Shield; npcanimation.cpp's updateParts reads
 *  Slot_CarriedLeft for a Light the same way). The rig without the
 *  bone is REPORTED, not silently swapped (`hasBone` is the same
 *  skeletonHasBone test the weapon's typed bone takes, injectable for
 *  a fixture without the bone). */
export const TORCH_BONE = 'Shield Bone';
/**
 * MWT1 - THE ATTITUDE A HELD LIGHT IS GIVEN, AND ONLY A LIGHT.
 *
 * The bone was right and the rotation was missing. `SceneUtil::attach`
 * puts ONE PositionAttitudeTransform between the actor's bone and the
 * attached model, and the only rotation it can carry is the caller's
 * `attitude` - which `ActorAnimation::attach` passes for `isLight` ALONE
 * (actoranimation.cpp:97-103) and never for a weapon (:104-105). It is an
 * extra -90 degrees about X, and this port's own reference notes wrote it
 * down at `02-Formats/Morrowind-Rules.md:3228` ("a held light (the torch
 * in the player's left hand) gets an extra -90 deg X rotation passed as
 * attitude") beside the two engine-injected transforms it DID port. The
 * torch hung at Shield Bone unrotated: the right bone, the wrong way up.
 *
 * Rx(-90) row-major, which is the shape `preTransform` already takes for
 * the arrow (`{ a: 3x3, t: 3 }`, applied to the positions before the
 * bone) - the same place in the chain the reference's PAT sits, and the
 * bone carries no "Left" so no mirror intervenes.
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
  parts.push({ slot: 'torch', bones: [TORCH_BONE], bytes: nifBytes(arc, path), preTransform: LIGHT_ATTITUDE }); // MWT1
  torchInfo = { id: rec.id, name: rec.name, model: rec.model, bone: TORCH_BONE, fire: !!rec.fire, attitude: true };
  return { parts, torchInfo, notes };
}

/**
 * HT-WAIST: THE LANTERN AT THE WAIST, on the third-person body.
 *
 * Handheld Torches' port-own `Handling.LanternsAtWaist` hangs a lit lantern at the waist instead of the hand
 * (systems/playerTorch.js lanternAtWaist is the one question). Morrowind has no lantern on a belt either - its
 * carried lights ride Slot_CarriedLeft at the Shield Bone, which is MW-D51's torch - so every number here is the
 * port's own and says so:
 *
 *   the RECORD - pickLanternRecord, pickTorchRecord's own shape for a carriable light named lantern;
 *   the BONE   - `Bip01 Pelvis`, which the retail third-person skeleton carries (Weapon Sheathing's vendored
 *                xbase_anim_sh.nif copies its Bip01 chain: the pelvis at (0, 1.8, 76.4) in the actor's Z-up,
 *                +Y-forward, -X-left units - measured with this port's own buildSkeleton / poseSkeleton);
 *   the HOOK   - HIP_LANTERN_HOOK, off the pelvis in those same axes: the RIGHT hip, clear of the one-handed
 *                scabbard that hangs at the left (Bip01 LongBladeOneHand, (-10.8, 7.8, 86.5)) and of the thigh
 *                (Bip01 R Thigh at x 6.6), a little forward, at belt height (the scabbard's own 86.5);
 *   the HANG   - plumb from the hook, not the pelvis's rotation (mwFirstPerson.js hangAffine), times the swing
 *                law (systems/lanternSwing.js) stepped off the body's motion every frame it is drawn;
 *   the SIZE   - a belt lantern's (hipLanternSize, HT-WAIST-SIZE), whatever size the record's mesh was made at;
 *   the RIG    - the third-person body ALONE: the first-person arms have no hip to hang it on, and a lantern at
 *                the waist is exactly the light the arm does NOT hold.
 *
 * It is never hidden by the carried-left rule (a lantern at the waist is in no hand, so a two-hander, a bow or a
 * spell does not put it away) - only by not being lit.
 */
export const HIP_LIGHT_BONE = 'Bip01 Pelvis';
export const HIP_LIGHT_SLOT = 'hiplight';
export const HIP_LANTERN_HOOK = Object.freeze([14, 5, 9.5]);
/** The hang's rest attitude - and the portrait's: the figure stands still, so its lantern hangs straight down
 *  (the world frame writes the swing back into the hang before it next poses; the picture stays deterministic). */
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

/** MW-D50: the archives' DIRECTORY - "is this path in any attached
 *  .bsa" - the one question pickWeaponRecord asks of them. Not
 *  findLoaded: that one throws for a path known but not yet read
 *  (MW-LOAD's guard), and a candidate's presence is asked BEFORE the
 *  preload that reads it. */
export const archiveHas = (archives) => (p) => (archives ?? []).some((a) => a.has(p));

/** MW-D50: said ONCE per reason, on the console, beside the card. A
 *  bow that resolves with ammunition in the pack and no arrow on it is
 *  a fault the player sees from the chair and could not name - the
 *  card's note is the same sentence, but the card is a menu away. */
const saidArrow = new Set();
function sayNoArrow(notes) {
  const why = notes.filter((n) => n.startsWith('arrow')).join('; ') || 'no reason recorded';
  if (saidArrow.has(why)) return;
  saidArrow.add(why);
  console.warn(`[mw] the bow carries no arrow - ${why}`);
}

/** TWO-HANDS: the node the LEFT hand's weapon hangs on - Morrowind's own, the bow's
 *  (WEAPON_ATTACH_BONE's MarksmanBow row). Rule 13 mirrors every part on a node whose name holds "Left" (attach.cpp's
 *  substring test - the bow is "the sword's own mesh with X negated", Morrowind-Rules.md section 8), so a sword hung
 *  here is the right hand's sword in the mirror, which is what a second hand holds. */
export const OFF_WEAPON_BONE = weaponAttachBone(MW_WEAPON_TYPE.MarksmanBow);

const noBoneNote = (slot, bone, what) => `${slot}: this skeleton has no "${bone}" bone to hang ${what} on`;
/**
 * TWO-HANDS: THE LEFT HAND'S WEAPON - the same record, the same mesh and the same door the right hand's takes
 * (resolveWeaponParts: the port's own models, Morrowind's records by type, material and shape), hung on the left hand's
 * node in a part of its own slot ('offweapon'). No arrow: a pair is two melee weapons (combat/twoHands/handsLaw.js DUAL_TYPES).
 * The node is asked of the skeleton AS ASSEMBLED (`hasBone`, as the holster asks - TWO-HANDS AUDIT): retail's carry no
 * Weapon Bone Left in their bytes, and the player's rigs are given one made by the mirror from their own Weapon Bone
 * (assembleFirstPersonArm's `offWeaponBone`, combat/twoHands/mirrorRig.js offWeaponBoneAddon). Without `hasBone` the bytes are
 * asked. A skeleton that has none even so draws no second weapon and says so - a sword hung anywhere else would hang
 * unmirrored, the wrong way round in the hand.
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
 * MW-D9's WEAPON RESOLUTION, one home (extracted at MW-D19 so a live
 * equip change resolves through the same door as the build).
 *
 * A Morrowind weapon is a RIGID part at a bone - rule 12's rigid half,
 * the same path armcuff has proved since MW-D6 - so it rides in as one
 * more part with an explicit `bones` override instead of the PART_BONES
 * table. Rule 17 is that override: the generic "Weapon Bone" is
 * replaced by the equipped type's own attach bone when the actor has
 * that node, which is how a bow reaches "Weapon Bone Left" (rule 8).
 *
 * AND THE BOW COMES OUT MIRRORED, which is faithful and surprising
 * enough to write down before someone "fixes" it. Rule 13's mirror is
 * a SUBSTRING TEST on the attach bone's name (SceneUtil::attach,
 * components/sceneutil/attach.cpp:166-181), and that function is the
 * generic attach path for every part - weapons included, not body parts
 * only. "Weapon Bone Left" contains "Left", so the bow is drawn with X
 * negated by exactly the same rule that mirrors the left hand. Nothing
 * here special-cases it.
 *
 * @returns {{mwType:number, parts:object[], weaponInfo:object|null,
 *   arrowInfo:object|null, notes:string[]}}
 */
export function resolveWeaponParts({ weapon, hasAmmo = false, allWeapons, find, skeletonBytes, has = null }) {
  const notes = [];
  const parts = [];
  let weaponInfo = null;
  let arrowInfo = null;
  const mwType = dfWeaponToMw(weapon, WEAPONS);
  if (mwType !== MW_WEAPON_TYPE.None) {
    const rec = pickWeaponRecord(allWeapons, mwType, weapon ? materialName(weapon) : null, {
      has,
      shape: dfWeaponShape(weapon, WEAPONS),
    }); // MW-D38; MW-D50: a record the archives carry
    if (!rec) {
      notes.push(`weapon: your archives carry no unenchanted Morrowind weapon of type ${mwType}`);
    } else {
      const path = `meshes/${rec.model}`;
      const arc = find(path);
      if (!arc) notes.push(`weapon: ${path} (${rec.id}) is not in your archives`);
      else {
        // MW-D32: the TYPED bone only when the rig CARRIES it - the
        // reference starts from sPartList's "Weapon Bone" and switches
        // to the type's own mAttachBone only `if (found != nodeMap
        // .end())` (npcanimation.cpp:787-795). A rig without "Weapon
        // Bone Left" hangs the bow on "Weapon Bone" rather than
        // dropping it.
        const typed = weaponAttachBone(mwType);
        const bone = typed === 'Weapon Bone' || skeletonHasBone(skeletonBytes, typed) ? typed : 'Weapon Bone';
        const weaponBytes = nifBytes(arc, path);
        parts.push({ slot: 'weapon', bones: [bone], bytes: weaponBytes });
        weaponInfo = {
          id: rec.id,
          name: rec.name,
          model: rec.model,
          type: mwType,
          bone,
          // MW-D28: the record's own attack speed (character.cpp:1326).
          speed: rec.speed || 1,
        };

        // MW-D16 / RULE 24's ARROW. A drawn bow with no round on it is
        // what the port has been drawing; the reference instances the
        // AMMUNITION SLOT's model under getArrowBone() at the
        // "shoot attach" key.
        const ammoType = ammoTypeFor(mwType);
        if (ammoType !== MW_WEAPON_TYPE.None && hasAmmo) {
          const ammoRec = pickWeaponRecord(allWeapons, ammoType, null, { has }); // MW-D50
          if (!ammoRec) {
            notes.push(`arrow: your archives carry no unenchanted Morrowind ammunition of type ${ammoType}`);
          } else {
            const ammoPath = `meshes/${ammoRec.model}`;
            const ammoArc = find(ammoPath);
            if (!ammoArc) notes.push(`arrow: ${ammoPath} (${ammoRec.id}) is not in your archives`);
            else {
              // getArrowBone's two branches. The ACTOR's own bone
              // first; failing that, a node named "ArrowBone" inside
              // the WEAPON's mesh - which brings the weapon's whole
              // transform chain, and its MIRROR, along with it.
              const skelBone = arrowAttachBone(mwType);
              const onActor = skelBone && skeletonHasBone(skeletonBytes, skelBone);
              let pre = null;
              let preClip = null;
              let arrowBone = skelBone;
              if (!onActor) {
                const weaponNif = parseNifOnce(weaponBytes);
                pre = nodeTransformOf(weaponNif, ARROW_FALLBACK_NODE);
                arrowBone = pre ? bone : null;
                // MW-BOW1: and the node MOVES - the bow's own clock carries the ArrowBone from the quiver to the
                // string and back (formats/morrowind/mwPartClock.js). `pre` is its rest; the clock poses it each frame.
                if (pre) preClip = { nif: weaponNif, node: ARROW_FALLBACK_NODE };
              }
              if (!arrowBone) {
                notes.push(
                  `arrow: neither this skeleton's "${skelBone}" bone nor an ` +
                    `"${ARROW_FALLBACK_NODE}" node in ${weaponInfo.model} - nowhere to put it`,
                );
              } else {
                parts.push({
                  // MW-D34: `ammo` marks the one part attachArrow
                  // instances BARE - no BoneOffset of its own
                  // (weaponanimation.cpp:87-93, getInstance direct).
                  slot: 'arrow',
                  bones: [arrowBone],
                  bytes: nifBytes(ammoArc, ammoPath),
                  preTransform: pre,
                  preClip,
                  ammo: true,
                });
                arrowInfo = {
                  id: ammoRec.id,
                  name: ammoRec.name,
                  model: ammoRec.model,
                  type: ammoType,
                  bone: arrowBone,
                  viaWeaponMesh: !onActor,
                };
              }
            }
          }
        }
      }
    }
  } else if (weapon) {
    notes.push('weapon: Morrowind has no weapon type for what you are holding');
  }
  // MW-D50: ammunition in the pack, a weapon that takes it, and no
  // arrow resolved - say so where the player can read it.
  if (hasAmmo && weaponInfo && ammoTypeFor(mwType) !== MW_WEAPON_TYPE.None && !arrowInfo) sayNoArrow(notes);
  return { mwType, parts, weaponInfo, arrowInfo, notes };
}
