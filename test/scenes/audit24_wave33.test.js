// AUDIT 24, wave 33: a paralysed enemy is not a photograph - the
// FreezeAnims dead store, and the damage frame it was hiding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MobileUnit, PRIMARY_ATTACK_ANIM_SPEED } from '../../src/characters/mobile/mobileUnit.js';
import { dfuFile } from '../dfuRoot.mjs';   // PY1: DFU_PATH, then the in-tree sparse clone

const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const MOTOR_CS = dfuFile('Assets/Scripts/Game/EnemyMotor.cs');
const ATTACK_CS = dfuFile('Assets/Scripts/Game/EnemyAttack.cs');
const DMU_CS = dfuFile('Assets/Scripts/Internal/DaggerfallMobileUnit.cs');
const MU_CS = dfuFile('Assets/Scripts/Internal/Base/MobileUnit.cs');
const noDfu = ![MOTOR_CS, ATTACK_CS, DMU_CS, MU_CS].every((u) => existsSync(u));

const BASICS = { hasIdle: true, primaryAttackAnimFrames: [0, 1, -1, 2] };

test('audit24 wave33: the damage marker is a LATCH, and only the consumer clears it', () => {
  // DaggerfallMobileUnit's AnimateEnemy sets doMeleeDamage at the -1 marker
  // (:555-560) and the ONLY writer of false anywhere in the tree is
  // EnemyAttack.Update:100, after it has run MeleeDamage. The port cleared
  // both flags at the top of every update, which made them per-frame edges.
  const m = new MobileUnit(4, BASICS, () => 8, () => 0.99);
  m.update(1 / 60, { striking: true }, 0, [0, 0, 0], [0, 0, 5]);
  assert.equal(m.state, 'attack');
  assert.equal(m.doMeleeDamage, false, 'not yet - frame 0 is not the marker');

  // step to the -1
  let armed = false;
  for (let i = 0; i < 6 && !armed; i++) {
    m.update(1 / PRIMARY_ATTACK_ANIM_SPEED, {}, 0, [0, 0, 0], [0, 0, 5]);
    armed = m.doMeleeDamage;
  }
  assert.equal(armed, true, 'the -1 marker armed it');

  // ...and it STAYS armed across every later update, however many
  for (let i = 0; i < 20; i++) m.update(1 / PRIMARY_ATTACK_ANIM_SPEED, {}, 0, [0, 0, 0], [0, 0, 5]);
  assert.equal(m.doMeleeDamage, true, 'a swing that reached its damage frame does not evaporate');
  m.doMeleeDamage = false;
  m.update(1 / PRIMARY_ATTACK_ANIM_SPEED, {}, 0, [0, 0, 0], [0, 0, 5]);
  assert.equal(m.doMeleeDamage, false, 'and the consumer\'s clear sticks');
});

test('audit24 wave33: the ranged marker latches the same way, on its own flag', () => {
  const basics = { hasIdle: true, primaryAttackAnimFrames: [0], rangedAttackAnimFrames: [3, 2, -1, 1] };
  const m = new MobileUnit(135, basics, () => 8, () => 0.5);
  m.update(1 / 60, { rangedStriking: true }, 0, [0, 0, 0], [0, 0, 5]);
  assert.equal(m.state, 'ranged');
  let armed = false;
  for (let i = 0; i < 6 && !armed; i++) {
    m.update(1 / 10, {}, 0, [0, 0, 0], [0, 0, 5]);
    armed = m.shootArrow;
  }
  assert.equal(armed, true);
  assert.equal(m.doMeleeDamage, false, 'the ranged -1 is a SHOOT marker, not melee');
  for (let i = 0; i < 20; i++) m.update(1 / 10, {}, 0, [0, 0, 0], [0, 0, 5]);
  assert.equal(m.shootArrow, true, 'latched');
});

test('audit24 wave33: the C# dead store is real, and nothing else freezes a paralysed sprite', { skip: noDfu }, () => {
  // The whole wave rests on one claim about DFU, so the claim is pinned
  // against DFU rather than against the port that now assumes it.
  const motor = readFileSync(MOTOR_CS, 'utf8');
  const i = motor.indexOf('void HandleParalysis()');
  assert.ok(i > 0);
  const body = motor.slice(i, motor.indexOf('\n        }\n', i) + 11);
  // the write inside the guard, and the overwrite AFTER the closing brace
  assert.match(body, /if \(entityBehaviour\.Entity\.IsParalyzed\)\s*\n\s*\{\s*\n\s*mobile\.FreezeAnims = true;\s*\n\s*CanAct = false;\s*\n\s*flyerFalls = true;\s*\n\s*\}\s*\n\s*mobile\.FreezeAnims = false;/,
    'the reset is OUTSIDE the guard - a dead store');

  // exactly two writers in the whole tree, and they are those two lines
  const files = [motor, readFileSync(DMU_CS, 'utf8'), readFileSync(MU_CS, 'utf8'), readFileSync(ATTACK_CS, 'utf8')];
  const writes = files.flatMap((f) => [...f.matchAll(/FreezeAnims\s*=\s*(true|false)/g)].map((m) => m[1]));
  assert.deepEqual(writes, ['true', 'false'], 'no third writer to rescue the freeze');

  // ...and the animation layer has never heard of paralysis
  assert.equal(/IsParalyzed/.test(readFileSync(DMU_CS, 'utf8')), false, 'DaggerfallMobileUnit does not check it');
  assert.equal(/IsParalyzed/.test(readFileSync(MU_CS, 'utf8')), false, 'nor does MobileUnit');

  // THE LATCH: EnemyAttack.Update returns BEFORE the clear, so the flag
  // survives the paralysis - which is the whole reason the port latches.
  const atk = readFileSync(ATTACK_CS, 'utf8');
  const u = atk.indexOf('void Update()');
  const upd = atk.slice(u, u + 700);
  const ret = upd.indexOf('if (entityBehaviour.Entity.IsParalyzed)');
  const clear = upd.indexOf('mobile.DoMeleeDamage = false;');
  assert.ok(ret > 0 && clear > ret, 'the paralysis return precedes the clear');
  assert.equal([...atk.matchAll(/DoMeleeDamage = false/g)].length, 1, 'and it is the only clear');
});
