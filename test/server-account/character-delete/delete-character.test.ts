// A realm character's delete over the real migrations: no row that names it survives unless the kept-records list
// names the column, and each settle rule sends goods, gold and refunds where they belong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DELETED_ROWS, CASCADED_ROWS, KEPT_ROWS } from '../../../server-account/src/character-delete/character-rows.ts';

type Row = Record<string, unknown>;
type Statement = {
  bind(...values: unknown[]): Statement;
  first(): Promise<Row | null>;
  all(): Promise<{ results: Row[] }>;
  run(): Promise<{ meta: { changes: number } }>;
  result(): { results: Row[]; meta: { changes: number } };
};
type Database = {
  raw: DatabaseSync;
  prepare(sql: string): Statement;
  batch(steps: Statement[]): Promise<{ results: Row[] }[]>;
};
type Answer = { ok?: boolean; error?: string; warnings?: { code: string; count: number }[] };

// Loaded by computed paths: a static import would pull the whole account service into the TypeScript check.
const load = async <T>(path: string): Promise<T> => (await import(new URL(path, import.meta.url).href)) as T;
const { deleteCharacter } = await load<{
  deleteCharacter: (
    ctx: { db: Database; bucket: unknown; nowS: number },
    player: string,
    id: string,
  ) => Promise<Answer>;
}>('../../../server-account/src/character-delete/delete-character.ts');
const { createGuest } = await load<{ createGuest: (ctx: object, body: object) => Promise<{ id: string }> }>(
  '../../../server-account/src/accounts.js',
);
const { createRealm } = await load<{
  createRealm: (ctx: object, player: string, body: object) => Promise<{ id: string }>;
}>('../../../server-account/src/realm.js');

const T0 = 1_800_000_000;
const MIGRATIONS = new URL('../../../server-account/migrations/', import.meta.url);
const rand = (bytes: Uint8Array): Uint8Array => globalThis.crypto.getRandomValues(bytes);

