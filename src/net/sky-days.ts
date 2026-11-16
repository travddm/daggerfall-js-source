// The sky's day on the wall clock: what the Starfall's nights stand on. The sky is the world clock, or, with the server
// profile's `time.skyClock`, the world clock until SKY_SWITCH_MS and the sky's own TimeScale after it. This is the same
// sky as skyLaw.js (test/net/sky_days.test.js holds them equal); it lives here because the relay carries it and never
// carries skyLaw.js, which reads the profile's registry.
import { sharedClassicMinutes, wallMsForClassicMinutes } from './wire.js';
import { SKY_SWITCH_MS, onlineTimeScale, skyClockOn, skyTimeScale } from './world-time-scale.ts';

const MINUTES_PER_DAY = 1440;

/** The sky's TimeScale after the switch while the sky has a clock of its own; the world's otherwise. */
const skyScaleNow = (): number => (skyClockOn() ? skyTimeScale() : onlineTimeScale());

/** The sky's clock, classic minutes, at a relay-clock instant (ms). */
export function skyMinutesAtWall(nowMs: number): number {
  if (!skyClockOn() || nowMs < SKY_SWITCH_MS) return sharedClassicMinutes(nowMs);
  return sharedClassicMinutes(SKY_SWITCH_MS) + ((nowMs - SKY_SWITCH_MS) * skyTimeScale()) / 60_000;
}
/** The inverse: the relay-clock millisecond at which the sky reads a classic minute. */
export function wallMsAtSkyMinutes(classicMinutes: number): number {
  const atSwitch = sharedClassicMinutes(SKY_SWITCH_MS);
  if (!skyClockOn() || classicMinutes < atSwitch) return wallMsForClassicMinutes(classicMinutes);
  return SKY_SWITCH_MS + ((classicMinutes - atSwitch) * 60_000) / skyTimeScale();
}
/** A sky day, real ms: two hours at the world's TimeScale 12, an hour at the sky clock's 24. */
export const skyDayMs = (): number => (MINUTES_PER_DAY * 60_000) / skyScaleNow();
/** The relay-clock millisecond (whole) at which sky day `n` begins: the sky reads its midnight, minute `n * 1440`. */
export const skyDayStartMs = (n: number): number => Math.round(wallMsAtSkyMinutes(n * MINUTES_PER_DAY));
/** The first sky day that begins at or after a relay-clock instant. */
export function skyDayAtOrAfter(nowMs: number): number {
  let n = Math.ceil(skyMinutesAtWall(nowMs) / MINUTES_PER_DAY);
  while (skyDayStartMs(n) < nowMs) n++;
  while (skyDayStartMs(n - 1) >= nowMs) n--;
  return n;
}
