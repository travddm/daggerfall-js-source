// The migration runner: applies `server-account/migrations/*.sql` to the self-hosted database once each, in name
// order, as `wrangler d1 migrations apply` does, and in the same ledger table, so a database moved between the two
// keeps one record. A file is split into statements here and each runs alone: a Durable Object refuses one `sql.exec`
// past 100 KB (SQLITE_TOOBIG), which 0001_schema.sql is, and D1's own `exec()` splits on newlines, which breaks the
// `CREATE TRIGGER ... BEGIN ... END` blocks in it.
import type { SqlStore } from './protocol.ts';

export type Migration = { name: string; sql: string };

const LEDGER = `CREATE TABLE IF NOT EXISTS d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const TRIGGER_START = /^\s*CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i;
const TRIGGER_END = /\bEND\s*$/i;

/** Splits SQL text into statements at each `;` outside a string, an identifier quote, a comment and a trigger body.
 *  A statement that is only comments is dropped. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  const push = (end: number): void => {
    const text = sql.slice(start, end).trim();
    if (text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim() !== '') out.push(text);
    start = end + 1;
  };
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      i = sql.indexOf(close, i + 1);
      if (i < 0) break;
      // A doubled quote inside a string is an escaped quote, read on the next turn as a new string.
      i += 1;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (c === ';') {
      const pending = sql.slice(start, i).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '');
      // Inside a trigger, a `;` ends a statement of its body; the trigger itself ends at `END;`.
      if (!TRIGGER_START.test(pending) || TRIGGER_END.test(pending)) push(i);
    }
    i += 1;
  }
  push(sql.length);
  return out;
}

/** Applies every migration the ledger does not name, each in its own transaction, and returns the names applied. A
 *  failing file rolls back alone and throws, so the files after it wait for the next start. */
export function applyMigrations(store: SqlStore, migrations: Migration[]): string[] {
  store.sql.exec(LEDGER);
  const done = new Set(Array.from(store.sql.exec('SELECT name FROM d1_migrations').raw(), (row) => String(row[0])));
  const applied: string[] = [];
  for (const m of [...migrations].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (done.has(m.name)) continue;
    store.transactionSync(() => {
      for (const statement of splitStatements(m.sql)) Array.from(store.sql.exec(statement).raw());
      store.sql.exec('INSERT INTO d1_migrations (name) VALUES (?)', m.name);
    });
    applied.push(m.name);
  }
  return applied;
}
