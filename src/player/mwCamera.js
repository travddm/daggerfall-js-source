// The Morrowind-style player camera: a view that is either the player's own head (first person) or a point behind and
// above the player that the mouse wheel moves in and out (third person).
//
// This is a design of our own, described in the port's units. Distances here are in Morrowind units (the game's
// native length), which is how the tuning below is written; positions in and out of the camera are in metres, and
// MW_UNITS_PER_METER is the bridge. Morrowind itself has no data for this camera (the game's third person is a
// fixed chase view), so every number here is a tuning choice of this project.
//
// The pieces:
//   - a focal point: where the camera looks, a fixed height above the player's feet, optionally shifted to one side
//     ("over the shoulder") by an offset that eases between targets;
//   - a boom: the eye hangs on a line behind the focal point, along the look direction, as far as the player has
//     zoomed out, and is pulled in when a wall is in the way;
//   - the wheel: it changes the zoom distance and, at the near end, crosses between first and third person.

import { MW_UNITS_PER_METER } from '../formats/morrowind/mwFirstPerson.js';
import { SEA_ZOOM_RATIO } from './seaZoom.js';

export { MW_UNITS_PER_METER };

/** Height of the focal point above the feet, for an actor of height scale 1. */
export const FOCAL_HEIGHT = 124;
/** Boom length a fresh camera starts with. */
export const BASE_DISTANCE = 192;
/** Closest boom length. Zooming in from here enters first person. */
export const MIN_DISTANCE = 30;
/** Farthest boom length on foot. */
export const MAX_DISTANCE = 800;
/** Boom length change for one wheel click. */
export const WHEEL_STEP = 10;
/** Clearance kept between the eye and a wall behind it (radius of the sphere swept along the boom). */
export const CAMERA_OBSTACLE_LIMIT = 5;
/** Clearance kept between the focal point and a ceiling or wall beside it. */
export const FOCAL_OBSTACLE_LIMIT = 10;

/** Over-the-shoulder shift of the focal point: [right, up]. The left shoulder mirrors the first term. */
export const SHOULDER_OFFSET = Object.freeze([30, -10]);
/** Shift while a weapon or spell is out, or in water: centred and raised so the crosshair clears the head. */
export const COMBAT_OFFSET = Object.freeze([0, 15]);
/** How quickly the shift eases to a new target, in 1/second. The faster rate applies on any change that involves combat. */
export const FOCAL_TRANSITION_SPEED = Object.freeze({ combat: 5.0, normal: 1.0 });
/** The shoulder choices; anything else is read as 'off'. */
export const SHOULDER_SIDES = Object.freeze(['off', 'right', 'left']);

/** The camera never looks exactly straight up or down: the look direction would lose its yaw. */
export const PITCH_LIMIT = Math.PI / 2 - 0.000001;

const METRES_PER_UNIT = 1 / MW_UNITS_PER_METER;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The eased shift of the focal point, as [right, up] in Morrowind units.
 *
 * Each step closes a fraction of the remaining gap; the fraction grows as the gap shrinks, so the tail does not
 * crawl. When the target changes mid-motion, the movement of the last step is kept as a carry: it keeps pushing the
 * shift the same way at first and is then reversed, so that a retarget never stops the shift dead. The carry weight
 * is +1 when the new transition starts, 0 half way and -1 at its end. A carry only bends the path: whatever it
 * moved the shift by (the owed displacement) is paid back evenly over the next transition, so that the shift still
 * ends on its target.
 */
