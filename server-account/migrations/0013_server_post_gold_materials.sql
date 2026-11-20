-- A deleted character's gold and Stores materials go to its account's mailbox, as its goods do. A piece of post may
-- now carry gold, materials, an item, or any of them. `materials` is a JSON array of { material, origin, qty }.
ALTER TABLE server_post ADD COLUMN gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0);
ALTER TABLE server_post ADD COLUMN materials TEXT CHECK (materials IS NULL OR json_valid(materials));
