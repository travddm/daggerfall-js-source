// The wait for the land past the Bay's trace (src/world/tamriel/tamrielTraceWait.js): a trace that settles within the
// budget answers true, whether it landed or failed; one that never settles answers false once every step is spent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForTamrielTrace, TRACE_WAIT_STEPS, TRACE_WAIT_STEP_MS } from '../../src/world/tamriel/tamrielTraceWait.js';

const SHORT = Object.freeze({ steps: 20, stepMs: 5 });
const later = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

test('the trace wait: its default budget is a minute of quarter-second steps, as the boot\'s wait for its world', () => {
  assert.equal(TRACE_WAIT_STEPS, 240);
  assert.equal(TRACE_WAIT_STEP_MS, 250);
});

test('the trace wait: a trace that has already settled is seen at once, before any step', async () => {
  const started = performance.now();
  assert.equal(await waitForTamrielTrace(Promise.resolve(), { steps: 1, stepMs: 1000 }), true);
  assert.ok(performance.now() - started < 500, 'no step was slept');
});

test('the trace wait: a trace that lands after several steps is waited for (mutant: the steps\' cap read as one step)', async () => {
  // 40 ms is several 5 ms steps: a wait that gave up after one step, or raced one short timer, would answer false
  assert.equal(await waitForTamrielTrace(later(40), SHORT), true);
});

test('the trace wait: a trace that failed has settled too - nothing more will come, so the boot moves on', async () => {
  const failed = Promise.reject(new Error('TMAP00I0.IMG unavailable'));
  assert.equal(await waitForTamrielTrace(failed, SHORT), true);
});

test('the trace wait: no trace to wait for (the door shut, or none asked) answers at once', async () => {
  assert.equal(await waitForTamrielTrace(undefined, SHORT), true);
});

test('the trace wait: a trace that never settles answers false once every step is spent, and not before (mutant: the cap dropped)', async () => {
  const never = new Promise(() => {});
  const started = performance.now();
  assert.equal(await waitForTamrielTrace(never, SHORT), false);
  // timers may fire late but never early (a millisecond's grace for their rounding)
  assert.ok(performance.now() - started >= SHORT.steps * SHORT.stepMs - SHORT.steps, 'every step was slept');
});
