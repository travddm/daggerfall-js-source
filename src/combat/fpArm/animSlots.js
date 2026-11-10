// @ts-check
// The arm's animation slots below the upper body: idle, movement, jump, hit recoil and death. Each slot holds at most
// one clip state (from pickAnimSource), the source it came from and the group it plays. fpArm.js poses the highest
// slot that plays; the upper body (weapon and spell) sits above all of them, and death above everything.
//
// What each slot does, tick by tick:
//
//   Idle      Plays the stance's idle group: "idle" plus the weapon's short suffix ("idle1h"), or the sneak idle while
//             sneaking on the ground where the clips carry one. A stance with a short suffix repeats its idle a rolled
//             number of times (FP_IDLE_LOOPS) so that the idle variations come round; bare hands and the sneak idle
//             loop for good. An idle that still plays the right group is left alone. When the group comes round
//             again it resumes where the last one stopped instead of starting over. A body that is not a biped
//             (most creatures) drops its idle while its upper body is busy, while it moves or while it recoils, and
//             starts it again from the beginning afterwards.
//   Movement  Plays the walk, run, sneak, strafe or turn group the frame's movement input asks for, composed with the
//             stance. Nothing plays in the air. When the movement stops, or asks for a group no clip has, the slot
//             empties and the idle starts over. A same-group pick resumes where it was. The clip plays at the body's
//             real speed over the clip's own travel speed (capped); a turn plays at a rate set by how fast the view
//             turns. Turning holds for 0.05 s after the last change of yaw, so a still mouse between two frames does
//             not stop the turn.
//   Jump      In the air: the stance's jump group from its start to its stop, looping where it has loop keys and
//             otherwise holding its last pose. On landing: the group's landing tail ("loop stop" to "stop") once.
//             Drawing a weapon in the air changes the group at once and continues from "loop start", without the
//             take-off. When the jump ends, or no clip serves it, the slot empties and the idle starts over. The
//             movement slot waits while the body is in the air.
//   Hit       One recoil, "hit" plus a number the caller's roll picks among the hitN groups the clips carry, played
//             once. A recoil in progress refuses another, and the dead do not recoil.
//   Death     One death, "death" plus a number picked the same way, played once and held at its end. A body loaded
//             already dead starts at the end (`startPoint` 1). Dying empties the other slots, and a dead body
//             refreshes none of them until it is revived.
//
// The slots' state is the fields of the object createAnimSlots answers; fpArm.js reads and writes them by name. What
// the slots read of the arm comes through `ctx`, as live getters.
import { wrapAngle } from '../../world/mat4.js';
import { resetClip } from '../../formats/morrowind/mwAnim.js';
import {
  pickAnimSource,
  composeStanceGroup,
  weaponShortGroup,
  jumpAnimState,
  movementAnimState,
  composeMovementGroup,
  MOVEMENT_FALLBACK_SPEED,
  MOVEMENT_SPEED_CAP,
  turnAnimSpeed,
  sourceVelocityOf,
  MW_UNITS_PER_METER,
  anySourceHasGroup,
} from '../../formats/morrowind/mwFirstPerson.js';
import { FP_IDLE_SNEAK, idleBaseFor, FP_IDLE_LOOPS, clipCompletion, UPPER_BODY } from './fpAnimState.js';

/** How long a turn keeps playing after the view stops turning, in seconds. */
const TURN_HOLD = 0.05;

/**
 * @typedef {{ built: () => any, dead: () => boolean, upper: () => number, sneaking: () => boolean,
 *   viewMode: () => string, notes: () => string[], rig: () => any, stanceOf: () => number, nonBiped: () => boolean,
 *   hasGroup: (name: string) => boolean }} SlotContext
 * @typedef {{ forward?: number, strafe?: number, running?: boolean, speed?: number, grounded?: boolean,
 *   swimming?: boolean, levitating?: boolean, jumping?: boolean }} MoveInput
 */

