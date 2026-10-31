// ---------------------------------------------------------------------------
// ROAD-G G1 - THE FOE POOLS' THREE REMAINDERS (2026-09-04).
//
// Audit 58 left three, each recorded at its site rather than flagged,
// and all three were the same shape: a LAW the port already owned,
// refused at one pool because that pool had never been given the door
// the other pools had.
//
//  (a) `createCityGuards` took no `makeAreaHostile` dep at all, so
//      striking a PASSIVE watchman turned nobody. GameManager
//      .MakeEnemiesHostile (GameManager.cs:790-806) walks the whole
//      ActiveGameObjectDatabase whenever a non-hostile enemy is struck
//      by the player (DaggerfallEntityBehaviour.cs:255-258) - and
//      Knight_CityWatch is an EnemyClass, one of the two EntityTypes
//      that walk (:250). Both encounter pools had carried the pair
//      since ROAD-B; the watch had neither half of it, so a watchman
//      talked down by Etiquette and then struck stayed passive, and so
//      did every other enemy in the area.
//
//  (b) The WATCH refused the Wabbajack. DFU transforms any
//      `EnemyEntity` (WabbajackEffect.cs:63-95) and a watchman is one,
//      but the guard pool exposed no removal door, so both hosts wrote
//      the refusal into the code instead. In the street the arm handed
//      a struck watchman to the ENCOUNTER pool's `removeFoe` - which
//      was not a leak: that remover never looks the record up in
//      `foes` (exteriorFoes.js:"EnemyDeath.CompleteDeath's") and both pools share the host's
//      one renderer, so the watchman got exactly what `removeGuard`
//      gives it. Routing by POOL MEMBERSHIP is an OWNERSHIP law: each
//      pool owns the teardown of its own records, and `removeFoe`'s
//      `questBehaviour?.notifyDestroyed()` is an encounter-pool term
//      the watch has no business reaching.
//
//  (c) `world.js`'s `_standLooseFoe` refused INTERIOR mode on the
//      premise "interiors have no foe pool to stand one in", which
//      died the day `interiorFoes.spawnFoe` went live. SoulBound's
//      break release and the Sanguine Rose's Daedroth could not be
//      stood in a building - and CreateFoe has no mode gate at all:
//      PlaceFoeBuildingInterior (CreateFoe.cs:219-233) is
//      PlaceFoeFreely over the building, the same member the dungeon
//      arm gets, and the same one `tryPlaceInteriorQuestFoe` already
//      stands quest foes through.
//
// The wiring pins here are source pins because their hosts need a
// browser; the POOL's two new doors are driven for real against the
// live module, with no ARENA2 needed - the records are pushed onto the
// pool's own public `guards` array, which is how the pool hands them
// to every host reader anyway.
// ---------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCityGuards, GUARD_MOBILE_TYPE } from '../../src/scenes/cityGuards.js';
import { PLAYER_TARGET } from '../../src/characters/enemy/enemyTargets.js';
import { playerArrowHitFoe } from '../../src/combat/arrowFlight.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => hostText(rel);

/** The pool's seams, with the two observables this file needs: how
 *  many billboard batches were freed, and every makeAreaHostile call. */
function pool({ makeAreaHostile } = {}) {
  const freed = { n: 0 };
  const g = createCityGuards({
    renderer: {
      createBillboardBatch: () => ({}),
      destroyBillboardBatch: () => { freed.n++; },
      textures: new Map(),
    },
    collider: { heightAt: () => 0, raycast: () => Infinity, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false },
    fetchBytes: () => new Promise(() => {}),   // no ARENA2: no spawn ever completes, and none is asked for
    getTexture: () => new Promise(() => {}),
    uploadRecordFrame: () => {},
    currentMinute: () => 523530,
    playerEntity: { level: 1, reflexes: 2, crimeCommitted: 0 },
    audio: null,
    onPlayerHurt: () => {},
    makeAreaHostile,
  });
  return { g, freed };
}

/** A live watchman record in the shape the pool's own spawn builds -
 *  enough of one for the damage door and the removal door to run. */
function watchman({ hostile = true, team = 'CityWatch' } = {}) {
  const calls = [];
  return {
    id: 1, dead: false, batch: {}, mobileType: GUARD_MOBILE_TYPE,
    entity: { health: 40, maxHealth: 40, activeEffects: [], items: [], team },
    ai: {
      isHostile: hostile, feet: [1, 0, 1], yaw: 0, knockbackSpeed: 0,
      calls,
      makeEnemyHostileToAttacker(t, f) { calls.push([t, f, this.isHostile]); },
    },
  };
}

