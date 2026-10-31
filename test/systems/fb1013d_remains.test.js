// FIELD BUGS 2026-10-13d (Discord #bug-reports, TheHalfinStream: "[ANGRY] Died of fatigue in wayrest palace, character
// aged past limit and remains did not appear"; `01-Overview/bugs/Field-Bugs-2026-10-13d.md`).
//
// REMAINS-STAND. AUDIT LEGACY H1 made the remains a list the record owns, and nothing stood where the fallen fell: the
// list opened by itself within six paces of the very spot underground, with nothing in the world to say where that spot
// was - in Castle Wayrest's halls the heir walked past it. Now the remains stand as a body in the ground pool of the
// host the one played stands in, and the body's list IS the record's (scenes/legacyRemainsStand.js).
// LIVE-FIGHT. The remains' "never in a fight" read the street's foe pools in every mode, frozen while a dungeon or a
// building is mounted: one hostile street walker latched as the heir went in kept the whole visit "in a fight", and the
// list never opened even on the spot. Now the fight is the place the one played stands in.
//
// Fixtures from the producers: the Legacy host (createLegacyHost) over one storage and one tab - its founding, the death
// as the collapse decides it (exhaustionOutcome over areEnemiesNearby) at the one damage door it takes (hurtPlayer -
// SPENT-ASHORE's tenth at each drain since FIELD BUGS 2026-10-13e, where it was DFU's SetHealth(0)), the Succession, the birth, the save door (modSaveRecords, restoreModSaveRecords); a real ground pool
// (createDroppedLoot), the real transfer laws (planTake, planStore, applyTransfer) and the made dungeons' producers (a
// spawn, the Undercroft, the Arena's floor, a medium build); the world host's own reads (legacyHere, legacyInDungeonOf,
// legacyAtPlace, anchorLanding, legacyRemainsFeet, the stand's construction, inFight, the let-go, legacyStep) and the
// dungeon's (its summary, its key, floorAt) run off their own text - over fakes of the world they read: the streamer's
// frame, the colliders' floors, the ground and its lift (the spot's own), the foe pools (a foe there is the motor's
// sense fields, set by hand) and the fights beside them (AUDIT FB1013d C12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLegacyHost, REMAINS_FLAT, LEGACY_TEXT } from '../../src/scenes/legacyHost.js';
import { createRemainsStand, REMAINS_MARK, REMAINS_STAND_OWNER } from '../../src/scenes/legacyRemainsStand.js';
import { createDroppedLoot } from '../../src/scenes/droppedLoot.js';
import { createLootLines, setLootMarksLive } from '../../src/scenes/lootLines.js';
import { MODELS, familyRng } from '../../src/systems/legacy/family.js';
import { _resetModSaveData, modSaveRecords, restoreModSaveRecords } from '../../src/systems/modSaveData.js';
import { LOCATION_TYPES, REGION_NAMES } from '../../src/formats/mapsFile.js';
import { areEnemiesNearby } from '../../src/systems/encounters.js';
import { floorLanding } from '../../src/player/enterExit.js';
import { hurtPlayer, setDeathListener } from '../../src/characters/playerEntity.js';
import { exhaustionOutcome } from '../../src/systems/rest/rest.js';
import { planTake, planStore, applyTransfer } from '../../src/systems/item/itemTransfer.js';
import { isRemainsItem, isHeirloom } from '../../src/systems/legacy/heirloom.js';
import { setItemFields, mintCondition } from '../../src/systems/item/itemTemplates.js';
import { setSilverFinder, silverFindAt, _resetSilverFindsForTests } from '../../src/systems/silverFinds.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { synthesizeDungeonLocation, WORLD_SALT } from '../../src/world/spawnedDungeons.js';
import { arenaFloorLocation } from '../../src/world/arena/arenaFloor.js';
import { ARENA_REGION, ARENA_LOCATION, undercroftLocation } from '../../src/world/arena/arenaCity.js';
import { builtDungeonSize, generateMediumDungeon } from '../../src/world/smallerDungeons.js';

const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const mem = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };

/** AUDIT FB1013d C1: the landforms' lift is the SPOT's (the real one is landformLiftAt's field), so a read at another
 *  spot, in another frame or with x and z swapped stands the body on another floor or none. Scene metres. */
