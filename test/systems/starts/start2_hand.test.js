// START2: THE COMMISSION IN HAND, THE START HOST, AND THE SEA LANES - the commission in hand for a character born at no start,
// the world's start host (Privateer's Hold's start where the boot stood it, the commission in hand anywhere else), and the
// sea lanes a voyage past the Bay sails. The contract every start keeps is START1's test's, run for every name in
// START_QUESTS. Where ARENA2_PATH names the game's data, the freeware's own Tamriel: a voyage to Daggerfall from the water
// about each port past the Bay.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { HAND_START_QUEST } from '../../../src/systems/starts/starts.js';
import { createStartsHost } from '../../../src/scenes/startsHost.js';
import { sheetFor } from '../../../src/systems/questlines/qlSheets.js';
import { planRoute, planSeaLanes, LANE_CELL, LANE_MARGIN } from '../../../src/systems/travel/travelRoute.js';
import { FACTION_TYPES } from '../../../src/formats/factionFile.js';
import { BUILDING_TYPES } from '../../../src/world/buildingNames.js';
import { ROOT, packMachine, loadTables } from '../../qlSources.mjs';
import { town, dungeon, rmbBlock, worldOf, SPAWN, ITEM } from '../../fb1004dTowns.mjs';

const DAY = 86400;
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── the commission in hand ───────────────────────────────────────

// Privateer's Hold as the Bay has it (_BRISIEN names it), the city of Daggerfall, Woodcroft Hall where Lady Brisienna can
// take a room, a farm - and the wilds (the farm's pixel) a character born at no start stands in.
const FLAT = (record, x, y, z) => ({
  type: 3,
  position: record,
  xPos: x,
  yPos: y,
  zPos: z,
  resources: { flatResource: { textureArchive: 199, textureRecord: record } },
});
const BLOCK = {
  position: 0,
  rdbBlock: { objectRootList: [{ rdbObjects: [FLAT(ITEM, 800, -40, 1200), FLAT(SPAWN, 200, -40, 300)] }] },
};
function harness() {
  loadTables();
  const city = town({ name: 'Daggerfall', locationIndex: 0, mapId: 1291010263, grid: ['CITY.RMB'] });
  city.exterior.exteriorData.locationId = 0xc36a;
  const inn = town({ name: 'Woodcroft Hall', locationIndex: 1, mapId: 5002, grid: ['INN.RMB'] });
  inn.exterior.buildings.push({ buildingType: BUILDING_TYPES.Tavern, factionId: 0, nameSeed: 100, quality: 10 });
  const farm = town({ name: 'Ashwick Farm', locationIndex: 2, mapId: 5003, grid: ['FARM.RMB'] });
  const hold = dungeon({
    name: "Privateer's Hold",
    locationIndex: 3,
    mapId: 187853213,
    dungeonType: 0,
    block: 'S0000999.RDB',
  });
  hold.exterior.exteriorData.locationId = 0xc381;
  const locations = [city, inn, farm, hold];
  const blocks = new Map([
    ['S0000999.RDB', BLOCK],
    ['CITY.RMB', rmbBlock('CITY.RMB', [{ type: BUILDING_TYPES.Palace }])],
    ['INN.RMB', rmbBlock('INN.RMB', [{ type: BUILDING_TYPES.Tavern }])],
    ['FARM.RMB', rmbBlock('FARM.RMB', [{ type: BUILDING_TYPES.House1 }])],
  ]);
  const where = { loc: farm, inside: null };
  const said = [],
    discovered = [],
    removed = [],
    given = [];
  const base = worldOf({ locations, blocks });
  const world = {
    ...base,
    getFactionData: (id) => ({ ...base.getFactionData(id), type: FACTION_TYPES.Individual }),
    currentLocation: () => where.loc,
    playerInside: () => where.inside,
    isPlayerInLocationRect: () => !where.inside,
    currentLocationIndex: () => locations.indexOf(where.loc),
    discoverLocation: (_r, l) => discovered.push(l),
    mountCurrentSiteQuestResources: () => {},
  };
  const now = { s: 1e6 };
  const m = packMachine({
    nowSeconds: () => now.s,
    skySeconds: () => 100 * DAY + 12 * 3600,
    world,
    showPopup: (q, tokens) =>
      said.push({
        quest: q.questName,
        text: (tokens ?? [])
          .map((t) => t.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      }),
    isPlayerInTown: () => !where.inside,
    giveItemToPlayer: (it) => given.push(it),
    removeItemFromPlayer: (it) => removed.push(it),
    carriesQuestItem: () => true,
  });
  const at = (p) => {
    where.loc = p === 'city' ? city : farm;
    where.inside = null;
  };
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now.s += 60;
      m.tick();
    }
  };
  const quest = (name) => [...m.quests.values()].find((q) => q.questName === name && !q.questTombstoned) ?? null;
  return { m, at, tick, quest, said, discovered, removed, given };
}
const logOf = (q) => [...q.activeLogMessages.values()].map((l) => [l.stepID, l.messageID]);

