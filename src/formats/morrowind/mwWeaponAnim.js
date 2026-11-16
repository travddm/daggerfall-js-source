// @ts-check
// Weapon animation rules for the Morrowind layer: which weapon type plays which animation group, the text keys that
// time a swing, and the group names that stance, movement and jumping ask for.
//
// Sources: the WEAP record layout (UESP, Tes3Mod:File Format), the group list and text keys of the retail
// meshes/xbase_anim.kf files, and the Construction Set help on animation groups.
// Every function is pure: the caller passes `hasGroup(name)`, a test over the lowercase names of the clips it has loaded.

/** WEAP `WPDT` type values (UESP), then the pseudo-types the layer adds for what a hand can hold that is no item. */
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

const T = MW_WEAPON_TYPE;

export const MW_WEAPON_CLASS = Object.freeze({ Melee: 0, Ranged: 1, Thrown: 2, Ammo: 3 });
export const MW_TWO_HANDED = 0x01;
export const MW_HAS_HEALTH = 0x02;

const { Melee, Ranged, Thrown, Ammo } = MW_WEAPON_CLASS;
const TWO = MW_TWO_HANDED;
const HEALTH = MW_HAS_HEALTH;

/**
 * One row per weapon type that has a stance: the group-name suffix of its stance and movement clips (`short`), the
 * name of its attack group (`long`), its class and its flags. The retail files carry only the suffixes 1h, 2c, 2w, hh
 * and crossbow (Idle1h, WalkForward2c, ...) and the attack groups WeaponOneHand, WeaponTwoHand, WeaponTwoWide,
 * HandToHand, BowAndArrow, Crossbow and ThrowWeapon. The finer names (1s, 1b, 2b, 1t, ShortBladeOneHand, BluntOneHand,
 * BluntTwoHand) are for animation mods that split them, and the ladders below fall back from them to the retail names.
 * A bow, a crossbow, a spell and bare hands hold both hands; `None` is a stance of no hands at all.
 */
const STANCE_ROWS = [
  [T.PickProbe, '1h', 'pickprobe', Melee, 0],
  [T.HandToHand, 'hh', 'handtohand', Melee, TWO],
  [T.Spell, 'spell', 'spellcast', Melee, TWO],
  [T.None, '', '', Melee, 0],
  [T.ShortBladeOneHand, '1s', 'shortbladeonehand', Melee, HEALTH],
  [T.LongBladeOneHand, '1h', 'weapononehand', Melee, HEALTH],
  [T.LongBladeTwoHand, '2c', 'weapontwohand', Melee, HEALTH | TWO],
  [T.BluntOneHand, '1b', 'bluntonehand', Melee, HEALTH],
  [T.BluntTwoClose, '2b', 'blunttwohand', Melee, HEALTH | TWO],
  [T.BluntTwoWide, '2w', 'weapontwowide', Melee, HEALTH | TWO],
  [T.SpearTwoWide, '2w', 'weapontwowide', Melee, HEALTH | TWO],
  [T.AxeOneHand, '1b', 'bluntonehand', Melee, HEALTH],
  [T.AxeTwoHand, '2b', 'blunttwohand', Melee, HEALTH | TWO],
  [T.MarksmanBow, 'bow', 'bowandarrow', Ranged, HEALTH | TWO],
  [T.MarksmanCrossbow, 'crossbow', 'crossbow', Ranged, HEALTH | TWO],
  [T.MarksmanThrown, '1t', 'throwweapon', Thrown, 0],
];

const column = (index) => Object.freeze(Object.fromEntries(STANCE_ROWS.map((row) => [row[0], row[index]])));

/** Type -> suffix of the stance and movement groups. */
export const WEAPON_SHORT_GROUP = column(1);
/** Type -> name of the attack group. */
export const WEAPON_LONG_GROUP = column(2);
export const weaponShortGroup = (type) => WEAPON_SHORT_GROUP[type] ?? '';
export const weaponLongGroup = (type) => WEAPON_LONG_GROUP[type] ?? '';

/** The distinct stance suffixes, sorted: every group-name ending the weapon rules can ask for. */
export function allWeaponShortGroups() {
  return [...new Set(Object.values(WEAPON_SHORT_GROUP).filter(Boolean))].sort();
}

