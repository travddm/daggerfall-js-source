-- A container's access rule and a chest held open belong to their piece. A write that deleted the piece, or its home
-- and so its pieces, left them behind with nothing to name. Each now goes with its piece by the key's cascade.
-- SQLite adds a foreign key only by rebuilding the table. Rows that name no piece already name nothing, so they are not
-- carried over.
CREATE TABLE decor_access_keyed (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  piece_id     TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('storage', 'station')),
  mode         TEXT NOT NULL CHECK (mode IN ('private', 'guild', 'friends', 'party')),
  friends      TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (map_id, building_key, piece_id, kind),
  FOREIGN KEY (map_id, building_key, piece_id) REFERENCES home_decor (map_id, building_key, id) ON DELETE CASCADE
);
INSERT INTO decor_access_keyed (map_id, building_key, piece_id, kind, mode, friends)
SELECT a.map_id, a.building_key, a.piece_id, a.kind, a.mode, a.friends FROM decor_access a
WHERE EXISTS (SELECT 1 FROM home_decor d WHERE d.map_id = a.map_id AND d.building_key = a.building_key AND d.id = a.piece_id);
DROP TABLE decor_access;
ALTER TABLE decor_access_keyed RENAME TO decor_access;

CREATE TABLE decor_hold_keyed (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  piece_id     TEXT NOT NULL,
  player       TEXT NOT NULL,
  char_id      TEXT NOT NULL,
  until        INTEGER NOT NULL,
  PRIMARY KEY (map_id, building_key, piece_id),
  FOREIGN KEY (map_id, building_key, piece_id) REFERENCES home_decor (map_id, building_key, id) ON DELETE CASCADE
);
INSERT INTO decor_hold_keyed (map_id, building_key, piece_id, player, char_id, until)
SELECT h.map_id, h.building_key, h.piece_id, h.player, h.char_id, h.until FROM decor_hold h
WHERE EXISTS (SELECT 1 FROM home_decor d WHERE d.map_id = h.map_id AND d.building_key = h.building_key AND d.id = h.piece_id);
DROP TABLE decor_hold;
ALTER TABLE decor_hold_keyed RENAME TO decor_hold;
