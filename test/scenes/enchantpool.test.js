// EC1 - THE ENCHANT CTX READS THE LIVE FOE POOL (2026-08-29).
//
// world.js's enchant mount answered `[]` for its foe pool in every
// mode but exterior - which is the mode the player does not fight in.
//
// DFU has no scene gate here at all. PlayerGPS.UpdateNearbyObjects
// (PlayerGPS.cs:747-777) walks ActiveGameObjectDatabase
// .GetActiveEnemyBehaviours(), every active enemy in the scene, and
// CastWhenStrikes does not look a foe up at all (CastWhenStrikes.cs
// :105) - it assigns the bundle to the entity behaviour the strike
// already handed it. The port's lookup exists only because it needs
// the RECORD to reach that foe's sinks; the gate was never DFU's.
//
// What the gate cost, inside a dungeon in the streaming host: a
// CastWhenStrikes weapon found no record for the foe it had just
// struck and returned, so paralysis, Wizard's Fire and the other ten
// classic strike spells did nothing; the vampiric drain and both
// artifact affinity scans saw an empty room. Nothing threw and nothing
// was logged. The one ctx in play is that mount - no host passes an
// enchantCtx at the strike site (formulas.js:"why the player arm" defaults it null) -
// so mergeCtx folds it under every dispatch, in every mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveEnchantFoes, liveEnchantFoeSinks, enchantFoeHost } from '../../src/scenes/shared.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => hostText(rel);

/** A dungeon context's two enchant-facing members, and a ledger of
 *  which host's damage door each hurt actually went through. */
function fixture() {
  const hits = [];
  const dFoe = { name: 'dungeon-rat' };
  const otherDFoe = { name: 'dungeon-bat' };
  const xFoe = { name: 'street-thug' };
  // AUDIT 58: the interior's TWO pools - the quest/encounter foes IF
  // mounted and ROAD-B's indoor watch - which worldModes joins into
  // one answer exactly as it does for MakeEnemiesHostile.
  const iFoe = { name: 'shop-daedroth' };
  const iWatch = { name: 'indoor-watchman' };
  const insideSinks = (f) => ({ hurt: (n) => hits.push(['interior', f.name, n]) });
  const dungeonCtx = {
    foes: [dFoe, otherDFoe],
    foeSinksFor: (f) => ({ hurt: (n) => hits.push(['dungeon', f.name, n]) }),
  };
  const exteriorSinks = (f) => ({ hurt: (n) => hits.push(['exterior', f.name, n]) });
  return { hits, dFoe, otherDFoe, xFoe, iFoe, iWatch, dungeonCtx, exteriorSinks, insideSinks,
    exteriorPool: () => [xFoe], insidePool: () => [iFoe, iWatch] };
}

test('EC1: the live pool follows the MODE - dungeon foes are reachable', () => {
  const f = fixture();
  assert.deepEqual(liveEnchantFoes('dungeon', f.dungeonCtx, f.exteriorPool), [f.dFoe, f.otherDFoe],
    'the mode the player fights in is the one the gate used to empty');
  assert.deepEqual(liveEnchantFoes('exterior', f.dungeonCtx, f.exteriorPool), [f.xFoe],
    'and the exterior pool is still exactly the exterior pool - a dungeon ctx left mounted from a previous descent cannot leak into it');
});

test('AUDIT 58: an interior answers ITS OWN TWO POOLS - the third live mode had no arm at all', () => {
  // THE STRUCK ROW: this test used to assert `[]` here, on the stated
  // premise that "the port stands no foe pool inside a building".
  // That premise died twice over - IF mounted `interiorFoes` and
  // ROAD-B mounted `interiorGuards` beside it - and the vacuous pin
  // held the original EC1 defect open for the third mode: inside a
  // building a CastWhenStrikes weapon (paralysis, Wizard's Fire, the
  // rest of the classic strike spells) found no record and returned,
  // and the vampiric drain and both artifact affinity scans saw an
  // empty room. Silently, in a mode with live enemies in it.
  const f = fixture();
  assert.deepEqual(liveEnchantFoes('interior', f.dungeonCtx, f.exteriorPool, f.insidePool), [f.iFoe, f.iWatch],
    'the whole active enemy database of the building the player is in - the quest foes AND the watch');
  // and it does not silently borrow the exterior pool it is standing on
  assert.deepEqual(liveEnchantFoes('interior', null, f.exteriorPool, () => []), []);
  // ...nor does the exterior arm borrow the interior's, which is the
  // leak the other way: the street's pools are a different scene.
  assert.deepEqual(liveEnchantFoes('exterior', f.dungeonCtx, f.exteriorPool, f.insidePool), [f.xFoe]);
  // an interior mid-transition (no context yet) must not take the frame down
  assert.deepEqual(liveEnchantFoes('interior', null, f.exteriorPool, null), []);
  assert.deepEqual(liveEnchantFoes('interior', null, f.exteriorPool, () => undefined), []);
});

test('EC1: a dungeon with no ctx yet answers empty rather than throwing', () => {
  // the mode flips before the context finishes building; an enchantment
  // firing in that window must not take the frame down.
  assert.deepEqual(liveEnchantFoes('dungeon', null, () => { throw new Error('exterior pool must not be consulted'); }), []);
  assert.deepEqual(liveEnchantFoes('dungeon', {}, () => []), []);
});

