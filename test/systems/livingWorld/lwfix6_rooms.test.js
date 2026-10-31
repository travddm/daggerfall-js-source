// LW-FIX6 (2026-10-05, bible/06-Systems/Living-World.md "LW-FIX6"): THE ROOMS' SEVEN - the deep audit found the
// player's own house peopled (DFU stands nobody in a house the player owns), the ways never asked indoors (a load made
// in a tavern or below left every trip waiting all visit), the room astir under the talk window, the room laid out from
// the player's feet (a load made upstairs stood the drinkers about the bed; another door or a peer laid it out anew), a
// table empty as the round began dealt mid-round, a greeting's rest kept against a clock gone back, and a quest's people
// stood on. Each pinned here, on mock rooms (test/systems/livingWorld/lwfix1_review.test.js's), the synthetic town and map, and the hosts'
// own lines lifted and run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { synthTown } from '../../lwTown.mjs';
import { synthMap } from '../../lwRoads.mjs';
import { LivingTown, GREET_REST_MIN } from '../../../src/systems/livingWorld/livingTown.js';
import { ResidentWalker } from '../../../src/characters/residentWalker.js';
import { PERSON_MOVE_SPEED } from '../../../src/characters/mobile/mobilePerson.js';
import { DAY_MIN } from '../../../src/systems/livingWorld/dayPlan.js';
import { createRelations } from '../../../src/systems/livingWorld/relations.js';
import { CLASSIC_MINUTES_PER_SECOND } from '../../../src/systems/worldTick.js';
import { partiesNear, CALENDAR_MPM } from '../../../src/systems/livingWorld/trips.js';
import { createLivingIndoors, soundRoom, INDOOR_CLEAR_M, INDOOR_DOOR_M } from '../../../src/scenes/livingWorld/livingIndoors.js';
import { createLivingRoads, ROAD_GREET_REST_MIN, ROAD_GREET_S } from '../../../src/scenes/livingWorld/livingRoads.js';
import { ROUND_S, GATHER_BEAT_S, lineMinutes, dealCircles, circleSlots, exchangeAt, circleLine } from '../../../src/systems/livingWorld/meetups.js';   // LW-TALK: PIN MOVED - a table's company
import { BUILDING_TYPES } from '../../../src/world/buildingNames.js';
import { ROAD_GREETINGS } from '../../../src/systems/livingWorld/lines.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const lift = (src, re, what) => { const m = src.match(re); assert.ok(m, what); return m[1]; };

/** A mock room - a box, two floors (the ground at 0, an upper at 3) - and the indoor layer over a mock town. */
function rig({ inside = [], clock = 100 * DAY_MIN + 1200, origin = () => null, waysIn = undefined, greeting = () => null } = {}) {
  const st = { inside, clock };
  const collider = { move(q, dx, dy, dz) { q[0] = Math.max(-6.7, Math.min(6.7, q[0] + dx)); q[2] = Math.max(-4.7, Math.min(4.7, q[2] + dz)); q[1] += dy; }, raycast: () => null };
  const floorAt = (x, y) => (y >= 2.9 ? 3 : 0);
  const synced = [];
  const sprites = {
    sync(list) { synced.length = 0; synced.push(...list.map((x) => ({ ...x }))); },
    persons: () => synced.map((x) => ({ person: { living: { id: x.res.id, res: x.res }, pos: x.feet }, pos: x.feet })),
    batches: () => [], clear() { synced.length = 0; },
  };
  const BEAT = { roundMin: ROUND_S * 2, lineMin: lineMinutes(2) };
  const town = {
    insideAt: () => st.inside.map((x) => ({ res: x, e: { kind: 'tavern', t0: 0, t1: 1e12 } })),
    dayOf: (t) => Math.floor((t - 240) / DAY_MIN), talkBeat: () => BEAT,
    lineCtx: () => ({ weather: null, hour: 20, news: null }), typeOf: () => BUILDING_TYPES.Tavern, greetingFor: (res, t) => greeting(res, t),
    o: { relations: () => createRelations() },
  };
  const deps = {
    sprites, building: () => ({ key: 7000, town }), collider: () => collider, floorAt, origin, waysIn,
    staticFeet: () => [], clock: () => st.clock, ready: () => true,
  };
  const layer = createLivingIndoors(deps);
  return { layer, synced, st, BEAT, collider, floorAt, deps };
}
/** A rig's deps, for another layer over its room and town (AUDIT LW-ROOMS). @param {{ deps: any }} r */
const rigDeps = (r) => ({ ...r.deps, sprites: { sync() {}, persons: () => [], batches: () => [], clear() {} } });
const RES = (i) => ({ id: `L9.${i}`, name: `Res${i} Lane`, job: 'labourer', cls: null });
const DOOR = [0, 0, -4.6];
const AWAY = [0, 0, -4.65];   // AUDIT LW-ROOMS: a step behind the door's row, looking out of it

