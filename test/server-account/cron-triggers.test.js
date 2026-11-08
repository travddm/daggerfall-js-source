import assert from 'node:assert/strict';
import { test } from 'node:test';

import { standService, T0 } from '../accountDb.mjs';
import worker from '../../server-account/src/index.js';
import { CRON_HOUR, CRON_MINUTE, _resetCronForTests } from '../../server-account/src/cron.js';
import { CRON_DOOR_PATH, CRON_SECRET_HEADER } from '../../server-account/src/cron-triggers.ts';

const SECRET = 'door-secret-for-tests';
const realNow = Date.now;
Date.now = () => T0 * 1000;
test.after(() => {
  Date.now = realNow;
});

const exec = { waitUntil: () => {}, passThroughOnException: () => {} };

/** A fresh service, with every statement it prepares counted. */
async function freshService(extra = {}) {
  _resetCronForTests();
  const s = await standService(extra);
  const env = s.env;
  const base = env.DB;
  let n = 0;
  env.DB = Object.assign(Object.create(base), {
    prepare(sql) {
      n++;
      return base.prepare(sql);
    },
  });
  return { env, statements: () => n };
}

const knock = (env, init) => worker.fetch(new Request(`https://accounts.invalid${CRON_DOOR_PATH}`, init), env, exec);

const post = (cron, secret) => ({
  method: 'POST',
  headers: secret === null ? {} : { [CRON_SECRET_HEADER]: secret },
  body: JSON.stringify({ cron }),
});

const outcome = (jobs) => jobs.map((j) => [j.name, j.ok, j.changed]);

test('the door runs the same jobs as scheduled, for each schedule', async () => {
  for (const cron of [CRON_MINUTE, CRON_HOUR]) {
    const viaTrigger = await freshService({ CRON_SECRET: SECRET });
    const scheduled = await worker.scheduled({ cron, scheduledTime: T0 * 1000 }, viaTrigger.env);

    const viaDoor = await freshService({ CRON_SECRET: SECRET });
    const res = await knock(viaDoor.env, post(cron, SECRET));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.cron, cron);
    assert.ok(body.jobs.length > 0);
    assert.deepEqual(outcome(body.jobs), outcome(scheduled));
    assert.equal(viaDoor.statements(), viaTrigger.statements());
  }
});

test('the door refuses a request without the secret, or with a wrong one, and runs nothing', async () => {
  const s = await freshService({ CRON_SECRET: SECRET });
  for (const secret of [null, '', 'wrong', `${SECRET}x`]) {
    const res = await knock(s.env, post(CRON_MINUTE, secret));
    assert.equal(res.status, 401, `secret ${JSON.stringify(secret)}`);
  }
  assert.equal(s.statements(), 0);
});

test('the door takes POST only, and a body that names a schedule', async () => {
  const s = await freshService({ CRON_SECRET: SECRET });
  const get = await knock(s.env, { method: 'GET', headers: { [CRON_SECRET_HEADER]: SECRET } });
  assert.equal(get.status, 405);
  for (const body of ['', 'not json', '[]', '{}', '{"cron":7}', JSON.stringify({ cron: 'x'.repeat(300) })]) {
    const res = await knock(s.env, { method: 'POST', headers: { [CRON_SECRET_HEADER]: SECRET }, body });
    assert.equal(res.status, 400, `body ${body.slice(0, 20)}`);
  }
  assert.equal(s.statements(), 0);
});

test('the door is off while CRON_SECRET is unset: the path answers as any unknown path does', async () => {
  const s = await freshService();
  const door = await knock(s.env, post(CRON_MINUTE, SECRET));
  const unknown = await worker.fetch(
    new Request('https://accounts.invalid/__nothing-here', post(CRON_MINUTE, SECRET)),
    s.env,
    exec,
  );
  assert.equal(door.status, unknown.status);
  assert.notEqual(door.status, 200);
  assert.equal(await door.text(), await unknown.text());
});
