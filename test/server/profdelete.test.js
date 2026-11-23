// A realm character deleted takes its professions with it, over the real migrations
// (server-account/src/character-delete/delete-character.ts): its Stores and its professions' tracks go in the delete's one
// batch, another character's stay, the history stays. Its market business open is settled in the same batch, so none is
// left open after it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { createGuest } from '../../server-account/src/accounts.js';
import { createRealm, REALM_MARKET_OPEN_SQL } from '../../server-account/src/realm.js';
import { deleteCharacter } from '../../server-account/src/character-delete/delete-character.ts';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const { subtle } = globalThis.crypto;
const rand = (b) => globalThis.crypto.getRandomValues(b);
const MIGRATIONS = readdirSync(new URL('../../server-account/migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
/** D1's shape over node:sqlite: `batch` as ONE transaction. */
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of MIGRATIONS) db.exec(src(`server-account/migrations/${f}`));
  return {
    _raw: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
        _result() { return { results: stmt.all(...args), meta: { changes: 0 } }; },
      };
      return st;
    },
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((st) => st._result()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const T0 = 1_800_000_000;
const player = async (db) => (await createGuest({ db, subtle, rand, nowS: T0 }, { deviceLabel: null })).id;
const PV = 'abcdefabcdef0123';
const count = (db, sql, ...a) => db._raw.prepare(sql).get(...a).n;

/** The market's business a character can have open, each as its row stands open - and as it stands once settled. */
const BUSINESS = {
  'a listing standing': {
    open: (db, P, C) => db._raw.prepare(`INSERT INTO market_listings (id, seller, char_id, region, kind, material, units, price, fee, at, expires_at, rid, n)
      VALUES ('L1', ?, ?, 0, 'material', 'herb:rose', 1, 5, 1, ?, ?, 'rid-l1', 'n')`).run(P, C, T0, T0 + 86_400),
    settled: (db) => db._raw.prepare("UPDATE market_listings SET state = 'sold' WHERE id = 'L1'").run(),
  },
  'a listing expired, its goods not yet back': {
    open: (db, P, C) => db._raw.prepare(`INSERT INTO market_listings (id, seller, char_id, region, kind, material, units, price, fee, at, expires_at, state, closed_at, rid, n)
      VALUES ('L2', ?, ?, 0, 'material', 'herb:rose', 1, 5, 1, ?, ?, 'expired', ?, 'rid-l2', 'n')`).run(P, C, T0, T0 + 1, T0 + 1),
    settled: (db) => db._raw.prepare("UPDATE market_listings SET returned = 1 WHERE id = 'L2'").run(),
  },
  'an auction standing': {
    open: (db, P, C) => db._raw.prepare(`INSERT INTO market_auctions (id, seller, char_id, region, provenance, wear, opening, fee, at, ends_at, rid, n)
      VALUES ('A1', ?, ?, 0, ?, 1000, 10, 1, ?, ?, 'rid-a1', 'n')`).run(P, C, PV, T0, T0 + 86_400),
    settled: (db) => db._raw.prepare("UPDATE market_auctions SET state = 'sold', returned = 1 WHERE id = 'A1'").run(),
  },
  'an auction unsold, its piece not yet back': {
    open: (db, P, C) => db._raw.prepare(`INSERT INTO market_auctions (id, seller, char_id, region, provenance, wear, opening, fee, at, ends_at, state, closed_at, rid, n)
      VALUES ('A2', ?, ?, 0, ?, 1000, 10, 1, ?, ?, 'unsold', ?, 'rid-a2', 'n')`).run(P, C, PV, T0, T0 + 1, T0 + 1),
    settled: (db) => db._raw.prepare("UPDATE market_auctions SET returned = 1 WHERE id = 'A2'").run(),
  },
  'a leading bid': {
    open: (db, P, C, other) => {
      db._raw.prepare(`INSERT INTO market_auctions (id, seller, char_id, region, provenance, wear, opening, fee, at, ends_at, rid, n)
        VALUES ('A3', ?, 'char-othr', 0, ?, 1000, 10, 1, ?, ?, 'rid-a3', 'n')`).run(other, PV, T0, T0 + 86_400);
      db._raw.prepare(`INSERT INTO market_bids (id, auction, bidder, char_id, region, amount, at, rid, n) VALUES ('B1', 'A3', ?, ?, 0, 20, ?, 'rid-b1', 'n')`).run(P, C, T0);
    },
    settled: (db) => db._raw.prepare("UPDATE market_bids SET state = 'outbid' WHERE id = 'B1'").run(),   // its Marks come back to the ACCOUNT
  },
  'a buy order open': {
    open: (db, P, C) => db._raw.prepare(`INSERT INTO market_orders (id, poster, char_id, region, material, units, left_units, price, escrow, at, expires_at, rid, n)
      VALUES ('O1', ?, ?, 0, 'herb:rose', 5, 5, 3, 15, ?, ?, 'rid-o1', 'n')`).run(P, C, T0, T0 + 86_400),
    settled: (db) => db._raw.prepare("UPDATE market_orders SET state = 'cancelled' WHERE id = 'O1'").run(),   // its escrow the account's, returned or not
  },
  'a commission open': {
    open: (db, P, C) => db._raw.prepare(`INSERT INTO commissions (id, poster, poster_char, region, recipe, pay, at, expires_at, rid, n)
      VALUES ('K1', ?, ?, 0, 'dagger:iron', 50, ?, ?, 'rid-k1', 'n')`).run(P, C, T0, T0 + 86_400),
    settled: (db) => db._raw.prepare("UPDATE commissions SET state = 'expired' WHERE id = 'K1'").run(),
  },
  'materials on the road': {
    open: (db, P, C, other) => db._raw.prepare(`INSERT INTO market_sales (buyer, rid, char_id, listing, seller, kind, material, units, price, total, tax, from_region, to_region, arrives_at, at, day, n)
      VALUES (?, 'rid-s1', ?, 'L9', ?, 'material', 'herb:rose', 3, 2, 6, 0, 1, 0, ?, ?, 1, 'n')`).run(P, C, other, T0 + 600, T0),
    settled: (db) => db._raw.prepare("UPDATE market_sales SET delivered = 1 WHERE rid = 'rid-s1'").run(),
  },
  'a piece to collect': {
    open: (db, P, C) => db._raw.prepare(`INSERT INTO market_deliveries (id, player, char_id, provenance, wear, why, arrives_at, at)
      VALUES ('D1', ?, ?, ?, 1000, 'bought', ?, ?)`).run(P, C, PV, T0, T0),
    settled: (db) => db._raw.prepare("UPDATE market_deliveries SET collected = 1 WHERE id = 'D1'").run(),
  },
};

test('PROF-DELETE a realm character deleted takes its Stores and its professions\' tracks with it, in the one batch; another character\'s stay; the history stays (mutants: the Stores left behind; the tracks left behind; another character\'s taken)', async () => {
  const db = d1();
  const P = await player(db);
  const made = await createRealm({ db, rand, nowS: T0 }, P, { name: 'Nystul' });
  const keep = await createRealm({ db, rand, nowS: T0 }, P, { name: 'Tamsin' });
  for (const c of [made.id, keep.id]) {
    db._raw.prepare("INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, 'herb:rose', 'own', 34)").run(P, c);
    db._raw.prepare("INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at) VALUES (?, ?, 'herbalism', 1800, ?)").run(P, c, T0);
    db._raw.prepare("INSERT INTO prof_silver_cloth (player, char_id, material, qty) VALUES (?, ?, 'cloth:linen', 3)").run(P, c);   // AUDIT WOVEN-PAYS: the silver count
  }
  db._raw.prepare('UPDATE realm_characters SET judged_seq = 0').run();   // a checkpoint the judge read
  // history: a courier's load delivered long ago, a piece collected
  const other = await player(db);
  BUSINESS['materials on the road'].open(db, P, made.id, other);
  BUSINESS['materials on the road'].settled(db);
  assert.equal((await deleteCharacter({ db, bucket: null }, P, made.id)).ok, true);
  assert.deepEqual([count(db, 'SELECT COUNT(*) AS n FROM prof_stores WHERE char_id = ?', made.id), count(db, 'SELECT COUNT(*) AS n FROM prof_tracks WHERE char_id = ?', made.id)], [0, 0], 'its Stores and its tracks went with it');
  assert.deepEqual([count(db, 'SELECT COUNT(*) AS n FROM prof_stores WHERE char_id = ?', keep.id), count(db, 'SELECT COUNT(*) AS n FROM prof_tracks WHERE char_id = ?', keep.id)], [1, 1], 'another character\'s stay');
  assert.equal(count(db, 'SELECT COUNT(*) AS n FROM market_sales WHERE char_id = ?', made.id), 1, 'the history stays');
  assert.deepEqual([count(db, 'SELECT COUNT(*) AS n FROM prof_silver_cloth WHERE char_id = ?', made.id), count(db, 'SELECT COUNT(*) AS n FROM prof_silver_cloth WHERE char_id = ?', keep.id)], [0, 1], 'AUDIT WOVEN-PAYS: its cloth\'s silver count with it, another\'s kept');
  assert.equal(count(db, 'SELECT COUNT(*) AS n FROM realm_characters WHERE id = ?', made.id), 0);
});

test('PROF-DELETE a character with market business open is deleted, and the business is settled in the same batch - each of a listing standing or not yet handed back, an auction standing or not yet handed back, a leading bid, a buy order, a commission, materials on the road, a piece to collect; its objects dropped once the batch has committed', async () => {
  for (const [what, b] of Object.entries(BUSINESS)) {
    const db = d1();
    const P = await player(db);
    const other = await player(db);
    const made = await createRealm({ db, rand, nowS: T0 }, P, { name: 'Nystul' });
    db._raw.prepare("INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, 'herb:rose', 'own', 34)").run(P, made.id);
    db._raw.prepare('UPDATE realm_characters SET obj = ?, bytes = 10, judged_seq = 0 WHERE id = ?').run(`realm/${P}/${made.id}/1`, made.id);   // a save landed and judged
    b.open(db, P, made.id, other);
    const dropped = [];
    const bucket = { delete: async (k) => { dropped.push(k); }, list: async () => ({ objects: [] }) };
    const answer = await deleteCharacter({ db, bucket }, P, made.id);
    assert.equal(answer.ok, true, `${what}: ${JSON.stringify(answer)}`);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM realm_characters WHERE id = ?', made.id), 0, what);
    assert.equal(Number(db._raw.prepare(REALM_MARKET_OPEN_SQL).get(P, made.id).n), 0, `${what}: nothing left open`);
    assert.deepEqual(dropped, [`realm/${P}/${made.id}/1`], `${what}: its object dropped`);
  }
});
