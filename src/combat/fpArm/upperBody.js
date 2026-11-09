// @ts-check
// The arm's upper body: the weapon's draw and stow, the strike's wind-up, release and follow-through, and the cast.
// It plays one section of the stance's weapon group at a time (the action clip) and moves from state to state when a
// section ends. The slots below it (animSlots.js) play the idle, the movement, the jump and the reactions.
//
// The sections come from the text keys of the weapon group in the retail clip files: "equip start/attach/stop",
// "unequip start/detach/stop", and per attack "<type> start", "min attack", "max attack", the release up to "hit", and
// the small, medium or large follow-through; the spellcast group carries "<range> start/release/stop".
//
//   Rest        No weapon in hand (sheathed), or bare hands. Drawing starts the equip section.
//   Drawing     The equip section. The weapon shows at its "equip attach" key (at once when the clip has none). At the
//               end: Ready, with the idle started over.
//   Stowing     The unequip section. The weapon hides at "unequip detach" (at once when the clip has none), and the
//               arrow leaves the string as the section starts. At the end: Rest, and only now does the stance drop to
//               bare hands, so the unequip keys are looked up in the weapon's own group.
//   Ready       The weapon is up. A strike starts the wind-up.
//   Winding     "<type> start" to "max attack". A held strike (a bow at full draw) waits at the end of the section
//               until it is released; any other strike goes on at once.
//   Striking    From the wind-up's strength to "hit". The strength comes from how far the wind-up got between "min
//               attack" and "max attack"; a group without those keys strikes at a random 0.1 to 1.
//   Recovering  The follow-through for that strength. At the end: Ready, the crossbow reloaded, the idle started over.
//               A new strike or a cast cuts it short.
//   Casting     The spellcast group's section for the spell's range. "<range> release" signals the moment the spell
//               leaves. At the end: back to the stance it came from; a spell un-readied mid-cast drops its stance then.
//
// A sheathe is refused while striking or recovering; the strike runs out first and the next sheathe starts the stow.
// The rig can pace a blow so that its "hit" lands when the game's own blow does (blowPlan), and a cast so that its
// release lands at the given moment (castRate). A creature that is not a biped has no stance: it plays one of its
// numbered "attackN" groups whole, as a follow-through.
//
// The state is the fields of the object createUpperBody answers; fpArm.js reads them by name. What it reads of the arm
// comes through `ctx`, as live getters.
import { resetClip, getTextKeyTime, advanceClip } from '../../formats/morrowind/mwAnim.js';
import {
  sourcesKeyTime,
  pickAnimSource,
  composeWeaponGroup,
  EQUIP_KEYS,
  UNEQUIP_KEYS,
  calculateWindUp,
  attackKeys,
  MW_SHOOT_ATTACK,
  reloadsItself,
} from '../../formats/morrowind/mwFirstPerson.js';
import { validCastRate } from '../../systems/castSpeed.js';
import { UPPER_BODY, animWeaponType, releaseSkip, blowRate, spellAttackType } from './fpAnimState.js';

/** The answer calculateWindUp gives for a group with no wind-up keys. */
const NO_WIND_UP_WINDOW = -1;

/**
 * @typedef {{ built: () => any, dead: () => boolean, notes: () => string[], rig: () => any,
 *   hasGroup: (name: string) => boolean, clearAttackHand: () => void }} UpperContext
 * @typedef {{ hitAt: number, seconds: number }} BlowSchedule
 */

const ready = (ub) => {
  const built = ub.ctx.built();
  return !!(built && built.ok);
};
const is = (ub, ...states) => states.includes(ub.upper);

/** Clears the action clip. */
function dropAction(ub) {
  ub.actionState = null;
  ub.actionSource = null;
}

/** Starts the idle over once, when an action asked for it at its start. */
function idleAfterAction(ub) {
  if (!ub.resetIdleOnAttackEnd) return;
  ub.resetIdleOnAttackEnd = false;
  ub.slots.resetIdle();
}

/**
 * The time of a key of the current weapon group, asked of every source: "<group>: <action>". -1 when no source
 * has it.
 * @param {string} action
 * @returns {number}
 */
