// DFU's Enhanced Combat AI, movement and strafing (EnemyMotor.cs, MIT, Daggerfall Workshop): TakeAction's action
// ladder, EvaluateMoveInForAttack (the retreat roll), StrafeDecision, SetChangeStateTimer, AttemptMove's strafe step,
// and the attack's half speed. The functions decide; the motor (enemyMotor.js) turns and walks. Each one does nothing
// on the classic path except where it says so. The pitch handling for flyers, swimmers and walkers is a later group,
// and until then a flyer or swimmer neither strafes nor backs away.

import { hasActiveEffect } from '../../systems/active-effects.ts';
import { LOCAL_PLAYER, playerStanceOf } from '../../player/player-stance.ts';

/** EnemyMotor.stopDistance (:36), which the enhanced AI keeps: "used to prevent orbiting". */
export const ENHANCED_STOP_DISTANCE = 1.7;
/** TakeAction (:488): past this many stop distances a foe that is not retreating closes in, whatever it decided. */
export const ON_GUARD_STOP_DISTANCES = 2.75;
/** TakeAction (:500, :506): inside this many stop distances a foe stops strafing and backs away. */
export const TOO_CLOSE_STOP_DISTANCES = 0.8;
/** EnemyMotor.attackSpeedDivisor (:35): "how much to slow down during attack animations". */
export const ATTACK_SPEED_DIVISOR = 2;
/** TakeAction (:502) and DoRangedAttack (:581): a strafe is a quarter of the walk. */
export const STRAFE_SPEED_SHARE = 1 / 4;
/** TakeAction (:511): a foe backs away at half its walk. */
export const BACK_AWAY_SPEED_SHARE = 1 / 2;
/** AttemptMove (:912): a strafe point this close is reached, and the next is one radian round. */
export const STRAFE_ARRIVAL = 0.2;
/** EvaluateMoveInForAttack (:1271): retreatDistanceBaseMult. */
export const RETREAT_DISTANCE_BASE = 2.25;
/** KnockbackMovement (:311-314): a knockback over this many classic units re-runs the retreat roll ("if a decent hit
 *  got in, reconsider whether to continue current tactic"). */
export const REEVALUATE_KNOCKBACK = 10;
/** EnemySenses.TargetHasBackTurned (:711): the target faces away when its back is within this of the foe. */
export const BACK_TURNED_DEG = 157.5;

type Vec3 = number[];

/** What the retreat roll reads off an entity: its level, and its effects for paralysis. */
type EntityFacts = { level?: number; activeEffects?: { kind: string; ended?: boolean }[] };

/** A foe target candidate (enemyTargets.js), the player sentinel, a peer, or null. */
type TargetCandidate = {
  isPlayer?: boolean;
  isPeer?: boolean;
  id?: string;
  ai?: { yaw?: number };
  entity?: EntityFacts;
} | null;

/** The EnemyAI fields this module reads and writes. */
export type MovingFoe = {
  readonly enhancedCombatAI: boolean;
  yaw: number;
  moving: boolean;
  _dist: number;
  _tacDir: number[] | null;
  _tacSpeed: number;
  flies?: boolean;
  swims?: boolean;
  levitating?: boolean;
  rolls: () => number;
  inSight: boolean;
  feet: Vec3;
  destination: Vec3;
  predictedTargetPos: Vec3 | null;
  target: TargetCandidate;
  _armedTargeting: boolean;
  _playerEntity?: EntityFacts | null;
  vitals?: (() => { level?: number } | null) | null;
  moveInForAttack: boolean;
  moveInForAttackTimer: number;
  retreatDistanceMultiplier: number;
  changeStateTimer: number;
  doStrafe: boolean;
  strafeTimer: number;
  strafeLeft: boolean;
  strafeAngle: number;
  pursuing: boolean;
  retreating: boolean;
  _attackOneShot: boolean;
};