/** D1's surface over node:sqlite, with its batch as one transaction. */
function d1(): Database {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    raw.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  const prepare = (sql: string): Statement => {
    const statement = raw.prepare(sql);
    let values: unknown[] = [];
    const api: Statement = {
      bind(...bound) {
        values = bound;
        return api;
      },
      async first() {
        return (statement.get(...(values as never[])) as Row | undefined) ?? null;
      },
      async all() {
        return { results: statement.all(...(values as never[])) as Row[] };
      },
      async run() {
        return { meta: { changes: Number(statement.run(...(values as never[])).changes) } };
      },
      result() {
        if (statement.columns().length > 0)
          return { results: statement.all(...(values as never[])) as Row[], meta: { changes: 0 } };
        return { results: [], meta: { changes: Number(statement.run(...(values as never[])).changes) } };
      },
    };
    return api;
  };
  return {
    raw,
    prepare,
    async batch(steps) {
      raw.exec('BEGIN');
      try {
        const out = steps.map((step) => step.result());
        raw.exec('COMMIT');
        return out;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

type World = { db: Database; player: string; other: string; character: string; kept: string; otherCharacter: string };

/** Two accounts: the deleting one with the character and a second character, and another player's. */
async function world(): Promise<World> {
  const db = d1();
  const guest = async () =>
    (await createGuest({ db, subtle: globalThis.crypto.subtle, rand, nowS: T0 }, { deviceLabel: null })).id;
  const player = await guest();
  const other = await guest();
  const character = (await createRealm({ db, rand, nowS: T0 }, player, { name: 'Aldric' })).id;
  const kept = (await createRealm({ db, rand, nowS: T0 }, player, { name: 'Kept' })).id;
  const otherCharacter = (await createRealm({ db, rand, nowS: T0 }, other, { name: 'Other' })).id;
  // A checkpoint the judge read, so the character may move its goods
  db.raw.prepare('UPDATE realm_characters SET judged_seq = 0').run();
  return { db, player, other, character, kept, otherCharacter };
}

const count = (db: Database, sql: string, ...values: unknown[]): number =>
  Number((db.raw.prepare(sql).get(...(values as never[])) as Row).n);

const homeAt = (w: World, mapId: number, key: number, owner = w.player, character = w.character): void => {
  w.db.raw
    .prepare(
      `INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, entry, price, bought_at, paid)
        VALUES (?, ?, ?, ?, 'n', 1, 'private', 100, ?, 100)`,
    )
    .run(mapId, key, owner, character, T0);
};

const mailOf = (w: World, to: string): Row[] =>
  w.db.raw.prepare('SELECT item, gold, materials FROM server_post WHERE to_id = ? ORDER BY batch').all(to) as Row[];

const CHARACTER_COLUMN = /^(char_id|character_id|claimed_by|.*_char)$/;

test('every column that can name a character is on the delete list, a cascade, or the kept-records list with a reason', () => {
  const db = d1();
  const tables = (
    db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Row[]
  ).map((row) => String(row.name));
  const listed = new Set(
    [...DELETED_ROWS, ...CASCADED_ROWS, ...KEPT_ROWS].map((entry) => `${entry.table}.${entry.column}`),
  );
  const homeListed = new Set(
    [...DELETED_ROWS, ...CASCADED_ROWS].filter((e) => e.column === 'home').map((e) => e.table),
  );
  const unlisted: string[] = [];
  for (const table of tables) {
    if (table === 'realm_characters') continue;
    const columns = (db.raw.prepare(`PRAGMA table_info("${table}")`).all() as Row[]).map((row) => String(row.name));
    for (const column of columns) {
      if (CHARACTER_COLUMN.test(column) && !listed.has(`${table}.${column}`)) unlisted.push(`${table}.${column}`);
    }
    const homeKeyed = columns.includes('map_id') && columns.includes('building_key');
    // Kept by the building, or settled by their own writers: the decor counters stay as a sale leaves them, an offer
    // is cancelled, and another player's festival offering at its door is credited back by the festival's own sweep
    const kept = [
      'decor_rev',
      'decor_batch_receipt',
      'home_offers',
      'seat_hall_decor',
      'home_yards',
      'home_yards_ver',
      'fest_offerings',
    ];
    if (homeKeyed && !homeListed.has(table) && !kept.includes(table) && table !== 'homes')
      unlisted.push(`${table} (home)`);
  }
  assert.deepEqual(unlisted, [], 'name each on the delete list, as a cascade, or as a kept record with its reason');
  for (const entry of KEPT_ROWS) assert.ok(entry.reason.length > 10, `${entry.table}.${entry.column} has a reason`);
});

/** Column names the seed fills with the deleting account, so a seeded row reads as the character's own. */
const ACCOUNT_COLUMNS = new Set([
  'player',
  'account',
  'seller',
  'poster',
  'bidder',
  'buyer',
  'owner',
  'filler',
  'dep_player',
  'taker',
]);

/**
 * One row in `table`, with `fixed` columns as given, every other key or required column filled with a value its CHECK
 * accepts. A CHECK refusal names the column and its allowed values, and the seed tries again with one of them.
 */
function seedRow(db: Database, table: string, fixed: Row, player: string, fill: { n: number }): void {
  const columns = db.raw.prepare(`PRAGMA table_info("${table}")`).all() as Row[];
  const values: Row = { ...fixed };
  for (let attempt = 0; attempt < 10; attempt++) {
    const names: string[] = [];
    const bound: unknown[] = [];
    for (const column of columns) {
      const name = String(column.name);
      let value: unknown;
      if (name in values) value = values[name];
      else if (ACCOUNT_COLUMNS.has(name)) value = player;
      else if (Number(column.pk) > 0 || (Number(column.notnull) === 1 && column.dflt_value == null)) {
        fill.n += 1;
        value = /INT|REAL|NUM/i.test(String(column.type)) ? fill.n : `v${fill.n}`;
      } else continue;
      names.push(`"${name}"`);
      bound.push(value);
    }
    try {
      db.raw
        .prepare(`INSERT INTO "${table}" (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
        .run(...(bound as never[]));
      return;
    } catch (error) {
      const check = /CHECK constraint failed: (.*)$/.exec(String((error as Error).message))?.[1] ?? '';
      let match: RegExpExecArray | null;
      if ((match = /^(\w+) IN \(([^)]*)\)/.exec(check)))
        values[match[1]] = JSON.parse(`[${match[2].replace(/'/g, '"')}]`)[0];
      else if ((match = /^(\w+) BETWEEN (-?\d+)/.exec(check))) values[match[1]] = Number(match[2]);
      else if ((match = /^(\w+) >= (-?\d+)/.exec(check))) values[match[1]] = Number(match[2]);
      else if ((match = /^length\((\w+)\) = (\d+)/.exec(check))) values[match[1]] = 'a'.repeat(Number(match[2]));
      else if ((match = /^json_valid\((\w+)\)/.exec(check))) values[match[1]] = '{}';
      else throw error;
    }
  }
  throw new Error(`no seed for ${table}`);
}

test('no row on the delete list or a cascade survives the delete; the kept records are left as they were', async () => {
  const w = await world();
  homeAt(w, 7, 77);
  const raw = w.db.raw;
  const fill = { n: 0 };
  const at = (entry: { table: string; column: string }): number =>
    entry.column === 'home'
      ? count(w.db, `SELECT COUNT(*) AS n FROM ${entry.table} WHERE map_id = 7 AND building_key = 77`)
      : count(w.db, `SELECT COUNT(*) AS n FROM ${entry.table} WHERE ${entry.column} = ?`, w.character);
  raw.exec('PRAGMA foreign_keys = OFF');
  raw
    .prepare(
      "INSERT INTO home_decor (map_id, building_key, id, model, place, placed_at) VALUES (7, 77, 'p1', 1, '{}', ?)",
    )
    .run(T0);
  for (const entry of [...DELETED_ROWS, ...CASCADED_ROWS]) {
    if (entry.table === 'homes' || entry.table === 'home_decor' || at(entry) > 0) continue;
    const home = entry.column === 'home' ? { map_id: 7, building_key: 77, piece_id: 'p1' } : {};
    // A guild place seeded as an ordinary member, and a wedding half naming the character from another player
    const extra: Row =
      entry.table === 'guild_members' ? { rank: 3 } : entry.table === 'realm_wed_halves' ? { player: w.other } : {};
    seedRow(
      w.db,
      entry.table,
      { ...home, ...extra, ...(entry.column === 'home' ? {} : { [entry.column]: w.character }) },
      w.player,
      fill,
    );
  }
  // Kept records: history the delete must leave as it is
  raw
    .prepare(
      "INSERT INTO prof_deposits (player, rid, char_id, material, qty, own, bought, gold, at, n) VALUES (?, 'r1', ?, 'metal:iron', 1, 1, 0, 0, ?, 'n')",
    )
    .run(w.player, w.character, T0);
  raw.exec('PRAGMA foreign_keys = ON');
  for (const entry of [...DELETED_ROWS, ...CASCADED_ROWS])
    assert.ok(at(entry) > 0, `${entry.table}.${entry.column} seeded`);

  const answer = await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  for (const entry of [...DELETED_ROWS, ...CASCADED_ROWS])
    assert.equal(at(entry), 0, `${entry.table}.${entry.column} left behind`);
  assert.equal(
    count(w.db, 'SELECT COUNT(*) AS n FROM prof_deposits WHERE char_id = ?', w.character),
    1,
    'history kept',
  );
  assert.equal(
    count(w.db, 'SELECT COUNT(*) AS n FROM realm_characters WHERE id = ?', w.kept),
    1,
    'the other character stands',
  );
});

test('its own market business is cancelled and its goods, sale gold and materials on the road come by mail; a bid on its auction is void', async () => {
  const w = await world();
  const raw = w.db.raw;
  const piece = { group: 'Weapons', templateIndex: 113, name: 'Longsword' };
  raw
    .prepare(
      `INSERT INTO market_listings (id, seller, char_id, region, kind, material, units, own, price, fee, at, expires_at, rid, n)
    VALUES ('L1', ?, ?, 0, 'material', 'metal:iron', 4, 4, 5, 1, ?, ?, 'rid-l1', 'n')`,
    )
    .run(w.player, w.character, T0, T0 + 9999);
  raw
    .prepare(
      `INSERT INTO market_listings (id, seller, char_id, region, kind, units, price, fee, at, expires_at, rid, n, currency, item)
    VALUES ('L2', ?, ?, 0, 'item', 1, 5, 1, ?, ?, 'rid-l2', 'n', 'gold', ?)`,
    )
    .run(w.player, w.character, T0, T0 + 9999, JSON.stringify(piece));
  raw.prepare('INSERT INTO market_gold (player, char_id, gold) VALUES (?, ?, 250)').run(w.player, w.character);
  raw
    .prepare(
      `INSERT INTO market_auctions (id, seller, char_id, region, provenance, wear, opening, fee, at, ends_at, rid, n, high, high_bid, bids)
    VALUES ('A1', ?, ?, 0, 'abcdefabcdef0123', 100, 10, 1, ?, ?, 'rid-a1', 'n', 20, 'B1', 1)`,
    )
    .run(w.player, w.character, T0, T0 + 9999);
  raw
    .prepare("INSERT INTO piece_escrow (provenance, player, char_id, item, at) VALUES ('abcdefabcdef0123', ?, ?, ?, ?)")
    .run(w.player, w.character, JSON.stringify({ ...piece, name: 'Fine Longsword' }), T0);
  raw
    .prepare(
      `INSERT INTO market_bids (id, auction, bidder, char_id, region, amount, courier, road, seconds, state, at, rid, n)
    VALUES ('B1', 'A1', ?, ?, 0, 20, 0, 0, 0, 'high', ?, 'rid-b1', 'n')`,
    )
    .run(w.other, w.otherCharacter, T0);
  // The piece's escrow ledger row, as the market writes one when a piece leaves its record
  seedRow(
    w.db,
    'item_uids',
    { uid: 'abcdefabcdef0123', player: w.player, char_id: w.character, state: 'escrow', at: T0 },
    w.player,
    { n: 0 },
  );

  const answer = await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.equal(
    count(w.db, "SELECT COUNT(*) AS n FROM item_uids WHERE uid = 'abcdefabcdef0123'"),
    0,
    'whoever claims the piece registers it, as a buyer does',
  );
  assert.deepEqual(
    (raw.prepare('SELECT id, state, returned FROM market_listings ORDER BY id').all() as Row[]).map((r) => [
      r.id,
      r.state,
      r.returned,
    ]),
    [
      ['L1', 'cancelled', 1],
      ['L2', 'cancelled', 1],
    ],
  );
  assert.equal(
    (raw.prepare("SELECT state FROM market_bids WHERE id = 'B1'").get() as Row).state,
    'void',
    "the other bidder's Marks come back on its next read",
  );
  const mail = mailOf(w, w.player);
  assert.deepEqual(
    mail.map((row) => [row.item ? JSON.parse(String(row.item)).name : null, row.gold, row.materials]),
    [
      ['Longsword', 0, null],
      ['Fine Longsword', 0, null],
      [null, 250, '[{"material":"metal:iron","origin":"own","qty":4}]'],
    ],
  );
  assert.ok(answer.warnings?.some((warning) => warning.code === 'bids-refunded'));
});

test('a tenant in its home is evicted and refunded from the held rent; the rest of the rent comes to the account', async () => {
  const w = await world();
  homeAt(w, 7, 77);
  w.db.raw.prepare('UPDATE homes SET rent_due = 100 WHERE map_id = 7').run();
  w.db.raw
    .prepare(
      `INSERT INTO home_rooms (map_id, building_key, room, anchor, price, listed, tenant, tenant_char, tenant_name, until)
      VALUES (7, 77, 0, '{}', 10, 1, ?, ?, 'Other', ?)`,
    )
    .run(w.other, w.otherCharacter, T0 + 3 * 86_400);
  const answer = await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.deepEqual(
    mailOf(w, w.other).map((row) => row.gold),
    [30],
    'three unused days at 10',
  );
  assert.deepEqual(
    mailOf(w, w.player).map((row) => row.gold),
    [70],
  );
  assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM home_rooms'), 0);
});

test('chest goods come by mail; a coin pile comes as gold', async () => {
  const w = await world();
  homeAt(w, 7, 77);
  const raw = w.db.raw;
  raw
    .prepare(
      "INSERT INTO home_decor (map_id, building_key, id, model, place, placed_at) VALUES (7, 77, 'p1', 1, '{}', ?)",
    )
    .run(T0);
  raw
    .prepare("INSERT INTO decor_bin (map_id, building_key, piece_id, uid, item) VALUES (7, 77, 'p1', 'u1', ?)")
    .run(JSON.stringify({ group: 'Weapons', templateIndex: 113, name: 'Dagger' }));
  raw
    .prepare("INSERT INTO decor_bin (map_id, building_key, piece_id, uid, item) VALUES (7, 77, 'p1', 'u2', ?)")
    .run(JSON.stringify({ group: 'Currency', templateIndex: 276, stackCount: 33 }));
  const answer = await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.deepEqual(
    mailOf(w, w.player).map((row) => [row.item ? JSON.parse(String(row.item)).name : null, row.gold]),
    [
      ['Dagger', 0],
      [null, 33],
    ],
  );
  assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM decor_bin'), 0);
});

test("a lone guildmaster's guild ends: its gold by mail, its Marks to the account; a guild with members is handed on", async () => {
  const w = await world();
  const raw = w.db.raw;
  raw
    .prepare(
      "INSERT INTO guilds (id, name, name_key, tag, ranks, treasury, realm_gold, founded_at) VALUES ('g1', 'G', 'g', 'GG', '[]', 400, 400, ?)",
    )
    .run(T0);
  raw
    .prepare(
      "INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, 'g1', 0, 'Aldric', ?)",
    )
    .run(w.player, w.character, T0);
  raw.prepare("INSERT INTO guild_marks (guild_id, balance) VALUES ('g1', 50)").run();
  const answer = await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.equal(count(w.db, "SELECT COUNT(*) AS n FROM guilds WHERE id = 'g1'"), 0);
  assert.equal(count(w.db, 'SELECT balance AS n FROM marks WHERE account = ?', w.player), 50);
  assert.deepEqual(
    mailOf(w, w.player).map((row) => row.gold),
    [400],
  );

  const w2 = await world();
  w2.db.raw
    .prepare(
      "INSERT INTO guilds (id, name, name_key, tag, ranks, treasury, founded_at) VALUES ('g2', 'H', 'h', 'HH', '[]', 0, ?)",
    )
    .run(T0);
  w2.db.raw
    .prepare(
      "INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, 'g2', 0, 'Aldric', ?)",
    )
    .run(w2.player, w2.character, T0);
  w2.db.raw
    .prepare(
      "INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, 'g2', 2, 'Other', ?)",
    )
    .run(w2.other, w2.otherCharacter, T0 + 1);
  assert.equal((await deleteCharacter({ db: w2.db, bucket: null, nowS: T0 + 10 }, w2.player, w2.character)).ok, true);
  assert.equal(
    count(w2.db, 'SELECT rank AS n FROM guild_members WHERE char_id = ?', w2.otherCharacter),
    0,
    'the next member leads',
  );
});

test('a lone guildmaster whose guild holds a vault is refused as a leave is', async () => {
  const w = await world();
  w.db.raw
    .prepare(
      "INSERT INTO guilds (id, name, name_key, tag, ranks, treasury, founded_at) VALUES ('g1', 'G', 'g', 'GG', '[]', 0, ?)",
    )
    .run(T0);
  w.db.raw
    .prepare(
      "INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, 'g1', 0, 'Aldric', ?)",
    )
    .run(w.player, w.character, T0);
  w.db.raw
    .prepare(
      "INSERT INTO guild_vault (guild_id, slot, rec, name, count, dep_player, dep_char, dep_name, at) VALUES ('g1', 0, '{}', 'x', 1, ?, ?, 'Aldric', ?)",
    )
    .run(w.player, w.character, T0);
  assert.deepEqual(await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character), {
    error: 'guild-vault',
  });
  assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM realm_characters WHERE id = ?', w.character), 1);
});

test('a held character whose delete would send goods is refused, and nothing moves', async () => {
  const w = await world();
  w.db.raw.prepare("UPDATE realm_characters SET held = 'law' WHERE id = ?").run(w.character);
  w.db.raw.prepare('INSERT INTO market_gold (player, char_id, gold) VALUES (?, ?, 90)').run(w.player, w.character);
  const answer = await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character);
  assert.equal(answer.error, 'trade-held');
  assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM server_post'), 0);
  assert.equal(count(w.db, 'SELECT gold AS n FROM market_gold WHERE char_id = ?', w.character), 90);
});

test('a sale that lands between the read and the batch refuses the delete, and nothing is written', async () => {
  const w = await world();
  w.db.raw.prepare('INSERT INTO market_gold (player, char_id, gold) VALUES (?, ?, 90)').run(w.player, w.character);
  const real = w.db.batch.bind(w.db);
  w.db.batch = async (steps) => {
    w.db.raw.prepare('UPDATE market_gold SET gold = gold + 10 WHERE char_id = ?').run(w.character);
    return real(steps);
  };
  assert.deepEqual(await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character), {
    error: 'delete-moved',
  });
  assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM server_post'), 0);
  assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM realm_characters WHERE id = ?', w.character), 1);
});

test('what it had with other players is closed: an offer of its home cancelled, a room it rented freed, its waiting trade refused', async () => {
  const w = await world();
  homeAt(w, 7, 77);
  homeAt(w, 8, 88, w.other, w.otherCharacter);
  const raw = w.db.raw;
  raw
    .prepare(
      `INSERT INTO home_offers (id, map_id, building_key, seller, seller_char, buyer, price, keep_decor, keep_items, rev, state, at, until)
    VALUES ('o1', 7, 77, ?, ?, ?, 10, 1, 1, 0, 'open', ?, ?)`,
    )
    .run(w.player, w.character, w.other, T0, T0 + 9999);
  raw
    .prepare(
      `INSERT INTO home_rooms (map_id, building_key, room, anchor, price, listed, tenant, tenant_char, tenant_name, until)
    VALUES (8, 88, 0, '{}', 5, 1, ?, ?, 'Aldric', ?)`,
    )
    .run(w.player, w.character, T0 + 9999);
  raw
    .prepare(
      "INSERT INTO realm_trades (sid, a_player, a_char, a_lease, a_seq, a_half, state, created_at) VALUES ('s1', ?, ?, 'l', 0, '{}', 'waiting', ?)",
    )
    .run(w.player, w.character, T0);
  assert.equal((await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character)).ok, true);
  assert.equal((raw.prepare("SELECT state FROM home_offers WHERE id = 'o1'").get() as Row).state, 'cancelled');
  assert.equal((raw.prepare('SELECT tenant_char FROM home_rooms WHERE map_id = 8').get() as Row).tenant_char, null);
  assert.equal((raw.prepare("SELECT state FROM realm_trades WHERE sid = 's1'").get() as Row).state, 'refused');
});

test('the Marks its orders, commissions and bids held come back to each account in the delete itself', async () => {
  const w = await world();
  const fill = { n: 0 };
  const open = { state: 'open', returned: 0, at: T0, expires_at: T0 + 9999 };
  seedRow(
    w.db,
    'market_orders',
    { ...open, id: 'O1', poster: w.player, char_id: w.character, escrow: 30 },
    w.player,
    fill,
  );
  seedRow(
    w.db,
    'commissions',
    { ...open, id: 'C1', poster: w.player, poster_char: w.character, pay: 20 },
    w.player,
    fill,
  );
  // Its leading bid on another player's auction, and another player's bid on its own
  seedRow(
    w.db,
    'market_auctions',
    {
      ...open,
      id: 'A2',
      provenance: '2222222222222222',
      seller: w.other,
      char_id: w.otherCharacter,
      high: 15,
      high_bid: 'B2',
      bids: 1,
      ends_at: T0 + 9999,
    },
    w.player,
    fill,
  );
  seedRow(
    w.db,
    'market_bids',
    {
      id: 'B2',
      auction: 'A2',
      bidder: w.player,
      char_id: w.character,
      state: 'high',
      amount: 15,
      courier: 0,
      returned: 0,
      at: T0,
    },
    w.player,
    fill,
  );
  seedRow(
    w.db,
    'market_auctions',
    {
      ...open,
      id: 'A1',
      provenance: '1111111111111111',
      seller: w.player,
      char_id: w.character,
      high: 25,
      high_bid: 'B1',
      bids: 1,
      ends_at: T0 + 9999,
    },
    w.player,
    fill,
  );
  seedRow(
    w.db,
    'market_bids',
    {
      id: 'B1',
      auction: 'A1',
      bidder: w.other,
      char_id: w.otherCharacter,
      state: 'high',
      amount: 25,
      courier: 0,
      returned: 0,
      at: T0,
    },
    w.player,
    fill,
  );

  const answer = await deleteCharacter({ db: w.db, bucket: null, nowS: T0 + 10 }, w.player, w.character);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.equal(
    count(w.db, 'SELECT balance AS n FROM marks WHERE account = ?', w.player),
    30 + 20 + 15,
    'its order, commission and bid',
  );
  assert.equal(
    count(w.db, 'SELECT balance AS n FROM marks WHERE account = ?', w.other),
    25,
    "the other bidder's bid on its auction",
  );
  assert.deepEqual(
    (
      w.db.raw
        .prepare(
          "SELECT 'order' AS k, returned FROM market_orders UNION ALL SELECT 'commission', returned FROM commissions UNION ALL SELECT id, returned FROM market_bids ORDER BY 1",
        )
        .all() as Row[]
    ).map((row) => [row.k, row.returned]),
    [
      ['B1', 1],
      ['B2', 1],
      ['commission', 1],
      ['order', 1],
    ],
  );
  assert.deepEqual(
    { ...w.db.raw.prepare("SELECT high, high_bid FROM market_auctions WHERE id = 'A2'").get() },
    { high: null, high_bid: null },
    'the auction it led reopens',
  );
});
