// The wait for the land past the Bay to have its trace, shared by the two boots that need its places: a start past the
// Bay (scenes/bootStartHost.js reach) and the load of a save made past the Bay (world.js, before worldQuickLoad).
//
// The trace (ui/tamrielTrace.js preloadTamrielTrace: its fetches, its IndexedDB reads and the Bay's fit) runs on the main
// thread beside the boot, so it lands later as the device is slower or busier. The cap is therefore counted in steps of
// a short sleep, as the boot's wait for its world to stand is (scenes/startsHost.js START_READY_TRIES of START_READY_MS),
// not as one wall-clock timer: each step stretches with a busy thread, so a slow device is given more time, not less.
// A wall-clock 8 s once raced it: at a 6x CPU throttle the trace landed 18.8 s after the world stood, and a start past
// the Bay fell back to the Bay although its place stood a few seconds later (2026-10-31).
//
// The trace's promise settles when the trace lands, when it fails and when it was never asked (world.js arenaTraced),
// so the cap only bounds a fetch that never answers: fetchBytes has no timeout of its own.

/** The sleep between two looks at the trace, in milliseconds. */
export const TRACE_WAIT_STEP_MS = 250;

/** How many sleeps the wait takes at most: 240 of 250 ms, a minute on an idle thread and more on a busy one. */
export const TRACE_WAIT_STEPS = 240;

/**
 * @typedef {object} TraceWaitBudget
 * @property {number} [steps] how many sleeps the wait takes at most
 * @property {number} [stepMs] each sleep's length, in milliseconds
 */

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Waits until the trace has settled, or until the budget's steps are spent.
 * @param {PromiseLike<unknown>|null|undefined} traced settles when the trace lands, fails or was never asked
 * @param {TraceWaitBudget} [budget]
 * @returns {Promise<boolean>} true when the trace settled within the budget (landed or failed: either way, nothing more
 *   will come), false when the steps ran out first
 */
export async function waitForTamrielTrace(traced, { steps = TRACE_WAIT_STEPS, stepMs = TRACE_WAIT_STEP_MS } = {}) {
  let settled = false;
  const markSettled = () => { settled = true; };
  Promise.resolve(traced).then(markSettled, markSettled);
  // One microtask turn lets a trace that has already settled be seen before the first sleep.
  await Promise.resolve();
  for (let step = 0; !settled && step < steps; step++) await sleep(stepMs);
  return settled;
}
