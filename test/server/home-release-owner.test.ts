// A home release names its owner: a caller who does not own the building changes nothing in it, and the owner's own
// release still clears its chest access and its open sale offer (server-account/src/homes.js releaseHome).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: Node's type pass would otherwise follow it into the account service, which it cannot type.
const accountDbModule = '../accountDb.mjs';
const { standService } = await import(accountDbModule);

type Account = { secret: string; id: string };
type Count = { n: number };

const MAP_ID = 77;
const BUILDING_KEY = 3;

async function homeWithChestAndOffer() {
  const svc = await standService();
  const owner = (await svc.registered('Aldric')) as Account;
  const stranger = (await svc.registered('Mara')) as Account;
  const raw = svc.env.DB._raw;
  // A home bought before the realm: its character id is no realm id, so its release takes the plain batch.
  raw
    .prepare(
      `INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, price, bought_at)
       VALUES (?, ?, ?, 'char-aldric', 'Aldric', 17, 1000, 1)`,
    )
    .run(MAP_ID, BUILDING_KEY, owner.id);
  // The chest itself, then its access rule: the rule's key names the piece
  raw
    .prepare(
      `INSERT INTO home_decor (map_id, building_key, id, model, place, placed_at) VALUES (?, ?, 'chest', 1, '{"storage":true}', 1)`,
    )
    .run(MAP_ID, BUILDING_KEY);
  raw
    .prepare(
      `INSERT INTO decor_access (map_id, building_key, piece_id, kind, mode) VALUES (?, ?, 'chest', 'storage', 'private')`,
    )
    .run(MAP_ID, BUILDING_KEY);
  raw
    .prepare(
      `INSERT INTO home_offers (id, map_id, building_key, seller, seller_char, buyer, price, keep_decor, keep_items, rev, state, at, until)
       VALUES ('offer-1', ?, ?, ?, 'char-aldric', ?, 500, 1, 0, 0, 'open', 1, 999999999999)`,
    )
    .run(MAP_ID, BUILDING_KEY, owner.id, stranger.id);
  const count = (table: string): number =>
    (
      raw
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE map_id = ? AND building_key = ?`)
        .get(MAP_ID, BUILDING_KEY) as Count
    ).n;
  const release = (who: Account) =>
    svc.call('/v1/homes/release', { mapId: MAP_ID, buildingKey: BUILDING_KEY }, who.secret) as Promise<{
      status: number;
      body: { ok?: boolean; error?: string };
    }>;
  return { owner, stranger, count, release };
}

test('a release by an account that does not own the building leaves its chest access and its open offer', async () => {
  const { stranger, count, release } = await homeWithChestAndOffer();
  const answer = await release(stranger);
  assert.equal(answer.body.error, 'no-home');
  assert.equal(count('homes'), 1, 'the home stands');
  assert.equal(count('decor_access'), 1, 'the chest keeps its access row, so it stays private');
  assert.equal(count('home_offers'), 1, 'the open offer stands');
});

test("the owner's release still clears the chest access and the open offer with the home", async () => {
  const { owner, count, release } = await homeWithChestAndOffer();
  const answer = await release(owner);
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.ok, true);
  assert.equal(count('homes'), 0);
  assert.equal(count('decor_access'), 0);
  assert.equal(count('home_offers'), 0);
});
