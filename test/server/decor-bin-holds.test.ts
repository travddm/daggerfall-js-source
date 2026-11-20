// A shared chest's goods keep their piece: a write that would delete the piece, or the home and so its pieces, or make
// the piece no longer a container, refuses while the chest holds goods (server-account/src/decor-bin-holds.ts and the
// key in server-account/migrations/0012_decor_bin_piece_key.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by computed paths: Node's type pass would otherwise follow them into the account service, which it cannot type.
const accountDbModule = '../accountDb.mjs';
const realmSeatModule = '../realmSeat.mjs';
const homeLawModule = '../../src/net/homeLaw.js';
const accountClientModule = '../../src/net/accountClient.js';
const { standService } = await import(accountDbModule);
const { seatRealm } = await import(realmSeatModule);
const { HOME_ARENA_MAP_ID, HOME_ARENA_CELL } = await import(homeLawModule);
const { accountRefusalText } = await import(accountClientModule);

type Account = { secret: string; id: string };
type Answer = { status: number; body: { ok?: boolean; error?: string } };
type Count = { n: number };

const MAP_ID = 77;
const BUILDING_KEY = 3;
const CHARACTER = 'char-aldric';
const CHEST_PLACE = { pos: [1.5, 0, -2.25], rot: [90, 0, 0], scale: 1, light: null, storage: true, paid: 0 };

async function homeWithChest({ mapId = MAP_ID, buildingKey = BUILDING_KEY, character = CHARACTER, seat = false } = {}) {
  const svc = await standService();
  const owner = (await svc.registered('Aldric')) as Account;
  const raw = svc.env.DB._raw;
  const realm = seat ? await seatRealm(svc.env, owner.secret, 'Aldric') : null;
  const charId: string = realm ? realm.id : character;
  raw
    .prepare(
      `INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, price, bought_at)
       VALUES (?, ?, ?, ?, 'Aldric', 17, 1000, 1)`,
    )
    .run(mapId, buildingKey, owner.id, charId);
  raw
    .prepare(
      `INSERT INTO home_decor (map_id, building_key, id, model, place, placed_at) VALUES (?, ?, 'chest', 41000, ?, 1)`,
    )
    .run(mapId, buildingKey, JSON.stringify(CHEST_PLACE));
  const deposit = () =>
    raw
      .prepare(
        `INSERT INTO decor_bin (map_id, building_key, piece_id, uid, item) VALUES (?, ?, 'chest', 'u1', '{"uid":"u1"}')`,
      )
      .run(mapId, buildingKey);
  const empty = () => raw.prepare('DELETE FROM decor_bin').run();
  const count = (table: string): number => (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as Count).n;
  const call = (path: string, body: object) => svc.call(path, body, owner.secret) as Promise<Answer>;
  return { svc, owner, raw, realm, charId, deposit, empty, count, call };
}

test('the key refuses a delete of a piece whose bin holds goods', async () => {
  const { raw, deposit } = await homeWithChest();
  deposit();
  assert.throws(() => raw.prepare("DELETE FROM home_decor WHERE id = 'chest'").run(), /FOREIGN KEY/);
  assert.throws(() => raw.prepare('DELETE FROM homes').run(), /FOREIGN KEY/, 'nor through the cascade from the home');
});

test('a piece whose chest holds goods is not removed, and is once the chest is empty', async () => {
  const { deposit, empty, count, call } = await homeWithChest();
  deposit();
  const body = { mapId: MAP_ID, buildingKey: BUILDING_KEY, character: CHARACTER, id: 'chest' };
  const refused = await call('/v1/homes/decor/remove', body);
  assert.equal(refused.body.error, 'decor-holds');
  assert.deepEqual([count('home_decor'), count('decor_bin')], [1, 1]);
  empty();
  const removed = await call('/v1/homes/decor/remove', body);
  assert.equal(removed.body.ok, true, JSON.stringify(removed.body));
  assert.equal(count('home_decor'), 0);
});

