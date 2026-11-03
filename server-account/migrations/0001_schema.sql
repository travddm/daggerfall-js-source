-- The account service's schema: every table, index and trigger the service reads and writes.
--
-- Apply it to an empty database with `npx wrangler d1 migrations apply daggerfall-accounts --remote`; the account
-- deploy runs that command, and D1's migration ledger applies each file once. A later change to the schema is a new
-- numbered file in this directory (0002_<what>.sql, 0003_..., in order), never an edit to this one, because a file
-- that was applied is not applied again.
--
-- The three INSERTs are version counters the service reads and raises but never inserts: arena_board_ver and
-- homes_gen are raised by the triggers below, poi_feed by the service's own UPDATE.

-- ==== Accounts, sign-in and mail ======================================================================================

-- One row per player account, guest or linked, with its chosen handle and account details.
CREATE TABLE players (
  id                 TEXT PRIMARY KEY,
  handle             TEXT,
  handle_lc          TEXT,
  guest_name         TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  last_seen          INTEGER NOT NULL,
  muted_until        INTEGER,
  password           TEXT,
  recovery_hash      TEXT,
  registered_at      INTEGER,
  email              TEXT,
  title              TEXT,
  played_s           INTEGER NOT NULL DEFAULT 0,
  played_at          INTEGER,
  muted_by           TEXT,
  renown_hour        INTEGER NOT NULL DEFAULT 0,
  renown_hour_xp     INTEGER NOT NULL DEFAULT 0,
  renown_last_credit INTEGER NOT NULL DEFAULT 0,
  terms_version      TEXT,
  privacy_version    TEXT,
  legal_accepted_at  INTEGER,
  insignia           TEXT,
  insignia_spent     INTEGER NOT NULL DEFAULT 0,
  aura               TEXT,
  patreon_user       TEXT,
  patreon_tiers      TEXT,
  patreon_status     TEXT,
  patreon_at         INTEGER,
  glyphs_off         TEXT,
  first_played_at    INTEGER,
  sd_honours         INTEGER NOT NULL DEFAULT 0,
  name_as            TEXT,
  lamp_title         INTEGER NOT NULL DEFAULT 0,
  serpent_honours    INTEGER NOT NULL DEFAULT 0,
  banned_until       INTEGER,
  ban_reason         TEXT,
  conduct_v          TEXT,
  ql_titles          INTEGER NOT NULL DEFAULT 0,
  fest_cakes         INTEGER NOT NULL DEFAULT 0,
  fest_bowls         INTEGER NOT NULL DEFAULT 0,
  fest_wares         TEXT NOT NULL DEFAULT '',
  fest_given         INTEGER NOT NULL DEFAULT 0,
  fest_taken         INTEGER NOT NULL DEFAULT 0,
  icon               TEXT,
  staff_mod          INTEGER NOT NULL DEFAULT 0,
  banned_by          TEXT,
  mute_admin         INTEGER,
  ban_admin          INTEGER,
  staff_suspended    INTEGER NOT NULL DEFAULT 0,
  staff_hide         INTEGER NOT NULL DEFAULT 1,
  frozen_until       INTEGER,
  frozen_reason      TEXT,
  frozen_by          TEXT,
  frozen_at          INTEGER,
  freeze_rev         INTEGER NOT NULL DEFAULT 0,
  freeze_live        INTEGER,
  staff_hide_on      INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_players_handle_lc ON players (handle_lc) WHERE handle_lc IS NOT NULL;
CREATE UNIQUE INDEX idx_players_patreon_user ON players (patreon_user) WHERE patreon_user IS NOT NULL;
CREATE INDEX idx_players_played ON players (played_at) WHERE handle IS NOT NULL;
CREATE INDEX players_banned ON players (banned_until, id) WHERE banned_until IS NOT NULL;
CREATE INDEX players_freeze_unlive ON players (frozen_at) WHERE freeze_live = 0;
CREATE INDEX players_frozen ON players (frozen_until) WHERE frozen_until IS NOT NULL;
CREATE INDEX players_guest_name ON players (guest_name) WHERE handle IS NULL;
CREATE INDEX players_handle_lc_id ON players (handle_lc, id) WHERE handle_lc IS NOT NULL;
CREATE INDEX players_staff_mod ON players (staff_mod) WHERE staff_mod = 1;

-- One row per account that has blocked another account, with when it was blocked.
CREATE TABLE blocks (
  player  TEXT NOT NULL,
  blocked TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (player, blocked),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per finished duel, naming the winner and loser accounts and when it ended.
CREATE TABLE duel_results (
  loser  TEXT NOT NULL,
  winner TEXT NOT NULL,
  at     INTEGER NOT NULL,
  rk     TEXT,
  FOREIGN KEY (loser) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (winner) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_duel_loser ON duel_results (loser, at);
CREATE UNIQUE INDEX idx_duel_rk ON duel_results (rk) WHERE rk IS NOT NULL;
CREATE INDEX idx_duel_winner ON duel_results (winner, at);

-- One row per letter sent to a player: sender, subject, body, send time and when it was read.
CREATE TABLE letters (
  id        TEXT PRIMARY KEY,
  to_id     TEXT NOT NULL,
  from_id   TEXT NOT NULL,
  from_name TEXT NOT NULL,
  subject   TEXT NOT NULL,
  body      TEXT NOT NULL,
  sent_at   INTEGER NOT NULL,
  read_at   INTEGER,
  FOREIGN KEY (to_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_letters_to ON letters (to_id, sent_at DESC);

-- One row per dead character's line: its surname, model and record, kept for heirs.
CREATE TABLE lineages (
  player     TEXT NOT NULL,
  id         TEXT NOT NULL,
  surname    TEXT NOT NULL,
  model      TEXT NOT NULL,
  record     TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player, id)
);

-- One row per account: its Marks balance.
CREATE TABLE marks (
  account TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0 AND balance <= 10000000),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per Marks transfer: source, destination, kind, amount and time.
CREATE TABLE marks_ledger (
  seq      INTEGER PRIMARY KEY,
  src_kind TEXT NOT NULL CHECK (src_kind IN ('mint', 'account', 'guild', 'escrow')),
  src_id   TEXT,
  dst_kind TEXT NOT NULL CHECK (dst_kind IN ('burn', 'account', 'guild', 'escrow')),
  dst_id   TEXT,
  kind     TEXT NOT NULL,
  amount   INTEGER NOT NULL CHECK (amount > 0),
  day      INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  actor    TEXT NOT NULL,
  who      TEXT,
  rid      TEXT NOT NULL,
  UNIQUE (actor, rid)
);
CREATE INDEX idx_marks_day ON marks_ledger (day);
CREATE INDEX idx_marks_dst ON marks_ledger (dst_id, kind, day);
CREATE INDEX idx_marks_ledger_escrow ON marks_ledger (dst_kind, src_kind, amount) WHERE dst_kind = 'escrow' OR src_kind = 'escrow';
CREATE INDEX idx_marks_src ON marks_ledger (src_id, kind, day);
CREATE TRIGGER marks_line_pays_account AFTER INSERT ON marks_ledger WHEN NEW.src_kind = 'account'
BEGIN
  UPDATE marks SET balance = balance - NEW.amount WHERE account = NEW.src_id;
END;
CREATE TRIGGER marks_line_pays_guild AFTER INSERT ON marks_ledger WHEN NEW.src_kind = 'guild'
BEGIN
  UPDATE guild_marks SET balance = balance - NEW.amount WHERE guild_id = NEW.src_id;
END;
CREATE TRIGGER marks_line_pays_to_account AFTER INSERT ON marks_ledger WHEN NEW.dst_kind = 'account'
BEGIN
  INSERT INTO marks (account, balance) VALUES (NEW.dst_id, NEW.amount) ON CONFLICT (account) DO UPDATE SET balance = balance + excluded.balance;
END;
CREATE TRIGGER marks_line_pays_to_guild AFTER INSERT ON marks_ledger WHEN NEW.dst_kind = 'guild'
BEGIN
  INSERT INTO guild_marks (guild_id, balance) VALUES (NEW.dst_id, NEW.amount) ON CONFLICT (guild_id) DO UPDATE SET balance = balance + excluded.balance;
END;

-- One row per private report a player sent: its context, whether staff read it, and how it was closed.
CREATE TABLE private_reports (
  id        TEXT PRIMARY KEY,
  from_id   TEXT NOT NULL,
  rid       TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('exploit', 'bug', 'security')),
  subject   TEXT NOT NULL CHECK (length(subject) BETWEEN 3 AND 80),
  body      TEXT NOT NULL CHECK (length(body) BETWEEN 10 AND 3000),
  context   TEXT CHECK (context IS NULL OR (json_valid(context) AND length(context) <= 400)),
  sent_at   INTEGER NOT NULL,
  read_at   INTEGER,
  read_by   TEXT,
  state     TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'fixed', 'wontfix', 'duplicate')),
  closed_at INTEGER,
  closed_by TEXT,
  FOREIGN KEY (from_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_private_reports_from ON private_reports (from_id, sent_at DESC);
CREATE INDEX idx_private_reports_state ON private_reports (state, sent_at DESC);
CREATE UNIQUE INDEX ux_private_reports_rid ON private_reports (from_id, rid);

-- One row per active rate-limit key, counting its hits inside the current window.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);

-- One row per player save slot: its info, size in bytes, and whether the data has landed.
CREATE TABLE saves (
  player_id      TEXT NOT NULL,
  character_id   TEXT NOT NULL,
  save_name      TEXT NOT NULL,
  character_name TEXT,
  game_time      INTEGER,
  real_time      INTEGER,
  dfu_version    TEXT,
  save_version   INTEGER,
  bytes          INTEGER NOT NULL DEFAULT 0,
  shot_bytes     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (player_id, character_id, save_name),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_saves_character ON saves (character_id);
CREATE INDEX idx_saves_player ON saves (player_id, updated_at DESC);

-- One row per message in a player's mailbox: its words, optional item, and sent, read and claimed times.
CREATE TABLE server_post (
  id         TEXT PRIMARY KEY,
  to_id      TEXT NOT NULL,
  batch      TEXT NOT NULL,
  sender     TEXT NOT NULL,
  subject    TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 80),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1200),
  item       TEXT CHECK (item IS NULL OR json_valid(item)),
  sent_at    INTEGER NOT NULL,
  read_at    INTEGER,
  claimed_at INTEGER,
  claimed_by TEXT,
  FOREIGN KEY (to_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_server_post_to ON server_post (to_id, sent_at DESC);
CREATE UNIQUE INDEX ux_server_post_batch ON server_post (to_id, batch);

-- One row per signed-in device session of an account, which sign-out revokes on its own.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL,
  secret_hash  TEXT NOT NULL,
  device_label TEXT,
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_player ON sessions (player_id, last_seen DESC);
CREATE UNIQUE INDEX idx_sessions_secret ON sessions (secret_hash);

-- ==== Realm characters and their records ==============================================================================

-- One row per realm character: its owner, lease, sequence and the record the account keeps for it.
CREATE TABLE realm_characters (
  id          TEXT PRIMARY KEY,
  player      TEXT NOT NULL,
  name        TEXT NOT NULL,
  summary     TEXT,
  seq         INTEGER NOT NULL DEFAULT 0,
  bytes       INTEGER NOT NULL DEFAULT 0,
  lease       TEXT,
  lease_at    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  obj         TEXT,
  prev        TEXT,
  lineage_id  TEXT,
  person_id   INTEGER,
  dead_at     INTEGER,
  dead_why    TEXT,
  judged_seq  INTEGER,
  held        TEXT CHECK (held IS NULL OR held IN ('law', 'dupe', 'budget', 'staff')),
  held_at     INTEGER,
  strikes     INTEGER NOT NULL DEFAULT 0,
  review      TEXT,
  wealth      INTEGER,
  witnessed   INTEGER NOT NULL DEFAULT 0,
  allowance   INTEGER,
  played_at   INTEGER,
  clean_obj   TEXT,
  clean_seq   INTEGER,
  dupes       INTEGER NOT NULL DEFAULT 0,
  judge_rev   INTEGER NOT NULL DEFAULT 0,
  svc_seq     INTEGER,
  level_seen  INTEGER,
  level_at    INTEGER,
  law_sig     TEXT,
  law_excused TEXT,
  wealth_v    INTEGER,
  arms_top    INTEGER,
  arms_bow    INTEGER,
  held_until  INTEGER,
  law_holds   INTEGER NOT NULL DEFAULT 0,
  law_at      INTEGER,
  rez_lease   TEXT,
  law_v       TEXT,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_realm_characters_rich ON realm_characters (wealth) WHERE wealth >= 250000;
CREATE INDEX realm_characters_held ON realm_characters (held) WHERE held IS NOT NULL;
CREATE INDEX realm_characters_holds ON realm_characters (held_at DESC) WHERE held IS NOT NULL OR review IS NOT NULL;
CREATE INDEX realm_characters_name ON realm_characters (name COLLATE NOCASE);
CREATE INDEX realm_characters_name_player ON realm_characters (name COLLATE NOCASE, player);
CREATE UNIQUE INDEX realm_characters_person ON realm_characters (player, lineage_id, person_id) WHERE lineage_id IS NOT NULL;
CREATE INDEX realm_characters_player ON realm_characters (player, updated_at);
CREATE INDEX realm_characters_review ON realm_characters (review) WHERE review IS NOT NULL;
CREATE INDEX realm_characters_rez_hold ON realm_characters (dead_at) WHERE rez_lease IS NOT NULL;

-- One row per sale request id and account for an insignia, panoply or fence sale, so a repeated request settles once.
CREATE TABLE broker_sales (
  account  TEXT NOT NULL,
  rid      TEXT NOT NULL,
  kind     TEXT NOT NULL,
  item     TEXT,
  at       INTEGER NOT NULL,
  settled  INTEGER NOT NULL DEFAULT 0,
  asked_by TEXT,
  PRIMARY KEY (account, rid),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per character holding its packed Firmament tree allocation and when it last changed.
CREATE TABLE firmament (
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  tree       TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player, char_id),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per Firmament change request, keeping the tree before and after and the silver burnt, so a repeat is not charged twice.
CREATE TABLE firmament_sets (
  player  TEXT NOT NULL,
  rid     TEXT NOT NULL,
  char_id TEXT NOT NULL,
  prev    TEXT NOT NULL,
  tree    TEXT NOT NULL,
  silver  INTEGER NOT NULL DEFAULT 0,
  at      INTEGER NOT NULL,
  n       TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_firmament_sets_char ON firmament_sets (player, char_id, at);

-- One row per living character: its latest tally of item counts by kind.
CREATE TABLE item_census (
  char_id TEXT PRIMARY KEY,
  player  TEXT NOT NULL,
  tally   TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  FOREIGN KEY (char_id) REFERENCES realm_characters(id) ON DELETE CASCADE
);

-- One row per item kind per day: the server-wide count carried, stored, vaulted and held at the market.
CREATE TABLE item_census_days (
  kind    TEXT NOT NULL,
  day     INTEGER NOT NULL,
  carried INTEGER NOT NULL DEFAULT 0,
  stores  INTEGER,
  vaults  INTEGER,
  market  INTEGER,
  holders INTEGER NOT NULL DEFAULT 0,
  at      INTEGER NOT NULL,
  PRIMARY KEY (kind, day)
);

-- One row per copy found: a character's record that showed a piece another record held.
CREATE TABLE item_dupes (
  uid         TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  at          INTEGER NOT NULL,
  first_char  TEXT,
  first_at    INTEGER,
  claimant    TEXT,
  claim_at    INTEGER,
  fp          TEXT,
  kind        TEXT,
  trail_at    INTEGER,
  trail_by    TEXT,
  trail_found TEXT CHECK (trail_found IS NULL OR trail_found IN ('copier', 'innocent', 'unclear')),
  trail_note  TEXT,
  PRIMARY KEY (uid, char_id)
);
CREATE INDEX item_dupes_at ON item_dupes (at, uid, char_id) WHERE kind IS NULL OR kind != 'drop';
CREATE INDEX item_dupes_char ON item_dupes (char_id);
CREATE INDEX item_dupes_open ON item_dupes (char_id, trail_at, kind) WHERE trail_at IS NULL AND (kind IS NULL OR kind != 'drop');
CREATE INDEX item_dupes_open_at ON item_dupes (at, uid, char_id) WHERE trail_at IS NULL AND (kind IS NULL OR kind != 'drop');

-- One row per tracked piece: its holder, whether held, in escrow or gone, and any pending claim by another record.
CREATE TABLE item_uids (
  uid        TEXT PRIMARY KEY CHECK (length(uid) = 16),
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  seen_seq   INTEGER NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('held', 'escrow', 'gone')),
  fp         TEXT NOT NULL,
  claim_char TEXT,
  claim_at   INTEGER,
  at         INTEGER NOT NULL
);
CREATE INDEX item_uids_char ON item_uids (char_id);
CREATE INDEX item_uids_claim ON item_uids (claim_char) WHERE claim_char IS NOT NULL;

-- Per account, stream and clock hour: what its claims took, seconds played, and what went past the bucket.
CREATE TABLE progress_hours (
  player   TEXT NOT NULL,
  stream   TEXT NOT NULL,
  hour     INTEGER NOT NULL,
  amount   INTEGER NOT NULL DEFAULT 0,
  played_s INTEGER NOT NULL DEFAULT 0,
  over     INTEGER NOT NULL DEFAULT 0,
  claims   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player, stream, hour),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX progress_hours_hour ON progress_hours (stream, hour);

-- One row per account and stream: its progress bucket, refilled by seconds played and spent by claims.
CREATE TABLE progress_play (
  player    TEXT NOT NULL,
  stream    TEXT NOT NULL,
  allowance INTEGER NOT NULL,
  played_at INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (player, stream),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per account, questline and step: when it opened, when it was done, and the choice made.
CREATE TABLE ql_steps (
  account   TEXT NOT NULL,
  line      TEXT NOT NULL,
  step      INTEGER NOT NULL,
  opened_at INTEGER NOT NULL,
  done_at   INTEGER,
  seen_at   INTEGER,
  choice    TEXT,
  PRIMARY KEY (account, line, step),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- The staff-set realm dials, such as the wealth budget line, with who changed them and when.
CREATE TABLE realm_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  at    INTEGER NOT NULL,
  by    TEXT
);

-- Gold and count of each kind of gold faucet, totalled per clock hour.
CREATE TABLE realm_faucets (
  hour INTEGER NOT NULL,
  kind TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  n    INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (hour, kind)
);

-- One row per judgement that found something, such as a law breach, duplicate or gain past budget, kept for staff.
CREATE TABLE realm_findings (
  id      INTEGER PRIMARY KEY,
  player  TEXT NOT NULL,
  char_id TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  law     INTEGER NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('law', 'dupe', 'budget', 'measure', 'outlier', 'staff')),
  detail  TEXT NOT NULL CHECK (json_valid(detail)),
  FOREIGN KEY (char_id) REFERENCES realm_characters(id) ON DELETE CASCADE
);
CREATE INDEX realm_findings_at ON realm_findings (at);
CREATE INDEX realm_findings_char ON realm_findings (char_id, at);

-- One row per operator repair of a character's faction flags, so the same ticket mends only once.
CREATE TABLE realm_repairs (
  char_id   TEXT NOT NULL,
  ticket    TEXT NOT NULL,
  player    TEXT NOT NULL,
  by_handle TEXT NOT NULL,
  at        INTEGER NOT NULL,
  faction   INTEGER NOT NULL,
  flag      INTEGER NOT NULL,
  was       INTEGER NOT NULL,
  gold      INTEGER NOT NULL CHECK (gold >= 0),
  seq       INTEGER NOT NULL,
  note      TEXT,
  PRIMARY KEY (char_id, ticket),
  FOREIGN KEY (char_id) REFERENCES realm_characters(id) ON DELETE CASCADE
);

-- One row per player-to-player trade session: both sides, their halves, its state and result.
CREATE TABLE realm_trades (
  sid        TEXT PRIMARY KEY,
  a_player   TEXT NOT NULL,
  a_char     TEXT NOT NULL,
  a_lease    TEXT NOT NULL,
  a_seq      INTEGER NOT NULL,
  a_half     TEXT NOT NULL,
  b_player   TEXT,
  b_char     TEXT,
  state      TEXT NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'done', 'refused')),
  why        TEXT,
  result     TEXT,
  created_at INTEGER NOT NULL,
  b_seq      INTEGER,
  b_half     TEXT,
  CHECK (state != 'done' OR result IS NOT NULL)
);
CREATE INDEX idx_realm_trades_waiting ON realm_trades (a_player, a_char, state);
CREATE INDEX realm_trades_a_player ON realm_trades (a_player, created_at);
CREATE INDEX realm_trades_b_player ON realm_trades (b_player, created_at) WHERE b_player IS NOT NULL;
CREATE INDEX realm_trades_created ON realm_trades (created_at);

-- Guard table whose check fails unless rows moved match rows expected, so a batch rolls back together.
CREATE TABLE realm_tx_guard (
  moved    INTEGER NOT NULL,
  expected INTEGER NOT NULL,
  CHECK (moved = expected)
);

-- One row per wedding between two realm characters: both sides, their cards, and when it began and ended.
CREATE TABLE realm_unions (
  sid       TEXT PRIMARY KEY,
  a_player  TEXT NOT NULL,
  a_char    TEXT NOT NULL,
  b_player  TEXT NOT NULL,
  b_char    TEXT NOT NULL,
  a_card    TEXT NOT NULL,
  b_card    TEXT NOT NULL,
  wed_at    INTEGER NOT NULL,
  ended_at  INTEGER,
  ended_why TEXT,
  ended_by  TEXT
);
CREATE INDEX realm_unions_a ON realm_unions (a_char);
CREATE INDEX realm_unions_ap ON realm_unions (a_player, wed_at);
CREATE INDEX realm_unions_b ON realm_unions (b_char);
CREATE INDEX realm_unions_bp ON realm_unions (b_player, wed_at);

-- Per character and clock hour, the unexplained wealth gain, seconds played and level, for setting the budget.
CREATE TABLE realm_wealth_hours (
  char_id     TEXT NOT NULL,
  hour        INTEGER NOT NULL,
  player      TEXT NOT NULL,
  level       INTEGER NOT NULL,
  gain        INTEGER NOT NULL DEFAULT 0,
  loss        INTEGER NOT NULL DEFAULT 0,
  played_s    INTEGER NOT NULL DEFAULT 0,
  checkpoints INTEGER NOT NULL DEFAULT 0,
  tally       TEXT,
  PRIMARY KEY (char_id, hour),
  FOREIGN KEY (char_id) REFERENCES realm_characters(id) ON DELETE CASCADE
);
CREATE INDEX realm_wealth_hours_hour ON realm_wealth_hours (hour);

-- One half of a wedding one player has offered, naming the partner and partner character.
CREATE TABLE realm_wed_halves (
  sid          TEXT NOT NULL,
  player       TEXT NOT NULL,
  char_id      TEXT NOT NULL,
  partner      TEXT NOT NULL,
  partner_char TEXT NOT NULL,
  at           INTEGER NOT NULL,
  PRIMARY KEY (sid, player)
);

-- One row per account holding its Renown carried over from its characters.
CREATE TABLE renown_accounts (
  player     TEXT PRIMARY KEY,
  xp         INTEGER NOT NULL DEFAULT 0,
  last_rid   TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per account and Renown track, with its standing and the last report id it took.
CREATE TABLE renown_tracks (
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  name       TEXT,
  xp         INTEGER NOT NULL DEFAULT 0,
  last_rid   TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player, char_id),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_renown_recent ON renown_tracks (player, updated_at);

-- ==== Guilds ==========================================================================================================

-- One row per castle a guild owns, keyed by its region, with its instance epoch and what the purchase cost.
CREATE TABLE guild_castles (
  region    INTEGER PRIMARY KEY CHECK (region >= 0 AND region <= 70),
  key       INTEGER NOT NULL,
  guild_id  TEXT NOT NULL,
  paid      INTEGER NOT NULL CHECK (paid >= 0),
  epoch     TEXT NOT NULL,
  bought_at INTEGER NOT NULL,
  buyer     TEXT NOT NULL,
  rid       TEXT NOT NULL,
  n         TEXT NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_castles_guild ON guild_castles (guild_id);

-- One row per contract, raid and account recording the pay a defender received for that deed and the tax burnt.
CREATE TABLE guild_contract_pays (
  contract TEXT NOT NULL,
  event    TEXT NOT NULL,
  account  TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  pay      INTEGER NOT NULL CHECK (pay >= 0),
  tax      INTEGER NOT NULL CHECK (tax >= 0),
  at       INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (contract, event, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_contract_pays_event ON guild_contract_pays (event, account);

-- One row per guild raid contract, with its region, deeds wanted and left, pay, escrow, state and expiry.
CREATE TABLE guild_contracts (
  id          TEXT PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  poster      TEXT,
  poster_char TEXT NOT NULL,
  officer     INTEGER NOT NULL CHECK (officer IN (0, 1)),
  week        INTEGER NOT NULL,
  region      INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  kind        TEXT NOT NULL CHECK (kind IN ('raid')),
  deeds       INTEGER NOT NULL CHECK (deeds >= 1 AND deeds <= 500),
  left_deeds  INTEGER NOT NULL CHECK (left_deeds >= 0 AND left_deeds <= deeds),
  pay         INTEGER NOT NULL CHECK (pay >= 1 AND pay <= 50),
  escrow      INTEGER NOT NULL CHECK (escrow >= 0),
  at          INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'filled', 'withdrawn', 'expired')),
  closed_at   INTEGER,
  returned    INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  closed_by   TEXT,
  rid         TEXT NOT NULL,
  n           TEXT NOT NULL,
  cn          TEXT,
  UNIQUE (poster, rid),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (poster) REFERENCES players(id) ON DELETE SET NULL
);
CREATE INDEX idx_guild_contracts_due ON guild_contracts (state, returned, expires_at);
CREATE INDEX idx_guild_contracts_guild ON guild_contracts (guild_id, state);
CREATE INDEX idx_guild_contracts_open_due ON guild_contracts (state, expires_at);
CREATE INDEX idx_guild_contracts_region ON guild_contracts (region, kind, state, expires_at);
CREATE INDEX idx_guild_contracts_unreturned ON guild_contracts (returned, state);
CREATE INDEX idx_guild_contracts_week ON guild_contracts (guild_id, week, officer);

-- One row per guild, event and account marking a member's presence at a deed, three of which strike the guild's deed.
CREATE TABLE guild_deed_marks (
  guild_id TEXT NOT NULL,
  event    TEXT NOT NULL,
  account  TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (guild_id, event, account),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_guild_deed_marks_event ON guild_deed_marks (event, account);

-- One row per vassal guild naming its liege and whether the fealty is offered, sworn or being broken.
CREATE TABLE guild_fealty (
  vassal     TEXT PRIMARY KEY,
  liege      TEXT NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('offered', 'sworn', 'breaking')),
  offered_by TEXT NOT NULL,
  broken_by  TEXT,
  since_week INTEGER,
  at         INTEGER NOT NULL,
  FOREIGN KEY (vassal) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (liege) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_fealty_liege ON guild_fealty (liege, state);

-- One row per pending guild invitation to an account, with who invited and when.
CREATE TABLE guild_invites (
  guild_id TEXT NOT NULL,
  player   TEXT NOT NULL,
  by_name  TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (guild_id, player),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_invites_player ON guild_invites (player);

-- One row per change to a guild's treasury, with who moved it, the kind, the amount and the balance after.
CREATE TABLE guild_ledger (
  seq      INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  at       INTEGER NOT NULL,
  who      TEXT NOT NULL,
  kind     TEXT NOT NULL,
  amount   INTEGER NOT NULL,
  balance  INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_ledger_guild ON guild_ledger (guild_id, seq);

-- One row per guild holding its Marks balance.
CREATE TABLE guild_marks (
  guild_id TEXT PRIMARY KEY,
  balance  INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0 AND balance <= 10000000),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- One row per character in a guild, with its account, rank, roster name and join time.
CREATE TABLE guild_members (
  player      TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  guild_id    TEXT NOT NULL,
  rank        INTEGER NOT NULL,
  name        TEXT NOT NULL,
  joined_at   INTEGER NOT NULL,
  vault_level TEXT CHECK (vault_level IS NULL OR vault_level IN ('none', 'deposit', 'withdraw')),
  vault_limit INTEGER NOT NULL DEFAULT 0 CHECK (vault_limit >= 0 AND vault_limit <= 100),
  vault_day   INTEGER NOT NULL DEFAULT 0,
  vault_taken INTEGER NOT NULL DEFAULT 0 CHECK (vault_taken >= 0),
  PRIMARY KEY (player, char_id),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_members_guild ON guild_members (guild_id, rank, joined_at);

-- One row per note a member pinned on a guild's own board, with its author, text and expiry.
CREATE TABLE guild_notes (
  id          TEXT PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  author      TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  author_name TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  rid         TEXT NOT NULL,
  UNIQUE (author, rid),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (author) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_notes_author ON guild_notes (guild_id, author, expires_at);
CREATE INDEX idx_guild_notes_guild ON guild_notes (guild_id, expires_at, at);

-- One row per pair of guilds with a non-aggression pact, offered or signed, and the week it stands until.
CREATE TABLE guild_pacts (
  a          TEXT NOT NULL,
  b          TEXT NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('offered', 'signed')),
  offered_by TEXT NOT NULL,
  until_week INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (a, b),
  CHECK (a < b),
  FOREIGN KEY (a) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (b) REFERENCES guilds(id) ON DELETE CASCADE
);

-- One row per guild, material and depositor holding the units kept in the guild's warehouse.
CREATE TABLE guild_prof_stores (
  guild_id   TEXT NOT NULL,
  material   TEXT NOT NULL,
  dep_player TEXT NOT NULL DEFAULT '',
  dep_char   TEXT NOT NULL DEFAULT '',
  qty        INTEGER NOT NULL CHECK (qty >= 0 AND qty <= 50000),
  moved_by   TEXT NOT NULL,
  moved_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, material, dep_player, dep_char),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE TRIGGER guild_store_in AFTER INSERT ON guild_prof_stores WHEN NEW.qty > 0
BEGIN
  INSERT INTO guild_store_ledger (guild_id, material, dep_player, dep_char, delta, qty, who, at) VALUES (NEW.guild_id, NEW.material, NEW.dep_player, NEW.dep_char, NEW.qty, NEW.qty, NEW.moved_by, NEW.moved_at);
END;
CREATE TRIGGER guild_store_moved AFTER UPDATE OF qty ON guild_prof_stores WHEN NEW.qty <> OLD.qty
BEGIN
  INSERT INTO guild_store_ledger (guild_id, material, dep_player, dep_char, delta, qty, who, at) VALUES (NEW.guild_id, NEW.material, NEW.dep_player, NEW.dep_char, NEW.qty - OLD.qty, NEW.qty, NEW.moved_by, NEW.moved_at);
END;

-- One row per guild rename, recording the old and new name and tag, who did it and what it cost.
CREATE TABLE guild_renames (
  seq      INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  at       INTEGER NOT NULL,
  who      TEXT NOT NULL,
  old_name TEXT NOT NULL,
  old_tag  TEXT NOT NULL,
  new_name TEXT NOT NULL,
  new_tag  TEXT NOT NULL,
  cost     INTEGER NOT NULL CHECK (cost >= 0),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_renames_guild ON guild_renames (guild_id, seq);
CREATE INDEX idx_guild_renames_old ON guild_renames (old_tag, old_name, at);

-- One row per movement of a guild warehouse stock, with the change, the quantity after and who moved it.
CREATE TABLE guild_store_ledger (
  seq        INTEGER PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  material   TEXT NOT NULL,
  dep_player TEXT NOT NULL,
  dep_char   TEXT NOT NULL,
  delta      INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  who        TEXT NOT NULL,
  at         INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_store_ledger_guild ON guild_store_ledger (guild_id, seq);

-- One row per guild warehouse deposit or withdrawal request, keyed by player and request id, so a repeat is answered the same.
CREATE TABLE guild_store_moves (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('deposit', 'withdraw')),
  material TEXT NOT NULL,
  units    INTEGER NOT NULL CHECK (units >= 1),
  own      INTEGER NOT NULL CHECK (own >= 0 AND own <= units),
  at       INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX guild_store_moves_at ON guild_store_moves (at);

-- One row per occupied slot of a guild's item vault, holding the stored piece and who deposited it.
CREATE TABLE guild_vault (
  guild_id   TEXT NOT NULL,
  slot       INTEGER NOT NULL CHECK (slot >= 0 AND slot < 100),
  rec        TEXT NOT NULL,
  name       TEXT NOT NULL,
  count      INTEGER NOT NULL CHECK (count >= 1),
  dep_player TEXT NOT NULL,
  dep_char   TEXT NOT NULL,
  dep_name   TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (guild_id, slot),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- One row per piece put into or taken out of a guild vault, with who, what and how many.
CREATE TABLE guild_vault_log (
  seq      INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  at       INTEGER NOT NULL,
  who      TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('put', 'take')),
  name     TEXT NOT NULL,
  count    INTEGER NOT NULL CHECK (count >= 1),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_vault_log_at ON guild_vault_log (at);
CREATE INDEX idx_guild_vault_log_guild ON guild_vault_log (guild_id, seq);
CREATE INDEX idx_guild_vault_log_who ON guild_vault_log (who, at);

-- One row per guild holding the officers' weekly writ budget its Guildmaster set.
CREATE TABLE guild_writ_budgets (
  guild_id TEXT PRIMARY KEY,
  budget   INTEGER NOT NULL CHECK (budget >= 0 AND budget <= 10000000),
  set_by   TEXT NOT NULL,
  set_at   INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- One row per delivery to a guild writ, with the units, pay and tax, keyed by filler and request id.
CREATE TABLE guild_writ_fills (
  filler   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  writ     TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  material TEXT NOT NULL,
  units    INTEGER NOT NULL CHECK (units >= 1),
  pay      INTEGER NOT NULL CHECK (pay >= 0),
  tax      INTEGER NOT NULL CHECK (tax >= 0),
  at       INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (filler, rid),
  FOREIGN KEY (filler) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_guild_writ_fills_writ ON guild_writ_fills (writ, at);

-- One row per guild material writ, with its region, units wanted and left, pay, escrow, state and expiry.
CREATE TABLE guild_writs (
  id          TEXT PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  poster      TEXT,
  poster_char TEXT NOT NULL,
  officer     INTEGER NOT NULL CHECK (officer IN (0, 1)),
  week        INTEGER NOT NULL,
  region      INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  material    TEXT NOT NULL,
  units       INTEGER NOT NULL CHECK (units >= 1 AND units <= 5000),
  left_units  INTEGER NOT NULL CHECK (left_units >= 0 AND left_units <= units),
  pay         INTEGER NOT NULL CHECK (pay >= 1),
  escrow      INTEGER NOT NULL CHECK (escrow >= 0),
  at          INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'filled', 'withdrawn', 'expired')),
  closed_at   INTEGER,
  returned    INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  closed_by   TEXT,
  rid         TEXT NOT NULL,
  n           TEXT NOT NULL,
  cn          TEXT,
  seat        INTEGER,
  camp        INTEGER NOT NULL DEFAULT 0 CHECK (camp IN (0, 1)),
  UNIQUE (poster, rid),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (poster) REFERENCES players(id) ON DELETE SET NULL
);
CREATE INDEX idx_guild_writs_due ON guild_writs (state, returned, expires_at);
CREATE INDEX idx_guild_writs_guild ON guild_writs (guild_id, state);
CREATE INDEX idx_guild_writs_region ON guild_writs (region, state, expires_at);
CREATE INDEX idx_guild_writs_unreturned ON guild_writs (returned, state);
CREATE INDEX idx_guild_writs_week ON guild_writs (guild_id, week, officer);

-- One row per guild: its name, tag, ranks, treasury and founding time.
CREATE TABLE guilds (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL UNIQUE,
  tag        TEXT NOT NULL UNIQUE,
  ranks      TEXT NOT NULL,
  treasury   INTEGER NOT NULL DEFAULT 0,
  founded_at INTEGER NOT NULL,
  moved_by   TEXT,
  moved_at   INTEGER,
  realm_gold INTEGER NOT NULL DEFAULT 0,
  heraldry   TEXT,
  moved_kind TEXT,
  renamed_at INTEGER
);
CREATE TRIGGER guild_ledger_line AFTER UPDATE OF treasury ON guilds WHEN NEW.treasury <> OLD.treasury
BEGIN
  INSERT INTO guild_ledger (guild_id, at, who, kind, amount, balance) VALUES (NEW.id, NEW.moved_at, NEW.moved_by, COALESCE(NEW.moved_kind, CASE WHEN NEW.treasury > OLD.treasury THEN 'deposit' ELSE 'withdraw' END), abs(NEW.treasury - OLD.treasury), NEW.treasury);
  UPDATE guilds SET moved_kind = NULL WHERE id = NEW.id AND moved_kind IS NOT NULL;
END;

-- One row per day and region recording that the region's hall writs were posted that day.
CREATE TABLE hall_writ_days (
  day    INTEGER NOT NULL,
  region INTEGER NOT NULL,
  posted INTEGER NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (day, region)
);

-- ==== Homes, decor and festivals ======================================================================================

-- One row per container or station piece in a home saying who may use it: private, guild or chosen friends.
CREATE TABLE decor_access (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  piece_id     TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('storage', 'station')),
  mode         TEXT NOT NULL CHECK (mode IN ('private', 'guild', 'friends', 'party')),
  friends      TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (map_id, building_key, piece_id, kind)
);

-- One row per decor batch confirmation, keyed by its transaction id, so a repeated confirm is not applied twice.
CREATE TABLE decor_batch_receipt (
  txn          TEXT PRIMARY KEY,
  player       TEXT NOT NULL,
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  rev          INTEGER NOT NULL,
  result       TEXT NOT NULL,
  at           INTEGER NOT NULL
);
CREATE INDEX idx_decor_batch_at ON decor_batch_receipt (at);

-- One row per item held in a shared decor container, keyed by home, piece and item id.
CREATE TABLE decor_bin (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  piece_id     TEXT NOT NULL,
  uid          TEXT NOT NULL,
  item         TEXT NOT NULL,
  PRIMARY KEY (map_id, building_key, piece_id, uid)
);

-- One row per chest currently held open by one player, which lasts until they close it or it expires.
CREATE TABLE decor_hold (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  piece_id     TEXT NOT NULL,
  player       TEXT NOT NULL,
  char_id      TEXT NOT NULL,
  until        INTEGER NOT NULL,
  PRIMARY KEY (map_id, building_key, piece_id)
);

-- One row per property holding its decor revision number, which rises with each applied decor batch.
CREATE TABLE decor_rev (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  rev          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, building_key)
);

-- One row per account per UTC day counting the festival find asks heard and the cakes found.
CREATE TABLE fest_finds (
  account TEXT NOT NULL,
  day     INTEGER NOT NULL,
  asks    INTEGER NOT NULL DEFAULT 0,
  found   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, day),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per hearth offering set out at a home's door, with its owner and the cakes left in its bowl.
CREATE TABLE fest_offerings (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  player       TEXT NOT NULL,
  char_id      TEXT NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0,
  placed_at    INTEGER NOT NULL,
  PRIMARY KEY (map_id, building_key),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_fest_offerings_owner ON fest_offerings (player, char_id);

-- One row per festival sale request id and account, recording the ware sold, its price and when.
CREATE TABLE fest_sales (
  account TEXT NOT NULL,
  rid     TEXT NOT NULL,
  ware    TEXT NOT NULL,
  price   INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (account, rid),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per account per offering per UTC day recording a cake taken from a hearth offering.
CREATE TABLE fest_takes (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  taker        TEXT NOT NULL,
  day          INTEGER NOT NULL,
  PRIMARY KEY (map_id, building_key, taker, day),
  FOREIGN KEY (taker) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_fest_takes_taker ON fest_takes (taker);

-- One row per decor piece placed in a home, with its model or sprite and its placement details.
CREATE TABLE home_decor (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  id           TEXT NOT NULL,
  model        INTEGER,
  flat_archive INTEGER,
  flat_record  INTEGER,
  place        TEXT NOT NULL,
  placed_at    INTEGER NOT NULL,
  item         TEXT,
  paid         INTEGER NOT NULL DEFAULT 0,
  yard         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, building_key, id),
  FOREIGN KEY (map_id, building_key) REFERENCES homes(map_id, building_key) ON DELETE CASCADE
);
CREATE INDEX idx_home_decor_piece ON home_decor (map_id, id, yard);
CREATE INDEX idx_home_decor_pv ON home_decor (json_extract(item, '$.pv'));
CREATE INDEX idx_home_decor_yard_order ON home_decor (map_id, yard, building_key, placed_at, id);
CREATE TRIGGER home_yards_in AFTER INSERT ON home_decor WHEN NEW.yard = 1
BEGIN
  INSERT INTO home_yards_ver (map_id, ver) VALUES (NEW.map_id, COALESCE((SELECT built FROM home_yards WHERE map_id = NEW.map_id), 0) + 1) ON CONFLICT (map_id) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER home_yards_moved AFTER UPDATE ON home_decor WHEN OLD.yard = 1 OR NEW.yard = 1
BEGIN
  INSERT INTO home_yards_ver (map_id, ver) SELECT OLD.map_id, COALESCE((SELECT built FROM home_yards WHERE map_id = OLD.map_id), 0) + 1 WHERE OLD.yard = 1 ON CONFLICT (map_id) DO UPDATE SET ver = ver + 1;
  INSERT INTO home_yards_ver (map_id, ver) SELECT NEW.map_id, COALESCE((SELECT built FROM home_yards WHERE map_id = NEW.map_id), 0) + 1 WHERE NEW.yard = 1 ON CONFLICT (map_id) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER home_yards_out AFTER DELETE ON home_decor WHEN OLD.yard = 1
BEGIN
  INSERT INTO home_yards_ver (map_id, ver) VALUES (OLD.map_id, COALESCE((SELECT built FROM home_yards WHERE map_id = OLD.map_id), 0) + 1) ON CONFLICT (map_id) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER vendor_board_trader AFTER UPDATE ON home_decor WHEN (OLD.yard = 0 AND CASE WHEN json_valid(OLD.place) THEN json_extract(OLD.place, '$.station') END = 'vendor') OR (NEW.yard = 0 AND CASE WHEN json_valid(NEW.place) THEN json_extract(NEW.place, '$.station') END = 'vendor')
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT DISTINCT region AS r FROM homes WHERE (map_id = OLD.map_id AND building_key = OLD.building_key) OR (map_id = NEW.map_id AND building_key = NEW.building_key)) WHERE true ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER vendor_board_trader_in AFTER INSERT ON home_decor WHEN NEW.yard = 0 AND CASE WHEN json_valid(NEW.place) THEN json_extract(NEW.place, '$.station') END = 'vendor'
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT region AS r FROM homes WHERE map_id = NEW.map_id AND building_key = NEW.building_key) WHERE true ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER vendor_board_trader_out AFTER DELETE ON home_decor WHEN OLD.yard = 0 AND CASE WHEN json_valid(OLD.place) THEN json_extract(OLD.place, '$.station') END = 'vendor'
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT region AS r FROM homes WHERE map_id = OLD.map_id AND building_key = OLD.building_key) WHERE true ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;

-- One row per home listing the original room furnishings its owner cleared.
CREATE TABLE home_hidden (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  keys         TEXT NOT NULL,
  PRIMARY KEY (map_id, building_key),
  FOREIGN KEY (map_id, building_key) REFERENCES homes(map_id, building_key) ON DELETE CASCADE
);

-- One row per home moved to a new building key in a town, with its owner, any refund, and whether the owner has read it.
CREATE TABLE home_moves (
  map_id   INTEGER NOT NULL,
  old_key  INTEGER NOT NULL,
  new_key  INTEGER NOT NULL,
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  refund   INTEGER NOT NULL DEFAULT 0,
  hall     INTEGER NOT NULL DEFAULT 0,
  moved_at INTEGER NOT NULL,
  seen_at  INTEGER,
  PRIMARY KEY (map_id, old_key),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_home_moves_mover ON home_moves (player, char_id, seen_at);

-- One row per house offered by a seller to one buyer account, with the price, what is kept, state and expiry.
CREATE TABLE home_offers (
  id           TEXT PRIMARY KEY,
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  seller       TEXT NOT NULL,
  seller_char  TEXT NOT NULL,
  buyer        TEXT NOT NULL,
  price        INTEGER NOT NULL,
  keep_decor   INTEGER NOT NULL,
  keep_items   INTEGER NOT NULL,
  rev          INTEGER NOT NULL,
  state        TEXT NOT NULL,
  result       TEXT,
  at           INTEGER NOT NULL,
  until        INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_home_offer_open ON home_offers (map_id, building_key) WHERE state = 'open';

-- One row per room of a home listed for rent, with its price and the tenant and the time the tenancy ends.
CREATE TABLE home_rooms (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  room         INTEGER NOT NULL,
  anchor       TEXT NOT NULL,
  price        INTEGER NOT NULL,
  listed       INTEGER NOT NULL DEFAULT 1,
  tenant       TEXT,
  tenant_char  TEXT,
  tenant_name  TEXT,
  until        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, building_key, room),
  FOREIGN KEY (map_id, building_key) REFERENCES homes(map_id, building_key) ON DELETE CASCADE,
  FOREIGN KEY (tenant) REFERENCES players(id) ON DELETE SET NULL
);
CREATE INDEX idx_home_rooms_tenant ON home_rooms (tenant, tenant_char);

-- One row per account's up or down vote on one online home, removed when the vote is taken back.
CREATE TABLE home_votes (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  player       TEXT NOT NULL,
  vote         INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  voted_at     INTEGER NOT NULL,
  PRIMARY KEY (map_id, building_key, player),
  FOREIGN KEY (map_id, building_key) REFERENCES homes(map_id, building_key) ON DELETE CASCADE,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TRIGGER home_votes_cast AFTER INSERT ON home_votes
BEGIN
  UPDATE homes SET score = score + NEW.vote WHERE map_id = NEW.map_id AND building_key = NEW.building_key;
END;
CREATE TRIGGER home_votes_gone AFTER DELETE ON home_votes
BEGIN
  UPDATE homes SET score = score - OLD.vote WHERE map_id = OLD.map_id AND building_key = OLD.building_key;
END;
CREATE TRIGGER home_votes_turned AFTER UPDATE OF vote ON home_votes
BEGIN
  UPDATE homes SET score = score - OLD.vote + NEW.vote WHERE map_id = NEW.map_id AND building_key = NEW.building_key;
END;

-- One row per town: its built yard snapshot, with the shape it was built in and the yard rows.
CREATE TABLE home_yards (
  map_id INTEGER PRIMARY KEY,
  built  INTEGER NOT NULL,
  shape  TEXT NOT NULL,
  rows   TEXT
);

-- One row per town: the version counter that says whether its built yard snapshot is still current.
CREATE TABLE home_yards_ver (
  map_id INTEGER PRIMARY KEY,
  ver    INTEGER NOT NULL DEFAULT 1
);

-- One row per bought home: the building, its owner and character, entry setting, price and purchase time.
CREATE TABLE homes (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  player       TEXT NOT NULL,
  char_id      TEXT NOT NULL,
  owner_name   TEXT NOT NULL,
  region       INTEGER NOT NULL,
  entry        TEXT NOT NULL DEFAULT 'private',
  price        INTEGER NOT NULL,
  bought_at    INTEGER NOT NULL,
  paid         INTEGER NOT NULL DEFAULT 0,
  rent_due     INTEGER NOT NULL DEFAULT 0,
  look         TEXT,
  guild_id     TEXT REFERENCES guilds(id),
  layout       TEXT,
  deed         INTEGER NOT NULL DEFAULT 0,
  score        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, building_key),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_homes_guild ON homes (guild_id) WHERE guild_id IS NOT NULL;
CREATE INDEX idx_homes_owner ON homes (player, char_id);
CREATE INDEX idx_homes_town_age ON homes (map_id, bought_at, building_key);
CREATE TRIGGER homes_gen_gone AFTER DELETE ON homes
BEGIN
  UPDATE homes_gen SET gen = gen + 1 WHERE id = 1;
END;
CREATE TRIGGER homes_gen_made AFTER INSERT ON homes
BEGIN
  UPDATE homes_gen SET gen = gen + 1 WHERE id = 1;
END;
CREATE TRIGGER homes_gen_moved AFTER UPDATE OF map_id, building_key, bought_at, layout ON homes
BEGIN
  UPDATE homes_gen SET gen = gen + 1 WHERE id = 1;
END;
CREATE TRIGGER vendor_board_house AFTER UPDATE OF player, char_id, owner_name, region, entry, guild_id ON homes
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT OLD.region AS r UNION SELECT NEW.region) WHERE r IS NOT NULL ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER vendor_board_house_gone AFTER DELETE ON homes
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT OLD.region AS r) WHERE r IS NOT NULL ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER vendor_board_house_in AFTER INSERT ON homes
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT NEW.region AS r) WHERE r IS NOT NULL ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;

-- A single row holding a counter that moves whenever a home is added, removed or moved.
CREATE TABLE homes_gen (
  id  INTEGER PRIMARY KEY CHECK (id = 1),
  gen INTEGER NOT NULL
);
INSERT INTO homes_gen (id, gen) VALUES (1, 0);

-- One row per decoration placed in a seat's hall: its building, model or flat, place and when it was placed.
CREATE TABLE seat_hall_decor (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  id           TEXT NOT NULL,
  model        INTEGER,
  flat_archive INTEGER,
  flat_record  INTEGER,
  place        TEXT NOT NULL,
  placed_at    INTEGER NOT NULL,
  item         TEXT,
  paid         INTEGER NOT NULL DEFAULT 0,
  yard         INTEGER NOT NULL DEFAULT 0 CHECK (yard = 0),
  PRIMARY KEY (map_id, building_key, id)
);
CREATE INDEX idx_seat_hall_decor_seat ON seat_hall_decor (map_id);

-- ==== Market, professions and crafting ================================================================================

-- One row per player's commission naming a crafter and a recipe, with its escrowed pay, state and expiry.
CREATE TABLE commissions (
  id          TEXT PRIMARY KEY,
  poster      TEXT NOT NULL,
  poster_char TEXT NOT NULL,
  crafter     TEXT,
  region      INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  recipe      TEXT NOT NULL,
  quality     INTEGER CHECK (quality IS NULL OR (quality >= 0 AND quality <= 4)),
  pay         INTEGER NOT NULL CHECK (pay >= 1 AND pay <= 1000000),
  at          INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'filled', 'withdrawn', 'declined', 'expired')),
  closed_at   INTEGER,
  returned    INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  provenance  TEXT CHECK (provenance IS NULL OR length(provenance) = 16),
  filled_char TEXT,
  tax         INTEGER NOT NULL DEFAULT 0 CHECK (tax >= 0),
  fill_rid    TEXT,
  rid         TEXT NOT NULL,
  n           TEXT NOT NULL,
  fn          TEXT,
  cn          TEXT,
  UNIQUE (poster, rid),
  FOREIGN KEY (poster) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (crafter) REFERENCES players(id) ON DELETE SET NULL
);
CREATE INDEX idx_commissions_crafter ON commissions (crafter, state);
CREATE UNIQUE INDEX idx_commissions_fill_rid ON commissions (crafter, fill_rid) WHERE fill_rid IS NOT NULL;
CREATE INDEX idx_commissions_poster ON commissions (poster, state);
CREATE INDEX idx_commissions_region ON commissions (region, state, expires_at);

-- One row per daily crafting writ offered to a player: product, guild, count, pay, XP and Renown, and whether it was filled.
CREATE TABLE craft_writs (
  id          TEXT PRIMARY KEY,
  player      TEXT NOT NULL,
  owner       TEXT NOT NULL,
  day         INTEGER NOT NULL,
  slot        INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 2),
  product     TEXT NOT NULL,
  faction     INTEGER NOT NULL,
  tier        INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 7),
  qty         INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 20),
  pay         INTEGER NOT NULL CHECK (pay >= 1),
  xp          INTEGER NOT NULL CHECK (xp >= 0),
  renown      INTEGER NOT NULL CHECK (renown >= 0),
  track       TEXT NOT NULL CHECK (track IN ('provisioning', 'smithing')),
  expires_at  INTEGER NOT NULL,
  filled_at   INTEGER,
  filled_char TEXT,
  xp_given    INTEGER CHECK (xp_given IS NULL OR xp_given >= 0),
  goods       TEXT,
  rid         TEXT,
  n           TEXT,
  UNIQUE (day, player, slot),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_craft_writs_day ON craft_writs (player, day, filled_at);
CREATE INDEX idx_craft_writs_open ON craft_writs (expires_at) WHERE filled_at IS NULL;
CREATE UNIQUE INDEX idx_craft_writs_rid ON craft_writs (player, rid) WHERE rid IS NOT NULL;
CREATE INDEX idx_craft_writs_taken ON craft_writs (player, filled_char, product) WHERE filled_at IS NOT NULL;

-- One row per report a reader made against an auction, once per reporter.
CREATE TABLE market_auction_reports (
  auction  TEXT NOT NULL,
  reporter TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (auction, reporter),
  FOREIGN KEY (auction) REFERENCES market_auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per auction of a piece: seller, region, opening price, fee, leading bid and state.
CREATE TABLE market_auctions (
  id         TEXT PRIMARY KEY,
  seller     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  region     INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  provenance TEXT NOT NULL CHECK (length(provenance) = 16),
  wear       INTEGER NOT NULL CHECK (wear >= 1 AND wear <= 1000),
  opening    INTEGER NOT NULL CHECK (opening >= 1 AND opening <= 1000000),
  fee        INTEGER NOT NULL CHECK (fee >= 1),
  high       INTEGER CHECK (high IS NULL OR high >= 1),
  high_bid   TEXT,
  bids       INTEGER NOT NULL DEFAULT 0 CHECK (bids >= 0),
  at         INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  state      TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'sold', 'unsold', 'cancelled', 'removed')),
  closed_at  INTEGER,
  returned   INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  cancel_rid TEXT,
  rid        TEXT NOT NULL,
  n          TEXT NOT NULL,
  bn         TEXT,
  cn         TEXT,
  rn         TEXT,
  board_x    INTEGER,
  board_y    INTEGER,
  tithe      INTEGER NOT NULL DEFAULT 0 CHECK (tithe >= 0),
  UNIQUE (seller, rid),
  FOREIGN KEY (seller) REFERENCES players(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_market_auction_open ON market_auctions (provenance) WHERE state = 'open';
CREATE INDEX idx_market_auctions_open ON market_auctions (state, ends_at);
CREATE INDEX idx_market_auctions_seller ON market_auctions (seller, state);

-- One row per bid on an auction: bidder, amount, courier cost and state, with its escrow.
CREATE TABLE market_bids (
  id       TEXT PRIMARY KEY,
  auction  TEXT NOT NULL,
  bidder   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  region   INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  amount   INTEGER NOT NULL CHECK (amount >= 1),
  courier  INTEGER NOT NULL DEFAULT 0 CHECK (courier >= 0),
  road     INTEGER NOT NULL DEFAULT 0 CHECK (road >= 0),
  seconds  INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  state    TEXT NOT NULL DEFAULT 'high' CHECK (state IN ('high', 'outbid', 'won', 'void')),
  returned INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  at       INTEGER NOT NULL,
  rid      TEXT NOT NULL,
  n        TEXT NOT NULL,
  UNIQUE (bidder, rid),
  FOREIGN KEY (auction) REFERENCES market_auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (bidder) REFERENCES players(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_market_bid_high ON market_bids (auction) WHERE state = 'high';
CREATE INDEX idx_market_bids_at ON market_bids (at);
CREATE INDEX idx_market_bids_auction ON market_bids (auction);
CREATE INDEX idx_market_bids_bidder ON market_bids (bidder, state, returned);

-- One row per piece on its way to a character's pack, bought or returned, and whether it was collected.
CREATE TABLE market_deliveries (
  id          TEXT PRIMARY KEY,
  player      TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  provenance  TEXT,
  wear        INTEGER CHECK (wear IS NULL OR (wear >= 1 AND wear <= 1000)),
  why         TEXT NOT NULL CHECK (why IN ('bought', 'returned')),
  from_region INTEGER,
  arrives_at  INTEGER NOT NULL,
  collected   INTEGER NOT NULL DEFAULT 0 CHECK (collected IN (0, 1)),
  rid         TEXT,
  at          INTEGER NOT NULL,
  item        TEXT,
  CHECK ((item IS NULL AND provenance IS NOT NULL AND wear IS NOT NULL) OR (item IS NOT NULL AND provenance IS NULL AND wear IS NULL)),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_market_deliveries_at ON market_deliveries (collected, at);
CREATE INDEX idx_market_deliveries_player ON market_deliveries (player, collected);
CREATE INDEX idx_market_deliveries_provenance ON market_deliveries (provenance, collected);

-- One row per request that filled a buy order: units given, pay, tax and filler.
CREATE TABLE market_fills (
  filler   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  order_id TEXT NOT NULL,
  poster   TEXT NOT NULL,
  material TEXT NOT NULL,
  units    INTEGER NOT NULL CHECK (units >= 1),
  price    INTEGER NOT NULL CHECK (price >= 1),
  pay      INTEGER NOT NULL CHECK (pay >= 1),
  tax      INTEGER NOT NULL CHECK (tax >= 0),
  at       INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (filler, rid),
  FOREIGN KEY (filler) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_market_fills_at ON market_fills (at);
CREATE INDEX idx_market_fills_day ON market_fills (day);
CREATE INDEX idx_market_fills_material ON market_fills (material, at);
CREATE INDEX idx_market_fills_poster ON market_fills (poster, at);

-- One row per character: the gold from its sales held uncollected.
CREATE TABLE market_gold (
  player  TEXT NOT NULL,
  char_id TEXT NOT NULL,
  gold    INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0 AND gold <= 100000000),
  PRIMARY KEY (player, char_id),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per day, material and price: units sold for gold, the gold price history.
CREATE TABLE market_gold_prices (
  day      INTEGER NOT NULL,
  material TEXT NOT NULL,
  price    INTEGER NOT NULL CHECK (price >= 1),
  units    INTEGER NOT NULL CHECK (units >= 1),
  PRIMARY KEY (day, material, price)
);

-- One row per market listing of a material or a piece: seller, region, price, expiry and state.
CREATE TABLE market_listings (
  id          TEXT PRIMARY KEY,
  seller      TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  region      INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  kind        TEXT NOT NULL CHECK (kind IN ('material', 'piece', 'item')),
  material    TEXT,
  provenance  TEXT,
  units       INTEGER NOT NULL CHECK (units >= 1 AND units <= 5000),
  own         INTEGER NOT NULL DEFAULT 0 CHECK (own >= 0),
  bought      INTEGER NOT NULL DEFAULT 0 CHECK (bought >= 0),
  price       INTEGER NOT NULL CHECK (price >= 1 AND price <= 1000000),
  wear        INTEGER CHECK (wear IS NULL OR (wear >= 1 AND wear <= 1000)),
  fee         INTEGER NOT NULL CHECK (fee >= 1),
  at          INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'sold', 'cancelled', 'expired', 'removed')),
  closed_at   INTEGER,
  returned    INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  cancel_rid  TEXT,
  rn          TEXT,
  rid         TEXT NOT NULL,
  n           TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'marks' CHECK (currency IN ('marks', 'gold')),
  item        TEXT,
  board_x     INTEGER,
  board_y     INTEGER,
  vendor_map  INTEGER,
  vendor_id   TEXT,
  patron_hour INTEGER,
  UNIQUE (seller, rid),
  CHECK ((kind = 'material' AND material IS NOT NULL AND provenance IS NULL AND wear IS NULL AND item IS NULL) OR (kind = 'piece' AND provenance IS NOT NULL AND material IS NULL AND wear IS NOT NULL AND units = 1 AND item IS NULL) OR (kind = 'item' AND item IS NOT NULL AND material IS NULL AND provenance IS NULL AND wear IS NULL AND units = 1 AND currency = 'gold')),
  FOREIGN KEY (seller) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_market_listings_closed ON market_listings (closed_at);
CREATE INDEX idx_market_open ON market_listings (state, kind, material, price);
CREATE UNIQUE INDEX idx_market_piece_open ON market_listings (provenance) WHERE state = 'open' AND provenance IS NOT NULL;
CREATE INDEX idx_market_seller ON market_listings (seller, state);
CREATE INDEX idx_market_vendor ON market_listings (vendor_map, vendor_id, state);
CREATE INDEX idx_market_vendor_expiry ON market_listings (region, expires_at) WHERE state = 'open' AND vendor_id IS NOT NULL;
CREATE INDEX idx_market_vendor_region ON market_listings (region, at) WHERE state = 'open' AND vendor_id IS NOT NULL;
CREATE TRIGGER vendor_board_listed AFTER INSERT ON market_listings WHEN NEW.vendor_id IS NOT NULL
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT NEW.region AS r) WHERE r IS NOT NULL ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER vendor_board_listing AFTER UPDATE OF id, kind, region, material, item, own, bought, units, price, fee, wear, at, expires_at, state, currency, seller, vendor_map, vendor_id ON market_listings WHEN OLD.vendor_id IS NOT NULL OR NEW.vendor_id IS NOT NULL
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT OLD.region AS r UNION SELECT NEW.region) WHERE r IS NOT NULL ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER vendor_board_unlisted AFTER DELETE ON market_listings WHEN OLD.vendor_id IS NOT NULL
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT OLD.region AS r) WHERE r IS NOT NULL ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;

-- One row per buy order: material, units asked and left, unit price, escrow left and state.
CREATE TABLE market_orders (
  id         TEXT PRIMARY KEY,
  poster     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  region     INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  material   TEXT NOT NULL,
  units      INTEGER NOT NULL CHECK (units >= 1 AND units <= 5000),
  left_units INTEGER NOT NULL CHECK (left_units >= 0),
  price      INTEGER NOT NULL CHECK (price >= 1 AND price <= 1000000),
  escrow     INTEGER NOT NULL CHECK (escrow >= 0),
  at         INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state      TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'filled', 'cancelled', 'expired')),
  closed_at  INTEGER,
  returned   INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  rid        TEXT NOT NULL,
  n          TEXT NOT NULL,
  UNIQUE (poster, rid),
  FOREIGN KEY (poster) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_market_orders_closed ON market_orders (closed_at);
CREATE INDEX idx_market_orders_open ON market_orders (state, region, material, price);
CREATE INDEX idx_market_orders_poster ON market_orders (poster, state);

-- One row per trader listing sold to a patron: listing, map, hour, seller, region and price.
CREATE TABLE market_patron_sales (
  listing      TEXT PRIMARY KEY,
  map          INTEGER NOT NULL,
  hour         INTEGER NOT NULL,
  minute       INTEGER NOT NULL CHECK (minute >= 0 AND minute < 60),
  seed         INTEGER NOT NULL,
  seller       TEXT NOT NULL,
  char_id      TEXT NOT NULL,
  region       INTEGER NOT NULL,
  price        INTEGER NOT NULL CHECK (price >= 1),
  tax          INTEGER NOT NULL CHECK (tax >= 0),
  fee          INTEGER NOT NULL CHECK (fee >= 0),
  gets         INTEGER NOT NULL CHECK (gets >= 0),
  at           INTEGER NOT NULL,
  day          INTEGER NOT NULL,
  building_key INTEGER,
  FOREIGN KEY (seller) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_patron_sales_day ON market_patron_sales (day);
CREATE INDEX idx_patron_sales_region ON market_patron_sales (region, at);
CREATE INDEX idx_patron_sales_seller ON market_patron_sales (seller, day);
CREATE INDEX idx_patron_sales_town ON market_patron_sales (map, hour);
CREATE TRIGGER vendor_board_patron AFTER INSERT ON market_patron_sales
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT NEW.region AS r) WHERE r IS NOT NULL ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;

-- One row per day, material and price: units sold for Marks, the price history behind the medians.
CREATE TABLE market_prices (
  day      INTEGER NOT NULL,
  material TEXT NOT NULL,
  price    INTEGER NOT NULL CHECK (price >= 1),
  units    INTEGER NOT NULL CHECK (units >= 1),
  PRIMARY KEY (day, material, price)
);

-- One row per report a reader made against a listing, once per reporter.
CREATE TABLE market_reports (
  listing  TEXT NOT NULL,
  reporter TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (listing, reporter),
  FOREIGN KEY (listing) REFERENCES market_listings(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per purchase: buyer's request, what was bought, price, tax, courier and arrival.
CREATE TABLE market_sales (
  buyer       TEXT NOT NULL,
  rid         TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  listing     TEXT NOT NULL,
  seller      TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('material', 'piece', 'item')),
  material    TEXT,
  provenance  TEXT,
  units       INTEGER NOT NULL CHECK (units >= 1),
  price       INTEGER NOT NULL CHECK (price >= 1),
  total       INTEGER NOT NULL CHECK (total >= 1),
  tax         INTEGER NOT NULL CHECK (tax >= 0),
  tithe       INTEGER NOT NULL DEFAULT 0 CHECK (tithe >= 0),
  courier     INTEGER NOT NULL DEFAULT 0 CHECK (courier >= 0),
  road        INTEGER NOT NULL DEFAULT 0 CHECK (road >= 0),
  from_region INTEGER NOT NULL,
  to_region   INTEGER NOT NULL,
  arrives_at  INTEGER NOT NULL,
  delivered   INTEGER NOT NULL DEFAULT 0 CHECK (delivered IN (0, 1)),
  dn          TEXT,
  at          INTEGER NOT NULL,
  day         INTEGER NOT NULL,
  n           TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'marks' CHECK (currency IN ('marks', 'gold')),
  fee         INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
  PRIMARY KEY (buyer, rid),
  FOREIGN KEY (buyer) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_market_sales_at ON market_sales (at);
CREATE INDEX idx_market_sales_day ON market_sales (day);
CREATE INDEX idx_market_sales_material ON market_sales (material, at);
CREATE INDEX idx_market_sales_on_road ON market_sales (material, units) WHERE kind = 'material' AND delivered = 0;
CREATE INDEX idx_market_sales_road ON market_sales (buyer, delivered, arrives_at);
CREATE INDEX idx_market_sales_seller ON market_sales (seller, at);

-- One row per region: its built trader board snapshot, with the window it covers and the rows.
CREATE TABLE market_vendor_boards (
  region INTEGER PRIMARY KEY,
  built  INTEGER NOT NULL,
  shape  TEXT NOT NULL,
  since  INTEGER NOT NULL,
  until  INTEGER NOT NULL,
  rows   TEXT NOT NULL
);

-- One row per region: the version counter that says whether its trader board snapshot is still current.
CREATE TABLE market_vendor_ver (
  region INTEGER PRIMARY KEY,
  ver    INTEGER NOT NULL DEFAULT 1
);

-- One row per UTC day: how many motherlodes were picked and the mark of the pick.
CREATE TABLE motherlode_days (
  day    INTEGER PRIMARY KEY,
  picked INTEGER NOT NULL CHECK (picked >= 0 AND picked <= 3),
  n      TEXT NOT NULL
);

-- One row per strike on a day's motherlode: the character, material, quantity and XP.
CREATE TABLE motherlode_strikes (
  day      INTEGER NOT NULL,
  k        INTEGER NOT NULL,
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 1),
  xp       INTEGER NOT NULL CHECK (xp >= 0),
  watch    TEXT NOT NULL,
  at       INTEGER NOT NULL,
  rid      TEXT NOT NULL,
  n        TEXT NOT NULL,
  carry    INTEGER NOT NULL DEFAULT 0 CHECK (carry IN (0, 1)),
  PRIMARY KEY (day, player),
  UNIQUE (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_motherlode_strikes_lode ON motherlode_strikes (day, k);

-- One row per day and slot: a motherlode's pixel, ground, ore and when it rises and goes.
CREATE TABLE motherlodes (
  day       INTEGER NOT NULL,
  k         INTEGER NOT NULL CHECK (k >= 0 AND k <= 2),
  x         INTEGER NOT NULL,
  y         INTEGER NOT NULL,
  climate   INTEGER NOT NULL,
  region    INTEGER NOT NULL,
  material  TEXT NOT NULL,
  opens_at  INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  PRIMARY KEY (day, k)
);

-- One row per node taken in a day by a character: its kind, what it gave and the request that took it.
CREATE TABLE node_harvests (
  day              INTEGER NOT NULL,
  node             TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('herbs', 'food', 'ore', 'stone', 'logs', 'hide', 'fish')),
  player           TEXT NOT NULL,
  char_id          TEXT NOT NULL,
  profession       TEXT NOT NULL,
  material         TEXT NOT NULL,
  qty              INTEGER NOT NULL CHECK (qty >= 1),
  xp               INTEGER NOT NULL CHECK (xp >= 0),
  gem              TEXT,
  at               INTEGER NOT NULL,
  rid              TEXT NOT NULL,
  n                TEXT NOT NULL,
  deep_unconfirmed INTEGER NOT NULL DEFAULT 0 CHECK (deep_unconfirmed IN (0, 1)),
  extra            TEXT,
  tier             INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 7),
  extra_qty        INTEGER NOT NULL DEFAULT 1 CHECK (extra_qty >= 1),
  trophy           INTEGER NOT NULL DEFAULT 0 CHECK (trophy IN (0, 1)),
  carry            INTEGER NOT NULL DEFAULT 0 CHECK (carry IN (0, 1)),
  school           INTEGER NOT NULL DEFAULT 0 CHECK (school IN (0, 1)),
  PRIMARY KEY (day, node, kind, player, char_id),
  UNIQUE (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_node_harvests_account ON node_harvests (player, day, profession);
CREATE INDEX idx_node_harvests_carry_day ON node_harvests (carry, day);
CREATE INDEX idx_node_harvests_char_day ON node_harvests (player, char_id, day, node, kind);
CREATE INDEX idx_node_harvests_day ON node_harvests (day);
CREATE INDEX idx_node_harvests_today ON node_harvests (player, char_id, profession, day);

-- One row per crafted piece held for a live listing or auction, keyed by provenance.
CREATE TABLE piece_escrow (
  provenance TEXT PRIMARY KEY,
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  item       TEXT NOT NULL,
  at         INTEGER NOT NULL,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per crafted piece: its unique id, owner, maker, what it is, signed record and listing flag.
CREATE TABLE products (
  provenance  TEXT PRIMARY KEY CHECK (length(provenance) = 16),
  owner       TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  maker       TEXT,
  recipe      TEXT NOT NULL,
  template    INTEGER NOT NULL,
  material    INTEGER NOT NULL,
  quality     INTEGER NOT NULL CHECK (quality >= -1 AND quality <= 4),
  seed        INTEGER NOT NULL,
  record      TEXT NOT NULL,
  made_at     INTEGER NOT NULL,
  listed      INTEGER NOT NULL DEFAULT 0 CHECK (listed IN (0, 1)),
  marked      INTEGER NOT NULL DEFAULT 0 CHECK (marked IN (0, 1)),
  dye         INTEGER CHECK (dye IS NULL OR dye BETWEEN 0 AND 9),
  bought_with TEXT CHECK (bought_with IS NULL OR bought_with IN ('marks', 'gold')),
  hand        INTEGER CHECK (hand IS NULL OR hand IN (1, 2)),
  credited    INTEGER NOT NULL DEFAULT 0 CHECK (credited IN (0, 1)),
  loose       INTEGER NOT NULL DEFAULT 0 CHECK (loose IN (0, 1)),
  handed_to   TEXT
);
CREATE INDEX idx_products_owner ON products (owner);

-- One row per alchemy brew request: the potion, cauldron, potions made, Potent share and XP credited.
CREATE TABLE prof_brews (
  player    TEXT NOT NULL,
  rid       TEXT NOT NULL,
  char_id   TEXT NOT NULL,
  potion    TEXT NOT NULL,
  keys      TEXT NOT NULL,
  count     INTEGER NOT NULL CHECK (count BETWEEN 1 AND 3),
  potent    INTEGER NOT NULL CHECK (potent IN (0, 25, 40)),
  unbruised INTEGER NOT NULL DEFAULT 0 CHECK (unbruised >= 0),
  steps     INTEGER NOT NULL DEFAULT 0 CHECK (steps >= 0),
  xp        INTEGER NOT NULL CHECK (xp >= 0),
  first     INTEGER NOT NULL CHECK (first IN (0, 1)),
  at        INTEGER NOT NULL,
  n         TEXT NOT NULL,
  witnessed INTEGER NOT NULL DEFAULT 0 CHECK (witnessed IN (0, 1)),
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_prof_brews_potion ON prof_brews (player, char_id, potion);

-- Per character and material, how many units were handed to its bag or pack and not yet deposited back.
CREATE TABLE prof_carried (
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  origin   TEXT NOT NULL CHECK (origin IN ('own', 'bought', 'gold')),
  qty      INTEGER NOT NULL CHECK (qty >= 0 AND qty <= 5000),
  PRIMARY KEY (player, char_id, material, origin),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- Short-lived row per request that decides whether its held count may cut the carried count.
CREATE TABLE prof_carried_gate (
  player TEXT NOT NULL,
  rid    TEXT NOT NULL,
  PRIMARY KEY (player, rid)
);

-- One row per free first specialisation request, so a choice made is answered as made.
CREATE TABLE prof_choices (
  player     TEXT NOT NULL,
  rid        TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  profession TEXT NOT NULL,
  rank       INTEGER NOT NULL CHECK (rank IN (50, 100)),
  spec       TEXT NOT NULL,
  at         INTEGER NOT NULL,
  n          TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per anvil craft request: recipe, quality rolled, pieces made, seed and Smithing XP credited.
CREATE TABLE prof_crafts (
  player      TEXT NOT NULL,
  rid         TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  recipe      TEXT NOT NULL,
  quality     INTEGER NOT NULL CHECK (quality >= -1 AND quality <= 4),
  count       INTEGER NOT NULL CHECK (count IN (1, 2)),
  provenance  TEXT NOT NULL CHECK (length(provenance) = 16),
  provenance2 TEXT CHECK (provenance2 IS NULL OR length(provenance2) = 16),
  seed        INTEGER NOT NULL CHECK (seed >= 0 AND seed <= 4294967295),
  xp          INTEGER NOT NULL CHECK (xp >= 0),
  first       INTEGER NOT NULL CHECK (first IN (0, 1)),
  at          INTEGER NOT NULL,
  n           TEXT NOT NULL,
  heartwood   INTEGER NOT NULL DEFAULT 0 CHECK (heartwood IN (0, 1)),
  dye         INTEGER CHECK (dye IS NULL OR dye BETWEEN 0 AND 9),
  first_paid  INTEGER CHECK (first_paid IS NULL OR first_paid IN (0, 1)),
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_prof_crafts_recipe ON prof_crafts (player, char_id, recipe);

-- One row per deposit request moving carried units into the Stores, split by own, bought and gold origin.
CREATE TABLE prof_deposits (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 1),
  own      INTEGER NOT NULL DEFAULT 0 CHECK (own >= 0),
  bought   INTEGER NOT NULL DEFAULT 0 CHECK (bought >= 0),
  gold     INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  at       INTEGER NOT NULL,
  n        TEXT NOT NULL,
  loose    INTEGER NOT NULL DEFAULT 0 CHECK (loose >= 0),
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per disenchant request: the piece, recipe, points, Essence given with its origin, and XP credited.
CREATE TABLE prof_disenchants (
  player     TEXT NOT NULL,
  rid        TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  provenance TEXT NOT NULL UNIQUE CHECK (length(provenance) = 16),
  recipe     TEXT NOT NULL,
  points     INTEGER NOT NULL CHECK (points >= 0),
  essence    INTEGER NOT NULL CHECK (essence >= 1),
  origin     TEXT NOT NULL CHECK (origin IN ('own', 'bought', 'gold', 'loose')),
  xp         INTEGER NOT NULL CHECK (xp >= 0),
  at         INTEGER NOT NULL,
  n          TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per master work a character made in a UTC day: its signed lines, seed and the piece's id.
CREATE TABLE prof_masters (
  player     TEXT NOT NULL,
  rid        TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  day        INTEGER NOT NULL CHECK (day >= 0),
  recipe     TEXT NOT NULL,
  provenance TEXT NOT NULL,
  lines      TEXT NOT NULL,
  seed       INTEGER NOT NULL CHECK (seed >= 0),
  at         INTEGER NOT NULL,
  n          TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  UNIQUE (player, char_id, day),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per Essence reforge request: the piece's rerolled line, its seed and the Essence spent.
CREATE TABLE prof_reforges (
  player  TEXT NOT NULL,
  rid     TEXT NOT NULL,
  char_id TEXT NOT NULL,
  tier    TEXT NOT NULL CHECK (tier IN ('magic', 'rare')),
  essence INTEGER NOT NULL CHECK (essence > 0),
  seed    INTEGER NOT NULL CHECK (seed >= 0 AND seed <= 4294967295),
  at      INTEGER NOT NULL,
  n       TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- Per character, the bolts of Linen and Wool bought with silver and not yet used up by its stations.
CREATE TABLE prof_silver_cloth (
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (player, char_id, material),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per forge smelt request: recipe, count, own and bought products made, and Smithing XP given.
CREATE TABLE prof_smelts (
  player  TEXT NOT NULL,
  rid     TEXT NOT NULL,
  char_id TEXT NOT NULL,
  recipe  TEXT NOT NULL,
  count   INTEGER NOT NULL CHECK (count >= 1 AND count <= 100),
  own     INTEGER NOT NULL CHECK (own >= 0),
  bought  INTEGER NOT NULL CHECK (bought >= 0),
  xp      INTEGER NOT NULL CHECK (xp >= 0),
  at      INTEGER NOT NULL,
  n       TEXT NOT NULL,
  first   INTEGER NOT NULL DEFAULT 0 CHECK (first IN (0, 1)),
  clean   INTEGER NOT NULL DEFAULT 0 CHECK (clean IN (0, 1)),
  loose   INTEGER NOT NULL DEFAULT 0 CHECK (loose >= 0),
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_prof_smelts_recipe ON prof_smelts (player, char_id, recipe);

-- One row per purchase of fittings bought into the Stores for Marks, keyed on the request.
CREATE TABLE prof_stock (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 1 AND qty <= 100),
  marks    INTEGER NOT NULL CHECK (marks >= 1),
  at       INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- Per character and material, the units held in the Stores, split by where each unit came from.
CREATE TABLE prof_stores (
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  origin   TEXT NOT NULL CHECK (origin IN ('own', 'bought', 'gold', 'loose')),
  qty      INTEGER NOT NULL CHECK (qty >= 0 AND qty <= 5000),
  PRIMARY KEY (player, char_id, material, origin),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per temper request: the piece, the quality it made and the inputs and XP spent.
CREATE TABLE prof_tempers (
  player     TEXT NOT NULL,
  rid        TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  recipe     TEXT NOT NULL,
  provenance TEXT,
  quality    INTEGER NOT NULL CHECK (quality BETWEEN 1 AND 3),
  material   TEXT NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  xp         INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  at         INTEGER NOT NULL,
  n          TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per character and profession: its XP, chosen specialisations and any pending paid change.
CREATE TABLE prof_tracks (
  player      TEXT NOT NULL,
  char_id     TEXT NOT NULL,
  profession  TEXT NOT NULL,
  xp          INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0 AND xp <= 100000),
  spec50      TEXT,
  spec100     TEXT,
  respec_rank INTEGER CHECK (respec_rank IS NULL OR respec_rank IN (50, 100)),
  respec_to   TEXT,
  respec_at   INTEGER,
  updated_at  INTEGER NOT NULL,
  free_respec INTEGER NOT NULL DEFAULT 0,
  spec50_at   INTEGER,
  spec100_at  INTEGER,
  PRIMARY KEY (player, char_id, profession),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- Per character and herb, how many picked unbruised herbs are still counted beside the Stores.
CREATE TABLE prof_unbruised (
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (player, char_id, material),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per withdrawal request moving Stores units out to the pack, so a lost answer can be repeated.
CREATE TABLE prof_withdrawals (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 1),
  at       INTEGER NOT NULL,
  n        TEXT NOT NULL,
  carry    INTEGER NOT NULL DEFAULT 0 CHECK (carry IN (0, 1)),
  own      INTEGER NOT NULL DEFAULT 0 CHECK (own >= 0),
  bought   INTEGER NOT NULL DEFAULT 0 CHECK (bought >= 0),
  gold     INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  loose    INTEGER NOT NULL DEFAULT 0 CHECK (loose >= 0),
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per region and day: how many court writs are active and when they were posted.
CREATE TABLE writ_days (
  day    INTEGER NOT NULL,
  region INTEGER NOT NULL,
  active INTEGER NOT NULL,
  posted INTEGER NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (day, region)
);

-- One row per court writ for a region and day: its material, quantity, pay, renown and who filled it.
CREATE TABLE writs (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('court', 'hall', 'member')),
  day         INTEGER NOT NULL,
  region      INTEGER NOT NULL,
  faction     INTEGER NOT NULL DEFAULT 0,
  owner       TEXT NOT NULL DEFAULT '',
  slot        INTEGER NOT NULL,
  material    TEXT NOT NULL,
  tier        INTEGER NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty >= 1),
  pay         INTEGER NOT NULL CHECK (pay >= 1),
  renown      INTEGER NOT NULL CHECK (renown >= 0),
  expires_at  INTEGER NOT NULL,
  filled_by   TEXT,
  filled_char TEXT,
  filled_at   INTEGER,
  rid         TEXT,
  n           TEXT,
  UNIQUE (day, region, kind, faction, owner, slot)
);
CREATE UNIQUE INDEX idx_writs_fill_rid ON writs (filled_by, rid) WHERE filled_by IS NOT NULL;
CREATE INDEX idx_writs_filled_day ON writs (filled_by, day);
CREATE INDEX idx_writs_owner ON writs (day, owner, region, kind, faction);

-- ==== Faction chapters and reputation =================================================================================

-- One row per paid bounty a character reported clearing: a board notice or the week's named mark, with tier and day.
CREATE TABLE hunt_clears (
  player  TEXT NOT NULL,
  char_id TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('board', 'mark')),
  key     TEXT NOT NULL,
  id      TEXT NOT NULL,
  tier    INTEGER NOT NULL,
  region  INTEGER,
  day     INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (player, char_id, kind, key),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX hunt_clears_day ON hunt_clears (player, day);

-- One row per character's backing in a season: the side taken in a schism or succession.
CREATE TABLE npc_chapter_backing (
  faction INTEGER NOT NULL,
  region  INTEGER NOT NULL,
  season  INTEGER NOT NULL,
  account TEXT NOT NULL,
  char_id TEXT NOT NULL,
  side    INTEGER NOT NULL CHECK (side BETWEEN 0 AND 2),
  at      INTEGER NOT NULL,
  PRIMARY KEY (faction, region, season, account)
);
CREATE INDEX idx_npc_chapter_backing_season ON npc_chapter_backing (season, region, account);

-- One row per recorded chapter event: faction, region, week, kind, character and data.
CREATE TABLE npc_chapter_history (
  seq     INTEGER PRIMARY KEY,
  faction INTEGER NOT NULL,
  region  INTEGER NOT NULL,
  week    INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  char_id TEXT NOT NULL,
  data    TEXT NOT NULL DEFAULT '{}',
  at      INTEGER NOT NULL
);
CREATE INDEX idx_npc_chapter_history_chapter ON npc_chapter_history (faction, region, seq);
CREATE INDEX idx_npc_chapter_history_char ON npc_chapter_history (char_id, week);
CREATE INDEX idx_npc_chapter_history_region ON npc_chapter_history (region, seq);
CREATE INDEX idx_npc_chapter_history_week ON npc_chapter_history (week, kind);

-- One row per merit credit a character earned for a chapter in a week, by source and amount.
CREATE TABLE npc_chapter_merit (
  week    INTEGER NOT NULL,
  faction INTEGER NOT NULL,
  region  INTEGER NOT NULL,
  account TEXT NOT NULL,
  char_id TEXT NOT NULL,
  source  TEXT NOT NULL CHECK (source IN ('writ', 'gate', 'raid')),
  amount  INTEGER NOT NULL CHECK (amount >= 1),
  ref     TEXT NOT NULL,
  at      INTEGER NOT NULL,
  UNIQUE (char_id, faction, source, ref)
);
CREATE INDEX idx_npc_chapter_merit_account ON npc_chapter_merit (week, account, faction);
CREATE INDEX idx_npc_chapter_merit_act ON npc_chapter_merit (char_id, source, ref);
CREATE INDEX idx_npc_chapter_merit_chapter ON npc_chapter_merit (week, faction, region);

-- One row per guild's bid for a chapter's patronage in a season: amount, time and state.
CREATE TABLE npc_chapter_patron_bids (
  faction  INTEGER NOT NULL,
  region   INTEGER NOT NULL,
  season   INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  amount   INTEGER NOT NULL CHECK (amount > 0),
  at       INTEGER NOT NULL,
  state    TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'won', 'lost')),
  PRIMARY KEY (faction, region, season, guild_id)
);
CREATE INDEX idx_npc_chapter_patron_bids_guild ON npc_chapter_patron_bids (guild_id, season, state);
CREATE INDEX idx_npc_chapter_patron_bids_season ON npc_chapter_patron_bids (season, state);

-- One row per chapter seat: the master or officer character, since when, and the week placed.
CREATE TABLE npc_chapter_seats (
  faction INTEGER NOT NULL,
  region  INTEGER NOT NULL,
  char_id TEXT NOT NULL,
  account TEXT NOT NULL,
  seat    TEXT NOT NULL CHECK (seat IN ('master', 'officer')),
  since   INTEGER NOT NULL,
  week    INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (faction, region, char_id)
);
CREATE INDEX idx_npc_chapter_seats_char ON npc_chapter_seats (char_id);

-- One row per week turned: how many chapters were active, the target and whether chapters were open.
CREATE TABLE npc_chapter_weeks (
  week     INTEGER PRIMARY KEY,
  active   INTEGER NOT NULL,
  target   INTEGER NOT NULL,
  chapters INTEGER NOT NULL,
  open     TEXT NOT NULL DEFAULT 'on' CHECK (open IN ('dev', 'on', 'off')),
  at       INTEGER NOT NULL
);

-- One row per faction and region chapter: its strength, merit, focus and current standing.
CREATE TABLE npc_chapters (
  faction         INTEGER NOT NULL,
  region          INTEGER NOT NULL,
  strength        INTEGER NOT NULL CHECK (strength BETWEEN 0 AND 100),
  week            INTEGER NOT NULL,
  merit           INTEGER NOT NULL DEFAULT 0,
  at              INTEGER NOT NULL,
  focus           TEXT,
  focus_week      INTEGER,
  event           TEXT CHECK (event IS NULL OR event IN ('calm', 'schism', 'succession', 'crackdown', 'rivalry', 'decline', 'ascendancy')),
  event_season    INTEGER,
  event_data      TEXT NOT NULL DEFAULT '{}',
  shut_season     INTEGER,
  doctrine        TEXT CHECK (doctrine IS NULL OR doctrine IN ('training', 'shelf', 'writs')),
  doctrine_season INTEGER,
  patron          TEXT,
  patron_season   INTEGER,
  PRIMARY KEY (faction, region)
);
CREATE INDEX idx_npc_chapters_region ON npc_chapters (region);

-- One row per region: its chapters computed from hall reports, with the version they were read under.
CREATE TABLE npc_hall_regions (
  region   INTEGER PRIMARY KEY,
  chapters TEXT NOT NULL DEFAULT '[]',
  ver      INTEGER NOT NULL DEFAULT 1,
  done     INTEGER NOT NULL DEFAULT 0,
  at       INTEGER NOT NULL DEFAULT 0
);

-- One row per town struck from the halls list: map, moderator and time.
CREATE TABLE npc_hall_strikes (
  map_id INTEGER PRIMARY KEY,
  by     TEXT,
  at     INTEGER NOT NULL
);

-- One row per receipt a character claimed: the reputation it credited to a faction.
CREATE TABLE npc_receipt_credits (
  char_id    TEXT NOT NULL,
  faction_id INTEGER NOT NULL,
  ref        TEXT NOT NULL,
  player     TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  tag        TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (char_id, faction_id, ref)
);
CREATE INDEX idx_npc_receipt_credits_ref ON npc_receipt_credits (char_id, ref);
CREATE INDEX idx_npc_receipt_credits_tag ON npc_receipt_credits (char_id, tag);

-- One row per reputation claim by a character: amount asked, amount credited and request.
CREATE TABLE npc_rep_events (
  seq        INTEGER PRIMARY KEY,
  char_id    TEXT NOT NULL,
  player     TEXT NOT NULL,
  faction_id INTEGER NOT NULL,
  asked      INTEGER NOT NULL,
  credited   INTEGER NOT NULL,
  rid        TEXT NOT NULL,
  at         INTEGER NOT NULL
);
CREATE INDEX npc_rep_events_char ON npc_rep_events (char_id, at);
CREATE INDEX npc_rep_events_rid ON npc_rep_events (char_id, rid);

-- One row per character and faction: its reputation, daily gain and amount owed.
CREATE TABLE npc_roll (
  char_id    TEXT NOT NULL,
  faction_id INTEGER NOT NULL,
  player     TEXT NOT NULL,
  rep        INTEGER NOT NULL DEFAULT 0,
  gained_day INTEGER NOT NULL DEFAULT 0,
  gained     INTEGER NOT NULL DEFAULT 0,
  owed       INTEGER NOT NULL DEFAULT 0,
  member     INTEGER NOT NULL DEFAULT 0,
  rank       INTEGER,
  joined_at  INTEGER,
  dormant    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (char_id, faction_id)
);

-- One row per character on the roll: the cap its seed was taken under, its claim sequence and last request.
CREATE TABLE npc_roll_heads (
  char_id    TEXT PRIMARY KEY,
  player     TEXT NOT NULL,
  cap        INTEGER NOT NULL,
  seq        INTEGER NOT NULL DEFAULT 0,
  last_rid   TEXT,
  tag        TEXT,
  seeded_at  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  kseq       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX npc_roll_heads_player ON npc_roll_heads (player);

-- ==== Town seats, town economy and witnessed facts ====================================================================

-- A single row holding the seats' facts, kept once for the whole service, with the second it was made.
CREATE TABLE seat_facts_kept (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  at    INTEGER NOT NULL,
  facts TEXT NOT NULL
);

-- One row per account and region: the seat of power that account's client reported for the region.
CREATE TABLE town_domain_witness (
  region  INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  account TEXT NOT NULL,
  report  TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (region, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per account, town, day and source: how many counted acts it made there, for the daily caps.
CREATE TABLE town_econ_acts (
  account TEXT NOT NULL,
  map     INTEGER NOT NULL,
  day     INTEGER NOT NULL,
  src     TEXT NOT NULL CHECK (src IN ('watch', 'trade', 'raid', 'sea')),
  n       INTEGER NOT NULL CHECK (n >= 1),
  PRIMARY KEY (account, map, day, src),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_town_econ_acts_day ON town_econ_acts (day);

-- One row per town and day: its counted acts by source, which the town's share is read from.
CREATE TABLE town_econ_days (
  map INTEGER NOT NULL,
  day INTEGER NOT NULL,
  src TEXT NOT NULL CHECK (src IN ('watch', 'trade', 'raid', 'sea')),
  n   INTEGER NOT NULL CHECK (n >= 1),
  PRIMARY KEY (map, day, src)
);
CREATE INDEX idx_town_econ_days_day ON town_econ_days (day);

-- A single row holding the towns' economy shares, worked out once for the whole service.
CREATE TABLE town_econ_kept (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  at    INTEGER NOT NULL,
  towns TEXT NOT NULL
);

-- One row per watch tick already counted, so a tick is counted once however often it is claimed.
CREATE TABLE town_econ_seen (
  ref TEXT PRIMARY KEY,
  day INTEGER NOT NULL
);
CREATE INDEX idx_town_econ_seen_day ON town_econ_seen (day);

-- One row per map id a developer has struck, which is never witnessed again.
CREATE TABLE town_econ_struck (
  map INTEGER PRIMARY KEY,
  by  TEXT,
  at  INTEGER NOT NULL
);

-- One row per confirmed town: the first confirmed answer for a map id, pixel and region location.
CREATE TABLE town_econ_towns (
  map      INTEGER PRIMARY KEY CHECK (map > 0),
  px       INTEGER NOT NULL,
  py       INTEGER NOT NULL,
  region   INTEGER NOT NULL,
  location INTEGER NOT NULL,
  at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_town_econ_towns_pixel ON town_econ_towns (px, py);
CREATE UNIQUE INDEX idx_town_econ_towns_place ON town_econ_towns (region, location);

-- One row per seat and battle week: the holder's defence bonus and whether the challenger is barred.
CREATE TABLE town_seat_aftermath (
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  what     TEXT NOT NULL CHECK (what IN ('bonus', 'barred')),
  PRIMARY KEY (week, key, guild_id, what)
);

-- One row per seat battle in a week: its schedule, room, state and start and end times.
CREATE TABLE town_seat_battles (
  week      INTEGER NOT NULL,
  key       INTEGER NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('siege', 'tourney', 'revolt')),
  tier      TEXT NOT NULL CHECK (tier IN ('palace', 'crown')),
  attacker  TEXT NOT NULL,
  defender  TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at   INTEGER NOT NULL,
  moved     INTEGER NOT NULL DEFAULT 0 CHECK (moved IN (0, 1)),
  state     TEXT NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled', 'fought', 'forfeit', 'void')),
  at        INTEGER NOT NULL,
  field     TEXT,
  rams      INTEGER NOT NULL DEFAULT 0 CHECK (rams >= 0),
  works     TEXT,
  PRIMARY KEY (week, key)
);
CREATE INDEX idx_town_seat_battles_start ON town_seat_battles (starts_at);

-- One row per account and week: the guild whose seats that account's contributions count for.
CREATE TABLE town_seat_binds (
  week     INTEGER NOT NULL,
  account  TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (week, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per camp an account cleared and was paid for under a seat's bounty, at most once a day.
CREATE TABLE town_seat_bounties (
  day     INTEGER NOT NULL,
  site    TEXT NOT NULL,
  account TEXT NOT NULL,
  key     INTEGER NOT NULL,
  week    INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  n       TEXT NOT NULL,
  PRIMARY KEY (day, site),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_town_seat_bounties_account ON town_seat_bounties (account, day);

-- One row per royal tourney bout: its winner and loser, and whether the ladder counted it.
CREATE TABLE town_seat_bouts (
  week    INTEGER NOT NULL,
  key     INTEGER NOT NULL,
  n       INTEGER NOT NULL,
  winner  TEXT NOT NULL,
  loser   TEXT NOT NULL,
  day     INTEGER NOT NULL,
  counted INTEGER NOT NULL CHECK (counted IN (0, 1)),
  at      INTEGER NOT NULL,
  PRIMARY KEY (week, key, n)
);
CREATE INDEX idx_town_seat_bouts_pair ON town_seat_bouts (week, key, day, winner, loser);

-- One row per challenger siege camp: what its writs delivered at a pledged seat in a week.
CREATE TABLE town_seat_camps (
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (week, key, guild_id, material)
);

-- One row per edict a seat's holder proposed for a week: its cost, state and any bounty set aside.
CREATE TABLE town_seat_edicts (
  key       INTEGER NOT NULL,
  week      INTEGER NOT NULL,
  edict     TEXT NOT NULL CHECK (edict IN ('market-day', 'open-gates', 'curfew', 'festival', 'levy', 'bounty', 'conscription', 'royal-tourney')),
  guild_id  TEXT NOT NULL,
  set_by    TEXT NOT NULL,
  set_aside INTEGER NOT NULL DEFAULT 0 CHECK (set_aside >= 0),
  spent     INTEGER NOT NULL DEFAULT 0 CHECK (spent >= 0 AND spent <= set_aside),
  state     TEXT NOT NULL DEFAULT 'proclaimed' CHECK (state IN ('proclaimed', 'law', 'unpaid', 'void', 'returned')),
  cost      INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  at        INTEGER NOT NULL,
  PRIMARY KEY (key, week),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_town_seat_edicts_week ON town_seat_edicts (week, state);

-- One row per account and battle: the banner and throne points its game derived, plus the settled field.
CREATE TABLE town_seat_fields (
  week    INTEGER NOT NULL,
  key     INTEGER NOT NULL,
  account TEXT NOT NULL,
  side    TEXT NOT NULL CHECK (side IN ('attack', 'defend')),
  field   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (week, key, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per seat, building project and material: the quantity a project holds from the stockpile.
CREATE TABLE town_seat_fort_held (
  key      INTEGER NOT NULL,
  work     TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (key, work, material)
);

-- One row per seat and season recording that its Fortifier's save has been used.
CREATE TABLE town_seat_fortifier (
  season  INTEGER NOT NULL,
  key     INTEGER NOT NULL,
  account TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (season, key)
);

-- One row per seat and work: its fortification tier, building in progress, owning guild and builder flag.
CREATE TABLE town_seat_forts (
  key         INTEGER NOT NULL,
  work        TEXT NOT NULL,
  tier        INTEGER NOT NULL DEFAULT 0 CHECK (tier >= 0 AND tier <= 3),
  building    INTEGER CHECK (building IS NULL OR (building >= 1 AND building <= 3)),
  guild_id    TEXT,
  builder     INTEGER NOT NULL DEFAULT 0 CHECK (builder IN (0, 1)),
  stands_at   INTEGER,
  at          INTEGER NOT NULL,
  siegewright INTEGER NOT NULL DEFAULT 0 CHECK (siegewright IN (0, 1)),
  PRIMARY KEY (key, work)
);

-- One row per material gift a player made to a seat's stockpile: giver, guild, quantity and units they gathered.
CREATE TABLE town_seat_gifts (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  key      INTEGER NOT NULL,
  camp     INTEGER NOT NULL CHECK (camp IN (0, 1)),
  week     INTEGER NOT NULL,
  region   INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  material TEXT NOT NULL,
  units    INTEGER NOT NULL CHECK (units >= 1),
  own      INTEGER NOT NULL CHECK (own >= 0 AND own <= units),
  who      TEXT NOT NULL,
  at       INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (player, rid)
);
CREATE INDEX idx_town_seat_gifts_key ON town_seat_gifts (key, guild_id, camp, at);

-- One row per sellsword contract: the account a guild hired for a battle, its fee and whether it was signed.
CREATE TABLE town_seat_hires (
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  account  TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  fee      INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0 AND fee <= 5000),
  state    TEXT NOT NULL DEFAULT 'offered' CHECK (state IN ('offered', 'signed', 'withdrawn')),
  by_name  TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (week, key, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per chronicle event at a seat, such as a claim, siege, tourney or strike, with its week and data.
CREATE TABLE town_seat_history (
  seq  INTEGER PRIMARY KEY,
  key  INTEGER NOT NULL,
  week INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  at   INTEGER NOT NULL
);
CREATE INDEX idx_town_seat_history_key ON town_seat_history (key, seq);

-- One row per seat held: the guild holding it, its region and whether it is in truce.
CREATE TABLE town_seat_holds (
  key        INTEGER PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  region     INTEGER NOT NULL,
  tier       TEXT NOT NULL CHECK (tier IN ('palace', 'crown')),
  since_week INTEGER NOT NULL,
  standing   INTEGER NOT NULL DEFAULT 50 CHECK (standing >= 0 AND standing <= 100),
  truce_week INTEGER,
  at         INTEGER NOT NULL,
  tithe      INTEGER NOT NULL DEFAULT 0 CHECK (tithe >= 0 AND tithe <= 18),
  tithe_week INTEGER,
  owed       INTEGER NOT NULL DEFAULT 0 CHECK (owed >= 0),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_town_seat_holds_guild ON town_seat_holds (guild_id, region);
CREATE TRIGGER seat_hall_decor_handed AFTER UPDATE OF guild_id ON town_seat_holds WHEN NEW.guild_id IS NOT OLD.guild_id
BEGIN
  DELETE FROM seat_hall_decor WHERE map_id = NEW.key;
END;
CREATE TRIGGER seat_hall_decor_lapsed AFTER DELETE ON town_seat_holds
BEGIN
  DELETE FROM seat_hall_decor WHERE map_id = OLD.key;
END;

-- One row per account and battle: the honours claimed, the character credited and its roll on the spoils.
CREATE TABLE town_seat_honours (
  week    INTEGER NOT NULL,
  key     INTEGER NOT NULL,
  account TEXT NOT NULL,
  side    TEXT NOT NULL CHECK (side IN ('attack', 'defend')),
  char_id TEXT NOT NULL,
  marks   INTEGER NOT NULL DEFAULT 0 CHECK (marks >= 0),
  xp      INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  spoil   TEXT,
  rid     TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (week, key, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per influence entry a guild earned at a seat: the account, character, week and kind of contribution.
CREATE TABLE town_seat_influence (
  id       INTEGER PRIMARY KEY,
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  account  TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  source   TEXT NOT NULL CHECK (source IN ('watch', 'gate', 'writ', 'bought', 'tribute', 'raid', 'hunt')),
  amount   INTEGER NOT NULL CHECK (amount >= 0),
  region   INTEGER,
  day      INTEGER,
  ref      TEXT NOT NULL,
  at       INTEGER NOT NULL,
  voided   INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0, 1)),
  UNIQUE (source, ref)
);
CREATE INDEX idx_town_seat_influence_account ON town_seat_influence (account, source, day);
CREATE INDEX idx_town_seat_influence_seat ON town_seat_influence (week, key, guild_id);

-- One row per guild and seat: the influence carried into a week from the previous one.
CREATE TABLE town_seat_legacy (
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  amount   INTEGER NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (week, key, guild_id)
);

-- One row per harvest levied for a seat: the player, request, material and quantity taken.
CREATE TABLE town_seat_levies (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  key      INTEGER NOT NULL,
  week     INTEGER NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 1),
  at       INTEGER NOT NULL,
  PRIMARY KEY (player, rid)
);

-- One row per guild and seat week: the seat that guild pledged in a region and who set it.
CREATE TABLE town_seat_pledges (
  week     INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  region   INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  set_by   TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (week, guild_id, region),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_town_seat_pledges_key ON town_seat_pledges (week, key);

-- One row per red announcement about the seats, such as a pact broken early, shown for a day.
CREATE TABLE town_seat_red (
  seq  INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  at   INTEGER NOT NULL
);
CREATE INDEX idx_town_seat_red_at ON town_seat_red (at);

-- One row per account, region and week: the Renown XP credited there, counted as influence at the guild's seat.
CREATE TABLE town_seat_renown (
  week    INTEGER NOT NULL,
  account TEXT NOT NULL,
  char_id TEXT NOT NULL,
  region  INTEGER NOT NULL,
  xp      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, account, char_id, region),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per seat battle: the result reported by the first fighter's receipt and whether attackers raised a banner.
CREATE TABLE town_seat_results (
  week   INTEGER NOT NULL,
  key    INTEGER NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('attack', 'defend', 'tie', 'forfeit', 'absent')),
  raised INTEGER NOT NULL DEFAULT 0 CHECK (raised IN (0, 1)),
  winner TEXT,
  rid    TEXT NOT NULL,
  at     INTEGER NOT NULL,
  prior  TEXT,
  PRIMARY KEY (week, key)
);

-- One row per season and guild: a ribbon the guild earned that season.
CREATE TABLE town_seat_ribbons (
  season   INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (season, guild_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- One row per battle a weekly turning named: a right of siege or a contested seat's tourney.
CREATE TABLE town_seat_rights (
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('siege', 'tourney')),
  guild_id TEXT NOT NULL,
  against  TEXT,
  total    INTEGER NOT NULL DEFAULT 0,
  defence  INTEGER NOT NULL DEFAULT 0,
  at       INTEGER NOT NULL,
  PRIMARY KEY (week, key),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX idx_town_seat_rights_guild ON town_seat_rights (guild_id, week);

-- One row per account signed to a battle: its guild, side, character and any sellsword fee.
CREATE TABLE town_seat_rosters (
  week      INTEGER NOT NULL,
  key       INTEGER NOT NULL,
  account   TEXT NOT NULL,
  char_id   TEXT NOT NULL,
  guild_id  TEXT NOT NULL,
  side      TEXT NOT NULL CHECK (side IN ('attack', 'defend')),
  sellsword INTEGER NOT NULL DEFAULT 0 CHECK (sellsword IN (0, 1)),
  fee       INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
  at        INTEGER NOT NULL,
  PRIMARY KEY (week, key, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_town_seat_rosters_guild ON town_seat_rosters (guild_id, week);

-- One row per royal tourney week and crown: the settled ring and the champion the turning named.
CREATE TABLE town_seat_royal (
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  field    TEXT,
  champion TEXT,
  at       INTEGER NOT NULL,
  PRIMARY KEY (week, key)
);

-- One row per account, week and crown: the ring centre that contender's game derived.
CREATE TABLE town_seat_royal_fields (
  week    INTEGER NOT NULL,
  key     INTEGER NOT NULL,
  account TEXT NOT NULL,
  field   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (week, key, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- A single row naming who is settling the week right now and until when, so only one settler runs.
CREATE TABLE town_seat_settling (
  id     INTEGER PRIMARY KEY CHECK (id = 1),
  holder TEXT NOT NULL,
  until  INTEGER NOT NULL
);

-- One row per seat and material: the quantity in the seat's stockpile, which is never withdrawn.
CREATE TABLE town_seat_stockpile (
  key      INTEGER NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (key, material)
);

-- One row per title an account keeps for good, such as a royal tourney champion's.
CREATE TABLE town_seat_titles (
  account TEXT NOT NULL,
  title   TEXT NOT NULL CHECK (title IN ('champion', 'crowned', 'keeper')),
  key     INTEGER NOT NULL,
  week    INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (account, title, key, week),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per seat week already settled, which makes the weekly settle run only once.
CREATE TABLE town_seat_weeks (
  week       INTEGER PRIMARY KEY,
  settled_at INTEGER NOT NULL
);

-- One row per seat: the day and start hour its holder set for the seat's weekly battle.
CREATE TABLE town_seat_windows (
  key      INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  day      INTEGER NOT NULL CHECK (day >= 0 AND day <= 3),
  hour     INTEGER NOT NULL CHECK ((hour >= 16 AND hour <= 23) OR (hour >= 0 AND hour <= 2)),
  set_by   TEXT NOT NULL,
  at       INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- One row per witnessed kind and key: the report that was confirmed and when.
CREATE TABLE witness_confirmed (
  kind   TEXT NOT NULL,
  key    TEXT NOT NULL,
  report TEXT,
  at     INTEGER,
  PRIMARY KEY (kind, key)
);
CREATE TRIGGER witness_confirmed_moved AFTER UPDATE OF report, at ON witness_confirmed
BEGIN
  UPDATE world_witness SET late = 0 WHERE rowid IN (SELECT rowid FROM world_witness INDEXED BY idx_world_witness_late WHERE kind = NEW.kind AND key = NEW.key AND late = 1 AND report = NEW.report AND at <= NEW.at);
  UPDATE world_witness SET late = 1 WHERE rowid IN (SELECT rowid FROM world_witness INDEXED BY idx_world_witness_lean_key WHERE kind = NEW.kind AND key = NEW.key AND kind IN ('npchall', 'seat') AND late = 0 AND report = NEW.report AND at > NEW.at);
END;
CREATE TRIGGER witness_confirmed_turned AFTER UPDATE OF report ON witness_confirmed WHEN OLD.report IS NOT NEW.report
BEGIN
  UPDATE world_witness SET late = 0 WHERE rowid IN (SELECT rowid FROM world_witness INDEXED BY idx_world_witness_late WHERE kind = NEW.kind AND key = NEW.key AND late = 1 AND report IS NOT NEW.report);
END;

-- One row per witnessing account and fact: the report that account sent, with its region and time.
CREATE TABLE world_witness (
  kind    TEXT NOT NULL CHECK (kind IN ('pixel', 'dungeon', 'hub', 'seat', 'npchall', 'town')),
  key     TEXT NOT NULL,
  account TEXT NOT NULL,
  report  TEXT NOT NULL,
  region  INTEGER,
  at      INTEGER NOT NULL,
  late    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, key, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_world_witness_account ON world_witness (account, kind);
CREATE INDEX idx_world_witness_late ON world_witness (kind, key, at) WHERE late = 1;
CREATE INDEX idx_world_witness_lean_key ON world_witness (kind, key) WHERE kind IN ('npchall', 'seat') AND late = 0;
CREATE INDEX idx_world_witness_lean_region ON world_witness (kind, region, key) WHERE kind IN ('npchall', 'seat') AND late = 0;
CREATE INDEX idx_world_witness_region ON world_witness (kind, region);
CREATE TRIGGER witness_lean_fixed BEFORE UPDATE OF kind, key, account, report, at ON world_witness WHEN OLD.kind IN ('npchall', 'seat') OR NEW.kind IN ('npchall', 'seat')
BEGIN
  SELECT RAISE(ABORT, 'a hall''s or a seat''s answer is never rewritten: delete it and give it again (migration 0135)');
END;
CREATE TRIGGER witness_lean_in AFTER INSERT ON world_witness WHEN NEW.kind IN ('npchall', 'seat')
BEGIN
  INSERT INTO witness_confirmed (kind, key) SELECT NEW.kind, NEW.key WHERE NOT EXISTS (SELECT 1 FROM witness_confirmed WHERE kind = NEW.kind AND key = NEW.key);
  UPDATE witness_confirmed SET (report, at) = ( SELECT report, at FROM ( SELECT report, account, at, ROW_NUMBER() OVER (PARTITION BY report ORDER BY at, account) AS n FROM ( SELECT report, account, at FROM world_witness INDEXED BY idx_world_witness_lean_key WHERE kind = NEW.kind AND key = NEW.key AND kind IN ('npchall', 'seat') AND late = 0 UNION ALL SELECT report, account, at FROM world_witness INDEXED BY idx_world_witness_late WHERE kind = NEW.kind AND key = NEW.key AND late = 1 AND at = (SELECT MIN(at) FROM world_witness INDEXED BY idx_world_witness_late WHERE kind = NEW.kind AND key = NEW.key AND late = 1))) WHERE n = 3 ORDER BY at, account LIMIT 1) WHERE kind = NEW.kind AND key = NEW.key AND (report IS NULL OR NEW.at <= at);
  UPDATE world_witness SET late = 1 WHERE kind = NEW.kind AND key = NEW.key AND account = NEW.account AND late = 0 AND EXISTS (SELECT 1 FROM witness_confirmed c WHERE c.kind = NEW.kind AND c.key = NEW.key AND c.report = NEW.report AND NEW.at > c.at);
END;
CREATE TRIGGER witness_lean_out AFTER DELETE ON world_witness WHEN OLD.kind IN ('npchall', 'seat') AND OLD.late = 0
BEGIN
  UPDATE witness_confirmed SET (report, at) = ( SELECT report, at FROM ( SELECT report, account, at, ROW_NUMBER() OVER (PARTITION BY report ORDER BY at, account) AS n FROM ( SELECT report, account, at FROM world_witness INDEXED BY idx_world_witness_lean_key WHERE kind = OLD.kind AND key = OLD.key AND kind IN ('npchall', 'seat') AND late = 0 UNION ALL SELECT report, account, at FROM world_witness INDEXED BY idx_world_witness_late WHERE kind = OLD.kind AND key = OLD.key AND late = 1 AND at = (SELECT MIN(at) FROM world_witness INDEXED BY idx_world_witness_late WHERE kind = OLD.kind AND key = OLD.key AND late = 1))) WHERE n = 3 ORDER BY at, account LIMIT 1) WHERE kind = OLD.kind AND key = OLD.key AND report = OLD.report AND OLD.at <= at;
  DELETE FROM witness_confirmed WHERE kind = OLD.kind AND key = OLD.key AND report IS NULL AND NOT EXISTS (SELECT 1 FROM world_witness WHERE kind = OLD.kind AND key = OLD.key);
END;

-- ==== Arena, gates, raids, sea and the wild ===========================================================================

-- One row per arena ticket a player asked for: its tier, step and bout room, and whether it was claimed.
CREATE TABLE arena_attempts (
  id     TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  tier   INTEGER NOT NULL CHECK (tier BETWEEN 0 AND 9),
  step   INTEGER NOT NULL CHECK (step BETWEEN 0 AND 3),
  room   TEXT NOT NULL,
  at     INTEGER NOT NULL,
  done   INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_arena_attempts_open ON arena_attempts (player, done);
CREATE UNIQUE INDEX idx_arena_attempts_room ON arena_attempts (room);

-- A single row holding a version number that rises whenever any arena bout row is written, so kept boards know when to recount.
CREATE TABLE arena_board_ver (
  id  INTEGER PRIMARY KEY CHECK (id = 1),
  ver INTEGER NOT NULL
);
INSERT INTO arena_board_ver (id, ver) VALUES (1, 1);

-- One row per season holding the counted arena board kept for reading, with the version and shape it was counted at.
CREATE TABLE arena_boards (
  season INTEGER PRIMARY KEY,
  built  INTEGER NOT NULL DEFAULT 0,
  shape  TEXT,
  rows   TEXT
);

-- One row per season naming the account that holds the Grand Champion laurel, if anyone does.
CREATE TABLE arena_champions (
  season INTEGER PRIMARY KEY,
  player TEXT,
  at     INTEGER NOT NULL,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE SET NULL
);

-- One row per account: the arena banner it wears and the season it joined, plus the banner it quit this season.
CREATE TABLE arena_members (
  player      TEXT PRIMARY KEY,
  banner      TEXT CHECK (banner IN ('red', 'blue')),
  season      INTEGER NOT NULL,
  left_banner TEXT,
  left_season INTEGER,
  at          INTEGER NOT NULL,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_arena_members_banner ON arena_members (banner);
CREATE TRIGGER arena_board_member_in AFTER INSERT ON arena_members
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;
CREATE TRIGGER arena_board_member_out AFTER DELETE ON arena_members
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;
CREATE TRIGGER arena_board_member_up AFTER UPDATE ON arena_members
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;

-- One row per ladder bout, won or lost, with the player, season, tier, step and banner worn.
CREATE TABLE arena_pve (
  bout   TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  season INTEGER NOT NULL,
  tier   INTEGER NOT NULL CHECK (tier BETWEEN 0 AND 9),
  step   INTEGER NOT NULL CHECK (step BETWEEN 0 AND 3),
  won    INTEGER NOT NULL CHECK (won IN (0, 1)),
  how    TEXT NOT NULL,
  banner TEXT,
  at     INTEGER NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0, 1)),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_arena_pve_grand ON arena_pve (tier, step, won, at);
CREATE INDEX idx_arena_pve_player ON arena_pve (player, at);
CREATE INDEX idx_arena_pve_player_grand ON arena_pve (player, tier, step, won);
CREATE INDEX idx_arena_pve_season ON arena_pve (season, player);
CREATE UNIQUE INDEX idx_arena_pve_step ON arena_pve (player, tier, step) WHERE won = 1 AND voided = 0;
CREATE TRIGGER arena_board_pve_in AFTER INSERT ON arena_pve
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;
CREATE TRIGGER arena_board_pve_out AFTER DELETE ON arena_pve
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;
CREATE TRIGGER arena_board_pve_up AFTER UPDATE ON arena_pve
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;

-- One row per bout between two players, with both accounts, the result, and both ratings before and after.
CREATE TABLE arena_pvp (
  bout     TEXT PRIMARY KEY,
  season   INTEGER NOT NULL,
  a        TEXT,
  b        TEXT,
  result   INTEGER NOT NULL CHECK (result IN (0, 1, 2)),
  how      TEXT NOT NULL,
  ra0      INTEGER NOT NULL,
  rb0      INTEGER NOT NULL,
  ra1      INTEGER NOT NULL,
  rb1      INTEGER NOT NULL,
  rated    INTEGER NOT NULL DEFAULT 1,
  banner_a TEXT,
  banner_b TEXT,
  at       INTEGER NOT NULL,
  FOREIGN KEY (a) REFERENCES players(id) ON DELETE SET NULL,
  FOREIGN KEY (b) REFERENCES players(id) ON DELETE SET NULL
);
CREATE INDEX idx_arena_pvp_a ON arena_pvp (a, season, at);
CREATE INDEX idx_arena_pvp_b ON arena_pvp (b, season, at);
CREATE INDEX idx_arena_pvp_season ON arena_pvp (season, at);
CREATE TRIGGER arena_board_pvp_in AFTER INSERT ON arena_pvp
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;
CREATE TRIGGER arena_board_pvp_out AFTER DELETE ON arena_pvp
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;
CREATE TRIGGER arena_board_pvp_up AFTER UPDATE ON arena_pvp
BEGIN
  UPDATE arena_board_ver SET ver = ver + 1 WHERE id = 1;
END;

-- One row per bout and player recording the Renown claimed for that bout, so each bout pays a player once.
CREATE TABLE arena_renown (
  bout    TEXT NOT NULL,
  player  TEXT NOT NULL,
  char_id TEXT NOT NULL,
  xp      INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (bout, player),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per ship recruit held by a character for a town, day and hall slot, so no two players sign the same man.
CREATE TABLE crew_signed (
  town   INTEGER NOT NULL,
  day    INTEGER NOT NULL,
  slot   INTEGER NOT NULL CHECK (slot >= 0 AND slot < 6),
  player TEXT NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (town, day, slot)
);
CREATE INDEX crew_signed_day ON crew_signed (day);
CREATE INDEX crew_signed_player_day ON crew_signed (player, day);

-- One row per recorded encounter reaction (or a player-hour of them) with summed reaction timings, kept for a limited time.
CREATE TABLE encounter_reactions (
  id         TEXT PRIMARY KEY,
  sub        TEXT NOT NULL,
  at         INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  n          INTEGER NOT NULL,
  members    INTEGER NOT NULL,
  span_ms    INTEGER NOT NULL,
  poses      INTEGER NOT NULL,
  p1         INTEGER NOT NULL DEFAULT 0,
  p1_n       INTEGER NOT NULL DEFAULT 0,
  wd         INTEGER NOT NULL DEFAULT 0,
  wd_n       INTEGER NOT NULL DEFAULT 0,
  ac         INTEGER NOT NULL DEFAULT 0,
  ac_n       INTEGER NOT NULL DEFAULT 0,
  hk         INTEGER NOT NULL DEFAULT 0,
  hk_n       INTEGER NOT NULL DEFAULT 0,
  hu         INTEGER NOT NULL DEFAULT 0,
  hu_n       INTEGER NOT NULL DEFAULT 0,
  dd_n       INTEGER NOT NULL DEFAULT 0,
  drawn      INTEGER NOT NULL DEFAULT 0,
  struck     INTEGER NOT NULL DEFAULT 0,
  mv         INTEGER NOT NULL DEFAULT 0,
  tn         INTEGER NOT NULL DEFAULT 0,
  keep_until INTEGER
);
CREATE INDEX encounter_reactions_at ON encounter_reactions (at);
CREATE INDEX encounter_reactions_sub ON encounter_reactions (sub, at);

-- One row per account per day recording the gate closed, its boss and what was earned.
CREATE TABLE gate_kills (
  day     INTEGER NOT NULL,
  account TEXT NOT NULL,
  boss    TEXT NOT NULL,
  earned  TEXT NOT NULL,
  at      INTEGER NOT NULL,
  region  INTEGER,
  stones  INTEGER NOT NULL DEFAULT 1,
  body    TEXT,
  PRIMARY KEY (day, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_gate_account ON gate_kills (account);
CREATE INDEX idx_gate_kills_region ON gate_kills (day, region);

-- One row per spawn-grant measurement batch for a cell, with its window length and peak hostile members held.
CREATE TABLE grant_batches (
  id     TEXT PRIMARY KEY,
  at     INTEGER NOT NULL,
  q      TEXT NOT NULL,
  span_s INTEGER NOT NULL,
  live   INTEGER NOT NULL
);
CREATE INDEX grant_batches_at ON grant_batches (at);

-- One row per account and ask kind in a grant batch window, counting asks, members and what limits would have refused.
CREATE TABLE grant_rows (
  batch   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  sub     TEXT NOT NULL,
  kind    TEXT NOT NULL,
  asks    INTEGER NOT NULL,
  members INTEGER NOT NULL,
  bucket  INTEGER NOT NULL,
  ceiling INTEGER NOT NULL,
  span_s  INTEGER NOT NULL
);
CREATE INDEX grant_rows_at ON grant_rows (at, kind);

-- One row per reader and sender in a grant batch window counting foes the reader refused, by reason.
CREATE TABLE grant_tallies (
  batch  TEXT NOT NULL,
  at     INTEGER NOT NULL,
  reader TEXT NOT NULL,
  sender TEXT NOT NULL,
  reason TEXT NOT NULL,
  n      INTEGER NOT NULL
);
CREATE INDEX grant_tallies_sender ON grant_tallies (sender, at);

-- One row per town defence claim, recording the claim paid, to whom, and the nonce that wrote it.
CREATE TABLE raid_cleanses (
  raid    TEXT NOT NULL,
  account TEXT NOT NULL,
  day     INTEGER NOT NULL,
  party   INTEGER NOT NULL,
  char_id TEXT NOT NULL,
  xp      INTEGER NOT NULL,
  nonce   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (raid, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_raid_account_day ON raid_cleanses (account, day);

-- One row per day and account saying whether the raid spoils were given to that claimant.
CREATE TABLE raid_spoils (
  raid    TEXT NOT NULL,
  account TEXT NOT NULL,
  cid     TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (raid, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per reaction batch received from a room, so a batch posted twice is read once.
CREATE TABLE reaction_batches (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
CREATE INDEX reaction_batches_at ON reaction_batches (at);

-- One row per honours claim for a kill, recording the grant written and the nonce of the claim.
CREATE TABLE sd_kills (
  slot    INTEGER NOT NULL,
  account TEXT NOT NULL,
  boss    TEXT NOT NULL,
  earned  TEXT NOT NULL,
  lv      INTEGER NOT NULL,
  title   INTEGER NOT NULL DEFAULT 0,
  aura    INTEGER NOT NULL DEFAULT 0,
  nonce   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  body    TEXT,
  PRIMARY KEY (slot, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_sd_kills_account ON sd_kills (account);

-- One row per bounty post on a captain: poster, gold, and the fall that claimed it, if any.
CREATE TABLE sea_bounties (
  id          TEXT PRIMARY KEY,
  poster      TEXT NOT NULL,
  poster_char TEXT NOT NULL,
  rid         TEXT NOT NULL,
  target_char TEXT NOT NULL,
  gold        INTEGER NOT NULL CHECK (gold > 0),
  at          INTEGER NOT NULL,
  claimed_r   TEXT,
  UNIQUE (poster, rid)
);
CREATE INDEX sea_bounties_claimed ON sea_bounties (claimed_r);
CREATE INDEX sea_bounties_ended ON sea_bounties (at) WHERE claimed_r IS NOT NULL;
CREATE INDEX sea_bounties_poster ON sea_bounties (poster, poster_char) WHERE claimed_r IS NULL;
CREATE INDEX sea_bounties_standing ON sea_bounties (target_char) WHERE claimed_r IS NULL;
CREATE INDEX sea_bounties_target ON sea_bounties (target_char, claimed_r);

-- One row per fall that claimed bounty posts: the killer, the gold owed and when it was collected.
CREATE TABLE sea_bounty_owed (
  r           TEXT PRIMARY KEY,
  killer      TEXT NOT NULL,
  killer_char TEXT NOT NULL,
  target_char TEXT NOT NULL,
  gold        INTEGER NOT NULL CHECK (gold > 0),
  at          INTEGER NOT NULL,
  paid_at     INTEGER
);
CREATE INDEX sea_bounty_owed_killer ON sea_bounty_owed (killer, killer_char, paid_at);
CREATE INDEX sea_bounty_owed_paid ON sea_bounty_owed (paid_at) WHERE paid_at IS NOT NULL;

-- One row per kill at sea: the killer's account and character and the fallen's, written with the fall.
CREATE TABLE sea_kills (
  r           TEXT PRIMARY KEY,
  killer      TEXT NOT NULL,
  killer_char TEXT NOT NULL,
  victim      TEXT NOT NULL,
  victim_char TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX sea_kills_at ON sea_kills (at);
CREATE INDEX sea_kills_killer ON sea_kills (killer_char, at);

-- One row per piece held as a wreck's prize for the killer to collect or the captain to reclaim.
CREATE TABLE sea_prizes (
  r           TEXT NOT NULL,
  i           INTEGER NOT NULL,
  victim      TEXT NOT NULL,
  victim_char TEXT NOT NULL,
  killer      TEXT NOT NULL,
  killer_char TEXT NOT NULL,
  rec         TEXT NOT NULL,
  at          INTEGER NOT NULL,
  until_s     INTEGER NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('held', 'collected', 'returned')),
  to_char     TEXT,
  ended_at    INTEGER,
  PRIMARY KEY (r, i)
);
CREATE INDEX sea_prizes_ended ON sea_prizes (ended_at) WHERE state != 'held';
CREATE INDEX sea_prizes_killer ON sea_prizes (killer, killer_char, state, until_s);
CREATE INDEX sea_prizes_victim ON sea_prizes (victim, victim_char, state, until_s);

-- One row per realm character and season: its deepest leagues and legends ended, with when each was reached.
CREATE TABLE sea_season (
  season     INTEGER NOT NULL,
  char_id    TEXT NOT NULL,
  player     TEXT NOT NULL,
  deepest    INTEGER NOT NULL DEFAULT 0 CHECK (deepest >= 0),
  deep_at    INTEGER NOT NULL,
  legends    INTEGER NOT NULL DEFAULT 0 CHECK (legends >= 0),
  legends_at INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (season, char_id)
);
CREATE INDEX sea_season_deep ON sea_season (season, deepest DESC, deep_at);
CREATE INDEX sea_season_legends ON sea_season (season, legends DESC, legends_at);

-- One row per wrecked ship: the captain, the killer, the pieces its prize took and whether it was collected or returned.
CREATE TABLE sea_wrecks (
  r           TEXT PRIMARY KEY,
  victim      TEXT NOT NULL,
  victim_char TEXT NOT NULL,
  killer      TEXT NOT NULL,
  killer_char TEXT NOT NULL,
  boat        INTEGER NOT NULL,
  boarded     INTEGER NOT NULL CHECK (boarded IN (0, 1)),
  took        TEXT NOT NULL,
  seq         INTEGER,
  at          INTEGER NOT NULL
);
CREATE INDEX sea_wrecks_at ON sea_wrecks (at);

-- One row per serpent kill claim, recording the claim paid, to whom, and the nonce that wrote it.
CREATE TABLE serpent_kills (
  day     INTEGER NOT NULL,
  account TEXT NOT NULL,
  boss    TEXT NOT NULL,
  hull    INTEGER NOT NULL,
  char_id TEXT NOT NULL,
  xp      INTEGER NOT NULL,
  nonce   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  stones  INTEGER NOT NULL DEFAULT 0,
  body    TEXT,
  title   INTEGER NOT NULL DEFAULT 0,
  aura    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_serpent_account ON serpent_kills (account);

-- One row per day and account saying whether the serpent spoils were given to that claimant.
CREATE TABLE serpent_spoils (
  day     INTEGER NOT NULL,
  account TEXT NOT NULL,
  cid     TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (day, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per star and account that was given its spoils, with the claim id of the device that took them.
CREATE TABLE star_spoils (
  star    TEXT NOT NULL,
  account TEXT NOT NULL,
  cid     TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (star, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per star and account that claimed it: the day, character, XP awarded and claim nonce.
CREATE TABLE stars_held (
  star    TEXT NOT NULL,
  account TEXT NOT NULL,
  day     INTEGER NOT NULL,
  char_id TEXT NOT NULL,
  xp      INTEGER NOT NULL,
  nonce   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  cid     TEXT,
  PRIMARY KEY (star, account),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX stars_held_account_day ON stars_held (account, day);

-- One row per worn piece taken from a fallen player in the wild, held until the killer collects it or the owner reclaims it.
CREATE TABLE wild_escrow (
  r        TEXT PRIMARY KEY,
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  killer   TEXT NOT NULL,
  rec      TEXT NOT NULL,
  at       INTEGER NOT NULL,
  until_s  INTEGER NOT NULL,
  state    TEXT NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'collected', 'returned')),
  to_char  TEXT,
  ended_at INTEGER
);
CREATE INDEX idx_wild_escrow_char ON wild_escrow (char_id, state);
CREATE INDEX idx_wild_escrow_ended ON wild_escrow (ended_at);

-- One row per fall in the open zone: its remains id, characters, items taken, room and the order issued.
CREATE TABLE wild_falls (
  r       TEXT PRIMARY KEY,
  char_id TEXT NOT NULL,
  player  TEXT NOT NULL,
  killer  TEXT,
  at      INTEGER NOT NULL,
  items   TEXT NOT NULL,
  kept    TEXT NOT NULL DEFAULT '[]',
  burnt   INTEGER NOT NULL DEFAULT 0,
  wi      INTEGER NOT NULL DEFAULT -1,
  wm      TEXT NOT NULL DEFAULT '',
  oi      INTEGER NOT NULL DEFAULT 0,
  wg      TEXT,
  tk      TEXT NOT NULL DEFAULT '{}',
  ki      INTEGER
);
CREATE INDEX idx_wild_falls_at ON wild_falls (at);
CREATE INDEX idx_wild_falls_pair ON wild_falls (char_id, killer, ki);

-- One row per piece and character insured: the premium paid, its state and the fall that spent it.
CREATE TABLE wild_insurance (
  char_id  TEXT NOT NULL,
  key      TEXT NOT NULL,
  player   TEXT NOT NULL,
  premium  INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  state    TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'spent', 'lapsed')),
  spent_r  TEXT,
  spent_at INTEGER,
  PRIMARY KEY (char_id, key),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX idx_wild_insurance_char ON wild_insurance (char_id, state);

-- ==== Notice boards ===================================================================================================

-- One row per note a player pinned to a town's notice board, with its text, author, expiry and hidden state.
CREATE TABLE board_notes (
  id          TEXT PRIMARY KEY,
  map_id      INTEGER NOT NULL CHECK (map_id >= 0 AND map_id <= 4294967295),
  author      TEXT NOT NULL,
  author_name TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  button      TEXT CHECK (button IS NULL OR button IN ('party', 'guild', 'duel', 'commission')),
  guild_id    TEXT,
  char_id     TEXT,
  at          INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1, 2)),
  rid         TEXT NOT NULL,
  UNIQUE (author, rid),
  FOREIGN KEY (author) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE SET NULL
);
CREATE INDEX idx_board_notes_author ON board_notes (author, expires_at);
CREATE INDEX idx_board_notes_expires ON board_notes (expires_at);
CREATE INDEX idx_board_notes_map ON board_notes (map_id, at);

-- One row per server notice shown on the notice boards, with its subject, body, author and expiry.
CREATE TABLE board_notices (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  author      TEXT,
  author_name TEXT NOT NULL,
  at          INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  rid         TEXT NOT NULL,
  UNIQUE (author, rid)
);
CREATE INDEX idx_board_notices_expires ON board_notices (expires_at);

-- One row per report a player made against a board note, so each reporter counts once per note.
CREATE TABLE board_reports (
  note_id  TEXT NOT NULL,
  reporter TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (note_id, reporter),
  FOREIGN KEY (note_id) REFERENCES board_notes(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter) REFERENCES players(id) ON DELETE CASCADE
);

-- ==== Points of interest ==============================================================================================

-- One row per uploaded mesh or texture, keyed by hash, with its size, metadata, uploader and whether it is live.
CREATE TABLE poi_assets (
  sha   TEXT PRIMARY KEY,
  kind  TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  meta  TEXT NOT NULL,
  by    TEXT NOT NULL,
  at    INTEGER NOT NULL,
  live  INTEGER NOT NULL DEFAULT 0
);

-- One row per point of interest: who created it and which approved revision is live.
CREATE TABLE poi_docs (
  id         TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  live_rev   INTEGER,
  live_at    INTEGER,
  live_by    TEXT
);

-- A single row holding the version of the point-of-interest feed the game polls.
CREATE TABLE poi_feed (
  k  TEXT PRIMARY KEY,
  v  INTEGER NOT NULL,
  at INTEGER NOT NULL
);
INSERT INTO poi_feed (k, v, at) VALUES ('feed', 0, 0);

-- One row per asset named by an approved revision of a point of interest.
CREATE TABLE poi_rev_assets (
  poi_id TEXT NOT NULL,
  rev    INTEGER NOT NULL,
  sha    TEXT NOT NULL,
  PRIMARY KEY (poi_id, rev, sha)
);
CREATE INDEX poi_rev_assets_sha ON poi_rev_assets (sha);

-- One row per revision of a point of interest: its document, kind, name and approval details.
CREATE TABLE poi_revs (
  poi_id        TEXT NOT NULL REFERENCES poi_docs(id),
  rev           INTEGER NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'doc',
  doc           TEXT,
  doc_sha       TEXT,
  name          TEXT,
  px            INTEGER,
  py            INTEGER,
  base_rev      INTEGER,
  author        TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  at            INTEGER NOT NULL,
  state         TEXT NOT NULL,
  submitted_at  INTEGER,
  reviewer      TEXT,
  reviewer_name TEXT,
  reviewed_at   INTEGER,
  note          TEXT,
  decision      TEXT,
  PRIMARY KEY (poi_id, rev)
);
CREATE INDEX poi_revs_author ON poi_revs (author, state);
CREATE UNIQUE INDEX poi_revs_one_draft ON poi_revs (poi_id, author) WHERE state = 'draft' AND kind = 'doc';
CREATE UNIQUE INDEX poi_revs_one_retire ON poi_revs (poi_id) WHERE state = 'submitted' AND kind = 'retire';
CREATE INDEX poi_revs_state ON poi_revs (state, submitted_at);

-- One row per library shelf entry: a saved model's parts and lights with its name, tags and picture.
CREATE TABLE poi_shelf (
  id         TEXT PRIMARY KEY,
  item       TEXT NOT NULL,
  name       TEXT NOT NULL,
  tags       TEXT NOT NULL,
  thumb      TEXT,
  parts      INTEGER NOT NULL,
  triangles  INTEGER NOT NULL,
  by         TEXT NOT NULL,
  by_name    TEXT NOT NULL,
  at         INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  gone_at    INTEGER,
  gone_by    TEXT
);
CREATE INDEX poi_shelf_by ON poi_shelf (by, gone_at);

-- Bytes each builder has uploaded in a UTC day, reserved before storing so the daily bound holds.
CREATE TABLE poi_upload_days (
  by    TEXT NOT NULL,
  day   INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY (by, day)
);

-- ==== Staff panel and moderation ======================================================================================

-- One row per moderator action on a player: mute, unmute, ban, unban or dismiss, with reason, actor and expiry.
CREATE TABLE mod_actions (
  id         INTEGER PRIMARY KEY,
  target     TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('mute', 'unmute', 'ban', 'unban', 'dismiss')),
  until      INTEGER,
  reason     TEXT,
  actor      TEXT NOT NULL,
  actor_name TEXT,
  case_id    TEXT,
  at         INTEGER NOT NULL,
  void_at    INTEGER,
  click      TEXT,
  FOREIGN KEY (target) REFERENCES players(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX mod_actions_click ON mod_actions (click) WHERE click IS NOT NULL;
CREATE INDEX mod_actions_target ON mod_actions (target, at);

-- One row per day: counts of automated review calls and the tokens they used.
CREATE TABLE mod_ai_days (
  day           TEXT PRIMARY KEY,
  calls         INTEGER NOT NULL,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_cached INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0
);

-- One row per chat line saved as evidence on a moderation case.
CREATE TABLE mod_case_lines (
  case_id TEXT NOT NULL,
  at      INTEGER NOT NULL,
  sub     TEXT NOT NULL,
  name    TEXT NOT NULL,
  tab     TEXT NOT NULL,
  text    TEXT NOT NULL,
  sg      TEXT,
  PRIMARY KEY (case_id, at, sub),
  FOREIGN KEY (case_id) REFERENCES mod_cases(id) ON DELETE CASCADE
);

-- One row per moderation case on a player, opened by a report or a review, with its status and review state.
CREATE TABLE mod_cases (
  id            TEXT PRIMARY KEY,
  target        TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('report', 'review')),
  status        TEXT NOT NULL CHECK (status IN ('open', 'actioned', 'dismissed')),
  opened_at     INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  reports       INTEGER NOT NULL DEFAULT 0,
  credible      INTEGER NOT NULL DEFAULT 0,
  ai_state      TEXT NOT NULL CHECK (ai_state IN ('due', 'reading', 'done', 'failed', 'off')),
  ai_category   TEXT,
  ai_severity   INTEGER,
  ai_confidence REAL,
  ai_reason     TEXT,
  ai_mode       TEXT,
  ai_at         INTEGER,
  ai_line_at    INTEGER,
  ai_line_sub   TEXT,
  auto          TEXT,
  auto_at       INTEGER,
  claimed_at    INTEGER,
  discord_state TEXT NOT NULL CHECK (discord_state IN ('due', 'posted', 'failed', 'off')),
  discord_msg   TEXT,
  resolved_by   TEXT,
  resolved_at   INTEGER,
  resolution    TEXT,
  lines_kept    INTEGER NOT NULL DEFAULT 1 CHECK (lines_kept IN (0, 1)),
  claimed_by    TEXT,
  claim_until   INTEGER,
  claim_from    TEXT,
  kind          TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'spawn')),
  act_click     TEXT,
  act_at        INTEGER,
  claim_session TEXT,
  FOREIGN KEY (target) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX mod_cases_ai_due ON mod_cases (updated_at) WHERE ai_state IN ('due', 'reading');
CREATE INDEX mod_cases_claimed ON mod_cases (claimed_by, claim_until) WHERE status = 'open' AND claimed_by IS NOT NULL;
CREATE INDEX mod_cases_decided ON mod_cases (resolved_at) WHERE resolved_at IS NOT NULL;
CREATE UNIQUE INDEX mod_cases_open ON mod_cases (target, kind) WHERE status = 'open';
CREATE INDEX mod_cases_post_due ON mod_cases (updated_at) WHERE discord_state = 'due';
CREATE INDEX mod_cases_resolved ON mod_cases (resolved_at) WHERE resolved_at IS NOT NULL AND lines_kept = 1;
CREATE INDEX mod_cases_target ON mod_cases (target, opened_at);

-- One row per batch of chat lines queued for automated review, with its state.
CREATE TABLE mod_feed (
  id      TEXT PRIMARY KEY,
  at      INTEGER NOT NULL,
  lines   TEXT,
  state   TEXT NOT NULL CHECK (state IN ('due', 'reading', 'done')),
  read_at INTEGER
);
CREATE INDEX mod_feed_due ON mod_feed (at) WHERE state IN ('due', 'reading');

-- One row per player report on a moderation case: reporter, reason, note and whether it counted.
CREATE TABLE mod_reports (
  case_id  TEXT NOT NULL,
  reporter TEXT NOT NULL,
  reason   TEXT NOT NULL,
  note     TEXT,
  at       INTEGER NOT NULL,
  counted  INTEGER NOT NULL CHECK (counted IN (0, 1)),
  PRIMARY KEY (case_id, reporter),
  FOREIGN KEY (case_id) REFERENCES mod_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX mod_reports_reporter ON mod_reports (reporter, at);

-- One row per staff sign-in, refusal or act, with its outcome; append-only for a month.
CREATE TABLE staff_audit (
  id         INTEGER PRIMARY KEY,
  at         INTEGER NOT NULL,
  actor      TEXT,
  actor_name TEXT,
  role       TEXT,
  act        TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  key_id     TEXT,
  outcome    TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'denied', 'failed'))
);
CREATE INDEX staff_audit_actor ON staff_audit (actor, at);
CREATE INDEX staff_audit_at ON staff_audit (at);
CREATE INDEX staff_audit_target ON staff_audit (target, at);
CREATE TRIGGER staff_audit_no_delete BEFORE DELETE ON staff_audit WHEN OLD.at > CAST(strftime('%s', 'now') AS INTEGER) - 2588400
BEGIN
  SELECT RAISE(ABORT, 'staff_audit is append-only for 30 days');
END;
CREATE TRIGGER staff_audit_no_update BEFORE UPDATE ON staff_audit
BEGIN
  SELECT RAISE(ABORT, 'staff_audit is append-only');
END;

-- One row per line in a staff chat with a player, from either staff or the player.
CREATE TABLE staff_chat_lines (
  id     INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  at     INTEGER NOT NULL,
  author TEXT NOT NULL,
  staff  INTEGER NOT NULL CHECK (staff IN (0, 1)),
  text   TEXT NOT NULL,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX staff_chat_lines_at ON staff_chat_lines (at);
CREATE INDEX staff_chat_lines_thread ON staff_chat_lines (player, id);

-- One row per staff chat thread with a player, holding its state and read cursor.
CREATE TABLE staff_chat_threads (
  player     TEXT PRIMARY KEY,
  why        TEXT NOT NULL CHECK (why IN ('freeze', 'talk')),
  opened_at  INTEGER NOT NULL,
  opened_by  TEXT,
  player_in  INTEGER NOT NULL DEFAULT 0,
  closed_at  INTEGER,
  last_at    INTEGER NOT NULL,
  last_staff INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX staff_chat_threads_open ON staff_chat_threads (last_at) WHERE closed_at IS NULL;

-- One row per staff-run event, with its state, kill meter, boss state and final top board.
CREATE TABLE staff_events (
  id         TEXT PRIMARY KEY,
  at         INTEGER NOT NULL,
  staff_id   TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  ev         TEXT NOT NULL,
  state      TEXT NOT NULL,
  ended_at   INTEGER,
  ended_by   TEXT,
  kills      INTEGER NOT NULL DEFAULT 0,
  boss       TEXT NOT NULL DEFAULT 'none',
  top        TEXT
);
CREATE INDEX staff_events_at ON staff_events (at);
CREATE INDEX staff_events_state ON staff_events (state);

-- One row per piece of evidence staff took from a character, with a note and whether it was put back.
CREATE TABLE staff_evidence (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('player', 'listing', 'auction')),
  player      TEXT NOT NULL,
  char_id     TEXT,
  source      TEXT,
  item        TEXT CHECK (item IS NULL OR json_valid(item)),
  key         TEXT,
  detail      TEXT CHECK (detail IS NULL OR json_valid(detail)),
  reason      TEXT NOT NULL CHECK (reason IN ('duplicated', 'duped-gold', 'bug-reward', 'other')),
  note        TEXT NOT NULL,
  by_id       TEXT NOT NULL,
  by_name     TEXT,
  at          INTEGER NOT NULL,
  until       INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'kept' CHECK (state IN ('kept', 'returned')),
  returned_at INTEGER,
  returned_by TEXT
);
CREATE INDEX staff_evidence_at ON staff_evidence (at);
CREATE INDEX staff_evidence_char ON staff_evidence (char_id, state) WHERE char_id IS NOT NULL;
CREATE INDEX staff_evidence_player ON staff_evidence (player, at);
CREATE INDEX staff_evidence_until ON staff_evidence (until);

-- One row per sender found over a monster limit in a room's window, split by kind and host.
CREATE TABLE staff_foe_rows (
  batch    TEXT NOT NULL,
  at       INTEGER NOT NULL,
  sub      TEXT NOT NULL,
  owned    INTEGER NOT NULL,
  hosted   INTEGER NOT NULL,
  regular  INTEGER NOT NULL,
  elite    INTEGER NOT NULL,
  boss     INTEGER NOT NULL,
  sea      INTEGER NOT NULL,
  stripped INTEGER NOT NULL
);
CREATE INDEX staff_foe_rows_at ON staff_foe_rows (at);

-- One row per pending staff invite: the hashed code, the account invited, who issued it and its expiry.
CREATE TABLE staff_invites (
  code_hash  TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL,
  by_id      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX staff_invites_player ON staff_invites (player_id);

-- One row per staff sign-in key: the staff account it belongs to, its public key, label, last use and revocation.
CREATE TABLE staff_keys (
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL,
  handle_lc  TEXT NOT NULL,
  pub        TEXT NOT NULL UNIQUE,
  label      TEXT,
  created_at INTEGER NOT NULL,
  last_ts    INTEGER NOT NULL DEFAULT 0,
  last_used  INTEGER,
  cfg        INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX staff_keys_player ON staff_keys (player_id);

-- One row per staff status metric: the amber and red limits an Admin set for it, who set them and when.
CREATE TABLE staff_limits (
  metric TEXT PRIMARY KEY,
  amber  REAL CHECK (amber IS NULL OR amber >= 0),
  red    REAL CHECK (red IS NULL OR red >= 0),
  set_by TEXT,
  set_at INTEGER NOT NULL,
  CHECK (amber IS NOT NULL OR red IS NOT NULL),
  CHECK (amber IS NULL OR red IS NULL OR amber <= red)
);

-- One row per message a staff member sent a player: target, text, delivery result and when the player pressed OK.
CREATE TABLE staff_messages (
  id         TEXT PRIMARY KEY,
  at         INTEGER NOT NULL,
  staff_id   TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  target     TEXT NOT NULL,
  text       TEXT NOT NULL,
  pushed     INTEGER,
  sockets    INTEGER,
  old        INTEGER,
  ok_at      INTEGER
);
CREATE INDEX staff_messages_at ON staff_messages (at);
CREATE INDEX staff_messages_staff ON staff_messages (staff_id);
CREATE INDEX staff_messages_target ON staff_messages (target);

-- One row per network-burst batch a room posted: its room, window length and whether monsters were measured.
CREATE TABLE staff_net_batches (
  id     TEXT PRIMARY KEY,
  at     INTEGER NOT NULL,
  q      TEXT NOT NULL,
  span_s INTEGER NOT NULL,
  ms     INTEGER NOT NULL
);
CREATE INDEX staff_net_batches_at ON staff_net_batches (at);

-- One row per player over a limit in a room's batch: frames, bytes, busiest periods, counts by kind and refusals.
CREATE TABLE staff_net_rows (
  batch     TEXT NOT NULL,
  at        INTEGER NOT NULL,
  sub       TEXT NOT NULL,
  frames    INTEGER NOT NULL,
  bytes     INTEGER NOT NULL,
  p10       INTEGER NOT NULL,
  pb10      INTEGER NOT NULL,
  p60       INTEGER NOT NULL,
  pb60      INTEGER NOT NULL,
  k_move    INTEGER NOT NULL,
  k_act     INTEGER NOT NULL,
  k_hit     INTEGER NOT NULL,
  k_trade   INTEGER NOT NULL,
  k_foe     INTEGER NOT NULL,
  k_chat    INTEGER NOT NULL,
  k_other   INTEGER NOT NULL,
  refused   INTEGER NOT NULL,
  junk      INTEGER NOT NULL,
  closes    INTEGER NOT NULL,
  close_why TEXT
);
CREATE INDEX staff_net_rows_at ON staff_net_rows (at);

-- One row per note a staff member wrote about a player account, with author and time.
CREATE TABLE staff_notes (
  id          INTEGER PRIMARY KEY,
  target      TEXT NOT NULL,
  author      TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  FOREIGN KEY (target) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX staff_notes_target ON staff_notes (target, id);

-- One row per live staff panel session, kept as a token hash with its key, last activity and expiry.
CREATE TABLE staff_sessions (
  token_hash TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL,
  key_id     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_act   INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX staff_sessions_key ON staff_sessions (key_id);
CREATE INDEX staff_sessions_player ON staff_sessions (player_id);

-- One row per staff member: their saved panel settings as one JSON document.
CREATE TABLE staff_settings (
  player TEXT PRIMARY KEY,
  doc    TEXT NOT NULL CHECK (json_valid(doc)),
  at     INTEGER NOT NULL,
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- One row per account a staff member has put on their watch list.
CREATE TABLE staff_watch (
  staff  TEXT NOT NULL,
  target TEXT NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (staff, target),
  FOREIGN KEY (staff) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (target) REFERENCES players(id) ON DELETE CASCADE
);