// ═══ (a) the struck PASSIVE watchman turns the whole area ═══
test('ROAD-G G1(a): a struck PASSIVE watchman walks the area; a hostile one does not', () => {
  // DaggerfallEntityBehaviour.cs:255-258 verbatim - the walk is
  // conditional on `!enemyMotor.IsHostile`, and nothing else in the
  // block is.
  const walks = [];
  const { g } = pool({ makeAreaHostile: () => walks.push('walk') });

  const passive = watchman({ hostile: false });
  g.guards.push(passive);
  g.hurtGuard(passive, 3, [0, 0, 0]);
  assert.deepEqual(walks, ['walk'], 'the pacified watchman turns the whole active database');
  assert.equal(passive.ai.isHostile, true, 'and himself');

  // ...and a second blow on the now-hostile guard walks nothing: DFU
  // asks IsHostile every time, so the walk is once per stand-down.
  g.hurtGuard(passive, 3, [0, 0, 0]);
  assert.deepEqual(walks, ['walk'], 'an already-hostile enemy does not re-walk the database');

  const hostile = watchman({ hostile: true });
  g.guards.push(hostile);
  g.hurtGuard(hostile, 3, [0, 0, 0]);
  assert.deepEqual(walks, ['walk'], 'and a guard that was hostile all along never walks it');
});

test('ROAD-G G1(a): the READ precedes the walk, and the walk precedes the flip', () => {
  // The ordering IS the law: MakeEnemyHostileToAttacker's player arm
  // (:204-213) raises IsHostile, so reading the flag after it would
  // make :255-258 unreachable for the only case it exists for.
  const seen = [];
  const { g } = pool({ makeAreaHostile: () => seen.push('walk') });
  const w = watchman({ hostile: false });
  w.ai.makeEnemyHostileToAttacker = function (t, f) { seen.push(['attacker', t, f]); this.isHostile = true; };
  g.guards.push(w);
  g.hurtGuard(w, 5, [7, 0, 8]);
  assert.deepEqual(seen, ['walk', ['attacker', PLAYER_TARGET, [7, 0, 8]]],
    'the whole-area walk fires FIRST, then this foe learns where the blow came from');
});

test('ROAD-G G1(a): a connecting swing that dealt NOTHING still reaches the door', () => {
  // WeaponManager.cs:630's HandleAttackFromSource sits outside the
  // `damage > 0` fork that closes at :615, so a swing that lost the
  // to-hit roll still turns what it touched.
  const walks = [];
  const { g } = pool({ makeAreaHostile: () => walks.push('walk') });
  const w = watchman({ hostile: false });
  g.guards.push(w);
  g.hurtGuard(w, 0, null, null);
  assert.deepEqual(walks, ['walk'], 'a connecting swing that dealt nothing still reaches the door');
  assert.equal(w.ai.calls.length, 1);
});

test('ROAD-G G1(a): the door is gated on the PLAYER being the source (F035\'s law, kept)', () => {
  // ROAD-G G1 (review): the pin that used to carry this title drove
  // `hurtGuard`, which forwards no options bag - so `fromPlayer`
  // always defaulted TRUE and the negative arm was unreachable from
  // it. The gate is DFU's `sourceEntityBehaviour ==
  // PlayerEntityBehaviour` (DaggerfallEntityBehaviour.cs:203) wrapping
  // the whole aggro block at :250-261: a watchman struck by a rat
  // (the cross-pool `hurtFromFoe` minted at cityGuards.js:"that target is the") or
  // killed by a fall (EnemyMotor.ApplyFallDamage calls DecreaseHealth
  // and nothing else, :1398-1401) must turn NOBODY.
  //
  // MUTANT: drop the `if (fromPlayer)` at cityGuards.js's aggro call
  // and all three assertions below go red.
  const walks = [];
  const { g } = pool({ makeAreaHostile: () => walks.push('walk') });
  const w = watchman({ hostile: false, team: 'PlayerAlly' });
  g.guards.push(w);
  g._damage(0, 3, { fromPlayer: false });
  assert.deepEqual(walks, [], 'a rat\'s blow does not walk the active database');
  assert.equal(w.ai.calls.length, 0, 'nor seeds this guard\'s own target/give-up bookkeeping');
  assert.equal(w.entity.team, 'PlayerAlly', 'nor reverts the ally team - :204-213 never runs');
  assert.equal(w.ai.isHostile, false, 'and the watchman stays pacified');
  // ...and the SAME door with the bag left off is a player blow, so all
  // three statements run: the gate is the only difference.
  g._damage(0, 3);
  assert.deepEqual(walks, ['walk']);
  assert.equal(w.ai.calls.length, 1);
  assert.equal(w.entity.team, 'CityWatch');
});

