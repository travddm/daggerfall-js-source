// @ts-check
// The first-person arm's animation-state helpers: the skeleton paths, the idle group and its loop count, the upper-body
// state enum, clip completion and the attack release lookup. Moved out of fpArm.js unchanged (the state itself stays
// in createFpArm's closure; this module owns only pure helpers and takes what it needs as arguments).
import { getTextKeyTime } from '../../formats/morrowind/mwAnim.js';
import {
  MW_WEAPON_TYPE,
  weaponFlags,
  MW_TWO_HANDED,
  attackKeys,
  releaseStartPoint,
} from '../../formats/morrowind/mwFirstPerson.js';

/** WEREWOLF1: THE WEREWOLF'S TWO
 *  SKELETONS, files/settings-default.cfg [Models] wolfskin and wolfskin1st. They ship with Bloodmoon, so a player
 *  with Bloodmoon.bsa attached has them; without it the build refuses at the skeleton, and the transformed player
 *  stands as Eye Of The Beholder's lycanthrope and the classic claws, as before. */
export const WOLFSKIN = 'meshes/wolf/skin.nif';
export const WOLFSKIN_1ST = 'meshes/wolf/skin.1st.nif';

/** Rule 6's table, as a decision rather than a list. The werewolf was out
 *  of scope here until WEREWOLF1 (it ships with Bloodmoon, and Part VI
 *  records it ABSENT from a vanilla archive). Daggerfall's Khajiit and Argonian reach the beast
 *  arm through the RADT bit (mwRaceId spells them as the ESM does) - a
 *  peer's body drives it from the wire (MWBODY1). A skeleton this archive lacks is REPORTED, never
 *  silently swapped: a silent fallback here is how an empty view got
 *  called a working one for four releases. */
export function fpSkeletonPath({ female = false, beast = false, werewolf = false } = {}) {
  // WEREWOLF1: getActorSkeleton asks for the werewolf FIRST, whatever the sex or the race (actorutil.cpp:23-24) -
  // [Models] wolfskin1st. The x-form (xskin.1st.nif) is correctActorModelPath's, when its .kf is there.
  if (werewolf) return WOLFSKIN_1ST;
  if (beast) return 'meshes/base_animkna.1st.nif';
  if (female) return 'meshes/base_anim_female.1st.nif';
  return 'meshes/xbase_anim.1st.nif';
}

/** MW-D24: rule 6's OTHER column - the THIRD-PERSON skeleton the same
 *  actor walks on (getActorSkeleton's !firstPerson branch,
 *  actorutil.cpp:8-19, through settings-default.cfg [Models]
 *  baseanim/baseanimfemale/baseanimkna). The werewolf asked first here
 *  too (WEREWOLF1): [Models] wolfskin. */
export function tpSkeletonPath({ female = false, beast = false, werewolf = false } = {}) {
  if (werewolf) return WOLFSKIN; // WEREWOLF1: [Models] wolfskin (actorutil.cpp:12-13)
  if (beast) return 'meshes/base_animkna.nif';
  if (female) return 'meshes/base_anim_female.nif';
  return 'meshes/base_anim.nif';
}
/** Rule 6 again: the first-person animation source sits beside it. This
 *  is the BASE source every first-person actor gets (mXbaseanim1st with
 *  its extension swapped); MW-D14 added the SECOND one a female or beast
 *  actor also gets - see fpAnimSources. */
export const FP_CLIP_PATH = 'meshes/xbase_anim.1st.kf';

/** Rule 9's BASE, which the weapon's short group is suffixed onto:
 *  "idle" + "1h" = "idle1h". MW-D12 retired the hardcoded 'Idle' - a
 *  constant group is a constant STANCE, and the arm held a bare-handed
 *  idle with a longsword drawn. */
export const FP_IDLE_BASE = 'idle';
/** MW-D52: THE SNEAK IDLE. refreshIdleAnims takes the idle STATE, not a
 *  constant base: CharState_IdleSneak names "idlesneak" (and IdleSwim
 *  "idleswim", out of scope with the swim family), and only the plain
 *  CharState_Idle takes the weapon's short suffix and rule 10's 2-5
 *  loops - "idlesneak" has no "idlesneak1h" in any .kf and loops until
 *  told to stop. The state is sneaking and NOT in a jump (the jump owns
 *  the air); a rig whose sources carry no such group idles plain, which
 *  is what hasAnimation's miss does in the reference. The first-person
 *  .kf has no sneak idle - the arms sink by rule 32(a) instead - so the
 *  base changes nothing there; the THIRD-PERSON body, which shares the
 *  machine, is what stood upright while sneaking. */
