// AUDIT 63, the RDB ACTION SYSTEM lane.
//
// F37 - a moved action model keeps its AT-REST activation box, so the
//       activate ray and the swing ray both test a ghost.
// F38 - action DOORS were excluded from the collision-trigger pass, so
//       a Collision/MultiTrigger-flagged door never fired its record on
//       contact (no plaque line, no trespass check).
// F39 - DoorText HUD lines took the 1.0 s popDelay where
//       DaggerfallAction.cs:875 passes 2.0.
//
// The review round:
// F42 - F36's interior deferral was wrong: DaggerfallInterior.cs:1277
//       takes GetComponent<DaggerfallActionDoor>() off the building
//       door prefab, so the interior mount owes ObstacleCheck's arm -
//       and OpenDoors, the step that follows it in the same Move.
// F43 - the interior activation ray was a FOURTH reader of F37's law
//       and still spelled it inline, on the crashing spelling.
// F44 - the Castle Daggerfall hack tested `kind === 'door'` where the
//       reference's GetComponent misses a DaggerfallActionDoorSpecial.
// F45 - F38's boxes newly exposed doors to that hack on the collision
//       path, ahead of the trigger gate, where DFU attaches no
//       DaggerfallActionCollision at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionSystem, DOOR_TEXT_HUD_DELAY_S, TYPE_99_TEXT_INDEX, isActionDoorObject,
  hasActionCollision, walkHears, COLLISION_TRIGGER_FLAGS,
  CASTLE_DAGGERFALL_MAP_ID, CASTLE_DAGGERFALL_FOYER_DOOR_LOAD_IDS,
} from '../../src/world/actionSystem.js';
import { Collider } from '../../src/player/collider.js';
import { EnemyAI } from '../../src/characters/enemy/enemyMotor.js';
import { ACTION_FLAGS, TRIGGER_FLAGS } from '../../src/world/rdbLayout.js';
import { objectAabb, worldAabb, activationTargets, pickActivatable } from '../../src/player/activate.js';
import { envAttack } from '../../src/combat/weapon/weaponRig.js';
import { HudText, HUD_TEXT_POP_DELAY } from '../../src/ui/hud/hudText.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// a unit quad in the z = 0 plane, x/y in [0, 1]
const CUBE = {
  positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
  indices: [0, 1, 2, 0, 2, 3],
};
const stubCollider = () => ({
  addMesh: () => {}, removeBucket: () => {}, removeMesh: () => {},
  raycast: () => Infinity,
});
const act = (over = {}) => ({
  actionFlag: ACTION_FLAGS.None, triggerFlag: TRIGGER_FLAGS.None,
  index: 0, magnitude: 0, axisRaw: 0, isFlat: false, nextObject: -1,
  duration: 0, rotation: { x: 0, y: 0, z: 0 }, translation: { x: 0, y: 0, z: 0 },
  ...over,
});

/** A mover registered the way dungeonContext registers one: the model,
 *  plus the AT-REST world box the collision-trigger pass wants
 *  (dungeonContext's `o.aabb = aabb; o.restOnlyTrigger = true;`). */
const mover = (a, positionKey, over = {}) => {
  const o = a.addAction(0, positionKey, CUBE, I, act({ duration: 0, translation: { x: 0, y: 10, z: 0 }, ...over }));
  o.aabb = worldAabb(CUBE.positions, I);
  o.restOnlyTrigger = true;
  return o;
};

