// DFU's Enhanced Combat AI, movement and strafing (EnemyMotor.cs): the stop distance, the retreat roll, the strafe,
// the action ladder and the attack's half speed, each against the classic path; then the motor end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENHANCED_STOP_DISTANCE,
  attackPace,
  enhancedTakeAction,
  evaluateMoveInForAttack,
  initEnhancedMovement,
  stopDistanceOf,
  strafeDecision,
  strafeDirection,
  type MovingFoe,
} from '../../../src/characters/enemy/enhanced-movement.ts';
import {
  LOCAL_PLAYER,
  forgetPlayerStance,
  writePlayerBowOrSheathed,
  writePlayerYaw,
} from '../../../src/player/player-stance.ts';

// The mods-off precondition, the motor and the collider are loaded by a computed path, which tsconfig.node.json does not
// follow: their imports reach src/player/motor.js and src/net (the server profile hands the sky clock's rule to
// net/skyLaw.js), which name the DOM's crypto types (CryptoKey, SubtleCrypto), and the node config has no DOM library.
// Every top-level await runs before the first test, so the mods are off for each.
const MODS_OFF_PATH: string = '../../modsOff.js';
await import(MODS_OFF_PATH);
const MOTOR_PATH: string = '../../../src/characters/enemy/enemyMotor.js';
const COLLIDER_PATH: string = '../../../src/player/collider.js';
const { EnemyAI } = await import(MOTOR_PATH);
const { Collider } = await import(COLLIDER_PATH);

/** Rolls handed out in order, then the last one again. */
const scripted = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

function foe(over: Partial<MovingFoe> = {}): MovingFoe {
  const f = {
    enhancedCombatAI: true,
    rolls: () => 0.5,
    inSight: true,
    feet: [0, 0, 0],
    destination: [0, 0, 5],
    predictedTargetPos: [0, 0, 5],
    target: null,
    _armedTargeting: false,
    _playerEntity: { level: 5 },
    vitals: () => ({ level: 5 }),
  } as unknown as MovingFoe;
  initEnhancedMovement(f);
  return Object.assign(f, over);
}

test.afterEach(() => forgetPlayerStance(LOCAL_PLAYER));

test('TakeAction :442-449: classic AI stops at its melee reach, 2.25 or 1.5 against a foe; the enhanced AI at 1.7', () => {
  assert.equal(stopDistanceOf(foe({ enhancedCombatAI: false }), 2.25, 1.5), 2.25);
  assert.equal(
    stopDistanceOf(foe({ enhancedCombatAI: false, _armedTargeting: true, target: { isPlayer: false } }), 2.25, 1.5),
    1.5,
  );
  assert.equal(stopDistanceOf(foe(), 2.25, 1.5), ENHANCED_STOP_DISTANCE);
});

test('StrafeDecision: one time in four, for 1 to 2 seconds, starting from where the foe stands round the destination', () => {
  const f = foe({ rolls: scripted(0, 0.5, 0.2), feet: [5, 0, 5], destination: [0, 0, 5] });
  strafeDecision(f);
  assert.deepEqual([f.doStrafe, f.strafeTimer, f.strafeLeft], [true, 1.5, true]);
  assert.ok(Math.abs(f.strafeAngle - Math.PI / 2) < 1e-9, 'due east of the destination');
  const no = foe({ rolls: scripted(0.25) });
  strafeDecision(no);
  assert.equal(no.doStrafe, false);
});

test('AttemptMove :904-915: the strafe walks round the destination and moves one radian on at each point', () => {
  const f = foe({ feet: [5, 0, 5], destination: [0, 0, 5], strafeAngle: Math.PI / 2, strafeLeft: true });
  assert.equal(strafeDirection(f, 5), null, 'standing on the point');
  assert.ok(Math.abs(f.strafeAngle - (Math.PI / 2 + 1)) < 1e-9);
  const dir = strafeDirection(f, 5);
  assert.ok(dir && Math.abs(Math.hypot(dir[0], dir[1]) - 1) < 1e-9);
});

test('EvaluateMoveInForAttack: classic AI always closes in; the enhanced AI closes in on an unseen, paralysed, turned-away or unready target', () => {
  const classic = foe({ enhancedCombatAI: false, moveInForAttack: false });
  evaluateMoveInForAttack(classic);
  assert.equal(classic.moveInForAttack, true);
  const unseen = foe({ inSight: false, moveInForAttack: false });
  evaluateMoveInForAttack(unseen);
  assert.equal(unseen.moveInForAttack, true);

  const rollsLow = () => foe({ rolls: () => 0, moveInForAttack: true });
  writePlayerBowOrSheathed(LOCAL_PLAYER, true);
  const unready = rollsLow();
  evaluateMoveInForAttack(unready);
  assert.equal(unready.moveInForAttack, true, 'the player with a bow out or the weapon sheathed');
  writePlayerBowOrSheathed(LOCAL_PLAYER, false);

  writePlayerYaw(LOCAL_PLAYER, 0); // the player at z 5 faces +z, away from the foe at the origin
  const turned = rollsLow();
  evaluateMoveInForAttack(turned);
  assert.equal(turned.moveInForAttack, true, 'its back is turned');
  writePlayerYaw(LOCAL_PLAYER, Math.PI);

  const paralysed = foe({
    rolls: () => 0,
    _playerEntity: { level: 5, activeEffects: [{ kind: 'paralyze' }] } as never,
  });
  evaluateMoveInForAttack(paralysed);
  assert.equal(paralysed.moveInForAttack, true);

  const facing = rollsLow();
  evaluateMoveInForAttack(facing);
  assert.equal(facing.moveInForAttack, false, 'a roll of 0 is not above 4');
  assert.equal(facing.moveInForAttackTimer, 1);
  assert.equal(facing.retreatDistanceMultiplier, 2.25 + 2.25 * 0.25 * 2);
});

