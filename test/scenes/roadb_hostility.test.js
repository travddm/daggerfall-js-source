// ROAD-B (b2-hostility-model) - MakeEnemiesHostile IS A REAL STATE.
//
// GameManager.cs:790-806 is one boolean over the active enemy
// database, and every one of its six DFU call sites is a place the
// world turns on you. The port had ONE of them - the quest action -
// and it walked a private copy of the law over the two exterior pools
// only, calling MakeEnemyHostileToAttacker on each foe it flipped
// (which GameManager does not do). The DoorText trespass check logged
// a warning; the castle door-bash tail was "routed"; the struck
// passive foe turned alone; and EnemySenses' castle gate was declared
// inert on a claim that two later waves had falsified.
//
// Everything here fails on a revert of the wiring, not just of the
// law module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnemiesHostile } from '../../src/scenes/hostCombat.js';
import { ActionSystem } from '../../src/world/actionSystem.js';
import { ACTION_FLAGS, TRIGGER_FLAGS } from '../../src/world/rdbLayout.js';
import { sensesContext } from '../../src/scenes/shared.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const CUBE = { positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], indices: [0, 1, 2, 0, 2, 3] };
const stubCollider = () => ({ addMesh: () => {}, removeBucket: () => {}, removeMesh: () => {} });
const act = (over = {}) => ({
  actionFlag: ACTION_FLAGS.None, triggerFlag: TRIGGER_FLAGS.None,
  index: 0, magnitude: 0, axisRaw: 0, isFlat: false, nextObject: -1,
  duration: 0, rotation: { x: 0, y: 0, z: 0 }, translation: { x: 0, y: 0, z: 0 },
  ...over,
});
const foe = (over = {}) => ({ dead: false, ai: { isHostile: false }, ...over });

// ---------------------------------------------------------------
// GameManager.MakeEnemiesHostile (GameManager.cs:790-806)
// ---------------------------------------------------------------

test('ROAD-B: MakeEnemiesHostile flips every live enemy and writes ONE field', () => {
  const a = foe(), b = foe(), c = foe({ ai: { isHostile: true } });
  assert.equal(makeEnemiesHostile([a, b, c]), 2, 'the two that were not hostile');
  assert.equal(a.ai.isHostile, true);
  assert.equal(b.ai.isHostile, true);
  assert.equal(c.ai.isHostile, true);
  // ...and NOTHING else. MakeEnemyHostileToAttacker is a separate law
  // DFU calls separately (DaggerfallEntityBehaviour.cs:250-261): no
  // target, no giveUpTimer, no remembered position handed out here.
  assert.deepEqual(Object.keys(a.ai), ['isHostile']);
});

test('ROAD-B: a dead record and a record with no motor yet are not in the database', () => {
  const dead = foe({ dead: true });
  const spawning = { dead: false };          // cityGuards' two awaits: no ai yet
  assert.equal(makeEnemiesHostile([dead, spawning, null, undefined]), 0);
  assert.equal(dead.ai.isHostile, false, 'EnemyDeath destroyed the GameObject');
  assert.equal(makeEnemiesHostile(null), 0, 'no pool at all is not a throw');
});

// ---------------------------------------------------------------
// DaggerfallActionDoor.AttemptBash's tail (:220-221)
// ---------------------------------------------------------------

test('ROAD-B: bashing a door inside a dungeon CASTLE turns the castle hostile - on every arm', () => {
  let castle = false;
  let calls = 0;
  const a = new ActionSystem(stubCollider(), { insideDungeonCastle: () => castle });
  a.onMakeEnemiesHostile = () => { calls++; };
  const door = a.addDoor(CUBE, I, { positionKey: 30, action: act({ triggerFlag: TRIGGER_FLAGS.Door }), startingLockValue: 0x0e });

  // Outside a castle the tail never fires, however the bash goes.
  assert.equal(a.attemptBash(door, 0.99), false, 'lock 14, chance 6, roll 99: a miss');
  assert.equal(calls, 0);

  castle = true;
  // A FAILED bash still calls it - the tail sits after all three arms
  // and outside every one of their returns.
  assert.equal(a.attemptBash(door, 0.99), false);
  assert.equal(calls, 1, 'taking the swing is what turns the castle, not landing it');
  // A MAGICALLY HELD door: DFU falls out of the else-if and still
  // reaches the tail. This is the arm the port's early `return false`
  // would have eaten.
  door.currentLockValue = 20;
  assert.equal(a.attemptBash(door, 0.0), false, 'magically held: never bashes open');
  assert.equal(calls, 2);
  // A door that BURSTS.
  door.currentLockValue = 0x0e;
  assert.equal(a.attemptBash(door, 0.05), true);
  assert.equal(calls, 3);
  // ...and a bash-close of the now-open door.
  for (let i = 0; i < 200; i++) a.update(1.5 / 90);
  assert.equal(a.attemptBash(door, 0.99), true, 'an open door bash-closes');
  assert.equal(calls, 4);
});

test('ROAD-B: byPlayer gates the tail (EnemyAttack.cs:210 bashes with false)', () => {
  let calls = 0;
  const a = new ActionSystem(stubCollider(), { insideDungeonCastle: () => true });
  a.onMakeEnemiesHostile = () => { calls++; };
  const door = a.addDoor(CUBE, I, { positionKey: 31, action: act({ triggerFlag: TRIGGER_FLAGS.Door }), startingLockValue: 0 });
  a.attemptBash(door, 0.99, { byPlayer: false });
  assert.equal(calls, 0, 'a FOE bashing a castle door does not raise the castle');
  a.attemptBash(door, 0.99);
  assert.equal(calls, 1, 'and the default caller IS the player swing');
});