/** Ammunition has a class and no stance; the stance-less types and unknown values are melee. */
export const WEAPON_CLASS = Object.freeze({ ...column(3), [T.Arrow]: Ammo, [T.Bolt]: Ammo });
export const WEAPON_FLAGS = Object.freeze({ ...column(4), [T.Arrow]: 0, [T.Bolt]: 0 });
export const weaponClass = (type) => WEAPON_CLASS[type] ?? Melee;
export const weaponFlags = (type) => WEAPON_FLAGS[type] ?? 0;

/** True for anything held as a weapon, a pick or a probe included; false for bare hands, a spell and no hands. */
export const isRealWeapon = (type) => type !== T.HandToHand && type !== T.Spell && type !== T.None;

/** A melee stance that holds both hands. Bare hands and a readied spell count: they hold both hands too. */
export const isTwoHandedMelee = (type) => weaponClass(type) === Melee && (weaponFlags(type) & TWO) !== 0;

// ---------------------------------------------------------------------------------------------------------------
// Attack text keys. A swing is a wind-up, a release and a follow-through inside one attack group, named by the text
// keys of the retail clips ("chop start", "chop max attack", "chop hit", "chop small follow start", ...).

/** Daggerfall strike direction -> the kind of Morrowind swing that plays for it. */
export const DF_STRIKE_TO_MW_ATTACK = Object.freeze({
  StrikeDown: 'chop',
  StrikeDownLeft: 'chop',
  StrikeDownRight: 'chop',
  StrikeLeft: 'slash',
  StrikeRight: 'slash',
  StrikeUp: 'thrust',
});

/**
 * Morrowind has one slash, right to left. A strike that must go left to right plays the same clip backwards, so the
 * weapon stays in the same hand: the follow-through span becomes the wind-up and the wind-up span the follow-through.
 */
export const REVERSED_STRIKES = Object.freeze(['StrikeRight']);
export const strikeReversed = (strike) => REVERSED_STRIKES.includes(strike);

export const MW_SHOOT_ATTACK = 'shoot';

/** The swing kind for a strike, `'shoot'` for any strike made with a bow, null for a strike that has no swing. */
export function mwAttackType(strike, { bow = false } = {}) {
  if (bow) return MW_SHOOT_ATTACK;
  return DF_STRIKE_TO_MW_ATTACK[strike] ?? null;
}

/** A swing wound up to at least these strengths plays the medium or the large follow-through. */
const FOLLOW_MEDIUM_FROM = 0.33;
const FOLLOW_LARGE_FROM = 0.66;

/**
 * The text keys that time one swing. A shot has a single follow-through, a release key instead of a hit key, and is
 * never reversed.
 */
export function attackKeys(attackType, strength = 0, { reversed = false } = {}) {
  const isShot = attackType === MW_SHOOT_ATTACK;
  const key = (name) => `${attackType} ${name}`;
  const windUp = { start: key('start'), stop: key('max attack') };
  const hitKey = isShot ? key('release') : key('hit');
  let followSize = 'small ';
  if (strength >= FOLLOW_LARGE_FROM) followSize = 'large ';
  else if (strength >= FOLLOW_MEDIUM_FROM) followSize = 'medium ';
  if (isShot) followSize = '';
  const follow = { start: key(`${followSize}follow start`), stop: key(`${followSize}follow stop`) };
  const flip = reversed && !isShot;
  return {
    reversed: flip,
    windUp: flip ? follow : windUp,
    release: { start: key('max attack'), stop: hitKey },
    follow: flip ? windUp : follow,
    hitKey,
    minAttack: key('min attack'),
    maxAttack: key('max attack'),
    minHit: key('min hit'),
  };
}

/**
 * How far into the wind-up window a swing is, 0 to 1, from the clip times of the "min attack" and "max attack" keys.
 * -1 when the clip has no usable window (a missing key, or a window of zero or negative length).
 */
