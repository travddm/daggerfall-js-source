// Weapon animation rules for the Morrowind layer: weapon-type table, attack keys,
// stance/weapon/movement group composition. Moved unchanged out of mwFirstPerson.js.

/**
 * MW-D9: THE WEAPON RECORDS.
 *
 * ESM::Weapon::Type, read off components/esm3/loadweap.hpp - explicit
 * values, every one of them, including the four NEGATIVE pseudo-types
 * that are not items at all. The reverted arc had FOUR weapon classes
 * where the reference has fourteen, so every one-hander was forced onto
 * one group; the whole table is here so that cannot recur by omission.
 */
export const MW_WEAPON_TYPE = Object.freeze({
  PickProbe: -4,
  HandToHand: -3,
  Spell: -2,
  None: -1,
  ShortBladeOneHand: 0,
  LongBladeOneHand: 1,
  LongBladeTwoHand: 2,
  BluntOneHand: 3,
  BluntTwoClose: 4,
  BluntTwoWide: 5,
  SpearTwoWide: 6,
  AxeOneHand: 7,
  AxeTwoHand: 8,
  MarksmanBow: 9,
  MarksmanCrossbow: 10,
  MarksmanThrown: 11,
  Arrow: 12,
  Bolt: 13,
});

/** RULE 8's attach-bone column, and RULE 17 is why it is a table rather
 *  than a constant: for PRT_Weapon the generic "Weapon Bone" from the
 *  part table is REPLACED by the equipped type's own mAttachBone when the
 *  actor has that node. The bow is the reason the column exists - it is
 *  the only weapon that goes on the LEFT - and the reverted arc, having
 *  no such table, put every weapon on one bone. */
export const WEAPON_ATTACH_BONE = Object.freeze({
  [MW_WEAPON_TYPE.MarksmanBow]: 'Weapon Bone Left',
  [MW_WEAPON_TYPE.Arrow]: 'Bip01 Arrow',
  [MW_WEAPON_TYPE.Bolt]: 'ArrowBone',
});
/**
 * MW-D12 / RULE 11's ATTACK TYPE, AND THIS ROW IS A PORT DECISION.
 *
 * The two games choose an attack differently and there is no translation
 * between them, only a mapping somebody has to pick:
 *
 *   Morrowind picks by MOVEMENT at the moment of the swing
 *   (getMovementBasedAttackType, character.cpp:2924-2932): forward or
 *   back dominating is "thrust", sideways is "slash", otherwise "chop" -
 *   or, with "always use best attack" on, the type with the highest
 *   damage spread on the WEAP record.
 *
 *   Daggerfall picks by GESTURE: the mouse drag's 15-degree radial
 *   section becomes one of six strikes, and the strike IS the attack.
 *
 * So the port maps Daggerfall's six onto Morrowind's three BY THE SHAPE
 * OF THE MOTION, which is the only honest correspondence available:
 *
 *   StrikeDown, StrikeDownLeft, StrikeDownRight -> chop    (a downward arc)
 *   StrikeLeft, StrikeRight                     -> slash   (a horizontal one)
 *   StrikeUp                                    -> thrust  (the port's own
 *       viewmodel already calls StrikeUp the thrust, Characters-Arc.md)
 *
 * and a BOW's swing is Morrowind's "shoot" whatever direction produced
 * it, because the bow has no directional attacks at all.
 *
 * getBestAttack is NOT ported and is not a gap: it reads the damage
 * spread off a WEAP record to answer a question Daggerfall never asks -
 * the player's gesture has already chosen.
 */
export const DF_STRIKE_TO_MW_ATTACK = Object.freeze({
  StrikeDown: 'chop',
  StrikeDownLeft: 'chop',
  StrikeDownRight: 'chop',
  StrikeLeft: 'slash',
  StrikeRight: 'slash',
  StrikeUp: 'thrust',
});

