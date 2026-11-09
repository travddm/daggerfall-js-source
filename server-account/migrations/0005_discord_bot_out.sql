-- The Discord moderators' queue left core (decision #113): its account links, each case's card state and the bot's own
-- claim on a case go. Moderators act in the staff panel and in the game. The partial index names discord_state, so it
-- is dropped before the column.
DROP INDEX mod_cases_post_due;
ALTER TABLE mod_cases DROP COLUMN discord_state;
ALTER TABLE mod_cases DROP COLUMN discord_msg;
ALTER TABLE mod_cases DROP COLUMN claimed_at;
DROP TABLE staff_discord;
