// A home's release and transfer test the shared chests and the trader's stock inside their own batch, so a deposit or a
// listing that lands after the route's reads stops the write (server-account/src/home-free-to-go.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by computed paths: Node's type pass would otherwise follow them into the account service, which it cannot type.
const accountDbModule = '../accountDb.mjs';
const realmSeatModule = '../realmSeat.mjs';
const { standService } = await import(accountDbModule);
const { seatRealm, realmJoinAt } = await import(realmSeatModule);

type Account = { secret: string; id: string };
type Answer = { status: number; body: { ok?: boolean; error?: string; id?: string } };
type Statement = { _sql?: string };
type Count = { n: number };

const MAP_ID = 77;
const BUILDING_KEY = 3;
const RICH = (name: string) => ({
  name,
  level: 9,
  goldPieces: 2_000_000,
  items: [],
  bankAccounts: new Array(62).fill(0).map(() => ({ accountGold: 0 })),
});

/** Runs `land` once, just before the first batch that holds a statement matching `writes`. */
function landBeforeBatch(db: any, writes: RegExp, land: () => void): void {
  const prepare = db.prepare.bind(db);
  const batch = db.batch.bind(db);
  db.prepare = (sql: string) => Object.assign(prepare(sql), { _sql: sql });
  let landed = false;
  db.batch = async (list: Statement[]) => {
    if (!landed && list.some((statement) => writes.test(statement._sql ?? ''))) {
      landed = true;
      land();
    }
    return batch(list);
  };
}

async function stood() {
  const svc = await standService();
  const owner = (await svc.registered('Aldric')) as Account;
  const buyer = (await svc.registered('Mara')) as Account;
  const raw = svc.env.DB._raw;
  const count = (table: string): number =>
    (
      raw
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE map_id = ? AND building_key = ?`)
        .get(MAP_ID, BUILDING_KEY) as Count
    ).n;
  const placeChest = () =>
    raw
      .prepare(
        `INSERT INTO home_decor (map_id, building_key, id, model, place, placed_at)
         VALUES (?, ?, 'chest', 41000, '{"pos":[0,0,0],"rot":[0,0,0],"scale":1,"storage":true}', 1)`,
      )
      .run(MAP_ID, BUILDING_KEY);
  const deposit = () =>
    raw
      .prepare(
        `INSERT INTO decor_bin (map_id, building_key, piece_id, uid, item) VALUES (?, ?, 'chest', 'u1', '{"uid":"u1"}')`,
      )
      .run(MAP_ID, BUILDING_KEY);
  return { svc, owner, buyer, raw, count, placeChest, deposit };
}

test('a chest deposit that lands before a plain release keeps the home and the deposit', async () => {
  const { svc, owner, raw, count, placeChest, deposit } = await stood();
  raw
    .prepare(
      `INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, price, bought_at)
       VALUES (?, ?, ?, 'char-aldric', 'Aldric', 17, 1000, 1)`,
    )
    .run(MAP_ID, BUILDING_KEY, owner.id);
  placeChest();
  landBeforeBatch(svc.env.DB, /DELETE FROM homes/, deposit);
  const answer = (await svc.call(
    '/v1/homes/release',
    { mapId: MAP_ID, buildingKey: BUILDING_KEY },
    owner.secret,
  )) as Answer;
  assert.equal(answer.body.error, 'home-holds');
  assert.equal(count('homes'), 1, 'the home stands');
  assert.equal(count('decor_bin'), 1, 'the deposit stands');
});

test("a chest deposit that lands before a realm character's sale keeps the home and the deposit", async () => {
  const { svc, owner, count, placeChest, deposit } = await stood();
  const seller = await seatRealm(svc.env, owner.secret, 'Aldric', RICH('Aldric'));
  const at = () => realmJoinAt(svc.env, owner.secret, seller.id);
  const claim = (await svc.call(
    '/v1/homes/claim',
    {
      mapId: MAP_ID,
      buildingKey: BUILDING_KEY,
      region: 17,
      price: 100_000,
      character: seller.id,
      realm: await at(),
      layout: null,
    },
    owner.secret,
  )) as Answer;
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  placeChest();
  landBeforeBatch(svc.env.DB, /DELETE FROM homes/, deposit);
  const answer = (await svc.call(
    '/v1/homes/release',
    { mapId: MAP_ID, buildingKey: BUILDING_KEY, realm: await at() },
    owner.secret,
  )) as Answer;
  assert.equal(answer.body.error, 'home-holds');
  assert.equal(count('homes'), 1, 'the home stands');
  assert.equal(count('decor_bin'), 1, 'the deposit stands');
});

test('a chest deposit that lands before a sale without its items keeps the home with its seller', async () => {
  const { svc, owner, buyer, raw, count, placeChest, deposit } = await stood();
  const seller = await seatRealm(svc.env, owner.secret, 'Aldric', RICH('Aldric'));
  const taker = await seatRealm(svc.env, buyer.secret, 'Mara', RICH('Mara'));
  const claim = (await svc.call(
    '/v1/homes/claim',
    {
      mapId: MAP_ID,
      buildingKey: BUILDING_KEY,
      region: 17,
      price: 100_000,
      character: seller.id,
      realm: await realmJoinAt(svc.env, owner.secret, seller.id),
      layout: null,
    },
    owner.secret,
  )) as Answer;
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  placeChest();
  const offer = (await svc.call(
    '/v1/homes/transfer',
    {
      op: 'offer',
      mapId: MAP_ID,
      buildingKey: BUILDING_KEY,
      character: seller.id,
      to: 'Mara',
      price: 0,
      keepDecor: true,
      keepItems: false,
    },
    owner.secret,
  )) as Answer;
  assert.equal(offer.status, 200, JSON.stringify(offer.body));
  landBeforeBatch(svc.env.DB, /UPDATE homes SET player/, deposit);
  const accept = (await svc.call(
    '/v1/homes/transfer',
    { op: 'accept', id: offer.body.id, character: taker.id },
    buyer.secret,
  )) as Answer;
  assert.equal(accept.body.error, 'home-holds');
  const home = raw
    .prepare('SELECT player FROM homes WHERE map_id = ? AND building_key = ?')
    .get(MAP_ID, BUILDING_KEY) as { player: string };
  assert.equal(home.player, owner.id, 'the seller keeps the home');
  assert.equal(count('decor_bin'), 1, 'the deposit stands');
});