/**
 * MS1 - THE BACKHAND (- and, of a mirror that changed hands,
 * "There must be a way to keep it correctly in the correct hand.").
 *
 * Morrowind's slash is ONE motion: the weapon hand sweeps from the
 * actor's right across to the left. A mirror would send it the other
 * way, but a mirror swaps hands. What keeps the sword in the right hand
 * and sends it left-to-right is the SAME clip run BACKWARDS: the
 * follow-through reversed is a wind-up that carries the arm across the
 * body to the left, the release reversed sweeps the blade from left to
 * right, and the wind-up reversed settles the arm from its cocked side
 * back to rest. That is a backhand - the stroke a right-hander actually
 * makes to swing left-to-right - on the right arm, with the sword where
 * it is. StrikeLeft is Morrowind's own slash (the blade comes from
 * screen-right and crosses to the left); StrikeRight is the backhand.
 * The chops and the thrust have no side a reversal would honour (a chop
 * backwards is an uppercut), and a shot is one draw.
 */
export const REVERSED_STRIKES = Object.freeze(['StrikeRight']);
export const strikeReversed = (strike) => REVERSED_STRIKES.includes(strike);

/** Rule 11's ranged case: every bow swing is "shoot", and the release
 *  key is "shoot release" where a melee blow is "<type> hit". */
export const MW_SHOOT_ATTACK = 'shoot';

export function mwAttackType(strike, { bow = false } = {}) {
  if (bow) return MW_SHOOT_ATTACK;
  return DF_STRIKE_TO_MW_ATTACK[strike] ?? null;
}

/**
 * RULE 11's KEY NAMES, composed. The attack type never enters the GROUP -
 * it is a prefix on the text keys inside the long group
 * (character.cpp:1663-1718, 1762-1815):
 *
 *   wind-up   "<type> start"        -> "<type> max attack"
 *   release   "<type> max attack"   -> "<type> hit"     ("shoot release")
 *   follow    "<type> <strength> follow start" -> "... follow stop"
 *
 * where strength is small (<0.33), medium (<0.66) or large - and "shoot"
 * has NO strength word at all.
 */
export function attackKeys(attackType, strength = 0, { reversed = false } = {}) {
  const shoot = attackType === MW_SHOOT_ATTACK;
  const hit = shoot ? 'release' : 'hit';
  const word = strength < 0.33 ? 'small' : strength < 0.66 ? 'medium' : 'large';
  const windUp = { start: `${attackType} start`, stop: `${attackType} max attack` };
  const release = { start: `${attackType} max attack`, stop: `${attackType} ${hit}` };
  const follow = shoot
    ? { start: `${attackType} follow start`, stop: `${attackType} follow stop` }
    : { start: `${attackType} ${word} follow start`, stop: `${attackType} ${word} follow stop` };
  // MS1: THE BACKHAND is the forward sections in reverse order, each
  // played backwards - the key PAIRS stay in file order (resetClip
  // wants start before stop) and the clip state carries `reversed`,
  // which the pose reads as startTime + stopTime - time. A shot never
  // reverses.
  const back = reversed && !shoot;
  return {
    reversed: back,
    windUp: back ? follow : windUp,
    release,
    follow: back ? windUp : follow,
    hitKey: `${attackType} ${hit}`,
    // THE THREE KEYS NOBODY PLAYS, which only ever have their TIMES read
    // (character.cpp:1241-1242, :1779). They are not clip boundaries -
    // they are the measuring stick the wind-up strength and the release's
    // skip-ahead are computed against, and they are named here so the
    // caller never has to spell one out and get a space wrong.
    minAttack: `${attackType} min attack`,
    maxAttack: `${attackType} max attack`,
    minHit: `${attackType} min hit`,
  };
}

/**
 * CharacterController::calculateWindUp, verbatim (character.cpp:1235-1248).
 *
 * How far into the wind-up window the clip got, 0 to 1 - and -1, THE
 * SENTINEL, when the window does not exist. The caller must not read -1
 * as "no charge": prepareHit (:1256-1259) replaces it with a RANDOM
 * `min(1, 0.1 + rollClosedProbability())`, which is a different thing
 * from zero and is why the sentinel is a number rather than a null.
 *
 * @param currentTime   the playhead in the weapon group
 * @param minAttackTime getTextKeyTime("<group>: <type> min attack")
 * @param maxAttackTime getTextKeyTime("<group>: <type> max attack")
 */
