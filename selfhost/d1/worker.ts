// The `d1` service: the account database as one SQLite Durable Object, reached through the D1 binding's inner
// `fetcher`. The object applies the migrations before it answers its first request after a start.
import { handleFetch, handleRpcQuery, type RpcQueryParams, type SqlStore } from './protocol.ts';
import { applyMigrations, type Migration } from './migrations.ts';

type ObjectState = { storage: SqlStore; blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> };
type Stub = { fetch(input: string | Request, init?: RequestInit): Promise<Response> };
type Namespace = { idFromName(name: string): unknown; get(id: unknown): Stub };
type Env = { DATABASE: Namespace; DATABASE_NAME: string; MIGRATIONS: Migration[] };

// The RPC `query()` reaches the object over fetch on this path, so the object needs no RPC surface of its own.
const RPC_PATH = '/__rpc-query';

export class D1Database {
  storage: SqlStore;

  constructor(state: ObjectState, env: Env) {
    this.storage = state.storage;
    void state.blockConcurrencyWhile(async () => {
      const applied = applyMigrations(this.storage, env.MIGRATIONS ?? []);
      if (applied.length > 0) console.log(`[d1] applied ${applied.join(', ')}`);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== RPC_PATH) return handleFetch(this.storage, request);
    try {
      return Response.json(await handleRpcQuery(this.storage, (await request.json()) as RpcQueryParams));
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
}

const database = (env: Env): Stub => env.DATABASE.get(env.DATABASE.idFromName(env.DATABASE_NAME));

export default {
  fetch: (request: Request, env: Env): Promise<Response> => database(env).fetch(request),

  async query(params: RpcQueryParams, env: Env): Promise<unknown> {
    const res = await database(env).fetch(`http://d1${RPC_PATH}`, { method: 'POST', body: JSON.stringify(params) });
    const out = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(out.error ?? 'D1 query failed');
    return out;
  },
};
