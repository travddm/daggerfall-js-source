// The load harness's self-host mode (tools/lib/selfhost-services.mjs) and the figures it reports beside a wrangler
// run: the knob, the workerd process's environment and build, the cron door's firing, the ping round trip and the
// services' own figures. Standing either runtime needs a toolchain and minutes, so the run itself is not in the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseArgs,
  localWebSocket,
  relayTally,
  servicesFigures,
  httpLatency,
  FIRE_MINUTE,
  FIRE_HOUR,
} from '../../tools/loadHarness.mjs';
import {
  workerdEnv,
  generateArgs,
  kitWorkerd,
  UNSET_FOR_PARITY,
  CRON_DOOR_PATH,
  CRON_SECRET_HEADER,
} from '../../tools/lib/selfhost-services.mjs';
import { timedRequest } from '../../tools/lib/load-services.mjs';
import {
  CRON_DOOR_PATH as DOOR_PATH,
  CRON_SECRET_HEADER as SECRET_HEADER,
} from '../../server-account/src/cron-triggers.ts';

test('--selfhost may be given bare or with a value, and nothing else', () => {
  assert.equal(parseArgs(['--selfhost']).selfhost, 1);
  assert.equal(parseArgs(['--selfhost', '--bots', '3']).selfhost, 1);
  assert.equal(parseArgs(['--bots', '3', '--selfhost']).bots, 3);
  assert.equal(parseArgs(['--selfhost', '0']).selfhost, 0);
  assert.equal(parseArgs([]).selfhost, 0);
  assert.throws(() => parseArgs(['--selfhost', '2']), /--selfhost is 0 or 1/);
  assert.throws(() => parseArgs(['--bots']), /--bots needs a value/);
});

test('the cron door the harness fires is the one the account service opens', () => {
  assert.equal(CRON_DOOR_PATH, DOOR_PATH);
  assert.equal(CRON_SECRET_HEADER, SECRET_HEADER);
});

test("workerd runs with the run's keys and none of the kit's other secrets, so both runtimes serve one configuration", () => {
  const base = { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-live', GATE_SIGNING_KEY: 'g', S3_BUCKET: 'b' };
  const env = workerdEnv(base, { privateKey: 'priv', publicKey: 'pub', cronSecret: 'cron' });
  assert.equal(env.PATH, '/bin');
  for (const name of UNSET_FOR_PARITY) assert.equal(name in env, false, name);
  assert.deepEqual(
    [env.IDENTITY_PRIVATE_KEY, env.IDENTITY_PUBLIC_KEY, env.CRON_SECRET, env.ACCOUNT_SERVICE_URL],
    ['priv', 'pub', 'cron', ''],
  );
  assert.equal(base.ANTHROPIC_API_KEY, 'sk-live');
});

test("the kit is built for the run's own ports and directories, with the harness's account entry", () => {
  const args = generateArgs({ out: 'O', data: 'D', accountPort: 8870, relayPort: 8871 });
  assert.match(args[0], /selfhost[\\/]generate\.ts$/);
  const flag = (name) => args[args.indexOf(name) + 1];
  assert.equal(flag('--out'), 'O');
  assert.equal(flag('--data'), 'D');
  assert.equal(flag('--accounts-address'), '127.0.0.1:8870');
  assert.equal(flag('--relay-address'), '127.0.0.1:8871');
  assert.match(flag('--accounts-entry'), /tools[\\/]loadAccountEntry\.mjs$/);
});

test('a kit that is not installed is named with its install step', () => {
  const dir = mkdtempSync(join(tmpdir(), 'no-kit-'));
  try {
    assert.throws(() => kitWorkerd(dir), /npm ci --prefix selfhost/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a firing is timed and counts as fired only on a 200, so a refused door is never a fast clock', async () => {
  let seen = null;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => {
      body += d;
    });
    req.on('end', () => {
      seen = { method: req.method, url: req.url, secret: req.headers['x-cron-secret'], body };
      res.statusCode = req.headers['x-cron-secret'] === 's' ? 200 : 401;
      res.end('{}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  try {
    const fire = (secret) =>
      timedRequest(
        {
          port,
          path: '/__cron',
          method: 'POST',
          headers: { 'x-cron-secret': secret },
          body: JSON.stringify({ cron: FIRE_MINUTE }),
        },
        FIRE_MINUTE,
      );
    const ok = await fire('s');
    assert.equal(ok.ok, true);
    assert.equal(ok.cron, FIRE_MINUTE);
    assert.ok(ok.ms >= 0);
    assert.deepEqual(seen, {
      method: 'POST',
      url: '/__cron',
      secret: 's',
      body: JSON.stringify({ cron: FIRE_MINUTE }),
    });
    const refused = await fire('wrong');
    assert.equal(refused.ok, false);
    assert.equal(refused.status, 401);
  } finally {
    server.close();
  }
  const offline = await timedRequest({ port, path: '/', method: 'GET' }, FIRE_HOUR);
  assert.equal(offline.ok, false);
});

test('a pong is timed against the oldest unanswered ping on its socket', () => {
  class FakeSocket extends EventTarget {
    send() {}
  }
  let now = 100;
  const tally = relayTally();
  const LoadSocket = localWebSocket({ port: 1, tally, Base: FakeSocket, fineNow: () => now });
  const ws = new LoadSocket('ws://127.0.0.1:1/room/world:1,1');
  const hear = (data) => ws.dispatchEvent(Object.assign(new Event('message'), { data }));
  ws.send('{"t":"ping"}');
  now = 101.5;
  ws.send('{"t":"ping"}');
  now = 102;
  hear('{"t":"pong"}');
  now = 104;
  hear('{"t":"pong"}');
  hear('{"t":"pong"}');
  assert.deepEqual(tally.pingMs, [2, 2.5]);
  assert.equal(tally.inByType.pong, 3);
});

test("the services' figures: boot, the minute's clock from the fired ones alone, memory and CPU as given", () => {
  const svc = { runtime: 'selfhost', workerd: '1.2', bootMs: 600, generateMs: 300, restartMs: 650 };
  const firings = [
    { cron: FIRE_HOUR, ok: true, status: 200, ms: 30 },
    { cron: FIRE_MINUTE, ok: true, status: 200, ms: 10 },
    { cron: FIRE_MINUTE, ok: true, status: 200, ms: 20 },
    { cron: FIRE_MINUTE, ok: true, status: 200, ms: 14 },
    { cron: FIRE_MINUTE, ok: false, status: 401, ms: 1 },
  ];
  const f = servicesFigures({ svc, firings, memory: { phases: {} }, cpu: 0.1 });
  assert.deepEqual(f.cron, { fired: 5, failed: 1, minuteP50: 14, minuteMax: 20, hourMs: 30 });
  assert.deepEqual(
    [f.runtime, f.workerd, f.bootMs, f.generateMs, f.stormRestartMs, f.cpuShare],
    ['selfhost', '1.2', 600, 300, 650, 0.1],
  );
});

test("the HTTP latency pools every /v1 route's requests and leaves the clock's points out", () => {
  const byRoute = new Map([
    ['/v1/heartbeat', { ms: [5, 7, 9] }],
    ['/v1/realm/:id/data', { ms: [50] }],
    ['cron:seats', { ms: [999] }],
  ]);
  assert.deepEqual(httpLatency({ byRoute }), { p50: 7, p95: 50, n: 4 });
});
