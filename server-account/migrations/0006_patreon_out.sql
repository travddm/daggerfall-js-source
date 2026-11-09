-- The Patreon account link left core (decision #114): DFJS links to no payment service and grants nothing for money.
-- The unique index names patreon_user, so it is dropped before the column.
DROP INDEX idx_players_patreon_user;
ALTER TABLE players DROP COLUMN patreon_user;
ALTER TABLE players DROP COLUMN patreon_tiers;
ALTER TABLE players DROP COLUMN patreon_status;
ALTER TABLE players DROP COLUMN patreon_at;
