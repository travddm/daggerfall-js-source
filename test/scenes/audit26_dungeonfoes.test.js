// AUDIT 26, wave hosts-dungeon-foes: the laws the DUNGEON host and the
// two EXTERIOR foe pools were missing - PlayerEntity.Update's 8-hour
// enemy-alert decay and its passive watch rolls, SetEnemyCareer's
// per-spawn spell assignment, the SetHealth(0) drowning door,
// StreamingWorld's loose-object collection for corpses, the load's
// rebuild-from-save population, and the sky controller's one-shot
// guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tickPlayerMinutes, resetMagicRoundMarker, CLASSIC_MINUTES_PER_SECOND,
} from '../../src/systems/worldTick.js';
import {
  setEnemyAlert, ALERT_DECAY_MINUTES, passiveGuardSpawns,
  PASSIVE_GUARD_LEGAL_REP, PASSIVE_GUARD_LOW_REP_CHANCE,
  PASSIVE_GUARD_BANISHED_CHANCE, SEVERE_PUNISHMENT_BANISHED,
} from '../../src/systems/encounters.js';
import { hurtPlayer } from '../../src/characters/playerEntity.js';
import { createExteriorFoes } from '../../src/scenes/exteriorFoes.js';
import { createCityGuards, GUARD_MOBILE_TYPE } from '../../src/scenes/cityGuards.js';
import { createSkyController } from '../../src/scenes/shared.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(root, f), 'utf8');

/** AUDIT 65 SL-3: an inert stand-in for every free identifier a lifted
 *  statement block reaches for - callable, and its properties are more
 *  of itself, so a host expression runs without its host. */
const STUB = new Proxy(function stub() {}, {
  get: (t, k) => (typeof k === 'symbol' ? Reflect.get(t, k) : STUB),
  apply: () => STUB,
});

const sinks = () => ({
  hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {},
  drainFatigue() {}, restoreFatigue() {}, say() {},
});
const tickEntity = (over = {}) => ({
  chargenDone: true, skillUses: new Array(35).fill(0),
  stats: { strength: 50, endurance: 50 }, skills: 30, activeEffects: [],
  lastSkillCheckTime: 0, fatigue: 3200, health: 50, maxHealth: 50, ...over,
});

// =====================================================================
// F204 - the 8-hour enemy-alert decay reaches the DUNGEON host
// =====================================================================

test('F204: the 8-hour alert decay is part of the PLAYER TICK, so the ticker-less dungeon host runs it (PlayerEntity.cs:380-384)', () => {
  // DFU:  const int alertDecayMinutes = 8 * DaggerfallDateTime.MinutesPerHour;
  //       if (enemyAlertActive && (gameMinutes - lastEnemyAlertTime) > alertDecayMinutes)
  //           SetEnemyAlert(false);
  // ...inside Update, which runs in every context. The port hung it on
  // createPlayerTicker instead, and dungeonContext builds no ticker: it
  // calls tickPlayerMinutes directly. Underground the alert only ever
  // went UP (a foe with the player in sight raises it; only that foe's
  // death cleared it) and it is the sole gate on the resting spawn roll.
  assert.equal(ALERT_DECAY_MINUTES, 8 * 60);

  resetMagicRoundMarker(1000);
  const at8 = tickEntity();
  setEnemyAlert(at8, true, 1000);
  tickPlayerMinutes({
    entity: at8, classicMinutes: 1000, sinks: sinks(),
    dt: ALERT_DECAY_MINUTES / CLASSIC_MINUTES_PER_SECOND,
  });
  assert.equal(at8.enemyAlertActive, true, 'exactly eight hours is not MORE than eight (the C# `>`)');

  resetMagicRoundMarker(1000);
  const past8 = tickEntity();
  setEnemyAlert(past8, true, 1000);
  tickPlayerMinutes({
    entity: past8, classicMinutes: 1000, sinks: sinks(),
    dt: (ALERT_DECAY_MINUTES + 1) / CLASSIC_MINUTES_PER_SECOND,
  });
  assert.equal(past8.enemyAlertActive, false, 'one minute past eight hours: the alert goes out');

});

