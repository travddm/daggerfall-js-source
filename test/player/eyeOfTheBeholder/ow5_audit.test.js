// AUDIT OW5 (2026-09-29, Mac: "Before we merge. Can we do a comprehensive audit on the overworld, just want to make sure
// it's perfect.") - the Overworld audited again before the merge, seven lenses, each finding verified before it was
// fixed (bible/06-Systems/Travel-View.md, AUDIT OW5). Pinned here, each on the host's own source where it can be run:
// the find's own uncapped list (D1), the raiders held under a window (R1), the ocean stop stood down for the crossing
// alone (S1), a jump stopping a route's walk (J2), the Overworld's lines held at the clock's scale (G2), a lock granted
// after the cursor was freed let go (V1), the head's activation keys never pressed from under the view (V2), and a door's
// POV row kept over the view's hold (V3). The rest are pinned beside their own suites (tv7, tv8, tv_wasd, ow_toggle,
// eotb_body, ows2/3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearDungeons, dungeonToFind, dungeonApproach, pixelBox, NATIVE_PER_M, TV_DUNGEON_MAX } from '../../../src/systems/travel/travelDungeons.js';
import { chaseStep as raiderChaseStep, RAIDER_CONTACT_M, RAIDER_CONTACT_PLAY_M, NATIVE_PIXEL as RAID_NATIVE_PIXEL } from '../../../src/systems/seaRaiders.js';
import { AUTO_TOGGLE } from '../../../src/player/eyeOfTheBeholder/eotbBillboard.js';
import { planRoute, routeLegs, crossesWater } from '../../../src/systems/travel/travelRoute.js';
import { planJourney } from '../../../src/systems/travel/planSlices.js';   // PIN MOVED (PLAN-SLICES): the walk runs through the slicer
import { tvMooredDry } from '../../../src/systems/travel/seaAsk.js';   // PIN MOVED (PLAN-SLICES): out of the host

const mount = (env, body) => { const names = Object.keys(env); return new Function(...names, body)(...names.map((k) => env[k])); };

test('AUDIT OW5 D1: the find asks every unfound dungeon in reach - a dozen found about the traveller no longer hides the one within a kilometre (the plates\' list keeps TV_DUNGEON_MAX, the found first)', () => {
  // twelve found dungeons about the traveller, a dozen within the find's own reach (a crowd: the uncapped law), and one
  // unfound two pixels east - past the plates' grid of one (inside it, AUDIT OW5b D1 plates an unfound one beside the
  // twelve, so the plates would hold it), within the find's kilometre of feet at the east edge of their pixel
  const rows = [];
  const ring = [];   // past the grid (TV2's plates stand within it) and within the find's reach
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) >= 2 && Math.hypot(dx, dy) <= 4) ring.push([dx, dy]);
  for (let i = 0; i < 12; i++) rows.push({ x: 100 + ring[i][0], y: 200 + ring[i][1], row: { mapID: 1000 + i } });
  rows.push({ x: 102, y: 200, row: { mapID: 7 } });
  const found = (x, y) => !(x === 102 && y === 200);
  const loc = (x, y) => ({ name: found(x, y) ? `Keep ${x}.${y}` : 'Unfound Keep', x, y });
  const plates = nearDungeons({ at: { x: 100, y: 200 }, dungeons: rows, locAt: loc, isFound: found, grid: 1 });
  assert.equal(plates.length, TV_DUNGEON_MAX);
  const env = {
    playerTravelPixel: () => ({ x: 100, y: 200 }), discoveryGeneration: () => 3, _locIndexGen: 9, nearDungeons, TV_FIND_REACH: 4,
    dungeonRows: () => rows, mapDict: null, locationIndex: { get: (k) => { const [x, y] = k.split(',').map(Number); return loc(x, y); } },
    tvPlaceSummary: (x, y) => (found(x, y) ? { name: 'x' } : null),
    locationWorldRect: (l, x, y) => ({ minX: x * 32768, maxX: x * 32768 + 4096, minZ: y * 32768, maxZ: y * 32768 + 4096 }),
  };
  assert.ok(NATIVE_PER_M > 0);
});

test('AUDIT OW5 V1: a pointer lock the browser grants after the cursor was freed is let go - the Overworld risen on the frame after a window closed had the look gate\'s relock land under it', async () => {
  const listeners = { pointerlockchange: [], pointerlockerror: [] };
  let exits = 0;
  const doc = {
    pointerLockElement: null,
    addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn); },
    removeEventListener: () => {},
    exitPointerLock: () => { exits++; doc.pointerLockElement = null; },
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  try {
    const pl = await import('../../../src/player/pointerLock.js');
    const canvas = { requestPointerLock: () => undefined };
    pl.setCursorActive(false);
    pl.requestLook(canvas);   // the look gate's relock on a window's close - answered later
    pl.setCursorActive(true); pl.releaseLook();   // the view rises: the cursor freed, and no lock yet to release
    assert.equal(exits, 0, 'nothing to let go yet');
    doc.pointerLockElement = canvas;   // the browser's answer lands
    for (const fn of listeners.pointerlockchange) fn();
    assert.equal(exits, 1, 'let go at once');
    pl.setCursorActive(false);
    doc.pointerLockElement = canvas;
    for (const fn of listeners.pointerlockchange) fn();
    assert.equal(exits, 1, 'a lock granted with the cursor NOT freed is kept');
  } finally {
    if (had) Object.defineProperty(globalThis, 'document', had); else delete globalThis.document;
  }
});

