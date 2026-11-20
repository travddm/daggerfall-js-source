// A piece of post may carry gold and Stores materials beside its one item. The claim credits the gold to the claiming
// character's record and the materials to its Stores, in the claim's own batch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST_SENDER, POST_MATERIAL_MAX, postHead } from '../../src/net/postLaw.js';

type Who = { id: string; secret: string };
type Material = { material: string; origin: string; qty: number };
type Row = Record<string, unknown>;
type Raw = {
  prepare(sql: string): {
    run(...values: unknown[]): unknown;
    get(...values: unknown[]): Row;
    all(...values: unknown[]): Row[];
  };
};
type Env = { DB: { _raw: Raw }; SAVES: { _map: Map<string, Uint8Array> } };
type Head = { id: string; gold: number; materials: Material[]; claimed: boolean };
type Body = {
  error?: string;
  gold?: number;
  materials?: Material[];
  item?: unknown;
  realm?: { seq: number };
  post?: Head[];
  unclaimed?: number;
};
type Service = {
  env: Env;
  registered(handle: string): Promise<Who>;
  call(path: string, body: unknown, bearer: string): Promise<{ status: number; body: Body }>;
  fetch(url: string, init: RequestInit): Promise<Response>;
};
type At = { id: string; lease: string; seq: number };
type Seated = { id: string; at(): At };

// Loaded by computed paths: a static import would pull the whole account service into the TypeScript check.
const load = async <T>(path: string): Promise<T> => (await import(new URL(path, import.meta.url).href)) as T;
const { standService, T0 } = await load<{ standService: () => Promise<Service>; T0: number }>('../accountDb.mjs');
const { seatRealm } = await load<{
  seatRealm: (env: Env, secret: string, handle: string, save: object) => Promise<Seated>;
}>('../realmSeat.mjs');

const ROSE = 'p1:12';

function send(
  env: Env,
  who: Who,
  batch: string,
  { gold = 0, materials = null }: { gold?: number; materials?: Material[] | null },
): string {
  const id = `p${batch.replace(/[^a-z0-9]/g, '')}`.padEnd(24, '0').slice(0, 24);
  env.DB._raw
    .prepare(
      'INSERT INTO server_post (id, to_id, batch, sender, subject, body, gold, materials, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      who.id,
      batch,
      POST_SENDER,
      'Goods',
      'Your goods.',
      gold,
      materials ? JSON.stringify(materials) : null,
      T0,
    );
  return id;
}

function recordOf(env: Env, id: string): { goldPieces: number; items: unknown[] } {
  const row = env.DB._raw.prepare('SELECT obj FROM realm_characters WHERE id = ?').get(id);
  return JSON.parse(new TextDecoder().decode(env.SAVES._map.get(String(row.obj))));
}

async function seated(svc: Service): Promise<{ ann: Who; realm: Seated }> {
  const ann = await svc.registered('Ann');
  const realm = await seatRealm(svc.env, ann.secret, 'Ann', { name: 'Ann', level: 20, goldPieces: 50, items: [] });
  return { ann, realm };
}

