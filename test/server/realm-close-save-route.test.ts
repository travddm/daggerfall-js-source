// A closing tab's last save: the account service stores it and releases the seat in the same update, and a refused one
// releases the seat all the same (server-account/src/realm-save-route.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by computed paths: Node's type pass would otherwise follow them into the account service, which it cannot type.
const workerModule = '../../server-account/src/index.js';
const accountDbModule = '../accountDb.mjs';
const realmSeatModule = '../realmSeat.mjs';
const { default: worker } = await import(workerModule);
const { standService } = await import(accountDbModule);
const { seatRealm, freshSave } = await import(realmSeatModule);

type Row = { seq: number; lease: string | null; obj: string };

async function seated() {
  const svc = await standService();
  const guest = (await svc.guest()) as { secret: string };
  const seat = await seatRealm(svc.env, guest.secret, 'Hero');
  const row = (): Row =>
    svc.env.DB._raw.prepare('SELECT seq, lease, obj FROM realm_characters WHERE id = ?').get(seat.id);
  const put = async (
    text: string,
    { lease = seat.lease, seq, leave = true }: { lease?: string; seq: number; leave?: boolean },
  ) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${guest.secret}`,
      'x-realm-lease': lease,
      'x-realm-seq': String(seq),
    };
    if (leave) headers['x-realm-leave'] = '1';
    const res = await worker.fetch(
      new Request(`https://accounts.invalid/v1/realm/${seat.id}/data`, { method: 'PUT', headers, body: text }),
      svc.env,
    );
    return { status: res.status, body: await res.json() };
  };
  const stored = (): string => new TextDecoder().decode(svc.env.SAVES._map.get(row().obj));
  return { svc, seat, row, put, stored };
}

test('a closing save is stored and the seat released by one update of the record', async () => {
  const { svc, row, put, stored } = await seated();
  const updates: string[] = [];
  const prepare = svc.env.DB.prepare.bind(svc.env.DB);
  svc.env.DB.prepare = (sql: string) => {
    if (/^\s*UPDATE realm_characters\b/i.test(sql)) updates.push(sql);
    return prepare(sql);
  };
  const last = JSON.stringify(freshSave({ name: 'Hero', goldPieces: 150 }));
  const answer = await put(last, { seq: 2 });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.ok, true);
  assert.deepEqual([row().seq, row().lease], [2, null], 'saved at the next sequence, the seat free');
  assert.equal(stored(), last);
  const releases = updates.filter((sql) => sql.includes('lease = NULL'));
  assert.equal(releases.length, 1, 'only the save releases the seat');
  assert.match(releases[0], /SET seq = \?/, 'the update that moves the record to the save');
});

test('a closing save the realm refuses still releases the seat; one under a lease another tab took releases nothing', async () => {
  const { row, put, stored } = await seated();
  const before = stored();
  const stale = await put(JSON.stringify(freshSave({ name: 'stale' })), { seq: 1 });
  assert.deepEqual([stale.status, stale.body], [409, { error: 'seq', seq: 1 }]);
  assert.deepEqual([row().seq, row().lease, stored()], [1, null, before], 'the record as it stood, the seat free');

  const again = await seated();
  const taken = '0'.repeat(32);
  const foreign = await again.put('{}', { lease: taken, seq: 2 });
  assert.equal(foreign.body.error, 'lease');
  assert.equal(again.row().lease, again.seat.lease, 'the tab that holds the lease keeps it');
});

test('a save sent without the header keeps the seat, and the browser may send the header', async () => {
  const { svc, row, put } = await seated();
  const plain = await put(JSON.stringify(freshSave({ name: 'Hero' })), { seq: 2, leave: false });
  assert.equal(plain.status, 200);
  assert.notEqual(row().lease, null);
  const res = await worker.fetch(new Request('https://accounts.invalid/v1/realm', { method: 'OPTIONS' }), svc.env);
  assert.match(res.headers.get('access-control-allow-headers') ?? '', /x-realm-leave/);
});
