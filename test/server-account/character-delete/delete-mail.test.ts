// The mail a delete writes is planned from the snapshot alone: these run the planner on hand-made snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot } from '../../../server-account/src/character-delete/character-snapshot.ts';
import { POST_MATERIAL_MAX, POST_MATERIALS_MAX } from '../../../src/net/postLaw.js';

type Row = Record<string, unknown>;
type Material = { material: string; origin: string; qty: number };
type MailPlan = {
  mail: { to: string; item: Row | null; gold: number; materials: Material[] }[];
  warnings: { code: string; count: number }[];
};

// Loaded by computed paths: a static import would pull the item and home laws, and the crypto they reach, into the
// TypeScript check.
const load = async <T>(path: string): Promise<T> => (await import(new URL(path, import.meta.url).href)) as T;
const { planDeleteMail, rentRefunds } = await load<{
  planDeleteMail: (
    snapshot: Snapshot,
    options: { player: string; name: string; nowS: number; guildGold: number },
  ) => MailPlan;
  rentRefunds: (homes: Row[], tenants: Row[], nowS: number) => { refunds: Map<string, number>; left: number };
}>('../../../server-account/src/character-delete/delete-mail.ts');
const RENT_DAY_S = 86_400;

const NOW = 1_800_000_000;
const ACCOUNT = 'account-1';

function emptySnapshot(): Snapshot {
  return {
    homes: [],
    tenants: [],
    chestGoods: [],
    listings: [],
    auctions: [],
    escrowed: [],
    leadingBids: [],
    orders: [],
    commissions: [],
    onTheRoad: [],
    deliveries: [],
    saleGold: [],
    stores: [],
    guildPlace: [],
    record: [],
  };
}

const plan = (snapshot: Snapshot, guildGold = 0) =>
  planDeleteMail(snapshot, { player: ACCOUNT, name: 'Aldric', nowS: NOW, guildGold });

test('a character that holds nothing writes no mail and warns of nothing', () => {
  assert.deepEqual(plan(emptySnapshot()), { mail: [], warnings: [] });
});

test("each item is a piece of its own; coins in a chest, sale gold, rent left and a guild's gold are one gold piece with the materials", () => {
  const snapshot = emptySnapshot();
  const sword = { group: 'Weapons', templateIndex: 113, name: 'Longsword' };
  const coins = { group: 'Currency', templateIndex: 276, stackCount: 40 };
  snapshot.chestGoods = [{ item: JSON.stringify(sword) }, { item: JSON.stringify(coins) }];
  snapshot.saleGold = [{ gold: 100 }];
  snapshot.homes = [{ map_id: 1, building_key: 2, rent_due: 7 }];
  snapshot.stores = [{ material: 'metal:iron', origin: 'own', qty: 12 }];
  snapshot.listings = [{ id: 'l1', kind: 'material', material: 'metal:iron', own: 3, bought: 2, currency: 'gold' }];
  const { mail, warnings } = plan(snapshot, 500);
  assert.deepEqual(
    mail.map((piece) => [piece.to, piece.item?.name ?? null, piece.gold, piece.materials]),
    [
      [ACCOUNT, 'Longsword', 0, []],
      [
        ACCOUNT,
        null,
        40 + 100 + 7 + 500,
        [
          { material: 'metal:iron', origin: 'own', qty: 15 },
          { material: 'metal:iron', origin: 'gold', qty: 2 },
        ],
      ],
    ],
  );
  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ['items-mailed', 'gold-mailed', 'materials-mailed', 'market-cancelled'],
  );
});

test('materials are split so an empty Stores can always take a piece: one material at most POST_MATERIAL_MAX a piece', () => {
  const snapshot = emptySnapshot();
  snapshot.stores = [
    { material: 'metal:iron', origin: 'own', qty: 4000 },
    { material: 'metal:iron', origin: 'bought', qty: 3000 },
  ];
  const pieces = plan(snapshot).mail.map((piece) => piece.materials);
  assert.equal(pieces.length, 2);
  for (const piece of pieces) {
    assert.ok(piece.reduce((sum, entry) => sum + entry.qty, 0) <= POST_MATERIAL_MAX);
  }
  assert.equal(
    pieces.flat().reduce((sum, entry) => sum + entry.qty, 0),
    7000,
    'nothing lost in the split',
  );
});

test('a piece lists at most POST_MATERIALS_MAX materials', () => {
  const snapshot = emptySnapshot();
  snapshot.stores = Array.from({ length: POST_MATERIALS_MAX + 5 }, (_, n) => ({
    material: `herb:x${n}`,
    origin: 'own',
    qty: 1,
  }));
  const pieces = plan(snapshot).mail.map((piece) => piece.materials.length);
  assert.deepEqual(pieces, [POST_MATERIALS_MAX, 5]);
});

test('a bought piece that waits only as a provenance is lost, and the warning names it', () => {
  const snapshot = emptySnapshot();
  snapshot.deliveries = [{ id: 'd1', item: null, provenance: 'abcdefabcdef0123' }];
  assert.deepEqual(plan(snapshot), { mail: [], warnings: [{ code: 'goods-lost', count: 1 }] });
});

test("a tenant is refunded from the home's uncollected rent, at most the unused days at the current price", () => {
  const homes = [{ map_id: 1, building_key: 2, rent_due: 50 }];
  const tenants = [
    { map_id: 1, building_key: 2, room: 0, tenant: 'tenant-a', price: 10, until: NOW + 2 * RENT_DAY_S + 5 },
    { map_id: 1, building_key: 2, room: 1, tenant: 'tenant-b', price: 30, until: NOW + RENT_DAY_S },
  ];
  const { refunds, left } = rentRefunds(homes, tenants, NOW);
  assert.deepEqual(
    [...refunds],
    [
      ['tenant-a', 30],
      ['tenant-b', 20],
    ],
    'three days at 10, then what is left',
  );
  assert.equal(left, 0);
  const rich = rentRefunds([{ map_id: 1, building_key: 2, rent_due: 500 }], tenants, NOW);
  assert.deepEqual(
    [[...rich.refunds], rich.left],
    [
      [
        ['tenant-a', 30],
        ['tenant-b', 30],
      ],
      440,
    ],
  );
});
