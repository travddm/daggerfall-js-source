-- What a capped act has counted so far in its period, so a cap guard reads one row instead of summing history.
-- `period` is part of the key (a UTC day for the Marks caps), so a new period starts at 0 with no reset write.
-- Each counter is written by a trigger on the row the act already inserts. A retry that inserts nothing, or a
-- statement that fails, fires no trigger or rolls its write back, so a retry never counts twice.
CREATE TABLE act_counts (
  subject TEXT NOT NULL,
  kind    TEXT NOT NULL,
  period  INTEGER NOT NULL,
  n       INTEGER NOT NULL,
  PRIMARY KEY (subject, kind, period)
) WITHOUT ROWID;

-- The combat silver an account has been struck in a UTC day, all combat faucets together. The kinds are
-- MARKS_COMBAT.kinds in src/net/marksLaw.js.
CREATE TRIGGER marks_line_counts_combat AFTER INSERT ON marks_ledger
WHEN NEW.dst_kind = 'account' AND NEW.kind IN ('gate', 'raid', 'serpent', 'star')
BEGIN
  INSERT INTO act_counts (subject, kind, period, n) VALUES (NEW.dst_id, 'marks-combat', NEW.day, NEW.amount)
  ON CONFLICT (subject, kind, period) DO UPDATE SET n = n + excluded.n;
END;

-- The silver each find faucet has struck an account in a UTC day.
CREATE TRIGGER marks_line_counts_finds AFTER INSERT ON marks_ledger
WHEN NEW.dst_kind = 'account' AND NEW.kind IN ('gather', 'find')
BEGIN
  INSERT INTO act_counts (subject, kind, period, n) VALUES (NEW.dst_id, 'marks-' || NEW.kind, NEW.day, NEW.amount)
  ON CONFLICT (subject, kind, period) DO UPDATE SET n = n + excluded.n;
END;

-- The Marks an account has sold to the Bank in a UTC day.
CREATE TRIGGER marks_line_counts_exchange AFTER INSERT ON marks_ledger
WHEN NEW.kind = 'exchange' AND NEW.src_id IS NOT NULL
BEGIN
  INSERT INTO act_counts (subject, kind, period, n) VALUES (NEW.src_id, 'marks-exchange', NEW.day, NEW.amount)
  ON CONFLICT (subject, kind, period) DO UPDATE SET n = n + excluded.n;
END;

-- The deeds a guild has been struck in a UTC day.
CREATE TRIGGER marks_line_counts_guild_deed AFTER INSERT ON marks_ledger
WHEN NEW.dst_kind = 'guild' AND NEW.kind = 'guild-deed'
BEGIN
  INSERT INTO act_counts (subject, kind, period, n) VALUES (NEW.dst_id, 'marks-guild-deed', NEW.day, 1)
  ON CONFLICT (subject, kind, period) DO UPDATE SET n = n + excluded.n;
END;
