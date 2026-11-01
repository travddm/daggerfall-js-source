// The account service's schema: server-account/migrations/0001_schema.sql, and any numbered file after it, applied
// in order to node:sqlite as test/accountDb.mjs applies them. D1 is SQLite, so a statement that fails here fails on
// the deploy's `wrangler d1 migrations apply` too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from '../accountDb.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const MIGRATIONS = readdirSync(new URL('server-account/migrations/', ROOT)).filter((f) => f.endsWith('.sql')).sort();

/** Every table the service keeps. A new table is added here with the file that creates it. */
const TABLES = [
  'arena_attempts', 'arena_board_ver', 'arena_boards', 'arena_champions', 'arena_members', 'arena_pve', 'arena_pvp',
  'arena_renown', 'blocks', 'board_notes', 'board_notices', 'board_reports', 'broker_sales', 'commissions',
  'craft_writs', 'crew_signed', 'decor_access', 'decor_batch_receipt', 'decor_bin', 'decor_hold', 'decor_rev',
  'duel_results', 'encounter_reactions', 'fest_finds', 'fest_offerings', 'fest_sales', 'fest_takes', 'firmament',
  'firmament_sets', 'gate_kills', 'grant_batches', 'grant_rows', 'grant_tallies', 'guild_castles',
  'guild_contract_pays', 'guild_contracts', 'guild_deed_marks', 'guild_fealty', 'guild_invites', 'guild_ledger',
  'guild_marks', 'guild_members', 'guild_notes', 'guild_pacts', 'guild_prof_stores', 'guild_renames',
  'guild_store_ledger', 'guild_store_moves', 'guild_vault', 'guild_vault_log', 'guild_writ_budgets',
  'guild_writ_fills', 'guild_writs', 'guilds', 'hall_writ_days', 'home_decor', 'home_hidden', 'home_moves',
  'home_offers', 'home_rooms', 'home_votes', 'home_yards', 'home_yards_ver', 'homes', 'homes_gen', 'hunt_clears',
  'item_census', 'item_census_days', 'item_dupes', 'item_uids', 'letters', 'lineages', 'market_auction_reports',
  'market_auctions', 'market_bids', 'market_deliveries', 'market_fills', 'market_gold', 'market_gold_prices',
  'market_listings', 'market_orders', 'market_patron_sales', 'market_prices', 'market_reports', 'market_sales',
  'market_vendor_boards', 'market_vendor_ver', 'marks', 'marks_ledger', 'mod_actions', 'mod_ai_days', 'mod_case_lines',
  'mod_cases', 'mod_feed', 'mod_reports', 'motherlode_days', 'motherlode_strikes', 'motherlodes', 'node_harvests',
  'npc_chapter_backing', 'npc_chapter_history', 'npc_chapter_merit', 'npc_chapter_patron_bids', 'npc_chapter_seats',
  'npc_chapter_weeks', 'npc_chapters', 'npc_hall_regions', 'npc_hall_strikes', 'npc_receipt_credits', 'npc_rep_events',
  'npc_roll', 'npc_roll_heads', 'piece_escrow', 'players', 'poi_assets', 'poi_docs', 'poi_feed', 'poi_rev_assets',
  'poi_revs', 'poi_shelf', 'poi_upload_days', 'private_reports', 'products', 'prof_brews', 'prof_carried',
  'prof_carried_gate', 'prof_choices', 'prof_crafts', 'prof_deposits', 'prof_disenchants', 'prof_masters',
  'prof_reforges', 'prof_silver_cloth', 'prof_smelts', 'prof_stock', 'prof_stores', 'prof_tempers', 'prof_tracks',
  'prof_unbruised', 'prof_withdrawals', 'progress_hours', 'progress_play', 'ql_steps', 'raid_cleanses', 'raid_spoils',
  'rate_limits', 'reaction_batches', 'realm_characters', 'realm_config', 'realm_faucets', 'realm_findings',
  'realm_repairs', 'realm_trades', 'realm_tx_guard', 'realm_unions', 'realm_wealth_hours', 'realm_wed_halves',
  'renown_accounts', 'renown_tracks', 'saves', 'sd_kills', 'sea_bounties', 'sea_bounty_owed', 'sea_kills',
  'sea_prizes', 'sea_season', 'sea_wrecks', 'seat_facts_kept', 'seat_hall_decor', 'serpent_kills', 'serpent_spoils',
  'server_post', 'sessions', 'staff_audit', 'staff_chat_lines', 'staff_chat_threads', 'staff_events', 'staff_evidence',
  'staff_foe_rows', 'staff_invites', 'staff_keys', 'staff_limits', 'staff_messages', 'staff_net_batches',
  'staff_net_rows', 'staff_notes', 'staff_sessions', 'staff_settings', 'staff_watch', 'star_spoils', 'stars_held',
  'town_domain_witness', 'town_econ_acts', 'town_econ_days', 'town_econ_kept', 'town_econ_seen', 'town_econ_struck',
  'town_econ_towns', 'town_seat_aftermath', 'town_seat_battles', 'town_seat_binds', 'town_seat_bounties',
  'town_seat_bouts', 'town_seat_camps', 'town_seat_edicts', 'town_seat_fields', 'town_seat_fort_held',
  'town_seat_fortifier', 'town_seat_forts', 'town_seat_gifts', 'town_seat_hires', 'town_seat_history',
  'town_seat_holds', 'town_seat_honours', 'town_seat_influence', 'town_seat_legacy', 'town_seat_levies',
  'town_seat_pledges', 'town_seat_red', 'town_seat_renown', 'town_seat_results', 'town_seat_ribbons',
  'town_seat_rights', 'town_seat_rosters', 'town_seat_royal', 'town_seat_royal_fields', 'town_seat_settling',
  'town_seat_stockpile', 'town_seat_titles', 'town_seat_weeks', 'town_seat_windows', 'wild_escrow', 'wild_falls',
  'wild_insurance', 'witness_confirmed', 'world_witness', 'writ_days', 'writs',
];

