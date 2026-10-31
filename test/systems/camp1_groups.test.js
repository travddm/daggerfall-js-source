import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  rollCampEncounter, rollCampEncounterOnChunkLoad, amGroupRollOwner, campWindowOpen, rollCampKind, rollCampChance,
  rollCampChanceOnChunkLoad, CAMP_WINDOW_MINUTES, CAMP_WINDOW_REAL_MINUTES, CAMP_SIZE, PACK_SIZE, CAMP_SPACING,
  PACK_SPACING, CAMP_ALERT_RADIUS, PACK_ALERT_RADIUS, MIN_CAMP_SPAWN_DISTANCE, MAX_CAMP_SPAWN_DISTANCE,
  CAMP_CHANCE, CAMP_CHANCE_ON_CHUNK_LOAD, GROUP_ROLL_RADIUS, campAnchorSpot,
} from '../../src/systems/campEncounters.js';
import { CLASSIC_MINUTES_PER_SECOND } from '../../src/systems/worldTick.js';
import { areEnemiesNearby, RESTING_DISTANCE, MIN_WILDERNESS_SPAWN_DISTANCE } from '../../src/systems/encounters.js';   // CAMP1-REST: the interrupt, its reach, and the band the classic roll mints inside it
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { FEATURES } from '../../src/systems/features.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

// ═══ CAMP1: WILDERNESS CAMPS AND PACKS ═════════════════════════════
//
// Mac, 2026-09-17 ("daggerfalljsWildlifeSpawnsRespawn"): a rare group
// encounter outdoors - a settled camp or a pack crossing your path -
// on top of classic Daggerfall's one-at-a-time wandering monster. An
// ORIGINAL addition, not a DFU system: it reuses the encounter tables
// (chooseRandomEnemy) and the cadence loop (runEncounterTick), and
// adds one behaviour, a member that notices the player wakes its
// campmates. Two triggers exist in the module: a guaranteed group every
// 15 REAL minutes of play, and a 15% roll each new map pixel entered.
// Online, exactly one of the players within 100m rolls (a deterministic
// lowest-id pick).
//
// CAMP-NOTIMER (2026-09-19, Lost's package): world.js, the real
// streaming open world, WIRES UP ONLY THE SECOND. A camp or a pack must
// be a consequence of the player stepping onto new ground, never a
// background timer dropping one on a player standing still.
// exterior.js - the fixed single-location preview host, with no chunk
// streaming to hang a roll off - still wires up the timer, unchanged.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const rollsOf = (list) => { let i = 0; return () => list[i++ % list.length]; };
// THEMED GROUPS: rollGroupComposition now draws its SEED member FIRST
// (chooseRandomEnemy, two rolls - the level band, then the pick) and only then
// the kind and the size, because every other member is drawn from the seed's
// own faction. A cycling rollsOf() cannot say that legibly, so the composition
// cases below script their rolls in order and let a trailing value feed the
// remaining member draws. SEED is a pair that lands on a real, non-solitary
// Woodlands type at level 5, so the seed is taken on its first attempt.
const scripted = (list, tail = 0.5) => { let i = 0; return () => (i < list.length ? list[i++] : tail); };
const SEED = [0.3, 0.2];
const WILD = { inside: false, inLocationRect: false, preventEnemySpawns: false, climateIndex: CLIMATES.Woodlands, playerLevel: 5 };

test('CAMP1: the window is 15 REAL minutes of play, stated in game minutes through the one clock rate, and opens on exactly those minutes', () => {
  assert.equal(CAMP_WINDOW_REAL_MINUTES, 15);
  assert.equal(CAMP_WINDOW_MINUTES, 15 * 60 * CLASSIC_MINUTES_PER_SECOND);
  assert.equal(CAMP_WINDOW_MINUTES, 180, 'TimeScale 12: 180 game minutes');
  assert.equal(campWindowOpen(0), true);
  assert.equal(campWindowOpen(179), false);
  assert.equal(campWindowOpen(180), true);
  assert.equal(campWindowOpen(360.9), true, 'floored - the loop hands whole minutes anyway');
  assert.equal(campWindowOpen(181), false);
});