export function calculateWindUp(currentTime, minAttackTime, maxAttackTime) {
  if (minAttackTime === -1 || minAttackTime >= maxAttackTime) return -1;
  const f = (currentTime - minAttackTime) / (maxAttackTime - minAttackTime);
  return Math.min(1, Math.max(0, f));
}

/**
 * The release's SKIP-AHEAD (character.cpp:1774-1784).
 *
 * A weak blow does not play the whole swing: it starts `1 - strength` of
 * the way through, and that fraction is then RESCALED so it never eats
 * into the part of the clip after the hit - `(minHit - maxAttack) /
 * (hit - maxAttack)` - but ONLY when the file actually orders the three
 * keys that way. Every term is an ordering test, never a sentinel test,
 * which is the recorded caveat on rule 46: a missing `min hit` comes
 * back as -1 and fails `maxAttackTime <= minHitTime` on its own.
 */
export function releaseStartPoint(strength, { minAttackTime, maxAttackTime, minHitTime, hitTime }) {
  if (minAttackTime === -1 || minAttackTime >= maxAttackTime) return 0;
  let startPoint = 1 - strength;
  if (maxAttackTime <= minHitTime && minHitTime < hitTime) {
    startPoint *= (minHitTime - maxAttackTime) / (hitTime - maxAttackTime);
  }
  return startPoint;
}

/** Rule 10's draw and sheathe, which are the long group's own keys
 *  (character.cpp:1444-1478 and :1390-1414). */
export const EQUIP_KEYS = Object.freeze({ start: 'equip start', stop: 'equip stop', attach: 'equip attach' });
export const UNEQUIP_KEYS = Object.freeze({ start: 'unequip start', stop: 'unequip stop', detach: 'unequip detach' });

/**
 * MW-D12 / RULE 8's OTHER TWO COLUMNS, which the port never carried.
 *
 * `weapontype.cpp` gives every type TWO names and they are not derivable
 * from one another:
 *
 *   mLongGroup  - the animation group for the whole draw/attack/sheathe
 *                 cycle. The attack type is NOT part of it (rule 11).
 *   mShortGroup - a SUFFIX for the stance variants: "idle" + "1h" =
 *                 "idle1h", and the same for movement and jump (rule 9).
 *
 * The table is transcribed, not reasoned about. It deliberately collides:
 * AxeOneHand shares BluntOneHand's pair, AxeTwoHand shares
 * BluntTwoClose's, SpearTwoWide shares BluntTwoWide's - and PickProbe
 * borrows the 1h SHORT group while keeping its own LONG one. The bible
 * records that the reverted arc got this wrong in one direction (four
 * classes for eleven groups) and that MWAUDIT's correction got it wrong
 * in another (moving every two-hander to weapontwowide); both were
 * reasoned rather than read.
 */
export const WEAPON_SHORT_GROUP = Object.freeze({
  [MW_WEAPON_TYPE.ShortBladeOneHand]: '1s',
  [MW_WEAPON_TYPE.LongBladeOneHand]: '1h',
  [MW_WEAPON_TYPE.BluntOneHand]: '1b',
  [MW_WEAPON_TYPE.AxeOneHand]: '1b',
  [MW_WEAPON_TYPE.LongBladeTwoHand]: '2c',
  [MW_WEAPON_TYPE.AxeTwoHand]: '2b',
  [MW_WEAPON_TYPE.BluntTwoClose]: '2b',
  [MW_WEAPON_TYPE.BluntTwoWide]: '2w',
  [MW_WEAPON_TYPE.SpearTwoWide]: '2w',
  [MW_WEAPON_TYPE.MarksmanBow]: 'bow',
  [MW_WEAPON_TYPE.MarksmanCrossbow]: 'crossbow',
  [MW_WEAPON_TYPE.MarksmanThrown]: '1t',
  [MW_WEAPON_TYPE.HandToHand]: 'hh',
  [MW_WEAPON_TYPE.Spell]: 'spell',
  [MW_WEAPON_TYPE.PickProbe]: '1h',
  [MW_WEAPON_TYPE.None]: '',
});

