// The first-person arm's animation slots below the upper body: idle, movement, jump, hit recoil and death. Moved
// out of createFpArm unchanged; their state is the fields of the object createAnimSlots answers, and what they read
// of the arm comes through `ctx` (live getters).
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

/**
 * @param {{ built: () => any, dead: () => boolean, upper: () => number, sneaking: () => boolean,
 *   viewMode: () => string, notes: () => string[], rig: () => any, stanceOf: () => number, nonBiped: () => boolean,
 *   hasGroup: (name: string) => boolean }} ctx
 */
export function createAnimSlots(ctx) {
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

  /** MWNPC4: chooseRandomGroup (character.cpp): the groups `<prefix>1`, `<prefix>2`, ... counted while the body's
   *  sources carry each, one of them picked - by `roll`, where the reference rolls its world PRNG (a roll the caller
   *  keeps, so the same blow plays the same recoil on every machine, and no random stream of the port's is drawn).
   *  Null when the body carries none - the reference's roll then names a group that is not there,
   *  and plays nothing. */
  function chooseRandomGroup(prefix, roll) {
    const r = ctx.rig();
    if (!r || !r.sources) return null;
    let n = 0;
    while (anySourceHasGroup(r.sources, `${prefix}${n + 1}`)) n++;
    if (!n) return null;
    return `${prefix}${1 + ((((roll | 0) % n) + n) % n)}`;
  }

  /**
   * REFRESHIDLEANIMS, the first-person half (character.cpp:773-830).
   *
   * Called EVERY FRAME, exactly as the reference calls it, and its early
   * return is what keeps that cheap: the same group still playing is left
   * alone. What it is NOT is a one-shot at build time - the group depends
   * on the drawn weapon, so sheathing has to be able to change it without
   * anything else being torn down.
   */
  function refreshIdle(force = false) {
    if (!ctx.built() || !ctx.built().ok || ctx.dead()) return; // MWNPC4: a dead actor's states are no longer refreshed
    // MWNPC9: refreshIdleAnims' non-biped arm (character.cpp:680-685) - a creature lets its idle go while an upper-body
    // action, a movement or a recoil plays, and takes it up again from its start once none does
    if (
      ctx.nonBiped() &&
      ((ctx.upper() !== UPPER_BODY.Rest && ctx.upper() !== UPPER_BODY.Ready) || slots.movementState || slots.hitState)
    ) {
      slots.idleState = null;
      slots.idleGroup = null;
      slots.idleSource = null;
      return;
    }
    const type = ctx.stanceOf(); // MWNPC9: a non-biped's bare stance
    // MW-D52: the idle STATE picks the base - "idlesneak" while sneaking
    // on the ground where a source carries it, else the plain idle with
    // its weapon suffix. The sneak idle takes no suffix and no loop dice.
    const base = idleBaseFor({ sneaking: ctx.sneaking(), inJump: !!slots.jumpState, hasGroup: ctx.hasGroup });
    const compose = () => (base === FP_IDLE_SNEAK ? { group: base } : composeStanceGroup(base, type, ctx.hasGroup));
    if (!force && slots.idleState && slots.idleState.playing) {
      // Only the GROUP can have gone stale; a playing idle of the right
      // group is left exactly where it is.
      const composed = compose();
      if (composed.group === slots.idleGroup) return;
    }
    const composed = compose();
    if (!composed.group) {
      slots.idleState = null;
      slots.idleGroup = null;
      return;
    }
    // Rule 10's condition: the dice roll happens only when the stance HAS
    // a short group. Bare hands away idle forever.
    const short = base === FP_IDLE_SNEAK ? null : weaponShortGroup(type);
    const loopCount = short ? FP_IDLE_LOOPS() : Infinity;
    // :822-825 - a restart of the SAME group resumes from where it was.
    const startPoint = slots.idleGroup === composed.group ? clipCompletion(slots.idleState) : 0;
    const pick = pickAnimSource(ctx.rig().sources, composed.group, resetClip, {
      loopFallback: true,
      loopCount,
      startPoint,
    });
    if (!pick) {
      slots.idleState = null;
      slots.idleGroup = null;
      ctx.notes().push(`idle: no source gives "${composed.group}" a start and a stop key`);
      return;
    }
    slots.idleGroup = composed.group;
    slots.idleState = pick.state;
    slots.idleSource = pick.source;
  }

  /** resetCurrentIdleState (:1850-1853 via mResetIdleOnAttackEnd): drop
   *  the idle so the next refresh replays it from its start with a fresh
   *  loop count, rather than resuming mid-swing-shaped. */
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

  /** resetCurrentJumpState (character.cpp:350-354). */
  function resetJump() {
    slots.jumpState = null;
    slots.jumpGroup = null;
    slots.jumpSource = null;
    slots.jumpStance = null;
    slots.jumpKind = null;
  }

  /** The velocity the clip itself travels at, so the played speed can
   *  scale to the actor's real speed (character.cpp:743-752): the
   *  accum root's horizontal displacement over the clip, falling back
   *  to the reference's own constants when a clip carries none. */

  /**
   * MW-D26: REFRESHMOVEMENTANIMS + the movestate selection, per frame
   * (character.cpp:639-759, :2297-2330). The state derives from the
   * frame's movement INPUT (the reference's movement-settings vector)
   * carried on the camera dep; the group composes the weapon's short
   * suffix through the same one ladder the idle rides, plus movement's
   * own run->walk swap; a same-group refresh resumes from where it was
   * (:711-713); and a group nothing serves RESETS the slot rather than
   * substituting a wrong clip (:701-707).
   *
   * TURNING (character.cpp:2321-2329, 2355-2366): third person only,
   * never sneaking; the state holds 0.05s past the last rotation so
   * per-frame mouse deltas do not flicker it. The reference's
   * isTurning() reads the movement-settings rotation channel; this
   * port's yaw is mouse-driven per frame, so the hold IS the port of
   * the threshold, stated rather than smuggled.
   */
  /**
   * MW-D39: REFRESHJUMPANIMS (character.cpp:494-532), fed by the
   * frame's derived JumpState (jumpAnimState above the fold in
   * mwFirstPerson.js - update()'s :2195-2296, animation half).
   *
   * The reference's laws, kept in its own order:
   *   - the early-out is `jump == mJumpState` unless forced (:496);
   *     the force here is the weapon-stance transition, MW-D29's law
   *     carried over from movement - a sword drawn mid-air recomposes
   *     jump -> jump1h THAT frame;
   *   - None resets the jump slot AND the idle (:499-505 - the idle
   *     replays from its start when a jump ends over it);
   *   - the group is "jump" + the weapon short suffix through
   *     fallbackShortWeaponGroup's ladder (:508-513), which
   *     composeStanceGroup already IS (MW-D26's one-home law); a name
   *     nothing serves resets both, exactly as None does (:515-520);
   *   - startAtLoop (:522): a forced re-pick in the SAME state starts
   *     at "loop start" (resetClip carries Animation::reset's own
   *     ": start" fallback for it, :986-991), so a mid-air stance
   *     change does not replay the takeoff;
   *   - InAir plays start -> stop with unbounded loops and NO
   *     loopfallback (:528-529 - a group with real loop keys loops
   *     forever, one without plays once and HOLDS its last pose, which
   *     is the reference's autodisable=false falling pose);
   *   - Landing plays ONCE from "loop stop" to "stop" (:531). A group
   *     with no "jump: loop stop" key fails the pick - which is
   *     Animation::reset:992 returning false and the reference's play
   *     silently doing nothing: no landing animation is the correct
   *     outcome for data that carries none.
   *
   * Returns the frame's inJump, which gates the movestate ladder
   * (character.cpp:2296 - it runs only inside `if (!mInJump)`).
   */
  function refreshJump(mv) {
    if (!ctx.built() || !ctx.built().ok || ctx.dead()) return false; // MWNPC4: nor its jump
    const derived = jumpAnimState({
      grounded: mv ? mv.grounded !== false : true,
      swimming: !!(mv && mv.swimming),
      levitating: !!(mv && mv.levitating),
      jumpQueued: !!(mv && mv.jumping),
      priorInAir: slots.jumpKind === 'inair',
      jumpPlaying: !!(slots.jumpState && slots.jumpState.playing),
    });
    const stance = ctx.stanceOf(); // MWNPC9
    const force = !!slots.jumpState && slots.jumpStance !== stance;
    if (!force && derived.jump === slots.jumpKind) return derived.inJump; // :496
    if (!derived.jump) {
      if (slots.jumpState) {
        resetJump();
        resetIdle();
      } // :499-505
      else resetJump();
      return derived.inJump;
    }
    const composed = composeStanceGroup('jump', stance, ctx.hasGroup); // :508-513
    if (!composed.group) {
      if (slots.jumpState) {
        resetJump();
        resetIdle();
      } // :515-520
      else resetJump();
      return derived.inJump;
    }
    const startAtLoop = derived.jump === slots.jumpKind; // :522
    const pick =
      derived.jump === 'inair'
        ? pickAnimSource(ctx.rig().sources, composed.group, resetClip, {
            start: startAtLoop ? 'loop start' : 'start',
            stop: 'stop',
            loopCount: Infinity,
          })
        : pickAnimSource(ctx.rig().sources, composed.group, resetClip, {
            start: 'loop stop',
            stop: 'stop',
            loopCount: 0,
          });
    if (!pick) {
      // The Landing arm lands here on loop-key-less data; the InAir arm
      // on a group hasGroup approved whose keys resetClip refuses.
      // Either way the reference's outcome is a jump slot with nothing
      // playing (:515-520 / Animation::reset:992).
      if (slots.jumpState) {
        resetJump();
        resetIdle();
      } else resetJump();
      return derived.inJump;
    }
    slots.jumpState = pick.state;
    slots.jumpSource = pick.source;
    slots.jumpGroup = composed.group;
    slots.jumpStance = stance;
    slots.jumpKind = derived.jump;
    return derived.inJump;
  }

  function refreshMovement(cam, dt, inJump = false) {
    if (!ctx.built() || !ctx.built().ok || ctx.dead()) return; // MWNPC4: nor its movement
    const yaw = cam ? cam.yaw || 0 : 0;
    let yawRate = 0;
    if (slots.lastYaw != null && dt > 0) {
      // ONCRASH1: one step, not a loop. A PEER's rig reads this camera
      // (net/peer/peerBodies.js peerCamera), so `yaw` is the wire's there.
      const d = wrapAngle(yaw - slots.lastYaw);
      yawRate = d / dt;
      if (d !== 0) {
        slots.turnDir = Math.sign(d);
        slots.turnHold = 0.05;
      } else {
        slots.turnHold -= dt;
        if (slots.turnHold <= 0) slots.turnDir = 0;
      }
    }
    slots.lastYaw = yaw;
    const mv = (cam && cam.move) || null;
    // MW-D39: the movestate ladder runs only inside `if (!mInJump)`
    // (character.cpp:2296) - airborne, the movement slot EMPTIES and
    // the jump slot beneath it is what shows. The null flows into the
    // existing empty-movement branch, which already carries the
    // reset-both law (:646-651).
    const base = inJump
      ? null
      : movementAnimState({
          forward: mv ? mv.forward : 0,
          strafe: mv ? mv.strafe : 0,
          running: !!(mv && mv.running),
          sneaking: ctx.sneaking(),
          turning: slots.turnDir,
          thirdPerson: ctx.viewMode() === 'third' && !ctx.nonBiped(), // MWNPC9: turning animations are a biped's (character.cpp:2178)
        });
    if (!base) {
      // MW-D29: the frame the movement EMPTIES while one was playing,
      // the idle resets with it (character.cpp:646-651) - so it replays
      // from its start with freshly rolled loop dice (:824, :811)
      // instead of resuming mid-clip on a stale counter.
      if (slots.movementState) {
        resetMovement();
        resetIdle();
      }
      return;
    }
    const isTurn = base.startsWith('turn');
    // MW-D29: the STANCE is part of the early-out key. The reference
    // forces refreshMovementAnims on every weapon-type transition
    // (forcestateupdate at character.cpp:1361/:1372/:1431 flows into
    // refreshCurrentAnims -> refreshMovementAnims(force)), so drawing a
    // sword mid-walk re-composes walkforward -> walkforward1h THAT
    // frame - the port's old gate keyed on the movestate name alone and
    // kept the bare-handed walk playing with the sword out.
    const stance = ctx.stanceOf(); // MWNPC9: a non-biped's bare walk
    const fresh = !(
      slots.movementState &&
      slots.movementState.playing &&
      slots.movementBase === base &&
      slots.movementStance === stance
    );
    if (fresh) {
      const composed = composeMovementGroup(base, stance, ctx.hasGroup);
      if (!composed.group) {
        if (slots.movementState) {
          resetMovement();
          resetIdle();
        } // :701-707 resets BOTH
        slots.movementBase = base;
        slots.movementStance = stance;
        return;
      }
      if (!(slots.movementState && slots.movementState.playing && slots.movementGroup === composed.group)) {
        const startPoint = slots.movementGroup === composed.group ? clipCompletion(slots.movementState) : 0;
        const pick = pickAnimSource(ctx.rig().sources, composed.group, resetClip, {
          loopFallback: true,
          loopCount: Infinity,
          startPoint,
        });
        if (!pick) {
          resetMovement();
          ctx.notes().push(`movement: no source gives "${composed.group}" a start and a stop key`);
          slots.movementBase = base;
          slots.movementStance = stance; // AUDIT MWBODY A14: remembered, or the note is pushed again every frame
          return;
        }
        slots.movementGroup = composed.group;
        slots.movementState = pick.state;
        slots.movementSource = pick.source;
      }
      slots.movementBase = base;
      slots.movementStance = stance;
      // MW-D29: the clip speed refreshes on EVERY state change, not only
      // a re-pick - the reference assigns mMovementAnimSpeed whenever
      // refreshMovementAnims runs (character.cpp:743-752), and the
      // fallback constant reads the FRESH state's run/sneak, which is
      // exactly the run->walk-swap case where the clip stays put and
      // the state does not. That half stands.
      //
      // PX29 - REVERTED AT MAC'S DIRECTION, and recorded as the
      // DECLARED DIVERGENCE it is. MW-D29 also changed WHICH source
      // answers for the velocity: from the one source that won the
      // group pick to getVelocity's multi-source walk
      // (animation.cpp:1267-1338). In first person that is invisible -
      // the .1st clips carry no accumulation-root movement, every
      // source answers 0, and the fallback constants decide. In THIRD
      // person the body's clips carry real movement, so the walk can
      // answer with a DIFFERENT source's velocity than the clip
      // actually playing, and the divisor changes under a sprint that
      // did not change: Mac watched the third-person sprint alter and
      // asked for it back. The picked source's own velocity is the
      // number that matches the clip on screen, which is the property
      // that matters more here than the citation. If a future 1:1
      // sweep wants the multi-source walk again it must come with
      // Mac's eye on the sprint, not a line number.
      const vel = slots.movementSource ? sourceVelocityOf(slots.movementSource, slots.movementGroup) : 0;
      slots.movementAnimSpeed =
        vel > 1
          ? vel
          : ctx.sneaking()
            ? MOVEMENT_FALLBACK_SPEED.sneak
            : mv && mv.running
              ? MOVEMENT_FALLBACK_SPEED.run
              : MOVEMENT_FALLBACK_SPEED.walk;
    }
    // The rate follows the LIVE speed every frame (character.cpp:2392-2408),
    // AFTER the pick so a fresh clip's own velocity is what divides: a
    // turn plays at min(1.5, |rot|/dt/pi); everything else at actual
    // speed / clip speed, capped at 10 - the port's meters crossing to
    // MW units through the one bridge, because the clip's velocity is
    // in MW units.
    slots.movementRate = isTurn
      ? turnAnimSpeed(yawRate)
      : Math.min(MOVEMENT_SPEED_CAP, ((mv && mv.speed ? mv.speed : 0) * MW_UNITS_PER_METER) / slots.movementAnimSpeed);
  }

  function hurt(roll = 0) {
    if (!ctx.built() || !ctx.built().ok || ctx.dead() || slots.hitState) return false;
    const g = chooseRandomGroup('hit', roll);
    const pick = g ? pickAnimSource(ctx.rig().sources, g, resetClip, {}) : null;
    if (!pick) return false;
    slots.hitState = pick.state;
    slots.hitSource = pick.source;
    return true;
  }

  function die(roll = 0, startPoint = 0) {
    const g = chooseRandomGroup('death', roll);
    const pick = g ? pickAnimSource(ctx.rig().sources, g, resetClip, { startPoint, loopCount: 0 }) : null; // playDeath's loops: 0
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
    slots.deathState = pick ? pick.state : null;
    slots.deathSource = pick ? pick.source : null;
    return !!pick;
  }

  function revive() {
    slots.deathState = null;
    slots.deathSource = null;
    slots.hitState = null;
    slots.hitSource = null;
    refreshIdle(true);
  }

  return slots;
}