test('AUDIT 63 F37: a posed mover measures LIVE - the box travels with the transform', () => {
  const a = new ActionSystem(stubCollider());
  const o = mover(a, 3, { triggerFlag: TRIGGER_FLAGS.Direct });
  assert.deepEqual(o.aabb.min, [0, 0, 0], 'the stored box is the AT-REST placement box');
  a.receive(o, 'Direct');
  assert.equal(o.state, 'end');
  assert.equal(o.matrix[13], 10, 'the transform moved - iTween.MoveTo carries the collider with it');
  // DaggerfallAction.TweenToEnd (Internal/DaggerfallAction.cs:361-379)
  // is iTween.RotateBy (:378) + iTween.MoveTo (:379) on the GameObject,
  // so its MeshCollider is at the NEW pose; PlayerActivate.cs:381-385
  // and WeaponManager.cs:459-464 both read a live Physics.Raycast hit.
  assert.deepEqual(objectAabb(o).min, [0, 10, 0], 'the ray meets the mover where it now is');
  assert.deepEqual(objectAabb(o).max, [1, 11, 0]);
  assert.deepEqual(o.aabb.min, [0, 0, 0], 'the stored at-rest box is NOT mutated - the collision pass owns it');
  // ...and the objects that have no mesh keep the only box they have.
  const relay = a.addRelay(0, 4, act({ actionFlag: ACTION_FLAGS.Teleport }), { min: [5, 5, 5], max: [6, 6, 6] });
  assert.deepEqual(objectAabb(relay).min, [5, 5, 5]);
  assert.equal(objectAabb(a.addRelay(0, 6, act())), null, 'a chain-only relay is never a target');
  assert.equal(objectAabb(null), null);
});

test('AUDIT 63 F37: the activate ray follows the mover and the ghost stops answering', () => {
  const a = new ActionSystem(stubCollider());
  const o = mover(a, 3, { triggerFlag: TRIGGER_FLAGS.Direct });
  a.receive(o, 'Direct');
  const targets = activationTargets(a.objects);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0].aabb.min, [0, 10, 0], 'PlayerActivate.cs:381-385 reads a live hit');
  const col = stubCollider();
  // a click along +z at the mover's NEW height finds it...
  assert.equal(pickActivatable([0.5, 10.5, -2], [0, 0, 1], targets, col), o.key);
  // ...and the vacated footprint answers nothing, so it can no longer
  // shadow a genuine target lying further along the same ray.
  assert.equal(pickActivatable([0.5, 0.5, -2], [0, 0, 1], targets, col), null);
});

test('AUDIT 63 F37: WeaponEnvDamage strikes the mover at its live pose, not its ghost', () => {
  // WeaponManager.WeaponEnvDamage (Game/WeaponManager.cs:457-472) reads
  // `hit.transform.gameObject.GetComponent<DaggerfallAction>()` off a
  // live Physics.Raycast hit and sends Receive(player, Attack) - the
  // same law as the activate ray, and the port's second copy of it.
  const a = new ActionSystem(stubCollider());
  const o = mover(a, 3, { triggerFlag: TRIGGER_FLAGS.Attack });
  a.receive(o, 'Attack');
  assert.equal(o.activationCount, 1);
  assert.equal(o.matrix[13], 10);
  const col = stubCollider();
  assert.equal(envAttack(a, col, [0.5, 0.5, -2], [0, 0, 1]), false, 'the ghost box no longer eats the swing');
  assert.equal(o.activationCount, 1, 'and nothing was struck there');
  envAttack(a, col, [0.5, 10.5, -2], [0, 0, 1]);
  assert.equal(o.activationCount, 2, 'the swing lands where the platform now is');
});