function keyTime(ub, action) {
  if (!ub.weaponGroup || !ub.ctx.rig()) return -1;
  return sourcesKeyTime(ub.ctx.rig().sources, `${ub.weaponGroup}: ${action}`);
}

/**
 * Plays the weapon group from key `start` to key `stop`, from `startPoint` (0 to 1) of that window, backwards when
 * `reversed`. A window the clips do not carry leaves the action empty, notes it, and answers false: no other
 * section stands in for it.
 */
function playAction(ub, start, stop, startPoint = 0, reversed = false) {
  if (!ub.ctx.rig() || !ub.weaponGroup) return false;
  const got = pickAnimSource(ub.ctx.rig().sources, ub.weaponGroup, resetClip, { start, stop, startPoint });
  if (!got) {
    ub.actionState = null;
    const group = ub.weaponGroup;
    ub.ctx.notes().push(`${group}: no source has "${group}: ${start}" and "${group}: ${stop}"`);
    return false;
  }
  ub.actionState = got.state;
  ub.actionState.reversed = !!reversed;
  ub.actionSource = got.source;
  return true;
}

/** The weapon group of the stance: the held weapon's type, bare hands while sheathed, the spellcast group while a
 *  spell is ready. */
function refreshWeaponGroup(ub) {
  const built = ub.ctx.built();
  if (!built || !built.ok) {
    ub.weaponGroup = null;
    return;
  }
  const type = animWeaponType(built.mwType, ub.sheathed, ub.spellReady);
  ub.weaponGroup = composeWeaponGroup(type, ub.ctx.hasGroup).group;
}

/** A text key the action clip crossed. `mine`: the key belongs to the group playing. */
function onActionKey(ub, text, time, mine) {
  if (!mine || !ub.weaponGroup) return;
  const action = text.slice(ub.weaponGroup.length + 2);
  switch (action) {
    case EQUIP_KEYS.attach:
      ub.weaponShown = true;
      return;
    case UNEQUIP_KEYS.detach:
      ub.weaponShown = false;
      return;
    case 'shoot attach':
    case 'shoot follow attach':
      // The second attach puts the next round on the string during the follow-through.
      ub.arrowShown = true;
      return;
    case 'shoot release':
      // The arrow leaves here, and the rig takes the signal (takeShootRelease) so the shot leaves with it.
      ub.arrowShown = false;
      ub.shootReleased = true;
      return;
    default:
      if (ub.upper === UPPER_BODY.Casting && ub.attackType && action === `${ub.attackType} release`) {
        ub.castReleased = true;
      }
  }
}

/** How strong the blow is, from how far the wind-up got between "min attack" and "max attack". */
function windUpStrength(ub) {
  if (!ub.actionState) return 1;
  const min = keyTime(ub, `${ub.attackType} min attack`);
  const max = keyTime(ub, `${ub.attackType} max attack`);
  const strength = calculateWindUp(ub.actionState.time, min, max);
  if (strength !== NO_WIND_UP_WINDOW) return strength;
  // A group without a wind-up window strikes at a random strength, so its blows still vary.
  return Math.min(1, 0.1 + Math.random());
}

/** Re-fits a paced blow's rate so that the section playing ends when `due` says, from where the arm is now. */
function repace(ub, due) {
  if (!ub.blowPlan) return;
  const left = ub.actionState.stopTime - ub.actionState.time;
  ub.blowPlan.rate = blowRate(left, due - ub.blowPlan.clock);
}

/** Winding -> Striking: the release, from the point the strength skips to. */
function beginRelease(ub) {
  ub.attackStrength = windUpStrength(ub);
  ub.upper = UPPER_BODY.Striking;
  const keys = attackKeys(ub.attackType, ub.attackStrength, { reversed: ub.attackReversed });
  const skip = releaseSkip(ub.ctx.rig().keys, ub.weaponGroup, ub.attackType, ub.attackStrength);
  if (!playAction(ub, keys.release.start, keys.release.stop, skip, keys.reversed)) {
    beginFollow(ub);
    return;
  }
  // The release ends on "hit": it is fitted to the game's hit.
  if (ub.blowPlan) repace(ub, ub.blowPlan.hitAt);
}

