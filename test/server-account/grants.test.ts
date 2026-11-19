// The grant feed's window is kept whole or not at all (server-account/src/grants.js takeGrantMeasure): a list that
// fails leaves nothing, so the relay's retry is read, and a window two posts race on is read once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import type { webcrypto } from 'node:crypto';

type CryptoKey = webcrypto.CryptoKey;
type SubtleCrypto = webcrypto.SubtleCrypto;

interface Statement {
  bind(...values: unknown[]): Statement;
}
interface FakeD1 {
  _raw: DatabaseSync;
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
interface Service {
  env: { DB: FakeD1 };
  gatePriv: CryptoKey;
}
interface Window {
  id: string;
}
type Answer = { ok: true; read: boolean } | { error: string };
type TakeGrantMeasure = (
  ctx: { db: unknown; nowS: number; subtle: SubtleCrypto; rand: (bytes: Uint8Array) => void },
  env: unknown,
  bytes: Uint8Array,
  sig: string,
) => Promise<Answer>;

// Loaded by computed paths: a static import would pull the whole account service into the TypeScript check.
const load = async <T>(path: string): Promise<T> => (await import(new URL(path, import.meta.url).href)) as T;
const { standService } = await load<{ standService: (options: object) => Promise<Service> }>('../accountDb.mjs');
const { takeGrantMeasure } = await load<{ takeGrantMeasure: TakeGrantMeasure }>('../../server-account/src/grants.js');
const measure = await load<{
  newGrantMeasure: (nowMs: number) => object;
  foldGrantAsk: (w: object, a: string, k: string, n: number, refusal: string | null, live: number) => boolean;
  grantMeasureBatch: (w: object, id: string, q: string, nowMs: number) => Window;
  sealGrantMeasure: (
    batch: Window,
    key: CryptoKey,
    options: { subtle: SubtleCrypto },
  ) => Promise<{ body: Uint8Array; sig: string }>;
}>('../../src/net/grantMeasure.js');

const { subtle } = globalThis.crypto;
const rand = (bytes: Uint8Array): void => {
  crypto.getRandomValues(bytes);
};

/** A sealed window of 30 accounts' encounter asks. */
async function sealedWindow(service: Service, nowMs: number): Promise<{ id: string; body: Uint8Array; sig: string }> {
  const w = measure.newGrantMeasure(nowMs - 20 * 60_000);
  for (let i = 0; i < 30; i++) measure.foldGrantAsk(w, `acct-${1000 + i}`, 'enc', 1, null, 1);
  const batch = measure.grantMeasureBatch(w, 'cd'.repeat(8), 'world:25,9', nowMs);
  const sealed = await measure.sealGrantMeasure(batch, service.gatePriv, { subtle });
  return { id: batch.id, ...sealed };
}

const count = (db: FakeD1, table: string): number =>
  Number((db._raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

/** The database with `batch` replaced: every other member is the fake's own. */
const withBatch = (db: FakeD1, batch: (statements: Statement[]) => Promise<unknown[]>): FakeD1 =>
  new Proxy(db, { get: (target, key) => (key === 'batch' ? batch : Reflect.get(target, key)) });

test('a window whose write fails keeps nothing, and the relay retry is read and kept whole', async () => {
  const service = await standService({});
  const db = service.env.DB;
  const nowMs = Date.now();
  const nowS = Math.floor(nowMs / 1000);
  const sealed = await sealedWindow(service, nowMs);
  const failing = withBatch(db, async () => {
    throw new Error('D1_ERROR: storage is having a day');
  });
  await assert.rejects(takeGrantMeasure({ db: failing, nowS, subtle, rand }, service.env, sealed.body, sealed.sig));
  assert.equal(count(db, 'grant_batches'), 0);
  assert.equal(count(db, 'grant_rows'), 0);
  const retry = await takeGrantMeasure({ db, nowS, subtle, rand }, service.env, sealed.body, sealed.sig);
  assert.deepEqual(retry, { ok: true, read: true });
  assert.equal(count(db, 'grant_batches'), 1);
  assert.equal(count(db, 'grant_rows'), 30);
});

test('a window kept by a racing post is read once: the later post answers it as kept and writes nothing', async () => {
  const service = await standService({});
  const db = service.env.DB;
  const nowMs = Date.now();
  const nowS = Math.floor(nowMs / 1000);
  const sealed = await sealedWindow(service, nowMs);
  // The other post's write lands between this post's check and its own write
  const raced = withBatch(db, async (statements) => {
    db._raw
      .prepare("INSERT INTO grant_batches (id, at, q, span_s, live) VALUES (?, ?, 'world:25,9', 1200, 1)")
      .run(sealed.id, nowS);
    return db.batch(statements);
  });
  const answer = await takeGrantMeasure({ db: raced, nowS, subtle, rand }, service.env, sealed.body, sealed.sig);
  assert.deepEqual(answer, { ok: true, read: false });
  assert.equal(count(db, 'grant_batches'), 1);
  assert.equal(count(db, 'grant_rows'), 0);
});