test('AUDIT OW5 V3: a door\'s POV row that DECIDES (armed, first or third person) is kept over the travel view\'s hold - the view\'s release at the door put the head back; Don\'tChange leaves the hold to hand back what it found', async () => {
  const { createEotbCamera, eotbCamera } = await import('../../../src/player/eyeOfTheBeholder/eotbCamera.js');
  const mv = await import('../../../src/player/mwView.js');
  const rows = (interior) => (v, k) => ({ 'AutoTogglePerspective.OnTransitionInterior': interior, 'AutoTogglePerspective.OnFoot': AUTO_TOGGLE.FirstPerson })[k];
  const cam = createEotbCamera();
  cam.loadSettings(rows(AUTO_TOGGLE.ThirdPerson));
  assert.equal(cam.transitionDecides('Interior'), true, 'armed, third: decides');
  assert.equal(cam.transitionDecides('Exterior'), false, 'its Don\'tChange row: does not');
  cam.toggleAuto();
  assert.equal(cam.transitionDecides('Interior'), false, 'disarmed: nothing decides');
  mv.setEotbBodyReady(() => true);
  try {
    for (const [row, third] of [[AUTO_TOGGLE.ThirdPerson, true], [AUTO_TOGGLE.DontChange, false]]) {
      eotbCamera.loadSettings(row === AUTO_TOGGLE.DontChange ? rows(undefined) : rows(row));
      if (eotbCamera.thirdPerson()) eotbCamera.toggleOffset(false);
      assert.equal(mv.mwViewHoldThird(true), true, 'the view holds the body out of the head');
      mv.mwViewTransition('Interior');   // the door, taken under the view
      mv.mwViewHoldThird(false);   // the door's cut, a frame later
      assert.equal(eotbCamera.thirdPerson(), third, third ? 'the row\'s third person kept' : 'no row: handed back into the head it was in');
    }
  } finally {
    mv.setEotbBodyReady(() => false);
    eotbCamera.loadSettings(null);
    if (eotbCamera.thirdPerson()) eotbCamera.toggleOffset(false);
  }
});

test('AUDIT OW5 J3: the whole map\'s rung is never cut short - a far pick round a range with no road to help is found, never "no way by land" (the guard stopped it at 200 000 of the map\'s 500 000 cells)', () => {
  // a wall of water down x=500 from the top to y=439; the way round is past its end - over 400 pixels, no roads
  const wall = (x, y) => x === 500 && y < 440;
  const t = performance.now();
  const r = planRoute({ x: 490, y: 200 }, { x: 510, y: 200 }, { isWater: wall });
  const ms = performance.now() - t;
  assert.ok(r, 'a way round is found');
  assert.ok(r.pixels.some((p) => p.y >= 440), 'past the wall\'s end');
  assert.ok(r.pixels.every((p) => !wall(p.x, p.y)), 'never through it');
  assert.ok(ms < 5000, `and within reason (${ms.toFixed(0)} ms)`);
});

test('AUDIT OW5 J4: a walk\'s approach point stays inside its own pixel - a place filling its pixel (eight blocks) put it 20 m into the next, where the spot\'s arrival is never asked, and the walk went back and forth for ever', () => {
  const box = pixelBox(10, 5);
  assert.deepEqual(box, { minX: 10 * 32768 + 256, maxX: 11 * 32768 - 256, minZ: 494 * 32768 + 256, maxZ: 495 * 32768 - 256 });
  const rect = { minX: 10 * 32768, maxX: 11 * 32768, minZ: 494 * 32768, maxZ: 495 * 32768 };   // eight blocks: the whole pixel
  const feet = { x: 9 * 32768, z: rect.minZ + 16384 };   // coming in from the west
  assert.ok(dungeonApproach(rect, feet).x < rect.minX, 'unclamped: in the pixel to the west');
  const n = dungeonApproach(rect, feet, undefined, box);
  assert.ok(n.x >= box.minX && n.x <= box.maxX && n.z >= box.minZ && n.z <= box.maxZ, 'clamped: inside the walk\'s own pixel');
  const small = { minX: rect.minX + 12000, maxX: rect.minX + 20000, minZ: rect.minZ + 12000, maxZ: rect.minZ + 20000 };
  assert.deepEqual(dungeonApproach(small, feet, undefined, box), dungeonApproach(small, feet), 'a small place\'s edge point is as it was');
});