export const WEAPON_LONG_GROUP = Object.freeze({
  [MW_WEAPON_TYPE.ShortBladeOneHand]: 'shortbladeonehand',
  [MW_WEAPON_TYPE.LongBladeOneHand]: 'weapononehand',
  [MW_WEAPON_TYPE.BluntOneHand]: 'bluntonehand',
  [MW_WEAPON_TYPE.AxeOneHand]: 'bluntonehand',
  [MW_WEAPON_TYPE.LongBladeTwoHand]: 'weapontwohand',
  [MW_WEAPON_TYPE.AxeTwoHand]: 'blunttwohand',
  [MW_WEAPON_TYPE.BluntTwoClose]: 'blunttwohand',
  [MW_WEAPON_TYPE.BluntTwoWide]: 'weapontwowide',
  [MW_WEAPON_TYPE.SpearTwoWide]: 'weapontwowide',
  [MW_WEAPON_TYPE.MarksmanBow]: 'bowandarrow',
  [MW_WEAPON_TYPE.MarksmanCrossbow]: 'crossbow',
  [MW_WEAPON_TYPE.MarksmanThrown]: 'throwweapon',
  [MW_WEAPON_TYPE.HandToHand]: 'handtohand',
  [MW_WEAPON_TYPE.Spell]: 'spellcast',
  [MW_WEAPON_TYPE.PickProbe]: 'pickprobe',
  [MW_WEAPON_TYPE.None]: '',
});

export const weaponShortGroup = (type) => WEAPON_SHORT_GROUP[type] ?? '';
export const weaponLongGroup = (type) => WEAPON_LONG_GROUP[type] ?? '';

/**
 * MWMechanics::getAllWeaponTypeShortGroups (weapontype.cpp:422-434):
 * every type First(-4) through Last(13), non-empty short groups only,
 * deduplicated "via a set" - std::set, which also SORTS them. The order
 * is not load-bearing for the one consumer (isLoopingAnimation scans
 * for the LONGEST suffix wherever it sits), but the pin asserts it so a
 * second consumer inherits the reference's answer, not this table's
 * iteration order. Arrow and Bolt sit inside [First, Last] with an
 * empty short group and are dropped by the non-empty test, which is why
 * eleven come out of eighteen.
 */
export function allWeaponShortGroups() {
  const set = new Set();
  for (let type = MW_WEAPON_TYPE.PickProbe; type <= MW_WEAPON_TYPE.Bolt; type++) {
    const shortGroup = weaponShortGroup(type);
    if (shortGroup) set.add(shortGroup);
  }
  return [...set].sort();
}

/**
 * THE OTHER TWO COLUMNS OF THE SAME TABLE (weapontype.cpp), which decide
 * every fallback below and which the port had been guessing at with a
 * hand-written list of "two-handed" types.
 *
 * `mWeaponClass` is Melee, Ranged, Thrown or Ammo, and `mFlags` is a
 * bitfield of TwoHanded (0x01) and HasHealth (0x02) (loadweap.hpp:91-105).
 * Transcribed, and the surprises are transcribed with it: SPELL and
 * HAND-TO-HAND BOTH CARRY THE TwoHanded BIT, and both are class Melee -
 * so a test of "TwoHanded" alone would send bare fists to the two-handed
 * ladder. The reference never asks that question alone; every use pairs
 * the bit with the class, and so does isTwoHandedMelee below.
 */
export const MW_WEAPON_CLASS = Object.freeze({
  Melee: 0, Ranged: 1, Thrown: 2, Ammo: 3,
});
export const MW_TWO_HANDED = 0x01;
export const MW_HAS_HEALTH = 0x02;

export const WEAPON_CLASS = Object.freeze({
  [MW_WEAPON_TYPE.None]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.PickProbe]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.Spell]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.HandToHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.ShortBladeOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.LongBladeOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.BluntOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.AxeOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.LongBladeTwoHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.AxeTwoHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.BluntTwoClose]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.BluntTwoWide]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.SpearTwoWide]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.MarksmanBow]: MW_WEAPON_CLASS.Ranged,
  [MW_WEAPON_TYPE.MarksmanCrossbow]: MW_WEAPON_CLASS.Ranged,
  [MW_WEAPON_TYPE.MarksmanThrown]: MW_WEAPON_CLASS.Thrown,
  [MW_WEAPON_TYPE.Arrow]: MW_WEAPON_CLASS.Ammo,
  [MW_WEAPON_TYPE.Bolt]: MW_WEAPON_CLASS.Ammo,
});

