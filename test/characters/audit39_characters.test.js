// AUDIT 39 - THE CHARACTERS BATCH. Four motor/spawn laws the audit
// read on both sides of the port and confirmed diverged:
//
//   #69  stopDistance is per-TARGET (2.25 player / 1.5 other AI),
//        set by TakeAction ahead of GetDestination
//   #70  a dungeon marker's Passive action byte reaches IsHostile
//   #71  LiveSpeed is re-read every pass, not captured at spawn
//   #72  CanAct carries no hostility term - a pacified foe with a
//        FOE target still pursues
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EnemyAI, MELEE_DISTANCE, CLASSIC_MELEE_DISTANCE_VS_AI, enemyMoveSpeed, CLASSIC_UPDATE_INTERVAL,
} from '../../src/characters/enemy/enemyMotor.js';
import { EnemyAttack, ATTACK_SPEED_FLOOR } from '../../src/characters/enemy/enemyAttack.js';
import { collectDungeonEnemies } from '../../src/characters/dungeonEnemies.js';
import { liveStat } from '../../src/systems/statMods.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const clearCollider = () => ({
  raycast: () => Infinity,
  capsuleCast: () => ({ dist: Infinity, key: null }),
  move: () => ({ grounded: true }),
});

// ---------------------------------------------------------------
// #69 - EnemyMotor.TakeAction (:443-449):
//   if (senses.Target == PlayerEntityBehaviour) stopDistance = attack.MeleeDistance;
//   else stopDistance = attack.ClassicMeleeDistanceVsAI;
// consumed by the approach test (:487) and the search ramp (:552).
// The port held the 2.25 literal at both, so an infighting foe halted
// 0.75 outside the 1.5 reach enemyAttack.js already gates its swing on
// - a permanent stand-off.
// ---------------------------------------------------------------
/** A foe set up to run _classicTick directly against one target. */
const mkTicker = (target) => {
  const ai = new EnemyAI(clearCollider(), [0, 0, 0], 0, { liveSpeed: 50 });
  ai.detected = true;
  ai.inSight = true;
  ai.giveUpTimer = 200;
  ai._armedTargeting = target !== null;
  ai.target = target;
  ai.lastKnownTargetPos = [0, 0, 2];
  ai.predictedTargetPos = ai.lastKnownTargetPos;
  return ai;
};

test('audit39 #69: stopDistance is the TARGET\'s, and the vs-AI value lets the swing land', () => {
  // 2.0 apart: inside the player stop (2.25), outside the vs-AI one (1.5)
  const vsPlayer = mkTicker({ isPlayer: true });
  vsPlayer._dist = 2.0;
  vsPlayer._classicTick([0, 0, 2]);
  assert.equal(vsPlayer.stopDistance, MELEE_DISTANCE, 'the player arm takes MeleeDistance');
  assert.equal(vsPlayer.moving, false, 'and 2.0 is inside it - the foe stops');

  const vsFoe = mkTicker({ isPlayer: false, ai: {} });
  vsFoe._dist = 2.0;
  vsFoe._classicTick([0, 0, 2]);
  assert.equal(vsFoe.stopDistance, CLASSIC_MELEE_DISTANCE_VS_AI, 'a foe target takes ClassicMeleeDistanceVsAI');
  assert.equal(vsFoe.moving, true, 'so it keeps closing - the old 2.25 froze it outside its own reach');

  // ...and inside 1.5 it stops there too
  vsFoe._dist = 1.4;
  vsFoe._classicTick([0, 0, 1.4]);
  assert.equal(vsFoe.moving, false, 'stopping at 1.5, where enemyAttack.js:"if (dist > (vsAI ? CLASSIC_MELEE_DISTANCE_VS_AI : MELEE_DISTANCE))" lets the swing land');

  // UNARMED (no targeting context) is the player value, unchanged
  const legacy = mkTicker(null);
  legacy._dist = 2.0;
  legacy._classicTick([0, 0, 2]);
  assert.equal(legacy.stopDistance, MELEE_DISTANCE, 'the player-only path is untouched');
});