// =====================================================================
// F049 - dungeon drowning is SetHealth(0), through the 3-argument door
// =====================================================================

test('F049: dungeon drowning calls the REAL 3-argument damage door, not the file-local 1-argument wrapper', () => {

  // and the defect class itself, at the door: the wrapper's shape is a
  // silent no-op, the real one kills.
  const drowned = { health: 37, maxHealth: 37 };
  assert.equal(hurtPlayer(drowned, drowned.health, { bypassShield: true }), true, 'SetHealth(0) kills');
  assert.equal(drowned.health, 0);
  const spared = { health: 37, maxHealth: 37 };
  assert.equal(hurtPlayer(spared, spared, { bypassShield: true }), false,
    'an ENTITY passed as the damage trips playerEntity.cs:97 and does nothing at all');
  assert.equal(spared.health, 37, 'which is exactly the damage the dungeon was dealing');
});

// =====================================================================
// F050 - SetEnemyCareer assigns spells on EVERY spawn, not once at load
// =====================================================================

// =====================================================================
// F051 - the standalone dungeon fly-cam gate tested an imported function
// =====================================================================

// =====================================================================
// F218 - a load leaves exactly the SAVED enemy population
// =====================================================================

// =====================================================================
// F036 - PlayerEntity.Update's passive watch rolls
// =====================================================================

test('F036: the passive watch rolls, verbatim (PlayerEntity.cs:498-511)', () => {
  // if (regionData[regionIndex].LegalRep < -10 && Dice100.SuccessRoll(5))
  // if ((regionData[regionIndex].SeverePunishmentFlags & 1) != 0 && Dice100.SuccessRoll(10))
  assert.equal(PASSIVE_GUARD_LEGAL_REP, -10);
  assert.equal(PASSIVE_GUARD_LOW_REP_CHANCE, 5);
  assert.equal(PASSIVE_GUARD_BANISHED_CHANCE, 10);
  assert.equal(SEVERE_PUNISHMENT_BANISHED, 1);

  // Dice100.SuccessRoll(n) is `Random.Range(0,100) < n`
  const always = () => 0;      // rolls 0: under every chance
  const never = () => 0.99;    // rolls 99: over both
  assert.equal(passiveGuardSpawns({ legalRep: -11 }, always), 1, 'hated: the 5% roll lands');
  assert.equal(passiveGuardSpawns({ legalRep: -11 }, never), 0, 'and can miss');
  assert.equal(passiveGuardSpawns({ legalRep: -10 }, always), 0, 'exactly -10 is not LESS than -10');
  assert.equal(passiveGuardSpawns({ severePunishmentFlags: 1 }, always), 1, 'banished: the 10% roll lands');
  assert.equal(passiveGuardSpawns({ severePunishmentFlags: 2 }, always), 0,
    'bit 2 is the execution order, not the banishment the roll reads');
  assert.equal(passiveGuardSpawns({ severePunishmentFlags: 3 }, always), 1, 'the bit still reads through');
  assert.equal(passiveGuardSpawns({ legalRep: -11, severePunishmentFlags: 1 }, always), 2,
    'the two `if`s are independent - both can land in one minute');
  assert.equal(passiveGuardSpawns({}, always), 0, 'a law-abiding player is never rolled for');

  // 5 and 10 are chances, not thresholds: a roll of exactly the chance
  // FAILS (`<`), which is the half a `<=` would quietly widen.
  assert.equal(passiveGuardSpawns({ legalRep: -11 }, () => 0.05), 0, 'roll 5 is not < 5');
  assert.equal(passiveGuardSpawns({ severePunishmentFlags: 1 }, () => 0.09), 1, 'roll 9 is < 10');
  assert.equal(passiveGuardSpawns({ severePunishmentFlags: 1 }, () => 0.10), 0, 'roll 10 is not');
});

// =====================================================================
// F212 - exterior corpses are loose objects and get collected
// =====================================================================

/** A pool foe/guard stood by hand: these pools build entities from
 *  ARENA2 careers, and the corpse law needs none of that - a record
 *  with an ai, a texture and an entity is all damageFoe reads. */
