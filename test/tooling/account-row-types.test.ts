// The account service's row types (server-account/src/database-types.ts) match the schema the migrations build, and
// the generator types columns as SQLite stores them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { migratedDatabase, rowTypesSource, ROW_TYPES_PATH } from '../../tools/account-row-types.ts';

test('database-types.ts is what the migrations give: run node tools/account-row-types.ts when this fails', () => {
  assert.equal(readFileSync(ROW_TYPES_PATH, 'utf8'), rowTypesSource(migratedDatabase()));
});

test('a column is typed by its affinity, its NOT NULL and its default', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE sample_rows (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT,
    weight REAL NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    payload BLOB
  )`);
  const source = rowTypesSource(db);
  assert.match(
    source,
    /export interface SampleRowsTable \{\n {2}id: Generated<number>;\n {2}name: string;\n {2}note: string \| null;\n {2}weight: number;\n {2}seen: Generated<number>;\n {2}payload: Uint8Array \| null;\n\}/,
  );
  assert.match(source, /export interface Database \{\n {2}sample_rows: SampleRowsTable;\n\}/);
});

test('a key column is nullable unless declared NOT NULL, except a rowid alias and a WITHOUT ROWID key', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE loose_keys (code TEXT PRIMARY KEY, n INTEGER NOT NULL)');
  db.exec('CREATE TABLE pair_keys (a INTEGER, b INTEGER, PRIMARY KEY (a, b)) WITHOUT ROWID');
  const source = rowTypesSource(db);
  assert.match(source, /export interface LooseKeysTable \{\n {2}code: string \| null;/);
  // A WITHOUT ROWID table's key is NOT NULL whether declared or not, and PRAGMA table_xinfo reports it so
  assert.match(source, /export interface PairKeysTable \{\n {2}a: number;\n {2}b: number;\n\}/);
});
