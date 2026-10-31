// TO-ROADS (FIELD BUGS 2026-09-29d; SylviaBun on the Discord, #bug-reports, "Travel Options First Person doesn't follow
// roads like Overworld Travel Options does": "With the new Overworld type of travel, you can travel sticking almost
// entirely to roads without any additional effort. When traveling in first person, however, the travel route always just
// goes the straightest shot to your destination running you through the forest etc. A way to toggle this behavior to
// match or not would be nice"). OW-TOGGLE gave First-Person Travel back as Travel Options' own journey: its autopilot
// aims at the destination's rect, straight through whatever stands between. The port's own key beside it on the mod's
// pane (`GeneralOptions.FirstPersonTravelFollowsRoads`, OFF - First-Person Travel stays the original travel option Mac
// asked back) makes a map pick the Overworld's ROUTE instead - its planner, its legs, its refusals - walked in first
// person, the view never raised.
//
// Pinned here: the key (declared, off, a toggle, its words, on the tile beside the switch it serves, the player's own
// online); the report REPRODUCED first and then fixed on the host's own code - world.js's doors (tvOwnsJourneys,
// tvRoutesJourneys, beginAcceleratedTravel, travelViewResume, tvJourneyUp, the view's onLower, the map's onTravel and
// onTravelToCoords) and the Overworld's route (travelViewRouteTo, travelViewWalkTo, tvJoinedLegs, tvSeaNoWay, the view's
// gate and their small helpers) LIFTED from its source and run over the REAL planner (systems/travel/travelRoute.js), a REAL
// Travel Options and the real settings store on a small map of our own (a road bent round a square of forest, a
// mountain, an island); the journey's life (the mod's panel, a foe's stop, Camp, the party's walk, the map's Resume
// planned again, the arrival's box, the view's own doors, the clock); the route's refusal (said, and done: never the
// straight walk, never DFU's fast travel); both switches both ways and the classic skin, read live; and THE ONE
// CONSTRUCTION SEAM, swept in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOD_SETTINGS, modSetting, setModSetting, _resetModSettings } from '../../../src/systems/modSettings.js';
import { MOD_CURATED, modDials } from '../../../src/systems/features.js';
import { ONLINE_PLAYERS_OWN_MODS, onlineForcedModSetting } from '../../../src/systems/online/onlineLane.js';
import { createTravelOptions, readTravelOptionsSettings, TRAVEL_OPTIONS_VENDOR } from '../../../src/systems/travel/travelOptions.js';
import { TRAVEL_OPTIONS_TEXT } from '../../../src/systems/travel/travelOptionsText.js';
import { mapPixelWorldOrigin } from '../../../src/systems/travel/travelPaths.js';
import { rectOf } from '../../../src/systems/travel/travelAutopilot.js';
import { TravelControlUI } from '../../../src/ui/travel/travelControlUI.js';
import { planRoute, routeLegs, routeGround, joinPoint, routeDrawPoints, roadShare, crossesWater, dryLine, TV_MOUNTAIN_CLIMATE } from '../../../src/systems/travel/travelRoute.js';
import { planJourney } from '../../../src/systems/travel/planSlices.js';   // PLAN-SLICES
import { tvMooredDry, tvSeaAsk } from '../../../src/systems/travel/seaAsk.js';   // PLAN-SLICES: out of the host
import { WATER_BYTE } from '../../../src/world/roadsProducer.js';
import { DIR_DELTA } from '../../../src/world/road/roadNetwork.js';
import { worldCoordToMapPixel } from '../../../src/formats/mapsFile.js';
import { TRAVEL_VIEW_TEXT, travelTripLine, travelWalkRate, TV_MOVE_ACTIONS } from '../../../src/scenes/travelView.js';
import { createLoadGovernor, unbuiltAround, unbuiltCount } from '../../../src/systems/travel/travelGovernor.js';
import { foePaced, foeRate } from '../../../src/systems/travel/travelThreat.js';   // RATE-LAW: ENEMY-PACE's fixed floor, which the governor calls
import { travelPathUsesRoads, TRAVEL_PATH_TEXT, setTravelPathMode } from '../../../src/systems/travel/travelPathMode.js';
import { freePull } from '../../../src/systems/travel/freePull.js';
import { timeScale, setTimeScale, resetTimeScale, MAX_TIME_SCALE } from '../../../src/systems/timeScale.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const KEY = 'GeneralOptions.FirstPersonTravelFollowsRoads';
const FIRST_PERSON = 'GeneralOptions.FirstPersonTravel';
/** Run `fn` on a page whose URL is `search` (the read paths read globalThis.location.search; node has none). */
const onPage = (search, fn) => { const had = globalThis.location; globalThis.location = { search }; try { return fn(); } finally { if (had === undefined) delete globalThis.location; else globalThis.location = had; } };

