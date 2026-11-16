import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { DatabaseSync } from 'node:sqlite';
import { applyMigrations, splitStatements } from '../../../selfhost/d1/migrations.ts';
import { sqliteStore } from '../sqlite-store.ts';

const dir = new URL('../../../server-account/migrations/', import.meta.url);
const MIGRATIONS = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, sql: readFileSync(new URL(name, dir), 'utf8') }));

const names = (store: ReturnType<typeof sqliteStore>): string[] =>
  Array.from(store.sql.exec('SELECT name FROM d1_migrations ORDER BY id').raw(), (r) => String(r[0]));

test("the account service's migrations apply once each, in name order, triggers and all", () => {
  const store = sqliteStore();
  const sorted = MIGRATIONS.map((m) => m.name).sort();
  assert.deepEqual(applyMigrations(store, [...MIGRATIONS].reverse()), sorted);
  assert.deepEqual(names(store), sorted);
  const triggers = Array.from(store.sql.exec("SELECT name FROM sqlite_master WHERE type = 'trigger'").raw());
  assert.ok(triggers.length > 0, 'the schema keeps its triggers');
  assert.deepEqual(applyMigrations(store, MIGRATIONS), []);
});

test('each migration splits into statements under the 100 KB a Durable Object takes, building the same schema', () => {
  const schemaOf = (run: (db: DatabaseSync) => void): unknown[] => {
    const db = new DatabaseSync(':memory:');
    run(db);
    return db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all();
  };
  for (const m of MIGRATIONS) {
    const statements = splitStatements(m.sql);
    assert.ok(
      statements.every((s) => new TextEncoder().encode(s).length < 100_000),
      m.name,
    );
    const whole = schemaOf((db) => {
      for (const earlier of MIGRATIONS.filter((e) => e.name < m.name)) db.exec(earlier.sql);
      db.exec(m.sql);
    });
    const split = schemaOf((db) => {
      for (const earlier of MIGRATIONS.filter((e) => e.name < m.name)) db.exec(earlier.sql);
      for (const s of statements) db.exec(s);
    });
    assert.deepEqual(split, whole, m.name);
  }
});

test('a statement ends at a semicolon outside strings, comments and trigger bodies', () => {
  const sql = [
    'INSERT INTO t VALUES (\'a;b\', "c;d"); -- a comment; still a comment',
    '/* a block; comment */ CREATE TRIGGER g AFTER INSERT ON t BEGIN UPDATE t SET x = 1; DELETE FROM u; END;',
    "SELECT 'it''s; one';",
    '-- only a comment;',
  ].join('\n');
  assert.deepEqual(splitStatements(sql), [
    'INSERT INTO t VALUES (\'a;b\', "c;d")',
    '-- a comment; still a comment\n/* a block; comment */ CREATE TRIGGER g AFTER INSERT ON t BEGIN UPDATE t SET x = 1; DELETE FROM u; END',
    "SELECT 'it''s; one'",
  ]);
});

test('a later file waits for the next start when an earlier one fails, and the failed one leaves nothing', () => {
  const store = sqliteStore();
  const steps = [
    { name: '0001_a.sql', sql: 'CREATE TABLE a (x INTEGER);' },
    { name: '0002_b.sql', sql: 'CREATE TABLE b (x INTEGER); INSERT INTO nowhere VALUES (1);' },
    { name: '0003_c.sql', sql: 'CREATE TABLE c (x INTEGER);' },
  ];
  assert.throws(() => applyMigrations(store, steps));
  assert.deepEqual(names(store), ['0001_a.sql']);
  const tables = Array.from(store.sql.exec("SELECT name FROM sqlite_master WHERE name IN ('b', 'c')").raw());
  assert.deepEqual(tables, []);
  steps[1] = { name: '0002_b.sql', sql: 'CREATE TABLE b (x INTEGER);' };
  assert.deepEqual(applyMigrations(store, steps), ['0002_b.sql', '0003_c.sql']);
});
