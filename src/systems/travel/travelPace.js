// @ts-check
// ═══════════════════════════════════════════════════════════════════
// PACE-DIALS.
//
// TWO DIALS, ONE LADDER (PACE_STEPS: 5, 10, 20, 30, 40, 60, 100):
//   speed - the rate a fast journey (and the Overworld's own walk) runs at
//   foe   - the slowest the clock runs while an enemy holds it (ENEMY-PACE's floor)
// THE ROAD RULE, for both: x100 may be chosen only while the traveller stands on a road or a track; the moment they
// leave it, a dial at x100 runs (and reads) x60. Off the road the ladder ends at x60.
// PACE-KEEP: the player's
// x100 is KEPT and comes back on the next road. It was written down to x60 the moment the ground said "off the road" -
// and a journey by the road says so for a moment wherever its route crosses one pixel of open ground between two road
// pixels (a gap in the network, a corner the search cut), so a x100 journey dropped to x60 for the rest of the trip with
// nothing in sight. The ground now caps the dial (paceNow, paceRateOn), it never rewrites it.
//
// THE RULE LIVES HERE, NOT IN A PANEL: every reader asks this module (systems/timeScale.js travelRateOf, travelThreat.js
// foePaced), and the host tells it the ground each frame a journey or the Overworld runs (`setPaceGround`) - so every
// skin, the classic strip's box as much as the Overworld's block, and an online session as much as an offline one, run
// under the same law. Kept on the device, never in a save (the mod saved no travel state, Travel-Options.md).
// ═══════════════════════════════════════════════════════════════════
import { appStorage } from '../appStorage.js';

export const TRAVEL_PACE_STORE_KEY = 'dfjs.travel.pace2';
/** The ladder every dial steps along. */
export const PACE_STEPS = Object.freeze([5, 10, 20, 30, 40, 60, 100]);
/** The top of the ladder (a road's alone), and the top off the road - RATE-LAW's two rates, declared here once
 *  (systems/timeScale.js TRAVEL_ROAD_RATE and TRAVEL_OPEN_RATE read them; this leaf cannot read that module, which reads
 *  it). The road's top is the mod's AccelerationLimit, timeScale.js MAX_TIME_SCALE - pinned equal. */
export const ROAD_PACE_MAX = 100;
export const OPEN_PACE_MAX = 60;
/** The two dials, in the panels' order. */
export const TRAVEL_PACE_DIALS = Object.freeze(['speed', 'foe']);
/** The defaults: the open ground's top for the journey (x100 is the player's to choose on a road), ENEMY-PACE's x5. */
export const TRAVEL_PACE_DEFAULT = Object.freeze({ speed: OPEN_PACE_MAX, foe: 5 });
/** The words the panels say. */
export const TRAVEL_PACE_TEXT = Object.freeze({
  title: 'Travel speed',
  speed: 'Speed',
  foe: 'Near enemies',
  tip: {
    speed: `How fast a journey runs (×${ROAD_PACE_MAX} on roads only, ×${OPEN_PACE_MAX} off them)`,
    foe: `The slowest the clock runs while enemies are near (×${ROAD_PACE_MAX} on a road only)`,
  },
  roadOnly: `×${ROAD_PACE_MAX} only on a road`,
  slower: 'Slower',
  faster: 'Faster',
});

/** A rate held to the ladder (rounded down onto it) and to the ground's top. */
export function clampPace(n, onRoad = false) {
  const v = Number(n);
  const top = onRoad ? ROAD_PACE_MAX : OPEN_PACE_MAX;
  if (!Number.isFinite(v)) return PACE_STEPS[0];
  let best = PACE_STEPS[0];
  for (const s of PACE_STEPS) if (s <= v && s <= top) best = s;
  return best;
}

let pace = null;
let ground = false;   // the host's last word: on a road or a track
/** The ground's top in force: the road's or the open's. */
const topOn = (onRoad) => (onRoad ? ROAD_PACE_MAX : OPEN_PACE_MAX);
const listeners = new Set();

function read() {
  const p = { ...TRAVEL_PACE_DEFAULT };
  let raw = null;
  try { raw = appStorage()?.getItem(TRAVEL_PACE_STORE_KEY) ?? null; } catch { raw = null; }
  if (raw) {
    try {
      const v = JSON.parse(raw);
      for (const k of TRAVEL_PACE_DIALS) if (Number.isFinite(v?.[k])) p[k] = clampPace(v[k], false);   // a boot is on no known road: x100 is chosen again on one
    } catch { /* a bad word: the defaults */ }
  }
  return p;
}
function write(next, which) {
  pace = next;
  try { appStorage()?.setItem(TRAVEL_PACE_STORE_KEY, JSON.stringify(pace)); } catch { /* held for the session */ }
  for (const fn of [...listeners]) { try { fn(pace, which); } catch { /* a listener's own fault */ } }
}

/** The dials as stored: { speed, foe }. */
export function travelPace() {
  pace ??= read();
  return pace;
}
/** Whether the host last said the traveller stands on a road. */
export const paceOnRoad = () => ground;

/** THE ROAD RULE'S DOOR: the host's word on the ground, each frame a journey or the Overworld runs. Leaving a road runs
 *  every dial at x100 at x60 at once - the ground's top caps it (paceNow, paceRateOn) - and the next road gives it back
 *  (PACE-KEEP: the player's choice is never rewritten). The listeners are told either way, so a running journey asks
 *  its clock again and the panels say the rate in force (and offer x100 on a road, refuse it off it). */
export function setPaceGround(onRoad) {
  const was = ground;
  ground = !!onRoad;
  if (was === ground) return;
  const cur = travelPace();
  for (const fn of [...listeners]) { try { fn(cur, 'ground'); } catch { /* a listener's own fault */ } }
}

/** A dial's rate in force now (the stored one, under the ground's top). */
export function paceNow(which) {
  const v = travelPace()[which] ?? TRAVEL_PACE_DEFAULT[which];
  return Math.min(v, topOn(ground));
}
/** The journey's rate on a ground (systems/timeScale.js travelRateOf asks). */
export const paceRateOn = (onRoad) => Math.min(topOn(onRoad), travelPace().speed);

/** Set one dial - onto the ladder, under the ground's top (x100 refused off the road). Returns the rate set. */
export function setTravelPace(which, n) {
  if (!TRAVEL_PACE_DIALS.includes(which)) return null;
  const v = clampPace(n, ground);
  const cur = travelPace();
  if (cur[which] !== v) write({ ...cur, [which]: v }, which);
  return v;
}

/** One step along the ladder: `dir` +1 faster, -1 slower (never past the ground's top). Returns the rate set. */
export function stepTravelPace(which, dir) {
  if (!TRAVEL_PACE_DIALS.includes(which)) return null;
  const cur = paceNow(which);
  let i = PACE_STEPS.indexOf(clampPace(cur, true));
  i = Math.max(0, Math.min(PACE_STEPS.length - 1, i + (dir > 0 ? 1 : -1)));
  return setTravelPace(which, PACE_STEPS[i]);
}

/** Whether a dial can step up from where it stands, on this ground. */
export function paceCanRise(which) {
  return paceNow(which) < topOn(ground);
}

/** Hear a change; returns the way to stop hearing it. */
export function onTravelPace(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pins: back to the device's word. */
export function _resetTravelPace() { pace = null; ground = false; listeners.clear(); }
