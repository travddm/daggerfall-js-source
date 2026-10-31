import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SPAWN_CHANCE, ANY_SPAWN_CHANCE, SPAWN_KEEP, SALT_MAX, WORLD_SALT, hash32, spawnsDungeon, spawnRoll, spawnKept, isEliteSpawn, spawnedMapId, pickTemplate, synthesizeDungeonLocation, spawnTemplates, SPAWN_CLEARANCE_M, BLOCK_M, spawnClearance, spawnedLocationCentreLocal, dungeonSightLine } from '../../src/world/spawnedDungeons.js';
import { worldLaneMapId, SPAWN_WORLD_LANE } from '../../src/world/worldWide/worldLanes.js';   // SPAWN-WORLD
import { TERRAIN_SIZE } from '../../src/world/terrain/terrainSampler.js';
import { isWorldRoom } from '../../src/net/wire.js';
import { getMapPixelID, longitudeLatitudeToMapPixel } from '../../src/formats/mapsFile.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

test('SPAWNED-DUNGEONS: the roll is a pure function of (salt, pixel) and lands near the chance', () => {
  assert.equal(SPAWN_CHANCE, 0.30);
  assert.ok(Math.abs(ANY_SPAWN_CHANCE - 0.40) < 1e-12, '30% normal + 10% elite');
  assert.equal(SPAWN_KEEP, 0.75, 'SPAWN-THIN: a quarter of the band is empty land');
  assert.equal(spawnsDungeon(7, 100, 200), spawnsDungeon(7, 100, 200), 'the same pixel answers the same, load after load');
  let hits = 0, n = 0;
  for (let x = 0; x < 200; x++) for (let y = 0; y < 100; y++) { n++; if (spawnsDungeon(1234, x, y)) hits++; }
  assert.ok(Math.abs(hits / n - ANY_SPAWN_CHANCE * SPAWN_KEEP) < 0.02, `~${ANY_SPAWN_CHANCE * SPAWN_KEEP * 100}% of ${n} pixels, got ${(hits / n).toFixed(3)}`);
  assert.equal(spawnsDungeon(5, 1, 1, 0), false);
  assert.equal(spawnsDungeon(5, 1, 1, 1), true);
  assert.ok(hash32(1, 2, 3) !== hash32(1, 3, 2), 'order matters');
  assert.ok(Number.isInteger(WORLD_SALT) && WORLD_SALT >= 1 && WORLD_SALT <= SALT_MAX, 'the world salt is a legal id salt');
});

test('SPAWN-THIN: a quarter of the band is gone, and a dungeon that remains is the same kind it was', () => {
  let band = 0, gone = 0, eliteKept = 0, normalKept = 0;
  for (let x = 0; x < 200; x++) for (let y = 0; y < 100; y++) {
    if (!(spawnRoll(1, x, y) < ANY_SPAWN_CHANCE)) {
      assert.equal(spawnsDungeon(1, x, y), false);
      continue;
    }
    band++;
    const elite = isEliteSpawn(1, x, y);
    if (!spawnsDungeon(1, x, y)) { assert.equal(spawnKept(1, x, y), false); gone++; continue; }
    assert.equal(spawnKept(1, x, y), true);
    if (elite) eliteKept++; else normalKept++;
  }
  assert.ok(band > 0 && eliteKept > 0 && normalKept > 0, 'both kinds survive');
  assert.ok(Math.abs(gone / band - (1 - SPAWN_KEEP)) < 0.03, `about a quarter of the band gone, ${(gone / band).toFixed(3)}`);
});