export const WEAPON_FLAGS = Object.freeze({
  [MW_WEAPON_TYPE.None]: 0,
  [MW_WEAPON_TYPE.PickProbe]: 0,
  [MW_WEAPON_TYPE.Spell]: MW_TWO_HANDED,
  [MW_WEAPON_TYPE.HandToHand]: MW_TWO_HANDED,
  [MW_WEAPON_TYPE.ShortBladeOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.LongBladeOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.BluntOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.AxeOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.LongBladeTwoHand]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.AxeTwoHand]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.BluntTwoClose]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.BluntTwoWide]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.SpearTwoWide]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.MarksmanBow]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.MarksmanCrossbow]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.MarksmanThrown]: 0,
  [MW_WEAPON_TYPE.Arrow]: 0,
  [MW_WEAPON_TYPE.Bolt]: 0,
});

export const weaponClass = (type) => WEAPON_CLASS[type] ?? MW_WEAPON_CLASS.Melee;
export const weaponFlags = (type) => WEAPON_FLAGS[type] ?? 0;

/**
 * isRealWeapon (character.cpp:316-320), verbatim, and it is the gate on
 * BOTH fallback ladders below:
 *
 *   return weaponType != HandToHand && weaponType != Spell && weaponType != None;
 *
 * PickProbe IS a real weapon by this test, which is the one entry nobody
 * guesses right. The consequence is the rule: bare fists, a readied
 * spell, and an empty sheathed hand DO NOT take a sword's animation when
 * their own is missing - they fall straight to the bare base group, or to
 * nothing at all.
 */
export function isRealWeapon(type) {
  return type !== MW_WEAPON_TYPE.HandToHand
    && type !== MW_WEAPON_TYPE.Spell
    && type !== MW_WEAPON_TYPE.None;
}

/** `weapInfo->mFlags & TwoHanded && mWeaponClass == Melee`
 *  (character.cpp:584, :620). BOTH terms: bows are TwoHanded and Ranged,
 *  so they take the ONE-handed ladder, and hand-to-hand is TwoHanded and
 *  Melee but is filtered out before this by isRealWeapon. */
export function isTwoHandedMelee(type) {
  return !!(weaponFlags(type) & MW_TWO_HANDED)
    && weaponClass(type) === MW_WEAPON_CLASS.Melee;
}

/**
 * RULE 9's FALLBACK, which is a real function and not a guess
 * (`CharacterController::fallbackShortWeaponGroup`, character.cpp:602-637).
 *
 *   0. NOT A REAL WEAPON    -> the BARE base group, at once (:604-611)
 *   1. two-handed MELEE     -> base + "2c"  (LongBladeTwoHand's short)
 *   2. anything else        -> base + "1h"  (LongBladeOneHand's short)
 *   3. still missing        -> the BARE base group (:629-634)
 *
 * Step 0 is the one this port shipped without and it is not a nicety:
 * without it a bare-handed player whose .kf has no "idlehh" idles in
 * "idle1h" - the one-handed SWORD stance, fist raised as if holding a
 * blade - where Morrowind gives them the plain "idle".
 *
 * The blend-mask half of the reference is deliberately absent: steps 0
 * and 3 also narrow the animation to BlendMask_LowerBody, which is a
 * first-person no-op (there is no lower body in shot) and would be a lie
 * to carry as a field nothing reads.
 *
 * The reverted arc invented a different chain ending in "any idle in the
 * file", which is how it drew a plausible wrong animation instead of
 * saying it had none. There is no such tail here.
 *
 * @param base    "idle", "runforward", ... - the group WITHOUT the suffix
 * @param type    an MW_WEAPON_TYPE
 * @param hasGroup(name) -> boolean, the file's own answer
 */
