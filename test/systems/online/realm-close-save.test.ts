// A closed tab's last save: packed ahead, sent at pagehide with the seat's release, and a save over the budget saved
// about once a minute instead (src/systems/online/realm-close-save.ts), against the real account Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by computed paths: Node's type pass would otherwise follow them into the account service and browser code,
// which it cannot type.
const workerModule = '../../../server-account/src/index.js';
const accountDbModule = '../../accountDb.mjs';
const realmSeatModule = '../../realmSeat.mjs';
const accountClientModule = '../../../src/net/accountClient.js';
const closeModule = '../../../src/systems/online/realm-close-save.ts';
const savesModule = '../../../src/systems/realmSaves.js';
const codecModule = '../../../src/net/realm/realmSaveCodec.js';
const { gunzipText } = await import(codecModule);
const { default: worker } = await import(workerModule);
const { standService } = await import(accountDbModule);
const { seatRealm, freshSave } = await import(realmSeatModule);
const { SESSION_KEY, SERVICE_KEY } = await import(accountClientModule);
const { watchRealmClose, REALM_CLOSE_STAGE_MS, REALM_OVER_BUDGET_SAVE_MS } = await import(closeModule);
const { realmIo, createRealmSession } = await import(savesModule);

type Row = { seq: number; lease: string | null; obj: string };

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: unknown) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
}

/** A realm character seated through the service, its session on a device whose fetch is the Worker, its page events. */
async function playing() {
  const svc = await standService();
  const guest = (await svc.guest()) as { id: string; secret: string };
  const seat = await seatRealm(svc.env, guest.secret, 'Hero');
  const storage = fakeStorage();
  storage.setItem(SESSION_KEY, JSON.stringify({ id: guest.id, secret: guest.secret }));
  storage.setItem(SERVICE_KEY, 'https://accounts.invalid');
  const sent: string[] = [];
  const fetch = async (url: string, init: RequestInit & { keepalive?: boolean }) => {
    const leave = (init.headers as Record<string, string>)?.['x-realm-leave'] ? ' leave' : '';
    sent.push(`${init.method} ${new URL(url).pathname}${init.keepalive ? ' keepalive' : ''}${leave}`);
    return worker.fetch(new Request(url, init), svc.env);
  };
  const io = realmIo({ fetch, storage });
  const session = createRealmSession({
    io,
    id: seat.id,
    lease: seat.lease,
    seq: 1,
    hidden: () => false,
    watchHidden: () => {},
  });
  const row = (): Row =>
    svc.env.DB._raw.prepare('SELECT seq, lease, obj FROM realm_characters WHERE id = ?').get(seat.id);
  const stored = async (): Promise<string | null> => gunzipText(svc.env.SAVES._map.get(row().obj));
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let save: Record<string, unknown> = freshSave({ name: 'Hero', goldPieces: 100 });
  const watch = (budget?: number) =>
    watchRealmClose({
      session,
      win,
      doc,
      budget,
      compose: (sink: (snap: unknown) => unknown) => {
        sink(save);
        return true;
      },
      held: () => null,
      summary: () => ({ level: 1 }),
      later: (fn: () => void, ms: number) => {
        timers.push({ fn, ms });
      },
    });
  const play = (patch: Record<string, unknown>) => {
    save = { ...save, ...patch };
  };
  return { svc, session, row, stored, win, doc, sent, timers, watch, play };
}

const settle = () =>
  new Promise((r) => {
    setTimeout(r, 20);
  });

test("under the budget: the save packed ahead goes at pagehide with the seat's release, and no separate leave", async () => {
  const p = await playing();
  const watch = p.watch();
  assert.deepEqual(
    p.timers.map((t) => t.ms),
    [REALM_CLOSE_STAGE_MS],
    'the timer stages on its own',
  );
  p.play({ goldPieces: 160 }); // a kill's loot, after the last checkpoint
  await watch.stage();
  assert.ok(watch.closing, 'a closing save is ready');
  assert.equal(p.sent.length, 0, 'nothing sent before the page goes');
  p.win.dispatchEvent(new Event('pagehide'));
  await settle();
  assert.deepEqual(p.sent, ['PUT /v1/realm/' + p.session.id + '/data keepalive leave']);
  assert.deepEqual([p.row().seq, p.row().lease], [2, null], 'the save landed and the seat is free, in one request');
  assert.equal(JSON.parse((await p.stored()) ?? 'null').goldPieces, 160, 'the kill is in the realm');
  assert.equal(p.session.lost, 'left');
});

test('a save that landed after the closing one was packed makes it stale: the page sends the plain leave', async () => {
  const p = await playing();
  const watch = p.watch();
  p.play({ goldPieces: 120 });
  await watch.stage();
  p.play({ goldPieces: 130 });
  assert.equal(
    (await p.session.checkpoint(JSON.stringify({ ...freshSave({ name: 'Hero' }), goldPieces: 130 }))).ok,
    true,
  );
  assert.equal(watch.closing, null, 'never an older save over the record');
  p.sent.length = 0;
  watch.close();
  await settle();
  assert.deepEqual(p.sent, ['POST /v1/realm/leave keepalive']);
  assert.deepEqual([p.row().seq, p.row().lease], [2, null]);
});

test('over the budget: no closing save; a changed save goes to the realm about once a minute, an unchanged one does not', async () => {
  const p = await playing();
  const watch = p.watch(16);
  p.play({ goldPieces: 140 });
  await watch.stage();
  await settle();
  assert.equal(watch.overBudget, true);
  assert.equal(watch.closing, null);
  assert.deepEqual(p.sent, ['PUT /v1/realm/' + p.session.id + '/data'], 'the changed save, saved now');
  assert.equal(p.row().seq, 2);
  await watch.stage();
  await settle();
  assert.equal(p.sent.length, 1, 'unchanged since it landed: nothing sent');
  p.timers.splice(0).forEach((t) => t.fn());
  await settle();
  assert.deepEqual(
    p.timers.map((t) => t.ms),
    [REALM_OVER_BUDGET_SAVE_MS],
    'checked once a minute while over the budget',
  );
  watch.close();
  await settle();
  assert.equal(p.sent.at(-1), 'POST /v1/realm/leave keepalive', 'the plain leave at close');
  assert.equal(p.row().lease, null);
});

test('a page shown again from the back-forward cache takes the seat back, at the sequence its closing save left', async () => {
  const p = await playing();
  const watch = p.watch();
  p.play({ goldPieces: 170 });
  await watch.stage();
  p.win.dispatchEvent(new Event('pagehide'));
  await settle();
  p.win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  await settle();
  assert.equal(p.session.lost, null, 'joined again');
  assert.equal(p.session.seq, 2);
  assert.notEqual(p.row().lease, null);
});

test('the hidden page stages at once; a save the gate refuses stages nothing', async () => {
  const p = await playing();
  const watch = p.watch();
  p.doc.visibilityState = 'hidden';
  p.doc.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.ok(watch.closing, 'staged as the page hid');
  const refused = watchRealmClose({
    session: p.session,
    win: null,
    doc: null,
    compose: () => false,
    held: () => null,
    summary: () => null,
    later: () => {},
  });
  await refused.stage();
  assert.equal(refused.closing, null);
});