/** What TakeAction asks AttemptMove (or TurnToTarget) to do this classic update. */
export type EnhancedStep =
  | { kind: 'move' } // AttemptMove(direction, moveSpeed)
  | { kind: 'strafe'; distance: number } // AttemptMove(direction, moveSpeed / 4, false, true, distance)
  | { kind: 'backAway' } // AttemptMove(direction, moveSpeed / 2, true)
  | { kind: 'turn' } // TurnToTarget
  | { kind: 'hold' } // nothing this update: the change-state timer or a fresh strafe decision
  | { kind: 'stand' }; // "Not moving, and no need to turn"

/** Unity's Random.Range(float, float), both ends included. */
const rangeFloat = (rolls: () => number, min: number, max: number): number => min + rolls() * (max - min);
/** Unity's Random.Range(int, int), the maximum excluded. */
const rangeInt = (rolls: () => number, min: number, max: number): number => min + Math.floor(rolls() * (max - min));

export function initEnhancedMovement(foe: MovingFoe): void {
  foe.moveInForAttack = true;
  foe.moveInForAttackTimer = 0;
  foe.retreatDistanceMultiplier = 0;
  foe.changeStateTimer = 0;
  foe.doStrafe = false;
  foe.strafeTimer = 0;
  foe.strafeLeft = false;
  foe.strafeAngle = 0;
  foe.pursuing = false;
  foe.retreating = false;
  foe._attackOneShot = false; // MobileUnit.IsPlayingOneShot, written by EnemyAttack.update
}

/** UpdateTimers (:378-393), the three timers this group adds; every fixed step. */
export function tickEnhancedTimers(foe: MovingFoe, dt: number): void {
  if (foe.moveInForAttackTimer > 0) foe.moveInForAttackTimer -= dt;
  if (foe.changeStateTimer > 0) foe.changeStateTimer -= dt;
  if (foe.strafeTimer > 0) foe.strafeTimer -= dt;
}

/** SetChangeStateTimer (:1316-1324): "padding between state changes, for non-perfect reflexes". No timer on the
 *  classic path. */
export function setChangeStateTimer(foe: MovingFoe): void {
  if (!foe.enhancedCombatAI) return;
  if (foe.changeStateTimer <= 0) foe.changeStateTimer = rangeFloat(foe.rolls, 0.2, 0.8);
}

/** TakeAction (:442-449) and the field's initialiser (:36): how near a foe closes before it stands. Classic AI closes
 *  to its melee reach, 2.25 against the player and 1.5 against another foe; the enhanced AI keeps 1.7. */
export function stopDistanceOf(foe: MovingFoe, meleeDistance: number, classicVsAI: number): number {
  if (foe.enhancedCombatAI) return ENHANCED_STOP_DISTANCE;
  const vsAI = foe._armedTargeting && foe.target != null && !foe.target.isPlayer;
  return vsAI ? classicVsAI : meleeDistance;
}

/** StrafeDecision and EvaluateMoveInForAttack's strafe angle (:650-659, :1290-1299): the signed angle from north of
 *  the destination round to the foe, in radians 0 to 2 pi. That is the foe's bearing from the destination, so the
 *  strafe circle starts where the foe stands. */