export function composeStanceGroup(base, type, hasGroup) {
  const short = weaponShortGroup(type);
  const asked = short ? `${base}${short}` : base;
  if (hasGroup(asked)) return { group: asked, fallback: null };
  if (!isRealWeapon(type)) {
    return hasGroup(base) ? { group: base, fallback: 'bare' } : { group: null, fallback: null };
  }
  const ladder = isTwoHandedMelee(type)
    ? `${base}${WEAPON_SHORT_GROUP[MW_WEAPON_TYPE.LongBladeTwoHand]}`
    : `${base}${WEAPON_SHORT_GROUP[MW_WEAPON_TYPE.LongBladeOneHand]}`;
  if (ladder !== asked && hasGroup(ladder)) return { group: ladder, fallback: 'short' };
  if (hasGroup(base)) return { group: base, fallback: 'bare' };
  return { group: null, fallback: null };
}

/**
 * getWeaponAnimation (character.cpp:573-592), the LONG group, and its
 * ladder is gated the same way - `isRealWeapon(weaponType) &&
 * !hasAnimation(weaponGroup)`.
 *
 * So a missing "handtohand" does NOT become "weapononehand": the
 * reference returns the missing name and the caller finds no animation,
 * which here is a null group and a stance that plays its idle and
 * refuses to swing. That refusal is the correct outcome - an arm that
 * mimes a sword swing with empty hands is worse than one that does not
 * swing.
 *
 * The non-bipedal "attack1" arm (:589-590) is out of scope by
 * construction: the player is bipedal and this module only ever animates
 * the player's own first-person rig.
 */
/**
 * MW-D26: THE MOVEMENT STATE - refreshCurrentAnims' movestate ladder
 * (character.cpp:2297-2330) minus the swim family (deferred with the
 * port's swim animations; recorded, not faked). The strafe test is the
 * reference's own 2:1 (character.cpp:2085 - mIsStrafing when the side
 * component more than doubles the forward one); sneak beats run beats
 * walk exactly as the nested ternaries order them; and the TURN states
 * exist only for a third-person biped that is not sneaking
 * (character.cpp:2321-2329 - "do not use turning animations in the
 * first-person view and when sneaking"). Returns the base group name
 * ("runforward", "turnleft", ...) or null for standing still.
 */
export function movementAnimState({
  forward = 0, strafe = 0, running = false, sneaking = false,
  turning = 0, thirdPerson = false,
} = {}) {
  const prefix = sneaking ? 'sneak' : running ? 'run' : 'walk';
  const strafing = Math.abs(strafe) > Math.abs(forward) * 2;
  if (strafing) return strafe > 0 ? `${prefix}right` : `${prefix}left`;
  if (forward !== 0 || strafe !== 0) return forward >= 0 ? `${prefix}forward` : `${prefix}back`;
  if (turning && thirdPerson && !sneaking) return turning > 0 ? 'turnright' : 'turnleft';
  return null;
}

/**
 * MW-D26: the movement group's WEAPON suffix and its fallbacks
 * (refreshMovementAnims, character.cpp:674-708). The suffix ladder is
 * fallbackShortWeaponGroup's, which composeStanceGroup already IS
 * (asked short, then the 2c/1h fallback for real weapons, then the
 * bare base) - one home, reused. What movement adds on top is the
 * run -> walk swap (character.cpp:697-699) when the composed name has
 * no animation, and a null when even that misses (:701-707 - the
 * movement state RESETS rather than substituting a wrong clip).
 */
export function composeMovementGroup(base, type, hasGroup) {
  const short = weaponShortGroup(type);
  let name = base;
  if (short && type === MW_WEAPON_TYPE.Spell && (base === 'turnleft' || base === 'turnright')) {
    // "Spellcasting stance turning is a special case" (character.cpp:676-687):
    // the short group PREFIXES the movement name - "spellturnleft", never
    // "turnleftspell", which is a name no .kf carries. A miss falls to
    // fallbackShortWeaponGroup, and a spell is not a real weapon, so that
    // hands back the BARE base at once (:604-611) - the suffix ladder is
    // never asked here. (isTurning's swim states are excluded upstream by
    // the reference's own swimpos gate.)
    const prefixed = `${short}${base}`;
    name = hasGroup(prefixed) ? prefixed : base;
  } else if (short) {
    const r = composeStanceGroup(base, type, hasGroup);
    name = r.group ?? base;
  }
  if (!hasGroup(name)) {
    const walked = name.replace('run', 'walk');
    if (walked !== name && hasGroup(walked)) return { group: walked, walked: true };
    return { group: null, walked: false };
  }
  return { group: name, walked: false };
}

