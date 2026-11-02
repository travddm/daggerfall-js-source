// @ts-check
// Third-person aim for ranged weapons: while a bow, crossbow or thrown weapon is being used, the body's spine tips
// forward or back with the player's look, so the arms and head point where the player aims.
//
// The tip is spread over the two spine bones that carry the chest (each takes half), measured about the actor's
// own sideways axis, and scaled by a weight between 0 and 1 that follows the attack animation: the body leans into
// the aim as the weapon is drawn, holds it through the release and relaxes while the weapon is lowered again.
//
// Written from the retail skeleton's bone names and from watching the third-person body shoot. The attack
// animation's own timing keys (wind-up start, minimum attack) arrive as plain times from the caller.

import {
  MW_WEAPON_TYPE,
  MW_WEAPON_CLASS,
  weaponClass,
  rotNegX,
  applyRotateController,
} from '../formats/morrowind/mwFirstPerson.js';

/** The two spine bones the tip is spread over, lowest first. Names are lower case, as the skeleton indexes them. */
export const SPINE_AIM_BONES = Object.freeze(['bip01 spine1', 'bip01 spine2']);

/** Attack groups that play as one piece, with no wind-up phase before the release. */
export const RANDOM_ATTACK_GROUPS = Object.freeze(
  new Set(['attack1', 'attack2', 'attack3', 'swimattack1', 'swimattack2', 'swimattack3']),
);

/** The upper-body states in which a ranged weapon aims. Every other state leaves the spine alone. */
export const AIMING_STATES = Object.freeze(new Set(['AttackWindUp', 'AttackRelease', 'AttackEnd', 'Casting']));

/** A crossbow is reloaded by the same animation that lowers it, which is quick, so it relaxes in a tenth of it. */
const CROSSBOW_RELAX_SHARE = 0.1;

/**
 * How much of the look's pitch the spine takes, from 0 (none) to 1 (all of it).
 *
 * @param {object} [input]
 * @param {string} [input.upper] Upper-body state name.
 * @param {number} [input.weaponType] An MW_WEAPON_TYPE value.
 * @param {string | null} [input.group] Name of the attack animation group that is playing.
 * @param {number} [input.time] Playhead of that animation, in seconds.
 * @param {number} [input.startTime] Time of the animation's wind-up start key, or -1.
 * @param {number} [input.minAttackTime] Time at which the attack can be released, or -1 when the animation has none.
 * @param {number} [input.completion] How far the follow-through has played, from 0 to 1.
 * @returns {number}
 */
export function spinePitchFactor({
  upper = 'None',
  weaponType = MW_WEAPON_TYPE.None,
  group = null,
  time = -1,
  startTime = -1,
  minAttackTime = -1,
  completion = 0,
} = {}) {
  if (!AIMING_STATES.has(upper)) return 0;
  const kind = weaponClass(weaponType);
  if (kind !== MW_WEAPON_CLASS.Ranged && kind !== MW_WEAPON_CLASS.Thrown) return 0;

  if (upper === 'AttackEnd') {
    if (weaponType === MW_WEAPON_TYPE.MarksmanCrossbow) return Math.max(0, 1 - completion / CROSSBOW_RELAX_SHARE);
    return 1 - completion;
  }

  const drawing = upper === 'AttackWindUp' && !RANDOM_ATTACK_GROUPS.has(group ?? '');
  const drawKeysKnown = minAttackTime >= 0 && time >= startTime && time < minAttackTime;
  if (drawing && drawKeysKnown) return (time - startTime) / (minAttackTime - startTime);
  return 1;
}

/**
 * Tip the two spine bones by `pitch` radians (positive: the look is down). Each bone is turned about the actor's
 * sideways axis, so the chest and everything above it carry the whole pitch. Returns how many bones were turned.
 */
export function applySpineAim(skeleton, pose, rootRef, skelMats, pitch) {
  if (!pitch) return 0;
  const half = rotNegX(pitch / 2);
  let turned = 0;
  for (const name of SPINE_AIM_BONES) {
    if (applyRotateController(skeleton, pose, rootRef, skelMats, skeleton.byName.get(name), half)) turned++;
  }
  return turned;
}

/** A pose step for the assembly: tips the spine by `pitch`, or nothing (null) when the pitch is zero or not a number. */
export function spineAimSlot(pitch) {
  if (!pitch) return null;
  return (skeleton, pose, rootRef, skelMats) => applySpineAim(skeleton, pose, rootRef, skelMats, pitch);
}