function strafeAngleFrom(foe: MovingFoe): number {
  const angle = Math.atan2(foe.feet[0] - foe.destination[0], foe.feet[2] - foe.destination[2]);
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

/** StrafeDecision (:639-661): a strafe one time in four, for 1 to 2 seconds, either way round. */
export function strafeDecision(foe: MovingFoe): void {
  foe.doStrafe = rangeInt(foe.rolls, 0, 4) === 0;
  foe.strafeTimer = rangeFloat(foe.rolls, 1, 2);
  if (!foe.doStrafe) return;
  foe.strafeLeft = rangeInt(foe.rolls, 0, 2) === 0;
  foe.strafeAngle = strafeAngleFrom(foe);
}

/** AttemptMove's strafe (:904-915): the way to the point `distance` from the destination at the strafe angle, on the
 *  ground [x, z]; at the point the angle moves one radian round. Null when the foe stands on the point. */
export function strafeDirection(foe: MovingFoe, distance: number): number[] | null {
  const x = foe.destination[0] + Math.sin(foe.strafeAngle) * distance - foe.feet[0];
  const z = foe.destination[2] + Math.cos(foe.strafeAngle) * distance - foe.feet[2];
  const length = Math.hypot(x, z);
  if (length <= STRAFE_ARRIVAL) foe.strafeAngle += foe.strafeLeft ? 1 : -1;
  return length > 1e-9 ? [x / length, z / length] : null;
}

/** The target's facts the retreat roll reads. A peer's paralysis and level are not on the wire: unknown, it is not
 *  paralysed and is the foe's own level. */
type TargetFacts = {
  yaw: number | null;
  paralyzed: boolean;
  bowOrSheathed: boolean;
  isLocalPlayer: boolean;
  level: number | null;
};

function targetFactsOf(foe: MovingFoe): TargetFacts | null {
  const target = foe._armedTargeting ? foe.target : { isPlayer: true };
  if (target == null) return null;
  if (target.isPlayer && target.isPeer !== true) {
    const stance = playerStanceOf(LOCAL_PLAYER);
    const entity = foe._playerEntity ?? null;
    return {
      yaw: stance.yaw,
      paralyzed: hasActiveEffect(entity, 'paralyze'),
      bowOrSheathed: stance.bowOrSheathed,
      isLocalPlayer: true,
      level: entity?.level ?? null,
    };
  }
  if (target.isPeer === true) {
    return {
      yaw: playerStanceOf(target.id ?? '').yaw,
      paralyzed: false,
      bowOrSheathed: false,
      isLocalPlayer: false,
      level: null,
    };
  }
  return {
    yaw: target.ai?.yaw ?? null,
    paralyzed: hasActiveEffect(target.entity, 'paralyze'),
    bowOrSheathed: false,
    isLocalPlayer: false,
    level: target.entity?.level ?? null,
  };
}

/** EnemySenses.TargetHasBackTurned (:697-713): the angle between the foe-to-target line and the way the target's back
 *  faces is over 157.5 degrees, so the target looks away from the foe. Measured to the predicted position. */
function backTurned(foe: MovingFoe, yaw: number | null): boolean {
  const at = foe.predictedTargetPos;
  if (yaw === null || at === null) return false;
  const tx = at[0] - foe.feet[0];
  const tz = at[2] - foe.feet[2];
  const length = Math.hypot(tx, tz);
  if (length < 1e-9) return false;
  const cos = (tx * -Math.sin(yaw) + tz * -Math.cos(yaw)) / length;
  return Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI) > BACK_TURNED_DEG;
}

/**
 * EvaluateMoveInForAttack (:1225-1300): whether to close in or back off, on the perceived odds. Classic AI always
 * closes in. The enhanced AI closes in on a target it cannot see, a paralysed one, one with its back turned, and the
 * player with a bow out or the weapon sheathed; otherwise it rolls levelMod to levelMod + 9, where levelMod is half
 * the level difference, at most 4 either way, and closes in above 4. A retreat backs off to a multiple of the stop
 * distance that grows as the roll falls, and picks a strafe side.
 */