/**
 * MW-D39: THE JUMP STATE - update()'s in-air derivation
 * (character.cpp:2195-2296), the ANIMATION half only. The same block's
 * fall damage, Acrobatics progression, knockdown and landing sounds
 * are DFU's own laws in this port (fallwater/footsteps own them; the
 * reference's DefaultLand is NoPlayerLocal anyway - the first-person
 * player never hears their own), so what this derives is exactly what
 * refreshJumpAnims consumes: which of the two jump plays is owed, and
 * whether movement selection is suppressed this frame.
 *
 * The reference's shape, kept:
 *   - mInJump is re-derived EVERY frame from the world, not latched
 *     (:2195-2196 - wasInJump is remembered, mInJump starts false);
 *   - in the air and not swimming, not levitating: InAir, and inJump
 *     (:2206-2212 - the reference's !inwater && !flying && solid gate;
 *     this port has no noclip, so solid is construction);
 *   - THE TAKEOFF FRAME (:2224-2227): a jump STARTING while still
 *     grounded sets mInJump - movement gates off one frame before the
 *     feet leave - but plays nothing yet; the `priorInAir` guard is
 *     the reference's own `mJumpState != JumpState_InAir`, which is
 *     what keeps the LANDING frame (motor's jump latch not yet
 *     cleared) from reading as a fresh takeoff;
 *   - not in a jump, and the jump clip is still playing: Landing
 *     (:2292-2293) - the state that plays the clip's tail once and
 *     clears itself when the clip stops.
 *
 * `jumpQueued` is the port's crossing for `vec.z() > 0`: the motor's
 * own jump latch (AcrobatMotor.Jumping - set at the jump, cleared on
 * the next grounded frame), true on exactly the takeoff frame while
 * grounded. Swim-family jump groups are out with the swim movement
 * family (MW-D26's recorded deferral, one line over).
 *
 * @returns {{ jump: 'inair'|'landing'|null, inJump: boolean }}
 */
export function jumpAnimState({ grounded = true, swimming = false, levitating = false,
  jumpQueued = false, priorInAir = false, jumpPlaying = false } = {}) {
  let inJump = false;
  let jump = null;
  if (!swimming && !levitating) {
    if (!grounded) { inJump = true; jump = 'inair'; }
    else if (!priorInAir && jumpQueued) inJump = true;   // :2224-2227, the takeoff frame
  }
  if (!inJump && jumpPlaying) jump = 'landing';   // :2292-2293
  return { jump, inJump };
}

/** character.cpp:750-752 - the animation speeds assumed when a clip
 *  carries no accum-root velocity ("the first person anims don't have
 *  any velocity to calculate a speed multiplier from"), in MW units
 *  per second: sneak, run, walk. */
export const MOVEMENT_FALLBACK_SPEED = Object.freeze({
  sneak: 33.5452, run: 222.857, walk: 154.064,
});

/** character.cpp:2403 - "Vanilla caps the played animation speed." */
export const MOVEMENT_SPEED_CAP = 10;

/** character.cpp:2396 - the turning animation's own speed law. */
export const turnAnimSpeed = (yawRatePerSec) =>
  Math.min(1.5, Math.abs(yawRatePerSec) / Math.PI);

export function composeWeaponGroup(type, hasGroup) {
  const asked = weaponLongGroup(type);
  if (asked && hasGroup(asked)) return { group: asked, fallback: null };
  if (!isRealWeapon(type)) return { group: null, fallback: null };
  const ladder = isTwoHandedMelee(type)
    ? WEAPON_LONG_GROUP[MW_WEAPON_TYPE.LongBladeTwoHand]
    : WEAPON_LONG_GROUP[MW_WEAPON_TYPE.LongBladeOneHand];
  if (ladder !== asked && hasGroup(ladder)) return { group: ladder, fallback: 'long' };
  return { group: null, fallback: null };
}

