// AUDIT 26 - THE SAVE-ENVELOPE PARITY BATCH (F216/F217/F220, F219,
// F222/F223/F101, F185/F187, F102), the third themed sweep of the
// audit's parity queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotPlayer, restorePlayer, copyEffectEntry } from '../../src/systems/save/save.js';
import { applyWeaponPose } from '../../src/combat/playerWeapon.js';   // HARD2c: the :420-421 inversion, called rather than quoted
import { ActionSystem } from '../../src/world/actionSystem.js';
import { Collider } from '../../src/player/collider.js';
import { hostText } from '../hostText.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => hostText(p);   // TESA's merge (HOST-SPLIT): the quest world and the quick save moved out of bootWorld (scenes/questWorld.js, scenes/worldQuickSave.js) - the host read whole

const mkEntity = (over = {}) => ({
  name: 'T', level: 3, health: 20, maxHealth: 30, fatigue: 100, magicka: 10, maxMagicka: 40,
  stats: { strength: 50 }, skills: new Array(35).fill(20), items: [], spells: [],
  ...over,
});

// ---------------------------------------------------------------
// F219/F100 - DFU persists DaedraSummonDay and DaedraSummonIndex one
// for one (SerializablePlayer.cs:164-165, restored :332-333).
// daedraForSummoner mutates both onto the entity and nothing saved
// them: reload from a fresh boot and the coven re-rolled - a
// save-scum until the prince you want answers.
// ---------------------------------------------------------------
test('audit26 F219: the coven day and index ride the envelope', () => {
  const e = mkEntity({ daedraSummonDay: 211, daedraSummonIndex: 7 });
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(e, {})));
  const restored = mkEntity({ daedraSummonDay: 3, daedraSummonIndex: 1 });
  restorePlayer(restored, snap, null);
  assert.equal(restored.daedraSummonDay, 211, 'the day round-trips');
  assert.equal(restored.daedraSummonIndex, 7, 'and the rolled prince with it');
});

// ---------------------------------------------------------------
// F222/F223/F101 - SerializablePlayer saves weaponDrawn (:175,
// restored Sheathed = !weaponDrawn :420-421) and PlayerPositionData_v1
// carries yaw, pitch and isCrouching (:212-214). The port saved none,
// so every load came back sheathed, facing the motor default and
// standing up - including a save made crouched in a 0.9 crawlspace.
// ---------------------------------------------------------------
test('audit26 F222: the pose bag rides the envelope and comes back', () => {
  const pose = { yaw: 1.25, pitch: -0.2, crouching: true, weaponDrawn: true };
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(mkEntity(), { pose })));
  const extras = restorePlayer(mkEntity(), snap, null);
  assert.deepEqual(extras.pose, pose, 'yaw, pitch, crouch and the drawn weapon all round-trip');
  // additive: an old envelope answers null and the hosts leave the
  // live pose standing (every consumer is presence-gated).
  const old = JSON.parse(JSON.stringify(snapshotPlayer(mkEntity(), {})));
  assert.equal(restorePlayer(mkEntity(), old, null).pose, null, 'a pre-pose save carries none');
});

test('audit26 F222: both hosts write the pose and land it on load', () => {
  // SAV3 moved the landing into the ONE pose-apply (quickload + the
  // classic import share it); HARD2c moved the inversion one step
  // further, into the law both hosts now call - so run it.
  const landed = { sheathed: true, usingRightHand: true };
  applyWeaponPose(landed, { weaponDrawn: true });
  assert.equal(landed.sheathed, false, 'Sheathed = !weaponDrawn, the :420-421 inversion');
});

// ---------------------------------------------------------------
// F185/F187 - ActionObjectData_v1 persists loadID, position, rotation,
// state and tween percentage ONLY (SerializableActionObject.cs:55-88);
// activationCount appears in none of the three serializers and the
// scene rebuilds on load, so every counter restarts at 0 in DFU.
// SerializableActionDoor DOES round-trip FailedSkillLevel (:77,
// :99-101), which the port omitted - a failed pick could be retried
// across a save.
// ---------------------------------------------------------------
test('audit26 F185/F187: the action record drops the counter and keeps the pick latch', () => {
  const c = new Collider();
  const a = new ActionSystem(c, {});
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const CUBE = {
    subMeshes: [],
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
    indices: new Uint16Array([0, 1, 2]),
  };
  const o = a.addDoor(CUBE, I, { ns: 0, positionKey: 1, startingLockValue: 12, action: null });
  o.activationCount = 5;
  o.failedSkillLevel = 31;
  const snap = a.collectSaveData();
  const rec = snap.find((r) => r.key === o.key);
  assert.equal('activationCount' in rec, false, 'F185: the counter is not a record field');
  assert.equal(rec.failedSkillLevel, 31, 'F187: the pick latch is');
  // restore: the counter starts the rebuilt scene at 0 even when an
  // OLD envelope still carries the field
  o.activationCount = 0; o.failedSkillLevel = 0;
  a.restoreSaveData([{ key: o.key, state: o.state, t: 0, activationCount: 9, failedSkillLevel: 31 }]);
  assert.equal(o.activationCount, 0, 'an old envelope\'s counter is ignored - DFU rebuilds at 0');
  assert.equal(o.failedSkillLevel, 31, 'the latch restores');
});

test('audit26 F216: copyEffectEntry strips the live caster reference on every pool record', () => {
  // The caster is a live scene reference, not state - DFU re-resolves
  // it on load. Serializing it would drag the whole entity (and,
  // through the foes, the scene) into the envelope.
  const entry = { kind: 'continuousDamage', roundsRemaining: 3, caster: { name: 'LIVE REF' }, effect: { type: 1 } };
  const copy = copyEffectEntry(entry);
  assert.equal('caster' in copy, false, 'the caster is dropped');
  assert.notEqual(copy.effect, entry.effect, 'and the nested record detaches');
});
