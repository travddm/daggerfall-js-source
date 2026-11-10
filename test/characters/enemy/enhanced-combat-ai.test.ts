// DFU's Enhanced Combat AI setting, the setting and the senses (EnemySenses.cs, EnemyAttack.MeleeAnimation): the field
// of view, the lead on the target, the rate of approach and the runner-up target, each against the classic path.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srand } from '../../../src/formats/dfRandom.js';
import {
  ENHANCED_FIELD_OF_VIEW,
  enhancedCombatAIEnabled,
  trackRateOfApproach,
  type ApproachTracker,
  type EnhancedCombatAIFields,
} from '../../../src/characters/enemy/enhanced-combat-ai.ts';
import { tierOf } from '../../../src/systems/settings/settings.js';
import { onlineForcedSetting } from '../../../src/systems/online/onlineLane.js';
import { profileKeyOf } from '../../../src/net/profile/profileKeys.ts';

// The motor, its attack and its targeting are loaded by a computed path, which tsconfig.node.json does not follow: their imports
// reach src/player/motor.js and src/net, which name the DOM's crypto types (CryptoKey, SubtleCrypto), and the node
// config has no DOM library.
const MOTOR_PATH: string = '../../../src/characters/enemy/enemyMotor.js';
const TARGETS_PATH: string = '../../../src/characters/enemy/enemyTargets.js';
const ATTACK_PATH: string = '../../../src/characters/enemy/enemyAttack.js';
const { EnemyAI, FIELD_OF_VIEW } = await import(MOTOR_PATH);
const { getTargets } = await import(TARGETS_PATH);
const { EnemyAttack } = await import(ATTACK_PATH);

const DEG = Math.PI / 180;
const clearCollider = () => ({
  raycast: () => Infinity,
  capsuleCast: () => ({ dist: Infinity, key: null }),
  move: () => ({ grounded: true }),
});
const senses = () => ({ gameMinutes: 0, playerStealth: 0, rolls: () => 0.5 });
const withSetting = (reader: () => boolean, more: Record<string, unknown> = {}) => ({
  ...more,
  enhancedCombatAI: reader,
});
const fields = (ai: object) => ai as unknown as EnhancedCombatAIFields;
const foe = (on: boolean) =>
  new EnemyAI(
    clearCollider(),
    [0, 0, 0],
    0,
    withSetting(() => on),
  );

test('the setting: DFU default True, live, and pinned online at DFU value by the server profile', () => {
  assert.equal(enhancedCombatAIEnabled(), true, 'defaults.ini [Enhancements] EnhancedCombatAI = True');
  assert.equal(tierOf('Enhancements/EnhancedCombatAI'), 'live');
  const key = profileKeyOf('combat.enhancedAI');
  assert.deepEqual([key?.dfu, key?.online, key?.setting], [true, true, 'Enhancements.EnhancedCombatAI']);
  assert.equal(onlineForcedSetting('Enhancements', 'EnhancedCombatAI', '?online'), 'True');
  assert.equal(onlineForcedSetting('Enhancements', 'EnhancedCombatAI', ''), undefined, 'offline the player decides');
});

test('a bare EnemyAI runs the classic path; the pools pass a reader the foe follows step by step', () => {
  assert.equal(new EnemyAI(clearCollider(), [0, 0, 0], 0).enhancedCombatAI, false);
  let on = false;
  const ai = new EnemyAI(
    clearCollider(),
    [0, 0, 0],
    0,
    withSetting(() => on),
  );
  on = true;
  ai.update(1 / 60, [0, 0, 10], senses());
  assert.equal(ai.enhancedCombatAI, true);
  assert.equal(
    fields(ai).fieldOfView,
    FIELD_OF_VIEW,
    'EnemySenses.Start reads the field of view once, when the foe is made',
  );
});

test('EnemySenses.Start: 190 degrees on, 180 off - a target 92 degrees off the facing is seen only with the setting on', () => {
  assert.equal(ENHANCED_FIELD_OF_VIEW, 190);
  const at = [10 * Math.sin(92 * DEG), 0, 10 * Math.cos(92 * DEG)];
  const off = foe(false);
  const on = foe(true);
  off.update(1 / 60, at, senses());
  on.update(1 / 60, at, senses());
  assert.equal(off.inSight, false, 'outside 90 degrees either side');
  assert.equal(on.inSight, true, 'inside 95 degrees either side');
});

/** A target walking +x across the foe's front at 4 m/s, 10 m ahead, for `steps` fixed steps. */
function chase(ai: { update(dt: number, at: number[], senses: object): void }, steps: number): number[] {
  let feet = [0, 0, 10];
  for (let i = 0; i < steps; i++) {
    feet = [feet[0] + 4 / 60, 0, 10];
    ai.update(1 / 60, feet, senses());
  }
  return feet;
}