test('ROAD-B: a SPECIAL door is refused before the tail, as it is before the sound', () => {
  let calls = 0, bashes = 0;
  const a = new ActionSystem(stubCollider(), { insideDungeonCastle: () => true });
  a.onMakeEnemiesHostile = () => { calls++; };
  a.onDoorBash = () => { bashes++; };
  const secret = a.addSpecialDoor(0, 32, CUBE, I, act({ actionFlag: ACTION_FLAGS.OpenDoor }));
  assert.equal(secret.special, true);
  assert.equal(a.attemptBash(secret, 0.0), false);
  assert.equal(bashes, 0, 'there is no door to hear');
  assert.equal(calls, 0, 'and none to raise the castle over');
});

test('ROAD-B: a host that passes no castle read never fires the tail', () => {
  let calls = 0;
  const a = new ActionSystem(stubCollider());   // an interior host: no dep
  a.onMakeEnemiesHostile = () => { calls++; };
  const door = a.addDoor(CUBE, I, { positionKey: 33, action: act({ triggerFlag: TRIGGER_FLAGS.Door }), startingLockValue: 0 });
  a.attemptBash(door, 0.99);
  assert.equal(calls, 0, 'a building interior is not a dungeon castle');
});

// ---------------------------------------------------------------
// DaggerfallAction's DoorText trespass check (:882-890)
// ---------------------------------------------------------------

test('ROAD-B: the DoorText trespass check reaches a real sink, not a console warning', () => {
  const a = new ActionSystem(stubCollider());
  let tres = 0, texts = 0;
  a.onTrespass = () => { tres++; };
  a.onDoorText = () => { texts++; };
  // axisRaw > 5 is classic's trespass flag; index 7 keeps textId
  // (7700 + index) off TYPE_99_TEXT_INDEX and out of the skip set, so
  // the first activation takes the TEXT arm.
  const o = a.addRelay(0, 40, act({ actionFlag: ACTION_FLAGS.DoorText, axisRaw: 9, index: 7, triggerFlag: TRIGGER_FLAGS.Direct }));
  a.receive(o, 'Direct');
  assert.equal(texts, 1, 'first activation shows the door text');
  assert.equal(tres, 0);
  a.receive(o, 'Direct');
  assert.equal(tres, 1, 'and every later one runs the trespass check');
  // axisRaw <= 5 is not a trespass door at all.
  const plain = a.addRelay(0, 41, act({ actionFlag: ACTION_FLAGS.DoorText, axisRaw: 5, index: 7, triggerFlag: TRIGGER_FLAGS.Direct }));
  a.receive(plain, 'Direct');
  a.receive(plain, 'Direct');
  assert.equal(tres, 1);
});

// ---------------------------------------------------------------
// EnemySenses.StealthCheck's castle gate (:619-621)
// ---------------------------------------------------------------

test('ROAD-B: sensesContext carries IsPlayerInsideDungeonCastle, defaulting false', () => {
  const entity = { skills: {}, level: 1 };
  assert.equal(sensesContext(entity, 10).insideDungeonCastle, false);
  assert.equal(sensesContext(entity, 10, { insideDungeonCastle: true }).insideDungeonCastle, true);
});

test('ROAD-B: a non-hostile enemy in a castle never stealth-detects, and MakeEnemiesHostile is what changes that', async () => {
  const { EnemyAI } = await import('../../src/characters/enemy/enemyMotor.js');
  const collider = { raycast: () => Infinity, moveCapsule: (p) => ({ pos: p, grounded: true }) };
  const entity = { skills: {}, level: 1 };
  // A foe that has met the player and is watching one who is NOT
  // creeping takes StealthCheck's outright-detect arm (:641-646), so
  // the only thing that can answer false is the castle gate above it.
  const stand = (hostile) => {
    const ai = new EnemyAI(collider, [0, 0, 0], 0, { isHostile: hostile });
    ai.wouldBeSpawned = true;
    ai._dist = 4;
    ai.hasEncounteredPlayer = true;
    return { dead: false, ai };
  };
  const ctx = (castle) => sensesContext(entity, 7, { movingLessThanHalfSpeed: false, insideDungeonCastle: castle });

  const guard = stand(false);
  assert.equal(guard.ai._stealthCheck(ctx(true)), false, 'the palace guard ignores you');
  assert.equal(stand(true).ai._stealthCheck(ctx(true)), true, 'a HOSTILE one in the same castle sees you');
  assert.equal(stand(false).ai._stealthCheck(ctx(false)), true, 'and the gate is a CASTLE gate, not a passive-foe gate');

  // The trespass door / the castle bash / a struck passive foe: one
  // boolean, and the gate opens on the guard already standing there.
  makeEnemiesHostile([guard]);
  guard.ai._lastStealthMinute = -1;
  assert.equal(guard.ai._stealthCheck(ctx(true)), true,
    'once the castle is hostile the gate is gone and the ordinary check runs');
});

// ---------------------------------------------------------------
// THE WIRING - each of these fails on a revert of its host hunk.
// ---------------------------------------------------------------

