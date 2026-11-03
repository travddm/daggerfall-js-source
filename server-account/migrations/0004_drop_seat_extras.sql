-- The seat system's extras are gone: fealty and Pacts (with the red lines), banner ribbons, fortifications and the Siege
-- Camp, gifts to the town, guild castles and regional Charters. Dropping a table drops its indexes and triggers with it.
-- Seat writs fed the stockpile and the camps and have nothing to deliver to now, so the open ones are removed. The unused
-- columns town_seat_battles.rams and .works and guild_writs.seat and .camp stay: SQLite cannot drop a column a CHECK reads.
DELETE FROM guild_writs WHERE seat IS NOT NULL;
DROP TABLE guild_pacts;
DROP TABLE guild_fealty;
DROP TABLE town_seat_red;
DROP TABLE town_seat_ribbons;
DROP TABLE town_seat_forts;
DROP TABLE town_seat_fort_held;
DROP TABLE town_seat_fortifier;
DROP TABLE town_seat_stockpile;
DROP TABLE town_seat_camps;
DROP TABLE town_seat_gifts;
DROP TABLE guild_castles;
DROP TABLE town_domain_witness;
DROP TABLE town_seat_levies;
