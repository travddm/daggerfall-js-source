// AUDIT STARTS:
// THE PINS OF THE STARTS' AUDIT - START1 to START3 read against the code that runs them: the held map's past-Bay picks (U1,
// U2), the goto's glide (P9), a load before the story began (W5), the machine's restores (Q5), the bridge's start (P2), the
// Questlines page (P7), the main quest's first look (Q2), and the sea lanes' corner, helm, wide box, landfall and no-ladder
// laws (P5, V4, V5, V6). Where ARENA2_PATH names the game's data, the freeware's own Tamriel: every port's open water to
// Daggerfall.
import '../../modsOff.js';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { START_QUESTS, HAND_START_QUEST } from '../../../src/systems/starts/starts.js';
import { mapPixelToLongitudeLatitude } from '../../../src/formats/mapsFile.js';
import { createStartsHost } from '../../../src/scenes/startsHost.js';
import { createQuestBridge } from '../../../src/scenes/quest/questBridge.js';
import { HeldMapWindow } from '../../../src/ui/heldMap.js';
import { tamrielInkFor } from '../../../src/ui/tamrielInk.js';
import { setCapitalsStanding } from '../../../src/world/tamrielCapitals.js';
import { createQuestlines } from '../../../src/systems/questlines/qlLayer.js';
import { QUESTLINES_PREF, readObjectives } from '../../../src/systems/questlines/qlLaw.js';
import { sheetFor } from '../../../src/systems/questlines/qlSheets.js';
import { setTutorialHandler, markTutorialSeen, forgetTutorialsSeen, _resetTutorialTriggerForTests } from '../../../src/systems/tutorials.js';
import { setPref, _resetForTests } from '../../../src/systems/uiPrefs.js';
import { planRoute, planSeaLanes, VOYAGE_LANDFALL_PX, LANE_MARGIN } from '../../../src/systems/travel/travelRoute.js';
import { FACTION_TYPES } from '../../../src/formats/factionFile.js';
import { BUILDING_TYPES } from '../../../src/world/buildingNames.js';
import { packMachine, loadTables, questSource } from '../../qlSources.mjs';
import { town, dungeon, rmbBlock, worldOf, SPAWN, ITEM } from '../../fb1004dTowns.mjs';

const skin = (v) => { _resetForTests(); globalThis.location = { search: `?skin=${v}` }; };
afterEach(() => { _resetForTests(); delete globalThis.location; delete globalThis.document; });

/** Skyrim's start dungeon past the Bay (test/systems/starts/start3_pastbay_marks.test.js's), its row where TESA8 writes it. */
const LAIR_PX = { x: 1203, y: -88 };
const LAIR_MAP_ID = ((0x340 << 20) | 0x80000 | 12345) >>> 0;
const FLAT = (record, x, y, z) => ({ type: 3, position: record, xPos: x, yPos: y, zPos: z, resources: { flatResource: { textureArchive: 199, textureRecord: record } } });
const LAIR_BLOCK = { position: 0, rdbBlock: { objectRootList: [{ rdbObjects: [FLAT(ITEM, 800, -40, 1200), FLAT(SPAWN, 200, -40, 300)] }] } };