test('AUDIT 63 F38: a MultiTrigger DoorText door fires its record on WalkInto', () => {
  // DaggerfallActionCollision.cs:36-56 sends Receive(PlayerObject,
  // WalkOn|WalkInto) on contact while a move key is held; the gate
  // (DaggerfallAction.cs Receive) accepts WalkInto for MultiTrigger, and
  // DoorText (DaggerfallAction.cs:870-888) does NOT require
  // activatedByPlayer - that flag guards only the door-Open path - so
  // the plaque and the trespass check both run on the collision path.
  const a = new ActionSystem(stubCollider());
  const said = [];
  let trespass = 0;
  a.onDoorText = (id) => said.push(id);
  a.onTrespass = () => { trespass++; };
  const door = a.addDoor(CUBE, I, {
    ns: 0,
    positionKey: 2,
    action: act({ actionFlag: ACTION_FLAGS.DoorText, triggerFlag: TRIGGER_FLAGS.MultiTrigger, index: 16 }),
  });
  a.receive(door, 'WalkInto');
  assert.equal(door.activationCount, 1, 'Receive increments, then Plays (DaggerfallAction.cs:870)');
  assert.deepEqual(said, [TYPE_99_TEXT_INDEX + 16], 'the plaque line is the record Index + 7700');
  // "classic seems to only check whether this value is greater than 5":
  // the SECOND bump is the trespass arm (DaggerfallAction.cs:882-888).
  const trespasser = a.addDoor(CUBE, I, {
    ns: 0, positionKey: 3,
    action: act({ actionFlag: ACTION_FLAGS.DoorText, triggerFlag: TRIGGER_FLAGS.MultiTrigger, index: 16, axisRaw: 6 }),
  });
  a.receive(trespasser, 'WalkInto');
  a.receive(trespasser, 'WalkInto');
  assert.equal(trespasser.activationCount, 2);
  assert.equal(trespass, 1, 'MakeEnemiesHostile on the second contact');
  // A door with no record at all carries TriggerFlag None, whose gate
  // is empty - the record-less dungeon door is inert on contact, which
  // is DFU's "no DaggerfallActionCollision component" outcome.
  const plain = a.addDoor(CUBE, I, { ns: 0, positionKey: 4 });
  a.receive(plain, 'WalkInto');
  assert.equal(plain.activationCount, 0);
});

test('AUDIT 63 F39: the door plaque holds for 2 s, not the 1 s popDelay', () => {
  // DaggerfallAction.cs:875 `DaggerfallUI.AddHUDText(tokens, 2.0f)` ->
  // DaggerfallUI.cs:775-781 -> PopupText.cs:130-141, which hands the
  // delay to AddText(string, float) PER LINE (:106-116). Every other
  // HUD line legitimately takes PopupText.popDelay = 1.0 (:28).
  assert.equal(DOOR_TEXT_HUD_DELAY_S, 2.0, 'DaggerfallAction.cs:875');
  assert.equal(HUD_TEXT_POP_DELAY, 1.0, 'PopupText.cs:28');
  const held = new HudText();
  held.add('A strong, orcish voice...', DOOR_TEXT_HUD_DELAY_S);
  held.tick(1.5);
  assert.ok(held.timer > 0, 'at 1.5 s the plaque is still on its no-scroll hold');
  const dropped = new HudText();
  dropped.add('A strong, orcish voice...');
  dropped.tick(1.5);
  assert.ok(dropped.timer < 0, 'the 1.0 default has already begun scrolling out by then');
});

// ---------------------------------------------------------------- F42
// EnemyMotor.ObstacleCheck's DaggerfallActionDoor arm, at the INTERIOR
// mount. F36 wired it in the dungeon and deferred both above-ground
// hosts on "whether an above-ground host has DaggerfallActionDoors to
// find at all". Internal/DaggerfallInterior.cs:1250-1281 answers it for
// the building interior: AddActionDoors instantiates every swing door
// from Option_InteriorDoorPrefab and reads
// `GetComponent<DaggerfallActionDoor>()` straight off it (:1277).

/** a vertical quad at z = z0 spanning x in [-w, w], y in [0, h] */
const wallQuad = (z0, w = 3, h = 3) => ({
  positions: new Float32Array([-w, 0, z0, w, 0, z0, w, h, z0, -w, h, z0]),
  indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
});