export function createFocalOffset() {
  let position = [0, 0];
  let target = [0, 0];
  let rate = FOCAL_TRANSITION_SPEED.normal;
  // Share of the new approach that is still held back: 1 right after a retarget, 0 once it is in full force.
  let holdBack = 0;
  // Units per second.
  let carry = [0, 0];
  // What the carry has moved the shift by and not given back yet.
  let owed = [0, 0];
  // The part of that, as of the last retarget, which the current transition is paying back.
  let payback = [0, 0];
  let lastMove = [0, 0];
  let lastStepSeconds = 1;
  let steppedSinceRetarget = false;
  // The first step has nothing to ease from.
  let jumpNext = true;

  return {
    current: () => position,
    target: () => target,
    setSpeed(value) {
      rate = value;
    },
    setTarget(next) {
      target = [next[0], next[1]];
      if (steppedSinceRetarget) carry = [lastMove[0] / lastStepSeconds, lastMove[1] / lastStepSeconds];
      steppedSinceRetarget = false;
      payback = [owed[0], owed[1]];
      holdBack = 1;
    },
    /** The next step lands on the target. */
    instant() {
      jumpNext = true;
    },
    step(dt) {
      if (!(dt > 0)) return position;
      if (jumpNext) {
        position = [target[0], target[1]];
        jumpNext = false;
        carry = [0, 0];
        owed = [0, 0];
        payback = [0, 0];
        lastMove = [0, 0];
        holdBack = 0;
        return position;
      }
      const heldBefore = holdBack;
      holdBack = Math.max(0, holdBack - dt * rate);
      // Repeated subtraction leaves rounding dust where the hold-back should end at exactly zero.
      if (holdBack < 1e-9) holdBack = 0;
      // The part of the step that lies inside the transition: all of it, but for the step that ends the transition.
      const inside = heldBefore > 0 ? Math.min(dt, heldBefore / rate) : 0;
      // The mean carry weight over that part, which makes the carry's total over a transition exactly zero.
      const carryShare = (heldBefore + holdBack - 1) * inside;
      const paybackShare = rate * inside;
      const carried = [
        carry[0] * carryShare - payback[0] * paybackShare,
        carry[1] * carryShare - payback[1] * paybackShare,
      ];
      owed = [owed[0] + carried[0], owed[1] + carried[1]];
      const moved = [position[0] + carried[0], position[1] + carried[1]];
      const gap = [target[0] - moved[0], target[1] - moved[1]];
      const gapLength = Math.hypot(gap[0], gap[1]);
      const approach = gapLength > 0 ? Math.min(1, dt * (1 + 5 / gapLength) * rate * (1 - holdBack)) : 0;
      const next = [moved[0] + gap[0] * approach, moved[1] + gap[1] * approach];
      lastMove = [next[0] - position[0], next[1] - position[1]];
      lastStepSeconds = dt;
      steppedSinceRetarget = true;
      position = next;
      return position;
    },
  };
}

const isFiniteHit = (hit) => typeof hit === 'number' && Number.isFinite(hit);

/**
 * Where the focal point ends up after the ceiling/wall guard, in metres.
 *
 * `base` is the unshifted focal point, `floor` the lowest height a platform allows it (or null), `shift` the focal shift [right, up] in units, `right` the player's right
 * (x, z). The guard sweeps from FOCAL_OBSTACLE_LIMIT under the unshifted focal point towards the shifted one and
 * keeps the focal point where the sweep stops. With no shift it sweeps straight up instead, so that a low ceiling
 * still lowers the focal point.
 */
function guardFocal(base, floor, shift, right, casts) {
  const limit = FOCAL_OBSTACLE_LIMIT * METRES_PER_UNIT;
  const hasShift = shift[0] !== 0 || shift[1] !== 0;
  // A platform floor lifts the unshifted focal point, and the shifted one may not end below it either. The sweep
  // starts as far below the shifted point as its run is tall, so lifting the point lifts the start with it.
  const lowest = floor ?? -Infinity;
  const shiftUp = shift[1] * METRES_PER_UNIT;
  const shifted = Math.max(Math.max(base[1], lowest) + shiftUp, lowest);
  const start = [base[0], shifted - shiftUp - limit, base[2]];

  // The run in units from the start point to the shifted focal point, in the (right, up) plane.
  const runRight = shift[0];
  const runUp = shift[1] + FOCAL_OBSTACLE_LIMIT;
  const runLength = hasShift ? Math.hypot(runRight, runUp) : FOCAL_OBSTACLE_LIMIT;
  const castLength = hasShift ? runLength : 2 * FOCAL_OBSTACLE_LIMIT;
  const dir = hasShift
    ? [(right[0] * runRight) / runLength, runUp / runLength, (right[1] * runRight) / runLength]
    : [0, 1, 0];
  const castMetres = castLength * METRES_PER_UNIT;

  let reach = runLength;
  if (casts.spherecast) {
    const hit = casts.spherecast(start, limit, dir, castMetres);
    // A swept sphere reports where its centre stops, already clear of the surface. The unshifted sweep is a
    // ceiling probe measured to the surface, so it keeps the clearance itself.
    if (isFiniteHit(hit) && hit < castMetres) reach = hit / METRES_PER_UNIT - (hasShift ? 0 : FOCAL_OBSTACLE_LIMIT);
  } else if (casts.raycast) {
    const hit = casts.raycast(start, dir, castMetres);
    if (isFiniteHit(hit) && hit < castMetres) reach = hit / METRES_PER_UNIT - FOCAL_OBSTACLE_LIMIT;
  }
  const along = clamp(reach, 0, runLength) * METRES_PER_UNIT;
  return [start[0] + dir[0] * along, start[1] + dir[1] * along, start[2] + dir[2] * along];
}

