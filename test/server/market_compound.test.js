// MARKET-COMPOUND (2026-10-29): THE MARKET'S HISTORY READ UNDER D1'S COMPOUND BOUND. Its "Your trades" read was one
// compound SELECT of six terms; D1 refuses more than five (workerd's sqlite.c++ setupSecurity), so every History read
// answered a 500 on D1 while node:sqlite, bound at 500, passed every test. The read is two compounds of three now, the
// newest of both kept: over a database that refuses as D1 does, it answers - and answers the rows, in the order, that
// the six-term read gives over node:sqlite.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { d1, compoundTermsOf, D1_MAX_COMPOUND, standService, T0 } from '../accountDb.mjs';
import { newestTrades } from '../../server-account/src/market.js';
import { MARKET_TAX_PCT, MARKET_TITHE_PCT, MARKET_TRADES_SHOWN, MARKET_KEEP_DAYS } from '../../src/net/marketLaw.js';

const realNow = Date.now;
test.after(() => { Date.now = realNow; });

const DF = 17;
const HUBS = { [DF]: [207, 212], 23: [590, 166] };
const DAY_S = 86_400;

/** The History's trades as the read before MARKET-COMPOUND asked them: one compound of six terms, for the oracle. */
const SIX_TERMS = `SELECT 'bought' AS side, kind, material, provenance, units, price, total + courier AS total, at, currency FROM market_sales WHERE buyer = ?1 AND at > ?2
  UNION ALL SELECT 'sold', kind, material, provenance, units, price, MAX(0, total - tax - tithe - fee), at, currency FROM market_sales WHERE seller = ?1 AND at > ?2
  UNION ALL SELECT 'filled', 'material', material, NULL, units, price, pay, at, 'marks' FROM market_fills WHERE filler = ?1 AND at > ?2
  UNION ALL SELECT 'ordered', 'material', material, NULL, units, price, units * price, at, 'marks' FROM market_fills WHERE poster = ?1 AND at > ?2
  UNION ALL SELECT 'won', 'piece', NULL, a.provenance, 1, a.high, a.high + b.courier, a.closed_at, 'marks' FROM market_auctions a JOIN market_bids b ON b.id = a.high_bid
    WHERE a.state = 'sold' AND b.bidder = ?1 AND a.closed_at > ?2
  UNION ALL SELECT 'auctioned', 'piece', NULL, provenance, 1, high, high - (high * ${MARKET_TAX_PCT}) / 100 - (high * ${MARKET_TITHE_PCT}) / 100 - tithe, closed_at, 'marks' FROM market_auctions
    WHERE state = 'sold' AND seller = ?1 AND closed_at > ?2
  ORDER BY at DESC LIMIT ${MARKET_TRADES_SHOWN}`;

/** Trades of every side for `me` with `other`, `perSide` of each, their times `at(i)` - ties across sides included. */
function seedTrades(raw, me, other, perSide, at) {
  let n = 0;
  const sale = (buyer, seller, when) => raw.prepare(`INSERT INTO market_sales (buyer, rid, char_id, listing, seller, kind, material, provenance, units, price, total, tax,
    courier, from_region, to_region, arrives_at, delivered, at, day, n) VALUES (?, ?, 'c', 'l', ?, 'material', 'ore:iron', NULL, ?, 3, ?, 1, 2, 17, 17, ?, 1, ?, 1, 'n')`)
    .run(buyer, `r${++n}`, seller, 1 + (n % 4), 10 + n, when, when);
  const fill = (filler, poster, when) => raw.prepare(`INSERT INTO market_fills (filler, rid, char_id, order_id, poster, material, units, price, pay, tax, at, day, n)
    VALUES (?, ?, 'c', 'o', ?, 'ore:iron', ?, 4, ?, 1, ?, 1, 'n')`).run(filler, `f${++n}`, poster, 1 + (n % 3), 20 + n, when);
  const auction = (seller, bidder, when) => {
    const id = `a${++n}`;
    raw.prepare(`INSERT INTO market_auctions (id, seller, char_id, region, provenance, wear, opening, fee, high, high_bid, bids, at, ends_at, state, closed_at, rid, n)
      VALUES (?, ?, 'c', 17, ?, 100, 10, 1, ?, ?, 1, ?, ?, 'sold', ?, ?, 'n')`).run(id, seller, String(n).padStart(16, '0'), 50 + n, `b${n}`, when - 10, when, when, `ar${n}`);
    raw.prepare(`INSERT INTO market_bids (id, auction, bidder, char_id, region, amount, courier, state, at, rid, n) VALUES (?, ?, ?, 'c', 17, ?, 3, 'won', ?, ?, 'n')`)
      .run(`b${n}`, id, bidder, 50 + n, when - 5, `br${n}`);
  };
  for (let i = 0; i < perSide; i++) {
    sale(me, other, at(i));
    sale(other, me, at(i));
    fill(me, other, at(i));
    fill(other, me, at(i));
    auction(other, me, at(i));
    auction(me, other, at(i));
  }
}

