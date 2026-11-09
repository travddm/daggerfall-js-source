// The load harness's restart of the services (tools/loadHarness.mjs standServicesRetrying, stopAndFree): the first start
// is stopped and its ports are free before the second begins. CI's online probe failed on 8873 held by the first start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standServicesRetrying, stopAndFree } from '../../tools/loadHarness.mjs';

/** A fake machine: ports a fake first start holds until a stop and a delay, a log of what happened in order. */
function machine({ releaseAfterChecks = 0, neverRelease = false } = {}) {
  const log = [];
  let holding = true;
  let checks = 0;
  const stop = () => {
    log.push('stop');
  };
  const held = async (port) => {
    log.push(`held:${port}`);
    if (holding && !neverRelease && (checks += 1) > releaseAfterChecks * 2) holding = false;
    return holding;
  };
  const killHolder = (port) => {
    log.push(`kill:${port}`);
    holding = false;
  };
  return { log, stop, held, killHolder };
}

test('the first start is stopped and its ports freed before the second start begins', async () => {
  const m = machine({ releaseAfterChecks: 3 });
  const free = (ports) =>
    stopAndFree(ports, { stop: m.stop, held: m.held, wait: async () => {}, killHolder: m.killHolder });
  let starts = 0;
  const stand = async () => {
    starts += 1;
    m.log.push(`start:${starts}`);
    if (starts === 1) throw new Error('the account service never answered');
    return { ok: true };
  };
  const svc = await standServicesRetrying({ port: 8872 }, '/state', { stand, free, log: () => {} });
  assert.deepEqual(svc, { ok: true });
  const at = (what) => m.log.indexOf(what);
  assert.ok(at('stop') > at('start:1'), 'stopped after the first start failed');
  const lastHeld = m.log.lastIndexOf('held:8873');
  assert.ok(
    lastHeld > at('stop') && lastHeld < at('start:2'),
    'the relay port was polled until free, before the second start',
  );
  assert.ok(m.log.includes('held:8872'));
  assert.equal(m.log.includes('kill:8873'), false, 'a port that frees by itself is not killed');
});

test('a holder that outlives the kill is killed by its port, and the wait is bounded', async () => {
  const m = machine({ neverRelease: true });
  let waits = 0;
  const killed = [];
  const free = await stopAndFree([8872, 8873], {
    stop: m.stop,
    held: m.held,
    wait: async () => {
      waits += 1;
    },
    killHolder: (port) => killed.push(port),
    timeoutMs: 1000,
    stepMs: 250,
  });
  assert.equal(free, false, 'a port that stays held reports false');
  assert.equal(waits, 4, 'the wait ended at its bound');
  assert.deepEqual(killed, [8872, 8873], 'each held port had its listener killed, once');

  const m2 = machine({ neverRelease: true });
  const free2 = await stopAndFree([8872], {
    stop: m2.stop,
    held: m2.held,
    wait: async () => {},
    killHolder: m2.killHolder,
    timeoutMs: 1000,
    stepMs: 250,
  });
  assert.equal(free2, true, 'the kill by port frees it');
});

test('ports that stay held fail the retry with their own error, and the second start never runs', async () => {
  let starts = 0;
  const stand = async () => {
    starts += 1;
    throw new Error('boom');
  };
  await assert.rejects(
    standServicesRetrying({ port: 8872 }, '/state', { stand, free: async () => false, log: () => {} }),
    /stayed held: boom/,
  );
  assert.equal(starts, 1);
});

test('a first start that works is not stopped', async () => {
  let freed = false;
  const svc = await standServicesRetrying({ port: 8872 }, '/s', {
    stand: async () => 'up',
    free: async () => {
      freed = true;
      return true;
    },
    log: () => {},
  });
  assert.equal(svc, 'up');
  assert.equal(freed, false);
});