test('a piece with gold and materials is listed with them, claimed into the record and the Stores, and kept until claimed', async () => {
  const svc = await standService();
  const { ann, realm } = await seated(svc);
  const goods: Material[] = [
    { material: ROSE, origin: 'own', qty: 30 },
    { material: ROSE, origin: 'bought', qty: 5 },
  ];
  const id = send(svc.env, ann, 'goods-one', { gold: 400, materials: goods });

  const res = await svc.fetch('https://accounts.invalid/v1/post/box', {
    method: 'GET',
    headers: { authorization: `Bearer ${ann.secret}` },
  });
  const box = (await res.json()) as Body;
  const head = box.post?.find((p) => p.id === id);
  assert.deepEqual([head?.gold, head?.materials, head?.claimed, box.unclaimed], [400, goods, false, 1]);
  assert.deepEqual(postHead(head), head, 'the client reads it through the law');

  const early = await svc.call('/v1/post/delete', { id }, ann.secret);
  assert.deepEqual(early.body, { error: 'post-unclaimed' }, 'goods waiting are never thrown away');

  const was = realm.at();
  const claim = await svc.call('/v1/post/claim', { id, character: realm.id, realm: was }, ann.secret);
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  assert.deepEqual(
    [claim.body.gold, claim.body.materials, claim.body.item, claim.body.realm?.seq],
    [400, goods, null, was.seq + 1],
  );
  assert.equal(recordOf(svc.env, realm.id).goldPieces, 450, 'the gold in the purse');
  const stores = svc.env.DB._raw
    .prepare('SELECT origin, qty FROM prof_stores WHERE player = ? AND char_id = ? AND material = ? ORDER BY origin')
    .all(ann.id, realm.id, ROSE);
  assert.deepEqual(
    stores.map((r) => [r.origin, r.qty]),
    [
      ['bought', 5],
      ['own', 30],
    ],
  );

  const again = await svc.call('/v1/post/claim', { id, character: realm.id, realm: realm.at() }, ann.secret);
  assert.deepEqual(again.body, { error: 'post-claimed' }, 'once');
  assert.equal((await svc.call('/v1/post/delete', { id }, ann.secret)).status, 200, 'claimed, it may go');
});

test('gold the client weighs as too heavy comes as a letter of credit', async () => {
  const svc = await standService();
  const { ann, realm } = await seated(svc);
  const id = send(svc.env, ann, 'goods-letter', { gold: 90_000 });
  const claim = await svc.call(
    '/v1/post/claim',
    { id, character: realm.id, realm: realm.at(), letter: true },
    ann.secret,
  );
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  const record = recordOf(svc.env, realm.id);
  assert.equal(record.goldPieces, 50, 'no coin in the purse');
  assert.equal(record.items.length, 1, 'one letter of credit in the pack');
});

test('materials the Stores cannot hold are refused stores-full, and nothing moves', async () => {
  const svc = await standService();
  const { ann, realm } = await seated(svc);
  svc.env.DB._raw
    .prepare("INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, 'own', ?)")
    .run(ann.id, realm.id, ROSE, POST_MATERIAL_MAX - 10);
  const id = send(svc.env, ann, 'goods-full', { gold: 5, materials: [{ material: ROSE, origin: 'bought', qty: 20 }] });
  const was = realm.at();
  const claim = await svc.call('/v1/post/claim', { id, character: realm.id, realm: was }, ann.secret);
  assert.deepEqual([claim.status, claim.body], [409, { error: 'stores-full' }]);
  assert.equal(realm.at().seq, was.seq, 'the record did not move');
  assert.equal(recordOf(svc.env, realm.id).goldPieces, 50);
  const row = svc.env.DB._raw.prepare('SELECT claimed_at FROM server_post WHERE id = ?').get(id);
  assert.equal(row.claimed_at, null, 'the piece still waits');
});

test('the law reads a piece with no gold or materials as it read one before, and refuses a bad list', () => {
  const base = { id: 'p'.padEnd(24, '0'), from: POST_SENDER, subject: 'Hello', sentAt: T0, read: false, claimed: true };
  assert.deepEqual(
    postHead(base),
    { ...base, item: null, gold: 0, materials: [], claimed: false },
    'words alone hold nothing to claim',
  );
  assert.equal(postHead({ ...base, gold: -1 }), null);
  assert.equal(postHead({ ...base, materials: [{ material: ROSE, origin: 'stolen', qty: 1 }] }), null);
  assert.equal(postHead({ ...base, materials: [{ material: ROSE, origin: 'own', qty: POST_MATERIAL_MAX + 1 }] }), null);
  assert.equal(postHead({ ...base, gold: 3 })?.claimed, true, 'gold alone is something to claim');
});