test('SPAWNED-DUNGEONS: the id carries the pixel id in its low 20 bits, the salt above, and is a room the relay admits', () => {
  for (const [salt, x, y] of [[1, 0, 0], [4095, 999, 499], [77, 109, 158]]) {
    const id = spawnedMapId(salt, x, y);
    assert.equal(id & 0xfffff, getMapPixelID(x, y), 'MapId & 0xfffff is the pixel, as DFU has it');
    assert.equal(id >>> 20, salt);
    assert.ok(id >= 2 ** 20 && id <= 0xffffffff);
    assert.ok(isWorldRoom(`dungeon:m${id}`), `the relay keeps a world for ${id}`);
  }
  assert.notEqual(spawnedMapId(1, 5, 5), spawnedMapId(2, 5, 5), 'another salt, another id');
  assert.throws(() => spawnedMapId(0, 1, 1), RangeError);
  // PIN MOVED (SPAWN-WORLD, 2026-10-26): past the Bay a spawn's id is the world's spawn lane's over its world pixel key
  // (world/worldWide/worldLanes.js) - the world salt's alone, never a Bay pixel id; another salt, or off the world's
  // grid, none. They threw for every pixel past the Bay, and the build that asked them failed for good (SPAWN-HOLE)
  for (const [x, y] of [[1000, 1], [1, 500], [-1, 1], [2215, -371], [-8191, 8191]]) {
    const id = spawnedMapId(1, x, y);
    assert.equal(id, worldLaneMapId(SPAWN_WORLD_LANE, x, y), `${x},${y}`);
    assert.ok((id & 0xfffff) >= 500000 && (id >>> 20) >= SPAWN_WORLD_LANE, 'its own lane\'s, its low bits no Bay pixel\'s');
    assert.ok(isWorldRoom(`dungeon:m${id}`), `the relay keeps a world for ${id}`);
  }
  assert.throws(() => spawnedMapId(2, 1000, 1), RangeError, 'past the Bay the world salt\'s lane alone');
  assert.throws(() => spawnedMapId(1, 8192, 1), RangeError, 'off the world\'s grid');
  assert.throws(() => spawnedMapId(1, 1000.5, 1), RangeError);
});

test('SPAWNED-DUNGEONS: the clone stands on its pixel under its own id, and the template is never touched', () => {
  const template = {
    name: 'Old Ruin', regionIndex: 3, regionName: 'Daggerfall Bluffs', politic: 131, locationIndex: 12, hasDungeon: true, climate: { climateType: 1 },
    mapTableData: { mapId: 999, longitude: 1, latitude: 2, dungeonType: 4 },
    exterior: { exteriorData: { width: 1, height: 1, locationId: 55, blockNames: ['A.RMB'] } },
    dungeon: { recordElement: { header: { locationId: 55 } }, blocks: [{ blockName: 'B1.RDB' }] },
  };
  const before = JSON.stringify(template);
  const where = { regionIndex: 9, regionName: 'Isle', politic: 137, climate: { climateType: 2 } };
  const c = synthesizeDungeonLocation(template, { salt: 42, px: 300, py: 120, where });
  assert.equal(JSON.stringify(template), before, 'non-mutating');
  const id = spawnedMapId(42, 300, 120);
  assert.equal(c.mapTableData.mapId, id);
  assert.deepEqual(longitudeLatitudeToMapPixel(c.mapTableData.longitude, c.mapTableData.latitude), { x: 300, y: 120 }, 'what dungeonHome() reads for the save lands on the pixel');
  assert.equal(c.mapTableData.dungeonType, 4, 'the rest of the row is the template\'s');
  assert.equal(c.exterior.exteriorData.locationId, id);
  assert.equal(c.dungeon.recordElement.header.locationId, id, 'the room\'s `dungeon:<id>` key and the save\'s');
  assert.equal(c.exterior.exteriorData.blockNames, template.exterior.exteriorData.blockNames, 'the layout is shared, not copied');
  assert.equal(c.dungeon.blocks, template.dungeon.blocks);
  assert.equal(c.name, 'Old Ruin (300,120)');
  assert.notEqual(c.name, synthesizeDungeonLocation(template, { salt: 42, px: 301, py: 120 }).name, 'two spawns of a template never share an automap key');
  assert.equal(c.regionIndex, 9); assert.equal(c.climate, where.climate); assert.equal(c.politic, 137);
  assert.equal(c.locationIndex, -1, 'no real table row');
  assert.equal(c.hasDungeon, true); assert.equal(c.spawned, true);
  assert.equal(synthesizeDungeonLocation(template, { salt: 42, px: 300, py: 120 }).regionIndex, 3, 'no `where`: the template\'s');
});