test('a chest that holds goods is not moved into a piece that holds nothing; a move that keeps it a chest is', async () => {
  const { deposit, count, call } = await homeWithChest();
  deposit();
  const move = (storage: boolean) =>
    call('/v1/homes/decor/move', {
      mapId: MAP_ID,
      buildingKey: BUILDING_KEY,
      character: CHARACTER,
      id: 'chest',
      place: { ...CHEST_PLACE, id: 'chest', model: 41000, flat: null, pos: [2, 0, -2.25], storage },
    });
  const refused = await move(false);
  assert.equal(refused.body.error, 'decor-holds');
  const kept = await move(true);
  assert.equal(kept.body.ok, true, JSON.stringify(kept.body));
  assert.equal(count('decor_bin'), 1);
});

test('a home moved out of the arena keeps its place while its chests hold goods', async () => {
  const from = (HOME_ARENA_CELL[0] << 16) | (HOME_ARENA_CELL[1] << 8) | 1;
  const { deposit, count, call } = await homeWithChest({ mapId: HOME_ARENA_MAP_ID, buildingKey: from });
  deposit();
  const answer = await call('/v1/homes/arena-move', {
    mapId: HOME_ARENA_MAP_ID,
    from,
    to: (1 << 16) | (1 << 8) | 1,
    character: CHARACTER,
  });
  assert.equal(answer.body.error, 'home-holds');
  assert.deepEqual([count('homes'), count('home_decor'), count('decor_bin')], [1, 1, 1]);
});

test('a realm character whose home chest holds goods is not deleted', async () => {
  const { svc, realm, deposit, count, call } = await homeWithChest({ seat: true });
  deposit();
  const answer = await call('/v1/realm/delete', { id: realm.id });
  assert.equal(answer.body.error, 'realm-home-holds');
  assert.equal(answer.status, 409);
  assert.equal(
    accountRefusalText(answer.body.error),
    'Take the goods out of your home before you delete this character.',
  );
  const row = svc.env.DB._raw.prepare('SELECT obj FROM realm_characters WHERE id = ?').get(realm.id) as { obj: string };
  assert.ok(svc.env.SAVES._map.has(row.obj), 'its save stays');
  assert.deepEqual([count('homes'), count('decor_bin')], [1, 1]);
});

test('a guild hall whose chests hold goods is not sold', async () => {
  const svc = await standService();
  const master = await svc.registered('Gwen', { renown: 12 });
  assert.equal((await svc.found(master, { name: 'The Silver Hand', tag: 'SH' })).status, 200);
  const deposit = await svc.call(
    '/v1/guilds/deposit',
    { character: master.character, gold: 60_000, realm: master.at(), region: 17 },
    master.secret,
  );
  assert.equal(deposit.status, 200);
  const hall = { mapId: 7, buildingKey: 300, region: 17, price: 20_000, layout: null };
  const bought = await svc.call('/v1/guilds/hall/buy', { character: master.character, ...hall }, master.secret);
  assert.equal(bought.status, 200, JSON.stringify(bought.body));
  const raw = svc.env.DB._raw;
  raw
    .prepare(
      `INSERT INTO home_decor (map_id, building_key, id, model, place, placed_at) VALUES (7, 300, 'chest', 41000, ?, 1)`,
    )
    .run(JSON.stringify(CHEST_PLACE));
  raw
    .prepare(
      `INSERT INTO decor_bin (map_id, building_key, piece_id, uid, item) VALUES (7, 300, 'chest', 'u1', '{"uid":"u1"}')`,
    )
    .run();
  const sold = (await svc.call('/v1/guilds/hall/sell', { character: master.character }, master.secret)) as Answer;
  assert.equal(sold.body.error, 'home-holds');
  assert.equal(
    (raw.prepare('SELECT COUNT(*) AS n FROM homes WHERE map_id = 7').get() as Count).n,
    1,
    'the hall stands',
  );
});

test("a deed's hold given up as its deed sells takes its chests' goods with it", async () => {
  const { raw, deposit, count, call } = await homeWithChest();
  raw.prepare('UPDATE homes SET deed = 1').run();
  deposit();
  const answer = await call('/v1/homes/release', { mapId: MAP_ID, buildingKey: BUILDING_KEY, deed: true });
  assert.equal(answer.body.ok, true, JSON.stringify(answer.body));
  assert.deepEqual([count('homes'), count('home_decor'), count('decor_bin')], [0, 0, 0]);
});
