-- The grant feed's rows and tallies get primary keys. The relay's window holds one row per account and ask kind, and
-- one tally per reader, sender and reason (src/net/grantMeasure.js), so a batch never repeats a key. Postgres needs a
-- key to address a row, and the hourly sweep deletes by batch through it.

CREATE TABLE grant_rows_keyed (
  batch   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  sub     TEXT NOT NULL,
  kind    TEXT NOT NULL,
  asks    INTEGER NOT NULL,
  members INTEGER NOT NULL,
  bucket  INTEGER NOT NULL,
  ceiling INTEGER NOT NULL,
  span_s  INTEGER NOT NULL,
  PRIMARY KEY (batch, sub, kind)
);
INSERT INTO grant_rows_keyed (batch, at, sub, kind, asks, members, bucket, ceiling, span_s)
  SELECT batch, at, sub, kind, asks, members, bucket, ceiling, span_s FROM grant_rows WHERE true
  ON CONFLICT DO NOTHING;
DROP TABLE grant_rows;
ALTER TABLE grant_rows_keyed RENAME TO grant_rows;
CREATE INDEX grant_rows_at ON grant_rows (at, kind);

CREATE TABLE grant_tallies_keyed (
  batch  TEXT NOT NULL,
  at     INTEGER NOT NULL,
  reader TEXT NOT NULL,
  sender TEXT NOT NULL,
  reason TEXT NOT NULL,
  n      INTEGER NOT NULL,
  PRIMARY KEY (batch, reader, sender, reason)
);
INSERT INTO grant_tallies_keyed (batch, at, reader, sender, reason, n)
  SELECT batch, at, reader, sender, reason, n FROM grant_tallies WHERE true
  ON CONFLICT DO NOTHING;
DROP TABLE grant_tallies;
ALTER TABLE grant_tallies_keyed RENAME TO grant_tallies;
CREATE INDEX grant_tallies_sender ON grant_tallies (sender, at);
