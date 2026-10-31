// REST5 (2026-10-03, bible/06-Systems/Rest-Arc.md 2.6; OPEN 11 and 15): ONLINE THE NIGHT CARRIES THE PARTY. The vote,
// the gather and the mirrors retire online; a member's night sleeps every member within 15 m who keeps "Rest with my
// party" on, each through their own host's bag, each their own yield and interval, waking to no ambush (only the
// rester rolls); the night's stamp rides the pose's `restStartedAt` (no relay bump). A rest point is public: a
// stranger never blocks a rest at a fire or a bed - a Bedroll keeps the rule. Offline nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { intermittentEnemySpawn, quietNights } from '../../src/systems/encounters.js';
import { setNightListener, heardNight, REST_ACT_TEXT, nightStamp, isNightStamp, nightKindOf, PARTY_NIGHT_MARKS } from '../../src/systems/rest/restAct.js';
import { createRestDeps } from '../../src/scenes/shared.js';
import { setSharedClock, setOwnMinutes, advanceOwnMinutes } from '../../src/systems/worldTick.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('REST5 only the rester rolls: inside quietNights no ambush is asked, however the dice fall; re-entrant, and the count comes back down after a throw', () => {
  const ctx = { gameMinutes: 1, inside: true, inDungeon: true, isResting: true, restAsks: 2, enemyAlertActive: true, dungeonType: 0, playerLevel: 5 };
  const always = () => 0;
  const loud = [];
  for (let m = 0; m < 60; m++) loud.push(intermittentEnemySpawn({ ...ctx, gameMinutes: m }, always));
  assert.ok(loud.some(Boolean), 'the dungeon asks at its cadence, the dice at zero');
  const quiet = quietNights(() => quietNights(() => Array.from({ length: 60 }, (_, m) => intermittentEnemySpawn({ ...ctx, gameMinutes: m }, always))));
  assert.ok(quiet.every((r) => r === null), 'a carried night: nothing');
  assert.throws(() => quietNights(() => { throw new Error('x'); }));
  assert.ok(Array.from({ length: 60 }, (_, m) => intermittentEnemySpawn({ ...ctx, gameMinutes: m }, always)).some(Boolean), 'and after a throw the ambush is back');
});

test('REST5 the night is heard: a night slept whole calls the listener; a carried night, a broken one and a short rest do not', () => {
  setSharedClock(() => 5_000_000);
  setOwnMinutes(400_000);
  const heard = [];
  const prev = setNightListener(() => heard.push(1));
  try {
    const e = { health: 5, maxHealth: 60, fatigue: 0, magicka: 0, maxMagicka: 30, stats: { endurance: 50, strength: 50, willpower: 50, agility: 50 }, skills: [], career: {}, activeEffects: [] };
    const deps = createRestDeps(e, { restPoint: () => ({ kind: 'camp', where: 'fire' }), restKind: () => 'camp', advanceMinutes: (n) => advanceOwnMinutes(n), endLines: () => null });
    deps.setResting(true); deps.restNight(); deps.setResting(false);
    assert.equal(heard.length, 1, 'the rester\'s night');
    deps.setResting(true); deps.restNight({ carried: true }); deps.setResting(false);
    assert.equal(heard.length, 1, 'a carried night is not passed on');
    deps.setResting(true); deps.restShort(); deps.setResting(false);
    assert.equal(heard.length, 1, 'a short rest passes no night');
    heardNight();
    assert.equal(heard.length, 2);
  } finally { setNightListener(prev); setSharedClock(null); }
});

test('AUDIT REST F7: a night\'s stamp is marked - the shared clock\'s second with a night\'s mark for its milliseconds; an older build\'s open (any other millisecond) is no night - AUDIT REST-PARTY: one mark a rest kind', () => {
  assert.deepEqual({ ...PARTY_NIGHT_MARKS }, { rough: 775, camp: 776, bed: 777 });
  assert.equal(nightStamp(5_000_123, 'bed'), 5_000_777);
  assert.equal(nightStamp(5_000_999, 'bed'), 5_000_777, 'never more than the mark past the second');
  assert.equal(nightStamp(5_000_123), 5_000_776, 'a kind not given stamps as a fire\'s');
  assert.equal(isNightStamp(5_000_777), true);
  assert.equal(isNightStamp(5_000_775), true);
  assert.equal(isNightStamp(5_000_774), false);
  assert.equal(isNightStamp(5_000_778), false);
  assert.equal(isNightStamp(null), false);
  assert.equal(nightKindOf(5_000_775), 'rough');
});

test('REST5 the words: carried, carried short, skipped - each names the member', () => {
  assert.equal(REST_ACT_TEXT.carried('Ada'), 'Ada rests here, and you rest with them through the night.');
  assert.equal(REST_ACT_TEXT.carriedShort('Ada'), 'Ada rests here, and you rest a while with them.');
  assert.equal(REST_ACT_TEXT.carriedSkipped('Ada'), 'Ada rests here, but you are too busy to rest with them.');
  assert.equal(REST_ACT_TEXT.noVote, 'Online there is no vote. Rest at a fire, tent or bed, and party members within 15 m rest with you.');
});

