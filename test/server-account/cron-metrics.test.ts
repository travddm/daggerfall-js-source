// A cron job's metrics point (server-account/src/cron.js runCron) carries the rows its statements read and wrote, in
// the same doubles as a request's point (metrics.js), so one query over the dataset sums both.
import { test } from 'node:test';
import assert from 'node:assert/strict';

interface Meta {
  rows_read: number;
  rows_written: number;
  changes?: number;
}
interface FakeStatement {
  bind(...values: unknown[]): FakeStatement;
  first(): Promise<unknown>;
  all(): Promise<{ results: unknown[]; meta: Meta }>;
  run(): Promise<{ meta: Meta }>;
}
interface Point {
  indexes: string[];
  blobs: string[];
  doubles: number[];
}
interface JobContext {
  db: { prepare(sql: string): FakeStatement };
}
type CronJob = readonly [string, (ctx: JobContext) => Promise<number>];
type RunCron = (
  env: unknown,
  at: { cron: string; nowS: number; jobs: readonly CronJob[] },
) => Promise<Array<{ name: string; changed: number; statements: number }>>;

// Loaded by a computed path: a static import would pull the whole account service into the TypeScript check.
const cronPath = new URL('../../server-account/src/cron.js', import.meta.url).href;
const { runCron } = (await import(cronPath)) as { runCron: RunCron };

/** A database whose answers report rows as D1's meta does: a read of 40 rows, a write of 3 rows to `players`. */
function fakeDb(): { prepare(sql: string): FakeStatement } {
  return {
    prepare(sql: string): FakeStatement {
      const writes = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql);
      const meta: Meta = writes ? { rows_read: 3, rows_written: 3, changes: 3 } : { rows_read: 40, rows_written: 0 };
      const statement: FakeStatement = {
        bind: () => statement,
        first: async () => ({ n: 40 }),
        all: async () => ({ results: [{ n: 40 }], meta }),
        run: async () => ({ meta }),
      };
      return statement;
    },
  };
}

test('a cron job point carries rows read, rows written and the tables written, as a request point does', async () => {
  const points: Point[] = [];
  const env = { DB: fakeDb(), METRICS: { writeDataPoint: (point: Point) => points.push(point) } };
  const job = async ({ db }: JobContext): Promise<number> => {
    await db.prepare('SELECT COUNT(*) AS n FROM players').first();
    const written = await db.prepare('UPDATE players SET last_seen = ?1').bind(5).run();
    return written.meta.changes ?? 0;
  };
  const [ran] = await runCron(env, { cron: 'test', nowS: 1000, jobs: [['sample', job]] });
  assert.equal(ran.statements, 2);
  assert.equal(points.length, 1);
  const [point] = points;
  assert.deepEqual(point.indexes, ['cron:sample']);
  assert.deepEqual(point.blobs, ['cron:sample', 'CRON', '200', '', 'players:3', '']);
  const [, status, statements, rowsWritten, , rowsRead, replica, playersRows, , , , changed] = point.doubles;
  assert.equal(status, 200);
  assert.equal(statements, 2);
  assert.equal(rowsWritten, 3);
  assert.equal(rowsRead, 43);
  assert.equal(replica, 0);
  assert.equal(playersRows, 3);
  assert.equal(changed, 3);
  assert.equal(point.doubles.length, 12);
});

test('a job that throws is a 500 point with what it read before it failed', async () => {
  const points: Point[] = [];
  const env = { DB: fakeDb(), METRICS: { writeDataPoint: (point: Point) => points.push(point) } };
  const job = async ({ db }: JobContext): Promise<number> => {
    await db.prepare('SELECT COUNT(*) AS n FROM players').first();
    throw new Error('broken job');
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    await runCron(env, { cron: 'test', nowS: 1000, jobs: [['broken', job]] });
  } finally {
    console.warn = warn;
  }
  const [point] = points;
  assert.deepEqual(point.blobs.slice(0, 4), ['cron:broken', 'CRON', '500', 'failed']);
  assert.equal(point.doubles[5], 40);
  assert.equal(point.doubles[11], 0);
});