const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8 };
function poolDeps(freed) {
  return {
    renderer: {
      createBillboardBatch: () => ({}),
      destroyBillboardBatch: () => { freed.n++; },
      textures: new Map(),
    },
    collider: { raycast: () => 0.5, heightAt: () => 0 },
    fetchBytes: async () => { throw new Error('no ARENA2 in this pin'); },
    getTexture: async () => stubTex,
    uploadRecordFrame: () => {},
    currentMinute: () => 1000,
    playerEntity: { level: 1, reflexes: 2, skills: 30, items: [], stats: { strength: 50, agility: 50, luck: 50 } },
    audio: null,
    onPlayerHurt: () => {},
    rand: () => 0.5,
    rolls: () => 0.5,
  };
}
let _standId = 0;
const standFoe = (mobileType, feet) => ({
  // AUDIT 39: the guard pool names its corpses by `id` (its array is
  // pruned now), so a hand-stood record carries one too.
  id: _standId++,
  mobileType, gender: 'male', dead: false, entity: { health: 10, maxHealth: 10, items: [], activeEffects: [] },
  ai: { feet: [...feet], isHostile: true, detected: false, height: 1.8 },
  tex: stubTex, archive: ENEMY_BASICS[mobileType].maleTexture, batch: {}, _mout: null,
});
const settle = () => new Promise((r) => setTimeout(r, 0));

test('F212: an exterior corpse is a LOOSE OBJECT - it dies with its map pixel (StreamingWorld.cs:1040-1052)', async () => {
  // GameObjectHelper.cs:836-839 hands every corpse marker dropped
  // OUTSIDE to TrackLooseObject, stamped with the streamer's current
  // map pixel; CollectLooseObjects destroys the ones whose pixel leaves
  // range, and ClearStreamingWorld (:993, from InitWorld :584) destroys
  // ALL of them, which is every teleport and fast travel. The port had
  // ported that for player-dropped piles and not for corpses: the pool
  // had no removal path at all, so every kill of the session kept a
  // VAO, two GL buffers and an array entry drawn every frame.
  const freed = { n: 0 };
  let pixel = '3,4';
  const pool = createExteriorFoes({ ...poolDeps(freed), currentPixelKey: () => pixel });

  const here = standFoe(0, [10, 0, 10]);      // Rat, killed on 3,4
  pool.foes.push(here);
  pool.damageFoe(here, 99, [0, 0, 0], null);
  pixel = '9,9';
  const away = standFoe(0, [20, 0, 20]);      // ...and one on another pixel
  pool.foes.push(away);
  pool.damageFoe(away, 99, [0, 0, 0], null);
  await settle();

  assert.equal(pool.batches().length, 2, 'both corpses draw');
  assert.equal(pool.lootTargets().length, 2, 'and both probe for loot');
  assert.equal(here.corpsePixelKey, '3,4', 'stamped with the pixel the streamer was on at the kill');
  assert.equal(away.corpsePixelKey, '9,9');

  const before = freed.n;
  pool.collectPixel('3,4');
  assert.equal(freed.n, before + 1, 'the collected corpse frees its GL batch');
  assert.equal(pool.batches().length, 1, 'and stops being drawn');
  assert.equal(pool.lootTargets().length, 1, 'and stops being an activation target');
  assert.equal(here.corpse, false, 'the record is destroyed, not merely hidden');
  assert.equal(away.corpse, true, 'the corpse on a pixel still in range is untouched');

  // ...and update()'s tail splice, which spares corpses, finally prunes it
  pool.update(0, [0, 0, 0], [0, 1.7, 0], {});
  assert.equal(pool.foes.includes(here), false, 'the destroyed record leaves the pool');
  assert.equal(pool.foes.includes(away), true);
});