test('TO-ROADS THE SWITCH: the port\'s own key beside First-Person Travel - OFF (First-Person Travel stays the mod\'s straight journey), a toggle, its own words, on the tile right after the switch it serves; the vendored modsettings.json does not carry it; online it is the player\'s own (the room owns only the mod\'s switch and its two journey dials - TRAVEL-ONLINE)', () => {
  const def = MOD_SETTINGS['travel-options'].keys[KEY];
  assert.ok(def, 'declared on Travel Options\' pane');
  assert.equal(def.default, false, 'OFF - First-Person Travel keeps "the original travel option" (Mac, OW-TOGGLE)');
  assert.equal(typeof def.default, 'boolean', 'a toggle');
  // PLAIN-TEXT (2026-10-19): the words a player reads, exactly - what it does on and off, and that it takes effect at once
  // (read live, as First-Person Travel is - AUDIT OW5 T1; the tile's "when the world next loads" is the mod's other keys');
  // the note that the switch is the port's own is gone from the pane
  assert.equal(def.description, 'With First Person Travel on, journeys follow the roads and tracks as Overworld journeys do, and a place with no way there by land can\u2019t be picked. Off, you head straight for your destination. Takes effect at once.');
  const shipped = JSON.parse(read('vendor/travel-options/modsettings.json'));
  assert.ok(!shipped.Sections.flatMap((s) => s.Keys.map((k) => `${s.Name}.${k.Name}`)).includes(KEY), 'the author\'s file is untouched');
  const tile = MOD_CURATED['travel-options'];
  assert.equal(tile.indexOf(KEY), tile.indexOf(FIRST_PERSON) + 1, 'on the tile, right after the switch it serves');
  assert.ok(modDials('travel-options').includes(KEY), 'reachable: a dial the drawer draws (TORCH-BIND\'s lesson)');
  _resetModSettings();
  assert.equal(modSetting(TRAVEL_OPTIONS_VENDOR, KEY), false, 'the shipped store: off');
  assert.ok(!ONLINE_PLAYERS_OWN_MODS.includes('travel-options'), 'TRAVEL-ONLINE: the room owns three of Travel Options\' keys');
  assert.equal(onlineForcedModSetting('travel-options', KEY, '?online=1'), undefined, 'and not this one: the room forces nothing here');
  onPage('?online=1', () => {
    setModSetting(TRAVEL_OPTIONS_VENDOR, KEY, true);
    assert.equal(modSetting(TRAVEL_OPTIONS_VENDOR, KEY), true, 'online, the player\'s own answer');
  });
  _resetModSettings();
});

// ── the host, lifted: world.js's own doors and the Overworld's own route, run over the real planner ─────────────────

// THE MAP, a small one of our own on the whole 1000x500 grid: a road from the traveller's pixel (500, 250) north to
// (500, 245), east to (510, 245) and south into Ripwych's pixel (510, 250) - bent round five pixels of forest the straight
// line crosses; a Mountain pixel west at (490, 250); an island town, Isle, at (530, 250) in a ring of water.
const W = 1000, H = 500, idx = (x, y) => y * W + x;
const ROADS = new Uint8Array(W * H);
const ROAD = [];
for (let y = 250; y >= 245; y--) ROAD.push([500, y]);
for (let x = 501; x <= 510; x++) ROAD.push([x, 245]);
for (let y = 246; y <= 250; y++) ROAD.push([510, y]);
for (let i = 1; i < ROAD.length; i++) {   // Hazelnut's own shape: a step is on the road when both ends carry the edge
  const [ax, ay] = ROAD[i - 1], [bx, by] = ROAD[i];
  ROADS[idx(ax, ay)] |= DIR_DELTA.find(([, dx, dy]) => dx === bx - ax && dy === by - ay)[0];
  ROADS[idx(bx, by)] |= DIR_DELTA.find(([, dx, dy]) => dx === ax - bx && dy === ay - by)[0];
}
const NET = { roads: ROADS, tracks: new Uint8Array(W * H), source: 'basic-roads' };
const SEA = new Set();
for (let y = 248; y <= 252; y++) for (let x = 528; x <= 532; x++) if (x !== 530 || y !== 250) SEA.add(`${x},${y}`);
const PEAK = { x: 490, y: 250 };
const heightAt = (x, y) => (SEA.has(`${x},${y}`) ? 0 : 60);
const climateAt = (x, y) => (x === PEAK.x && y === PEAK.y ? TV_MOUNTAIN_CLIMATE : 231);
/** A point in a map pixel, native units (the pixel's middle by default). */
const at = (px, py, dx = 16384, dz = 16384) => { const o = mapPixelWorldOrigin(px, py); return { x: o.x + dx, z: o.z + dz }; };
const placeRect = (p) => { const o = mapPixelWorldOrigin(p.x, p.y); return rectOf(o.x + 16000, o.z + 16000, 768, 768); };
const PLACES = new Map([
  ['510,250', { pixel: { x: 510, y: 250 }, name: 'Ripwych', mapId: 42, regionIndex: 17, locationIndex: 3 }],
  ['530,250', { pixel: { x: 530, y: 250 }, name: 'Isle', mapId: 43, regionIndex: 17, locationIndex: 4 }],
]);
const pick = (x, y) => { const p = PLACES.get(`${x},${y}`); return p ? { ...p } : { pixel: { x, y }, name: '' }; };
const WALKED = { playerControlled: true, speedCautious: false, sleepModeInn: false, travelShip: false };   // the popup's word for a walked trip
const xy = (l) => ({ x: l.x, y: l.y });