test('SPAWNED-DUNGEONS: the template pick is deterministic and an empty list picks nothing', () => {
  const t = ['a', 'b', 'c', 'd'];
  assert.equal(pickTemplate(t, 9, 10, 20), pickTemplate(t, 9, 10, 20));
  assert.ok(t.includes(pickTemplate(t, 9, 10, 20)));
  assert.equal(pickTemplate([], 9, 10, 20), null);
  assert.equal(pickTemplate(null, 9, 10, 20), null);
  assert.ok(new Set(Array.from({ length: 200 }, (_, i) => pickTemplate(t, 9, i, 0))).size > 1, 'the pixels do not all pick one');
});

test('SPAWNED-DUNGEONS: templates are real non-main-story dungeons, one-block exteriors first', () => {
  const L = (mapId, w, h, over = {}) => ({ hasDungeon: true, mapTableData: { mapId }, exterior: { exteriorData: { width: w, height: h } }, dungeon: { blocks: [{}] }, ...over });
  const big = L(1, 2, 2), one = L(2, 1, 1), main = L(3, 1, 1), town = L(4, 1, 1, { hasDungeon: false }), empty = L(5, 1, 1, { dungeon: { blocks: [] } }), spawned = L(6, 1, 1, { spawned: true });
  assert.deepEqual(spawnTemplates([big, one, main, town, empty, spawned, null], (id) => id === 3), [one]);
  assert.deepEqual(spawnTemplates([big], () => false), [big], 'no one-block exterior: a two-block one still clears 300 m');
  assert.deepEqual(spawnTemplates(null), []);
  // SPAWNED-DUNGEONS3: the clearance is the gate, and there is no fallback past it
  const wide = L(7, 3, 1), tall = L(8, 1, 3);
  assert.deepEqual(spawnTemplates([wide, tall], () => false), [], 'three blocks on either axis leaves 256 m: never a template, even when nothing else is');
  assert.deepEqual(spawnTemplates([wide, big, tall], () => false), [big], 'the two-block one alone');
});