export function evaluateMoveInForAttack(foe: MovingFoe): void {
  if (!foe.enhancedCombatAI || !foe.inSight) {
    foe.moveInForAttack = true;
    return;
  }
  const target = targetFactsOf(foe);
  if (target === null) return;
  if (target.paralyzed || backTurned(foe, target.yaw) || (target.isLocalPlayer && target.bowOrSheathed)) {
    foe.moveInForAttack = true;
    return;
  }
  foe.moveInForAttackTimer = rangeInt(foe.rolls, 1, 3);
  const ownLevel = foe.vitals?.()?.level ?? 1;
  const levelMod = Math.max(-4, Math.min(4, Math.trunc((ownLevel - (target.level ?? ownLevel)) / 2)));
  const roll = rangeInt(foe.rolls, levelMod, 10 + levelMod);
  foe.moveInForAttack = roll > 4;
  if (foe.moveInForAttack) return;
  foe.retreatDistanceMultiplier = RETREAT_DISTANCE_BASE + RETREAT_DISTANCE_BASE * (0.25 * (2 - roll));
  foe.strafeLeft = rangeInt(foe.rolls, 0, 2) === 0;
  foe.strafeAngle = strafeAngleFrom(foe);
}

/**
 * TakeAction's ladder past the ranged and touch attacks (:473-525), enhanced side. `distance` is the one TakeAction
 * measures (the target's while it is seen and no detour runs, else the destination's); `facing` is whether the foe
 * already faces the destination within 22.5 degrees.
 */
export function enhancedTakeAction(
  foe: MovingFoe,
  distance: number,
  detouring: boolean,
  facing: boolean,
): EnhancedStep {
  if (foe.moveInForAttackTimer <= 0 && !detouring) evaluateMoveInForAttack(foe);
  if (detouring) return { kind: 'move' };
  const stop = ENHANCED_STOP_DISTANCE;
  if ((!foe.retreating && distance >= stop * ON_GUARD_STOP_DISTANCES) || (distance > stop && foe.moveInForAttack)) {
    if (foe.changeStateTimer <= 0 || foe.pursuing) return { kind: 'move' };
    return facing ? { kind: 'hold' } : { kind: 'turn' };
  }
  if (foe.strafeTimer <= 0) {
    strafeDecision(foe);
    return { kind: 'hold' };
  }
  if (foe.doStrafe && distance >= stop * TOO_CLOSE_STOP_DISTANCES) return { kind: 'strafe', distance };
  if (foe.inSight && backsAway(foe, distance)) {
    return foe.changeStateTimer <= 0 || foe.retreating ? { kind: 'backAway' } : { kind: 'hold' };
  }
  if (!facing) return { kind: 'turn' };
  setChangeStateTimer(foe);
  foe.pursuing = false;
  foe.retreating = false;
  return { kind: 'stand' };
}

/** TakeAction (:506-507): right next to the target, or retreating and still too close. */
function backsAway(foe: MovingFoe, distance: number): boolean {
  const stop = ENHANCED_STOP_DISTANCE;
  if (distance < stop * TOO_CLOSE_STOP_DISTANCES) return true;
  const retreatLeft = distance < stop * foe.retreatDistanceMultiplier;
  return !foe.moveInForAttack && retreatLeft && (foe.changeStateTimer <= 0 || foe.retreating);
}

/** DoRangedAttack (:575-583): a shooter in its band and facing within 22.5 degrees decides to strafe, and while the
 *  strafe lasts it moves round at a quarter speed. Null when it stands. */
export function rangedStrafe(foe: MovingFoe, distance: number, facing: boolean): EnhancedStep | null {
  if (!foe.enhancedCombatAI) return null;
  if (facing && foe.strafeTimer <= 0) strafeDecision(foe);
  return foe.doStrafe && foe.strafeTimer > 0 ? { kind: 'strafe', distance } : null;
}

/** TakeAction (:438-440): an enhanced foe walks at half speed while it plays an attack. */
export const attackPace = (foe: MovingFoe): number =>
  foe.enhancedCombatAI && foe._attackOneShot ? 1 / ATTACK_SPEED_DIVISOR : 1;

/** The motor's turning (enemyMotor.js withinYaw, turnTowards and its two gates), handed in so this module does not
 *  import the motor. */
export type YawOps = {
  withinYaw(yaw: number, dx: number, dz: number, deg: number): boolean;
  turnTowards(yaw: number, dx: number, dz: number): number;
  moveGateDeg: number;
  lookGateDeg: number;
};

