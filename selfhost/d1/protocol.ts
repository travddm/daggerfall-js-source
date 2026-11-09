// The D1 fetcher protocol over a SQLite Durable Object's storage. workerd's D1 binding (`cloudflare-internal:d1-api`)
// sends each statement or batch to an inner `fetcher` service as `POST /query` or `POST /execute` with
// `?resultsFormat=`, or, under the `d1_binding_jsrpc` flag, as an RPC `query({ queries, bookmark })`. This module answers
// both from `storage.sql`. It follows workerd's own test backend (src/cloudflare/internal/test/d1/d1-mock.js) and
// Miniflare's D1 object (packages/miniflare/src/workers/d1/database.worker.ts), with one difference from the workerd mock:
// a batch runs in one transaction and fails whole, as D1 does. The account service relies on that.

/** The part of a Durable Object's `storage.sql` cursor this module reads. */
export interface SqlCursor {
  readonly columnNames: string[];
  readonly rowsRead: number;
  readonly rowsWritten: number;
  raw(): Iterable<unknown[]>;
}

/** The part of a Durable Object's `storage` this module uses. */
export interface SqlStore {
  sql: { exec(query: string, ...bindings: unknown[]): SqlCursor; readonly databaseSize: number };
  transactionSync<T>(fn: () => T): T;
  getCurrentBookmark?(): Promise<string>;
}

export type ResultsFormat = 'ARRAY_OF_OBJECTS' | 'ROWS_AND_COLUMNS' | 'NONE';
export type D1Query = { sql: string; params?: unknown[] };

export type D1Meta = {
  served_by: string;
  served_by_primary: boolean;
  duration: number;
  changes: number;
  last_row_id: number;
  changed_db: boolean;
  size_after: number;
  rows_read: number;
  rows_written: number;
};

export type D1Success = { success: true; results: unknown; meta: D1Meta };
export type D1Failure = { success: false; error: string };

/** The header a `withSession()` session sends its bookmark in, and reads the newest one back from. */
export const SESSION_HEADER = 'x-cf-d1-session-commit-token';
const SERVED_BY = 'dfo-selfhost';

const formatOf = (param: string | null): ResultsFormat =>
  param === 'ROWS_AND_COLUMNS' ? 'ROWS_AND_COLUMNS' : param === 'NONE' ? 'NONE' : 'ARRAY_OF_OBJECTS';

// A blob crosses the wire as an array of byte values, both ways.
const paramOf = (p: unknown): unknown => (Array.isArray(p) ? new Uint8Array(p as number[]).buffer : p);
const valueOf = (v: unknown): unknown => (v instanceof ArrayBuffer ? Array.from(new Uint8Array(v)) : v);

// SQLite rejects a statement that is only a comment; D1 drops `--` comment lines before it runs one.
const isBlank = (sql: string): boolean => sql.replace(/^\s*--.*$/gm, '').trim() === '';

function counters(store: SqlStore): { changes: number; lastRowId: number } {
  const [row] = Array.from(store.sql.exec('SELECT total_changes(), last_insert_rowid()').raw());
  return { changes: Number(row?.[0] ?? 0), lastRowId: Number(row?.[1] ?? 0) };
}

/** Runs one statement and answers it as D1 does. Throws on an SQL error. */
export function runQuery(store: SqlStore, query: D1Query, format: ResultsFormat): D1Success {
  const sizeBefore = store.sql.databaseSize;
  const before = counters(store);
  const started = performance.now();
  const cursor = store.sql.exec(query.sql, ...(query.params ?? []).map(paramOf));
  const columns = cursor.columnNames;
  const rows = Array.from(cursor.raw(), (row) => row.map(valueOf));
  const duration = performance.now() - started;
  const after = counters(store);
  const sizeAfter = store.sql.databaseSize;
  const changes = after.changes - before.changes;
  const results =
    format === 'ROWS_AND_COLUMNS'
      ? { columns, rows }
      : rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  return {
    success: true,
    results,
    meta: {
      served_by: SERVED_BY,
      served_by_primary: true,
      duration,
      changes,
      last_row_id: after.lastRowId,
      changed_db: changes !== 0 || after.lastRowId !== before.lastRowId || sizeAfter !== sizeBefore,
      size_after: sizeAfter,
      rows_read: cursor.rowsRead,
      rows_written: cursor.rowsWritten,
    },
  };
}

/** Runs every query in one transaction: all of them land, or an error rolls back all of them. */
export function runBatch(store: SqlStore, queries: D1Query[], format: ResultsFormat): D1Success[] {
  const kept = queries.filter((q) => !isBlank(q.sql));
  if (kept.length === 0) throw new Error('No SQL statements detected.');
  return store.transactionSync(() => kept.map((q) => runQuery(store, q, format)));
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function isQuery(v: unknown): v is D1Query {
  if (v === null || typeof v !== 'object') return false;
  const { sql, params } = v as { sql?: unknown; params?: unknown };
  return typeof sql === 'string' && (params === undefined || params === null || Array.isArray(params));
}

/** Answers the binding's `POST /query` and `POST /execute`. A body is one query or an array of them (a batch). A failure
 *  is answered with status 200 and `{ success: false, error }`, which the binding turns into a `D1_ERROR`. */
export async function handleFetch(store: SqlStore, request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || (url.pathname !== '/query' && url.pathname !== '/execute')) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const format = formatOf(url.searchParams.get('resultsFormat'));
  const inSession = Boolean(request.headers.get(SESSION_HEADER)?.trim());
  let body: unknown;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ success: false, error: messageOf(e) } satisfies D1Failure);
  }
  const queries = Array.isArray(body) ? body : [body];
  if (!queries.every(isQuery)) return Response.json({ success: false, error: 'invalid query' } satisfies D1Failure);
  let results: D1Success[];
  try {
    results = runBatch(store, queries, format);
  } catch (e) {
    return Response.json({ success: false, error: messageOf(e) } satisfies D1Failure);
  }
  const headers: Record<string, string> = {};
  if (inSession && store.getCurrentBookmark) headers[SESSION_HEADER] = await store.getCurrentBookmark();
  return Response.json(Array.isArray(body) ? results : results[0], { headers });
}

export type RpcQueryParams = { queries: D1Query[]; bookmark?: string | null };
export type RpcQueryResult = {
  results: Array<{ meta: D1Meta; data: { kind: 'raw'; columns: string[]; rows: unknown[][] } }>;
  bookmark?: string;
};

/** Answers the binding's RPC `query()` (the `d1_binding_jsrpc` path). Throws on an SQL error, as D1's RPC does. */
export async function handleRpcQuery(store: SqlStore, params: RpcQueryParams): Promise<RpcQueryResult> {
  if (!Array.isArray(params?.queries) || !params.queries.every(isQuery)) throw new Error('invalid query');
  const done = runBatch(store, params.queries, 'ROWS_AND_COLUMNS');
  const results = done.map((r) => {
    const { columns, rows } = r.results as { columns: string[]; rows: unknown[][] };
    return { meta: r.meta, data: { kind: 'raw' as const, columns, rows } };
  });
  const out: RpcQueryResult = { results };
  if (params.bookmark && store.getCurrentBookmark) out.bookmark = await store.getCurrentBookmark();
  return out;
}
