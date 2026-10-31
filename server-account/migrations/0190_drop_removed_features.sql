-- Drops the tables and columns of the features removed in the cleanup: the Sky-Ketch, the tavern card games and King's
-- Gambit, the SHOP and Elite Gates. No code reads or writes them any more. The migrations that created them stay, because
-- applied migrations never change and the numbering must stay gap-free.
--
-- DROP TABLE takes a table's indexes with it. None of the dropped columns is indexed or read by a trigger, which
-- SQLite's DROP COLUMN requires.

-- The Sky-Ketch (0166).
DROP TABLE IF EXISTS ketch_voyages;

-- The tavern card games (0092, 0095) and King's Gambit (0115).
DROP TABLE IF EXISTS card_stakes;
DROP TABLE IF EXISTS iliac_games;
DROP TABLE IF EXISTS iliac_champions;
DROP TABLE IF EXISTS gambit_games;
DROP TABLE IF EXISTS gambit_champions;

-- The SHOP (0189).
DROP TABLE IF EXISTS shop_orders;
ALTER TABLE players DROP COLUMN shop_wares;
ALTER TABLE server_post DROP COLUMN ware;

-- Elite Gates (0124) and the Weir Road's key (0133).
DROP TABLE IF EXISTS eg_stakes;
DROP TABLE IF EXISTS eg_redoubts;
DROP TABLE IF EXISTS eg_runs;
DROP TABLE IF EXISTS eg_feats;
DROP TABLE IF EXISTS eg_champions;
DROP TABLE IF EXISTS eg_sink;
DROP TABLE IF EXISTS eg_finds;
DROP TABLE IF EXISTS eg_reliqs;
ALTER TABLE players DROP COLUMN eg_keys;
ALTER TABLE players DROP COLUMN eg_key_miss;
ALTER TABLE players DROP COLUMN eg_live_b;
ALTER TABLE players DROP COLUMN eg_live_until;
ALTER TABLE players DROP COLUMN eg_rh_day;
ALTER TABLE players DROP COLUMN eg_mercy;
ALTER TABLE players DROP COLUMN eg_annals;
ALTER TABLE players DROP COLUMN eg_honours;
ALTER TABLE players DROP COLUMN eg_pity;
ALTER TABLE players DROP COLUMN eg_valk_wk;
ALTER TABLE players DROP COLUMN eg_first;
ALTER TABLE players DROP COLUMN ql_key;