/** A province's start played on DFU's machine: its lair past the Bay, the city of Daggerfall, the wilds between. */
function played() {
  loadTables();
  const lair = dungeon({ name: 'The Haunt of Baringon', locationIndex: 99, mapId: LAIR_MAP_ID, dungeonType: 8, block: 'N0000099.RDB', regionIndex: 64, regionName: 'Skyrim' });
  const ll = mapPixelToLongitudeLatitude(LAIR_PX.x, LAIR_PX.y);
  lair.mapTableData = { ...lair.mapTableData, longitude: ll.x, latitude: ll.y };
  const city = town({ name: 'Daggerfall', locationIndex: 0, mapId: 1291010263, grid: ['CITY.RMB'] });
  city.exterior.exteriorData.locationId = 0xc36a;
  const inn = town({ name: 'Woodcroft Hall', locationIndex: 1, mapId: 5002, grid: ['INN.RMB'] });
  inn.exterior.buildings.push({ buildingType: BUILDING_TYPES.Tavern, factionId: 0, nameSeed: 100, quality: 10 });
  const farm = town({ name: 'Ashwick Farm', locationIndex: 2, mapId: 5003, grid: ['FARM.RMB'] });
  const hold = dungeon({ name: "Privateer's Hold", locationIndex: 3, mapId: 187853213, dungeonType: 0, block: 'S0000999.RDB' });
  hold.exterior.exteriorData.locationId = 0xc381;
  const locations = [city, inn, farm, hold];
  const blocks = new Map([['N0000099.RDB', LAIR_BLOCK], ['S0000999.RDB', LAIR_BLOCK], ['CITY.RMB', rmbBlock('CITY.RMB', [{ type: BUILDING_TYPES.Palace }])],
    ['INN.RMB', rmbBlock('INN.RMB', [{ type: BUILDING_TYPES.Tavern }])], ['FARM.RMB', rmbBlock('FARM.RMB', [{ type: BUILDING_TYPES.House1 }])]]);
  const base = worldOf({ locations, blocks });
  const where = { loc: lair, inside: { dungeon: true } };
  const world = {
    ...base,
    getFactionData: (id) => ({ ...base.getFactionData(id), type: FACTION_TYPES.Individual }),
    currentLocation: () => where.loc, playerInside: () => where.inside, isPlayerInLocationRect: () => !where.inside,
    currentLocationIndex: () => locations.indexOf(where.loc),
    discoverLocation: () => {}, mountCurrentSiteQuestResources: () => {},
  };
  const now = { s: 1e6 };
  const m = packMachine({ nowSeconds: () => now.s, skySeconds: () => 100 * 86400 + 12 * 3600, world, showPopup: () => {}, isPlayerInTown: () => !where.inside, giveItemToPlayer: () => {}, removeItemFromPlayer: () => {}, carriesQuestItem: () => true });
  const at = (p) => { where.loc = p === 'lair' ? lair : p === 'city' ? city : farm; where.inside = p === 'lair' ? { dungeon: true } : null; };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { now.s += 60; m.tick(); } };
  const quest = (name) => [...m.quests.values()].find((q) => q.questName === name && !q.questTombstoned) ?? null;
  return { m, at, tick, quest, lair };
}
/** The start host over `machine`. */
const startsHost = (o = {}) => createStartsHost({ params: new URLSearchParams(o.params ?? 'classic=1'), machine: () => o.machine ?? null });

// ── the held map past the Bay ────────────────────────────────────

/** Just enough document for the held map's chrome, its card's buttons readable, a canvas's pen a sink. */
globalThis.ImageData ??= class { constructor(d, w, h) { if (typeof d === 'number') { h = w; w = d; d = new Uint8ClampedArray(w * h * 4); } this.data = d; this.width = w; this.height = h ?? d.length / 4 / w; } };
const pen = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'createImageData' || k === 'getImageData' ? (w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h })
    : k === 'measureText' ? () => ({ width: 1 }) : () => ({ addColorStop() {} })),
  set: (t, k, v) => { t[k] = v; return true; },
});
function fakeDocument() {
  const node = (tag) => {
    const n = {
      tag, children: [], style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      append(...k) { n.children.push(...k); }, remove() { n.removed = true; },
      addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, querySelectorAll: () => [],
      className: '', textContent: '', id: '', attrs: {}, setAttribute(k, v) { n.attrs[k] = v; },
      set innerHTML(v) { n.children = []; }, get innerHTML() { return ''; }, getContext: () => pen(), width: 0, height: 0,
    };
    return n;
  };
  return { createTextNode: (t) => ({ textContent: t, nodeType: 3 }), createElementNS: (_ns, t) => node(t), createElement: (t) => node(t), getElementById: () => null, head: node('head'), body: node('body'), addEventListener() {}, removeEventListener() {} };
}
const nodesOf = (n) => [n, ...(n?.children ?? []).flatMap(nodesOf)];
const buttonsOf = (win) => nodesOf(win._chrome.card).filter((n) => n.tag === 'button').map((n) => n.textContent);
function heldMap(deps = {}) {
  const win = new HeldMapWindow({
    getPlayerPixel: () => ({ x: 5, y: 5 }), getClimateIndex: () => 231, woods: { heightMapBuffer: new Uint8Array(100).fill(10) }, mapSize: { width: 10, height: 10 },
    gold: () => 1e6, goldPieces: () => 1e6, hasHorse: false, hasCart: false, hasShip: false, diseaseCount: () => 0, poisonCount: () => 0, ...deps,
  });
  for (let i = 0; i < 20; i++) win.tick(0.05);   // the sheet up: its card drawn while the phase is the map's
  win._tamriel = true;
  return win;
}