async function stand() {
  Date.now = () => T0 * 1000;
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', BOARD_OPEN: 'on', DB: d1() });
  const me = await s.registered('Mac');
  const other = await s.registered('Ann');
  const read = () => s.call('/v1/market/read', { character: me.character, region: DF, view: 'history', hubs: HUBS }, me.secret);
  const sixTerms = () => s.env.DB._raw.prepare(SIX_TERMS).all(me.id, T0 - MARKET_KEEP_DAYS * DAY_S)
    .map((r) => ({ side: r.side, kind: r.kind, material: r.material ?? null, provenance: r.provenance ?? null, units: Number(r.units), price: Number(r.price),
      total: Number(r.total), at: Number(r.at), currency: r.currency === 'gold' ? 'gold' : 'marks' }));
  return { s, me, other, read, sixTerms };
}

test('MARKET-COMPOUND d1() refuses as D1 does, for every test: five terms pass, six are refused, a quoted UNION and one in a nested compound counted apart (mutant: the bound at six)', () => {
  const chain = (n) => Array.from({ length: n }, (_, i) => `SELECT ${i}`).join(' UNION ALL ');
  assert.equal(D1_MAX_COMPOUND, 5);
  const db = d1();
  assert.doesNotThrow(() => db.prepare(chain(5)));
  assert.throws(() => db.prepare(chain(6)), /too many terms in compound SELECT/);
  assert.equal(compoundTermsOf(`SELECT 'a UNION b' UNION SELECT 1`), 2, 'a quoted UNION is no term');
  assert.equal(compoundTermsOf(`SELECT x FROM t WHERE x IN (${chain(3)}) OR x IN (${chain(3)})`), 3, 'two compounds of three are three');
});

test('MARKET-COMPOUND the History read answers under D1\'s bound, its trades the six-term read\'s - every side, past the shown count, ties across sides in the terms\' order (mutants: the merge\'s sort reversed, a side\'s term dropped)', async () => {
  const { s, me, other, read, sixTerms } = await stand();
  // four of each side: 24 trades, past the 20 shown; each side's i-th trade at the same second as every other side's
  seedTrades(s.env.DB._raw, me.id, other.id, 4, (i) => T0 - 100 * (i + 1));
  const r = await read();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const expected = sixTerms();
  assert.equal(expected.length, MARKET_TRADES_SHOWN);
  assert.deepEqual(new Set(expected.map((t) => t.side)), new Set(['bought', 'sold', 'filled', 'ordered', 'won', 'auctioned']));
  assert.deepEqual(r.body.trades, expected);
});

test('MARKET-COMPOUND the History read keeps the newest when the second compound holds them all', async () => {
  const { s, me, other, read, sixTerms } = await stand();
  // the newest 20 all in the second compound (ordered, won, auctioned), older ones in the first
  seedTrades(s.env.DB._raw, me.id, other.id, 7, (i) => T0 - 1000 - i);
  s.env.DB._raw.prepare('UPDATE market_sales SET at = at - 5000').run();
  s.env.DB._raw.prepare('UPDATE market_fills SET at = at - 5000 WHERE filler = ?').run(me.id);
  const r = await read();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.trades, sixTerms());
  assert.ok(r.body.trades.every((t) => ['ordered', 'won', 'auctioned'].includes(t.side)), JSON.stringify(r.body.trades.map((t) => t.side)));
});

test('MARKET-COMPOUND newestTrades: the newest of both, at most the shown count, an equal time kept in the order given', () => {
  const at = (side, t) => ({ side, at: t });
  assert.deepEqual(newestTrades([at('a', 5), at('b', 3)], [at('c', 5), at('d', 4)]).map((t) => t.side), ['a', 'c', 'd', 'b']);
  const many = Array.from({ length: MARKET_TRADES_SHOWN }, (_, i) => at(`x${i}`, 100 - i));
  assert.equal(newestTrades(many, many).length, MARKET_TRADES_SHOWN);
});