test('LW-FIX6 the room laid out from the landing of the building\'s first door, whichever door was taken - a load made upstairs, another door or a peer lays out the same room, the same people in the same places; from the feet, the room upstairs; every door\'s landing kept clear (mutants: the first door, a floorless one, the landing unread, the ways in unkept, unpassed, unread, a floorless one kept)', () => {
  const doorLanding = (pos) => (pos[0] === 99 ? null : [pos[0], 0, pos[2] + 1]);
  const doors = [{ door: { pos: [2, 0, -5] } }, { door: { pos: [-2, 0, -5] } }];
  // every way in clear of the room's places - the layer passes the host's to the sounding
  const box = rig();
  const all = soundRoom(DOOR, box.collider, box.floorAt, []);
  const other = all[all.length - 1];
  assert.ok(soundRoom(DOOR, box.collider, box.floorAt, [], [other]).every((p) => Math.hypot(p[0] - other[0], p[2] - other[2]) >= INDOOR_DOOR_M), 'none at another door');
  const second = rig({ inside: [RES(1)], origin: () => DOOR, waysIn: () => [other] });
  second.layer.frame(0.016, DOOR, 0, [0, 1.6, -4.6]);
  assert.ok(second.layer.spots().length && second.layer.spots().every((p) => Math.hypot(p[0] - other[0], p[2] - other[2]) >= INDOOR_DOOR_M), 'the layer keeps them clear');
  // the same room for the player come in at the door and the player loaded upstairs, once both read the landing
  const people = [RES(1), RES(2), RES(3), RES(4)];
  const placed = (feet, from) => {
    const r = rig({ inside: people, origin: () => from });
    r.layer.frame(0.016, feet, 0, [feet[0], feet[1] + 1.6, feet[2]]);
    return { spots: r.layer.spots(), at: r.layer.stood().map((s) => [s.id, s.at]).sort() };
  };
  const door = placed(DOOR, DOOR), upstairs = placed([3, 3, 2], DOOR);
  assert.ok(door.spots.length >= 4 && door.spots.every((p) => p[1] === 0), 'the ground floor sounded');
  assert.deepEqual(upstairs, door, 'loaded upstairs: the same room, the same people where they were');
  const fromFeet = placed([3, 3, 2], null);
  assert.ok(fromFeet.spots.length && fromFeet.spots.every((p) => p[1] === 3), 'from the feet: the floor upstairs, the drinkers about the bed');
  assert.notDeepEqual(placed([4, 0, 3], null).at, door.at, 'from the feet: another door, another room');
});