test('AUDIT STARTS U1/U2 the held map: a quest\'s place past the Bay offers no journey on the travel map - no Travel here, and no panel by any door (TESA-NO-FAST); on the teleport map it is a portal\'s end only where it is a city\'s (TESA13), else picked and named alone, and no confirm sends the portal there (mutants: the card\'s button, the panel\'s gate, the confirm\'s gate, the city test)', () => {
  skin('enhanced');
  globalThis.document = fakeDocument();
  setCapitalsStanding(true);
  try {
    // the travel map: picked, named, no journey
    let win = heldMap();
    const lair = win._pastBayPick(LAIR_PX.x, LAIR_PX.y, 'The Haunt of Baringon');
    assert.deepEqual([lair.pastBay, lair.portal], [true, false], 'a lair: no city stands on it');
    win._select(lair);
    assert.equal(win._selected?.name, 'The Haunt of Baringon');
    assert.deepEqual(buttonsOf(win), [], 'no Travel here on its card');
    win._openPanel('travel');
    assert.equal(win._panel ?? null, null, 'nor a journey by any other door');
    win.dispose?.();
    // the teleport map: a lair is picked, never a portal's end
    const ported = [];
    win = heldMap({ onTeleport: (p) => ported.push(p) });
    win.activateTeleportationTravel();
    win._select(win._pastBayPick(LAIR_PX.x, LAIR_PX.y, 'The Haunt of Baringon'));
    assert.equal(win._panel ?? null, null, 'no confirm opens on it');
    assert.deepEqual(buttonsOf(win), [], 'and its card offers none');
    win._openPanel('teleport');
    win._confirmTeleport(true);
    for (let i = 0; i < 200 && !win.done; i++) win.tick(0.05);
    assert.deepEqual(ported, [], 'no portal sent there, whoever asks');
    win.dispose?.();
    // a city's pixel past the Bay is TESA2's portal end, as its own press picks it
    const city = tamrielInkFor(null).cities.find((c) => c.pixel);
    assert.ok(city, 'a capital the world stands');
    win = heldMap({ onTeleport: (p) => ported.push(p) });
    win.activateTeleportationTravel();
    const at = win._pastBayPick(city.pixel.x, city.pixel.y, city.name);
    assert.equal(at.portal, true, `${city.name}: a portal's end`);
    win._select(at);
    assert.equal(win._panel, 'teleport', 'its confirm opens itself');
    win._confirmTeleport(true);
    for (let i = 0; i < 200 && !win.done; i++) win.tick(0.05);
    assert.deepEqual(ported.map((p) => p.pixel), [city.pixel], 'and the portal goes');
    win.dispose?.();
  } finally { setCapitalsStanding(false); }
});

test('AUDIT STARTS P9 the journal\'s find of a place past the Bay glides the map to its pixel as it picks it (mutants: the glide dropped)', () => {
  skin('enhanced');
  globalThis.document = fakeDocument();
  const win = heldMap();
  const glides = [];
  win._focusOn = (x, y) => glides.push([x, y]);
  win.gotoPlace({ siteDetails: { regionIndex: 64, regionName: 'Skyrim', locationName: 'The Haunt of Baringon', worldPixel: LAIR_PX } });
  win._consumeGotoPlace();
  assert.deepEqual(glides, [[LAIR_PX.x + 0.5, LAIR_PX.y + 0.5]]);
  assert.equal(win._selected?.name, 'The Haunt of Baringon');
  win.dispose?.();
});

// ── the start host ───────────────────────────────────────────────

