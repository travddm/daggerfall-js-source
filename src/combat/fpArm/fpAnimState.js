// @ts-check
// The first-person arm's animation-state helpers: the skeleton files, the idle group and its repeat count, the
// upper-body state enum, clip completion and the attack release lookup. They are pure: the state itself stays in
// createFpArm's closure, and what a helper needs arrives as an argument.
//
// The rules here come from the retail files: the skeleton and clip file names, the text keys of the weapon groups
// ("<group>: start", "loop start", "loop stop", "stop", and the "<attack> min attack / max attack / min hit / hit"
// keys), and the behaviour seen in play.
import { getTextKeyTime } from '../../formats/morrowind/mwAnim.js';
import {
  MW_WEAPON_TYPE,
  weaponFlags,
  MW_TWO_HANDED,
  attackKeys,
  releaseStartPoint,
} from '../../formats/morrowind/mwFirstPerson.js';

/** The two skeletons of the werewolf form. They ship with Bloodmoon: without it the build refuses at the skeleton and the
 *  transformed player keeps the classic claws. */
export const WOLFSKIN = 'meshes/wolf/skin.nif';
export const WOLFSKIN_1ST = 'meshes/wolf/skin.1st.nif';

/** Which skeleton file a first-person actor stands on. A werewolf has its own; a beast race (Khajiit, Argonian) uses the
 *  beast skeleton, a woman the female one. A skeleton the archives lack is reported by the build, never swapped. */
export function fpSkeletonPath({ female = false, beast = false, werewolf = false } = {}) {
  if (werewolf) return WOLFSKIN_1ST;
  if (beast) return 'meshes/base_animkna.1st.nif';
  if (female) return 'meshes/base_anim_female.1st.nif';
  return 'meshes/xbase_anim.1st.nif';
}

/** The same choice for the third-person body. */
export function tpSkeletonPath({ female = false, beast = false, werewolf = false } = {}) {
  if (werewolf) return WOLFSKIN;
  if (beast) return 'meshes/base_animkna.nif';
  if (female) return 'meshes/base_anim_female.nif';
  return 'meshes/base_anim.nif';
}

/** The base animation file every first-person actor loads. A female or beast actor also loads the skeleton's own. */
export const FP_CLIP_PATH = 'meshes/xbase_anim.1st.kf';

/** The idle group's base name. The weapon's short suffix goes after it ("idle" + "1h" = "idle1h"). */
export const FP_IDLE_BASE = 'idle';

/** The sneaking idle. No weapon suffix exists for it ("idlesneak1h" is in no clip file), and the first-person clip file has
 *  no such group at all: there the arms sink instead. */
export const FP_IDLE_SNEAK = 'idlesneak';

/** The carried light's group, played on the left arm. */
export const TORCH_GROUP = 'torch';

/** A two-handed weapon, a readied spell and bare fists take both hands, so the shield and the torch in the left hand are
 *  hidden for them. */
export const carriedLeftVisible = (/** @type {number} */ weaponType) => !(weaponFlags(weaponType) & MW_TWO_HANDED);

/**
 * The idle group's base name for the current movement: the sneaking idle while the player sneaks on the ground and the
 * rig has that group, the plain idle otherwise.
 * @param {{ sneaking?: boolean, inJump?: boolean, hasGroup?: (group: string) => boolean }} [options]
 */
export function idleBaseFor({ sneaking = false, inJump = false, hasGroup = () => false } = {}) {
  return sneaking && !inJump && hasGroup(FP_IDLE_SNEAK) ? FP_IDLE_SNEAK : FP_IDLE_BASE;
}

/**
 * How many times a drawn weapon's idle wraps its loop before it plays on to its stop key: 1 to 4 wraps, each wrap being
 * one more pass through the loop section, so the idle shows 2 to 5 passes in all. A sheathed idle has no count and loops
 * for as long as the actor stands (the caller passes Infinity). Reads Math.random once.
 */
export const FP_IDLE_LOOPS = () => 1 + Math.floor(Math.random() * 4);

/**
 * The weapon type the animations are chosen for, which is not the item in hand. A readied spell wins over everything, even
 * a sheathed weapon (the caster's empty hands cast). Otherwise a sheathed weapon is no type at all, and an empty hand that
 * is raised is a fist.
 * @param {number} itemType      the weapon record's type (MW_WEAPON_TYPE.None for an empty hand)
 * @param {boolean} sheathed
 * @param {boolean} [spellReady]
 */
export function animWeaponType(itemType, sheathed, spellReady = false) {
  if (spellReady) return MW_WEAPON_TYPE.Spell;
  if (sheathed) return MW_WEAPON_TYPE.None;
  return itemType === MW_WEAPON_TYPE.None ? MW_WEAPON_TYPE.HandToHand : itemType;
}

/**
 * The state of the arm's upper body. The numbers are in play order, and the order matters: aiming is every state past
 * Ready (see accurateAiming).
 *   Rest        nothing drawn
 *   Drawing     the weapon's draw section plays
 *   Stowing     the weapon's put-away section plays
 *   Ready       drawn and idle
 *   Winding     a swing or a bow draw is held
 *   Striking    the release section plays
 *   Recovering  the follow-through plays
 *   Casting     a spell's cast group plays
 */