test('LW-FIX6 two who come to an empty table never begin mid-script - LW-TALK: PIN MOVED - they meet from the minute they stood together (the first cut stood them mute to the next round), their talk from its own first line, a gather\'s beat after (mutant: the empty table dealt)', () => {
  const T = 100 * DAY_MIN + 1200;
  const r = rig({ inside: [], clock: T });
  r.layer.frame(0.016, DOOR, 0, [0, 1.6, -4.6]);   // in: nobody at any table
  r.st.clock = T + 5;
  r.st.inside = [RES(1), RES(2)];
  r.layer.frame(1, AWAY, Math.PI, [0, 1.6, -4.65]);   // the player looks away: the pair stood - AUDIT LW-ROOMS: PIN MOVED - a step
  // behind the door's row (the room's walk lays its first table in that row now, square to the player's look out of the
  // door, where the eye's own rounding saw it)
  const [a, b] = r.layer.stood();
  assert.equal(a.table, b.table, 'the pair at one table');
  const since = T + 5;
  const circle = dealCircles(`in:7000:${a.table}:${since}`, [a.res, b.res], 0, since, since + r.BEAT.roundMin, GATHER_BEAT_S * r.BEAT.roundMin / ROUND_S)[0];
  const ctx = { weather: null, hour: 20, news: null, room: 'tavern' };
  let first = null, said = 0;
  for (let tm = since; tm < since + r.BEAT.roundMin; tm += 0.25 * r.BEAT.lineMin) {
    r.st.clock = tm;
    r.layer.frame(0.016, AWAY, Math.PI, [0, 1.6, -4.65]);
    const want = circleLine(circle, tm, r.BEAT.lineMin, ctx);
    assert.deepEqual(r.layer.speech([0, 1.6, -4.65]).map((l) => l.text), want ? [want.text] : [], 'their talk, from its first line');
    if (want) { said++; first ??= want; }
  }
  assert.ok(said > 0 && first.index === 0, 'heard, from a first line');
  assert.ok(exchangeAt(circle, since, r.BEAT.lineMin) == null, 'a gather\'s beat first');
  // the table emptied forgets its company: the two come back to it mid-way through the old one's exchange - they meet
  // anew, their talk from its first line, never the old round's mid-script
  const gone = since + r.BEAT.roundMin + 3;
  r.st.clock = gone;
  r.st.inside = [];
  r.layer.frame(1, AWAY, Math.PI, [0, 1.6, -4.65]);
  assert.equal(r.layer.size, 0, 'the table empty');
  const old = dealCircles(`in:7000:${a.table}:${since}`, [a.res, b.res], 1, since + r.BEAT.roundMin, since + 2 * r.BEAT.roundMin, GATHER_BEAT_S * r.BEAT.roundMin / ROUND_S)[0];
  const oldSlots = circleSlots(old, r.BEAT.lineMin);
  const back = oldSlots.find((x) => x > gone) + 1.5 * r.BEAT.lineMin;   // the old company's exchange under way
  r.st.clock = back;
  r.st.inside = [RES(1), RES(2)];
  r.layer.frame(1, AWAY, Math.PI, [0, 1.6, -4.65]);
  assert.equal(r.layer.stood().filter((x) => x.table === a.table).length, 2, 'back at their table');
  const anew = dealCircles(`in:7000:${a.table}:${back}`, [a.res, b.res], 0, back, back + r.BEAT.roundMin, GATHER_BEAT_S * r.BEAT.roundMin / ROUND_S)[0];
  for (let tm = back; tm < back + 3 * r.BEAT.lineMin; tm += 0.25 * r.BEAT.lineMin) {
    r.st.clock = tm;
    r.layer.frame(0.016, AWAY, Math.PI, [0, 1.6, -4.65]);
    const want = circleLine(anew, tm, r.BEAT.lineMin, ctx);
    assert.deepEqual(r.layer.speech([0, 1.6, -4.65]).map((l) => l.text), want ? [want.text] : [], 'met anew');
  }
});