test('audit39 #69: GetDestination\'s search ramp reads the same stopDistance (:552)', () => {
  const ai = mkTicker({ isPlayer: false, ai: {} });
  ai.inSight = false;                 // force the SEARCH arm of GetDestination
  ai.predictedTargetPos = null;
  ai.lastKnownTargetPos = [0, 0, 1.2];
  ai.lastPositionDiff = [0, 0, 1];
  ai.stopDistance = CLASSIC_MELEE_DISTANCE_VS_AI;
  ai.searchMult = 0;
  ai._getDestination([0, 0, 1.2]);
  assert.equal(ai.searchMult, 1, 'a search position 1.2 out is inside 1.5 - the ramp climbs');
  ai.stopDistance = CLASSIC_MELEE_DISTANCE_VS_AI;
  ai.searchMult = 0;
  ai.lastKnownTargetPos = [0, 0, 2.0];
  ai._getDestination([0, 0, 2.0]);
  assert.equal(ai.searchMult, 0, '...and 2.0 out is not, where the 2.25 literal would have climbed');
});

// ---------------------------------------------------------------
// #70 - RDBLayout.AddEnemy (:1519-1521) reads the flat's Action byte
// and hands MobileReactions.Passive down to EnemyMotor.Start (:122)
// `IsHostile = mobile.Enemy.Reactions == MobileReactions.Hostile`.
// collectDungeonEnemies minted the field and no spawner read it.
// ---------------------------------------------------------------
test('audit39 #70: a Passive dungeon marker spawns a non-hostile foe', () => {
  const mk = (actionByte) => ({
    record: 16, factionOrMobileId: 10, action: 0, actionByte,
    x: 0, y: 0, z: 0, rawY: 0, flags: 0, soundIndex: 0,
  });
  const blocks = [{ originX: 0, originZ: 0, waterLevel: 10000, markers: [mk(99), mk(0)] }];
  const out = collectDungeonEnemies(blocks, { locationId: 1, dungeonType: 0, playerLevel: 1, alternate: false });
  assert.equal(out.length, 2);
  assert.equal(out[0].reaction, 'passive', 'action byte 99 is EnemyReactionTypes.Passive');
  assert.equal(out[1].reaction, 'hostile');

  // the seam the finding says was dead: the motor takes it as an option
  assert.equal(new EnemyAI(clearCollider(), [0, 0, 0], 0, { isHostile: out[0].reaction !== 'passive' }).isHostile, false);
  assert.equal(new EnemyAI(clearCollider(), [0, 0, 0], 0, { isHostile: out[1].reaction !== 'passive' }).isHostile, true);
  assert.equal(new EnemyAI(clearCollider(), [0, 0, 0], 0).isHostile, true, 'no option = hostile, as every other caller expects');

});

// ---------------------------------------------------------------
// #71 - EnemyMotor.TakeAction (:432) re-derives moveSpeed from
// entity.Stats.LiveSpeed every FixedUpdate, and EnemyAttack.FixedUpdate
// (:69-72) re-reads it too, under the source's own note that the floor
// exists "so Drain Speed does not prevent attack ever firing". Both
// were captured once at spawn here.
// ---------------------------------------------------------------
test('audit39 #71: move speed and attack cadence read LiveSpeed through, so a Drain bites', () => {
  const entity = { stats: { speed: 70 }, activeEffects: [] };
  const ai = new EnemyAI(clearCollider(), [0, 0, 0], 0, { liveSpeed: () => liveStat(entity, 'speed') });
  const attack = new EnemyAttack({ liveSpeed: () => liveStat(entity, 'speed') });
  assert.equal(ai.speed, enemyMoveSpeed(70));
  assert.equal(attack.liveSpeed, 70);
  entity.activeEffects.push({ kind: 'drainAttribute', stat: 'speed', magnitude: 40 });
  assert.equal(liveStat(entity, 'speed'), 30);
  assert.equal(ai.speed, enemyMoveSpeed(30), 'the drained foe walks slower');
  assert.equal(attack.liveSpeed, 30, 'and swings on the drained cadence');
  // the speed FLOOR still belongs to the attack roll, not the read
  entity.activeEffects[0].magnitude = 70;
  assert.equal(attack.liveSpeed, 0);
  assert.equal(ATTACK_SPEED_FLOOR, 8, 'attackRollPasses floors it, per EnemyAttack.cs:71-73');
  // a plain number still works - every headless caller passes one
  const flat = new EnemyAI(clearCollider(), [0, 0, 0], 0, { liveSpeed: 50 });
  assert.equal(flat.speed, enemyMoveSpeed(50));
  // and all three pools hand over the thunk
  for (const p of ['src/scenes/dungeonContext.js', 'src/scenes/cityGuards.js', 'src/scenes/exteriorFoes.js']) {
    assert.ok(rd(p).includes("liveSpeed: () => liveStat(entity, 'speed')"), `${p} passes the live read`);
    assert.ok(!rd(p).includes('liveSpeed: entity.liveSpeed'), `${p} keeps no spawn snapshot`);
  }
});