export const UPPER_BODY = Object.freeze({
  Rest: 0,
  Drawing: 1,
  Stowing: 2,
  Ready: 3,
  Winding: 4,
  Striking: 5,
  Recovering: 6,
  Casting: 7,
});

/** A state number's name. */
export const UPPER_BODY_NAME = Object.freeze(
  Object.fromEntries(Object.entries(UPPER_BODY).map(([name, state]) => [state, name])),
);

const AIMING_STATES = new Set(
  /** @type {number[]} */ ([UPPER_BODY.Winding, UPPER_BODY.Striking, UPPER_BODY.Recovering, UPPER_BODY.Casting]),
);

/** True in the states where the neck takes the whole look pitch (the player is attacking or casting). */
export const accurateAiming = (/** @type {number} */ upper) => AIMING_STATES.has(upper);

/** The spell's attack type, which names its key pair in the clip: "touch" for range 1, "self" for the caster-only ranges
 *  (0 and 3), "target" otherwise. The two area forms cast like the point form they surround. */
export function spellAttackType(/** @type {number} */ rangeType) {
  if (rangeType === 1) return 'touch';
  if (rangeType === 0 || rangeType === 3) return 'self';
  return 'target';
}

/**
 * How far through its [startTime, stopTime] span a clip is. Not clamped. A clip without length is 0 while it still plays
 * and 1 once it has finished. A clip that does not exist is 0.
 * A re-armed idle starts at its previous completion, so a finished idle restarts at its own end and its loop window wraps
 * it at once, with no jump back to the start.
 * @param {{ time: number, startTime: number, stopTime: number, playing?: boolean } | null | undefined} clip
 */
export function clipCompletion(clip) {
  if (!clip) return 0;
  const length = clip.stopTime - clip.startTime;
  if (length > 0) return (clip.time - clip.startTime) / length;
  return clip.playing ? 0 : 1;
}

/**
 * The time half a loop away from `time`, inside the clip's repeating window: the group's "loop start" / "loop stop"
 * keys that lie in the block the clip plays, else the clip's own start and stop. One loop of a movement group is one whole
 * stride, so the right arm there is where the left arm swings now. null when `time` is not a number or the window has
 * no length.
 * @param {{ group: string, time: number, startTime: number, stopTime: number } | null | undefined} clip
 * @param {number} [time]   defaults to the clip's own time
 * @param {{ time: number, text: string }[] | null} [keys]
 */
export function strideOppositeTime(clip, time = clip?.time, keys = null) {
  if (!clip || !Number.isFinite(time)) return null;
  // Only the keys inside the block the clip plays count: the clip's running loop fields take the loop stop only once it is
  // crossed, so on the first pass they would span the whole group.
  const keyTime = (/** @type {string} */ name) => {
    for (const key of keys ?? []) {
      if (key.text === `${clip.group}: ${name}` && key.time >= clip.startTime && key.time <= clip.stopTime)
        return key.time;
    }
    return NaN;
  };
  let from = keyTime('loop start');
  let to = keyTime('loop stop');
  if (!(to > from)) {
    from = clip.startTime;
    to = clip.stopTime;
  }
  const span = to - from;
  if (!(span > 0)) return null;
  const half = span / 2;
  return from + ((((time - from + half) % span) + span) % span);
}

/** The fastest and the slowest a paced attack section runs (file seconds per second), and the least time left a section is
 *  fitted into: a blow already late finishes as fast as the cap lets it, never in one frame. */
export const BLOW_RATE_MAX = 12;
export const BLOW_RATE_MIN = 0.1;
export const BLOW_LEFT_MIN = 1 / 60;

/** The rate that plays a section of `span` file seconds in `left` seconds, held to the bounds. A span that is no span has
 *  nothing to fit and plays at 1. */
export function blowRate(/** @type {number} */ span, /** @type {number} */ left) {
  if (!(span > 0)) return 1;
  return Math.min(BLOW_RATE_MAX, Math.max(BLOW_RATE_MIN, span / Math.max(left, BLOW_LEFT_MIN)));
}

/**
 * Where in the release section a blow starts, as a fraction of the section (0 plays all of it): a blow wound up only part
 * of the way skips the share it did not wind up. The four keys come from the weapon group's own text keys; a key the
 * clip lacks is -1, which fails the ordering tests inside releaseStartPoint, so a clip without them starts at 0.
 * @param {{ time: number, text: string }[]} keys  the clip file's text keys
 * @param {string} group                           the weapon group
 * @param {string} attackType                      "chop", "slash", "thrust" or "shoot"
 * @param {number} strength                        0 to 1, how far the blow was wound up
 */
export function releaseSkip(keys, group, attackType, strength) {
  const names = attackKeys(attackType, strength);
  const at = (/** @type {string} */ key) => getTextKeyTime(keys, `${group}: ${key}`);
  return releaseStartPoint(strength, {
    minAttackTime: at(names.minAttack),
    maxAttackTime: at(names.maxAttack),
    minHitTime: at(names.minHit),
    hitTime: at(names.hitKey),
  });
}
