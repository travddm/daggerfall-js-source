// @ts-check
// Study prototype: does Kysely's typing reach plain JS through JSDoc? Each line below must fail to typecheck.
/** @typedef {import('../src/sql/schema-types.js').Database} Database */
/** @param {import('kysely').Kysely<Database>} k */
export function probe(k) {
  k.selectFrom('market_orders').select(['no_such_column']);
  k.selectFrom('no_such_table').selectAll();
  k.updateTable('market_orders').set({ escrow: 'text, not a number' });
}