// ---------------------------------------------------------------
// #72 - `grep -n IsHostile Game/EnemyMotor.cs` finds writes at :122
// and :206 and NO read: CanAct carries no hostility term. A pacified
// foe stops because EnemySenses:321-327 drops the PLAYER as its target
// and HandleNoAction (:359) then sees `Target == null` - a FOE target
// survives that drop, which is this module's own documented exception.
// ---------------------------------------------------------------
test('audit39 #72: a pacified foe with a FOE target still acts; one without still stands down', () => {
  const senses = { gameMinutes: 0, playerStealth: 0, rolls: () => 0.5 };
  const mauler = { isPlayer: false, ai: { feet: [0, 0, 2], height: 1.8 } };

  const pacified = new EnemyAI(clearCollider(), [0, 0, 0], 0, { liveSpeed: 50 });
  pacified._classicSenses = () => {}; pacified._senses = () => {};
  pacified.isHostile = false;
  pacified.detected = true;
  pacified.giveUpTimer = 200;
  pacified.inSight = true;
  pacified.lastKnownTargetPos = [0, 0, 2];
  pacified.predictedTargetPos = pacified.lastKnownTargetPos;
  pacified.target = mauler;
  pacified._armedTargeting = true;
  pacified.update(1 / 60, [0, 0, 20], { ...senses, targeting: () => {} });
  assert.equal(pacified.canAct, true, 'CanAct has no hostility term (EnemyMotor.cs FixedUpdate :155-176)');

  // ...and with no foe target it is DFU's `Target == null` after all
  const alone = new EnemyAI(clearCollider(), [0, 0, 0], 0, { liveSpeed: 50 });
  alone._classicSenses = () => {}; alone._senses = () => {};
  alone.isHostile = false;
  alone.detected = true;
  alone.giveUpTimer = 200;
  alone.lastKnownTargetPos = [0, 0, 2];
  alone.predictedTargetPos = alone.lastKnownTargetPos;
  alone.update(1 / 60, [0, 0, 2], senses);
  assert.equal(alone.canAct, false, 'no target, no action - HandleNoAction :357-366');
  assert.equal(alone.moving, false);

});

// ---------------------------------------------------------------
// #75 - all 25 designs name a hairstyle and a hair colour, pieces/hair.js
// builds exactly those, and the viewer's applyVillagerHair reads
// D.hair[race][style] / D.hairRamps / v.hair - but the PAYLOAD emitted
// none of the three, so every figure in the editor was bald.
// ---------------------------------------------------------------
test('audit39 #75: the payload ships the hair the designs ask for', async () => {
  const { buildPaperdollPayload } = await import('../../src/characters/paperdoll/paperdollPayload.js');
  const { VILLAGER_DESIGNS } = await import('../../src/characters/villagerDesigns.js');
  const { HAIR_RAMPS } = await import('../../src/characters/pieces/hair.js');
  const D = buildPaperdollPayload(null, null, null);
  assert.deepEqual(Object.keys(D.hairRamps), Object.keys(HAIR_RAMPS), 'the three colours the designs name');
  assert.deepEqual(Object.keys(D.hair).sort(), ['Elf', 'Human'], 'hair.js grows hair on these races only');
  for (const R of Object.keys(D.hair)) {
    for (const [st, pack] of Object.entries(D.hair[R])) {
      assert.ok(pack.P.length > 0, `${R}/${st} is real geometry`);
      assert.equal(pack.P.length / 12, pack.C.length / 3, `${R}/${st} packs one colour per face`);
    }
  }
  // every authored style resolves - the viewer indexOf()s it by name,
  // and a miss silently leaves the previous villager's hair on
  const styles = Object.keys(D.hair.Human);
  for (const d of VILLAGER_DESIGNS) {
    assert.ok(styles.includes(d.hair.style), `${d.archive} ${d.name}: style "${d.hair.style}" has no pack`);
    assert.ok(D.hairRamps[d.hair.ramp], `${d.archive} ${d.name}: ramp "${d.hair.ramp}" is not shipped`);
  }
  assert.equal(D.villagers.length, VILLAGER_DESIGNS.length);
  for (let i = 0; i < D.villagers.length; i++) {
    assert.deepEqual(D.villagers[i].hair, VILLAGER_DESIGNS[i].hair, 'the pack carries the design\'s hair');
  }
});

