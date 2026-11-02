// @ts-check
// The first-person view follows the head: which skeleton node carries the camera, and the neck turn that pitches the view.
// Moved out of mwFirstPerson.js unchanged; mwFirstPerson.js still exports everything here.

import { mat33Mul } from './mwNifMesh.js';

/**
 * RULE 54, VERBATIM: THE FIRST-PERSON CAMERA IS A NODE OF THE RIG.
 *
 *   mAnimation->setViewMode(NpcAnimation::VM_FirstPerson);
 *   mTrackingNode = mAnimation->getNode("Camera");
 *   if (!mTrackingNode) mTrackingNode = mAnimation->getNode("Head");
 *   mHeightScale = 1.f;
 *                            - mwrender/camera.cpp:346-357
 *
 * and the position it yields is that node's world TRANSLATION with no
 * height term at all in first person (calculateTrackedPosition, :87-99:
 * the `res.z() += mHeight * mHeightScale` line is inside
 * `if (mMode != Mode::FirstPerson)`).
 *
 * There is no third fallback. A rig with neither node has no first-person
 * camera, and inventing one is what MW-D8's port mapper did.
 */
export function firstPersonCameraRef(skeleton) {
  const byName = skeleton && skeleton.byName;
  if (!byName) return -1;
  if (byName.has('camera')) return byName.get('camera');
  if (byName.has('head')) return byName.get('head');
  return -1;
}

/** The node NpcAnimation hangs the first-person RotateController on. */
export const FP_NECK_BONE = 'bip01 neck';

/**
 * NpcAnimation::runAnimation (:711-723), whole:
 *
 *   if (mAccurateAiming) mAimingFactor = 1.f;
 *   else mAimingFactor = std::max(0.f, mAimingFactor - timepassed * 0.5f);
 *   float rotateFactor = 0.75f + 0.25f * mAimingFactor;
 *
 * MW-D13 CLOSED THE OTHER HALF. The factor is not the constant 0.75 the
 * port shipped: it is 0.75 at rest and rises to 1.0 WHILE AIMING, which
 * is `mUpperBodyState > UpperBodyState::WeaponEquipped`
 * (character.cpp:1894) - every attack section, and nothing else. So the
 * arms lag the look by a quarter of it normally and follow it EXACTLY
 * while you are swinging, which is what makes a blow land where you are
 * looking.
 *
 * The rise is INSTANT and the fall is a 0.5-per-second ramp, so the arms
 * snap onto the aim and drift back off it over two seconds. An
 * implementation that eased both ways, or that decayed per frame instead
 * of per second, would look almost right and be wrong at every frame
 * rate but one.
 *
 * MW-D12's upper-body machine is what makes this reachable at all - with
 * a constant idle there was no aiming state to be in, which is why the
 * constant was honest when it was written and is a gap now.
 */
export const FP_NECK_ROTATE_FACTOR = 0.75;
export const FP_AIM_SPAN = 0.25;
export const FP_AIM_DECAY_PER_SECOND = 0.5;

/** mAimingFactor's own step. `prev` is last frame's value; the caller
 *  keeps it, because it is a decaying state and not a function of the
 *  current frame alone. */
export function aimingFactor(prev, accurate, dt) {
  if (accurate) return 1;
  return Math.max(0, (prev || 0) - dt * FP_AIM_DECAY_PER_SECOND);
}

/** rotateFactor, which is what multiplies the pitch. */
export function neckRotateFactor(aim = 0) {
  return FP_NECK_ROTATE_FACTOR + FP_AIM_SPAN * aim;
}