test('AUDIT 63 F42: a BUILDING interior door is a DaggerfallActionDoor, so ObstacleCheck must not detour', () => {
  // interiorContext registers its doors with NO action record at all
  // (`actions.addDoor(cpu, parent(d.matrix))`), which is exactly the
  // shape DaggerfallInterior builds: a door prefab carrying the
  // component and, unlike RDBLayout's, never an action record.
  const acts = new ActionSystem(stubCollider());
  const door = acts.addDoor(CUBE, I, {});
  assert.equal(door.actionFlag, ACTION_FLAGS.None, 'an interior door carries no record');
  assert.equal(isActionDoorObject(door), true, 'DaggerfallInterior.cs:1277 - the prefab HAS the component');

  const c = new Collider(() => -Infinity);
  const q = wallQuad(0.3);
  c.addMesh(door.key, q.positions, q.indices, I);

  // The mount's dep, spelled as worldModes.makeInteriorFoes spells it.
  const wired = new EnemyAI(c, [0, 0, 0], 0, {
    isActionDoor: (k) => k != null && isActionDoorObject(acts.objects.get(k)),
  });
  wired._obstacleCheck([0, 0, 1]);
  assert.equal(wired.obstacleDetected, false, 'EnemyMotor.cs:1166 - a door is not an obstacle');
  assert.equal(wired.foundDoor, true, ':1167');
  assert.equal(wired.doorKey, door.key, ':1170-1173 senses.LastKnownDoor');

  // ...and the pre-fix mount, which passed nothing and took
  // enemyMotor's `() => false` fallback.
  const unwired = new EnemyAI(c, [0, 0, 0], 0, {});
  unwired._obstacleCheck([0, 0, 1]);
  assert.equal(unwired.obstacleDetected, true, 'without the dep the door reads as a wall');
  assert.equal(unwired.doorKey, undefined, 'and no door is ever recorded, so OpenDoors has nothing');
});

// ---------------------------------------------------------------- F43
test('AUDIT 63 F43: the interior activation ray reads the ONE helper, not a fourth inline copy', () => {
  // The spelling it dropped is the one activationTargets exists to
  // replace: it dereferences `o.cpu.positions` on an object that has no
  // mesh. interiorContext registers only doors today, so the arm was
  // one interior action record away from a TypeError inside the ray.
  const a = new ActionSystem(stubCollider());
  const relay = a.addRelay(0, 4, act({ actionFlag: ACTION_FLAGS.Teleport }), { min: [5, 5, 5], max: [6, 6, 6] });
  assert.throws(() => worldAabb(relay.cpu.positions, relay.matrix), TypeError, 'the old spelling crashes on a mesh-less object');
  assert.deepEqual(activationTargets(a.objects)[0].aabb.min, [5, 5, 5], 'the helper keeps its stored box');
});

// ---------------------------------------------------------------- F44
test('AUDIT 63 F44: the Castle Daggerfall hack is GetComponent<DaggerfallActionDoor>(), so a SPECIAL door is missed', () => {
  // DaggerfallAction.cs:270 `DaggerfallActionDoor door =
  // GetComponent<DaggerfallActionDoor>();` - and
  // DaggerfallActionDoorSpecial (Internal/DaggerfallActionDoorSpecial.cs:24)
  // is a SEPARATE MonoBehaviour, so that lookup returns null on one. It
  // has no lock at all, which is why DFU can note the player "cannot
  // open, bash, pick, or cast their way through this type of door".
  const ctx = {
    playerTeleportedIntoDungeon: true,
    isPlayerInsideDungeon: true,
    currentMapId: CASTLE_DAGGERFALL_MAP_ID,
  };
  const mk = (special) => {
    const a = new ActionSystem(stubCollider(), { magicDoorsContext: () => ctx });
    const o = special
      ? a.addSpecialDoor(0, 7, CUBE, I, act({ actionFlag: ACTION_FLAGS.OpenDoor }))
      : a.addDoor(CUBE, I, { ns: 0, positionKey: 7, startingLockValue: 20 });
    // RDBLayout gives BOTH components' GameObject the same loadID
    // (AddActionModelHelper's local, RDBLayout.cs:892-901), and both
    // start locked-and-closed for the purposes of this test - so the
    // ONLY thing that can separate them is the component test.
    o.loadID = CASTLE_DAGGERFALL_FOYER_DOOR_LOAD_IDS[0];
    o.currentLockValue = 20;
    return { a, o };
  };
  // TriggerFlag None refuses every trigger type, so nothing but the
  // hack - which DFU runs AHEAD of that switch - can act here.
  const plain = mk(false);
  plain.a.receive(plain.o, 'Direct');
  assert.equal(plain.o.currentLockValue, 0, 'the ordinary foyer door takes the hack');
  assert.equal(plain.o.state, 'forward', 'ToggleDoor()');
  const special = mk(true);
  special.a.receive(special.o, 'Direct');
  assert.equal(special.o.currentLockValue, 20, 'GetComponent<DaggerfallActionDoor>() returns null on a special door');
  assert.equal(special.o.state, 'start', 'and nothing swings');
});