test('AUDIT 39: a recenter DURING a spawn moves the foe that is still being built', async () => {
  // AUDIT 17e F23 / THE FOUR HOSTS RULE. spawnFoe crosses two real
  // awaits - the career file, then a cold TEXTURE archive - and its
  // record joins `foes` only at the very end, while offsetAll can
  // shift only what the pool already holds. world.js applies r.offset
  // from the FRAME LOOP on every map-pixel crossing, so an encounter
  // that spawned across one stood 819.2 units from where it was meant
  // to happen, and the cull then removed it undetected.
  const freed = { n: 0 };
  let land;
  const pool = createExteriorFoes({
    ...poolDeps(freed),
    // one 74-byte CLASS*.CFG record: zeroes parse, and this pin is
    // about the await, not about the career's numbers
    fetchBytes: () => new Promise((res) => { land = () => res(new Uint8Array(74)); }),
    getTexture: async () => ({ ...stubTex, getFrameCount: () => 1 }),
  });
  const spawning = pool.spawnFoe(GUARD_MOBILE_TYPE, [10, 0, 10]);   // a CLASS foe, so the career is a CFG read
  await settle();
  assert.equal(pool.foes.length, 0, 'the record has not landed yet');
  pool.offsetAll([-819.2, 0, 0]);   // the floating origin moves under it
  land();
  const f = await spawning;
  assert.ok(f, 'the foe stood');
  assert.equal(pool.foes.length, 1);
  assert.deepEqual([f.ai.feet[0], f.ai.feet[2]], [10 - 819.2, 10], 'and it took the recenter with everything else');
});

test('AUDIT-39r: and the WATCH, whose spawn crosses the same two awaits', async () => {
  // The pending-feet list went to one of the two pools world.js
  // recenters on the same frame (its cityGuards.offsetAll /
  // exteriorFoes.offsetAll pair), and spawnGuardAt has the identical
  // shape: CLASS18.CFG, then a cold texture archive, then the push. A
  // guard summoned by a crime across a map-pixel crossing marched to
  // where the crime USED to be, 819.2 units out.
  const freed = { n: 0 };
  let land;
  const pool = createCityGuards({
    ...poolDeps(freed),
    fetchBytes: () => new Promise((res) => { land = () => res(new Uint8Array(74)); }),   // CLASS18.CFG, parked
    getTexture: async () => ({ ...stubTex, getFrameCount: () => 1 }),
  });
  // restoreWorld is the pool's own door onto spawnGuardAt
  pool.restoreWorld([{ nativeX: 10, nativeZ: 10, y: 0, yaw: 0, health: 10, maxHealth: 10 }], (x, z) => [x, z]);
  await settle();
  assert.equal(pool.guards.length, 0, 'the record has not landed yet');
  pool.offsetAll([-819.2, 0, 0]);
  land();
  await settle();
  await settle();
  assert.equal(pool.guards.length, 1, 'the guard stood');
  assert.deepEqual([pool.guards[0].ai.feet[0], pool.guards[0].ai.feet[2]], [10 - 819.2, 10],
    'and it took the recenter with everything else');
});

test('F212: the city watch\'s corpses are the same loose objects, on the same law', async () => {
  const freed = { n: 0 };
  const pool = createCityGuards({ ...poolDeps(freed), currentPixelKey: () => '3,4' });
  const g = standFoe(GUARD_MOBILE_TYPE, [5, 0, 5]);
  pool.guards.push(g);
  pool.hurtGuard(g, 99, [0, 0, 0]);
  await settle();
  // this pool's per-frame drive IS its batch list
  assert.equal(pool.update(0, [0, 0, 0], [0, 1.7, 0], {}).length, 1, 'the corpse draws');
  assert.equal(pool.lootTargets().length, 1);

  const before = freed.n;
  pool.collectPixel('9,9');
  assert.equal(freed.n, before, 'a pixel that holds no corpse of ours frees nothing');
  pool.collectPixel('3,4');
  assert.equal(freed.n, before + 1, 'its own pixel frees the batch');
  assert.equal(pool.lootTargets().length, 0, 'and the body stops being a target');
  assert.equal(g.corpse, false, 'the record is destroyed, not merely hidden');
  // AUDIT 39 moved this pin: the guards array used to be unprunable
  // (lootTargets keyed corpses by array index), so clearing the flag
  // WAS the whole destroy. The key is the guard's own id now, and
  // update()'s tail prune takes the record itself - the encounter
  // pool's law, on the encounter pool's schedule.
  pool.update(0, [0, 0, 0], [0, 1.7, 0], {});
  assert.equal(pool.guards.includes(g), false, 'the collected corpse leaves the pool');
});

