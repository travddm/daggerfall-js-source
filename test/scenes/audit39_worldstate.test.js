// AUDIT 39, world-state group: the laws the two ABOVE-GROUND walk
// hosts were missing - the paralysis consumer gate, the HUD call that
// must not hang on ARENA2, CleanupUntrackedObjects at the teleport,
// AreEnemiesNearby at the travel map's door - plus the exterior host's
// un-intercepted touch tap and a comment that outlived its feature.
// Source pins, because the hosts need a browser to import; the pool
// sweep is behavioural, on audit26_dungeonfoes' harness shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExteriorFoes } from '../../src/scenes/exteriorFoes.js';
import { createCityGuards, GUARD_MOBILE_TYPE } from '../../src/scenes/cityGuards.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(root, f), 'utf8');

// ---------------------------------------------------------------------
// #59 - paralysis, above ground
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// #152 - the HUD call is host-agnostic and reads no ARENA2
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// #158 - CleanupUntrackedObjects
// ---------------------------------------------------------------------

const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8 };
const poolDeps = (freed) => ({
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
});
const standFoe = (mobileType, feet) => ({
  mobileType, gender: 'male', dead: false, entity: { health: 10, maxHealth: 10, items: [], activeEffects: [] },
  ai: { feet: [...feet], isHostile: true, detected: false, height: 1.8 },
  tex: stubTex, archive: ENEMY_BASICS[mobileType].maleTexture, batch: {}, _mout: null,
});
const settle = () => new Promise((r) => setTimeout(r, 0));

test('AUDIT 39 #158: clearLive is CleanupUntrackedObjects - the LIVE records go, not just the corpses', async () => {
  // StreamingWorld.cs:1624-1635 destroys every EnemyMotor under the
  // streaming target on load, and ClearStreamingWorld (:993-998)
  // collects every loose object on a teleport. collectPixel frees only
  // corpse batches and corpse flags, so before this a quickload
  // mid-fight left the live fight standing and restoreWorld spawned
  // the save's copies on top of it.
  const freed = { n: 0 };
  const pool = createExteriorFoes({ ...poolDeps(freed), currentPixelKey: () => '3,4' });
  const alive = standFoe(0, [10, 0, 10]);
  const slain = standFoe(0, [12, 0, 12]);
  pool.foes.push(alive, slain);
  pool.damageFoe(slain, 99, [0, 0, 0], null);
  await settle();
  assert.equal(pool.batches().length, 1, 'the corpse draws');

  const before = freed.n;
  pool.collectPixel('3,4');
  assert.equal(pool.foes.length, 2, 'collectPixel leaves the LIVE record standing - that is the gap');

  pool.clearLive();
  assert.equal(pool.foes.length, 0, 'the live pool is emptied');
  assert.equal(pool.batches().length, 0, 'and nothing is left to draw');
  assert.ok(freed.n > before, 'every batch is handed back');
  pool.clearLive();
  assert.equal(pool.foes.length, 0, 'idempotent - a second sweep frees nothing twice');
});

test('AUDIT 39 #158: the city watch sweeps on the same law', async () => {
  const freed = { n: 0 };
  const pool = createCityGuards({ ...poolDeps(freed), currentPixelKey: () => '3,4' });
  const live = standFoe(GUARD_MOBILE_TYPE, [5, 0, 5]);
  const dead = standFoe(GUARD_MOBILE_TYPE, [7, 0, 7]);
  pool.guards.push(live, dead);
  pool.hurtGuard(dead, 99, [0, 0, 0]);
  await settle();
  assert.equal(pool.lootTargets().length, 1, 'the body is a loot target');

  pool.clearLive();
  assert.equal(pool.guards.length, 0, 'the watch is gone - a quickload mid-pursuit resets the chase');
  assert.equal(pool.lootTargets().length, 0, 'and its corpses with it');
  assert.equal(pool.update(0, [0, 0, 0], [0, 1.7, 0], {}).length, 0, 'nothing draws');
});

// ---------------------------------------------------------------------
// AUDIT-39r - the sweep reaches the work that is still in flight
//
// #158's sweep frees the two arrays, but both pools spawn ACROSS two
// real awaits (a career file, a cold texture archive) and mint their
// corpse markers across a third. DFU instantiates enemies and corpse
// markers synchronously, so CleanupUntrackedObjects has nothing to
// cancel; the port's async art warm opens a window the C# has no
// analogue for, and a spawn or a mint crossing a fast travel or a
// quickload resolved AFTERWARDS - landing a departure-point record in
// the destination world beside restoreWorld's copies, at pre-teleport
// coordinates. The pools now carry an epoch the sweep bumps.
// ---------------------------------------------------------------------

// the parked-fetchBytes harness of audit26_dungeonfoes.test.js:"1, 'and stops being an".."assert.equal(here.corpse, false, 'the record is destroyed, not merely hidden');" -
// one 74-byte CLASS*.CFG record, held until the pin lets it land
const parkedCareer = () => {
  let land;
  const fetchBytes = () => new Promise((res) => { land = () => res(new Uint8Array(74)); });
  return { fetchBytes, land: () => land() };
};
const warmTex = async () => ({ ...stubTex, getFrameCount: () => 1 });