const liftAt = (x, z) => 6 - 1.5 * x + 0.6 * z;
/** Floors a downward ray finds - `[{ y, x0, x1, z0, z1 }]`, the nearest under the origin within `max` (a collider's raycast). */
const raycastOver = (floors) => (o, d, max) => {
  let best = Infinity;
  for (const f of floors()) {
    if (o[0] < f.x0 || o[0] > f.x1 || o[2] < f.z0 || o[2] > f.z1) continue;
    const dd = o[1] - f.y;
    if (dd >= 0 && dd <= max && dd < best) best = dd;
  }
  return best;
};
const everywhere = (y) => ({ y, x0: -1e6, x1: 1e6, z0: -1e6, z1: 1e6 });
/** A recording renderer: the pool's batches, made and freed. */
const renderer = () => { const r = { made: 0, freed: 0 }; return Object.assign(r, { createBillboardBatch: () => { r.made++; return {}; }, destroyBillboardBatch: () => { r.freed++; } }); };
const stubTex = { getSize: () => ({ width: 64, height: 40 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 64, getFrameCount: () => 1 };
const groundPool = () => createDroppedLoot({ renderer: renderer(), getTexture: async () => stubTex, uploadRecordFrame: () => {} });

const CASTLE = Object.freeze({ regionIndex: 23, locationIndex: 7 });
const CASTLE_KEY = 'dungeon:7007';   // its locationKey: `dungeon:<recordElement.header.locationId>`
/** The terrain's scale today (the world host's STREAMING_TERRAIN_SCALE). */
const SCALE = 1.25;
/** The fallen's worn sword - the heirloom, as the game mints one. */
const sword = () => ({ ...mintCondition(setItemFields({ group: 'Weapons', templateIndex: 120, material: 4, flags: 0, variant: 0, message: 0, stackCount: 1 })), equipSlot: 1 });

/** The collapse kills - as the dungeon's own onExhausted asks it: exhaustionOutcome over areEnemiesNearby (no foe near,
 *  an hour on the ground; a hostile one that sees her, SPENT-ASHORE's tenth of her health at each drain to nothing,
 *  through the one damage door, until the drains have spent her) - and the line's Succession raises a newborn heir, who
 *  lands through the birth's own door. PIN MOVED (FIELD BUGS 2026-10-13e SPENT-ASHORE): DFU's OnExhausted SetHealth(0)s
 *  her at the first such collapse (TEXT.RSC 1072), and this helper stood her death on that one; the port's collapse among
 *  foes costs a tenth now, so she dies of the collapses as they come - the same death through the same door, the
 *  Legacy host hearing it as any death. */
function fallAndHeir(t) {
  const seen = { dead: false, ai: { wouldBeSpawned: true, detected: true, inSight: true, targetIsLocalPlayer: true, isHostile: true } };   // the castle turned on her
  assert.equal(exhaustionOutcome({ enemiesNearby: areEnemiesNearby([]), entity: t.e, day: false, inside: true }).kind, 'rest', 'no foe near: the collapse is an hour on the ground');
  const spent = exhaustionOutcome({ enemiesNearby: areEnemiesNearby([seen]), entity: t.e, day: false, inside: true });
  assert.equal(spent.kind, 'spent', 'a hostile foe near: the collapse costs a tenth of her health (SPENT-ASHORE)');
  setDeathListener('projectLegacy', () => t.host.onDeath());
  try {
    let died = false, drains = 0;
    while (!died && drains < 20) { died = hurtPlayer(t.e, spent.damage, { bypassShield: true }); drains++; }
    assert.equal(died, true, 'the collapses are a death');
    assert.equal(drains, Math.ceil(t.e.maxHealth / spent.damage), 'one at each drain to nothing, until her health is spent');
  } finally { setDeathListener('projectLegacy', null); }
  const out = t.host.deathOutcome();
  assert.equal(out.kind, 'fall');
  assert.equal(out.fallen.died.cause, 'years', 'dead of her years: the span was spent');
  assert.equal(t.host.succeed({ newborn: true }), true);
  assert.ok(t.host.takeBorn(t.host.current().id));
  Object.assign(t.e, { characterId: 'c-heir', name: 'Heir', items: [], health: 40 });
  t.host.onBorn();
  assert.equal(t.host.family.pending, null);
  return t.host.family.remains[0];
}
const frame = (t) => t.world.legacyRemainsStand.frame(t.host.remainsToStand());
const pileOf = (pool, row) => pool._piles.find((p) => p.items === row.items) ?? null;

test('AUDIT FB1013d B1: and the dungeon\'s own key and the size it was built at - the Arena\'s Undercroft is its city\'s row on its city\'s pixel, so a death there is no death in Castle Daggerfall nor one in the castle there; a dungeon built at another size (Smaller Dungeons) is another layout and stands none (mutants: the key unkept; the key unread; the size unkept; the size unread; a row without them read as none)', () => {
  // Daggerfall, its castle the city's own row and key, and the Undercroft the city mints (world/arena/arenaCity.js)
  const daggerfallPx = { x: 207, y: 213 };
  const city = {
    name: 'Daggerfall', regionName: 'Daggerfall', regionIndex: ARENA_REGION, locationIndex: ARENA_LOCATION, politic: 0, climate: { worldClimate: 227, climateType: 2 },
    mapTableData: { mapId: 4242, locationType: 0 }, exterior: { recordElement: { header: { x: 1, y: 2 } } },
    hasDungeon: true, dungeon: { recordElement: { header: { locationId: 7007 } }, blocks: [] },
  };
  const under = undercroftLocation(city);
  // SMALLER DUNGEONS: one location built whole and at the medium size (smallerDungeons.js's own regeneration) - two layouts
  const blocks = [...Array.from({ length: 8 }, (_, i) => ({ blockName: `N000000${i}.RDB`, x: i, z: 0, isStartingBlock: i === 0 })), ...Array.from({ length: 4 }, (_, i) => ({ blockName: `B000000${i}.RDB`, x: i, z: 1, isStartingBlock: false }))];
  const keep = { name: 'Old Keep', regionName: 'Wayrest', regionIndex: 23, locationIndex: 12, hasDungeon: true, mapTableData: { mapId: 123457 }, dungeon: { recordElement: { header: { locationId: 8008 } }, blocks } };
  const medium = generateMediumDungeon(keep);
  assert.deepEqual([builtDungeonSize(keep), builtDungeonSize(medium)], ['full', 'medium']);
     
});

test('REMAINS-STAND: the line and the find - its own mark stands its line with the rarity row off, the open zone\'s word never puts it out; it holds no silver find; the hosts by source (mutants: the mark dropped from lootFinds; one word for every kind; the find rolled)', () => {
  _resetForTests(); setPref('lootRarity', false);
  const pool = groundPool();
  const items = [{ group: 'UselessItems2', templateIndex: 1810, name: 'The remains of X' }];
  const stand = createRemainsStand({ pool: () => pool, feetOf: () => [1, 0, 1], icon: REMAINS_FLAT, label: () => 'The remains of X' });
  assert.equal(stand.frame([{ id: 'r1', of: 1, state: 'lying', items, place: {} }]), 1);
  const pile = pool._piles[0];
  const finds = pool.lootFinds();
  assert.deepEqual(finds[0].mark, REMAINS_MARK);
  const calls = [];
  const gl = new Proxy({ ARRAY_BUFFER: 1, STATIC_DRAW: 2, FLOAT: 3, TRIANGLES: 4, BLEND: 5, ONE: 6, CULL_FACE: 7 }, {
    get(o, k) { if (k in o) return o[k]; return (...a) => { calls.push([k, ...a]); if (k === 'getShaderParameter' || k === 'getProgramParameter') return true; if (k === 'getUniformLocation') return a[1]; return {}; }; },
  });
  const pass = createLootLines(gl);
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  setLootMarksLive(true, 'legacy');
  setLootMarksLive(false);   // the open zone's word, every frame online: none of mine there
  assert.equal(pass.draw(() => pool.lootFinds(), I, I, [0, 1.6, 0], 1), true, 'the house\'s word keeps the pass: its line stands');
  assert.equal(pass.draw(() => pool.lootFinds(), I, I, [1, 1.6, 31], 1), true, 'seen across a hall: thirty metres off, its line stands (AUDIT FB1013d C8)');
  setLootMarksLive(false, 'legacy');
  assert.equal(pass.draw(() => pool.lootFinds(), I, I, [0, 1.6, 0], 1), false, 'no word left: off is DFU exactly');
  // no silver find in the remains
  _resetSilverFindsForTests();
  let asked = 0;
  setSilverFinder(() => { asked++; });
  assert.equal(silverFindAt('pile', pile, () => 0), false, 'the remains hold no find');
  assert.equal(silverFindAt('pile', { items: [] }, () => 0), true, 'another container still rolls');
  assert.equal(asked, 1);
  _resetSilverFindsForTests();
  _resetForTests();
});
