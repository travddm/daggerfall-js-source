// @ts-check
// Study prototype: the row shapes of the tables the converted modules touch, for Kysely's `Kysely<Database>` from
// JSDoc. A full move would generate this file from the schema (kysely-codegen) instead of writing it by hand.
// `Generated` marks a column the database fills (a default or a key), so an insert may leave it out.

/** @template T @typedef {import('kysely').Generated<T>} Generated */

/**
 * @typedef {{
 *   account: string, rid: string, kind: string, item: string | null, at: number,
 *   settled: Generated<number>, asked_by: string | null,
 * }} BrokerSalesTable
 * @typedef {{
 *   id: string, poster: string, char_id: string, region: number, material: string, units: number,
 *   left_units: number, price: number, escrow: number, at: number, expires_at: number, state: Generated<string>,
 *   closed_at: number | null, returned: Generated<number>, rid: string, n: string,
 * }} MarketOrdersTable
 * @typedef {{
 *   seq: Generated<number>, src_kind: string, src_id: string | null, dst_kind: string, dst_id: string | null, kind: string,
 *   amount: number, day: number, at: number, actor: string, who: string | null, rid: string,
 * }} MarksLedgerTable
 * @typedef {{ account: string, balance: number }} MarksTable
 * @typedef {{
 *   broker_sales: BrokerSalesTable,
 *   market_orders: MarketOrdersTable,
 *   marks_ledger: MarksLedgerTable,
 *   marks: MarksTable,
 * }} Database
 */

export {};