/** MW-D51 / AUDIT MW-TORCH F1: NpcAnimation::updateCarriedLeftVisible,
 *  verbatim - `return !(getWeaponType(weaptype)->mFlags & TwoHanded)`.
 *  The first cut paired the bit with the class ("a real weapon"), so a
 *  readied spell and drawn fists kept the torch up; the reference
 *  hides the shield and the torch for BOTH (vanilla: ready magic and
 *  the shield vanishes), and the port's own flag table gives them the
 *  bit for exactly that reason. The rule is one line and it is the
 *  reference's line. */
export const carriedLeftVisible = (type) => !(weaponFlags(type) & MW_TWO_HANDED);
export const FP_IDLE_SNEAK = 'idlesneak';
/** MW-D51: the carried light's group - base_anim.kf's "Torch", played on the left arm. */
export const TORCH_GROUP = 'torch';
/** @param {{ sneaking?: boolean, inJump?: boolean, hasGroup?: (group: string) => boolean }} [options] */
export function idleBaseFor({ sneaking = false, inJump = false, hasGroup = () => false } = {}) {
  return sneaking && !inJump && hasGroup(FP_IDLE_SNEAK) ? FP_IDLE_SNEAK : FP_IDLE_BASE;
}

/**
 * MW-D12 / RULE 10, and the arithmetic is worth spelling out because the
 * comment and the code count DIFFERENT THINGS.
 *
 *   numLoops = 1 + Misc::Rng::rollDice(4, prng);   character.cpp:808-810
 *   // play until the Loop Stop key 2 to 5 times, then play until the Stop key
 *
 * `rollDice(max)` is `uniform_int_distribution<int>(0, max - 1)`, so
 * numLoops is 1..4 - and that is the number of WRAPS, each of which costs
 * one decrement in advanceClip. One wrap is two traversals, so 1..4 wraps
 * is the comment's 2 to 5 plays. A port that reads "2 to 5" off the
 * comment and writes `2 + rollDice(4)` idles half again as long as
 * Morrowind does, which is the kind of error no screenshot can show.
 *
 * AND IT IS CONDITIONAL. numLoops starts at uint32 max - effectively
 * forever - and only becomes the dice roll when the actor HAS a weapon
 * short group (:800-812). A sheathed arm idles without end; a drawn one
 * runs to its stop key every few seconds. That condition is rule 10's
 * real content and the reason it is a first-person rule at all.
 */
export const FP_IDLE_LOOPS = () => 1 + Math.floor(Math.random() * 4);

/**
 * RULE 8's ANIMATION weapon type, which is NOT the item in your hand.
 *
 * `mWeaponType` is `ESM::Weapon::None` while nothing is drawn - the bare
 * "idle" group, no short suffix, and rule 10's endless loop - and it
 * becomes HandToHand the moment empty fists are RAISED (getWeaponType
 * returns HandToHand for an empty hand in a drawn stance, weapontype.cpp).
 * So the same empty hand is two different animation states, and the port
 * has both: playerWeapon.sheathed is the switch.
 *
 * Getting this wrong is not subtle: a sheathed player would idle in
 * "idlehh" with fists up, which is Morrowind's ready stance played while
 * Daggerfall says the weapon is away.
 */
export function animWeaponType(mwType, sheathed, spellReady = false) {
  // MW-D39 (Mac: Morrowind's spellcasting animations): A READIED SPELL IS
  // A STANCE. In the reference the spell is a WEAPON TYPE - Spell(-1),
  // whose short group is "spell" and long group "spellcast" - and
  // getWeaponType returns it whenever a spell is readied, before any
  // equipped weapon is consulted (weapontype.cpp / character.cpp's
  // getActiveWeapon). Daggerfall readies a spell the same way, so the
  // port asks the same question in the same order. The SHEATHED test
  // still comes first: a readied spell with the weapon put away is the
  // caster's own empty hands, which is exactly what the spellcast
  // animation wants, so the spell stance survives it.
  if (spellReady) return MW_WEAPON_TYPE.Spell;
  if (sheathed) return MW_WEAPON_TYPE.None;
  return mwType === MW_WEAPON_TYPE.None ? MW_WEAPON_TYPE.HandToHand : mwType;
}

/** CharacterController::UpperBodyState (character.hpp:107-117), in its own
 *  order. MW-D39 adds Casting, which the reference carries as
 *  UpperCharState_CastingSpell: the slice that reaches it is here now,
 *  so the member is no longer a lie the next reader has to disprove. */
export const UPPER_BODY = Object.freeze({
  None: 0,
  Equipping: 1,
  Unequipping: 2,
  WeaponEquipped: 3,
  AttackWindUp: 4,
  AttackRelease: 5,
  AttackEnd: 6,
  Casting: 7,
});

/** MW-D13: THE ORDER IS LOAD-BEARING, so these are numbers.
 *  `setAccurateAiming(mUpperBodyState > UpperBodyState::WeaponEquipped)`
 *  (character.cpp:1894) is a COMPARISON on this enum, and it is the only
 *  thing that decides whether the neck takes 0.75 of the look or all of
 *  it. A string enum cannot answer it. */
