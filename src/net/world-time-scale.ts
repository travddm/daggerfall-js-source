// The online clocks' TimeScales: game minutes per real minute, for the world clock and, when the sky has a clock of its
// own, for the sky. The relay, the account Worker and every client keep the values here and read them through the wire's
// clock (wire.js sharedClassicMinutes) and the sky's (sky-days.ts, skyLaw.js). A leaf with no imports, so each bundle that
// carries wire.js carries it too.

/** DFU's TimeScale: classic minutes per real minute, a game minute every five real seconds and a day every two real hours. */
export const DFU_TIME_SCALE = 12;
/** The bounds the server profile's `time.worldScale` and `time.skyScale` keep (profileKeys.ts), so the inverse never divides by zero. */
export const TIME_SCALE_MIN = 1;
export const TIME_SCALE_MAX = 100;
/** Classic minutes per real millisecond at DFU's TimeScale (worldTick.js CLASSIC_MINUTES_PER_SECOND / 1000, pinned equal).
 *  The rate a server plays at when its profile names no `time.worldScale`; the live rate is `onlineMinutesPerMs()`. */
export const ONLINE_MINUTES_PER_MS = DFU_TIME_SCALE / 60 / 1000;

let scale = DFU_TIME_SCALE;

/** Sets the world clock's TimeScale (the server profile's `time.worldScale`). A value outside the bounds, or no number, is
 *  ignored, so a bad profile cannot stop the clock. The relay, the account Worker and each page call it before the clock is read. */
export function setOnlineTimeScale(next: unknown): void {
  if (typeof next === 'number' && Number.isFinite(next) && next >= TIME_SCALE_MIN && next <= TIME_SCALE_MAX) scale = next;
}
/** The world clock's TimeScale now. */
export const onlineTimeScale = (): number => scale;
/** Classic minutes per real millisecond now: the TimeScale over sixty seconds in a minute and a thousand ms in a second. */
export const onlineMinutesPerMs = (): number => scale / 60 / 1000;

/** The instant the sky's own clock (the server profile's `time.skyClock`) takes over from the world clock, relay ms. The
 *  sky is the world clock before it and runs at `time.skyScale` from it, so nothing jumps there. Aligned: at skyScale 24
 *  every sky midnight falls on the hour UTC (skyLaw.js, tools/skyCutover.mjs). */
export const SKY_SWITCH_MS = Date.UTC(2026, 9, 3, 17, 7, 30);
/** The port's sky clock: a sky day every real hour. The rate a profile that names no `time.skyScale` gives it. */
export const DEFAULT_SKY_TIME_SCALE = 24;

let skyOwnClock = false;
let skyScale = DEFAULT_SKY_TIME_SCALE;

/** Sets whether the sky has a clock of its own (`time.skyClock`) and its TimeScale (`time.skyScale`). Anything but true
 *  is off; a scale outside the bounds, or no number, leaves the scale where it was. Called where setOnlineTimeScale is. */
export function setSkyClock(on: unknown, nextScale: unknown): void {
  skyOwnClock = on === true;
  if (typeof nextScale === 'number' && Number.isFinite(nextScale) && nextScale >= TIME_SCALE_MIN && nextScale <= TIME_SCALE_MAX) skyScale = nextScale;
}
/** Whether the sky runs on a clock of its own. */
export const skyClockOn = (): boolean => skyOwnClock;
/** The sky clock's TimeScale; read only while `skyClockOn()`. */
export const skyTimeScale = (): number => skyScale;