test('EvaluateMoveInForAttack :1276-1286: the level difference moves the roll, at most 4 either way', () => {
  const roll = (own: number, theirs: number, r: number) => {
    const f = foe({ rolls: scripted(0, r), vitals: () => ({ level: own }), _playerEntity: { level: theirs } });
    evaluateMoveInForAttack(f);
    return f.moveInForAttack;
  };
  assert.equal(roll(5, 5, 0.45), false, 'roll 4');
  assert.equal(roll(5, 5, 0.5), true, 'roll 5');
  assert.equal(roll(30, 1, 0), false, 'levelMod 4, roll 4');
  assert.equal(roll(30, 1, 0.1), true, 'levelMod 4, roll 5');
  assert.equal(roll(1, 30, 0.85), false, 'levelMod -4, roll 4');
  assert.equal(roll(1, 30, 0.95), true, 'levelMod -4, roll 5, the most it can roll');
});

test('TakeAction :485-524: close in from afar, decide a strafe, back away when too close, else stand facing', () => {
  const settled = (over: Partial<MovingFoe>) => foe({ moveInForAttackTimer: 1, strafeTimer: 1, ...over });
  assert.deepEqual(enhancedTakeAction(settled({}), 6, false, true), { kind: 'move' }, 'past 2.75 stop distances');
  assert.deepEqual(
    enhancedTakeAction(settled({ changeStateTimer: 0.5 }), 6, false, true),
    { kind: 'hold' },
    'the reflex wait',
  );
  assert.deepEqual(enhancedTakeAction(settled({ changeStateTimer: 0.5 }), 6, false, false), { kind: 'turn' });
  const deciding = settled({ strafeTimer: 0, rolls: () => 0.9 });
  assert.deepEqual(enhancedTakeAction(deciding, 1.6, false, true), { kind: 'hold' });
  assert.ok(deciding.strafeTimer > 0);
  assert.deepEqual(enhancedTakeAction(settled({ doStrafe: true }), 1.6, false, true), {
    kind: 'strafe',
    distance: 1.6,
  });
  assert.deepEqual(
    enhancedTakeAction(settled({}), 1.0, false, true),
    { kind: 'backAway' },
    'inside 0.8 stop distances',
  );
  assert.deepEqual(
    enhancedTakeAction(settled({ moveInForAttack: false, retreatDistanceMultiplier: 3 }), 4, false, true),
    { kind: 'backAway' },
    'retreating',
  );
  const standing = settled({});
  assert.deepEqual(enhancedTakeAction(standing, 1.6, false, true), { kind: 'stand' });
  assert.ok(standing.changeStateTimer > 0, 'SetChangeStateTimer');
});

test('TakeAction :438-440: an enhanced foe walks at half speed while it attacks', () => {
  assert.equal(attackPace(foe({ _attackOneShot: true })), 0.5);
  assert.equal(attackPace(foe({ _attackOneShot: false })), 1);
  assert.equal(attackPace(foe({ enhancedCombatAI: false, _attackOneShot: true })), 1);
});

const I4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const floored = () => {
  const c = new Collider(() => -100);
  c.addMesh(
    'floor',
    new Float32Array([-80, 0, -80, 80, 0, -80, 80, 0, 80, -80, 0, 80]),
    new Uint32Array([0, 1, 2, 0, 2, 3]),
    I4,
  );
  return c;
};
const senses = () => ({ gameMinutes: 0, playerStealth: 0, rolls: () => 0.5 });
/** `roll` is every draw: 0.99 closes in and waits the longest reflex (0.8 s); 0 backs off and waits the shortest (0.2 s). */
const motor = (on: boolean, yaw = 0, roll = 0.99) =>
  new EnemyAI(floored(), [0, 0, 0], yaw, {
    liveSpeed: 50,
    height: 1.8,
    centreOffset: 0.9,
    rolls: () => roll,
    enhancedCombatAI: () => on,
  });
const steps = (ai: { update(dt: number, at: number[], senses: object): void }, n: number, at: number[]) => {
  for (let i = 0; i < n; i++) ai.update(1 / 60, at, senses());
};

test('the motor: an enhanced foe right next to the player backs away; a classic foe stands', () => {
  const classic = motor(false);
  steps(classic, 90, [0, 0, 1]);
  assert.ok(Math.abs(classic.feet[2]) < 1e-6, 'classic: inside its 2.25 reach, it stands');
  const enhanced = motor(true);
  steps(enhanced, 90, [0, 0, 1]); // past the reflex wait
  assert.ok(enhanced.feet[2] < -0.05, `enhanced: it backs off (z ${enhanced.feet[2]})`);
  assert.ok(Math.abs(enhanced.feet[0]) < 1e-6, 'straight back');
});

test('the motor: an enhanced foe walks while it turns to a target it sees; a classic foe turns in place', () => {
  const classic = motor(false, Math.PI, 0);
  steps(classic, 24, [0, 0, 10]);
  assert.ok(Math.hypot(classic.feet[0], classic.feet[2]) < 1e-6, 'classic: turns in place first');
  const enhanced = motor(true, Math.PI, 0);
  steps(enhanced, 24, [0, 0, 10]);
  assert.ok(enhanced.feet[2] > 0.01, `enhanced: on its way while it turns (z ${enhanced.feet[2]})`);
});