export const UPPER_BODY_NAME = Object.freeze(Object.fromEntries(Object.entries(UPPER_BODY).map(([k, v]) => [v, k])));

/** setAccurateAiming's argument, verbatim. Casting sits above
 *  AttackEnd in the reference's enum and is out of scope here, so the
 *  test is the same shape with one fewer state above the line. */
/** MW-D39: the spell's ATTACK TYPE, which names its key pair
 *  (character.cpp:1618-1636). Morrowind has three ranges; Daggerfall
 *  has five, and the two area forms cast like the point form they
 *  surround - an area at range is aimed, an area around the caster is
 *  not. */
export function spellAttackType(rangeType) {
  if (rangeType === 1) return 'touch';
  if (rangeType === 0 || rangeType === 3) return 'self';
  return 'target';
}

export const accurateAiming = (upper) => upper > UPPER_BODY.WeaponEquipped;

/** AnimState::getCompletion (animation.cpp:2160-2166) - the fraction of
 *  [startTime, stopTime] the playhead has covered. refreshIdleAnims
 *  feeds it straight back in as the next play's startPoint (:822-825),
 *  so a finished idle restarts AT ITS OWN END and the loop window
 *  immediately wraps it. That is not a bug being reproduced; it is why
 *  a re-armed idle does not visibly stutter back to the beginning.
 *
 *  MW-D33: the reference does NOT clamp the ratio, and a zero-length
 *  clip answers by whether it is still playing - `mPlaying ? 0.0f :
 *  1.0f` - a FINISHED zero-length clip is complete, not at its start.
 *  The port had clamped and answered 0 for both. */
export function clipCompletion(state) {
  if (!state) return 0;
  const span = state.stopTime - state.startTime;
  if (span > 0) return (state.time - state.startTime) / span;
  return state.playing ? 0 : 1;
}

/**
 * TWO-HANDS FIELD: A STRIDE'S OTHER HALF - clip
 * `state`'s time half its repeating window on from `time` (its group's loop keys in `keys`, else the group's own start
 * to stop), or null with no window. One loop of a movement group is one whole stride - the hip sways once a loop
 * (systems/lanternSwing.js, `stride`) - so the right arm there is where the left arm swings now.
 */
export function strideOppositeTime(state, time = state?.time, keys = null) {
  if (!state || !Number.isFinite(time)) return null;
  // the window off the group's own keys, inside the block the state plays - never the state's running loop fields,
  // which take the loop stop only once it is crossed (a first loop read the whole group: the left arm jumped there)
  const keyIn = (name) => {
    for (const k of keys ?? [])
      if (k.text === `${state.group}: ${name}` && k.time >= state.startTime && k.time <= state.stopTime) return k.time;
    return NaN;
  };
  let a = keyIn('loop start'),
    b = keyIn('loop stop');
  if (!(b > a)) {
    a = state.startTime;
    b = state.stopTime;
  }
  const span = b - a;
  if (!(span > 0)) return null;
  return a + ((((time - a + span / 2) % span) + span) % span);
}

/** MW-PACE1: the fastest and the slowest a paced attack section runs (file seconds a second), and the least time
 *  left a section is fitted into - a blow already late finishes as fast as the cap lets it, never in one frame. */
export const BLOW_RATE_MAX = 12;
export const BLOW_RATE_MIN = 0.1;
export const BLOW_LEFT_MIN = 1 / 60;

/** MW-PACE1: a section's rate - its file span over the seconds left to it, held to the bounds. A span that is no
 *  span plays at 1 (it has nothing to fit). */
export function blowRate(span, left) {
  if (!(span > 0)) return 1;
  return Math.min(BLOW_RATE_MAX, Math.max(BLOW_RATE_MIN, span / Math.max(left, BLOW_LEFT_MIN)));
}

/**
 * THE RELEASE'S START POINT, resolved against the file's own key times.
 *
 * Split out of the runtime so it can be pinned without a GPU: it is the
 * three getTextKeyTime calls of character.cpp:1767-1783 and nothing else.
 * Every one of them is a PREFIX lookup that answers -1 when the key is
 * absent (rule 46), and releaseStartPoint's ordering tests are what
 * filter that - no sentinel test anywhere, exactly as the reference.
 */
export function releaseSkip(keys, group, attackType, strength) {
  const k = attackKeys(attackType, strength);
  const keyTime = (name) => getTextKeyTime(keys, `${group}: ${name}`); // (not `t` - the text core's, imported here)
  return releaseStartPoint(strength, {
    minAttackTime: keyTime(k.minAttack),
    maxAttackTime: keyTime(k.maxAttack),
    minHitTime: keyTime(k.minHit),
    hitTime: keyTime(k.hitKey),
  });
}
