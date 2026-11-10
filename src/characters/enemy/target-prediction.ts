// EnemySenses.PredictNextTargetPos (MIT, Daggerfall Workshop), moved out of the enemy motor (enemyMotor.js), which
// keeps a method that calls it. It reads and writes the motor's own prediction fields.

import { CLASSIC_UPDATE_INTERVAL } from '../weaponStates.js';

type Vec3 = number[];

/** The EnemyAI fields PredictNextTargetPos reads and writes. Positions are feet space, as on the motor. */
export type PredictingFoe = {
  inSight: boolean;
  _inEarshot: boolean;
  sightRadius?: number;
  predictedTargetPos: Vec3 | null;
  lastKnownTargetPos: Vec3 | null;
  oldLastKnownTargetPos: Vec3 | null;
  lastPositionDiff: Vec3;
  _predictedTargetPosWithoutLead: Vec3 | null;
  _targetPosPredictTimer: number;
  collider: { raycast(origin: Vec3, dir: Vec3, max: number): number };
  _centre(): Vec3;
  _targetCentreOffset(): number;
};

/**
 * EnemySenses.PredictNextTargetPos (:541-616), the position the two
 * shooting probes aim at - a LEAD, solved as a cone/line
 * intersection against the target's own movement.
 *
 * Answers a CENTRE-space point (the target's feet plus half its
 * capsule, the same lift `_getDestination` takes), or null for DFU's
 * ResetPlayerPos sentinel - "nothing has ever been seen", which
 * HasClearPathToShootProjectile reads as a refusal (:702-703).
 *
 * :551-560 picks the position the lead starts from (assumedTargetPos).
 * The two shooting probes sit behind `senses.TargetInSight`, so for
 * them it is always lastKnownTargetPos; DFU's Enhanced Combat AI also
 * predicts a target it has lost (the motor's _trackPredictedPos), and
 * takes the remembered no-lead prediction while that may still be good.
 * `sightRadius` is the motor's SIGHT_RADIUS, for a foe with no radius
 * of its own.
 *
 * :563-570 is DFU's arithmetic quirk, kept: targetPosPredictTimer is
 * zero only on the frame the prediction pass itself ran, so every
 * other call divides ONE prediction interval's worth of movement by
 * the SHORTER time since that pass and overstates the target's
 * speed. It also rewrites lastPositionDiff as a side effect, and so
 * does this.
 */
export function predictNextTargetPos(foe: PredictingFoe, interceptSpeed: number, sightRadius: number): Vec3 | null {
  if (foe.lastKnownTargetPos === null) return null; // ResetPlayerPos
  if (foe._predictedTargetPosWithoutLead === null) {
    foe._predictedTargetPosWithoutLead = [...foe.lastKnownTargetPos];
  }
  const assumed = assumedTargetPos(foe, sightRadius);
  let divisor = CLASSIC_UPDATE_INTERVAL; // predictionInterval (:34) = 0.0625
  let diff = foe.lastPositionDiff;
  if (foe._targetPosPredictTimer !== 0) {
    divisor = foe._targetPosPredictTimer;
    const old = foe.oldLastKnownTargetPos ?? assumed;
    diff = [assumed[0] - old[0], assumed[1] - old[1], assumed[2] - old[2]];
    foe.lastPositionDiff = diff;
  }
  // The quadratic is solved centre-to-centre, as DFU's transform
  // positions are; `assumed` is feet-space like every other position
  // on the motor, so it lifts by half the TARGET's capsule.
  const c = foe._centre();
  const lift = foe._targetCentreOffset(); // REVIEW 2026-09-05: the target's transform, not its capsule half
  const d = [assumed[0] - c[0], assumed[1] + lift - c[1], assumed[2] - c[2]];
  const v = [diff[0] / divisor, diff[1] / divisor, diff[2] / divisor];
  const a = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - interceptSpeed * interceptSpeed;
  const b = 2 * (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]);
  const cc = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const at = [assumed[0], assumed[1] + lift, assumed[2]];
  let prediction = [at[0], at[1], at[2]];
  let t = -1;
  if (Math.abs(a) >= 1e-5) {
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      // "find the minimal positive solution" (:586-591).
      const discSqrt = Math.sqrt(disc) * Math.sign(a);
      t = (-b - discSqrt) / (2 * a);
      if (t < 0) t = (-b + discSqrt) / (2 * a);
    }
  } else if (Math.abs(b) >= 1e-5) {
    t = -cc / b; // the degenerate case (:597-598)
  }
  if (t >= 0) {
    prediction = [at[0] + v[0] * t, at[1] + v[1] * t, at[2] + v[2] * t];
    // :605-609 - "Don't predict target will move through obstacles".
    let px = prediction[0] - at[0];
    let py = prediction[1] - at[1];
    let pz = prediction[2] - at[2];
    const pl = Math.hypot(px, py, pz);
    if (pl > 1e-9) {
      px /= pl;
      py /= pl;
      pz /= pl;
      if (Number.isFinite(foe.collider.raycast(at, [px, py, pz], pl))) prediction = at;
    }
  }
  // :612-613 - the no-lead prediction stored for the next pass, in
  // the motor's feet space.
  foe._predictedTargetPosWithoutLead = [assumed[0] + diff[0], assumed[1] + diff[1], assumed[2] + diff[2]];
  return prediction;
}

/**
 * PredictNextTargetPos :551-560, assumedCurrentPosition: the last known position while the target is seen or heard,
 * while the last prediction lies past sight range, or while a ray toward the no-lead prediction meets nothing;
 * otherwise the no-lead prediction ("if not aware of target and predicted position may still be good"). The ray meets
 * only the level here (entities are not in the collider), where DFU's also meets bodies.
 */
function assumedTargetPos(foe: PredictingFoe, defaultSightRadius: number): Vec3 {
  const known = foe.lastKnownTargetPos;
  const withoutLead = foe._predictedTargetPosWithoutLead;
  const predicted = foe.predictedTargetPos;
  if (foe.inSight || foe._inEarshot || !withoutLead || !predicted) return known;
  const c = foe._centre();
  const lift = foe._targetCentreOffset();
  const radius = Number.isFinite(foe.sightRadius) && foe.sightRadius > 0 ? foe.sightRadius : defaultSightRadius;
  if (Math.hypot(predicted[0] - c[0], predicted[1] + lift - c[1], predicted[2] - c[2]) > radius) return known;
  const ray = [withoutLead[0] - c[0], withoutLead[1] + lift - c[1], withoutLead[2] - c[2]];
  const length = Math.hypot(ray[0], ray[1], ray[2]);
  if (length < 1e-9) return known;
  const hit = foe.collider.raycast(c, [ray[0] / length, ray[1] / length, ray[2] / length], radius);
  return Number.isFinite(hit) ? withoutLead : known;
}

/** EnemySenses.Update :496-501: DFU's Enhanced Combat AI's predicted position, the lead at the foe's own walking speed,
 *  in the motor's feet space; null while nothing has been seen. */
export function leadInFeet(foe: PredictingFoe, walkSpeed: number, sightRadius: number): Vec3 | null {
  const lead = predictNextTargetPos(foe, walkSpeed, sightRadius);
  return lead ? [lead[0], lead[1] - foe._targetCentreOffset(), lead[2]] : null;
}