test('AUDIT-39r: an encounter spawn in flight when the sweep runs never joins the new world', async () => {
  const freed = { n: 0 };
  const career = parkedCareer();
  const pool = createExteriorFoes({ ...poolDeps(freed), fetchBytes: career.fetchBytes, getTexture: warmTex });
  const inFlight = pool.spawnFoe(GUARD_MOBILE_TYPE, [10, 0, 10]);   // >= 128, so the career is a real CFG read
  await settle();
  assert.equal(pool.foes.length, 0, 'the record has not landed yet - this is the window');

  pool.clearLive();   // the fast travel / quickload sweep
  career.land();
  assert.equal(await inFlight, null, 'the spawn is cancelled, not completed');
  await settle();
  assert.equal(pool.foes.length, 0, 'and no departure-point foe stands in the destination pixel');
  assert.equal(pool.batches().length, 0, 'nothing of it draws');
});

test('AUDIT-39r: the same for the watch, whose spawn crosses the same two awaits', async () => {
  const freed = { n: 0 };
  const career = parkedCareer();
  const pool = createCityGuards({ ...poolDeps(freed), fetchBytes: career.fetchBytes, getTexture: warmTex });
  // restoreWorld is the pool's own fire-and-forget door onto spawnGuardAt
  pool.restoreWorld([{ nativeX: 0, nativeZ: 0, y: 0, yaw: 0, health: 10, maxHealth: 10 }], (x, z) => [x, z]);
  await settle();
  assert.equal(pool.guards.length, 0, 'still crossing CLASS18.CFG');

  pool.clearLive();
  career.land();
  await settle();
  await settle();
  assert.equal(pool.guards.length, 0, 'the watchman posted to the town we left does not arrive in the new one');
});

test('AUDIT-39r: a corpse marker still loading its art when the sweep runs is not re-added', async () => {
  // The mint's own guard is `stillDead`, which stays TRUE across a
  // sweep - the body is still a body. The batch it would push carries
  // the DEPARTURE pixel's key, and that pixel is torn down by the same
  // teleport, so collectPixel could never reach it again: it would
  // draw at the old position for the rest of the session.
  for (const which of ['guards', 'foes']) {
    const freed = { n: 0 };
    let landTex;
    const deps = {
      ...poolDeps(freed), currentPixelKey: () => '3,4',
      getTexture: () => new Promise((res) => { landTex = () => res({ ...stubTex, getFrameCount: () => 1 }); }),
    };
    const guardPool = which === 'guards';
    const pool = guardPool ? createCityGuards(deps) : createExteriorFoes(deps);
    const rec = standFoe(GUARD_MOBILE_TYPE, [5, 0, 5]);
    (guardPool ? pool.guards : pool.foes).push(rec);
    if (guardPool) pool.hurtGuard(rec, 99, [0, 0, 0]);
    else pool.damageFoe(rec, 99, [0, 0, 0], null);
    await settle();
    assert.ok(landTex, `${which}: the mint is parked on its corpse texture`);

    pool.clearLive();
    const before = freed.n;
    landTex();
    await settle();
    const drawn = guardPool ? pool.update(0, [0, 0, 0], [0, 1.7, 0], {}).length : pool.batches().length;
    assert.equal(drawn, 0, `${which}: no body from the world we left draws in this one`);
    assert.equal(pool.lootTargets().length, 0, `${which}: and it is not a loot target either`);
    assert.equal(freed.n, before + 1, `${which}: the late batch is handed back, not stranded on a torn-down pixel`);
  }
});

test('AUDIT-39r: a player ARROW knocks a watchman back - WeaponManager sets KnockbackDirection for every EnemyClass hit', () => {
  // WeaponManager.cs:576-595 writes KnockbackSpeed AND
  // KnockbackDirection = direction inside `if (damage > 0)`, and
  // DaggerfallMissile.cs:681-687 hands the arrow's forward in as that
  // direction; Knight_CityWatch is EnemyClass, so the first arm of the
  // gate fires. hurtGuard was written for the SPELL caller and hard-
  // coded knockDir null, and C15's whole block is gated on it - so the
  // one arm that carried no direction was the player's shaft, while
  // the melee swing, an enemy's arrow and the same shaft on an
  // encounter foe all shoved.
  const freed = { n: 0 };
  const pool = createCityGuards({ ...poolDeps(freed), currentPixelKey: () => '3,4' });
  const g = standFoe(GUARD_MOBILE_TYPE, [5, 0, 5]);
  g.ai.knockbackSpeed = 0;   // no shove decaying - the gate's first arm is open
  pool.guards.push(g);
  pool.hurtGuard(g, 5, [0, 0, 0], [1, 0, 0]);
  assert.deepEqual(g.ai.knockbackDir, [1, 0, 0], 'the shaft carries its direction into the watchman');
  assert.ok(g.ai.knockbackSpeed > 0, 'and the shove has a speed');
  // the spell caller still passes none, and nothing is invented for it
  const g2 = standFoe(GUARD_MOBILE_TYPE, [6, 0, 6]);
  g2.ai.knockbackSpeed = 0;
  pool.guards.push(g2);
  pool.hurtGuard(g2, 5, [0, 0, 0]);
  assert.equal(g2.ai.knockbackDir, undefined, 'a directionless caster shoves nobody');
});

// ---------------------------------------------------------------------
// #159 - AreEnemiesNearby at the travel map's door
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// #130 / #78 - the exterior host's touch tap and its stale comment
// ---------------------------------------------------------------------

