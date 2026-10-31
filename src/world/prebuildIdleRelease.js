// @ts-check
// CITY-IDLE (bible/03-World/Arena-Provinces.md CITY-IDLE): the roads' R4 for the Imperial City's pool - its workers,
// about 0.4-0.5 GB each, let go once idle. A worker says `idle` with the count of messages it heard, and counts as idle
// only once that is every message it was told, so an idle sent before its latest want does not let it go.

/** How long every worker stands idle before they go. Departure from R4, which lets the roads' workers go at once: a
 *  roads build has one end, but the city's wants come and go as the player moves, and a short pause between them should
 *  not cost each worker its start again (its modules, fabric caches and landmarks). */
export const PREBUILD_IDLE_MS = 10000;

/** Run a function after some milliseconds; the answer cancels it. @param {() => void} fn @param {number} ms */
export function laterTimeout(fn, ms) {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
}

/**
 * @param {{ workers: () => readonly any[], waiting: () => boolean, release: () => void, idleMs?: number,
 *   later?: (fn: () => void, ms: number) => () => void }} o
 *   workers: the workers standing now. waiting: whether a build waits on a piece asked of them (they are not let go
 *   then). release: let every worker go. idleMs and later: the delay and the timer (the pins' hand timer).
 */
export function createIdleRelease({ workers, waiting, release, idleMs = PREBUILD_IDLE_MS, later = laterTimeout }) {
  /** Per worker, the messages posted to it. @type {Map<any, number>} */
  const told = new Map();
  const idle = new Set();
  /** @type {(() => void) | null} */
  let cancelPending = null;

  const cancel = () => {
    cancelPending?.();
    cancelPending = null;
  };
  const allIdle = () => {
    const standing = workers();
    return standing.length > 0 && standing.every((worker) => idle.has(worker));
  };

  return {
    /** A worker made: it has heard nothing yet. */
    stood(/** @type {any} */ worker) {
      told.set(worker, 0);
    },
    /** A message posted to a worker: it is busy again, and a release in hand is called off. */
    posted(/** @type {any} */ worker) {
      told.set(worker, (told.get(worker) ?? 0) + 1);
      idle.delete(worker);
      cancel();
    },
    /** A worker said `idle` after `heard` messages. With every worker idle and nothing waited on, they go after idleMs. */
    saidIdle(/** @type {any} */ worker, /** @type {number} */ heard) {
      if (heard !== told.get(worker)) return;
      idle.add(worker);
      if (cancelPending || waiting() || !allIdle()) return;
      cancelPending = later(() => {
        cancelPending = null;
        if (!waiting() && allIdle()) release();
      }, idleMs);
    },
    /** The workers are gone: forget them, and any release in hand. */
    forget() {
      cancel();
      told.clear();
      idle.clear();
    },
  };
}