export function calculateWindUp(currentTime, minAttackTime, maxAttackTime) {
  if (!(minAttackTime >= 0) || !(maxAttackTime > minAttackTime)) return -1;
  const ratio = (currentTime - minAttackTime) / (maxAttackTime - minAttackTime);
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Where in the release span a swing that was wound up only part of the way starts, as a fraction of that span. A full
 * strength swing starts at 0. Otherwise the unwound share (1 - strength) is skipped, scaled by how much of the span
 * lies before the "min hit" key when the clip has one. Every guard is a comparison between key times, so a missing key
 * (-1) fails it by itself and the swing starts at 0.
 */
export function releaseStartPoint(strength, { minAttackTime, maxAttackTime, minHitTime, hitTime }) {
  if (strength >= 1) return 0;
  if (!(minAttackTime >= 0 && maxAttackTime > minAttackTime)) return 0;
  let skipped = 1 - strength;
  if (hitTime > maxAttackTime && minHitTime >= maxAttackTime && minHitTime < hitTime) {
    skipped *= (minHitTime - maxAttackTime) / (hitTime - maxAttackTime);
  }
  return skipped;
}

export const EQUIP_KEYS = Object.freeze({ start: 'equip start', stop: 'equip stop', attach: 'equip attach' });
export const UNEQUIP_KEYS = Object.freeze({ start: 'unequip start', stop: 'unequip stop', detach: 'unequip detach' });

// ---------------------------------------------------------------------------------------------------------------
// Group choice. Each ladder asks for the most specific group the weapon could have, then for the retail group that
// stands in for it, then for the bare group, and answers null when none exists (the caller resets; it never plays a
// wrong clip).

/** The suffix of the retail group that stands in for a weapon's own suffix when the clips lack it. */
const standInSuffix = (type) => (isTwoHandedMelee(type) ? '2c' : '1h');

/**
 * The stance group for a base name such as 'idle' or 'jump'.
 * @returns {{group: string|null, fallback: 'short'|'bare'|null}} `fallback` says which step answered: null when the
 *   weapon's own suffix did, 'short' for the stand-in suffix, 'bare' for the base name of a weapon that has no
 *   clip of its own.
 */
export function composeStanceGroup(base, type, hasGroup) {
  const own = base + weaponShortGroup(type);
  if (hasGroup(own)) return { group: own, fallback: null };
  if (isRealWeapon(type)) {
    const standIn = base + standInSuffix(type);
    if (hasGroup(standIn)) return { group: standIn, fallback: 'short' };
  }
  if (hasGroup(base)) return { group: base, fallback: 'bare' };
  return { group: null, fallback: null };
}

/** The attack group for a weapon type: its own, else the retail one-hand or two-hand group. */
export function composeWeaponGroup(type, hasGroup) {
  const own = weaponLongGroup(type);
  if (own && hasGroup(own)) return { group: own, fallback: null };
  if (isRealWeapon(type)) {
    const standIn = isTwoHandedMelee(type) ? 'weapontwohand' : 'weapononehand';
    if (hasGroup(standIn)) return { group: standIn, fallback: 'long' };
  }
  return { group: null, fallback: null };
}

// ---------------------------------------------------------------------------------------------------------------
// Movement.

/** A strafe wins over the forward axis only when it is more than twice as strong. */
const STRAFE_OVER_FORWARD = 2;

/**
 * The base movement name for the current input, or null when the actor stands still: 'walkforward', 'runback',
 * 'sneakleft', 'turnright'. Sneaking beats running beats walking. Turning on the spot is a third-person clip only and
 * never plays while sneaking.
 */
export function movementAnimState({
  forward = 0,
  strafe = 0,
  running = false,
  sneaking = false,
  turning = 0,
  thirdPerson = false,
} = {}) {
  const gait = sneaking ? 'sneak' : running ? 'run' : 'walk';
  if (forward || strafe) {
    if (Math.abs(strafe) > STRAFE_OVER_FORWARD * Math.abs(forward)) return gait + (strafe > 0 ? 'right' : 'left');
    return gait + (forward > 0 ? 'forward' : 'back');
  }
  if (turning && thirdPerson && !sneaking) return turning > 0 ? 'turnright' : 'turnleft';
  return null;
}

/** The group for a movement base and weapon type. A readied spell turns on its own clips, with the stance in front. */
function movementLadder(base, type, hasGroup) {
  if (type === T.Spell && base.startsWith('turn')) {
    const prefixed = `spell${base}`;
    if (hasGroup(prefixed)) return prefixed;
    return hasGroup(base) ? base : null;
  }
  // A type with no stance row (ammunition, an unknown value) moves with bare hands' clips.
  if (!(type in WEAPON_SHORT_GROUP)) return hasGroup(base) ? base : null;
  return composeStanceGroup(base, type, hasGroup).group;
}

/**
 * The movement group for a base name from movementAnimState. A run (or swim-run) with no run clip plays the bare walk
 * clip, and `walked` says so; the caller then plays it at run speed.
 * @returns {{group: string|null, walked: boolean}}
 */
export function composeMovementGroup(base, type, hasGroup) {
  const group = movementLadder(base, type, hasGroup);
  if (group) return { group, walked: false };
  const walk = base.replace('run', 'walk');
  if (walk !== base && hasGroup(walk)) return { group: walk, walked: true };
  return { group: null, walked: false };
}

/**
 * Which jump clip plays this frame. Swimming and levitating have no jump clips, but a landing clip that is still
 * playing keeps playing. In the air the actor is in a jump with the 'inair' clip. On the takeoff frame (the jump is
 * queued, the feet are still down, and the last frame was not airborne) the movement clips gate off and nothing plays.
 * @returns {{jump: ('inair'|'landing'|null), inJump: boolean}}
 */
export function jumpAnimState({
  grounded = true,
  swimming = false,
  levitating = false,
  jumpQueued = false,
  priorInAir = false,
  jumpPlaying = false,
} = {}) {
  const landing = { jump: /** @type {'landing'} */ ('landing'), inJump: false };
  const none = { jump: /** @type {null} */ (null), inJump: false };
  if (swimming || levitating) return jumpPlaying ? landing : none;
  if (!grounded) return { jump: /** @type {'inair'} */ ('inair'), inJump: true };
  if (jumpQueued && !priorInAir) return { jump: null, inJump: true };
  return jumpPlaying ? landing : none;
}

/**
 * Horizontal root travel of the retail SneakForward, RunForward and WalkForward clips in meshes/xbase_anim.kf, in game
 * units per second, between each clip's Loop Start and Loop Stop keys (mwWeaponAnimParity.test.js measures them). A
 * clip that carries no travel is played at the rate that matches an actor of this pace.
 */
export const MOVEMENT_FALLBACK_SPEED = Object.freeze({ sneak: 33.5452, run: 222.857, walk: 154.064 });

/** The most a movement clip is sped up to match the actor's speed. */
export const MOVEMENT_SPEED_CAP = 10;

/** Turn-in-place clip rate: 1 at half a turn per second, capped at 1.5. */
const TURN_RATE_CAP = 1.5;
export const turnAnimSpeed = (yawRatePerSec) => Math.min(TURN_RATE_CAP, Math.abs(yawRatePerSec) / Math.PI);

// ---------------------------------------------------------------------------------------------------------------
// Ammunition and attach bones.

/** Weapon type -> the ammunition type it fires. */
export const WEAPON_AMMO_TYPE = Object.freeze({ [T.MarksmanBow]: T.Arrow, [T.MarksmanCrossbow]: T.Bolt });
export const ammoTypeFor = (type) => WEAPON_AMMO_TYPE[type] ?? T.None;

/**
 * Bone an arrow or bolt is held on while a weapon is drawn: the biped skeleton has 'Bip01 Arrow' for a bow, and a
 * crossbow model carries its own 'ArrowBone' node. Null for a weapon that fires nothing.
 */
export const ARROW_FALLBACK_NODE = 'ArrowBone';
export function arrowAttachBone(weaponType) {
  if (weaponType === T.MarksmanBow) return 'Bip01 Arrow';
  if (weaponType === T.MarksmanCrossbow) return ARROW_FALLBACK_NODE;
  return null;
}

/** A crossbow cocks itself between shots; a bow is drawn again by the next swing. */
export const reloadsItself = (type) => type === T.MarksmanCrossbow;

/** A ranged weapon fires on release instead of swinging. */
export const shootsRatherThanSwings = (type) => weaponClass(type) === Ranged || weaponClass(type) === Thrown;

/** Where a weapon model attaches: the bow in the left hand, ammunition on its own bones, all else in the right. */
export const WEAPON_ATTACH_BONE = Object.freeze({
  [T.MarksmanBow]: 'Weapon Bone Left',
  [T.Arrow]: 'Bip01 Arrow',
  [T.Bolt]: ARROW_FALLBACK_NODE,
});
export const DEFAULT_WEAPON_BONE = 'Weapon Bone';
export const weaponAttachBone = (type) => WEAPON_ATTACH_BONE[type] ?? DEFAULT_WEAPON_BONE;
