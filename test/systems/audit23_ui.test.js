// AUDIT 23 fix pins, wave 4: the UI-lane findings + the last dead code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLevelUp } from '../../src/systems/advancement.js';
import { RAY_DISTANCE, MOBILE_NPC_ACTIVATION_DISTANCE, PICKPOCKET_DISTANCE } from '../../src/systems/talk/talk.js';
import * as weaponStates from '../../src/characters/weaponStates.js';
import { MISSILE_SPEED } from '../../src/systems/spellcast.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(root, f), 'utf8');

test('AUDIT 23 ui-native-1: a pre-rolled pool means applyLevelUp draws no second one', () => {
  // DaggerfallCharacterSheetWindow.cs:375-390 rolls BonusPool() ONCE.
  const entity = () => ({
    readyToLevelUp: true, pendingLevel: 2, level: 1, maxHealth: 30, health: 30,
    stats: { endurance: 50, luck: 50 },
    career: { hitPointsPerLevel: 10 },
  });
  let draws = 0;
  const rolls = () => { draws++; return 0.5; };
  applyLevelUp(entity(), () => {}, rolls, 5);
  assert.equal(draws, 1, 'the HP roll only - the pool came pre-rolled');
  draws = 0;
  applyLevelUp(entity(), () => {}, rolls);
  assert.equal(draws, 2, 'the headless path still rolls its own pool');
});

test('AUDIT 23 ui-native-3: the talk ray reaches 76.8; each mode gates with the classic line', () => {
  // PlayerActivate.cs:76 RayDistance; :775-796 the per-mode distances.
  assert.equal(RAY_DISTANCE, 3072 * 0.025);   // 76.8 in float (3072 * GlobalScale, the DFU expression)
  assert.equal(MOBILE_NPC_ACTIVATION_DISTANCE, 6.4);
  assert.equal(PICKPOCKET_DISTANCE, 3.2);
  // LW3: the streaming host's persons are the town's and the road's (`_talkPersons()`), the same rival
  for (const [f, persons] of [['src/scenes/world.js', '_talkPersons()'], ['src/scenes/exterior.js', '_livePersons']]) {
    assert.ok(src(f).includes(`townTalk.tryActivate(cam.pos, useFwd, ${persons}, _nonPersonRival)`),
      `${f} hands the person arm a rival with the persons left OUT of it`);
  }
});

test('AUDIT 23 characters-14/combat-13: the duplicate constants are gone; the single sources hold', () => {
  assert.equal(weaponStates.ARROW_MOVEMENT_SPEED, undefined, 'MISSILE_SPEED is the one home');
  assert.equal(weaponStates.SWING_WEAPON_FATIGUE_LOSS, undefined, 'hostCombat owns the swing loss');
  assert.equal(MISSILE_SPEED, 25.0);
  assert.equal(weaponStates.ARROW_ARM_LENGTH, 0.9, 'ArmLength keeps its one home');
});
