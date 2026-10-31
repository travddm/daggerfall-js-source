// OW6 - THE JOURNEY SLOWS AS ENEMIES CLOSE (2026-09-29, the player: "If a player is traveling very fast, they should slow
// if enemies become close"). The law (systems/travel/travelThreat.js: an enemy's reach along the way, the cap that gives the
// traveller THREAT_WARN_S of real time before it, the spinner's ladder); a journey flown frame by frame at x40 straight at
// a band, with and without it; and the host's governor lifted out of scenes/world.js and RUN on both skins - the lower of
// the ground's cap and the enemies' holds, the panel told why, a line said once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THREAT_WARN_S, metresToReach, threatStep, threatCap, foePaced, foeRate } from '../../../src/systems/travel/travelThreat.js';
import { createLoadGovernor, travellerPace, unbuiltCount } from '../../../src/systems/travel/travelGovernor.js';
import { TRAVEL_HELD_TEXT, TRAVEL_HELD_WHY } from '../../../src/ui/enhanced/enhancedTravelControl.js';
import { foeHostile, foeAlerted, areEnemiesNearby } from '../../../src/systems/encounters.js';
import { TRAVEL_VIEW_TEXT, travelWalkRate, TV_MOVE_ACTIONS } from '../../../src/scenes/travelView.js';
import { setPaceGround, setTravelPace, _resetTravelPace } from '../../../src/systems/travel/travelPace.js';   // PACE-DIALS: the road's x100 is the player's dial
/** PACE-DIALS (2026-10-06): x100 is chosen, on a road - the dial set there as the panels set it (the default is x60, and
 *  leaving a road takes it back to x60: test/systems/travel/pacedials.test.js). These pins hold the LANES' law at the dial's top. */
const dialAtTop = () => { _resetTravelPace(); setPaceGround(true); setTravelPace('speed', 100); };

const NORTH = { x: 0, z: 1 };

test('OW6 law: AN ENEMY\'S REACH ALONG THE WAY - dead ahead, the distance to its edge; beside the way, where the way first comes within it; a way that passes it by, or it behind, never; inside it, held while the way goes deeper and free as it leads out; no way, the straight distance (mutants: the root\'s sign, behind counted, inside always held)', () => {
  assert.equal(metresToReach(0, 1000, 300, NORTH), 700, 'dead ahead: its edge, 700 m on');
  const beside = metresToReach(200, 1000, 300, NORTH);   // the way enters the circle where (200, z) is 300 from it
  assert.ok(Math.abs(beside - (1000 - Math.sqrt(300 * 300 - 200 * 200))) < 1e-9, `beside the way: ${beside.toFixed(1)} m`);
  assert.equal(metresToReach(400, 1000, 300, NORTH), Infinity, 'the way passes 400 m off a 300 m reach: never');
  assert.equal(metresToReach(0, -1000, 300, NORTH), Infinity, 'behind: never');
  assert.equal(metresToReach(0, 100, 300, NORTH), 0, 'inside it, the way deeper: held');
  assert.equal(metresToReach(0, -100, 300, NORTH), Infinity, 'inside it, the way leading out: free');
  assert.equal(metresToReach(300, 400, 100, null), 400, 'no way: the straight distance to its edge');
  assert.equal(metresToReach(30, 40, 100, null), 0);
});

test('OW6 law: THE CAP - the highest rate that leaves THREAT_WARN_S of real time to the nearest reach, stepped down the spinner\'s own ladder, never under walking pace; a chaser from any side at its own pace too; nothing near, no cap (mutants: the warning, the ladder, the chaser\'s pace dropped, the worst threat not the one kept)', () => {
  assert.equal(THREAT_WARN_S, 0.6);   // OW6-LATE: was 5 - the player: it slowed "waaaay to early"; OW6-NEAR (29g): 2 -> 1.2, "reduce ... by like 40%"; OW6-HALF (2026-10-01): 1.2 -> 0.6
  assert.deepEqual([0.2, 1.7, 3.9, 4.99, 5, 9.9, 10, 47, 100].map(threatStep), [1, 1, 3, 4, 5, 5, 10, 45, 100]);
  assert.deepEqual(threatCap({ threats: [], heading: NORTH, speedMps: 16 }), { cap: Infinity, threat: null, metres: Infinity, held: false });   // PIN MOVED (TIME-DILATION: `held`, no hold)
  const band = { dx: 0, dz: 2000, reach: 320 };
  assert.equal(threatCap({ threats: [band], heading: NORTH, speedMps: 0 }).cap, Infinity, 'standing: nothing to hold');
  // a rider (16 m/s) 1680 m from a band's sight: 1680 / (0.6 x 16) = 175 -> x175
  const r = threatCap({ threats: [band], heading: NORTH, speedMps: 16 });
  assert.deepEqual([r.cap, r.metres, r.threat], [175, 1680, band]);
  assert.equal(threatCap({ threats: [band], heading: NORTH, speedMps: 4 }).cap, 700, 'on foot the same band asks for less');
  assert.equal(threatCap({ threats: [{ dx: 900, dz: 2000, reach: 320 }], heading: NORTH, speedMps: 16 }).cap, Infinity, 'one the way passes by: no cap');
  // a chaser 400 m BEHIND, closing at 5.2 m/s on a walker at 3: (400 - 30) / (0.6 x 8.2) = 75.2 -> x75
  const chaser = { dx: 0, dz: -400, reach: 30, chasing: true, mps: 5.2 };
  assert.equal(threatCap({ threats: [chaser], heading: NORTH, speedMps: 3 }).cap, 75, 'a chaser from behind still holds');
  assert.equal(threatCap({ threats: [{ ...chaser, mps: 0 }], heading: NORTH, speedMps: 3 }).cap, 205, 'its own pace counted (370 / 1.8 = 205.6)');
  // the worst of several is the one kept
  const near = { dx: 50, dz: 150, reach: 60 };
  const both = threatCap({ threats: [band, near, { dx: 0, dz: -5000, reach: 320 }], heading: NORTH, speedMps: 16 });
  assert.equal(both.threat, near);
  assert.equal(both.cap, 10, 'a camp\'s foe a hundred-odd metres ahead: 117 m to its sight / (0.6 x 16) = 12.2 -> x10');
});