test('LW-FIX6 a greeting\'s rest is kept by the clock as it runs - a clock gone back (a load of an earlier save) forgets it: the room\'s, the street\'s and the road\'s word said again at once, never held till the clock passes the old one (mutants: each rest\'s clock)', () => {
  // the room's
  const T = 100 * DAY_MIN + 1200;
  const r = rig({ inside: [RES(1)], clock: T, greeting: (res, t) => `Hello at ${Math.floor(t)}.` });
  r.layer.frame(0.016, DOOR, 0, [0, 1.6, -4.6]);
  const at = r.layer.stood()[0].at;
  const by = [at[0] + 0.5, at[1], at[2]];
  r.layer.frame(0.016, by, 0, [by[0], 1.6, by[2]]);
  assert.deepEqual(r.layer.speech([by[0], 1.6, by[2]]).map((l) => l.text), [`Hello at ${T}.`]);
  r.st.clock = T + 30;
  r.layer.frame(5, by, 0, [by[0], 1.6, by[2]]);
  assert.deepEqual(r.layer.speech([by[0], 1.6, by[2]]), [], 'in its rest: no word');
  r.st.clock = T - 500;
  r.layer.frame(0.016, by, 0, [by[0], 1.6, by[2]]);
  assert.deepEqual(r.layer.speech([by[0], 1.6, by[2]]).map((l) => l.text), [`Hello at ${T - 500}.`], 'the clock gone back: said again');
  // the street's
  const { nav, buildings, doors } = synthTown();
  const town = new LivingTown(nav, {
    town: { mapId: 12345, blocks: 9, region: 17, people: 3, port: false }, buildings, doors,
    makePerson: (archive, guard) => new ResidentWalker(nav, { archive, guard, frameCount: () => 4, groundY: () => 0 }),
    clock: () => T, rate: () => CLASSIC_MINUTES_PER_SECOND, mpm: PERSON_MOVE_SPEED / CLASSIC_MINUTES_PER_SECOND,
  });
  const res = town.residents[0], person = { pos: [0, 0, 0] };
  town._now = T; town._greet(res, person, 1, true);
  assert.equal(town._greetings.length, 1);
  town._greetings = []; town._now = T + GREET_REST_MIN - 1; town._greet(res, person, 1, true);
  assert.equal(town._greetings.length, 0, 'in its rest');
  town._now = T - 500; town._greet(res, person, 1, true);
  assert.equal(town._greetings.length, 1, 'the clock gone back: said again');
  // the road's
  const { towns, world } = synthMap();
  const home = towns.find((x) => x.blocks >= 20);
  const t0 = 100 * DAY_MIN + 12 * 60;
  const pt = partiesNear(home.px, home.py, t0, world, { mpm: CALENDAR_MPM, memo: new Map() }, 6).parties[0];
  assert.ok(pt, 'a party on the road');
  const clock = { t: t0 };
  const sprites = { sync() {}, batches: () => [], persons: () => [], bodyOf: (id) => ({ person: { pos: [0, 0, 0], living: { id } } }), clear() {} };
  const roads = createLivingRoads({ world, mpm: CALENDAR_MPM, clock: () => clock.t, baseRate: () => CLASSIC_MINUTES_PER_SECOND, sceneOf: (x, z) => [x / 40, 0, z / 40], here: () => ({ x: pt.at.x, z: pt.at.z }), sprites, relations: () => createRelations() });
  const eye = [pt.at.x / 40, 1.6, pt.at.z / 40];
  const leader = pt.trip.party[0].id;
  const word = () => roads.speech(eye, 1e9).filter((l) => l.person.living.id === leader && ROAD_GREETINGS.stranger.includes(l.text)).length;
  roads.frame(1 / 30, eye); roads.frame(1 / 30, eye);
  assert.equal(word(), 1, 'a word');
  roads.frame(ROAD_GREET_S + 1, eye);
  assert.equal(word(), 0, 'gone; in its rest');
  assert.ok(ROAD_GREET_REST_MIN > 1);
  clock.t = t0 - 0.01;
  roads.frame(1 / 30, eye);
  assert.equal(word(), 1, 'the clock gone back: said again');
});

test('LW-FIX6 the hosts: the ways asked in the modal frame too (a load made in a tavern or below asked two and never again), the room held under the talk window as the street is, and the quest\'s people kept clear of the room\'s places (mutants: the ways indoors, the hold, the quest\'s feet, the dead quest stand, each read)', () => {
  // a room stepped at nought runs nothing: nobody stirs, no word runs out
  const r = rig({ inside: [RES(1)] });
  r.layer.frame(0.016, DOOR, 0, [0, 1.6, -4.6]);
  const where = r.layer.stood()[0].at;
  for (let i = 0; i < 400; i++) r.layer.frame(0, DOOR, 0, [0, 1.6, -4.6]);
  assert.deepEqual([r.layer.stood()[0].walking, r.layer.stood()[0].at], [false, where], 'held');
  const flats = [{ x: 1, y: 0, z: 2, dead: false, active: true }, { x: 5, y: 0, z: 5, dead: true, active: true }, { x: NaN, z: 0 }];
  const many = Array.from({ length: 12 }, (_, i) => RES(i + 1));
  const plain = rig({ inside: many });
  plain.layer.frame(0.016, DOOR, 0, [0, 1.6, -4.6]);
  const quest = plain.layer.stood()[0].at;   // the room's first place to fill
  const modesNow = { interiorCtx: { people: [{ x: 9, y: 0, z: 9 }, { x: 8, y: 0, z: 8, active: false }] }, interiorQuestFeet: () => [quest] };
  const questy = createLivingIndoors({ ...rigDeps(plain), questFeet: () => [quest] });
  questy.frame(0.016, DOOR, 0, [0, 1.6, -4.6]);
  assert.deepEqual(questy.spots(), plain.layer.spots(), 'the same room');
  assert.ok(questy.stood().length > 0 && questy.stood().every((x) => Math.hypot(x.at[0] - quest[0], x.at[2] - quest[2]) >= INDOOR_CLEAR_M), 'nobody on the quest\'s person');
});
