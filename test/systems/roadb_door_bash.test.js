// ROAD-B (b2-hostility-model) - THE EXTERIOR STATIC-DOOR BASH.
//
// R1 flagged this precisely: "what is missing is not the two rolls but
// the INPUT that would reach them... the day that input lands the arms
// drop in beside it." The input is PlayerActivate
// .AttemptExteriorDoorBash (:1056-1079), offered every exterior weapon
// swing by WeaponManager.WeaponEnvDamage (:474-477), and it runs the
// WHOLE of ActivateStaticDoor with isBash true - which is a different
// ladder, not just two extra rolls: the readied Open spell is not
// spent, the interaction mode is not read, Lockpicking is not trained,
// and isBrokenIn starts true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dice100 } from '../../src/combat/formulas.js';
import { buildingLockValue } from '../../src/systems/buildingLocks.js';
import { CRIMES } from '../../src/systems/court.js';
import { WEAPON_REACH } from '../../src/combat/playerWeapon.js';
import { DEFAULT_ACTIVATION_DISTANCE } from '../../src/player/activate.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => hostText(rel);

// ---------------------------------------------------------------
// The rolls themselves (:570-583, :621-627)
// ---------------------------------------------------------------

test('ROAD-B: the bash chance is 25 - buildingLockValue, and a rich door can never be bashed', () => {
  // GetBuildingLockValue is quality / 2 (PlayerActivate.cs:653-660), so
  // the bash chance is 25 - quality/2: a hovel (quality 0) opens one
  // time in four, and anything of quality 50 or better never opens at
  // all - `Dice100.FailedRoll(0)` is always true.
  assert.equal(buildingLockValue(0), 0);
  assert.equal(25 - buildingLockValue(0), 25);
  assert.equal(25 - buildingLockValue(50), 0);
  // Dice100.SuccessRoll(chance) is Range(0,100) < chance, which is what
  // the port's dice100 answers - so chance 0 never succeeds and the
  // FailedRoll DFU tests is therefore always true.
  assert.equal(dice100(0, 0), false);
  assert.equal(dice100(25, 0.24), true);
  assert.equal(dice100(25, 0.25), false, 'the edge is exclusive');
});

test('ROAD-B: the two crimes are the ATTEMPT and the deed, and they are different rows', () => {
  assert.equal(CRIMES.Attempted_Breaking_And_Entering, 1);
  assert.equal(CRIMES.Breaking_And_Entering, 3);
});

test('ROAD-B: the swing\'s reach is the WEAPON\'s, which is inside the door activation distance', () => {
  // DFU's bash `hit` comes from WeaponManager's own SphereCast at
  // weapon.Reach (:1064), not from the activation ray - so
  // ActivateStaticDoor's "you are too far away" refusal (:500-504) is
  // unreachable on this path, which is why it is not re-tested there.
  assert.ok(WEAPON_REACH < DEFAULT_ACTIVATION_DISTANCE);
});

// ---------------------------------------------------------------
// ActivateStaticDoor's isBash ladder
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// THE INPUT
// ---------------------------------------------------------------

test('ROAD-B: both exterior hosts offer a missed swing to the doors before ringing the miss', () => {
  for (const [host, ray] of [['src/scenes/world.js', 'cam.pos, lookFwd'], ['src/scenes/exterior.js', 'eye, fwd']]) {
    const s = read(host);
    // AUDIT 29g: a swing STOPPED on a spared body ({spared: true}) met someone - it whooshes and no door is offered it
    assert.ok(s.includes(`else if (r?.spared || !modes?.attemptExteriorDoorBash?.(${ray})) audio.playOneShot(swingSoundFor(weaponRig.playerWeapon.weapon), 1.1);`),
      `${host}: the door arm runs on the no-enemy swing, and a consumed swing rings nothing`);
    // ...and the old unconditional miss sound is gone
    assert.ok(!s.includes('else audio.playOneShot(swingSoundFor(weaponRig.playerWeapon.weapon), 1.1);'),
      `${host}: the miss sound is no longer unconditional`);
  }
});