test('AUDIT STARTS W5 a save from before the story began - no start, no curse, no main quest - loads with the commission handed over and the curse beside it; a story begun, a start running, or a save from before the story was kept is left alone; both load doors ask (mutants: the healing, the begun story\'s check)', () => {
  const machine = (o = {}) => ({ storyLegacy: false, storyStarted: new Set(), quests: new Map(), begun: [], startQuestByName(n) { this.begun.push(n); }, ...o });
  let m = machine();
  assert.equal(startsHost({ machine: m }).restored(), true);
  assert.deepEqual(m.begun, ['S0000977', HAND_START_QUEST], 'the commission in hand, the curse beside it');
  for (const o of [{ storyStarted: new Set(['S0000977']) }, { storyLegacy: true }, { quests: new Map([[1, { questName: '_STARTIB' }]]) }, { quests: new Map([[1, { questName: '_BRISIEN' }]]) }]) {
    m = machine(o);
    assert.equal(startsHost({ machine: m }).restored(), true);
    assert.deepEqual(m.begun, [], `left alone: ${JSON.stringify(Object.keys(o))}`);
  }
  assert.equal(startsHost().restored(), true, 'no machine: nothing to heal');
});

test('AUDIT STARTS Q5 the machine counts its restores - what a start on its way reads to know a load landed under it, and drops itself (mutants: the count)', () => {
  const p = played();
  p.m.startQuestByName('_STARTIB');
  p.tick(2);
  const before = p.m.restores ?? 0;
  p.m.restoreSaveData(structuredClone(p.m.getSaveData()));
  assert.equal(p.m.restores, before + 1);
});

test('AUDIT STARTS P2 the bridge starts the start it is handed: the commission in hand\'s with the curse, and a name no start has is the Bay\'s (mutants: the start unpassed)', () => {
  loadTables();
  const started = [];
  const bridge = createQuestBridge({
    data: { readListTable: () => '', getQuestSourceLines: (n) => questSource(n) },
    world: null, classicSeconds: () => 0, playerEntity: { level: 1, name: 'Tester' },
    onQuestStarted: (q) => started.push(q.questName),
  });
  bridge.initAtGameStart(HAND_START_QUEST);
  assert.deepEqual(started, ['S0000977', HAND_START_QUEST]);
});

test('AUDIT STARTS P7 no start\'s quest pops the Tutorials\' Questlines page - every one of START_QUESTS is a quest a new character is started on, never one taken (mutants: the Bay\'s alone skipped)', () => {
  setPref(QUESTLINES_PREF, true);
  forgetTutorialsSeen();
  _resetTutorialTriggerForTests();
  const popped = [];
  setTutorialHandler((id) => { popped.push(id); markTutorialSeen(id); return true; });
  try {
    const layer = createQuestlines({ machine: { quests: new Map() } });
    for (const questName of START_QUESTS) {
      assert.ok(sheetFor(questName), `${questName} has a sheet`);
      layer.stamp({ questName });
    }
    assert.deepEqual(popped, []);
    layer.stamp({ questName: 'M0B00Y06' });
    assert.deepEqual(popped, ['questlines'], 'the first quest taken');
  } finally { setTutorialHandler(null); _resetForTests(); }
});

test('AUDIT STARTS Q2 the main quest\'s opener, begun in Daggerfall\'s streets by a start\'s commission, reads nothing done at its first look - no objective the start had already met, no news for the herald (mutants: the cave\'s escape back)', () => {
  const p = played();
  const q = p.m.startQuestByName('_STARTIB');
  p.tick(2);
  const item = q.getItem({ name: 'commission' });
  item.setPlayerClicked();
  p.tick(1);
  item.useClicked = true;
  p.tick(1);
  p.at('wilds');
  p.tick(2);
  p.at('city');
  p.tick(5);
  const br = p.quest('_BRISIEN');
  assert.ok(br, 'the opener begun in Daggerfall');
  const states = readObjectives(br, sheetFor('_BRISIEN')).map((o) => o.state);
  assert.ok(!states.includes('done'), `nothing done at its first look (${states.join(', ')})`);
});

// ── the sea lanes ────────────────────────────────────────────────