/** @param {SlotContext} ctx */
export function createAnimSlots(ctx) {
  /** @type {any} */
  const slots = {
    idleState: null,
    idleGroup: null,
    idleSource: null,
    movementState: null,
    movementGroup: null,
    movementSource: null,
    movementBase: null,
    movementStance: null,
    movementRate: 1,
    movementAnimSpeed: MOVEMENT_FALLBACK_SPEED.walk,
    jumpState: null,
    jumpGroup: null,
    jumpSource: null,
    jumpStance: null,
    jumpKind: null,
    lastYaw: null,
    turnHold: 0,
    turnDir: 0,
    hitState: null,
    hitSource: null,
    deathState: null,
    deathSource: null,
    chooseRandomGroup,
    refreshIdle,
    resetIdle,
    resetMovement,
    resetJump,
    refreshJump,
    refreshMovement,
    hurt,
    die,
    revive,
  };

  /** Whether the slots may change this tick: a built arm on a living body. */
  const live = () => {
    const built = ctx.built();
    return !!(built && built.ok) && !ctx.dead();
  };
  const playing = (state) => !!(state && state.playing);
  /** One pick from the rig's sources; null when no source gives the group the keys asked for. */
  const pick = (group, opts) => pickAnimSource(ctx.rig().sources, group, resetClip, opts);

  /**
   * One of the numbered groups `<prefix>1`, `<prefix>2`, ... that the rig's clips carry, counted from 1 until one is
   * missing. The caller's roll picks it (its integer part, wrapped into the count), so a given blow plays the same
   * recoil on every machine. Null when the clips carry none.
   * @param {string} prefix
   * @param {number} roll
   * @returns {string | null}
   */
  function chooseRandomGroup(prefix, roll) {
    const rig = ctx.rig();
    if (!rig || !rig.sources) return null;
    let count = 0;
    while (anySourceHasGroup(rig.sources, `${prefix}${count + 1}`)) count++;
    if (count === 0) return null;
    const index = (((roll | 0) % count) + count) % count;
    return `${prefix}${index + 1}`;
  }

  /** The idle group the stance asks for now, and whether it repeats a rolled number of times. */
  function wantedIdle() {
    const base = idleBaseFor({ sneaking: ctx.sneaking(), inJump: !!slots.jumpState, hasGroup: ctx.hasGroup });
    if (base === FP_IDLE_SNEAK) return { group: base, dice: false };
    const stance = ctx.stanceOf();
    return { group: composeStanceGroup(base, stance, ctx.hasGroup).group, dice: !!weaponShortGroup(stance) };
  }

  /** A body that is not a biped drops its idle while anything else moves it. */
  function creatureBusy() {
    if (!ctx.nonBiped()) return false;
    const upper = ctx.upper();
    const upperBusy = upper !== UPPER_BODY.Rest && upper !== UPPER_BODY.Ready;
    return upperBusy || !!slots.movementState || !!slots.hitState;
  }

  /** Keeps the idle slot on the group the stance asks for. `force` picks again even when the idle still plays it. */
  function refreshIdle(force = false) {
    if (!live()) return;
    if (creatureBusy()) {
      slots.idleState = null;
      slots.idleGroup = null;
      slots.idleSource = null;
      return;
    }
    if (!force && playing(slots.idleState) && wantedIdle().group === slots.idleGroup) return;
    const want = wantedIdle();
    if (!want.group) {
      slots.idleState = null;
      slots.idleGroup = null;
      return;
    }
    const loopCount = want.dice ? FP_IDLE_LOOPS() : Infinity;
    const startPoint = want.group === slots.idleGroup ? clipCompletion(slots.idleState) : 0;
    const got = pick(want.group, { loopFallback: true, loopCount, startPoint });
    if (!got) {
      slots.idleState = null;
      slots.idleGroup = null;
      ctx.notes().push(`idle: no source gives "${want.group}" a start and a stop key`);
      return;
    }
    slots.idleGroup = want.group;
    slots.idleState = got.state;
    slots.idleSource = got.source;
  }

  /** Starts the idle over: from its beginning, with a fresh repeat count. */
  function resetIdle() {
    slots.idleState = null;
    slots.idleGroup = null;
    refreshIdle(true);
  }

  function resetMovement() {
    slots.movementState = null;
    slots.movementGroup = null;
    slots.movementSource = null;
    slots.movementBase = null;
    slots.movementStance = null;
  }

  function resetJump() {
    slots.jumpState = null;
    slots.jumpGroup = null;
    slots.jumpSource = null;
    slots.jumpStance = null;
    slots.jumpKind = null;
  }

  /** Ends a jump: the slot empties, and an idle that played under a real jump starts over. */
  function endJump() {
    const hadClip = !!slots.jumpState;
    resetJump();
    if (hadClip) resetIdle();
  }

  /**
   * Keeps the jump slot on what the body is doing in the air, and answers whether it is in a jump (the movement slot
   * waits while it is).
   * @param {MoveInput | null} mv
   * @returns {boolean}
   */
  function refreshJump(mv) {
    if (!live()) return false;
    const now = jumpAnimState({
      grounded: mv ? mv.grounded !== false : true,
      swimming: !!(mv && mv.swimming),
      levitating: !!(mv && mv.levitating),
      jumpQueued: !!(mv && mv.jumping),
      priorInAir: slots.jumpKind === 'inair',
      jumpPlaying: playing(slots.jumpState),
    });
    const stance = ctx.stanceOf();
    const stanceChanged = !!slots.jumpState && slots.jumpStance !== stance;
    if (!stanceChanged && now.jump === slots.jumpKind) return now.inJump;
    if (!now.jump) {
      endJump();
      return now.inJump;
    }
    const group = composeStanceGroup('jump', stance, ctx.hasGroup).group;
    if (!group) {
      endJump();
      return now.inJump;
    }
    // Only a stance change reaches here with the same kind: the new group goes on from its loop, not its take-off.
    const sameKind = now.jump === slots.jumpKind;
    const window =
      now.jump === 'inair'
        ? { start: sameKind ? 'loop start' : 'start', stop: 'stop', loopCount: Infinity }
        : { start: 'loop stop', stop: 'stop', loopCount: 0 };
    const got = pick(group, window);
    if (!got) {
      endJump();
      return now.inJump;
    }
    slots.jumpState = got.state;
    slots.jumpSource = got.source;
    slots.jumpGroup = group;
    slots.jumpStance = stance;
    slots.jumpKind = now.jump;
    return now.inJump;
  }

  /** Follows the view's yaw and answers its turn rate this tick, in radians a second. */
  function trackTurn(yaw, dt) {
    let rate = 0;
    if (slots.lastYaw !== null && slots.lastYaw !== undefined && dt > 0) {
      const delta = wrapAngle(yaw - slots.lastYaw);
      rate = delta / dt;
      if (delta !== 0) {
        slots.turnDir = Math.sign(delta);
        slots.turnHold = TURN_HOLD;
      } else {
        slots.turnHold -= dt;
        if (slots.turnHold <= 0) slots.turnDir = 0;
      }
    }
    slots.lastYaw = yaw;
    return rate;
  }

  /** The speed the playing movement clip travels at, in Morrowind units a second; a clip that does not travel takes
   *  the fallback for its gait. The playing clip's own source answers, not a search over every source: in third
   *  person another source can travel at another speed than the clip on screen, and the run's rate then changes
   *  under a run that did not. */
  function clipSpeed(mv) {
    const travel = slots.movementSource ? sourceVelocityOf(slots.movementSource, slots.movementGroup) : 0;
    if (travel > 1) return travel;
    if (ctx.sneaking()) return MOVEMENT_FALLBACK_SPEED.sneak;
    return mv && mv.running ? MOVEMENT_FALLBACK_SPEED.run : MOVEMENT_FALLBACK_SPEED.walk;
  }

  /**
   * Puts the movement slot on the group for (base, stance), keeping a clip that already plays it. Answers false when
   * the slot was emptied instead (and the tick stops there).
   */
  function settleMovement(base, stance) {
    const group = composeMovementGroup(base, stance, ctx.hasGroup).group;
    if (!group) {
      if (slots.movementState) {
        resetMovement();
        resetIdle();
      }
      slots.movementBase = base;
      slots.movementStance = stance;
      return false;
    }
    if (!(playing(slots.movementState) && slots.movementGroup === group)) {
      const startPoint = slots.movementGroup === group ? clipCompletion(slots.movementState) : 0;
      const got = pick(group, { loopFallback: true, loopCount: Infinity, startPoint });
      if (!got) {
        resetMovement();
        ctx.notes().push(`movement: no source gives "${group}" a start and a stop key`);
        // Kept, so the note is not pushed again every tick.
        slots.movementBase = base;
        slots.movementStance = stance;
        return false;
      }
      slots.movementGroup = group;
      slots.movementState = got.state;
      slots.movementSource = got.source;
    }
    slots.movementBase = base;
    slots.movementStance = stance;
    return true;
  }

  /**
   * Keeps the movement slot on what the frame's movement input asks for, and sets its play rate.
   * @param {{ yaw?: number, move?: MoveInput } | null} cam
   * @param {number} dt
   * @param {boolean} inJump
   */
  function refreshMovement(cam, dt, inJump = false) {
    if (!live()) return;
    const yawRate = trackTurn(cam ? cam.yaw || 0 : 0, dt);
    const mv = (cam && cam.move) || null;
    const base = inJump
      ? null
      : movementAnimState({
          forward: mv ? mv.forward : 0,
          strafe: mv ? mv.strafe : 0,
          running: !!(mv && mv.running),
          sneaking: ctx.sneaking(),
          turning: slots.turnDir,
          thirdPerson: ctx.viewMode() === 'third' && !ctx.nonBiped(),
        });
    if (!base) {
      if (slots.movementState) {
        resetMovement();
        resetIdle();
      }
      return;
    }
    const stance = ctx.stanceOf();
    const unchanged = playing(slots.movementState) && slots.movementBase === base && slots.movementStance === stance;
    if (!unchanged) {
      if (!settleMovement(base, stance)) return;
      slots.movementAnimSpeed = clipSpeed(mv);
    }
    if (base.startsWith('turn')) {
      slots.movementRate = turnAnimSpeed(yawRate);
    } else {
      const speed = mv && mv.speed ? mv.speed : 0;
      slots.movementRate = Math.min(MOVEMENT_SPEED_CAP, (speed * MW_UNITS_PER_METER) / slots.movementAnimSpeed);
    }
  }

  /** Starts a recoil picked by `roll`. Answers whether one started. */
  function hurt(roll = 0) {
    if (!live() || slots.hitState) return false;
    const group = chooseRandomGroup('hit', roll);
    const got = group ? pick(group, {}) : null;
    if (!got) return false;
    slots.hitState = got.state;
    slots.hitSource = got.source;
    return true;
  }

  /**
   * Starts the death picked by `roll`, from `startPoint` (0 the start, 1 the end), and empties the slots under it.
   * The movement keeps its last gait and stance, and the jump its last group and stance, as the card shows them.
   * Answers whether a death clip plays.
   */
  function die(roll = 0, startPoint = 0) {
    const group = chooseRandomGroup('death', roll);
    const got = group ? pick(group, { startPoint, loopCount: 0 }) : null;
    slots.movementState = null;
    slots.movementSource = null;
    slots.movementGroup = null;
    slots.jumpState = null;
    slots.jumpSource = null;
    slots.jumpKind = null;
    slots.hitState = null;
    slots.hitSource = null;
    slots.idleState = null;
    slots.idleSource = null;
    slots.idleGroup = null;
    slots.deathState = got ? got.state : null;
    slots.deathSource = got ? got.source : null;
    return !!got;
  }

  /** Clears the death and any recoil, and starts the idle again. fpArm.js clears its dead flag first. */
  function revive() {
    slots.deathState = null;
    slots.deathSource = null;
    slots.hitState = null;
    slots.hitSource = null;
    refreshIdle(true);
  }

  return slots;
}
