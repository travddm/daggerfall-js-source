// @ts-check
// Study prototype: does Kysely's typing reach plain JS through JSDoc? Each line below must fail to typecheck.
/** @typedef {import('../src/sql/schema-types.js').Database} Database */
/** @param {import('kysely').Kysely<Database>} k */
export function probe(k) {
  k.selectFrom('market_orders').select(['no_such_column']);
  k.selectFrom('no_such_table').selectAll();
  k.updateTable('market_orders').set({ escrow: 'text, not a number' });
}

// Drizzle, with one dialect's tables named directly (no runtime switch): each line below must fail too.
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import { sqliteTables } from '../src/sql/drizzle-schema.js';
export function drizzleProbe() {
  const d = drizzle(async () => ({ rows: [] }));
  const o = sqliteTables.marketOrders;
  d.select({ x: o.noSuchColumn }).from(o);
  d.update(o).set({ escrow: 'text, not a number' });
  d.select().from(o).where(eq(o.escrow, 'text'));
}