const VOYAGE = { start: 'sea', goal: 'land', voyage: true, again: false };
const VOYAGE_CELLS_MAX = 450000;   // measured 392,822 and 393,363 (the two floods and the lanes): some twenty frames at PLAN_FRAME_CELLS
/** A ladder that says it was climbed. */
const ladder = (rungs = [6, 20, 60]) => { const seen = { climbed: false }; return { seen, margins: { [Symbol.iterator]: () => { seen.climbed = true; return rungs[Symbol.iterator](); } } }; };
const stepsSailed = (plan, isWater) => {
  for (let i = 1; i < plan.pixels.length; i++) {
    const a = plan.pixels[i - 1], b = plan.pixels[i];
    assert.equal(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), 1, 'one pixel a step');
    if (plan.kinds[i - 1] !== 'sea') continue;
    assert.ok(isWater(b.x, b.y), 'sailed on water');
    assert.ok(a.x === b.x || a.y === b.y || isWater(b.x, a.y) || isWater(a.x, b.y), `never through a corner of the land (${a.x},${a.y} -> ${b.x},${b.y})`);
  }
};

test('AUDIT STARTS P5 the lanes never sail through a corner of the land: a wall whose two halves meet at a corner, the way past it round its far end (mutants: the corner\'s step)', () => {
  // the wall at x 600 north of y 0 and x 601 south of it: its halves touch at a corner, the only gap a boat cannot take
  const land = (x, y) => (y >= -250 && y < 0 && x === 600) || (y >= 0 && y <= 2000 && x === 601);
  const isle = (x, y) => Math.abs(x - 200) <= 1 && Math.abs(y - 200) <= 1;
  const isWater = (x, y) => !land(x, y) && !isle(x, y);
  const plan = planRoute({ x: 1500, y: 10 }, { x: 200, y: 200 }, { isWater, sea: VOYAGE });
  assert.ok(plan);
  stepsSailed(plan, isWater);
  assert.ok(Math.min(...plan.pixels.map((p) => p.y)) < -250, 'round the wall\'s north end');
});

test('AUDIT STARTS V6 any helm\'s crossing with an end past the table sails the lanes first - not only a booked voyage\'s - and one ashore never; V4 a booked voyage the lanes cannot sail is no voyage, said at once without the box\'s ladder, where a boat of my own still climbs it (mutants: the voyage\'s alone, the ladder after a voyage)', () => {
  const isle = (x, y) => Math.abs(x - 200) <= 1 && Math.abs(y - 200) <= 1;
  const isWater = (x, y) => !isle(x, y);
  const from = { x: 1100, y: 203 }, to = { x: 200, y: 200 }, mine = { start: 'sea', goal: 'land', again: false };
  const lanes = planSeaLanes(from, to, { isWater, sea: mine });
  assert.ok(lanes);
  const l1 = ladder();
  assert.deepEqual(planRoute(from, to, { isWater, sea: mine, margins: l1.margins }).pixels, lanes.pixels, 'my own boat\'s crossing: the lanes\' route');
  assert.equal(l1.seen.climbed, false, 'no box asked');
  const l2 = ladder();
  const ashore = planRoute(from, to, { isWater, sea: { start: 'land', goal: 'land' }, margins: l2.margins });
  assert.equal(l2.seen.climbed, true, 'ashore with a boat to hand: the box');
  assert.ok(ashore);
  // no way by the lanes: a port walled in on every side
  const pen = (x, y) => Math.max(Math.abs(x - 200), Math.abs(y - 200)) === 20;
  const shut = (x, y) => !isle(x, y) && !pen(x, y);
  const v = ladder();
  assert.equal(planRoute(from, to, { isWater: shut, sea: VOYAGE, margins: v.margins }), null);
  assert.equal(v.seen.climbed, false, 'a voyage: no ladder after the lanes said none');
  const b = ladder([6]);
  planRoute(from, to, { isWater: shut, sea: mine, margins: b.margins });
  assert.equal(b.seen.climbed, true, 'my own boat: the box still asked');
});

test('AUDIT STARTS V5 a lane the first box holds none of is asked once more over a wider one - round a wall whose end lies past LANE_MARGIN (mutants: the wide box)', () => {
  const end = -100 - LANE_MARGIN - 200;   // past the first box's reach north of the two ends
  const wall = (x, y) => x >= 600 && x <= 640 && y >= end && y <= 3000;
  const isle = (x, y) => Math.abs(x - 200) <= 1 && Math.abs(y - 200) <= 1;
  const isWater = (x, y) => !wall(x, y) && !isle(x, y);
  const from = { x: 1500, y: -100 }, to = { x: 200, y: 200 };
  assert.equal(planSeaLanes(from, to, { isWater, sea: VOYAGE }), null, 'the first box: none');
  const plan = planRoute(from, to, { isWater, sea: VOYAGE });
  assert.ok(plan, 'the wider one');
  assert.ok(Math.min(...plan.pixels.map((p) => p.y)) < end, 'round the wall\'s far end');
  stepsSailed(plan, isWater);
});

