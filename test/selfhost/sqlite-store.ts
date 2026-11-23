// A Durable Object's `storage` over node:sqlite, as far as selfhost/d1 and selfhost/r2 use it: `sql.exec` with
// positional bindings and a cursor of raw rows, `databaseSize`, `transactionSync` and `getCurrentBookmark`. Blobs are
// ArrayBuffers both ways, as in workerd.
import { DatabaseSync } from 'node:sqlite';
import type { SqlCursor, SqlStore } from '../../selfhost/d1/protocol.ts';

type Value = null | number | bigint | string | Uint8Array;

// node:sqlite prepares one statement at a time; a migration file is several, run whole by `exec`.
const isScript = (sql: string): boolean => /;\s*\S/.test(sql.trim().replace(/;\s*$/, ''));

const toSqlite = (v: unknown): Value => (v instanceof ArrayBuffer ? new Uint8Array(v) : (v as Value));
const fromSqlite = (v: unknown): unknown =>
  v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v;

export function sqliteStore(): SqlStore & { db: DatabaseSync; bookmarks: number } {
  const db = new DatabaseSync(':memory:');
  const empty: SqlCursor = { columnNames: [], rowsRead: 0, rowsWritten: 0, raw: () => [] };
  const store = {
    db,
    bookmarks: 0,
    sql: {
      exec(query: string, ...bindings: unknown[]): SqlCursor {
        if (bindings.length === 0 && isScript(query)) {
          db.exec(query);
          return empty;
        }
        const stmt = db.prepare(query);
        const columnNames = stmt.columns().map((c) => c.name);
        const rows =
          stmt.columns().length > 0 ? stmt.all(...bindings.map(toSqlite)) : (stmt.run(...bindings.map(toSqlite)), []);
        const raw = rows.map((row) => columnNames.map((name) => fromSqlite((row as Record<string, unknown>)[name])));
        return { columnNames, rowsRead: raw.length, rowsWritten: 0, raw: () => raw };
      },
      get databaseSize(): number {
        const row = db.prepare('SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()').get();
        return Number(row?.n ?? 0);
      },
    },
    transactionSync<T>(fn: () => T): T {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async getCurrentBookmark(): Promise<string> {
      store.bookmarks += 1;
      return `0000000${store.bookmarks}-00000000-00000000-${'0'.repeat(32)}`;
    },
  };
  return store;
}