/** The unit look vector for a yaw (about +y, zero looking along +z) and pitch (positive looks up). */
function lookVector(yaw, pitch) {
  const flat = Math.cos(pitch);
  return [Math.sin(yaw) * flat, Math.sin(pitch), Math.cos(yaw) * flat];
}

export function createMwCamera() {
  let firstPerson = true;
  // A view change asked for while the arms are busy: the wanted `firstPerson` value, or null.
  let pendingView = null;
  let baseDistance = BASE_DISTANCE;
  // Where the eye really was behind the focal point at the last frame, in units; 0 in first person.
  let actualDistance = 0;
  let seaFarUnits = 0;
  let shoulderChoice = 'off';
  let shoulderMode = null;
  let choiceChanged = false;
  let thirdLastStep = false;
  const focalShift = createFocalOffset();

  const farLimit = () => (seaFarUnits > 0 ? seaFarUnits : MAX_DISTANCE);

  function requestView(wantFirst, ready) {
    if (ready) {
      firstPerson = wantFirst;
      pendingView = null;
    } else {
      pendingView = wantFirst;
    }
  }

  /** The boom length after zooming by `clicks` (positive: towards the player), or null if the wheel does nothing. */
  function zoomedDistance(clicks) {
    // A zoom starts from where the eye really is, which differs from the boom length when a wall pulls the eye in.
    const gap = actualDistance - baseDistance;
    if (seaFarUnits > 0) {
      // Only a pulled-in eye counts here; an eye still catching up to a shortened boom does not.
      const pinned = Math.min(0, gap);
      // At sea a burst of clicks in one frame counts as a single notch.
      const ratio = SEA_ZOOM_RATIO ** clamp(-clicks, -1, 1);
      if (clicks < 0) {
        if (baseDistance * (ratio - 1) + pinned <= 0) return null;
        return clamp(baseDistance * ratio, MIN_DISTANCE, seaFarUnits);
      }
      return clamp((baseDistance + pinned) * ratio, MIN_DISTANCE, seaFarUnits);
    }
    const next = baseDistance - clicks * WHEEL_STEP + gap;
    if (clicks < 0 && next <= baseDistance) return null;
    return clamp(next, MIN_DISTANCE, MAX_DISTANCE);
  }

  return {
    mode: () => (firstPerson ? 'first' : 'third'),
    thirdPerson: () => !firstPerson,
    queued: () => pendingView,
    baseDistance: () => baseDistance,
    cameraDistance: () => actualDistance,

    /**
     * One frame's wheel input: `clicks` > 0 zooms in, < 0 out. Crossing between first and third person waits until
     * `ready` (the arms can switch view) and is remembered until `update`.
     */
    wheel(clicks, { ready = true } = {}) {
      if (!clicks) return;
      if (firstPerson) {
        if (clicks > 0) return;
        baseDistance = MIN_DISTANCE;
        requestView(false, ready);
        return;
      }
      if (clicks > 0 && baseDistance === MIN_DISTANCE) {
        requestView(true, ready);
        return;
      }
      const next = zoomedDistance(clicks);
      if (next !== null) baseDistance = next;
    },

    /** Apply a queued view change once the arms are ready. */
    update({ ready = true } = {}) {
      if (pendingView !== null && ready) requestView(pendingView, true);
    },

    setShoulder(choice) {
      const next = SHOULDER_SIDES.includes(choice) ? choice : 'off';
      if (next !== shoulderChoice) choiceChanged = true;
      shoulderChoice = next;
    },
    shoulder: () => shoulderChoice,
    shoulderState: () => shoulderMode,
    focalOffset: () => focalShift.current(),

    /**
     * Advance the focal shift by `dt` seconds. `stance` is 'combat' while a weapon or spell is out, 'swimming' in
     * water, otherwise null.
     */
    stepShoulder(dt, stance) {
      if (firstPerson) {
        // The shift keeps settling out of sight, but the mode only follows the stance in third person.
        thirdLastStep = false;
        focalShift.step(dt);
        return;
      }
      let wanted = null;
      if (shoulderChoice !== 'off') wanted = stance === 'combat' || stance === 'swimming' ? stance : shoulderChoice;
      if (wanted !== shoulderMode) {
        const fast = wanted === 'combat' || shoulderMode === 'combat';
        focalShift.setSpeed(fast ? FOCAL_TRANSITION_SPEED.combat : FOCAL_TRANSITION_SPEED.normal);
        let shift = [0, 0];
        if (wanted === 'right') shift = SHOULDER_OFFSET;
        else if (wanted === 'left') shift = [-SHOULDER_OFFSET[0], SHOULDER_OFFSET[1]];
        else if (wanted === 'combat' || wanted === 'swimming') shift = COMBAT_OFFSET;
        focalShift.setTarget(shift);
        shoulderMode = wanted;
      }
      if (choiceChanged || !thirdLastStep) focalShift.instant();
      choiceChanged = false;
      thirdLastStep = true;
      focalShift.step(dt);
    },

    /** Tell the camera how far (in metres) the sailed hull reaches, so that the zoom can frame it; 0 on foot. */
    setSeaReach(metres) {
      const units = Number.isFinite(metres) && metres > 0 ? metres * MW_UNITS_PER_METER : 0;
      seaFarUnits = units > MAX_DISTANCE ? units : 0;
      baseDistance = Math.min(baseDistance, farLimit());
    },
    seaFar: () => seaFarUnits,

    /** What a save keeps. The boom length is kept to the on-foot range: a helm's reach does not outlive the helm. */
    state: () => ({ firstPerson, baseDistance: Math.min(baseDistance, MAX_DISTANCE) }),
    restore(saved) {
      if (!saved) return;
      pendingView = null;
      if (typeof saved.firstPerson === 'boolean') firstPerson = saved.firstPerson;
      if (typeof saved.baseDistance === 'number') {
        if (Number.isFinite(saved.baseDistance)) baseDistance = clamp(saved.baseDistance, MIN_DISTANCE, MAX_DISTANCE);
      }
    },

    /**
     * Where the eye is this frame. First person returns the head's own position. Third person returns the eye, the
     * focal point and the boom length in metres.
     *
     * `raycast(origin, direction, maxDistance)` or `spherecast(origin, radius, direction, maxDistance)` report how far
     * the first obstacle is (null for none); the sphere cast is preferred. `pivotFloor` is a height the focal point
     * must not drop below, for a platform that moves under the player.
     */
    eye({ fpEye, feet, yaw, pitch, heightScale = 1, raycast, spherecast, pivotFloor }) {
      if (firstPerson) {
        actualDistance = 0;
        return { eye: fpEye, thirdPerson: false, distance: 0, focal: null };
      }
      const base = [feet[0], feet[1] + FOCAL_HEIGHT * heightScale * METRES_PER_UNIT, feet[2]];
      const right = [Math.cos(yaw), -Math.sin(yaw)];
      const focal = guardFocal(base, pivotFloor, focalShift.current(), right, { raycast, spherecast });

      const look = lookVector(yaw, pitch);
      const back = [-look[0], -look[1], -look[2]];
      const wanted = baseDistance * METRES_PER_UNIT;
      let reach = wanted;
      if (spherecast) {
        const hit = spherecast(focal, CAMERA_OBSTACLE_LIMIT * METRES_PER_UNIT, back, wanted);
        if (isFiniteHit(hit) && hit < wanted) reach = Math.max(0, hit);
      } else if (raycast) {
        const hit = raycast(focal, back, wanted);
        if (isFiniteHit(hit) && hit < wanted) reach = Math.max(0, hit - CAMERA_OBSTACLE_LIMIT * METRES_PER_UNIT);
      }
      actualDistance = reach * MW_UNITS_PER_METER;
      return {
        eye: [focal[0] - look[0] * reach, focal[1] - look[1] * reach, focal[2] - look[2] * reach],
        thirdPerson: true,
        distance: reach,
        focal,
      };
    },
  };
}

/** The one live camera the hosts share. */
export const mwCamera = createMwCamera();
