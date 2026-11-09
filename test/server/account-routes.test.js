// The account Worker's routes, driven through the real Worker on the node:sqlite database (test/accountDb.mjs).
// The POI store was removed (decision 118 A4): its paths under /v1/poi/ are unknown routes now, with or without a
// session, and no table of it is left after the migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService } from '../accountDb.mjs';

const SHA = 'a'.repeat(64);
const POI_PATHS = [
  '/v1/poi/live',
  '/v1/poi/me',
  '/v1/poi/list',
  '/v1/poi/queue',
  `/v1/poi/asset/${SHA}`,
  '/v1/poi/draft',
];

test('a former POI store path is an unknown route, read without a session or with one', async () => {
  const s = await standService();
  const who = await s.registered('Builder');
  for (const path of POI_PATHS) {
    for (const bearer of [null, who.secret]) {
      /** @type {Record<string, string>} */
      const headers = bearer ? { authorization: `Bearer ${bearer}` } : {};
      const res = await s.fetch(`https://accounts.invalid${path}`, { method: 'GET', headers });
      assert.equal(res.status, 404, `GET ${path}${bearer ? ' with a session' : ''}`);
      assert.deepEqual(await res.json(), { error: 'not-found' }, `GET ${path}${bearer ? ' with a session' : ''}`);
    }
    const posted = await s.call(path, {}, who.secret);
    assert.deepEqual(posted, { status: 404, body: { error: 'not-found' } }, `POST ${path}`);
  }
});

test('the migrated schema holds no POI store table', async () => {
  const s = await standService();
  const rows = s.env.DB._raw.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'poi\\_%' ESCAPE '\\'").all();
  assert.deepEqual(rows, []);
});
