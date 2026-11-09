-- The seat system keeps its castles, regional Charters, fortifications, siege works, banner ribbons and Pacts, and loses
-- Tides and Incursion Marks, the Levy Edict, gifts to the town, Fealty and the Season titles. The works cost Marks alone:
-- no stockpile, no writs, no Ram Kit. Dropping a table drops its indexes and triggers with it.
-- A seat writ fed the stockpile and the camps and has nothing to deliver to now, so the open ones go. The unused columns
-- guild_writs.seat and .camp stay: SQLite cannot drop a column a CHECK reads.
DELETE FROM guild_writs WHERE seat IS NOT NULL;
DROP TABLE guild_fealty;
DROP TABLE town_seat_stockpile;
DROP TABLE town_seat_fort_held;
DROP TABLE town_seat_fortifier;
DROP TABLE town_seat_levies;
DROP TABLE town_seat_gifts;

-- A work's tier stands at once for the Season: one row a seat and work.
DROP TABLE town_seat_forts;
CREATE TABLE town_seat_forts (
  key   INTEGER NOT NULL,
  work  TEXT NOT NULL,
  tier  INTEGER NOT NULL DEFAULT 0 CHECK (tier >= 0 AND tier <= 3),
  at    INTEGER NOT NULL,
  PRIMARY KEY (key, work)
);

-- A challenger's Siege Camp is Marks, paid once: one row a guild, seat and week.
DROP TABLE town_seat_camps;
CREATE TABLE town_seat_camps (
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (week, key, guild_id)
);

-- No Levy Edict.
CREATE TABLE town_seat_edicts_new (
  key       INTEGER NOT NULL,
  week      INTEGER NOT NULL,
  edict     TEXT NOT NULL CHECK (edict IN ('market-day', 'open-gates', 'curfew', 'festival', 'bounty', 'conscription', 'royal-tourney')),
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
INSERT INTO town_seat_edicts_new SELECT * FROM town_seat_edicts WHERE edict <> 'levy';
DROP TABLE town_seat_edicts;
ALTER TABLE town_seat_edicts_new RENAME TO town_seat_edicts;
CREATE INDEX idx_town_seat_edicts_week ON town_seat_edicts (week, state);

-- No Season titles: the Royal Tourney's champion alone is kept for good.
CREATE TABLE town_seat_titles_new (
  account TEXT NOT NULL,
  title   TEXT NOT NULL CHECK (title IN ('champion')),
  key     INTEGER NOT NULL,
  week    INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (account, title, key, week),
  FOREIGN KEY (account) REFERENCES players(id) ON DELETE CASCADE
);
INSERT INTO town_seat_titles_new SELECT * FROM town_seat_titles WHERE title = 'champion';
DROP TABLE town_seat_titles;
ALTER TABLE town_seat_titles_new RENAME TO town_seat_titles;

-- Influence comes from the Watch, gates, Tribute and the boards' clears: no seat writs, no bought units, no Orc camps.
CREATE TABLE town_seat_influence_new (
  id       INTEGER PRIMARY KEY,
  week     INTEGER NOT NULL,
  key      INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  account  TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  source   TEXT NOT NULL CHECK (source IN ('watch', 'gate', 'tribute', 'hunt')),
  amount   INTEGER NOT NULL CHECK (amount >= 0),
  region   INTEGER,
  day      INTEGER,
  ref      TEXT NOT NULL,
  at       INTEGER NOT NULL,
  voided   INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0, 1)),
  UNIQUE (source, ref)
);
INSERT INTO town_seat_influence_new SELECT * FROM town_seat_influence WHERE source IN ('watch', 'gate', 'tribute', 'hunt');
DROP TABLE town_seat_influence;
ALTER TABLE town_seat_influence_new RENAME TO town_seat_influence;
CREATE INDEX idx_town_seat_influence_account ON town_seat_influence (account, source, day);
CREATE INDEX idx_town_seat_influence_seat ON town_seat_influence (week, key, guild_id);