/** Striking -> Recovering: the follow-through for the strength (a shot's keys name no strength). */
function beginFollow(ub) {
  ub.upper = UPPER_BODY.Recovering;
  const keys = attackKeys(ub.attackType, ub.attackStrength, { reversed: ub.attackReversed });
  if (!playAction(ub, keys.follow.start, keys.follow.stop, 0, keys.reversed)) {
    endAttack(ub);
    return;
  }
  // The follow-through ends where the game's blow does, so the next blow finds the arm ready.
  if (ub.blowPlan) repace(ub, ub.blowPlan.seconds);
}

/** Recovering -> Ready. */
function endAttack(ub) {
  dropAction(ub);
  reloadCrossbow(ub);
  ub.upper = UPPER_BODY.Ready;
  ub.attackType = null;
  ub.ctx.clearAttackHand();
  ub.blowPlan = null;
  idleAfterAction(ub);
}

/**
 * A blow of a creature that is not a biped: one of its "attackN" groups by the roll, played from "start" to "stop"
 * as one follow-through, so the next blow cuts it as it cuts a person's. With a schedule its "hit" key (or, without
 * one, its end) lands when the game's blow does. Answers the group, or null when none plays.
 * @param {number} roll
 * @param {BlowSchedule | null} blow
 */
function creatureAttack(ub, roll, blow) {
  if (ub.ctx.dead()) return null;
  if (ub.upper === UPPER_BODY.Recovering) endAttack(ub);
  if (ub.upper !== UPPER_BODY.Ready) return null;
  const group = ub.slots.chooseRandomGroup('attack', roll);
  const got = group
    ? pickAnimSource(ub.ctx.rig().sources, group, resetClip, { start: 'start', stop: 'stop', loopCount: 0 })
    : null;
  if (!got) return null;
  ub.actionState = got.state;
  ub.actionSource = got.source;
  ub.upper = UPPER_BODY.Recovering;
  ub.attackType = group;
  ub.holdWindUp = false;
  ub.attackStrength = 1;
  ub.resetIdleOnAttackEnd = true;
  ub.blowPlan = null;
  if (scheduleIsUsable(ub, blow)) {
    const clip = ub.actionState;
    const hit = getTextKeyTime(/** @type {any} */ (got.source).keys, `${group}: hit`);
    const rate =
      hit > clip.startTime
        ? blowRate(hit - clip.startTime, blow.hitAt)
        : blowRate(clip.stopTime - clip.startTime, blow.seconds);
    ub.blowPlan = { seconds: blow.seconds, hitAt: blow.hitAt, clock: 0, rate };
  }
  ub.slots.refreshIdle();
  return group;
}

/** @param {BlowSchedule | null | undefined} blow */
function scheduleIsUsable(ub, blow) {
  return !!blow && blow.hitAt > 0 && blow.seconds >= blow.hitAt && Number.isFinite(blow.seconds);
}

/**
 * The pace of a strike that just started its wind-up: the rate that brings the clip through the wind-up and the
 * release to "hit" at the schedule's `hitAt`. Null (the clip's own pace) for a shot (its hit waits for "shoot
 * release"), a held wind-up, or no usable schedule.
 */
function blowPace(ub, blow, keys) {
  if (!blow || ub.attackType === MW_SHOOT_ATTACK || ub.holdWindUp) return null;
  if (!scheduleIsUsable(ub, blow)) return null;
  const span = (from, to) => {
    const t0 = keyTime(ub, from);
    const t1 = keyTime(ub, to);
    return t0 >= 0 && t1 > t0 ? t1 - t0 : 0;
  };
  const windUp = ub.actionState ? ub.actionState.stopTime - ub.actionState.startTime : 0;
  const toHit = windUp + span(keys.release.start, keys.release.stop);
  if (!(toHit > 0)) return null;
  return { seconds: blow.seconds, hitAt: blow.hitAt, clock: 0, rate: blowRate(toHit, blow.hitAt) };
}

