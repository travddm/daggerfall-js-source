// The grant feed's tables refuse a repeated key (server-account/migrations/0010_grant_keys.sql), and the migration
// keeps the rows a database already holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../../server-account/migrations/', import.meta.url));
const KEYS_MIGRATION = '0010_grant_keys.sql';

/** A database with the migrations applied in order, up to and not including `stopAt` when it is given. */
function migrated(stopAt?: string): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (file === stopAt) break;
    db.exec(readFileSync(`${MIGRATIONS}/${file}`, 'utf8'));
  }
  return db;
}

const insertRow = (db: DatabaseSync, batch: string, sub: string, kind: string, asks: number): void => {
  db.prepare(
    'INSERT INTO grant_rows (batch, at, sub, kind, asks, members, bucket, ceiling, span_s) VALUES (?, 100, ?, ?, ?, 1, 0, 0, 600)',
  ).run(batch, sub, kind, asks);
};

const insertTally = (db: DatabaseSync, batch: string, reader: string, sender: string, reason: string): void => {
  db.prepare('INSERT INTO grant_tallies (batch, at, reader, sender, reason, n) VALUES (?, 100, ?, ?, ?, 1)').run(
    batch,
    reader,
    sender,
    reason,
  );
};

const count = (db: DatabaseSync, table: string): number =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

test('a grant row repeats no batch, account and kind', () => {
  const db = migrated();
  insertRow(db, 'b1', 'p1', 'enc', 3);
  insertRow(db, 'b1', 'p1', 'boss', 3);
  insertRow(db, 'b2', 'p1', 'enc', 3);
  assert.throws(() => insertRow(db, 'b1', 'p1', 'enc', 5), /UNIQUE constraint failed: grant_rows/);
  assert.equal(count(db, 'grant_rows'), 3);
});

test('a grant tally repeats no batch, reader, sender and reason', () => {
  const db = migrated();
  insertTally(db, 'b1', 'r1', 's1', 'stats');
  insertTally(db, 'b1', 'r1', 's1', 'kind');
  insertTally(db, 'b1', 'r2', 's1', 'stats');
  assert.throws(() => insertTally(db, 'b1', 'r1', 's1', 'stats'), /UNIQUE constraint failed: grant_tallies/);
  assert.equal(count(db, 'grant_tallies'), 3);
});

test('the migration keeps the rows a database holds, one of each key, and the indexes the readers use', () => {
  const db = migrated(KEYS_MIGRATION);
  insertRow(db, 'b1', 'p1', 'enc', 3);
  insertRow(db, 'b1', 'p1', 'enc', 4);
  insertRow(db, 'b1', 'p2', 'enc', 3);
  insertTally(db, 'b1', 'r1', 's1', 'stats');
  insertTally(db, 'b1', 'r1', 's1', 'stats');
  db.exec(readFileSync(`${MIGRATIONS}/${KEYS_MIGRATION}`, 'utf8'));
  assert.equal(count(db, 'grant_rows'), 2);
  assert.equal(count(db, 'grant_tallies'), 1);
  const indexes = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN ('grant_rows_at', 'grant_tallies_sender')",
    )
    .all()
    .map((row) => (row as { name: string }).name)
    .sort();
  assert.deepEqual(indexes, ['grant_rows_at', 'grant_tallies_sender']);
});
