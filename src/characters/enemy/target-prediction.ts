// EnemySenses.PredictNextTargetPos (MIT, Daggerfall Workshop), moved out of the enemy motor (enemyMotor.js), which
// keeps a method that calls it. It reads and writes the motor's own prediction fields.

import { CLASSIC_UPDATE_INTERVAL } from '../weaponStates.js';

type Vec3 = number[];

/** The EnemyAI fields PredictNextTargetPos reads and writes. Positions are feet space, as on the motor. */
export type PredictingFoe = {
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
 * :551-560's FIRST arm is the only one reachable here. Both callers
 * of this method sit behind `senses.TargetInSight` (DoRangedAttack's
 * band condition, EnemyMotor.cs:572), so `targetInSight ||...` is
 * true every time and `assumedCurrentPosition` is always
 * lastKnownTargetPos; the else-arm's remembered no-lead prediction
 * belongs to the one caller this port does not have,
 * DaggerfallMissile's mid-flight re-aim. The field it feeds
 * (predictedTargetPosWithoutLead) is still written at :612, because
 * that write is what the arm would read.
 *
 * :563-570 is DFU's arithmetic quirk, kept: targetPosPredictTimer is
 * zero only on the frame the prediction pass itself ran, so every
 * other call divides ONE prediction interval's worth of movement by
 * the SHORTER time since that pass and overstates the target's
 * speed. It also rewrites lastPositionDiff as a side effect, and so
 * does this.
 */
export function predictNextTargetPos(foe: PredictingFoe, interceptSpeed: number): Vec3 | null {
  if (foe.lastKnownTargetPos === null) return null; // ResetPlayerPos
  if (foe._predictedTargetPosWithoutLead === null) {
    foe._predictedTargetPosWithoutLead = [...foe.lastKnownTargetPos];
  }
  const assumed = foe.lastKnownTargetPos;
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