test('ROAD-G G1(a): a ZERO-DAMAGE player ARROW reaches the watch\'s door too', () => {
  // ROAD-G G1 (review): the lane wired the aggro block for the MELEE
  // arms only. An arrow reaches a pool through TWO seams - `dealDamage`,
  // which arrowFlight calls inside its own `dmg > 0` fork
  // (arrowFlight.js:"if (dmg > 0)"), and `onAttackFromPlayer`, which it calls
  // unconditionally at arrowFlight.js:"onAttackFromPlayer?.(foe, dmg)" because that is where WeaponManager.cs:630
  // lives - and all three hosts that resolve a player shaft EXCLUDED the
  // guards from the second one, on a sentence this pool's own
  // `handleAttackFromPlayer` had already falsified. DFU makes no such
  // distinction: AssignBowDamageToTarget's player arm
  // (DaggerfallMissile.cs:660-688) calls WeaponManager.WeaponDamage, so
  // :630 runs for the shaft exactly as for the swing.
  //
  // MUTANTS: (1) drop `handleAttackFromPlayer` from the pool's returned
  // surface and this throws; (2) restore the hosts' exclusion arm
  // (`if (!cityGuards.guards.includes(f)) ...`) and the source pin below
  // goes red.
  const walks = [];
  const { g } = pool({ makeAreaHostile: () => walks.push('walk') });
  const w = watchman({ hostile: false, team: 'PlayerAlly' });
  // A shaft that CONNECTED and MISSED - the to-hit roll failed, `rolls`
  // pinned high - returns 0 under the stock formula and PCAAO's alike.
  // A refused material is NOT that zero while PCAAO ships on: its
  // softMaterialRequirements scale the blow instead of refusing it
  // (pcaao.js pcaaoAttackDamage), so this test's old premise - material
  // 0 against minMetalToHit 1, the roll left to Math.random - dealt
  // damage whenever the ~2% hit roll landed (release-desktop's gate on
  // #365's merge: "10 !== 0").
  g.guards.push(w);
  const hits = [];
  const dmg = playerArrowHitFoe({ pos: [1, 0, 4], dir: [0, 0, -1], weapon: { material: 0, templateIndex: 121 } }, w, {
    playerEntity: { isPlayer: true, level: 1, skills: {}, items: [], stats: {} },
    playerFeet: [1, 0, 4],
    // the host's router, verbatim in shape: the damage door is the
    // pool's own, and it never fires for a zero-damage shaft...
    dealDamage: (f, d) => hits.push(d),
    // ...while the hostility seam is unconditional and routes by pool.
    onAttackFromPlayer: (f) => (g.guards.includes(f)
      ? g.handleAttackFromPlayer(f, [1, 0, 4])
      : assert.fail('the watchman must take the WATCH pool\'s door')),
    rolls: () => 0.999,   // every roll high: the crit fails, the to-hit roll (100) misses
  });
  assert.equal(dmg, 0, 'the shaft connected and missed: it dealt nothing');
  assert.deepEqual(hits, [], 'so the damage door never ran');
  assert.deepEqual(walks, ['walk'], 'and the pacified watchman still turned the whole active database');
  assert.equal(w.ai.calls.length, 1, 'and learned where the shaft came from');
  assert.equal(w.ai.isHostile, true);
  assert.equal(w.entity.team, 'CityWatch', 'and the ally team reverted to the static row');
});

test('ROAD-G G1(a): a struck former ALLY reverts to the static row\'s team', () => {
  // EnemyMotor.MakeEnemyHostileToAttacker's player arm (:204-213) reads
  // the STATIC table by mobile ID, never the instance's own copy.
  const { g } = pool({ makeAreaHostile: () => {} });
  const w = watchman({ hostile: false, team: 'PlayerAlly' });
  g.guards.push(w);
  g.hurtGuard(w, 2, [0, 0, 0]);
  assert.equal(w.entity.team, 'CityWatch', 'Knight_CityWatch\'s row team, not PlayerAlly');
});

// ═══ (b) the Wabbajack transforms the watch ═══
test('ROAD-G G1(b): removeGuard is WabbajackEffect\'s SetActive(false), not a death', () => {
  const { g, freed } = pool();
  const w = watchman();
  g.guards.push(w);
  g.removeGuard(w);
  assert.equal(w.dead, true, 'off the scene');
  assert.equal(w.corpse, undefined, 'and NOT killed - no corpse, no loot, no death chain');
  assert.equal(w.batch, null);
  assert.equal(freed.n, 1, 'the billboard batch is freed - every allocation has an owner');

  // idempotent, like the encounter pool's removeFoe: a second call
  // cannot double-free the VAO
  g.removeGuard(w);
  assert.equal(freed.n, 1);
  g.removeGuard(null);
  assert.equal(freed.n, 1);
});

