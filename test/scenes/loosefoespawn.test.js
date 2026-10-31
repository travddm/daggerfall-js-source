// SD1 - THE LOOSE FOE STANDS WHERE DFU STANDS IT (2026-08-29).
//
// SoulBound's break release and the Sanguine Rose's Daedroth are the
// two enchantments that put a foe in the world. Both dropped it at the
// player's feet plus a fixed (+2, +1, 0) - inside the player in a
// corridor, inside the wall against one - and EC1 had just made them
// refuse underground rather than stand it in the streaming world the
// player was not in.
//
// The law they needed was ALREADY IN THE TREE. B1 ported
// FoeSpawner.PlaceFoeFreely for the quest foe arm, raycast ring and
// all, and this slice began by writing a second copy of it before
// finding the first. One home; SD1 routes the enchantment arms through
// the same function tryPlaceFoe uses.
//
// What was genuinely missing is DFU's OTHER rotation arm. PlaceFoeFreely
// (:141-155) has two: LineOfSightCheck true tries to spawn just outside
// the player's field of view, false takes any bearing in the circle
// ("Don't care about player's field of view (e.g. at rest)"). Only the
// first was ported - and SoulBound passes FALSE (SoulBound.cs:100), so
// a released soul is allowed to appear in front of you, which is the
// whole character of the effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeFoeFreely, PLACE_FOE_DEFAULTS } from '../../src/systems/quest/sceneMount.js';
import { placeFoeEnv } from '../../src/scenes/quest/questFoeHost.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => hostText(rel);

/** An open room: nothing to hit sideways, a floor 2 below, no capsules.
 *  `rolls` is a scripted sequence so each arm's draws are exact. */
function openRoom(seq) {
  let i = 0;
  const collider = {
    raycastHit: (o, d) => (d[1] === -1
      ? { dist: 2, key: null, normal: [0, 1, 0] }
      : { dist: Infinity, key: null, normal: null }),
    sphereOverlaps: () => false,
  };
  return placeFoeEnv({
    collider, playerFeet: [0, 0.9, 0], playerYawRad: 0, fovDegrees: 60,
    rolls: () => seq[i++ % seq.length],
  });
}
/** The bearing a spot was placed on, in degrees off the player's yaw. */
const bearingDeg = (spot) => ((Math.atan2(spot.x, spot.z) * 180 / Math.PI) + 360) % 360;

/** How far off the player's own facing a spot sits, 0..180. */
const offAxisDeg = (spot) => Math.min(bearingDeg(spot), 360 - bearingDeg(spot));

test('SD1: with the LOS check the foe lands just OUTSIDE the view cone, either side', () => {
  // draws: the 0..4 jitter, then the side coin, then the open-area distance.
  // The coin is `> 0.5 ? -angle : +angle`, so the HIGH roll is the minus side.
  const minus = placeFoeFreely(openRoom([0, 1, 0.5]), { minDistance: 4, maxDistance: 20 });
  const plus = placeFoeFreely(openRoom([0, 0, 0.5]), { minDistance: 4, maxDistance: 20 });
  assert.equal(Math.round(bearingDeg(minus)), 300, 'fov 60 + 0 jitter, coin > 0.5 = the MINUS side');
  assert.equal(Math.round(bearingDeg(plus)), 60, 'and a low coin is the same angle mirrored');
  // never inside the cone: the off-axis angle is at least the half-FOV either way
  for (const s of [minus, plus]) {
    assert.ok(offAxisDeg(s) >= 30, `a spawn at ${offAxisDeg(s)} degrees would be inside a 60-degree view`);
  }
});

test('SD1: the jitter widens the angle, and only OUTWARDS (Random(0, 4))', () => {
  // it is added to directionAngle BEFORE the sign, so it pushes further
  // from the player's facing on whichever side the coin picked - never
  // back toward the cone.
  for (const coin of [1, 0]) {
    const near = placeFoeFreely(openRoom([0, coin, 0.5]), { minDistance: 4, maxDistance: 20 });
    const far = placeFoeFreely(openRoom([1, coin, 0.5]), { minDistance: 4, maxDistance: 20 });
    assert.equal(Math.round(offAxisDeg(far) - offAxisDeg(near)), 4,
      `a full roll adds the whole 4 degrees, away from the view (coin ${coin})`);
  }
});

test('SD1: lineOfSightCheck FALSE takes any bearing in the circle - the arm SoulBound passes', () => {
  // one draw for the bearing, then the distance - NOT the jitter/coin pair
  const ahead = placeFoeFreely(openRoom([0, 0.5]), { minDistance: 4, maxDistance: 20, lineOfSightCheck: false });
  assert.equal(Math.round(bearingDeg(ahead)), 0,
    'a zero roll puts the released soul DEAD AHEAD - the LOS arm can never do this');
  const quarter = placeFoeFreely(openRoom([0.25, 0.5]), { minDistance: 4, maxDistance: 20, lineOfSightCheck: false });
  assert.equal(Math.round(bearingDeg(quarter)), 90, 'and the roll spans the full 360');
  // and the distance draw is the NEXT roll, not a third one - the arm
  // consumes one fewer than the LOS arm, which is how the sequences differ
  assert.equal(Math.round(Math.hypot(quarter.x, quarter.z)), 12, '4 + 0.5 * (20 - 4)');
});

test('SD1: the open-area distance rides the caller\'s band, not the signature default', () => {
  // CreateFoeSpawner's fields are min 4 / max 20 (GameObjectHelper.cs
  // :1314); placeFoeFreely's own signature says 5. The enchantment
  // callers get the spawner's, so the band has to be passed.
  const own = placeFoeFreely(openRoom([0, 0.5]), { lineOfSightCheck: false });
  const spawner = placeFoeFreely(openRoom([0, 0.5]), { minDistance: 4, maxDistance: 20, lineOfSightCheck: false });
  assert.equal(Math.round(Math.hypot(own.x, own.z)), 13, 'the default band is 5..20');
  assert.equal(Math.round(Math.hypot(spawner.x, spawner.z)), 12, 'the spawner band is 4..20');
  assert.equal(PLACE_FOE_DEFAULTS.minDistance, 5, 'and the table still records the function\'s own');
});

test('SD1: both arms still land on the floor, and still refuse an occupied spot', () => {
  // the arms differ in BEARING only - every later refusal is shared.
  const spot = placeFoeFreely(openRoom([0, 0.5]), { lineOfSightCheck: false });
  assert.equal(spot.y, 0.9 - 2 + PLACE_FOE_DEFAULTS.separationDistance,
    'floor 2 below the cast origin, then DFU\'s separation above it');
  const packed = placeFoeEnv({
    collider: {
      raycastHit: (o, d) => (d[1] === -1 ? { dist: 2, key: null, normal: [0, 1, 0] } : { dist: Infinity, key: null, normal: null }),
      sphereOverlaps: () => true,   // something is already standing there
    },
    playerFeet: [0, 0.9, 0], playerYawRad: 0, fovDegrees: 60, rolls: () => 0.5,
  });
  assert.equal(placeFoeFreely(packed, { lineOfSightCheck: false }), null, 'refused, and the caller retries');
  assert.equal(placeFoeFreely(packed), null, 'the LOS arm refuses the same spot for the same reason');
});

