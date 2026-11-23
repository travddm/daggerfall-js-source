// SHIPYARDS-FOUND: A
// PORT'S PLACES FOUND AS THE YARDS ARE - rows of the town's talk directory (systems/portPlaces.js portDirectoryRows),
// their groups on the Where-is page after the yards' (systems/topicTree.js over FOUND_KIND_ORDER), answered as a building
// is (the compass, the map's mark); the shipyard and the lighthouse on both town maps (world/merchantYards/merchantYardMap.js
// yardTownBlocks, ui/town/townMapDoor.js); the shipyard, the lighthouse and the docks on the Overworld (scenes/portHost.js,
// scenes/quayPool.js overworldMarks, ui/travel/travelViewHud.js portGlyph); and the four hosts' wiring. Design:
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORT_PLACE_ORDER, PORT_PLACES, portDirectoryRows, portKeeper, portPlaceName, foundBuildingKey, FOUND_TALK_GROUPS } from '../../src/systems/portPlaces.js';
import { yardDirectoryRows, yardKeeper, YARD_KIND_ORDER, YARD_TALK_GROUPS } from '../../src/systems/merchantYards.js';
import { yardGround, yardSitesOn } from '../../src/world/merchantYards/merchantYardSites.js';
import { portSitesOn, seaField } from '../../src/world/portSites.js';
import { yardTownBlocks, PORT_MAP_TYPE, YARD_MAP_TYPE, YARD_MAP_BLOCK_M } from '../../src/world/merchantYards/merchantYardMap.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
import { ROAD_WEIGHT } from '../../src/systems/gothwayBoards.js';
import { makeBuildingKey } from '../../src/systems/talk/talkTopics.js';
import { TopicTree, LIST_ITEM_TYPE, QUESTION_TYPE, EN } from '../../src/systems/topicTree.js';
import { AnswerPipeline } from '../../src/systems/answerPipeline.js';
import { buildingCompassDirection, DIRECTION_HINTS } from '../../src/systems/talk/talk.js';
import { quarterOf } from '../../src/ui/town/townQuarters.js';
import { createTownSheet } from '../../src/ui/town/townSheet.js';
import { createQuayPool, DOCKS_MARK_LIFT } from '../../src/scenes/quayPool.js';
import { QUAY_DECK_UP } from '../../src/systems/naval/quays.js';
import { findHarbour } from '../../src/systems/naval/shipLife.js';
import { markGroup, markShown, countGroups, isYardMark } from '../../src/systems/travel/travelViewFilters.js';
import { setTutorialHandler, _resetTutorialTriggerForTests, tutorialById } from '../../src/systems/tutorials.js';
import { _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { createShipyardOverlay, createNavalYardOverlay, createNavalPlunderOverlay, createEtherChartOverlay } from '../../src/ui/naval/navalPlunderDoor.js';
import { yardGlyph, portGlyph, yardMarkKind } from '../../src/ui/travel/travelViewHud.js';
import { exteriorFrame, streetColor, same } from '../yardLightRig.mjs';
import { LAMP_RANGE } from '../../src/scenes/portHost.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** A port town two blocks by two: open ground, a road along row 64, the sea's bearing east - its yards placed, then its
 *  shipyard and lighthouse on what they left, each handed its keepers and name as the host hands them (scenes/world.js
 *  townPlacesFor). */
function port() {
  const g = yardGround({ width: 128, height: 128, weightAt: (gx, gy) => (gx < 0 || gy < 0 || gx >= 128 || gy >= 128 ? 0 : gy === 64 || gy === 65 ? ROAD_WEIGHT : 1) });
  const mapId = 9, regionIndex = 17;
  const yards = yardSitesOn(g).map((t) => ({ ...t, key: `${mapId}:${t.kind}`, keeper: yardKeeper(mapId, t.kind, regionIndex) }));
  const ports = portSitesOn(g, seaField(128, 128, null, [4, 0])).map((t) => {
    const keeper = portKeeper(mapId, t.kind === 'lighthouse' ? 'lighthouse' : 'shipyard', regionIndex);
    return { ...t, key: `${mapId}:${t.kind}`, keeper, name: portPlaceName(t.kind, { keeperName: keeper.name, townName: 'Sentinel' }) };
  });
  assert.deepEqual(ports.map((s) => s.kind), ['shipyard', 'lighthouse'], 'both stand');
  const rows = [0, 1].flatMap((y) => [0, 1].map((x) => ({ x, y, autoMap: new Uint8Array(64 * 64), landmark: null })));
  return { yards, ports, rows };
}
const SHOPS = [
  { name: 'The Odd Blades', buildingKey: makeBuildingKey(0, 0, 1), buildingType: BUILDING_TYPES.WeaponSmith, position: [20, 0, 20] },
  { name: 'The Rusty Anchor', buildingKey: makeBuildingKey(1, 0, 2), buildingType: BUILDING_TYPES.Tavern, position: [120, 0, 30] },
];
function treeOver(list) {
  return new TopicTree({
    getQuest: () => null, getAllActiveQuestIds: () => [], currentRegionIndex: () => 17, currentRegionName: () => 'Daggerfall',
    currentLocationName: () => 'Sentinel', currentMapId: () => 9, isPlayerInside: () => false, isPlayerInsideBuilding: () => false,
    isPlayerInsideCastle: () => false, currentBuildingKey: () => -1, getBuildingList: () => list, exteriorBuildings: () => [],
    factionName: (id) => `faction:${id}`,
  });
}
const PLACES = [
  { kind: 'shipyard', x: 150, z: 60, name: 'Voss\'s Shipyard' },
  { kind: 'crewhall', x: 156, z: 57, name: 'Wayrest\'s Crew Hall' },
  { kind: 'lighthouse', x: 190, z: 120, name: 'The Sentinel Light' },
  { kind: 'docks', x: 240, z: 30, name: 'Sentinel Docks' },
];

test('SHIPYARDS-FOUND THE WHERE-IS PAGE: a port town\'s shipyard, crew hall, lighthouse and docks each their own group after the yards\' - its Previous List head, its place asked as a building (LocalBuilding, its key) - and before the General section and Regional (mutants: the port\'s ungrouped)', () => {
  const { yards } = port();
  const yardRows = yardDirectoryRows(yards), portRows = portDirectoryRows(PLACES);
  const tree = treeOver([...SHOPS, ...yardRows, ...portRows, { name: 'Castle Sentinel', buildingKey: makeBuildingKey(1, 1, 0), buildingType: BUILDING_TYPES.Palace, position: [80, 0, 80] }]);
  tree.assembleTopicListLocation();
  assert.deepEqual(tree.listTopicLocation.map((g) => g.caption), ['Weapon smiths', 'Taverns', ...YARD_KIND_ORDER.map((k) => YARD_TALK_GROUPS[k]), 'Shipyards', 'Crew halls', 'Lighthouses', 'Docks', EN.general, EN.regional]);
  for (const [i, kind] of PORT_PLACE_ORDER.entries()) {
    const g = tree.listTopicLocation.find((x) => x.caption === FOUND_TALK_GROUPS[kind]);
    assert.equal(g.type, LIST_ITEM_TYPE.ItemGroup);
    assert.equal(g.listChildItems[0].type, LIST_ITEM_TYPE.NavigationBack, `${kind}: the Previous List head`);
    assert.deepEqual(g.listChildItems.slice(1).map((c) => [c.caption, c.questionType, c.buildingKey]), [[PLACES[i].name, QUESTION_TYPE.LocalBuilding, foundBuildingKey(kind)]]);
  }
  const inland = treeOver([...SHOPS, ...yardRows]);
  inland.assembleTopicListLocation();
  assert.equal(inland.listTopicLocation.some((g) => g.caption === PORT_PLACES.shipyard.group), false, 'no port, no group');
});

test('SHIPYARDS-FOUND THE ANSWER: asked where the docks are, the compass reads their place from the directory, and the map\'s mark discovers them by their key', () => {
  const rows = portDirectoryRows(PLACES), docks = rows.find((r) => r.yard === 'docks');
  const list = [...SHOPS, ...rows];
  assert.equal(buildingCompassDirection({ listBuildings: list, playerPos: [240, 0, -10] }, docks.buildingKey), DIRECTION_HINTS.north);
  assert.equal(buildingCompassDirection({ listBuildings: list, playerPos: [200, 0, 30] }, docks.buildingKey), DIRECTION_HINTS.east);
  const found = [];
  const tree = treeOver(list);
  tree.assembleTopicListLocation();
  const pipe = new AnswerPipeline({ tree, discoverBuilding: (k) => found.push(k), session: () => ({ socialGroup: 0, isSpyMaster: false }) });
  const item = tree.listTopicLocation.find((g) => g.caption === 'Lighthouses').listChildItems[1];
  pipe.currentKeySubjectBuildingKey = item.buildingKey;
  pipe.markKeySubjectLocationOnMap();
  assert.deepEqual(found, [foundBuildingKey('lighthouse')]);
});

test('SHIPYARDS-FOUND THE TOWN MAP: the shipyard\'s ground in a shop\'s byte, the lighthouse\'s in a house\'s - each cell for cell where it stands, in a copy - and each lettered by its own name in the block its middle stands in; both maps letter them in their quarters\' inks (mutants: the lighthouse a shop, the name the kind\'s)', () => {
  const { ports, rows } = port();
  assert.equal(PORT_MAP_TYPE.shipyard, YARD_MAP_TYPE);
  assert.equal(quarterOf(PORT_MAP_TYPE.shipyard + 1), 'shop');
  assert.equal(quarterOf(PORT_MAP_TYPE.lighthouse + 1), 'house');
  const before = rows.map((r) => [...r.autoMap]);
  const out = yardTownBlocks(rows, ports);
  assert.deepEqual(rows.map((r) => [...r.autoMap]), before, 'the block\'s own bytes untouched');
  for (const s of ports) {
    const byte = PORT_MAP_TYPE[s.kind] + 1;
    let n = 0;
    for (let cy = s.gy; cy < s.gy + s.nz; cy++) for (let cx = s.gx; cx < s.gx + s.nx; cx++) {
      const r = out.find((x) => x.x === Math.floor(cx / 64) && x.y === Math.floor(cy / 64));
      if (r.autoMap[(63 - (cy - r.y * 64)) * 64 + (cx - r.x * 64)] === byte) n++;
    }
    assert.equal(n, s.nx * s.nz, `${s.kind}: every cell of its ground`);
  }
  const places = out.flatMap((r) => (r.places ?? []).map((p) => ({ ...p, bx: r.x, by: r.y })));
  assert.deepEqual(places.map((p) => [p.name, p.yard, p.buildingType]), ports.map((s) => [s.name, s.kind, PORT_MAP_TYPE[s.kind]]));
  for (const [i, p] of places.entries()) assert.deepEqual([p.bx, p.by], [Math.floor(ports[i].x / YARD_MAP_BLOCK_M), Math.floor(ports[i].z / YARD_MAP_BLOCK_M)]);
  const sheet = createTownSheet({ gridW: 2, gridH: 2, blocks: out, buildings: () => [], discovered: () => [] });
  assert.deepEqual(sheet.names().map((n) => [n.text, n.quarter]), [[ports[0].name, 'shop'], [ports[1].name, 'house']]);
  const nameless = yardTownBlocks(rows, [{ ...ports[1], name: '' }]);
  assert.equal(nameless.flatMap((r) => r.places ?? [])[0].name, portPlaceName('lighthouse'), 'a nameless site: its kind\'s name');
});

test('SHIPYARDS-FOUND THE DOCKS ON THE OVERWORLD: each harbour whose quays stand marked over its first laid quay - "<Town> Docks", its kind the look\'s (`yard docks`) - none before a quay is laid; the port\'s marks shown and hidden with the Towns switch and never counted a town (mutants: no docks mark)', async () => {
  const coast = (x, z) => !(z > 200 || (x > 300 && x < 400 && z > -300));
  const SEA = 34, harbour = findHarbour({ rect: { minX: -100, maxX: 100, minZ: 220, maxZ: 420 }, isWater: coast });
  const collider = { addMesh() {}, removeBucket() {} };
  const pool = createQuayPool({
    renderer: { createMesh: () => ({}), destroyMesh() {}, drawMesh() {} }, prepare: async () => {}, collider: () => collider,
    harbours: () => [{ key: 'port:9', name: 'Sentinel', harbour }], seaY: () => SEA, groundAt: (x, z) => (coast(x, z) ? SEA - 8 : SEA + 3),
    feet: () => [0, SEA, 150], mode: () => 'exterior', now: () => 0,
  });
  assert.deepEqual(pool.overworldMarks(), [], 'nothing laid yet');
  pool.frame();
  await new Promise((r) => setTimeout(r, 0));
  const marks = pool.overworldMarks();
  const b0 = harbour.berths[0];
  assert.deepEqual(marks, [{ key: 'docks:port:9', at: [b0.pos[0], SEA + QUAY_DECK_UP + DOCKS_MARK_LIFT, b0.pos[1]], label: 'Sentinel Docks', kind: 'yard docks' }]);
  for (const m of [...marks, { kind: 'yard shipyard' }, { kind: 'yard lighthouse' }]) {
    assert.equal(markGroup(m.kind), 'towns');
    assert.equal(isYardMark(m), true);
    assert.equal(markShown(m, { towns: false }), false);
  }
  assert.equal(countGroups([...marks, { kind: 'place' }]).towns, 1, 'the Towns switch counts towns, not docks');
});

test('SHIPYARDS-FOUND THE GLYPHS: a mark\'s yard kind its kind\'s second word; the shipyard\'s anchor (its ring and its flukes\' curve), the lighthouse\'s tower under its light, the docks\' bollard on its quay - none of them a yard\'s wheel or horseshoe (mutants: the port drawn as a Stable)', () => {
  assert.deepEqual(['yard stable', 'yard transport', 'yard shipyard', 'yard lighthouse', 'yard docks', 'yard', 'yard nonsense'].map((kind) => yardMarkKind({ kind })), ['stable', 'transport', 'shipyard', 'lighthouse', 'docks', 'stable', 'stable']);
  const ops = (kind, fn = yardGlyph) => {
    const log = [];
    const g = new Proxy({ fillStyle: '#fff' }, { get: (t, k) => (k in t ? t[k] : (...a) => { log.push([k, ...a]); }), set: (t, k, v) => { t[k] = v; return true; } });
    fn(g, 50, 60, kind, '#c08a3e');
    return log;
  };
  const anchor = ops('shipyard'), tower = ops('lighthouse'), bollard = ops('docks'), shoe = ops('stable');
  assert.equal(anchor.filter(([k]) => k === 'arc').length, 1, 'the anchor\'s ring');
  assert.equal(anchor.filter(([k]) => k === 'quadraticCurveTo').length, 2, 'its arms\' curve');
  assert.ok(tower.some(([k]) => k === 'closePath') && tower.filter(([k]) => k === 'arc').length === 1, 'the tower and its light');
  assert.equal(bollard.filter(([k]) => k === 'arc').length, 0);
  assert.ok(bollard.filter(([k]) => k === 'lineTo').length >= 3, 'the quay, the post and its cap');
  assert.deepEqual(ops('shipyard', portGlyph), anchor, 'yardGlyph hands a port\'s to portGlyph');
  for (const o of [anchor, tower, bollard]) assert.notDeepEqual(o, shoe);
});

test('SHIPYARDS THE LAMP REACHES THE RENDERER - the world host\'s own light composition, run (test/yardLightRig.mjs): by night a lighthouse\'s lamp is a scene light at its glass and its reach, in the street lanterns\'s colour, ranked with them; by day none (mutants: the lamp unwired)', () => {
  const eye = [0, 1.7, 0];
  const town = Array.from({ length: 6 }, (_, i) => ({ x: 6 + i * 3, y: 3, z: -4 }));
  const ranges = new Float32Array(64).fill(18);
  const lamp = { x: 3, y: 19.5, z: 8, range: LAMP_RANGE };
  for (const lane of [false, true]) {
    const lit = exteriorFrame({ lane, night: true, town, lamps: [], eye, ranges, ports: [lamp] });
    const mine = lit.find((l) => same(l.at, [lamp.x, lamp.y, lamp.z]));
    assert.ok(mine, `${lane ? 'lane' : 'classic'}: the lamp reaches the renderer by night`);
    assert.ok(Math.abs(mine.range - LAMP_RANGE) < 1e-6, 'at its own reach');
    assert.ok(same(mine.color, streetColor(lane)), 'in the street lanterns\' colour');
    assert.equal(lit.length, town.length + 1, 'beside the street\'s');
    assert.equal(exteriorFrame({ lane, night: false, town, lamps: [], eye, ranges, ports: [lamp] }).length, 0, 'by day, none');
  }
});

test('SHIPYARDS x TUT1: the shipmaster\'s window pops the shipyard\'s page, as the shipwright\'s does - a prize\'s hold the sea fight\'s; the pages say where a ship is bought now', () => {
  resetPrefs();
  _resetTutorialTriggerForTests();
  const noted = [];
  const off = setTutorialHandler((id) => { noted.push(id); return true; });
  assert.equal(typeof document, 'undefined', 'no DOM here: each door notes its page and opens nothing');
  assert.equal(createShipyardOverlay({}), null);
  assert.equal(createNavalYardOverlay({}), null);
  assert.equal(createNavalPlunderOverlay({}), null);
  // AUDIT CAPTAIN'S SEA (at the merge of SHIPYARDS): the chart of the Eltheric Ocean, through the same door, pops no page
  assert.equal(createEtherChartOverlay({}), null);
  assert.deepEqual(noted, ['shipyard', 'shipyard', 'naval-combat']);
  off();
  _resetTutorialTriggerForTests();
  const ships = tutorialById('ships').body.join(' ');
  assert.doesNotMatch(ships, /general store|pawn/i, 'no counter sells a ship (SHIPYARDS: the shelves retired)');
  assert.match(ships, /^Shipyards in port towns sell ships\./);
  const yard = tutorialById('shipyard');
  assert.equal(yard.title, 'Shipyards');
  assert.match(yard.body.join(' '), /shipmaster sells ships and buys yours/);
  assert.match(yard.body.join(' '), /crew hall/);
  assert.equal(tutorialById('lighthouse')?.group, 'sea');
});
