// CITY-IDLE (2026-10-31, perf; bible/03-World/Arena-Provinces.md CITY-IDLE): the Imperial City's prebuild workers let go
// once idle (the roads' R4, world/prebuildIdleRelease.js), and made again for the next want or need. Each worker cost
// the renderer about 0.4-0.5 GB, and once the city was built they stood with nothing to make.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImperialPrebuild } from '../../src/world/imperialPrebuildClient.js';
import { PREBUILD_IDLE_MS } from '../../src/world/prebuildIdleRelease.js';
import { createPrebuildWorkerState } from '../../src/world/imperialPrebuildWorker.js';
import { sliceWork } from '../../src/world/imperialPrebuild.js';

const quiet = { warn() {} };

/** Workers that record what they are told and answer only when the test says. */
function scriptedWorkers() {
  const made = [];
  const make = () => {
    const worker = {
      posted: [],
      dead: false,
      onmessage: null,
      onerror: null,
      terminate() { worker.dead = true; },
      postMessage(message) { worker.posted.push(message); },
      reply(data) { worker.onmessage?.({ data }); },
    };
    made.push(worker);
    return worker;
  };
  return { make, made };
}

/** A timer the test runs by hand. */
function handTimer() {
  const pending = [];
  const later = (fn, ms) => {
    const entry = { fn, ms, cancelled: false };
    pending.push(entry);
    return () => { entry.cancelled = true; };
  };
  const live = () => pending.filter((entry) => !entry.cancelled);
  const runAll = () => {
    for (const entry of pending.splice(0)) {
      if (!entry.cancelled) entry.fn();
    }
  };
  return { later, pending, live, runAll };
}

test('CITY-IDLE the city lets idle workers go after PREBUILD_IDLE_MS - only once each has heard all it was told and no need is out; alive throughout, so the stream still waits for them (mutants: never let go; an old idle counted; a need out ignored; alive false when let go)', () => {
  const timer = handTimer();
  const city = scriptedWorkers();
  const client = createImperialPrebuild({ makeWorker: city.make, workers: 2, log: quiet, later: timer.later });
  client.want([{ s: 0, near: true }, { s: 1, near: false }]);
  const [first, second] = city.made;
  first.reply({ t: 'idle', heard: 0 });
  second.reply({ t: 'idle', heard: 1 });
  assert.equal(timer.pending.length, 0, 'the first worker\'s idle came before it heard its want');
  first.reply({ t: 'idle', heard: 1 });
  assert.equal(timer.pending.length, 1);
  assert.equal(timer.pending[0].ms, PREBUILD_IDLE_MS);
  client.need(['b:SOMEBLOCK']);
  timer.runAll();
  assert.equal(client.workers, 2, 'a need posted calls the release off');
  const owner = city.made.find((w) => w.posted.some((m) => m.t === 'need'));
  owner.reply({ t: 'idle', heard: owner.posted.length });
  assert.equal(timer.live().length, 0, 'a need still out: not idle');
  owner.reply({ t: 'block', name: 'SOMEBLOCK', json: { b: 1 } });
  owner.reply({ t: 'idle', heard: owner.posted.length });
  timer.runAll();
  assert.equal(client.workers, 0);
  assert.ok(city.made.every((w) => w.dead));
  assert.equal(client.alive, true, 'the stream still waits for the city\'s workers');
  assert.deepEqual(client.takeBlock('SOMEBLOCK'), { b: 1 }, 'what was held is kept');
  client.dispose();
  assert.equal(client.alive, false);
});

test('CITY-IDLE a city worker made again after an idle release is told what is made and the last want, and stands for a need; the page\'s own pieces count as made (mutants: nothing told; the want not said again; a need not standing them; the page\'s pieces not done)', () => {
  const timer = handTimer();
  const city = scriptedWorkers();
  const client = createImperialPrebuild({ makeWorker: city.make, workers: 1, log: quiet, later: timer.later });
  const slices = [{ s: 3, near: true }];
  client.want(slices);
  const [first] = city.made;
  first.reply({ t: 'block', name: 'A', json: {} });
  first.reply({ t: 'model', id: 7, model: null });
  client.made('b:B');
  first.reply({ t: 'idle', heard: first.posted.length });
  timer.runAll();
  assert.equal(client.workers, 0);
  client.want(slices);
  assert.equal(city.made.length, 1, 'the same want: nothing new to make');
  client.need(['b:C']);
  assert.equal(city.made.length, 2);
  const [done, want, need] = city.made[1].posted;
  assert.equal(done.t, 'done');
  assert.deepEqual([...done.keys].sort(), ['b:A', 'b:B', 'm:7']);
  assert.deepEqual(want, { t: 'want', slices });
  assert.deepEqual(need, { t: 'need', keys: ['b:C'] });
  client.dispose();
});

test('CITY-IDLE a new want after an idle release stands the workers again, told that want (mutants: a want not standing them)', () => {
  const timer = handTimer();
  const city = scriptedWorkers();
  const client = createImperialPrebuild({ makeWorker: city.make, workers: 1, log: quiet, later: timer.later });
  client.want([{ s: 3, near: true }]);
  city.made[0].reply({ t: 'idle', heard: 1 });
  timer.runAll();
  assert.equal(client.workers, 0);
  client.want([{ s: 4, near: true }]);
  assert.equal(client.workers, 1);
  assert.deepEqual(city.made[1].posted, [{ t: 'want', slices: [{ s: 4, near: true }] }]);
  client.dispose();
});

test('CITY-IDLE the city worker: a piece told as done is not made for a want, and is made again for a need (mutants: done unheard)', () => {
  const centre = 312;   // the middle slice of the 25 x 25 city; a corner slice has no work
  const work = sliceWork(centre, false);
  assert.ok(work.length > 0);
  const keyOf = (w) => (w.kind === 'block' ? `b:${w.name}` : `m:${w.id}`);
  const keys = work.map(keyOf);
  const state = createPrebuildWorkerState(() => {});
  state.on({ t: 'want', slices: [{ s: centre, near: false }] });
  assert.equal(state.owed, work.length);
  state.on({ t: 'done', keys });
  state.on({ t: 'want', slices: [{ s: centre, near: false }] });
  assert.equal(state.owed, 0, 'every piece already made');
  state.on({ t: 'need', keys: [keys[0]] });
  assert.equal(state.owed, 1);
});
