import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTER_DOOR_OFFSET, EXIT_DOOR_OFFSET, MARKER_UP_OFFSET, DUNGEON_EXIT_OFFSET,
  doorWorldPosition, doorWorldNormal, interiorLanding, exteriorLanding,
  dungeonEntranceLanding, climbLadder,
  floorLanding,
} from '../../src/player/enterExit.js';
import { trs } from '../../src/world/mat4.js';
import { Collider } from '../../src/player/collider.js';

const approx = (a, b, eps = 1e-4) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('enterExit: verbatim offsets', () => {
  approx(ENTER_DOOR_OFFSET, 0.35 + 0.4); // radius + 0.4
  approx(EXIT_DOOR_OFFSET, 0.35 * 3); // radius * 3
  approx(MARKER_UP_OFFSET, 1.8 * 0.6); // height * 0.6
});

test('enterExit: door transform under the placement matrix', () => {
  // Door centre/normal arrive PRE-scaled and Y-negated (meshReader
  // stores door verts in mesh convention); the world transform is the
  // placement matrix alone. Ry(90) carries local +x onto -z.
  const door = {
    matrix: trs(10, 0, 5, 0, 90, 0),
    centre: { x: 1, y: 2, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    size: { x: 0.1, y: 2.2, z: 1 },
  };
  const p = doorWorldPosition(door);
  approx(p[1], 2);
  approx(Math.hypot(p[0] - 10, p[2] - 5), 1);
  approx(p[2] - 5, -1); // rotation direction pinned
  const n = doorWorldNormal(door);
  approx(Math.hypot(n[0], n[1], n[2]), 1);
  approx(n[1], 0);
  approx(Math.abs(n[0]), 1); // +z normal swings onto x under Ry(90)
});

test('enterExit: landings - marker snap, door offset, closest pick', () => {
  const I = trs(0, 0, 0, 0, 0, 0);
  const mkDoor = (x, z, nx, nz) => ({
    matrix: I,
    centre: { x, y: 0, z }, // mesh-convention units, identity placement
    normal: { x: nx, y: 0, z: nz },
    size: { x: 0.1, y: 2.2, z: 1 },
  });

  // Two interior doors; the enter marker sits near door B, so the
  // landing must use B even though the exterior door is nearer A.
  const doorA = mkDoor(0, 0, 0, 1);
  const doorB = mkDoor(10, 0, 1, 0);
  const landing = interiorLanding([1, 0, 0], [[9, 0, 0.5]], [doorA, doorB]);
  approx(landing[0], 10 + 1 * ENTER_DOOR_OFFSET);
  approx(landing[2], 0);

  // No doors: marker + up * 1.08.
  const fallback = interiorLanding([1, 0, 0], [[9, 0, 0.5]], []);
  approx(fallback[1], 0 + MARKER_UP_OFFSET);
  assert.equal(interiorLanding([0, 0, 0], [], []), null);

  // Exit: closest exterior sibling + normal * 1.05.
  const out = exteriorLanding([9.6, 0, 0.2], [doorA, doorB]);
  approx(out[0], 10 + EXIT_DOOR_OFFSET);
  approx(out[2], 0);
});

test('enterExit: dungeon exit landing - offset and lowest-door pick', () => {
  approx(DUNGEON_EXIT_OFFSET, 0.35 + 0.1);
  const I = trs(0, 0, 0, 0, 0, 0);
  const high = { matrix: trs(0, 5, 0, 0, 0, 0), centre: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
  const low = { matrix: I, centre: { x: 10, y: 1, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
  const landing = dungeonEntranceLanding([high, low]);
  approx(landing.pos[0], 10 + DUNGEON_EXIT_OFFSET);
  approx(landing.pos[1], 1);
  approx(landing.normal[0], 1);
  assert.equal(dungeonEntranceLanding([]), null);
});

test('enterExit: ladder climb - verbatim marker rules', () => {
  const M = { LADDER_BOTTOM: 21, LADDER_TOP: 22 };
  const markers = [
    { type: 21, x: 0, y: 0.5, z: 0 },
    { type: 22, x: 0, y: 4.2, z: 0 },
    { type: 22, x: 30, y: 9, z: 0 }, // a farther top must lose
  ];
  // Below the top -> teleports TO the top.
  assert.deepEqual(climbLadder([0.4, 1.0, 0], markers, M), [0, 4.2, 0]);
  // Above the bottom (standing at the top) -> teleports to the bottom.
  assert.deepEqual(climbLadder([0.2, 4.2, 0], markers, M), [0, 0.5, 0]);
  // No markers -> null.
  assert.equal(climbLadder([0, 1, 0], [], M), null);
});

test('floorLanding: FixStanding snap - a raised landing floors instantly', () => {
  // Raw landings sit at door-centre height / marker + 1.08; DFU ends
  // every transition with FixStanding's raycast snap. Gravity-flooring
  // instead was the visible "drop in" on building entry.
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const c = new Collider(() => -Infinity);
  c.addMesh('floor', new Float32Array([-5, 0.7, -5, 5, 0.7, -5, 5, 0.7, 5, -5, 0.7, 5]), new Uint32Array([0, 1, 2, 0, 2, 3]), I);
  const floored = floorLanding(c, [1, 1.9, 1]);      // 1.2 above the floor
  approx(floored[1], 0.7, 1e-3);
  assert.equal(floored[0], 1); assert.equal(floored[2], 1);
  const noHit = floorLanding(c, [20, 1.9, 20]);      // off the floor quad: unchanged, gravity fallback
  assert.deepEqual(noHit, [20, 1.9, 20]);
});

// ── THE EXTERIOR SIDE OF THE DOOR ──
//
// Both exterior exits are RepositionPlayer(Offset|DungeonEntrance) in
// DFU (StreamingWorld.cs:283-288): the door centre plus the normal is
// where the controller's CENTRE goes, never below terrain + height/2 +
// 0.15 (:1345-1351). The port's spawn is the FEET, and it was handed
// the centre - a body-half in the air, then a drop, at every door out.
import { repositionFeetY } from '../../src/player/enterExit.js';
import { CAPSULE_HEIGHT } from '../../src/player/motor.js';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('repositionFeetY: RepositionPlayer\'s height law, in feet', () => {
  // A door centre 1.2u above flat terrain at 10: the centre is above the
  // floor minimum, so the centre stands and the feet are h/2 below it.
  assert.equal(repositionFeetY(10, 11.2), 11.2 - CAPSULE_HEIGHT / 2);
  assert.ok(Math.abs(repositionFeetY(10, 11.2) - 10.3) < 1e-9, 'feet 0.3 over the terrain, which gravity settles - not 1.2');
  // A door centre at or under the terrain (a sunken doorway): the floor
  // minimum wins - terrain + 0.15 in feet (terrain + h/2 + 0.15, centre).
  assert.equal(repositionFeetY(10, 9.5), 10.15);
  assert.equal(repositionFeetY(10, 10.9), 10.15, 'exactly at the minimum, not below it');
  // No terrain beneath (heightAt's -Infinity): the centre alone decides.
  assert.equal(repositionFeetY(-Infinity, 5), 5 - CAPSULE_HEIGHT / 2);
  assert.equal(repositionFeetY(undefined, 5), 5 - CAPSULE_HEIGHT / 2);
  // The constants are DFU's: half the standing height, plus 0.15.
  assert.equal(CAPSULE_HEIGHT, 1.8);
});

// ── TL1: THE ARRIVAL LOOKS FURTHER FOR ITS FLOOR ──────────────────
test('TL1: an arrival finds a floor far below OR far above its raw, where a door step would not', async () => {
  const { floorLanding } = await import('../../src/player/enterExit.js');
  const plane = (floorY) => ({ raycast(o, d, max) { const t = (o[1] - floorY) / -d[1]; return t >= 0 && t <= max ? t : Infinity; } });
  // The door step's ten units: a floor thirty below is missed and the
  // raw stands - in the air - and a floor twenty ABOVE is missed too,
  // the ray starting inside the hill.
  assert.equal(floorLanding(plane(-30), [0, 2, 0])[1], 2, 'old reach: left in the air');
  assert.equal(floorLanding(plane(20), [0, 2, 0])[1], 2, 'old reach: left inside the hill');
  // The arrival's lift and reach find both.
  assert.equal(floorLanding(plane(-30), [0, 2, 0], 240, 40)[1], -30);
  assert.equal(floorLanding(plane(20), [0, 2, 0], 240, 40)[1], 20);
  // ...and a flat site lands exactly where it always did.
  assert.equal(floorLanding(plane(0), [0, 2, 0], 240, 40)[1], 0);
  const { readFileSync } = await import('node:fs');
});

// ── TSR4c: THE RAY ONLY SEES MESHES; THE GROUND IS THE COLLIDER'S ──
// Over bare
// terrain outside every block the footprint sweep finds nothing - the
// exterior collider carries the terrain as its heightAt callback, read
// by move() and never by the ray - and the miss arm answered the raw
// LIFTED by extraHeight: forty units up, then the drop.
test('TSR4c: a miss over a collider that has a ground answers the ground, not the lifted raw', async () => {
  const { floorLanding } = await import('../../src/player/enterExit.js');
  const miss = { raycast: () => Infinity };
  // no ground at all (a stub, an interior, a dungeon): the old arm, byte
  // for byte - the lifted raw stands and gravity is the fallback
  assert.deepEqual(floorLanding(miss, [3, 2, 4]), [3, 2, 4]);
  assert.deepEqual(floorLanding(miss, [3, 2, 4], 240, 40), [3, 42, 4], 'lifted, as TL1 left it');
  assert.deepEqual(floorLanding({ ...miss, heightAt: () => -Infinity }, [3, 2, 4], 240, 40), [3, 42, 4], 'a Collider\'s default ground is no ground');
  // a ground under the point: the landing is ON it, lift or no lift,
  // above the raw or below it
  const ground = { ...miss, heightAt: (x, z) => 10 + x * 0 + z * 0 };
  assert.deepEqual(floorLanding(ground, [3, 2, 4], 240, 40), [3, 10, 4], 'the ground above the raw');
  assert.deepEqual(floorLanding({ ...miss, heightAt: () => -25 }, [3, 2, 4], 240, 40), [3, -25, 4], 'the ground below it');
  assert.deepEqual(floorLanding({ ...miss, heightAt: () => 1.5 }, [3, 2, 4]), [3, 1.5, 4], 'the boot stand, no lift');
  // a mesh hit still wins the way it always did - the ground is only
  // asked when every sample missed
  const hit = { raycast: (o) => o[1] - 5, heightAt: () => 10 };
  assert.deepEqual(floorLanding(hit, [3, 2, 4], 240, 40), [3, 5, 4], 'a mesh under the ray floors there');
  // the real Collider exposes exactly that callback, and the exterior
  // host hands it the terrain
  const { Collider } = await import('../../src/player/collider.js');
  assert.equal(new Collider(() => 7).heightAt(0, 0), 7);
  const { readFileSync } = await import('node:fs');
});