test("START2 the commission in hand (_STARTHD): a character born at no start holds it from the first tick - given, never a reward's window - and the same gate begins the main quest in Daggerfall (mutants: given by `give pc`, the gate)", () => {
  const p = harness();
  p.at('wilds');
  const q = p.m.startQuestByName(HAND_START_QUEST);
  p.tick(2);
  assert.equal(p.given.length, 1, 'in the pack');
  assert.match(p.said[0]?.text ?? '', /pressed an oilskin case into your hands/);
  assert.deepEqual(logOf(q), [[0, 1010]]);
  assert.doesNotMatch(
    rd('src/systems/starts/quests/_STARTHD.txt'),
    /give pc/,
    "given by `get item`: GivePc's plain form is a reward's window, its silent one waits for a town by day",
  );
  assert.doesNotMatch(
    rd('src/systems/starts/quests/_STARTHD.txt'),
    /writ of passage/i,
    "no passage is promised: the Crown's writ left with the provinces' starts",
  );
  q.getItem({ name: 'commission' }).useClicked = true;
  p.tick(1);
  assert.deepEqual(p.discovered, ['Daggerfall']);
  p.at('city');
  p.tick(5);
  assert.equal(p.quest(HAND_START_QUEST), null);
  assert.ok(p.quest('_BRISIEN'));
  const sheet = sheetFor(HAND_START_QUEST);
  assert.deepEqual(
    sheet.objectives.map((o) => o.id),
    ['open', 'report'],
  );
});

// ── the world's start host ───────────────────────────────────────

test("START2 the start host: Privateer's Hold's start where the boot stood the Hold (?classic), the commission in hand anywhere else; begun once, then settled (mutants: the classic read backwards, begun twice)", async () => {
  const run = async (params) => {
    const then = [];
    const h = createStartsHost({ params: new URLSearchParams(params), machine: () => null });
    h.begin((q) => then.push(q));
    h.begin((q) => then.push(q));
    await h.settled;
    return then;
  };
  assert.deepEqual(await run('classic=1'), ['_STARTIB']);
  assert.deepEqual(await run('world=1'), [HAND_START_QUEST], 'a character the boot stood elsewhere');
});

// ── the sea lanes ────────────────────────────────────────────────

