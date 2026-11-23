-- A shared chest's goods live only in decor_bin, and nothing tied a bin row to its piece. A write that deleted the piece,
-- or the home and so its pieces, left goods no chest could open, and those rows then refused every later release or
-- sale of a home at that building. The key refuses such a delete: a write must take the goods out first. It is NO
-- ACTION, never a cascade, so a delete can never take another player's goods with it.
-- SQLite adds a foreign key only by rebuilding the table. Rows that name no piece already reach no chest, so they are
-- not carried over.
CREATE TABLE decor_bin_keyed (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  piece_id     TEXT NOT NULL,
  uid          TEXT NOT NULL,
  item         TEXT NOT NULL,
  PRIMARY KEY (map_id, building_key, piece_id, uid),
  FOREIGN KEY (map_id, building_key, piece_id) REFERENCES home_decor (map_id, building_key, id)
);
INSERT INTO decor_bin_keyed (map_id, building_key, piece_id, uid, item)
SELECT b.map_id, b.building_key, b.piece_id, b.uid, b.item FROM decor_bin b
WHERE EXISTS (SELECT 1 FROM home_decor d WHERE d.map_id = b.map_id AND d.building_key = b.building_key AND d.id = b.piece_id);
DROP TABLE decor_bin;
ALTER TABLE decor_bin_keyed RENAME TO decor_bin;