/** The account row's columns. A grant the service derives (titles.js) is never one of them. */
const PLAYER_COLUMNS = [
  'aura', 'ban_admin', 'ban_reason', 'banned_by', 'banned_until', 'conduct_v', 'created_at', 'email', 'fest_bowls',
  'fest_cakes', 'fest_given', 'fest_taken', 'fest_wares', 'first_played_at', 'freeze_live', 'freeze_rev', 'frozen_at',
  'frozen_by', 'frozen_reason', 'frozen_until', 'glyphs_off', 'guest_name', 'handle', 'handle_lc', 'icon', 'id',
  'insignia', 'insignia_spent', 'lamp_title', 'last_seen', 'legal_accepted_at', 'mute_admin', 'muted_by',
  'muted_until', 'name_as', 'password', 'patreon_at', 'patreon_status', 'patreon_tiers', 'patreon_user', 'played_at',
  'played_s', 'privacy_version', 'ql_titles', 'recovery_hash', 'registered_at', 'renown_hour', 'renown_hour_xp',
  'renown_last_credit', 'sd_honours', 'serpent_honours', 'staff_hide', 'staff_hide_on', 'staff_mod', 'staff_suspended',
  'terms_version', 'title',
];

const tablesOf = (raw) => raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
const columnsOf = (raw, table) => raw.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);

/** The service's source with its comments taken out, file by file. */
function serviceSources() {
  const dir = new URL('server-account/src/', ROOT);
  return readdirSync(dir).filter((f) => f.endsWith('.js'))
    .map((f) => ({ file: f, text: readFileSync(new URL(f, dir), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '') }));
}

test('the schema file is the first migration, numbered files follow it, and each applies cleanly in order with foreign keys on', () => {
  assert.equal(MIGRATIONS[0], '0001_schema.sql');
  MIGRATIONS.forEach((f, i) => assert.match(f, new RegExp(`^${String(i + 1).padStart(4, '0')}_[a-z0-9_]+\\.sql$`), `numbered in order, none skipped: ${f}`));
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const f of MIGRATIONS) assert.doesNotThrow(() => raw.exec(read(`server-account/migrations/${f}`)), f);
  assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(raw.prepare('PRAGMA integrity_check').all().map((r) => r.integrity_check), ['ok']);
});

test('the schema holds the service\'s tables, and the account row its columns', () => {
  const raw = d1()._raw;
  assert.deepEqual(tablesOf(raw), TABLES);
  assert.deepEqual(columnsOf(raw, 'players').sort(), PLAYER_COLUMNS);
  assert.deepEqual(raw.prepare("SELECT type, COUNT(*) AS n FROM sqlite_master WHERE type = 'view' GROUP BY type").all(), [], 'no views');
});

test('every table the service\'s SQL reads or writes exists, and every column an INSERT names is that table\'s', () => {
  const raw = d1()._raw;
  const tables = new Set(tablesOf(raw));
  const missing = [];
  let inserts = 0;
  for (const { file, text } of serviceSources()) {
    // A name a WITH clause defines is a query's own, not a table.
    const own = new Set([...text.matchAll(/\b([a-z][a-z0-9_]*)\s*(?:\([^)]*\))?\s+AS\s*\(/g)].map((m) => m[1]));
    for (const m of text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z][a-z0-9_]*)\b/g)) {
      const name = m[1];
      if (!tables.has(name) && !own.has(name) && name !== 'json_each' && name.length > 1) missing.push(`${file}: ${name}`);
    }
    for (const m of text.matchAll(/\bINSERT\s+(?:OR\s+[A-Z]+\s+)?INTO\s+([a-z][a-z0-9_]*)\s*\(([^)$]*)\)/g)) {
      if (!tables.has(m[1])) continue;
      const have = new Set(columnsOf(raw, m[1]));
      for (const col of m[2].split(',').map((c) => c.trim())) if (!have.has(col)) missing.push(`${file}: ${m[1]}.${col}`);
      inserts++;
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(inserts > 100, `the sweep read the service's INSERTs (${inserts})`);
});

test('the version counters the triggers raise stand seeded, and a write moves them', () => {
  const raw = d1()._raw;
  assert.deepEqual({ ...raw.prepare('SELECT id, ver FROM arena_board_ver').get() }, { id: 1, ver: 1 });
  assert.deepEqual({ ...raw.prepare('SELECT id, gen FROM homes_gen').get() }, { id: 1, gen: 0 });
  assert.deepEqual({ ...raw.prepare('SELECT k, v, at FROM poi_feed').get() }, { k: 'feed', v: 0, at: 0 });
  raw.prepare("INSERT INTO players (id, guest_name, created_at, last_seen) VALUES ('p1', 'Guest', 1, 1)").run();
  raw.prepare("INSERT INTO arena_members (player, banner, season, at) VALUES ('p1', 'red', 1, 1)").run();
  assert.equal(raw.prepare('SELECT ver FROM arena_board_ver WHERE id = 1').get().ver, 2, 'a member joined moves the arena board');
  for (const t of TABLES.filter((n) => !['arena_board_ver', 'homes_gen', 'poi_feed', 'players', 'arena_members'].includes(n))) {
    assert.equal(raw.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n, 0, `${t} starts empty`);
  }
});
