// ROADS-CAP (2026-10-31, perf; bible/03-World/Arena-Provinces.md ROADS-CAP): the roads past the Bay are built on two
// workers at most. Each roads worker cost the renderer about 0.8 GB while it built; four took the boot at Daggerfall to
// 7.9-8.0 GB, near where the renderer dies, and two held it at 6.2-6.3 GB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTamrielRoadsClient, roadsWorkerCount, ROADS_WORKER_MAX } from '../../src/world/tamrielRoadsClient.js';

/** Workers that record what they are told and never answer, so every build stays in hand. */
function silentWorkers() {
  const made = [];
  const make = () => {
    const worker = { posted: [], onmessage: null, onerror: null, terminate() {}, postMessage(message) { worker.posted.push(message); } };
    made.push(worker);
    return worker;
  };
  return { make, made };
}
const region = (i) => ({ i, j: 0, core: { x0: i * 100, x1: i * 100 + 100, y0: 0, y1: 100 } });

test('ROADS-CAP the count: the cores less two, two at most and one at least - a 2-core machine builds on one (mutants: the cap at four; the cap unread)', () => {
  assert.equal(ROADS_WORKER_MAX, 2);
  assert.equal(roadsWorkerCount(32), 2);
  assert.equal(roadsWorkerCount(16), 2);
  assert.equal(roadsWorkerCount(4), 2);
  assert.equal(roadsWorkerCount(3), 1);
  assert.equal(roadsWorkerCount(2), 1, 'a 2-core machine: one worker');
  assert.equal(roadsWorkerCount(1), 1);
});

test('ROADS-CAP the pool: a many-core machine\'s build stands two workers, each one region in hand, the rest queued for them (mutants: the cap at four; the cap unread)', async () => {
  const workers = silentWorkers();
  const client = createTamrielRoadsClient({ makeWorker: workers.make, workers: roadsWorkerCount(16), store: null, log: { warn() {} } });
  await client.start({ inputs: {}, print: 'p', regions: [0, 1, 2, 3, 4, 5].map(region), onRegion() {} });
  assert.equal(workers.made.length, 2);
  assert.equal(client.workers(), 2);
  assert.deepEqual(workers.made.map((w) => w.posted.filter((m) => m.t === 'build').length), [1, 1]);
  assert.equal(client.pending(), 6, 'two building, four queued');
  client.dispose();
});
