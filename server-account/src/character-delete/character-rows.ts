// Every table that names a realm character, and what its delete does to each: the row goes, or it stays as a record
// with its reason. The survivor test reads both lists against the schema, so a new character column must be added to
// one of them.
import type { Database, Statement } from './character-snapshot.ts';

/** A row the delete removes. `where` binds ?1 the account and ?2 the character. */
export type DeletedRows = { table: string; column: string; where: string };

/** A column the delete leaves as it is, and why. */
export type KeptRows = { table: string; column: string; reason: string };

/** The character's own homes, as a home-keyed table's rows name them. */
const ITS_HOMES = (alias: string): string => `EXISTS (SELECT 1 FROM homes h WHERE h.map_id = ${alias}.map_id
  AND h.building_key = ${alias}.building_key AND h.player = ?1 AND h.char_id = ?2 AND h.guild_id IS NULL)`;

/**
 * Removed in the delete's batch, in this order. Rows keyed by one of the character's homes go before the homes
 * themselves; `homes` then takes `home_decor`, `home_hidden`, `home_rooms` and `home_votes` by its cascade, and
 * `home_decor` takes `decor_access` and `decor_hold`.
 */
export const DELETED_ROWS: readonly DeletedRows[] = [
  { table: 'decor_bin', column: 'home', where: ITS_HOMES('decor_bin') },
  { table: 'fest_takes', column: 'home', where: ITS_HOMES('fest_takes') },
  { table: 'fest_offerings', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'home_moves', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'decor_hold', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'homes', column: 'char_id', where: 'player = ?1 AND char_id = ?2 AND guild_id IS NULL' },
  { table: 'guild_members', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'renown_tracks', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'prof_stores', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'prof_tracks', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'prof_unbruised', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'prof_carried', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'prof_silver_cloth', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'firmament', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'hunt_clears', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'market_gold', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'piece_escrow', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'npc_roll', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'npc_roll_heads', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'npc_rep_events', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'npc_receipt_credits', column: 'char_id', where: 'player = ?1 AND char_id = ?2' },
  { table: 'npc_chapter_seats', column: 'char_id', where: 'account = ?1 AND char_id = ?2' },
  { table: 'realm_wed_halves', column: 'char_id', where: 'char_id = ?2' },
  { table: 'realm_wed_halves', column: 'partner_char', where: 'partner_char = ?2' },
  { table: 'item_dupes', column: 'char_id', where: 'char_id = ?2' },
];

/** Tables whose rows go by a declared cascade, named so the survivor test knows them. */
export const CASCADED_ROWS: readonly { table: string; column: string; from: string }[] = [
  { table: 'home_decor', column: 'home', from: 'homes' },
  { table: 'home_hidden', column: 'home', from: 'homes' },
  { table: 'home_rooms', column: 'home', from: 'homes' },
  { table: 'home_votes', column: 'home', from: 'homes' },
  { table: 'decor_access', column: 'home', from: 'home_decor' },
  { table: 'decor_hold', column: 'home', from: 'home_decor' },
  { table: 'item_census', column: 'char_id', from: 'realm_characters' },
  { table: 'realm_findings', column: 'char_id', from: 'realm_characters' },
  { table: 'realm_repairs', column: 'char_id', from: 'realm_characters' },
  { table: 'realm_wealth_hours', column: 'char_id', from: 'realm_characters' },
];

const RECEIPT = 'a receipt of a request already answered, so a repeated request is not paid twice';
const HISTORY = 'history other players and staff read; it outlives the character';