/** A weapon that loads itself comes back up loaded. Daggerfall has none (see reloadsItself). */
function reloadCrossbow(ub) {
  const built = ub.ctx.built();
  if (built && built.ok && built.arrow && reloadsItself(built.mwType)) ub.arrowShown = true;
}

/** Moves on when the section playing has ended. Runs once a tick. */
function stepUpper(ub) {
  if (ub.actionState && ub.actionState.playing) return;
  switch (ub.upper) {
    case UPPER_BODY.Drawing:
      dropAction(ub);
      reloadCrossbow(ub);
      ub.upper = UPPER_BODY.Ready;
      idleAfterAction(ub);
      return;
    case UPPER_BODY.Stowing:
      dropAction(ub);
      ub.upper = UPPER_BODY.Rest;
      ub.sheathed = true;
      refreshWeaponGroup(ub);
      ub.slots.refreshIdle(true);
      return;
    case UPPER_BODY.Winding:
      if (!ub.holdWindUp) beginRelease(ub);
      return;
    case UPPER_BODY.Striking:
      beginFollow(ub);
      return;
    case UPPER_BODY.Recovering:
      endAttack(ub);
      return;
    case UPPER_BODY.Casting:
      dropAction(ub);
      ub.upper = ub.sheathed ? UPPER_BODY.Rest : UPPER_BODY.Ready;
      ub.attackType = null;
      idleAfterAction(ub);
      if (ub.unreadyAfterCast) {
        ub.unreadyAfterCast = false;
        ub.spellReady = false;
        refreshWeaponGroup(ub);
        ub.slots.resetIdle();
        ub.slots.resetMovement();
      }
      return;
    default:
      if (ub.actionState) ub.actionState = null;
  }
}

/** Puts the weapon away: the unequip section, or at once when there is nothing to play. */
function stow(ub) {
  if (is(ub, UPPER_BODY.Stowing, UPPER_BODY.Striking, UPPER_BODY.Recovering)) return false;
  // Put away at once. When the unequip section was refused the arm also stands at Rest; with no weapon group at all
  // the upper state is left as it is.
  const atOnce = (toRest) => {
    if (toRest) ub.upper = UPPER_BODY.Rest;
    ub.sheathed = true;
    ub.weaponShown = false;
    ub.arrowShown = false;
    refreshWeaponGroup(ub);
    ub.slots.refreshIdle(true);
    return true;
  };
  if (ub.upper === UPPER_BODY.Rest || !ub.weaponGroup) return atOnce(false);
  ub.upper = UPPER_BODY.Stowing;
  const detach = keyTime(ub, UNEQUIP_KEYS.detach);
  if (!playAction(ub, UNEQUIP_KEYS.start, UNEQUIP_KEYS.stop, 0)) return atOnce(true);
  if (detach < 0) ub.weaponShown = false;
  ub.arrowShown = false;
  return true;
}

/** Draws the weapon: the equip section, with the stance changed at its start. */
function draw(ub, beforeCompose) {
  ub.sheathed = false;
  beforeCompose();
  refreshWeaponGroup(ub);
  ub.upper = UPPER_BODY.Drawing;
  ub.resetIdleOnAttackEnd = true;
  const attach = keyTime(ub, EQUIP_KEYS.attach);
  if (!playAction(ub, EQUIP_KEYS.start, EQUIP_KEYS.stop, 0)) {
    ub.upper = UPPER_BODY.Ready;
    ub.weaponShown = true;
  }
  if (attach < 0) ub.weaponShown = true;
  ub.slots.refreshIdle(true);
  return true;
}

/**
 * Sheathes (`want` true) or draws. `beforeCompose` runs as a draw starts, before the stance is composed (fpArm.js
 * lets a spell held in the free hand go there). Answers whether anything changed.
 * @param {boolean} want
 * @param {() => void} beforeCompose
 */
function sheathe(ub, want, beforeCompose = () => {}) {
  if (!ready(ub)) return false;
  if (want === ub.sheathed) return false;
  return want ? stow(ub) : draw(ub, beforeCompose);
}