// ---------------------------------------------------------------
// AUDIT 39r (R14/R15) - #72 narrowed the hostility gate at CanAct, at
// the `moving = false` sweep and inside _senses, and left two holes.
//
//   R14  _handleNoAction still keyed its first arm on `!isHostile`
//        alone. DFU's is `senses.Target == null` (EnemyMotor.cs:359),
//        no hostility term - so the pacified foe #72 freed to pursue
//        had its search ramp zeroed underneath it on every step.
//   R15  the foeTarget term was read BEFORE `_armedTargeting` was
//        assigned and before the target machine ran, i.e. against the
//        previous step's targeting state - so the step on which a foe
//        target is first acquired still froze, and a foe's first
//        armed step could not take the exception at all.
// ---------------------------------------------------------------

/** A pacified foe in an armed pool, mid-fight but with no target yet -
 *  the state a real host hands one (nothing pre-seeds ai.target). */
const mkPacified = () => {
  const ai = new EnemyAI(clearCollider(), [0, 0, 0], 0, { liveSpeed: 50 });
  ai._classicSenses = () => {};
  ai._senses = () => {};
  ai.isHostile = false;
  ai.detected = true;
  ai.inSight = true;
  ai.giveUpTimer = 200;
  ai.lastKnownTargetPos = [0, 0, 8];
  ai.predictedTargetPos = ai.lastKnownTargetPos;
  return ai;
};

test('audit39r R15: the foe-target exception reads THIS step\'s target machine', () => {
  const senses = { gameMinutes: 0, playerStealth: 0, rolls: () => 0.5 };
  const mauler = { isPlayer: false, ai: { feet: [0, 0, 8], height: 1.8 } };
  const pacified = mkPacified();
  assert.equal(pacified.target, null, 'the host seeds no target - the machine picks one');
  assert.equal(pacified._armedTargeting, false);
  // arm the classic tick so the target machine runs on THIS step
  pacified._classicTimer = CLASSIC_UPDATE_INTERVAL;
  pacified._step(1 / 60, [0, 0, 20], { ...senses, targeting: (ai) => { ai.target = mauler; } });
  assert.equal(pacified.target, mauler, 'the machine acquired it this step');
  assert.equal(pacified.canAct, true,
    'CanAct is decided after the machine, on the freshly resolved senses - not one step late');
  assert.equal(pacified.moving, true, 'and it pursues on the step it acquires, as DFU\'s motor does');
});

test('audit39r R14: HandleNoAction\'s first arm is Target == null, not !IsHostile', () => {
  const senses = { gameMinutes: 0, playerStealth: 0, rolls: () => 0.5 };
  const mauler = { isPlayer: false, ai: { feet: [0, 0, 8], height: 1.8 } };
  const pacified = mkPacified();
  pacified.target = mauler;
  pacified._armedTargeting = true;
  pacified.searchMult = 7;                     // a ramp built over earlier steps
  pacified._step(1 / 60, [0, 0, 20], { ...senses, targeting: () => {} });
  assert.ok(pacified.searchMult > 0,
    'a live FOE target is not `Target == null` - the ramp survives (EnemyMotor.cs:357-366)');

  // ...and the arm still fires for a pacified foe with NO target
  const alone = mkPacified();
  alone.searchMult = 7;
  alone._step(1 / 60, [0, 0, 20], senses);
  assert.equal(alone.searchMult, 0, 'no target, ramp reset - the arm is intact');
});