test('EnemySenses.Update :475/:497: the enhanced foe leads a moving target; the classic foe heads for where it saw it', () => {
  const off = foe(false);
  chase(off, 30);
  assert.deepEqual(
    off.predictedTargetPos,
    off.lastKnownTargetPos,
    'classic: the prediction is the last known position',
  );
  const on = foe(true);
  const feet = chase(on, 30);
  assert.ok(
    on.predictedTargetPos[0] > feet[0] + 0.1,
    `the lead runs ahead of the target (${on.predictedTargetPos[0]} vs ${feet[0]})`,
  );
  assert.ok(Math.abs(on.predictedTargetPos[1]) < 1e-6, 'kept in feet space');
});

test('EnemySenses.Update :353-370: the rate of approach is the closing distance per classic update, 0 when off', () => {
  const tracker = (on: boolean): ApproachTracker => ({
    enhancedCombatAI: on,
    targetRateOfApproach: 0,
    _lastDistanceToTarget: 0,
    _approachTarget: null,
  });
  const on = tracker(true);
  trackRateOfApproach(on, 'p', 5);
  assert.equal(on.targetRateOfApproach, 0, 'a new target starts at 0');
  trackRateOfApproach(on, 'p', 4.75);
  assert.equal(on.targetRateOfApproach, 0.25);
  trackRateOfApproach(on, 'q', 3);
  assert.equal(on.targetRateOfApproach, 0, 'another target resets it');
  trackRateOfApproach(on, null, 3);
  assert.equal(on._lastDistanceToTarget, 0, 'no target resets the last distance');
  trackRateOfApproach(on, 'q', Infinity);
  assert.equal(on._lastDistanceToTarget, 0, 'an unmeasured distance reads as DFU field default, 0');
  const off = tracker(false);
  trackRateOfApproach(off, 'p', 5);
  trackRateOfApproach(off, 'p', 4);
  assert.equal(off.targetRateOfApproach, 0);

  const walker = (enhanced: boolean) => {
    const ai = foe(enhanced);
    for (let i = 0; i < 20; i++) ai.update(1 / 60, [0, 0, 10 - i * 0.1], senses());
    return fields(ai).targetRateOfApproach;
  };
  assert.ok(walker(true) > 0, 'a target walking in closes the distance');
  assert.equal(walker(false), 0);
});

/** EnemyAttack against a fake senses state at `dist`, closing at `rate`; true when a swing starts in 100 classic updates. */
function swings(ai: Record<string, unknown>, dist: number): boolean {
  srand(12345);
  const atk = new EnemyAttack({ liveSpeed: 50 });
  Object.assign(ai, { _dist: dist, inSight: true, yaw: 0, feet: [0, 0, 0], lastKnownTargetPos: [0, 0, dist] });
  for (let i = 0; i < 100; i++) {
    atk.update(0.0625, ai, [0, 0, dist]);
    if (atk.machine.state !== 'Idle') return true;
  }
  return false;
}

test('EnemyAttack.MeleeAnimation :159-164: the reach adds the rate of approach, and is 2.25 against a foe target when on', () => {
  assert.equal(swings({ enhancedCombatAI: true, targetRateOfApproach: 0.25 }, 2.4), true, '2.4 <= 2.25 + 0.25');
  assert.equal(swings({ enhancedCombatAI: true, targetRateOfApproach: 0 }, 2.4), false);
  const foeTarget = { _armedTargeting: true, target: { isPlayer: false } };
  assert.equal(swings({ ...foeTarget, enhancedCombatAI: false }, 2.0), false, 'classic: ClassicMeleeDistanceVsAI 1.5');
  assert.equal(
    swings({ ...foeTarget, enhancedCombatAI: true }, 2.0),
    true,
    'enhanced: MeleeDistance 2.25 for every target',
  );
});

test('EnemySenses.GetTargets :868-872: the enhanced AI keeps the runner-up target; the classic AI does not', () => {
  const col = clearCollider();
  const body = (feet: number[], team: string, on = false) => {
    const ai = Object.assign(
      new EnemyAI(
        col,
        feet,
        0,
        withSetting(() => on, { liveSpeed: 50, height: 1.8, centreOffset: 0.9 }),
      ),
      { wouldBeSpawned: true },
    );
    return { ai, entity: { team } };
  };
  const near = body([0, 0, 3], 'Bears');
  const far = body([0, 0, 8], 'Bears');
  const on = getTargets(body([0, 0, 0], 'Orcs', true), [near, far], [0, 0, 60], { infighting: true });
  assert.equal(on.target, near);
  assert.equal(on.secondaryTarget, far);
  const off = getTargets(body([0, 0, 0], 'Orcs', false), [near, far], [0, 0, 60], { infighting: true });
  assert.equal(off.target, near);
  assert.equal(off.secondaryTarget, null);
});