/** TakeAction past the ranged attack (:473-525) for DFU's Enhanced Combat AI: the ladder decides, and AttemptMove or
 *  TurnToTarget carries it out. `distance` is TakeAction's own (:455-460). */
export function enhancedTick(foe: MovingFoe, dx: number, dz: number, detouring: boolean, ops: YawOps): void {
  const distance = !detouring && foe.inSight ? foe._dist : Math.hypot(dx, foe.destination[1] - foe.feet[1], dz);
  const step = enhancedTakeAction(foe, distance, detouring, ops.withinYaw(foe.yaw, dx, dz, ops.lookGateDeg));
  applyEnhancedStep(foe, step, dx, dz, ops);
}

/** DoRangedAttack's motion (:575-591): a shooter in its band does not advance. With DFU's Enhanced Combat AI it may
 *  strafe (rangedStrafe); then outside 22.5 degrees it turns to its target, as the classic one does. */
export function rangedStep(foe: MovingFoe, dx: number, dz: number, ops: YawOps): void {
  const strafe = rangedStrafe(foe, foe._dist, ops.withinYaw(foe.yaw, dx, dz, ops.lookGateDeg));
  foe.moving = false;
  if (strafe) applyEnhancedStep(foe, strafe, dx, dz, ops);
  if (!ops.withinYaw(foe.yaw, dx, dz, ops.lookGateDeg)) foe.yaw = ops.turnTowards(foe.yaw, dx, dz);
}

/**
 * AttemptMove (:880-1000), enhanced side, or TurnToTarget, for one step the ladder chose. A pursuit marks the foe
 * pursuing and a strafe or a back-away marks it retreating, which lets the next update skip the change-state wait.
 * Outside the 5.625 degree gate it turns, and with its target in sight it walks on while it turns ("for more
 * natural-looking movement while pursuing"). A strafe and a back-away walk the way they chose, at a quarter and a half
 * of the walk, through the motor's step seam (_tacDir, which the Enhanced AI layer also uses); a wall or a drop there
 * stops the step, as DFU finds no detour for either. A flyer or swimmer only pursues for now: its strafe and back-away
 * come with the pitch group.
 */
export function applyEnhancedStep(foe: MovingFoe, step: EnhancedStep, dx: number, dz: number, ops: YawOps): void {
  foe.moving = false;
  if (step.kind === 'turn') {
    foe.yaw = ops.turnTowards(foe.yaw, dx, dz);
    return;
  }
  if (step.kind !== 'move' && step.kind !== 'strafe' && step.kind !== 'backAway') return;
  const pursuit = step.kind === 'move';
  foe.pursuing = pursuit;
  foe.retreating = !pursuit;
  const facing = ops.withinYaw(foe.yaw, dx, dz, ops.moveGateDeg);
  if (!facing) {
    foe.yaw = ops.turnTowards(foe.yaw, dx, dz);
    if (!foe.inSight) return;
  }
  setChangeStateTimer(foe);
  const walker = !foe.flies && !foe.swims && !foe.levitating;
  if (pursuit) {
    foe.moving = true;
    if (!facing && walker) groundStep(foe, [dx, dz], 1);
    return;
  }
  if (!walker) return;
  if (step.kind === 'strafe') groundStep(foe, strafeDirection(foe, step.distance), STRAFE_SPEED_SHARE);
  else groundStep(foe, [-dx, -dz], BACK_AWAY_SPEED_SHARE);
}

/** One step along the ground [x, z] at `share` of the walk (the motor's _walkStep reads _tacDir and _tacSpeed). */
function groundStep(foe: MovingFoe, dir: number[] | null, share: number): void {
  const length = dir ? Math.hypot(dir[0], dir[1]) : 0;
  if (length < 1e-9) return;
  foe._tacDir = [dir[0] / length, dir[1] / length];
  foe._tacSpeed = share;
  foe.moving = true;
}
