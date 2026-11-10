// The online world clock's TimeScale: game minutes per real minute. The relay, the account Worker and every client keep
// one value here and read it through the wire's clock (wire.js sharedClassicMinutes). A leaf with no imports, so each
// bundle that carries wire.js carries it too.

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
  if (typeof next === 'number' && Number.isFinite(next) && next >= TIME_SCALE_MIN && next <= TIME_SCALE_MAX)
    scale = next;
}
/** The world clock's TimeScale now. */
export const onlineTimeScale = (): number => scale;
/** Classic minutes per real millisecond now: the TimeScale over sixty seconds in a minute and a thousand ms in a second. */
export const onlineMinutesPerMs = (): number => scale / 60 / 1000;