test('AUDIT STARTS V4 ashore at a port the coast stands on water: every neighbour water too, so no landfall onto it - the voyage lands on the nearest dry ground within VOYAGE_LANDFALL_PX; and the landfall\'s box reaches past an end beyond the table, round water the boat cannot sail (mutants: the dry ground\'s goal, the end\'s pad)', () => {
  // a port two pixels off its isle's shore, on open water
  const isle = (x, y) => x >= 1199 && x <= 1205 && y >= -91 && y <= -85;
  const isWater = (x, y) => !isle(x, y);
  const to = { x: 1196, y: -88 };
  const plan = planRoute({ x: 1500, y: -88 }, to, { isWater, sea: VOYAGE });
  assert.ok(plan, 'a voyage');
  const fall = plan.kinds.indexOf('landfall');
  const ashore = plan.pixels[fall + 1] ?? plan.pixels.at(-1);
  assert.ok(fall > 0 && !isWater(ashore.x, ashore.y), 'ashore on dry ground');
  assert.ok(Math.max(Math.abs(ashore.x - to.x), Math.abs(ashore.y - to.y)) <= VOYAGE_LANDFALL_PX, 'within reach of the port');
  assert.ok(!isWater(plan.pixels.at(-1).x, plan.pixels.at(-1).y), 'and it ends ashore');
  stepsSailed(plan, isWater);
  // a port on land west of an inland lake that runs south from a row north of the sea's nearest water to it: the walk
  // round the lake's north end lies north of both the landfall's ends
  const lake = (x, y) => x === 1102 && y >= -53;
  const water = (x, y) => x >= 1104 || lake(x, y);
  const home = { x: 1101, y: -50 };
  const round = planRoute({ x: 1500, y: -50 }, home, { isWater: water, sea: VOYAGE });
  assert.ok(round, 'a voyage to it');
  assert.deepEqual(round.pixels.at(-1), home, 'ashore at the port itself');
  assert.ok(Math.min(...round.pixels.map((p) => p.y)) < -53, 'round the lake\'s north end');
});

// ── the game's own Tamriel ───────────────────────────────────────

const ARENA2 = process.env.ARENA2_PATH;
const HAVE = !!ARENA2 && ['MAPS.BSA', 'WOODS.WLD', 'TMAP00I0.IMG', 'TAMRIEL2.IMG', 'ART_PAL.COL', 'FONT0003.FNT'].every((f) => existsSync(join(ARENA2, f)));
const skipReal = HAVE ? false : 'ARENA2_PATH not set or missing - real-data validation skipped';

/** The freeware's Tamriel's sea as the world host reads it: the trace at its fit, the ground past the Bay. */
async function realSea() {
  const { DFPalette } = await import('../../../src/formats/dfPalette.js');
  const { preloadTamrielTrace } = await import('../../../src/ui/tamrielTrace.js');
  const { setTamrielTrace } = await import('../../../src/world/tamriel/tamrielLand.js');
  const { setTamrielFit } = await import('../../../src/world/tamriel/tamrielFrame.js');
  const { WoodsFile } = await import('../../../src/formats/woodsFile.js');
  const { groundWoods, groundClimateIndex } = await import('../../../src/world/tamriel/tamrielGround.js');
  const { routeGround } = await import('../../../src/systems/travel/travelRoute.js');
  const { WATER_BYTE } = await import('../../../src/world/roadsProducer.js');
  const { longitudeLatitudeToMapPixel } = await import('../../../src/formats/mapsFile.js');
  const { loadMaps } = await import('../../arena1Data.mjs');
  const fb = async (n) => new Uint8Array(readFileSync(join(ARENA2, n)));
  const pal = new DFPalette(); pal.load(await fb('ART_PAL.COL'), 'ART_PAL.COL');
  setTamrielTrace(await preloadTamrielTrace({ fetchBytes: fb, palette: pal }));
  setTamrielFit({ ox: 38 * 15.5, oy: 57 * 15.5, ppu: 15.5 });
  const maps = loadMaps();
  maps.getClimateIndex = groundClimateIndex(maps.getClimateIndex.bind(maps));
  const w = new WoodsFile(); w.load(await fb('WOODS.WLD'));
  const woods = groundWoods(w);
  const rg = routeGround(maps.getClimateIndex, (x, y) => w.getHeightMapValue(x, y), WATER_BYTE, 1000, 500, (x, y) => woods.getHeightMapValue(x, y) > WATER_BYTE);
  const df = maps.getLocationByName('Daggerfall', 'Daggerfall');
  const dp = longitudeLatitudeToMapPixel(df.mapTableData.longitude, df.mapTableData.latitude);
  return { rg, dp, reset: () => { setTamrielTrace(null); setTamrielFit(null); } };
}
/** The nearest open water to `p` within 3 pixels, ring by ring: water whose sailed reach holds more than a pond's
 *  sixteen pixels (a ship never berths in a puddle of the trace's coast). */