/** The spell stance and the stance groups it changes; the idle and the movement start over in it. */
function setSpellStance(ub, on) {
  ub.spellReady = on;
  refreshWeaponGroup(ub);
  ub.slots.resetIdle();
  ub.slots.resetMovement();
}

/**
 * Readies (`want` true) or lets go of the spell stance. Refused while the weapon comes up or goes away. Un-readied
 * while casting, the stance drops when the cast ends. Answers whether the stance changed now.
 * @param {boolean} want
 */
function readySpell(ub, want) {
  if (is(ub, UPPER_BODY.Drawing, UPPER_BODY.Stowing)) return false;
  if (want) ub.unreadyAfterCast = false;
  if (ub.spellReady === want) return false;
  if (!want && ub.upper === UPPER_BODY.Casting) {
    ub.unreadyAfterCast = true;
    return false;
  }
  setSpellStance(ub, want);
  return true;
}

/**
 * Starts a cast: the spellcast group's section for the range (spellAttackType: self, touch or target), played at
 * `rate`. With `releaseIn` (seconds), the section is paced so that its "<range> release" key lands then, and
 * castPaced says so. A cast cuts a follow-through short and readies the spell stance itself, so a spell readied and
 * cast in one call still plays. Answers whether a section plays.
 */
function cast(ub, rangeType, rate, releaseIn) {
  if (ub.upper === UPPER_BODY.Recovering) endAttack(ub);
  const canStart = is(ub, UPPER_BODY.Ready, UPPER_BODY.Casting) || (ub.upper === UPPER_BODY.Rest && ub.sheathed);
  if (!canStart) return false;
  if (!ub.spellReady) setSpellStance(ub, true);
  const type = spellAttackType(rangeType);
  ub.attackType = type;
  ub.castReleased = false;
  ub.castRate = validCastRate(rate);
  ub.unreadyAfterCast = false;
  ub.attackReversed = false;
  ub.attackStrength = 1;
  ub.resetIdleOnAttackEnd = true;
  const before = ub.upper;
  ub.upper = UPPER_BODY.Casting;
  if (!playAction(ub, `${type} start`, `${type} stop`, 0)) {
    ub.upper = before;
    ub.attackType = null;
    return false;
  }
  const toRelease = releaseIn > 0 ? keyTime(ub, `${type} release`) - ub.actionState.startTime : 0;
  if (toRelease > 0) {
    ub.castRate = blowRate(toRelease, releaseIn);
    ub.castPaced = true;
  }
  return true;
}

/** Lets a held wind-up go: the release starts now, or when the wind-up section ends. */
function release(ub) {
  if (ub.upper !== UPPER_BODY.Winding) return false;
  ub.holdWindUp = false;
  if (ub.actionState && ub.actionState.playing) return true;
  beginRelease(ub);
  return true;
}

/** A death ends the action; the upper body stands at rest or ready under it. */
function stopForDeath(ub) {
  dropAction(ub);
  ub.holdWindUp = false;
  ub.attackType = null;
  ub.blowPlan = null;
  ub.upper = ub.sheathed ? UPPER_BODY.Rest : UPPER_BODY.Ready;
}

/** A view switch stops the action: its clip came from the other rig. Mid-section, the arm stands at Ready when the
 *  weapon shows and at Rest when it does not, and the stance is composed again on the new rig. */
function cutForView(ub) {
  dropAction(ub);
  ub.attackType = null;
  ub.holdWindUp = false;
  if (!is(ub, UPPER_BODY.Rest, UPPER_BODY.Ready)) ub.upper = ub.weaponShown ? UPPER_BODY.Ready : UPPER_BODY.Rest;
  refreshWeaponGroup(ub);
}

/**
 * A new weapon in the hand. Between two real weapons while drawn nothing is put away or drawn: the mesh changes in
 * the hand and the arm stands Ready in the new weapon's stance, the arrow off the string until its next draw.
 * Otherwise the arm is left sheathed at rest; fpArm.js draws the new weapon when the old one was drawn.
 * @param {boolean} stillWeapon
 */