test('CAMP1: the timer roll - gated on the wilderness (not inside, not the town rect, not while spawns are prevented), then the window, then GUARANTEED', () => {
  const t = 360;   // an open window, by day
  assert.equal(rollCampEncounter({ ...WILD, gameMinutes: t, inside: true }, rollsOf([0.1])), null, 'indoors: nothing');
  assert.equal(rollCampEncounter({ ...WILD, gameMinutes: t, inLocationRect: true }, rollsOf([0.1])), null, 'the widened town rect: nothing, day or night');
  assert.equal(rollCampEncounter({ ...WILD, gameMinutes: t + 720, inLocationRect: true }, rollsOf([0.1])), null);
  assert.equal(rollCampEncounter({ ...WILD, gameMinutes: t, preventEnemySpawns: true }, rollsOf([0.1])), null, 'a clock jump\'s minutes roll nothing');
  assert.equal(rollCampEncounter({ ...WILD, gameMinutes: t + 1 }, rollsOf([0.1])), null, 'the window is closed on every other minute');
  const hit = rollCampEncounter({ ...WILD, gameMinutes: t }, scripted([...SEED, 0.1, 0.99]));
  assert.ok(hit, 'an open window IS a group - no chance roll on the timer path (Mac: "every 15 minutes it should happen guaranteed")');
  assert.equal(hit.kind, 'camp', 'kind roll under 0.5: a camp');
  assert.equal(hit.mobileTypes.length, CAMP_SIZE[1], 'size roll 0.99: the top of the camp band');
  assert.ok(hit.mobileTypes.every((m) => Number.isInteger(m) && m >= 0), 'every member is a real mobile id off the climate\'s table');
  assert.deepEqual([hit.spacing, hit.alertRadius, hit.minDistance, hit.maxDistance], [CAMP_SPACING, CAMP_ALERT_RADIUS, MIN_CAMP_SPAWN_DISTANCE, MAX_CAMP_SPAWN_DISTANCE]);
  const pack = rollCampEncounter({ ...WILD, gameMinutes: t }, scripted([...SEED, 0.9, 0.0]));
  assert.equal(pack.kind, 'pack');
  assert.equal(pack.mobileTypes.length, PACK_SIZE[0], 'size roll 0: the bottom of the pack band');
  assert.deepEqual([pack.spacing, pack.alertRadius], [PACK_SPACING, PACK_ALERT_RADIUS]);
  assert.ok(PACK_SPACING > CAMP_SPACING && CAMP_ALERT_RADIUS === CAMP_SPACING * 3 && PACK_ALERT_RADIUS === PACK_SPACING * 2, 'a camp is tight (three spacings of shout), a pack is loose (two)');
  assert.equal(rollCampEncounter({ ...WILD, gameMinutes: t, climateIndex: 9999 }, scripted([...SEED, 0.1, 0.5])), null, 'an unknown climate has no table: nothing to spawn - the seed roll itself comes back empty');
});

test('CAMP1: the chunk-load roll - the same gate and composition, no time gate at all, and its own 50% chance', () => {
  assert.equal(CAMP_CHANCE_ON_CHUNK_LOAD, 0.50);
  assert.equal(rollCampChanceOnChunkLoad(0.499), true);
  assert.equal(rollCampChanceOnChunkLoad(0.5), false);
  assert.equal(rollCampEncounterOnChunkLoad({ ...WILD, gameMinutes: 181 }, rollsOf([0.6])), null, 'roll 0.6: no group this pixel');
  const hit = rollCampEncounterOnChunkLoad({ ...WILD, gameMinutes: 181 }, scripted([0.1, ...SEED, 0.1, 0.5]));   // the 50% chance roll first, then the seed, then kind and size
  assert.ok(hit && hit.kind === 'camp', 'roll 0.1 on a CLOSED minute: a group - the pixel crossing is the cadence');
  assert.equal(rollCampEncounterOnChunkLoad({ ...WILD, gameMinutes: 181, inLocationRect: true }, rollsOf([0.1])), null, 'the town gate holds here too');
  // the timer's own 5% is kept for a lower-than-guaranteed rate later, and is not consulted by the timer path
  assert.equal(CAMP_CHANCE, 0.05);
  assert.equal(rollCampChance(0.049), true); assert.equal(rollCampChance(0.05), false);
  assert.equal(rollCampKind(0.499), 'camp'); assert.equal(rollCampKind(0.5), 'pack');
});