/**
 * MW-D16 / RULE 8's LAST COLUMN: mAmmoType (weapontype.cpp). Only the two
 * marksman types have one, and MarksmanThrown does NOT - a thrown weapon
 * IS its own ammunition, which is why attachArrow's Thrown branch just
 * shows the weapon again instead of adding a node
 * (weaponanimation.cpp:70-79).
 */
export const WEAPON_AMMO_TYPE = Object.freeze({
  [MW_WEAPON_TYPE.MarksmanBow]: MW_WEAPON_TYPE.Arrow,
  [MW_WEAPON_TYPE.MarksmanCrossbow]: MW_WEAPON_TYPE.Bolt,
});
export const ammoTypeFor = (type) => WEAPON_AMMO_TYPE[type] ?? MW_WEAPON_TYPE.None;

/**
 * getArrowBone (npcanimation.cpp:1077-1102): the bone the held round sits
 * on, which is the AMMO type's attach bone - "Bip01 Arrow" for an arrow,
 * "ArrowBone" for a bolt - looked for in the ACTOR's skeleton first, and
 * failing that as a node named "ArrowBone" INSIDE THE WEAPON'S OWN MESH.
 *
 * The fallback is not a nicety: Morrowind's bows carry that node and most
 * skeletons do not carry "Bip01 Arrow", so on retail data the second
 * branch is the one that runs. It also decides the arrow's whole
 * placement, because a node inside the weapon's mesh brings the weapon's
 * transform chain with it - and the weapon's own mirror. A bow hangs on
 * "Weapon Bone Left", so rule 13 negates its X, and THE ARROW INHERITS
 * THAT, because the reference instances it under a node that is already
 * inside the mirrored subtree.
 */
export const ARROW_FALLBACK_NODE = 'ArrowBone';
export function arrowAttachBone(weaponType) {
  const ammo = ammoTypeFor(weaponType);
  if (ammo === MW_WEAPON_TYPE.None) return null;
  return WEAPON_ATTACH_BONE[ammo] ?? null;
}

/**
 * character.cpp:1827-1829, as a condition rather than an `if` buried in a
 * switch:
 *
 *   if (ammunition && mWeaponType == ESM::Weapon::MarksmanCrossbow)
 *       mAnimation->attachArrow();
 *
 * at the end of Equipping, AttackEnd or Casting. A CROSSBOW puts the next
 * bolt on itself; a BOW does not, and waits for the next "shoot attach"
 * key - so a freshly drawn bow is empty-handed until you begin to draw
 * it. That reads as a bug until you see the weapon type in the test.
 *
 * DAGGERFALL HAS NO CROSSBOW, so no row of DF_TO_MW_WEAPON reaches
 * MarksmanCrossbow and this can never be true in the played game. It is
 * here as a FUNCTION, pinned on its own, precisely because of that: a
 * branch that cannot be exercised is not pinned, and a condition that can
 * be is. If a crossbow row is ever added, the arm reloads correctly with
 * nothing to change.
 */
export const reloadsItself = (type) => type === MW_WEAPON_TYPE.MarksmanCrossbow;

/**
 * character.cpp:1676-1677 - which attacks are "shoot":
 *
 *   if (weapclass == ESM::WeaponType::Ranged || weapclass == ESM::WeaponType::Thrown)
 *       mAttackType = "shoot";
 *
 * A CLASS test, not a bow test, and the two are not the same: a THROWN
 * weapon shoots without being a bow, which is the case the port's own
 * `machine.isBow` would have missed. Daggerfall has no thrown-weapon row
 * either, so like reloadsItself this is a condition the played game
 * cannot reach today and a function that is right when it can.
 */
export const shootsRatherThanSwings = (type) => {
  const cls = weaponClass(type);
  return cls === MW_WEAPON_CLASS.Ranged || cls === MW_WEAPON_CLASS.Thrown;
};

export const DEFAULT_WEAPON_BONE = 'Weapon Bone';

/** Rules 8 + 17: the bone this weapon type attaches at. The fallback is
 *  the part table's own entry, exactly as the reference's comment says. */
export const weaponAttachBone = (type) => WEAPON_ATTACH_BONE[type] ?? DEFAULT_WEAPON_BONE;