test('SPAWNED-DUNGEONS3: a spawn stands CENTRED in its pixel, so a walk-in is always 300+ metres from it - the clearance gate on the template is what keeps it so', () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ~ ${b}`);
  assert.equal(SPAWN_CLEARANCE_M, 300);
  near(TERRAIN_SIZE, 819.2, 'a pixel');
  near(BLOCK_M, 102.4, 'a block');
  // the clearance is metres from the pixel's edge to the exterior's nearest edge, on the tighter axis
  near(spawnClearance(1, 1), 358.4);
  near(spawnClearance(2, 2), 307.2);
  near(spawnClearance(1, 2), 307.2, 'the taller axis decides');
  near(spawnClearance(3, 1), 256, 'three blocks: under the rule');
  near(spawnClearance(8, 8), 0);
  assert.ok(spawnClearance(2, 2) >= SPAWN_CLEARANCE_M && spawnClearance(3, 3) < SPAWN_CLEARANCE_M, 'two blocks is the widest template the rule admits');
  // the centre, in the pixel's local frame: a one-block exterior at tiles 56..72 is centred at 409.6 on both axes
  const L = (w, h) => ({ exterior: { exteriorData: { width: w, height: h, blockNames: ['X'] } } });
  for (const v of [...spawnedLocationCentreLocal(L(1, 1)), ...spawnedLocationCentreLocal(L(2, 2))]) near(v, 409.6, 'centred');
  // A PIN THAT FAILS: the nearest a player can be to the exterior on entering the pixel is at the middle of an edge.
  // For every admitted template that is >= 300 m to the exterior's edge and > 400 m to its centre; a 3x3 breaks it.
  for (const [w, h] of [[1, 1], [2, 2], [1, 2], [2, 1]]) {
    const [cx, cz] = spawnedLocationCentreLocal(L(w, h));
    const fromSouth = Math.hypot(cx - TERRAIN_SIZE / 2, cz - 0);   // entering at the middle of the south edge
    const fromWest = Math.hypot(cx - 0, cz - TERRAIN_SIZE / 2);    // ...or the west edge
    const toEdge = Math.min(fromSouth - (h * BLOCK_M) / 2, fromWest - (w * BLOCK_M) / 2);   // to the exterior's nearest edge, the tighter way in
    assert.ok(toEdge >= SPAWN_CLEARANCE_M, `${w}x${h}: ${toEdge} m to the exterior`);
    assert.ok(Math.min(fromSouth, fromWest) >= TERRAIN_SIZE / 2, `${w}x${h}: ${Math.min(fromSouth, fromWest)} m to the centre`);
    near(toEdge, spawnClearance(w, h), 'and that is exactly what the gate measures');
  }
  const [, cz3] = spawnedLocationCentreLocal(L(3, 3));
  assert.ok(cz3 - (3 * BLOCK_M) / 2 < SPAWN_CLEARANCE_M, 'a three-block exterior would break the rule, which is why the gate refuses it');
});

test('SPAWNED-DUNGEONS3: the line names the distance to the nearest ten metres and the compass word - talk.js\'s own eight bands, off the scene delta (east, north)', async () => {
  const { directionHintString } = await import('../../src/systems/talk/talk.js');
  assert.equal(dungeonSightLine(409.6, 'North'), 'You see a Dungeon 410 meters to the North!');
  assert.equal(dungeonSightLine(354.9, 'Southwest'), 'You see a Dungeon 350 meters to the Southwest!');
  assert.equal(dungeonSightLine(3, 'East'), 'You see a Dungeon 10 meters to the East!', 'never a zero');
  // scene x east-positive, scene z north-positive: fed straight in
  assert.equal(directionHintString(1, 0), 'east');
  assert.equal(directionHintString(0, 1), 'north');
  assert.equal(directionHintString(0, -1), 'south');
  assert.equal(directionHintString(-1, -1), 'southwest');
  assert.equal(directionHintString(300, 300), 'northeast');
});

// ── TTL1: THE TWO CLOCKS ──────────────────────────────────────────
//
// The creator's rule, relayed by Mac (2026-09-20): "Spawned Dungeons
// should expire/removed after 2 ingame days when cleared when there is
// no player in it - and after 7 ingame days in general when there is
// no player in it."

test('TTL1: two days cleared, seven days in general, whichever runs out first', async () => {
  const { spawnExpired, CLEARED_TTL_MINUTES, GENERAL_TTL_MINUTES, CLEARED_TTL_DAYS, GENERAL_TTL_DAYS } = await import('../../src/world/spawnedDungeons.js');
  const { MINUTES_PER_DAY } = await import('../../src/systems/gameDate.js');
  assert.equal(CLEARED_TTL_DAYS, 2); assert.equal(GENERAL_TTL_DAYS, 7);
  assert.equal(CLEARED_TTL_MINUTES, 2 * MINUTES_PER_DAY, 'a day is the clock\'s own, never a second 1440');
  assert.equal(GENERAL_TTL_MINUTES, 7 * MINUTES_PER_DAY);
  const D = (n) => n * MINUTES_PER_DAY;
  // the long clock, never touched
  assert.equal(spawnExpired({ seen: 0 }, D(6)), false, 'day six: still there');
  assert.equal(spawnExpired({ seen: 0 }, D(7) - 1), false);
  assert.equal(spawnExpired({ seen: 0 }, D(7)), true, 'day seven in general');
  // the short clock, started at the clearing
  assert.equal(spawnExpired({ seen: 0, cleared: D(1) }, D(2)), false, 'cleared day one: one day of its two');
  assert.equal(spawnExpired({ seen: 0, cleared: D(1) }, D(3)), true, 'two days after the clearing');
  // clearing NEVER buys more life than the long clock allows
  assert.equal(spawnExpired({ seen: 0, cleared: D(6) }, D(7)), true, 'cleared on day six is still gone on day seven, not day eight');
  // nothing is expired by a clock that has not run
  assert.equal(spawnExpired(null, D(99)), false);
  assert.equal(spawnExpired({}, D(99)), false, 'a row with no `seen` is one this ledger never met');
  assert.equal(spawnExpired({ seen: 0 }, NaN), false);
  // an older save winds the clock BACK; a negative elapsed is never expiry
  assert.equal(spawnExpired({ seen: D(50) }, D(1)), false);
  assert.equal(spawnExpired({ seen: 0, cleared: D(50) }, D(1)), false);
});

test('TTL1: the ledger starts each clock ONCE - a later sight or a second clearing buys nothing', async () => {
  const { createSpawnLedger, GENERAL_TTL_MINUTES, CLEARED_TTL_MINUTES } = await import('../../src/world/spawnedDungeons.js');
  const L = createSpawnLedger();
  L.note('5,5', 100);
  L.note('5,5', 100 + GENERAL_TTL_MINUTES - 1);   // walked past it again on day six
  assert.equal(L.expired('5,5', 100 + GENERAL_TTL_MINUTES), true, 'seeing it again did not restart the seven days');
  assert.equal(L.size, 1);
  const M = createSpawnLedger();
  M.note('1,2', 0);
  M.clear('1,2', 10);
  M.clear('1,2', 10 + CLEARED_TTL_MINUTES - 1);   // walked back into a dungeon already emptied
  assert.equal(M.expired('1,2', 10 + CLEARED_TTL_MINUTES), true, 'a second clearing did not buy another two days');
  assert.equal(M.expired('9,9', 10 ** 9), false, 'a pixel this ledger never met is not expired');
  assert.equal(M.clear('7,7', 50).seen, 50, 'clearing something unseen still starts both clocks');
  assert.equal(M.note('', 1), null); assert.equal(M.note('a', NaN), null); assert.equal(M.clear('a', NaN), null);
  assert.equal(M.forget('1,2'), true); assert.equal(M.forget('1,2'), false);
  assert.equal(M.expired('1,2', 10 ** 9), false, 'forgotten is gone for good, not expired forever');
});

test('TTL1: the ledger round-trips through a save', async () => {
  const { createSpawnLedger } = await import('../../src/world/spawnedDungeons.js');
  const L = createSpawnLedger();
  L.note('1,1', 10); L.note('2,2', 20); L.clear('2,2', 30);
  assert.deepEqual(L.toJSON(), [['1,1', 10], ['2,2', 20, 30]], 'the cleared time is only written when there is one');
  const M = createSpawnLedger();
  assert.equal(M.load(L.toJSON()), 2);
  assert.deepEqual(M.toJSON(), L.toJSON());
  assert.equal(M.load([['x', 'nope'], [7, 1], []]), 0, 'junk rows are dropped, not loaded');
  assert.equal(M.load(null), 0, 'a save with no ledger loads an empty one');
});

// ── SPAWN-REBIRTH: A DEAD SPAWN STANDS AGAIN ──────────────────────
//
// A player's lockout report (2026-10-12) and Mac: "Do all 3" - the long
// clock starts on ENTRY, a dead spawn stands again twenty-four real
// hours after it died, and no ledger keeps a life that is over.

test('SPAWN-REBIRTH: a spawn dies on the earlier of its clocks and stands again REBIRTH_TTL_DAYS later - twenty-four real hours of the online clock; expired means dead and not yet back', async () => {
  const { spawnDeath, spawnReborn, spawnExpired, REBIRTH_TTL_DAYS, REBIRTH_TTL_MINUTES, GENERAL_TTL_MINUTES } = await import('../../src/world/spawnedDungeons.js');
  const { MINUTES_PER_DAY } = await import('../../src/systems/gameDate.js');
  const { ONLINE_MINUTES_PER_MS } = await import('../../src/net/wire.js');
  assert.equal(REBIRTH_TTL_DAYS, 12);
  assert.equal(REBIRTH_TTL_MINUTES, 12 * MINUTES_PER_DAY, 'a day is the clock\'s own');
  assert.equal(REBIRTH_TTL_MINUTES, 24 * 3600 * 1000 * ONLINE_MINUTES_PER_MS, 'twenty-four real hours online');
  const D = (n) => n * MINUTES_PER_DAY;
  assert.equal(spawnDeath({ seen: 0 }), D(7), 'never cleared: seven days from its first entry');
  assert.equal(spawnDeath({ seen: 0, cleared: D(1) }), D(3), 'cleared on day one: two days on');
  assert.equal(spawnDeath({ seen: 0, cleared: D(6) }), D(7), 'cleared on day six: the long clock still ends it first');
  assert.ok(Number.isNaN(spawnDeath(null)) && Number.isNaN(spawnDeath({})), 'no clock started: no death');
  assert.equal(spawnReborn({ seen: 0 }, D(19) - 1), false);
  assert.equal(spawnReborn({ seen: 0 }, D(19)), true, 'seven days, then twelve');
  assert.equal(spawnReborn({ seen: 0, cleared: D(1) }, D(15) - 1), false);
  assert.equal(spawnReborn({ seen: 0, cleared: D(1) }, D(15)), true, 'cleared: two days, then twelve');
  assert.equal(spawnReborn({ seen: 0 }, NaN), false, 'no clock: nothing comes back');
  assert.equal(spawnReborn({ seen: D(50) }, D(1)), false, 'a clock wound back is no wait served');
  assert.equal(spawnExpired({ seen: 0 }, GENERAL_TTL_MINUTES + REBIRTH_TTL_MINUTES - 1), true, 'dead the whole wait');
  assert.equal(spawnExpired({ seen: 0 }, GENERAL_TTL_MINUTES + REBIRTH_TTL_MINUTES), false, 'and back when it is over');
  assert.equal(spawnExpired({ seen: 0, cleared: D(1) }, D(15)), false);
});

test('SPAWN-REBIRTH: the ledger reads a life that is over as no row - an entry starts the new life over it, a clear too; has() asks for the current life alone', async () => {
  const { createSpawnLedger, GENERAL_TTL_MINUTES, CLEARED_TTL_MINUTES, REBIRTH_TTL_MINUTES } = await import('../../src/world/spawnedDungeons.js');
  const back = GENERAL_TTL_MINUTES + REBIRTH_TTL_MINUTES;
  const L = createSpawnLedger();
  L.note('5,5', 0);
  assert.equal(L.has('5,5', back - 1), true, 'dead, waiting: its row is the current life\'s');
  assert.equal(L.note('5,5', back - 1).seen, 0, 'an entry inside the wait starts nothing');
  assert.equal(L.has('5,5', back), false, 'stood again: the old row is no row');
  assert.equal(L.has('9,9', 0), false, 'a pixel never met');
  assert.equal(L.note('5,5', back + 3).seen, back + 3, 'the new life\'s first entry');
  assert.equal(L.expired('5,5', back + 3 + GENERAL_TTL_MINUTES - 1), false);
  assert.equal(L.expired('5,5', back + 3 + GENERAL_TTL_MINUTES), true, 'on its own seven days');
  assert.equal(L.size, 1);
  const M = createSpawnLedger();
  M.note('1,2', 0); M.clear('1,2', 10);
  const r = M.clear('1,2', 10 + CLEARED_TTL_MINUTES + REBIRTH_TTL_MINUTES);
  assert.deepEqual([r.seen, r.cleared], [10 + CLEARED_TTL_MINUTES + REBIRTH_TTL_MINUTES, 10 + CLEARED_TTL_MINUTES + REBIRTH_TTL_MINUTES], 'cleared in a new life: both its clocks are the new life\'s');
});

test('SPAWN-REBIRTH: merge at a clock - a heard row of a life that is over is taken as none, and a held one gives way to a later life\'s row (the report\'s veteran, who refused a newer player\'s spawn for good); without a clock it min-merges as OW6L did', async () => {
  const { createSpawnLedger, GENERAL_TTL_MINUTES, REBIRTH_TTL_MINUTES } = await import('../../src/world/spawnedDungeons.js');
  const back = GENERAL_TTL_MINUTES + REBIRTH_TTL_MINUTES;
  const vet = createSpawnLedger();
  vet.note('4,4', 0);
  assert.equal(vet.merge('4,4', back + 100, undefined, back + 200), true, 'a later life\'s first entry is taken over the veteran\'s old row');
  assert.deepEqual(vet.toJSON(), [['4,4', back + 100]]);
  assert.equal(vet.merge('4,4', 0, undefined, back + 200), false, 'a heard row of a life that is over is none - it never ends the new one');
  assert.deepEqual(vet.toJSON(), [['4,4', back + 100]]);
  assert.equal(vet.merge('8,8', 0, 5, 5 + back), false, 'nor is it made where none is held');
  assert.equal(vet.size, 1);
  const old = createSpawnLedger();
  old.note('4,4', 0);
  assert.equal(old.merge('4,4', back + 100), false, 'no clock: min-merged as OW6L did - the earlier entry kept');
  assert.deepEqual(old.toJSON(), [['4,4', 0]]);
});

test('SPAWN-REBIRTH: a save carries no life that is over - toJSON leaves out every row whose spawn has stood again by the clock the ledger was last asked at, and keeps them all when no clock was asked since it was made or loaded (AUDIT SPAWN-REBIRTH F4: the last clock, never a high mark; a load forgets it)', async () => {
  const { createSpawnLedger, GENERAL_TTL_MINUTES, REBIRTH_TTL_MINUTES } = await import('../../src/world/spawnedDungeons.js');
  const back = GENERAL_TTL_MINUTES + REBIRTH_TTL_MINUTES;
  const rows = [['1,1', 0], ['2,2', 500], ['3,3', 0, 1]];
  const L = createSpawnLedger();
  L.load(rows);
  assert.deepEqual(L.toJSON(), rows, 'no clock asked (an offline session never reads these): every row kept');
  L.expired('9,9', back + 100);
  assert.deepEqual(L.toJSON(), [['2,2', 500]], 'asked at a later clock: the lives that are over are left out');
  assert.equal(L.size, 3, 'the rows themselves are held until a new life replaces them');
  L.expired('9,9', 50);
  assert.deepEqual(L.toJSON(), rows, 'AUDIT F4: the clock last asked - a clock read fast and corrected leaves no row out on its high mark');
  L.expired('9,9', back + 100);
  L.load(rows);
  assert.deepEqual(L.toJSON(), rows, 'AUDIT F4: a load forgets the clock - nothing judged until it is asked again');
});

test('TTL1: the ledger rides EVERY save - and the quickslots block it sat beside was being dropped', async () => {
  const { snapshotPlayer, composeSessionState, restoreSessionState } = await import('../../src/systems/save/save.js');
  const { createSpawnLedger } = await import('../../src/world/spawnedDungeons.js');
  const L = createSpawnLedger();
  L.note('9,9', 4000); L.clear('9,9', 5000);
  const extras = composeSessionState({ spawnLedger: L });
  assert.deepEqual(extras.spawns, [['9,9', 4000, 5000]]);
  assert.equal(composeSessionState({}).spawns, null, 'no ledger (the standalone ?dungeon scene): no block');
  // snapshotPlayer drops any option it does not NAME - which is what
  // had been happening to QS1's quickslots since it landed
  const snap = snapshotPlayer({ name: 'x', stats: {} }, { ...extras, quickslots: { left: 3 } });
  assert.deepEqual(snap.spawns, extras.spawns, 'the block survives the envelope');
  assert.deepEqual(snap.quickslots, { left: 3 }, 'QS1: so does the quickslot diamond, which used to be dropped in silence');
  const M = createSpawnLedger();
  restoreSessionState(snap, { spawnLedger: M });
  assert.deepEqual(M.toJSON(), L.toJSON(), 'both clocks come back where they were');
  M.load([['x', 1]]);
  restoreSessionState({}, { spawnLedger: M });
  assert.equal(M.size, 0, 'a pre-TTL1 save loads an empty ledger - every spawn simply starts its seven days over');
  assert.doesNotThrow(() => restoreSessionState({}, {}), 'no ledger passed: the same no-op every other block takes');
});