test('CAMP1: group ownership online - the one lowest id among the players within 100m rolls; offline, or alone, always this player', () => {
  assert.equal(GROUP_ROLL_RADIUS, 100);
  assert.equal(amGroupRollOwner(null, [0, 0, 0], [{ id: 'a', feet: [1, 0, 1] }]), true, 'offline (no id): mine');
  assert.equal(amGroupRollOwner('m', [0, 0, 0], null), true, 'no roster: mine');
  assert.equal(amGroupRollOwner('m', [0, 0, 0], []), true);
  assert.equal(amGroupRollOwner('m', [0, 0, 0], [{ id: 'a', feet: [10, 0, 10] }]), false, '"a" sorts under "m" and stands 14m off: theirs');
  assert.equal(amGroupRollOwner('m', [0, 0, 0], [{ id: 'a', feet: [101, 0, 0] }]), true, '...but 101m off is outside the ring: mine');
  assert.equal(amGroupRollOwner('m', [0, 0, 0], [{ id: 'a', feet: [100, 0, 0] }]), false, 'exactly on the ring is in it');
  assert.equal(amGroupRollOwner('m', [0, 0, 0], [{ id: 'z', feet: [1, 0, 1] }, { id: 'n', feet: [2, 0, 2] }]), true, 'everyone near sorts above me: mine');
  assert.equal(amGroupRollOwner('m', [0, 0, 0], [{ id: 'm', feet: [1, 0, 1] }, { id: null, feet: [1, 0, 1] }, { id: 'a' }]), true, 'my own row, a null id and a row with no feet are skipped');
  assert.equal(amGroupRollOwner(5, [0, 0, 0], [{ id: 10, feet: [1, 0, 1] }]), false, 'ids compare as STRINGS - "10" < "5" - so every client agrees whatever type its ids are');
  assert.equal(amGroupRollOwner('m', [0, 0, 0], [{ id: 'a', feet: [10, 50, 10] }]), false, 'the ring is horizontal: height does not count');
});

test('CAMP1 by source: both exterior hosts roll it after the single roll comes back empty, stand an anchor then the members around it, the world host under the group-ownership guard and on every pixel entered; a member that notices the player wakes its campmates; the feature row', () => {
  // the switch
  const row = FEATURES.find((f) => f.id === 'wilderness-camps');
  assert.ok(row, 'the enhanced pane carries the row');
  assert.deepEqual([row.group, row.title, [...row.kinds], row.control.key, row.control.initial, row.control.online], ['world', 'Wilderness camps & packs', ['enhanced'], 'wildernessCamps', true, 'player']);
});

