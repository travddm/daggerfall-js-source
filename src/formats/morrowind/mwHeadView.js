// @ts-check
// The first-person view follows the head: which skeleton node carries the camera, and how the look pitch turns the neck.
//
// What the retail files show (Morrowind.bsa, measured on the recorded rigs of test/fixtures/mw/mwHeadViewParity.json):
//   - xbase_anim.1st.nif and base_anim_female.1st.nif carry a node `Camera`, a child of `Head`, about 5 units from the
//     head bone. base_animkna.1st.nif (the beast arms) has no such node, so the head bone itself is the view.
//   - The first-person clips (xbase_anim.1st.kf, xbase_animkna.1st.kf) key the spine chain but leave the neck and head
//     at rest, so the view has no bob of its own in first person. The third-person body does move its head (up to 3
//     units a frame at a run, 8 in a jump), and the same code serves it.
//   - Neck to camera is about 10 units. A neck turn of `a` radians moves the eye 2 * 10 * sin(a / 2) units along an arc,
//     which is the cost of following the look with the neck instead of with the lens alone.
//
// The turn is made about the actor root's X axis, not the neck's own axis. The neck of a retail rig is not axis-aligned,
// so a turn about its own axis would also yaw the head sideways.

import { mat33Mul } from './mwNifMesh.js';

/** The nodes that can carry the camera, most specific first. A rig with neither has no first-person view. */
const VIEW_NODES = ['camera', 'head'];

/** @param {{byName?: Map<string, number>} | null | undefined} skeleton @returns {number} the node ref, or -1 */
export function headViewRef(skeleton) {
  const byName = skeleton && skeleton.byName;
  if (!byName) return -1;
  for (const name of VIEW_NODES) if (byName.has(name)) return /** @type {number} */ (byName.get(name));
  return -1;
}

/** The bone that takes the look pitch. */
export const NECK_BONE = 'bip01 neck';

/**
 * The three tunable numbers.
 *
 * restShare is the part of the look pitch the neck takes while the actor is not aiming. The lens takes all of the
 * pitch whatever the neck does, so the arms, which hang from the spine, slide in the picture by (1 - share) * pitch.
 * Two limits bound the share, both at a pitch of 1.4 radians (about 80 degrees, steeper than play reaches):
 *   - The arms must stay in frame. Half of the 60-degree lens is 0.52 radians, and the arms sit in the lower part of it,
 *     so the slide stays under 0.42 radians (24 degrees): share >= 0.7.
 *   - The eye must stay in front of the neck. Its arc is 2 * 10 * sin(share * pitch / 2) units with 10 units between
 *     neck and camera, so the arc stays under 10 units: share <= 0.75.
 * 0.7 takes the end of that range that keeps the arms in frame.
 *
 * While aiming the neck takes all of the pitch (focus 1), so an arm that is swinging points where the player looks.
 *
 * The focus rises by riseRate and falls by fallRate each second. A rise that took one frame would move the eye by
 * (1 - restShare) * pitch at once: 0.3 radians at a pitch of one, a visible snap at the start of every swing. At 8 per
 * second the same change is spread over about 8 frames at 60 fps. The fall is slower than the rise so the view does not
 * spring back at the end of a swing. These two rates, unlike restShare, come from no measurement: they are judged by
 * eye and meant to be adjusted.
 */
export const HEAD_VIEW_TUNING = Object.freeze({ restShare: 0.7, riseRate: 8, fallRate: 1.2 });

/** The aiming focus after `seconds`: 0 when idle, 1 while aiming, moving toward the target at a fixed rate. */
export function stepAimFocus(previous, aiming, seconds) {
  const { riseRate, fallRate } = HEAD_VIEW_TUNING;
  const focus = previous || 0;
  return aiming ? Math.min(1, focus + seconds * riseRate) : Math.max(0, focus - seconds * fallRate);
}

/** The part of the look pitch the neck takes, from restShare at focus 0 to all of it at focus 1. */
export function neckPitchShare(focus = 0) {
  const { restShare } = HEAD_VIEW_TUNING;
  return restShare + (1 - restShare) * focus;
}

/** The 3x3 (row-major) that tips the root's up axis forward, so a positive angle looks down. */
export function pitchDown(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return Float32Array.from([1, 0, 0, 0, c, s, 0, -s, c]);
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** A node's parent frame: the parent's world 3x3 with its (uniform) scale divided out, and that scale. */
function parentFrame(skeleton, worlds, ref) {
  const parent = skeleton.nodes.get(ref).parent;
  const world = parent >= 0 ? worlds.get(parent) : null;
  const scale = world ? Math.hypot(world.a[0], world.a[3], world.a[6]) : 0;
  if (!(scale > 1e-8)) return { rotation: IDENTITY, scale: 1 };
  // A unit scale (every retail rig) is left alone: dividing by 1 +- 1e-7 would only add float noise to the pose.
  if (Math.abs(scale - 1) < 1e-6) return { rotation: world.a, scale: 1 };
  return { rotation: Array.from(world.a, (v) => v / scale), scale };
}

/** `turn` (in the root's frame) laid on a node whose parent frame is P: P^T * turn * P * local. */
const turnedLocal = (local, P, turn) => mat33Mul(mat33Mul(mat33Mul(transpose(P), turn), P), local.rotation);

/**
 * Lays `turn`, a 3x3 in the actor root's frame, on node `ref`: its world orientation becomes turn * (what the animation
 * left), and its world position stays. Returns false where the skeleton has no such node.
 */
export function turnInRootFrame(skeleton, pose, rootRef, skelMats, ref, turn) {
  if (ref === undefined || ref === null || !skeleton?.nodes?.has(ref)) return false;
  const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
  const { rotation: P } = parentFrame(skeleton, skelMats(skeleton, pose, rootRef), ref);
  pose.set(ref, { rotation: turnedLocal(local, P, turn), translation: local.translation, scale: local.scale });
  return true;
}

/**
 * Pitches the view: turns the neck by neckPitchShare(focus) * pitch in the root's frame, and moves it by `offset`, a
 * shift given in the root's frame (the body sinking, for one). A local translation is measured in the parent's frame,
 * so the offset goes through the inverse of the parent's world matrix.
 * Returns false when there is no neck or nothing to apply.
 */
export function pitchNeck(skeleton, pose, rootRef, skelMats, pitch, focus = 0, offset = null) {
  const ref = skeleton && skeleton.byName ? skeleton.byName.get(NECK_BONE) : undefined;
  const shifted = !!(offset && (offset[0] || offset[1] || offset[2]));
  if (ref === undefined || (!pitch && !shifted)) return false;
  const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
  const { rotation: P, scale } = parentFrame(skeleton, skelMats(skeleton, pose, rootRef), ref);
  const rotation = pitch ? turnedLocal(local, P, pitchDown(pitch * neckPitchShare(focus))) : local.rotation;
  let translation = local.translation;
  if (shifted) {
    const inverse = transpose(P).map((v) => v / scale);
    translation = [0, 1, 2].map(
      (row) =>
        local.translation[row] +
        inverse[row * 3] * offset[0] +
        inverse[row * 3 + 1] * offset[1] +
        inverse[row * 3 + 2] * offset[2],
    );
  }
  pose.set(ref, { rotation, translation, scale: local.scale });
  return true;
}