/** A journey flown frame by frame (30 fps) straight at a band `startM` ahead, at the spinner's `asked`: the real seconds
 *  taken over the last `lastM` metres before its sight, and the rate at the frame the traveller entered it. */
const fly = ({ asked, speed, startM, sight = 320, capped, lastM = 500 }) => {
  let z = 0, t = 0, tLast = null, rateAtEntry = null;
  const bandZ = startM;
  for (let frame = 0; frame < 100000; frame++) {
    const d = bandZ - z;
    if (d - sight <= lastM && tLast == null) tLast = t;
    if (d <= sight) { rateAtEntry = rateAtEntry ?? (capped ? Math.min(asked, threatCap({ threats: [{ dx: 0, dz: d, reach: sight }], heading: NORTH, speedMps: speed }).cap) : asked); break; }
    const cap = capped ? threatCap({ threats: [{ dx: 0, dz: d, reach: sight }], heading: NORTH, speedMps: speed }).cap : Infinity;
    const rate = Math.min(asked, cap);
    z += speed * rate / 30; t += 1 / 30;
  }
  return { seconds: t - tLast, rateAtEntry };
};

test('OW6: A RIDER AT x40 STRAIGHT AT A BAND - with the cap it comes into the band\'s sight at walking pace after seconds of warning; without it, the last half-kilometre went in under a second at x40 (the "run thru them" of AUDIT OW5b, before it could even begin)', () => {
  const before = fly({ asked: 40, speed: 16, startM: 5000, capped: false });
  assert.equal(before.rateAtEntry, 40);
  assert.ok(before.seconds < 1, `uncapped: the last 500 m in ${before.seconds.toFixed(2)} s`);
  const after = fly({ asked: 40, speed: 16, startM: 5000, capped: true });
  assert.equal(after.rateAtEntry, 1, 'into its sight at walking pace');
  assert.ok(after.seconds >= THREAT_WARN_S, `capped: the last 500 m in ${after.seconds.toFixed(1)} s`);
  const foot = fly({ asked: 40, speed: 3.5, startM: 3000, capped: true });
  assert.equal(foot.rateAtEntry, 1, 'on foot too');
});

test('OW6: the panel says why the clock is held - the land loading, an enemy near, the view down (it said "while the land loads" for all three); the hostility gate is the sweep\'s own, one home', () => {
  assert.equal(TRAVEL_HELD_TEXT(20, 40), 'Held to ×20 of ×40 while the land loads');
  assert.equal(TRAVEL_HELD_TEXT(5, 40, 'foes'), 'Held to ×5 of ×40 with enemies near');
  assert.equal(TRAVEL_HELD_TEXT(1, 40, 'ground'), 'Held to ×1 of ×40 until the Overworld rises');   // AUDIT OW5 G1's word
  assert.equal(TRAVEL_HELD_TEXT(1, 40, 'junk'), `Held to ×1 of ×40 ${TRAVEL_HELD_WHY.load}`);
  assert.equal(TRAVEL_VIEW_TEXT.enemiesSlow, 'Enemies are near. You slow your pace.');
  const foe = (o = {}) => ({ dead: false, ai: { isHostile: true, detected: true, inSight: true }, entity: { mobileEnemy: { team: 'Orcs' } }, ...o });
  assert.equal(foeHostile(foe()), true);
  assert.equal(foeHostile(foe({ dead: true })), false);
  assert.equal(foeHostile(foe({ ai: { isHostile: false } })), false, 'pacified');
  assert.equal(foeHostile(null), false);
  assert.equal(areEnemiesNearby([foe()]), true, 'the sweep reads it');
  assert.equal(areEnemiesNearby([foe({ ai: { isHostile: false, detected: true, inSight: true } })]), false);
});