// ---------------------------------------------------------------- F45
test('AUDIT 63 F45: only the four collision TriggerFlags have a DaggerfallActionCollision at all', () => {
  // RDBLayout.AddAction (Utility/RDBLayout.cs:992-996) attaches the
  // component for exactly these four flags, and
  // DaggerfallActionCollision - driven by PlayerCollisionHandler, which
  // Game/PlayerCollision.cs' OnControllerColliderHit alone drives - is
  // the ONLY collision caller of Receive.
  assert.deepEqual([...COLLISION_TRIGGER_FLAGS].sort((x, y) => x - y),
    [TRIGGER_FLAGS.Collision01, TRIGGER_FLAGS.Collision03, TRIGGER_FLAGS.Collision09, TRIGGER_FLAGS.MultiTrigger].sort((x, y) => x - y));
  const a = new ActionSystem(stubCollider());
  const withFlag = (f) => a.addDoor(CUBE, I, { ns: 0, positionKey: f + 100, action: act({ triggerFlag: f }) });
  for (const f of COLLISION_TRIGGER_FLAGS) assert.equal(hasActionCollision(withFlag(f)), true, `flag ${f} collides`);
  for (const f of [TRIGGER_FLAGS.None, TRIGGER_FLAGS.Direct, TRIGGER_FLAGS.Attack, TRIGGER_FLAGS.Direct6, TRIGGER_FLAGS.Door]) {
    assert.equal(hasActionCollision(withFlag(f)), false, `flag ${f} has no collision component`);
  }
  assert.equal(hasActionCollision(a.addDoor(CUBE, I, { ns: 0, positionKey: 200 })), false, 'a record-less door has no DaggerfallAction either');
  assert.equal(hasActionCollision(null), false);
});

test('AUDIT 63 F45: a Door-flagged foyer door cannot take the hack from a bump', () => {
  // F38 gave every recorded door a collision box, which is right - but
  // Receive runs CastleDaggerfallMagicDoorsSpecialOpenHack BEFORE the
  // trigger gate (DaggerfallAction.cs:183, the ROAD-B B4 ordering), so
  // a foyer door carrying the ordinary `Door` flag would have unlocked
  // and swung open when the player walked into it. In DFU that door has
  // no DaggerfallActionCollision, so the bump never reaches Receive at
  // all. The fix refuses the CALL, not the gate.
  const ctx = {
    playerTeleportedIntoDungeon: true, isPlayerInsideDungeon: true,
    currentMapId: CASTLE_DAGGERFALL_MAP_ID,
  };
  const a = new ActionSystem(stubCollider(), { magicDoorsContext: () => ctx });
  const door = a.addDoor(CUBE, I, {
    ns: 0, positionKey: 7, startingLockValue: 20,
    loadID: CASTLE_DAGGERFALL_FOYER_DOOR_LOAD_IDS[1],
    action: act({ triggerFlag: TRIGGER_FLAGS.Door }),
  });
  assert.equal(hasActionCollision(door), false, 'RDBLayout.cs:992-996 attaches nothing for TriggerFlag.Door');
  // The gate alone would NOT have saved it - this is what the hack does
  // when the collision path is allowed to call Receive.
  a.receive(door, 'WalkInto');
  assert.equal(door.currentLockValue, 0, 'the hack fires ahead of the gate, exactly as DFU orders it');
  // FIELD BUGS 2026-10-21d FLAT-WALK: the pass asks walkHears - hasActionCollision, and no flat relay
  assert.equal(walkHears(door), false, 'what a walk hears is a DaggerfallActionCollision first');
});