/** Columns that keep the character's id after the delete. Each is history, a receipt, evidence, or another's. */
export const KEPT_ROWS: readonly KeptRows[] = [
  ...[
    'prof_brews',
    'prof_choices',
    'prof_crafts',
    'prof_deposits',
    'prof_disenchants',
    'prof_masters',
    'prof_reforges',
    'prof_smelts',
    'prof_stock',
    'prof_tempers',
    'prof_withdrawals',
    'firmament_sets',
    'node_harvests',
    'motherlode_strikes',
    'guild_store_moves',
    'guild_writ_fills',
    'market_fills',
  ].map((table) => ({ table, column: 'char_id', reason: RECEIPT })),
  ...[
    'market_listings',
    'market_auctions',
    'market_bids',
    'market_orders',
    'market_sales',
    'market_deliveries',
    'market_patron_sales',
    'guild_contract_pays',
    'guild_deed_marks',
    'arena_renown',
    'raid_cleanses',
    'serpent_kills',
    'stars_held',
    'town_seat_binds',
    'town_seat_honours',
    'town_seat_influence',
    'town_seat_renown',
    'town_seat_rosters',
    'npc_chapter_backing',
    'npc_chapter_merit',
    'npc_chapter_history',
  ].map((table) => ({ table, column: 'char_id', reason: HISTORY })),
  { table: 'commissions', column: 'poster_char', reason: HISTORY },
  { table: 'commissions', column: 'filled_char', reason: HISTORY },
  { table: 'craft_writs', column: 'filled_char', reason: HISTORY },
  { table: 'writs', column: 'filled_char', reason: HISTORY },
  {
    table: 'guild_contracts',
    column: 'poster_char',
    reason: "a guild contract is the guild's; the poster is its history",
  },
  { table: 'guild_writs', column: 'poster_char', reason: "a guild writ is the guild's; the poster is its history" },
  {
    table: 'guild_prof_stores',
    column: 'dep_char',
    reason: "goods in a guild's Stores are the guild's; the depositor is a name",
  },
  { table: 'guild_store_ledger', column: 'dep_char', reason: HISTORY },
  {
    table: 'guild_vault',
    column: 'dep_char',
    reason: "a piece in a guild vault is the guild's; the depositor is a name",
  },
  { table: 'board_notes', column: 'char_id', reason: 'a board note stays until it expires: other players read it' },
  { table: 'guild_notes', column: 'char_id', reason: 'a guild note stays until it expires: other members read it' },
  {
    table: 'home_offers',
    column: 'seller_char',
    reason: 'a closed offer answers a repeated accept; an open one is cancelled',
  },
  {
    table: 'home_rooms',
    column: 'tenant_char',
    reason: "the delete frees a room it rented in another's home; the column is then empty",
  },
  { table: 'products', column: 'char_id', reason: 'the record of a crafted piece another player may now hold' },
  { table: 'item_uids', column: 'claim_char', reason: 'released by the delete (ledger.js releaseSteps)' },
  {
    table: 'item_uids',
    column: 'char_id',
    reason: 'a held piece is released by the delete; a piece in a chest or on the market keeps its row',
  },
  { table: 'item_dupes', column: 'first_char', reason: 'evidence of a copied piece: staff read it' },
  { table: 'staff_evidence', column: 'char_id', reason: 'evidence staff keep' },
  { table: 'realm_trades', column: 'a_char', reason: "a trade's record; a waiting one the delete started is refused" },
  { table: 'realm_trades', column: 'b_char', reason: "a trade's record" },
  {
    table: 'realm_unions',
    column: 'a_char',
    reason: "a union ends with the character; the other player's family page keeps it",
  },
  {
    table: 'realm_unions',
    column: 'b_char',
    reason: "a union ends with the character; the other player's family page keeps it",
  },
  { table: 'server_post', column: 'claimed_by', reason: 'which character claimed a piece of post: history' },
  {
    table: 'saves',
    column: 'character_id',
    reason: 'an offline copy, keyed by the classic character id; the delete leaves it',
  },
  { table: 'mod_cases', column: 'claimed_by', reason: 'a staff member, not a character' },
];

/** The batch steps that remove every row on the delete list. */
export function deletedRowSteps(db: Database, player: string, character: string): Statement[] {
  return DELETED_ROWS.map(({ table, where }) =>
    db.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(player, character),
  );
}

/**
 * The batch's last step: it refuses the batch when any row on the delete list, or any row a cascade should have
 * taken, still names the character.
 */
export function noRowLeftGuard(db: Database, player: string, character: string): Statement {
  const left = DELETED_ROWS.filter(({ column }) => column !== 'home').map(
    ({ table, where }) => `EXISTS (SELECT 1 FROM ${table} WHERE ${where})`,
  );
  left.push('EXISTS (SELECT 1 FROM realm_characters WHERE id = ?2 AND player = ?1)');
  return db
    .prepare(`INSERT INTO realm_tx_guard (moved, expected) SELECT 0, 1 WHERE ${left.join(' OR ')}`)
    .bind(player, character);
}