function swapWeapon(ub, stillWeapon) {
  dropAction(ub);
  ub.attackType = null;
  ub.holdWindUp = false;
  ub.arrowShown = false;
  if (stillWeapon) {
    ub.weaponShown = true;
    ub.upper = UPPER_BODY.Ready;
    refreshWeaponGroup(ub);
    ub.slots.resetIdle();
    return;
  }
  ub.weaponShown = false;
  ub.sheathed = true;
  ub.upper = UPPER_BODY.Rest;
  refreshWeaponGroup(ub);
  ub.slots.refreshIdle(true);
}

/**
 * One tick of the action clip, then the move to the next state when its section ended. A strike plays at the
 * weapon's speed (`weaponSpeed`, asked only while striking) or its paced rate; a cast at its cast rate.
 * `afterAdvance` runs between the two, while the section's clip still holds its last time.
 * @param {number} dt
 * @param {() => number} weaponSpeed
 * @param {() => void} afterAdvance
 */
function step(ub, dt, weaponSpeed, afterAdvance) {
  if (!ub.actionState) return;
  const striking = is(ub, UPPER_BODY.Winding, UPPER_BODY.Striking, UPPER_BODY.Recovering);
  const paced = striking && ub.blowPlan;
  if (paced) ub.blowPlan.clock += dt;
  let rate = 1;
  if (paced) rate = ub.blowPlan.rate;
  else if (ub.upper === UPPER_BODY.Casting) rate = ub.castRate;
  else if (striking) rate = weaponSpeed();
  advanceClip(ub.actionState, (ub.actionSource || ub.ctx.rig()).keys, dt * rate, ub.onActionKey);
  afterAdvance();
  stepUpper(ub);
}

/**
 * @param {UpperContext} ctx
 * @param {any} slots the slots below the upper body (animSlots.js)
 */
export function createUpperBody(ctx, slots) {
  /** @type {any} */
  const ub = {
    upper: UPPER_BODY.Rest,
    actionState: null,
    actionSource: null,
    weaponGroup: null,
    attackType: null,
    attackStrength: 1,
    attackReversed: false,
    holdWindUp: false,
    blowPlan: null,
    resetIdleOnAttackEnd: false,
    weaponShown: false,
    arrowShown: false,
    shootReleased: false,
    castReleased: false,
    unreadyAfterCast: false,
    sheathed: true,
    spellReady: false,
    castRate: 1,
    castPaced: false,
    creatureCasts: 0,
    ctx,
    slots,
  };
  ub.keyTime = (action) => keyTime(ub, action);
  ub.playAction = (start, stop, startPoint = 0, reversed = false) => playAction(ub, start, stop, startPoint, reversed);
  ub.refreshWeaponGroup = () => refreshWeaponGroup(ub);
  ub.onActionKey = (text, time, mine) => onActionKey(ub, text, time, mine);
  ub.windUpStrength = () => windUpStrength(ub);
  ub.beginRelease = () => beginRelease(ub);
  ub.beginFollow = () => beginFollow(ub);
  ub.endAttack = () => endAttack(ub);
  ub.creatureAttack = (roll, blow) => creatureAttack(ub, roll, blow);
  ub.blowPace = (blow, keys) => blowPace(ub, blow, keys);
  ub.reloadCrossbow = () => reloadCrossbow(ub);
  ub.stepUpper = () => stepUpper(ub);
  ub.sheathe = (want, beforeCompose = () => {}) => sheathe(ub, want, beforeCompose);
  ub.readySpell = (want) => readySpell(ub, want);
  ub.cast = (rangeType, rate, releaseIn) => cast(ub, rangeType, rate, releaseIn);
  ub.release = () => release(ub);
  ub.stopForDeath = () => stopForDeath(ub);
  ub.cutForView = () => cutForView(ub);
  ub.swapWeapon = (stillWeapon) => swapWeapon(ub, stillWeapon);
  ub.step = (dt, weaponSpeed, afterAdvance) => step(ub, dt, weaponSpeed, afterAdvance);
  return ub;
}