const transpose33 = (m) => Float32Array.from([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);

/**
 * `matrix.getRotate()` - the ROTATION, with the scale divided out.
 *
 * MW-D15: the skeleton-space 3x3 this module works in is rotation TIMES
 * SCALE (rule 55 folds a NIF's uniform scale into the matrix), and
 * RotateController takes `worldMat.getRotate()`, which is the rotation
 * alone. Conjugating with the scaled matrix gives `s^2 * (R rot R^T)`
 * and translating with its transpose gives `s * offset` - both silently
 * correct at s = 1, which every fixture and most retail rigs are, and
 * both wrong the moment a rig scales its neck chain.
 *
 * NIF scale is a single float, so the columns share one length and one
 * division does it.
 */
const rotationOf = (m) => {
  const s = Math.hypot(m[0], m[3], m[6]);
  if (!(s > 1e-8) || Math.abs(s - 1) < 1e-6) return m;
  const out = new Float32Array(9);
  for (let i = 0; i < 9; i++) out[i] = m[i] / s;
  return out;
};
/** Rotation about -X by `rad`, which is the axis the neck controller
 *  takes: `osg::Quat(pitch * rotateFactor, osg::Vec3f(-1, 0, 0))` - and the third person's ranged aim
 *  (combat/spineAim.js, BOW-AIM: `osg::Quat(pitch / 2, osg::Vec3f(-1, 0, 0))`). */
export const rotNegX = (rad) => {
  const c = Math.cos(rad); const sn = Math.sin(rad);
  return Float32Array.from([1, 0, 0, 0, c, sn, 0, -sn, c]);
};

/**
 * RotateController's turn (mwrender/rotatecontroller.cpp:41-60), the node's new local rotation:
 *
 *   worldOrient = rotation of the node's matrix relative to the object root
 *   orient = worldOrient * mRotate * worldOrient^-1 * matrix.getRotate()
 *
 * i.e. `rotate` is a turn in the OBJECT ROOT's frame, laid on the node's world orientation as the animation left it -
 * the node's world becomes `rotate * world`, its translation untouched.
 *
 * BOW-AIM: THAT LINE IS OSG's, AND OSG MULTIPLIES ROW VECTORS. Its
 * matrices (and the quaternion product, `q1 * q2` = q1 then q2) are the transposes of this port's: here a world is
 * `parent * local` and a point is `M v` (mwNifMesh.js composeTransform). Written in this port's convention the line is
 *
 *   local' = local * W^T * rotate * W          (W the node's world rotation, its own local inside it)
 *
 * so the world is `parent * local' = rotate * parent * local` - `rotate` in the root's frame. The port had copied the
 * line's letters (`W * rotate * W^T * local`), which turns the world by `rotate` conjugated by parent*W instead: on
 * retail's third-person skeleton a "look down" of 0.3 tipped the chest BACK 0.3, about an axis 3 degrees off the
 * root's X, where the corrected line turns it exactly `rotate`. Measured on the vendored retail biped
 * (test/combat/fb1026c_bowaim.test.js); MW-D20's fixture (a file root turned Rz90) is the same law worked by hand.
 */
function rootSpaceTurn(local, w, rotate) {
  return mat33Mul(mat33Mul(mat33Mul(local, transpose33(w)), rotate), w);
}

/**
 * The first-person neck rotation, applied the way RotateController does it (rootSpaceTurn): the pitch is expressed in
 * the OBJECT ROOT's frame and laid on whatever the animation already put there. Doing it in the node's local frame
 * instead would pitch the head sideways as soon as the neck is not axis-aligned.
 */
export function applyFirstPersonNeck(skeleton, pose, rootRef, skelMats, pitch, aim = 0, offset = null) {
  const ref = skeleton && skeleton.byName ? skeleton.byName.get(FP_NECK_BONE) : undefined;
  const sinking = !!(offset && (offset[0] || offset[1] || offset[2]));
  if (ref === undefined || (!pitch && !sinking)) return false;
  const world = skelMats(skeleton, pose, rootRef).get(ref);
  if (!world) return false;
  const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
  const w = rotationOf(world.a);
  const rotate = rotNegX(pitch * neckRotateFactor(aim));
  const rotation = rootSpaceTurn(local.rotation, w, rotate);
  // RULE 32(a), and it rides the SAME controller as the pitch because it
  // is the same line of the same function:
  //   matrix.setTrans(matrix.getTrans() + worldOrientInverse * mOffset);
  //                                     (rotatecontroller.cpp:52)
  // worldOrientInverse turns a vector given in the OBJECT ROOT's space
  // into the neck's own, which is the transpose of the same world 3x3 the
  // rotation is turned by (a quaternion applied to a vector is the same
  // turn in either convention - only the product's order flips). Applying the offset in the neck's local
  // frame instead would sink the body along whatever way the neck
  // happens to be pointing.
  let translation = local.translation;
  if (sinking) {
    const inv = transpose33(w);
    translation = [
      local.translation[0] + inv[0] * offset[0] + inv[1] * offset[1] + inv[2] * offset[2],
      local.translation[1] + inv[3] * offset[0] + inv[4] * offset[1] + inv[5] * offset[2],
      local.translation[2] + inv[6] * offset[0] + inv[7] * offset[1] + inv[8] * offset[2],
    ];
  }
  pose.set(ref, { rotation, translation, scale: local.scale });
  return true;
}

/**
 * BOW-AIM: RotateController's rotation alone on node `ref`
 * (rootSpaceTurn; applyFirstPersonNeck's law with no offset) - `rotate`, a 3x3 in the OBJECT ROOT's space, laid on the
 * node's world rotation as the pose now stands it. Answers false where the skeleton has no such node.
 */
export function applyRotateController(skeleton, pose, rootRef, skelMats, ref, rotate) {
  if (ref === undefined || ref === null || !skeleton?.nodes?.has(ref)) return false;
  const world = skelMats(skeleton, pose, rootRef).get(ref);
  if (!world) return false;
  const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
  const w = rotationOf(world.a);
  pose.set(ref, { rotation: rootSpaceTurn(local.rotation, w, rotate), translation: local.translation, scale: local.scale });
  return true;
}