test('EC1: sinks route by POOL MEMBERSHIP, and the mode is not consulted', () => {
  const f = fixture();
  liveEnchantFoeSinks(f.dFoe, f.dungeonCtx, f.exteriorSinks).hurt(7);
  assert.deepEqual(f.hits, [['dungeon', 'dungeon-rat', 7]], 'a dungeon record goes through the dungeon host\'s damage door');
  // THE ONE THAT MATTERS: the dungeon ctx is mounted, but this record
  // is a stranger to its pool. Routing on the ctx's PRESENCE would send
  // it to the dungeon host's damageFoe, which knocks back and kills
  // against a collider that record was never built for.
  liveEnchantFoeSinks(f.xFoe, f.dungeonCtx, f.exteriorSinks).hurt(3);
  assert.deepEqual(f.hits[1], ['exterior', 'street-thug', 3], 'a stranger to the dungeon pool goes through the exterior door');
  // AUDIT 58: and an INTERIOR record goes through the interior host's
  // own damage door. Widening the pool without this would have been
  // worse than the gap it closed - a record from a building sent
  // through `foeSinks` knocks back and dies against the STREET's
  // collider and death chain.
  liveEnchantFoeSinks(f.iFoe, f.dungeonCtx, f.exteriorSinks, f.insidePool, f.insideSinks).hurt(9);
  assert.deepEqual(f.hits[2], ['interior', 'shop-daedroth', 9], 'an interior record goes through the interior host\'s damage door');
  liveEnchantFoeSinks(f.iWatch, f.dungeonCtx, f.exteriorSinks, f.insidePool, f.insideSinks).hurt(2);
  assert.deepEqual(f.hits[3], ['interior', 'indoor-watchman', 2], 'and so does the indoor watch - one pool, one door');
  // the DUNGEON is still asked first: insideFoes answers the dungeon's
  // own pool while one is mounted, and that record is the dungeon's.
  liveEnchantFoeSinks(f.dFoe, f.dungeonCtx, f.exteriorSinks, () => [f.dFoe], f.insideSinks).hurt(1);
  assert.deepEqual(f.hits[4], ['dungeon', 'dungeon-rat', 1], 'membership is asked in host order, dungeon first');
  // a stranger to BOTH inner pools still takes the exterior door
  liveEnchantFoeSinks(f.xFoe, f.dungeonCtx, f.exteriorSinks, f.insidePool, f.insideSinks).hurt(5);
  assert.deepEqual(f.hits[5], ['exterior', 'street-thug', 5]);
  // and the router takes no mode at all - it cannot be asked the wrong
  // question. (It took one until the campaign showed no record is ever
  // in both pools, so the term could not change an answer.)
  assert.equal(liveEnchantFoeSinks.length, 5,
    'foe, dungeonCtx, exteriorSinks, insidePool, insideSinks - and nothing else (AUDIT 68 X4: the provenance is a defaulted sixth)');
});

test('AUDIT 58: WHOSE RECORD IS THIS - one membership answer, and the sinks are not its only reader', () => {
  // The sinks were routed by pool membership and the WABBAJACK DOOR in
  // the same mount was not: `replaceFoe` found its record through the
  // widened getter and then reached `exteriorFoes.removeFoe` /
  // `.spawnFoe` unconditionally. Over a foe standing in a shop that is
  // destruction, not transformation - releaseFoeBatch + `dead = true`
  // in a pool that owns neither its billboard nor its death chain -
  // with the new monster stood at the building's coordinates in the
  // street's pool, which the interior frame never ticks. So the
  // question moved into a law of its own, with two readers.
  const f = fixture();
  assert.equal(enchantFoeHost(f.dFoe, f.dungeonCtx, f.insidePool), 'dungeon');
  assert.equal(enchantFoeHost(f.iFoe, f.dungeonCtx, f.insidePool), 'inside');
  assert.equal(enchantFoeHost(f.iWatch, f.dungeonCtx, f.insidePool), 'inside',
    'the indoor watch is the interior host\'s record too - one building, one door');
  assert.equal(enchantFoeHost(f.xFoe, f.dungeonCtx, f.insidePool), 'exterior');
  // THE ORDER IS LOAD-BEARING, not defensive: worldModes' insideFoes()
  // answers the DUNGEON's own pool while a dungeon is mounted, so a
  // test that asked the inside pool first would send every dungeon
  // record to the interior host's remover.
  assert.equal(enchantFoeHost(f.dFoe, f.dungeonCtx, () => [f.dFoe]), 'dungeon',
    'a record in BOTH answers is the dungeon\'s - membership is asked in host order');
  // and a host mid-transition answers exterior rather than throwing
  assert.equal(enchantFoeHost(f.xFoe, null, null), 'exterior');
  assert.equal(enchantFoeHost(f.xFoe, {}, () => undefined), 'exterior');
  assert.equal(liveEnchantFoeSinks.length, 5, 'and its signature is unchanged');
});

test('EC1: an exterior record is untouched by the new branch, ctx or no ctx', () => {
  const f = fixture();
  liveEnchantFoeSinks(f.xFoe, f.dungeonCtx, f.exteriorSinks).hurt(4);
  liveEnchantFoeSinks(f.xFoe, null, f.exteriorSinks).hurt(5);
  liveEnchantFoeSinks(f.xFoe, {}, f.exteriorSinks, null, f.insideSinks).hurt(6);
  assert.deepEqual(f.hits, [['exterior', 'street-thug', 4], ['exterior', 'street-thug', 5], ['exterior', 'street-thug', 6]],
    'the path that already worked still works - with a live ctx, with none, and with one still building');
});