// CAMP1-REST, THE LAW UNDER THE GATE. The source pins above say the roll stands down under a rest; this one says
// WHAT a rest can actually see, so the gate cannot be deleted as "belt and braces" by a reader who never met the
// bug - and so that nobody re-derives the hand-off's own reading of it, which was that camps outrun the interrupt
// on DISTANCE alone. They do not. The interrupt is sight first:
//
//     SEEN me          -> reported at ANY range        (a foe minted "LookAt player" trips this at once)
//     not seen, <= 12  -> reported if it would spawn   (RESTING_DISTANCE, the fallback)
//     not seen,  > 12  -> dropped before anything else (the whole camp band, 100..150 since CAMP-FAR, lives here)
//
// So a lone wanderer wakes the sleeper because it is minted FACING them, not because of where it stands (its own
// band, 10..20, is mostly outside the fallback too). A camp is minted facing its ANCHOR and out past the
// fallback, so the one group that lands in silence is the one whose members happen to face away - and the world
// is not frozen meanwhile, which is why most groups do wake the sleeper and only the quiet ones read as a bug.
// If someone moves the bands so they overlap, or yaws members at the player, this reddens and the gate can be
// reconsidered on purpose rather than by accident.
test('CAMP1-REST: the rest interrupt is SIGHT first - a seen foe reports at any range, an unseen one only inside 12, and the whole camp band lies outside that; the two spawners differ in FACING, which is what a group can lose', () => {
  assert.ok(MIN_CAMP_SPAWN_DISTANCE > RESTING_DISTANCE,
    `a camp's NEAREST member (${MIN_CAMP_SPAWN_DISTANCE}) is already outside the fallback's reach (${RESTING_DISTANCE})`);
  assert.ok(MAX_CAMP_SPAWN_DISTANCE >= MIN_CAMP_SPAWN_DISTANCE, 'and the band only runs outward from there');
  assert.ok(MIN_WILDERNESS_SPAWN_DISTANCE < RESTING_DISTANCE,
    `a lone wanderer's band starts inside it (${MIN_WILDERNESS_SPAWN_DISTANCE}) - but that is not why it wakes the player`);
  // THE DIFFERENCE THAT ACTUALLY DECIDES IT, by source: the lone arm yaws its foe at the PLAYER, the group arm
  // yaws each member at the ANCHOR. That is the line a future "fix" would touch instead of this gate.
  for (const host of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const h = host === 'src/scenes/world.js' ? hostText(host) : read(host);   // PIN MOVED (HOST-SPLIT, at the merge of main into TESA): questWorld is scenes/questWorld.js's - the host read whole
    assert.match(h, /yaw: Math\.atan2\(feet\[0\] - spot\.x, feet\[2\] - spot\.z\),   \/\/ LookAt player/, `${host}: the lone wanderer faces the player`);
    assert.match(h, /yaw: Math\.atan2\(anchorFeet\[0\] - spot\.x, anchorFeet\[2\] - spot\.z\),/, `${host}: a campmate faces the camp`);
  }

  // the interrupt on the shape the spawner mints: a member just stood has detected nothing, seen nothing, and
  // carries no wouldBeSpawned mark (enemyMotor sets it false at construction and recomputes it on its own update)
  const foe = (dist, over = {}) => ({ dead: false, ai: { detected: false, inSight: false, isHostile: true, _distLocal: dist, ...over } });
  const camp = [foe(MIN_CAMP_SPAWN_DISTANCE), foe(MAX_CAMP_SPAWN_DISTANCE), foe((MIN_CAMP_SPAWN_DISTANCE + MAX_CAMP_SPAWN_DISTANCE) / 2)];
  assert.equal(areEnemiesNearby(camp, { resting: true }), false,
    'THE BUG: a whole camp rolled under a rest is invisible to the interrupt - it arrived in silence and was standing there on waking');
  // ...and stays invisible even once its members ARE marked, because the mark only counts inside the reach
  assert.equal(areEnemiesNearby(camp.map((f) => foe(f.ai._distLocal, { wouldBeSpawned: true })), { resting: true }), false,
    'the mark does not help at camp distance: the resting arm drops it before the mark is ever read');

  // the contrast that makes the gate the right fix rather than a blanket "rests are never interrupted"
  assert.equal(areEnemiesNearby([foe(MIN_WILDERNESS_SPAWN_DISTANCE, { wouldBeSpawned: true })], { resting: true }), true,
    'the classic wandering monster is minted inside the reach and still wakes the player - the lone roll is left alone');
  assert.equal(areEnemiesNearby([foe(MAX_CAMP_SPAWN_DISTANCE, { detected: true, inSight: true })], { resting: true }), true,
    'and a foe that HAS seen the player wakes them at any distance');
});