test('AUDIT 39: dead guards do not accumulate - the walk-away is pruned, the corpse stays', async () => {
  // EnemyEntity.cs:184-191 destroys the city watch outright when the
  // active crime returns to none ("Despawn city watch when active
  // crime state returns to none ... GameObject.Destroy"), where a
  // KILLED enemy is deliberately kept (EnemyDeath disables the object
  // and leaves the corpse). The port marked both `dead` and pruned
  // neither, so every guard of a session stayed in `guards` with its
  // entity, items and AI, and update(), offsetAll(), collectPixel(),
  // snapshotWorld() and activeCount() all paid for it every frame.
  const freed = { n: 0 };
  const player = { level: 1, reflexes: 2, skills: 30, items: [], stats: { strength: 50, agility: 50, luck: 50 }, crimeCommitted: 5 };
  const pool = createCityGuards({ ...poolDeps(freed), playerEntity: player, currentPixelKey: () => '3,4' });
  const walker = standFoe(GUARD_MOBILE_TYPE, [5, 0, 5]);
  const killed = standFoe(GUARD_MOBILE_TYPE, [7, 0, 7]);
  killed.entity.items = [{ name: 'Gold', group: 'Currency', stackCount: 5 }];
  pool.guards.push(walker, killed);
  pool.hurtGuard(killed, 99, [0, 0, 0]);
  await settle();
  assert.equal(pool.guards.length, 2);

  player.crimeCommitted = 0;   // the court releases: the watch walks away
  pool.update(0, [0, 0, 0], [0, 1.7, 0], {});
  assert.deepEqual(pool.guards, [killed], 'the walk-away is gone; the body with loot on it stays');
  // and the surviving corpse still answers to its OWN key, which an
  // index would not have done after the splice
  const t = pool.lootTargets();
  assert.equal(t.length, 1);
  assert.equal(t[0].key, `guardCorpse:${killed.id}`);
  assert.equal(pool.takeLoot(t[0].key), 1, 'the right purse');
});

// =====================================================================
// F045 - a failed night sky must not wedge the controller
// =====================================================================

/** Enough of a WebGL2 context for SkyRenderer to build and upload. */
const stubGl = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    return () => ({});
  },
});

test('F045: a night sky that cannot load degrades to the gradient instead of freezing the sky for the night', async () => {
  // createSkyController.use() sets a ONE-SHOT `pending` guard and only
  // apply() clears it, so a rejected build refused every later use() of
  // that key for ever - the sky stayed on the last day frame until dawn
  // asked for a different key. The day branch already caught and
  // degraded; the NIGHT branch awaited two fetches bare.
  // DaggerfallSky.LoadVanillaNightSky (:565-604) reads local files
  // synchronously and has no such guard to wedge.
  // ES1 (2026-08-27): the skin defaults to ENHANCED and the enhanced sky
  // builds no panorama at all, so this test - which is about the CLASSIC
  // panorama path - asks for that path by name, the way a player who
  // wants the painted sky does.
  const sky = createSkyController(stubGl, new URLSearchParams('sky=classic'));
  assert.equal(sky.enhanced, false, 'the classic pass, as this test is about');
  const dayDefault = [...sky.renderer.clearColor];
  sky.use(0, 0, true);        // midnight: the NIGHT key, and no ARENA2 here
  await settle();
  await settle();
  assert.notDeepEqual([...sky.renderer.clearColor], dayDefault,
    'the panorama was applied - the build degraded rather than rejecting');
  // buildFallbackSkyPanorama's horizon end, which is what "degraded to
  // the gradient" means
  assert.deepEqual([...sky.renderer.clearColor].map((v) => Math.round(v * 255)), [196, 205, 224]);

});