test("START2 LONG-VOYAGE (travelRoute.js planSeaLanes): a booked voyage whose port lies past the Bay's table sails round the land the box planner cannot leave its bounds to pass - from her helm, every step a boat's, ashore only at her port; another boat's crossing takes the lanes only where the box found none; a traveller ashore never (mutants: the lanes unasked, a step through a corner, the landfall anywhere)", () => {
  // a sea with one wall of land from y -250 south past the table's foot, a harbor isle at the port, the ship north-east
  const wall = (x, y) => x >= 600 && x <= 640 && y >= -250 && y <= 2000; // the south shut past the lanes' own box
  const isle = (x, y) => Math.abs(x - 200) <= 1 && Math.abs(y - 200) <= 1;
  const isWater = (x, y) => !wall(x, y) && !isle(x, y);
  const from = { x: 1500, y: -100 },
    to = { x: 200, y: 200 };
  const voyage = { start: 'sea', goal: 'land', voyage: true, again: false };
  assert.equal(
    planRoute(from, to, { isWater, sea: voyage, lanes: false, margins: [6, 20, 60] }),
    null,
    "the box's own rungs find none",
  );
  const plan = planRoute(from, to, { isWater, sea: voyage });
  assert.ok(plan, 'the lanes do');
  assert.deepEqual(plan.pixels[0], from);
  assert.deepEqual(plan.pixels.at(-1), to);
  assert.equal(plan.kinds.length, plan.pixels.length - 1);
  assert.ok(
    Math.min(...plan.pixels.map((p) => p.y)) < -250,
    "round the wall's north end, past the box's bounds (the map and its two ends: y -100 at the least)",
  );
  for (let i = 1; i < plan.pixels.length; i++) {
    const a = plan.pixels[i - 1],
      b = plan.pixels[i];
    assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1, 'one pixel a step');
    if (plan.kinds[i - 1] === 'sea') {
      assert.ok(isWater(b.x, b.y), 'sailed on water');
      assert.ok(
        a.x === b.x || a.y === b.y || isWater(b.x, a.y) || isWater(a.x, b.y),
        'never through a corner of the land',
      );
    }
  }
  const fall = plan.kinds.indexOf('landfall');
  assert.ok(fall > 0 && plan.kinds.slice(0, fall).every((k) => k === 'sea'), 'sailed all the way');
  assert.ok(
    plan.kinds.slice(fall + 1).every((k) => ['road', 'track', 'open'].includes(k)),
    'ashore once, then walked',
  );
  const ashoreAt = plan.pixels[fall];
  assert.ok(Math.max(Math.abs(ashoreAt.x - to.x), Math.abs(ashoreAt.y - to.y)) <= 3);
  // a boat of my own at her helm: the box first, the lanes when it finds none
  const mine = planRoute(from, to, {
    isWater,
    sea: { start: 'sea', goal: 'land', again: false },
    margins: [6, 20, 60],
  });
  assert.ok(mine && mine.kinds.includes('landfall'));
  assert.equal(
    planSeaLanes(from, to, { isWater, sea: { start: 'land', goal: 'land' } }),
    null,
    'ashore with a boat to hand: never the lanes',
  );
  assert.equal(planSeaLanes(from, { x: 620, y: 0 }, { isWater, sea: voyage }), null, 'a port with no water about it');
  assert.ok(LANE_MARGIN > 250 && LANE_CELL === 8);
});

// ── the game's own Tamriel ───────────────────────────────────────

const ARENA2 = process.env.ARENA2_PATH;
const VOYAGE_CELLS_MAX = 450000; // measured 392,822 and 393,363 (the two floods and the lanes): some twenty frames at PLAN_FRAME_CELLS
const HAVE =
  !!ARENA2 &&
  ['MAPS.BSA', 'BLOCKS.BSA', 'WOODS.WLD', 'TMAP00I0.IMG', 'TAMRIEL2.IMG', 'ART_PAL.COL'].every((f) =>
    existsSync(join(ARENA2, f)),
  );
const skipReal = HAVE ? false : 'ARENA2_PATH not set or missing - real-data validation skipped';

/** The freeware's Tamriel as the world host reads it: the trace at its fit, the ground past the Bay, the lairs' rows,
 *  rates and blocks, and the host's own place module over them (scenes/tamrielPlacesHost.js). */
async function realTamriel() {
  const { DFPalette } = await import('../../../src/formats/dfPalette.js');
  const { preloadTamrielTrace } = await import('../../../src/ui/tamrielTrace.js');
  const { setTamrielTrace } = await import('../../../src/world/tamriel/tamrielLand.js');
  const { setTamrielFit } = await import('../../../src/world/tamriel/tamrielFrame.js');
  const { WoodsFile } = await import('../../../src/formats/woodsFile.js');
  const { groundWoods, groundClimateIndex } = await import('../../../src/world/tamriel/tamrielGround.js');
  const { countryCounts, countryTemplates } = await import('../../../src/world/tamrielCountry.js');
  const { lairTemplates, lairPools } = await import('../../../src/world/tamrielDungeons.js');
  const { isMainStoryDungeon } = await import('../../../src/world/dungeon/dungeonTextures.js');
  const { createTamrielPlaces } = await import('../../../src/scenes/tamrielPlacesHost.js');
  const { loadMaps, loadBlocks } = await import('../../arena1Data.mjs');
  const fb = async (n) => new Uint8Array(readFileSync(join(ARENA2, n)));
  const pal = new DFPalette();
  pal.load(await fb('ART_PAL.COL'), 'ART_PAL.COL');
  setTamrielTrace(await preloadTamrielTrace({ fetchBytes: fb, palette: pal }));
  setTamrielFit({ ox: 38 * 15.5, oy: 57 * 15.5, ppu: 15.5 }); // the freeware's fit (test/ui/tamriel4.test.js)
  const maps = loadMaps(),
    blocks = loadBlocks();
  const bayClimate = maps.getClimateIndex.bind(maps);
  const rows = [];
  for (let r = 0; r < maps.regionCount; r++) {
    const reg = maps.getRegion(r);
    if (reg)
      for (let l = 0; l < reg.locationCount; l++) {
        const loc = maps.getLocation(r, l);
        if (loc) rows.push(loc);
      }
  }
  const _countryTemplates = countryTemplates(rows, isMainStoryDungeon); // the lairs stand under the countryside's door (world.js)
  const _countryCounts = countryCounts(_countryTemplates, bayClimate);
  const _lairTemplates = lairTemplates(rows, isMainStoryDungeon);
  const _lairCounts = countryCounts(_lairTemplates, bayClimate);
  maps.getClimateIndex = groundClimateIndex(bayClimate);
  const w = new WoodsFile();
  w.load(await fb('WOODS.WLD'));
  const woods = groundWoods(w);
  const locationIndex = new Map();
  let gen = 0;
  const places = createTamrielPlaces({
    _arenaTemplates: null,
    _capitalBase: null,
    _capitalNames: null,
    _countryCounts,
    _countryTemplates,
    _lairCounts,
    _lairPools: lairPools(_lairTemplates),
    _lairTemplates,
    arenaJoinLand: null,
    arenaRoadsLanded: null,
    blocks,
    locationIndex,
    maps,
    tamrielLand: null,
    terrainGen: null,
    woodsBytes: null,
    get _locIndexGen() {
      return gen;
    },
    set _locIndexGen(v) {
      gen = v;
    },
    get woods() {
      return woods;
    },
  });
  return {
    places,
    blocks,
    maps,
    woods,
    w,
    locationIndex,
    reset: () => {
      setTamrielTrace(null);
      setTamrielFit(null);
    },
  };
}