// ═══ CAMP-FAR (2026-09-24) ══════════════════════════════════════════
//
// Mac: "when stepping into a new chunk, enemy camps spawn immediately
// behind the player, which is far too sudden and overwhelming. Instead,
// when the spawn chance triggers, enemies should spawn at a distance of
// 100-150 meters away from the player." The band moves out, and the
// anchor gets its own placement law, because DFU's ring cannot reach:
// it walks out at the player's height and probes FOUR units down.
test('CAMP-FAR: the band is 100..150 metres, and the anchor law stands it there - just outside the view, on the terrain\'s own floor, or nowhere off the built ground', () => {
  assert.deepEqual([MIN_CAMP_SPAWN_DISTANCE, MAX_CAMP_SPAWN_DISTANCE], [100, 150]);
  const feet = [1000, 37, -2000];
  const fov = 65;
  const flat = () => 12.5;
  // scripted rolls: the FOV slack (0..4 deg), the side coin, the distance across the band
  let a = campAnchorSpot({ feet, yawRad: 0, fovDegrees: fov, groundAt: flat, rolls: rollsOf([0, 0.9, 0]) });
  assert.ok(a, 'a spot');
  assert.equal(a.y, 12.5, 'the floor is the terrain sampler\'s answer, not the player\'s height');
  let d = Math.hypot(a.x - feet[0], a.z - feet[2]);
  assert.ok(Math.abs(d - MIN_CAMP_SPAWN_DISTANCE) < 1e-6, `distance roll 0: the bottom of the band (${d})`);
  // yaw 0 faces +z; the coin > 0.5 takes the NEGATIVE side, so the spot is 65 degrees LEFT of forward: x = -sin(65) * 100
  assert.ok(Math.abs(a.x - (feet[0] - Math.sin(fov * Math.PI / 180) * 100)) < 1e-6, 'just outside the left edge of the view');
  assert.ok(Math.abs(a.z - (feet[2] + Math.cos(fov * Math.PI / 180) * 100)) < 1e-6);
  a = campAnchorSpot({ feet, yawRad: 0, fovDegrees: fov, groundAt: flat, rolls: rollsOf([1, 0.1, 1]) });
  d = Math.hypot(a.x - feet[0], a.z - feet[2]);
  assert.ok(Math.abs(d - MAX_CAMP_SPAWN_DISTANCE) < 1e-6, `distance roll 1: the top of the band (${d})`);
  // FOV + 4 degrees, on the RIGHT: the bearing is 69 degrees off forward, never inside the view
  const bearing = Math.atan2(a.x - feet[0], a.z - feet[2]) * 180 / Math.PI;
  assert.ok(Math.abs(bearing - (fov + 4)) < 1e-6, `bearing ${bearing}: FOV plus the full slack, to the right`);
  // the band, over many random rolls, never lands inside MIN or beyond MAX, and never inside the view
  for (let i = 0; i < 500; i++) {
    const yaw = Math.random() * Math.PI * 2;
    const s = campAnchorSpot({ feet, yawRad: yaw, fovDegrees: fov, groundAt: flat });
    const dist = Math.hypot(s.x - feet[0], s.z - feet[2]);
    assert.ok(dist >= MIN_CAMP_SPAWN_DISTANCE - 1e-6 && dist <= MAX_CAMP_SPAWN_DISTANCE + 1e-6, `in the band: ${dist}`);
    let off = ((Math.atan2(s.x - feet[0], s.z - feet[2]) - yaw) * 180 / Math.PI) % 360;
    if (off > 180) off -= 360; if (off < -180) off += 360;
    assert.ok(Math.abs(off) >= fov - 1e-6 && Math.abs(off) <= fov + 4 + 1e-6, `outside the view, inside the slack: ${off}`);
  }
  // off the built ground the sampler answers -Infinity (world.js heightAt), and the law answers null: the host tries again
  assert.equal(campAnchorSpot({ feet, yawRad: 0, fovDegrees: fov, groundAt: () => -Infinity }), null);
  assert.equal(campAnchorSpot({ feet, yawRad: 0, fovDegrees: fov, groundAt: () => NaN }), null);
  assert.equal(campAnchorSpot({ feet: null, yawRad: 0, fovDegrees: fov, groundAt: flat }), null, 'no feet, no spot');
  // the far anchor is outside the rest interrupt's unseen reach by a wide margin - CAMP1-REST's gate above still holds
  assert.ok(MIN_CAMP_SPAWN_DISTANCE > RESTING_DISTANCE * 8);
});