function openWaterNear(p, isWater) {
  const open = (f) => {
    const seen = new Set([`${f.x},${f.y}`]), q = [f];
    while (q.length && seen.size <= 16) {
      const a = q.shift();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const b = { x: a.x + dx, y: a.y + dy }, k = `${b.x},${b.y}`;
        if (!seen.has(k) && isWater(b.x, b.y) && (dx === 0 || dy === 0 || isWater(b.x, a.y) || isWater(a.x, b.y))) { seen.add(k); q.push(b); }
      }
    }
    return seen.size > 16;
  };
  for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const f = { x: p.x + dx, y: p.y + dy };
    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && isWater(f.x, f.y) && open(f)) return f;
  }
  return null;
}

test('AUDIT STARTS V4/V7 on the freeware\'s Tamriel: from the nearest open water to each of the 28 ports past the Bay a voyage reaches Daggerfall, and from Daggerfall\'s each of them - ashore once, within reach of the port (on it, but where the coast stands it on water), each planned in under a second and a half (mutants: the landfall\'s goals, its pad)', { skip: skipReal }, async () => {
  const t = await realSea();
  const { arenaPixels, setArenaStanding } = await import('../../../src/world/arenaPlaces.js');
  setArenaStanding(true);
  try {
    const ports = arenaPixels().stood.filter((p) => p.port);
    assert.equal(ports.length, 28);
    const home = openWaterNear(t.dp, t.rg.isWater);
    assert.ok(home, 'Daggerfall\'s harbor');
    let most = 0;
    const timed = (f, to) => { const tally = { n: 0 }; const plan = planRoute(f, to, { ...t.rg, sea: VOYAGE, tally }); most = Math.max(most, tally.n); return plan; };
    const ashoreOnce = (plan, name) => {
      const fall = plan.kinds.indexOf('landfall');
      assert.ok(fall > 0 && plan.kinds.slice(0, fall).every((k) => k === 'sea') && !plan.kinds.slice(fall + 1).some((k) => k === 'sea' || k === 'landfall'), `${name}: sailed, then ashore once`);
    };
    for (const p of ports) {
      const port = { x: p.bx, y: p.by };
      const berth = openWaterNear(port, t.rg.isWater);
      assert.ok(berth, `${p.name}: open water by it`);
      const out = timed(berth, t.dp);
      assert.ok(out, `${p.province} ${p.name}: a voyage to Daggerfall`);
      assert.deepEqual(out.pixels.at(-1), t.dp);
      ashoreOnce(out, p.name);
      const back = timed(home, port);
      assert.ok(back, `Daggerfall: a voyage to ${p.province} ${p.name}`);
      ashoreOnce(back, p.name);
      const end = back.pixels.at(-1);
      const onIt = end.x === port.x && end.y === port.y;
      const beside = t.rg.isWater(port.x, port.y) && !t.rg.isWater(end.x, end.y) && Math.max(Math.abs(end.x - port.x), Math.abs(end.y - port.y)) <= VOYAGE_LANDFALL_PX;
      assert.ok(onIt || beside, `${p.name}: ashore at it (${end.x},${end.y} for ${port.x},${port.y})`);
    }
    assert.ok(most <= VOYAGE_CELLS_MAX, `the largest plan ${most} cells`);
  } finally { setArenaStanding(false); t.reset(); }
});