test(
  "START2 on the freeware's Tamriel: a voyage from every port past the Bay to the city of Daggerfall sails the lanes - its port reached, ashore only there, each planned in under three seconds (mutants: the lanes' margin, the floods)",
  { skip: skipReal },
  async () => {
    const t = await realTamriel();
    try {
      const { routeGround } = await import('../../../src/systems/travel/travelRoute.js');
      const { WATER_BYTE } = await import('../../../src/world/roadsProducer.js');
      const { longitudeLatitudeToMapPixel } = await import('../../../src/formats/mapsFile.js');
      const { arenaPixels, setArenaStanding } = await import('../../../src/world/arenaPlaces.js');
      setArenaStanding(true);
      try {
        const rg = routeGround(
          t.maps.getClimateIndex,
          (x, y) => t.w.getHeightMapValue(x, y),
          WATER_BYTE,
          1000,
          500,
          (x, y) => t.woods.getHeightMapValue(x, y) > WATER_BYTE,
        );
        const df = t.maps.getLocationByName('Daggerfall', 'Daggerfall');
        const dp = longitudeLatitudeToMapPixel(df.mapTableData.longitude, df.mapTableData.latitude);
        const voyage = { start: 'sea', goal: 'land', voyage: true, again: false };
        // every port past the Bay - the provinces' starts' ways home among them - from the water about it a voyage reaches
        const ports = arenaPixels().stood.filter((p) => p.port);
        assert.equal(ports.length, 28, "TESA12's 28 ports");
        let most = 0;
        for (const p of ports) {
          let routed = null;
          for (let dy = -3; dy <= 3 && !routed; dy++)
            for (let dx = -3; dx <= 3 && !routed; dx++) {
              const f = { x: p.bx + dx, y: p.by + dy };
              if (!rg.isWater(f.x, f.y)) continue;
              const tally = { n: 0 };
              const plan = planRoute(f, dp, { ...rg, sea: voyage, tally });
              most = Math.max(most, tally.n);
              if (plan) routed = plan;
            }
          assert.ok(routed, `${p.province} ${p.name}: a voyage to Daggerfall`);
          assert.deepEqual(routed.pixels.at(-1), dp, `${p.name}: ashore at Daggerfall`);
          const fall = routed.kinds.indexOf('landfall');
          assert.ok(
            fall > 0 &&
              routed.kinds.slice(0, fall).every((k) => k === 'sea') &&
              !routed.kinds.slice(fall + 1).some((k) => k === 'sea' || k === 'landfall'),
            `${p.name}: sailed, then ashore once`,
          );
        }
        assert.ok(most <= VOYAGE_CELLS_MAX, `the largest plan ${most} cells`);
      } finally {
        setArenaStanding(false);
      }
    } finally {
      t.reset();
    }
  },
);

// ── the hosts' wiring ────────────────────────────────────────────
