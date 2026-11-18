// The account service's database seam (server-account/src/database-seam.ts) on the D1 fake: a Kysely query runs,
// an atomic list mixes Kysely queries with D1 statements, and a failing list writes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseSync } from 'node:sqlite';
import { d1Db, sqlOf, type D1Like } from '../../server-account/src/database-seam.ts';

/** The D1 fake over node:sqlite, with every migration applied. */
type FakeD1 = D1Like & { _raw: DatabaseSync };

// Loaded by a computed path: a static import would pull the whole account service into the TypeScript check.
const accountDb = new URL('../accountDb.mjs', import.meta.url).href;
const { d1 } = (await import(accountDb)) as { d1: () => FakeD1 };

const seedPlayer = (db: FakeD1, id: string): void => {
  db._raw
    .prepare('INSERT INTO players (id, guest_name, created_at, last_seen) VALUES (?, ?, 1, 1)')
    .run(id, `guest-${id}`);
};

test('a Kysely query runs on D1 and answers rows', async () => {
  const db = d1();
  seedPlayer(db, 'p1');
  db._raw
    .prepare("INSERT INTO broker_sales (account, rid, kind, item, at) VALUES ('p1', 'r1', 'insignia', 'wolf', 5)")
    .run();
  const seam = d1Db(db);
  const query = seam.kysely.selectFrom('broker_sales').select(['kind', 'item']).where('account', '=', 'p1');
  const result = await seam.run(query);
  assert.deepEqual(
    result.rows.map((row) => ({ ...row })),
    [{ kind: 'insignia', item: 'wolf' }],
  );
});

test('an atomic list mixes Kysely queries with D1 statements and answers each in order', async () => {
  const db = d1();
  seedPlayer(db, 'p1');
  const seam = d1Db(db);
  const fence = seam.kysely
    .insertInto('broker_sales')
    .values({ account: 'p1', rid: 'r1', kind: 'fence', item: null, at: 7 });
  const raw = db
    .prepare('UPDATE broker_sales SET settled = settled + 1 WHERE account = ?1 RETURNING settled')
    .bind('p1');
  const [written, counted] = await seam.atomic([fence, raw]);
  assert.equal(written.changes, 1);
  assert.deepEqual(
    counted.rows.map((row) => ({ ...row })),
    [{ settled: 1 }],
  );
});

test('a list that fails part way writes nothing', async () => {
  const db = d1();
  seedPlayer(db, 'p1');
  const seam = d1Db(db);
  const first = seam.kysely
    .insertInto('broker_sales')
    .values({ account: 'p1', rid: 'r1', kind: 'fence', item: null, at: 7 });
  const again = seam.kysely
    .insertInto('broker_sales')
    .values({ account: 'p1', rid: 'r1', kind: 'fence', item: null, at: 8 });
  await assert.rejects(seam.atomic([first, again]));
  assert.equal((await seam.run(seam.kysely.selectFrom('broker_sales').selectAll())).rows.length, 0);
});

test('sqlOf keeps one seam a binding and passes a seam through', () => {
  const db = d1();
  const seam = sqlOf(db);
  assert.equal(sqlOf(db), seam);
  assert.equal(sqlOf(seam), seam);
});
