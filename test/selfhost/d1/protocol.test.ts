import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleFetch, handleRpcQuery, SESSION_HEADER } from '../../../selfhost/d1/protocol.ts';
import { sqliteStore } from '../sqlite-store.ts';

type Answer = { success: boolean; error?: string; results?: unknown; meta?: Record<string, unknown> };

const ask = async (
  store: ReturnType<typeof sqliteStore>,
  body: unknown,
  { path = '/query', format = 'ARRAY_OF_OBJECTS', headers = {} as Record<string, string> } = {},
): Promise<{ res: Response; answer: Answer | Answer[] }> => {
  const res = await handleFetch(
    store,
    new Request(`http://d1${path}?resultsFormat=${format}`, { method: 'POST', body: JSON.stringify(body), headers }),
  );
  return { res, answer: (await res.json()) as Answer | Answer[] };
};

function seeded(): ReturnType<typeof sqliteStore> {
  const store = sqliteStore();
  store.sql.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE, data BLOB)');
  return store;
}

test('one statement answers its rows in the format asked, with D1 meta', async () => {
  const store = seeded();
  const { answer: put } = await ask(store, { sql: 'INSERT INTO t (name) VALUES (?1)', params: ['a'] });
  assert.equal((put as Answer).success, true);
  assert.equal((put as Answer).meta?.changes, 1);
  assert.equal((put as Answer).meta?.last_row_id, 1);
  assert.equal((put as Answer).meta?.changed_db, true);

  const { answer: objects } = await ask(store, { sql: 'SELECT id, name FROM t' });
  assert.deepEqual((objects as Answer).results, [{ id: 1, name: 'a' }]);
  const { answer: raw } = await ask(store, { sql: 'SELECT id, name FROM t' }, { format: 'ROWS_AND_COLUMNS' });
  assert.deepEqual((raw as Answer).results, { columns: ['id', 'name'], rows: [[1, 'a']] });
  const { answer: none } = await ask(store, { sql: 'SELECT name FROM t' }, { path: '/execute', format: 'NONE' });
  assert.deepEqual((none as Answer).results, [{ name: 'a' }]);
  assert.equal((none as Answer).meta?.changes, 0);
});

test('a batch is one transaction: a failing statement rolls back the ones before it', async () => {
  const store = seeded();
  const { answer: ok } = await ask(store, [
    { sql: 'INSERT INTO t (name) VALUES (?)', params: ['a'] },
    { sql: 'INSERT INTO t (name) VALUES (?)', params: ['b'] },
  ]);
  assert.ok(Array.isArray(ok));
  assert.equal(ok.length, 2);

  const { res, answer: failed } = await ask(store, [
    { sql: 'INSERT INTO t (name) VALUES (?)', params: ['c'] },
    { sql: 'INSERT INTO t (name) VALUES (?)', params: ['a'] },
  ]);
  assert.equal(res.status, 200);
  assert.equal((failed as Answer).success, false);
  assert.match(String((failed as Answer).error), /UNIQUE/);
  const { answer: names } = await ask(store, { sql: 'SELECT name FROM t ORDER BY name' });
  assert.deepEqual((names as Answer).results, [{ name: 'a' }, { name: 'b' }]);
});

test('a blob crosses the wire as an array of byte values, both ways', async () => {
  const store = seeded();
  await ask(store, { sql: 'INSERT INTO t (name, data) VALUES (?, ?)', params: ['b', [0, 1, 254, 255]] });
  const { answer } = await ask(store, { sql: 'SELECT data FROM t' });
  assert.deepEqual((answer as Answer).results, [{ data: [0, 1, 254, 255] }]);
});

test('a session request gets the newest bookmark back; a plain one gets none', async () => {
  const store = seeded();
  const plain = await ask(store, { sql: 'SELECT 1 AS one' });
  assert.equal(plain.res.headers.get(SESSION_HEADER), null);
  const session = await ask(
    store,
    { sql: 'SELECT 1 AS one' },
    { headers: { [SESSION_HEADER]: 'first-unconstrained' } },
  );
  assert.match(String(session.res.headers.get(SESSION_HEADER)), /^[0-9a-f]{8}-/);
});

test('a comment-only statement is dropped, and a body with none left is an error', async () => {
  const store = seeded();
  const { answer } = await ask(store, [{ sql: '-- nothing' }, { sql: 'SELECT 2 AS two' }]);
  assert.deepEqual(
    (answer as Answer[]).map((a) => a.results),
    [[{ two: 2 }]],
  );
  const { answer: empty } = await ask(store, { sql: '-- only a comment' });
  assert.equal((empty as Answer).success, false);
});

test('anything but POST to /query or /execute is 404, and a malformed body is a failure', async () => {
  const store = seeded();
  assert.equal((await handleFetch(store, new Request('http://d1/query'))).status, 404);
  assert.equal((await handleFetch(store, new Request('http://d1/other', { method: 'POST', body: '{}' }))).status, 404);
  const bad = await handleFetch(store, new Request('http://d1/query', { method: 'POST', body: '{"params":[]}' }));
  assert.equal(((await bad.json()) as Answer).success, false);
});

test('the RPC query answers raw rows per statement and throws on an SQL error, rolling back', async () => {
  const store = seeded();
  const out = await handleRpcQuery(store, {
    queries: [{ sql: "INSERT INTO t (name) VALUES ('r')" }, { sql: 'SELECT name FROM t' }],
    bookmark: 'first-primary',
  });
  assert.deepEqual(out.results[1]?.data, { kind: 'raw', columns: ['name'], rows: [['r']] });
  assert.equal(out.results[0]?.meta.changes, 1);
  assert.ok(out.bookmark);
  await assert.rejects(
    handleRpcQuery(store, { queries: [{ sql: "INSERT INTO t (name) VALUES ('s')" }, { sql: 'SELECT nope FROM t' }] }),
  );
  const { answer } = await ask(store, { sql: 'SELECT name FROM t ORDER BY name' });
  assert.deepEqual((answer as Answer).results, [{ name: 'r' }]);
});
