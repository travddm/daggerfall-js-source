-- STAFF-ROLES-BY-ACCOUNT: Admin, Owner and the Discord moderators' links belong to ACCOUNTS, never to names.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote
--
-- Until now Admin was the handle list DEVELOPER_HANDLES and Owner was OWNER_HANDLES (wrangler.toml). Whoever registered a
-- listed name first held the role, so a name the previous project's staff never claimed was a way in to bans, rollbacks and
-- grants. The lists are gone. A role is a column on the account's row, as staff_mod (0144) already was for Moderators:
--
-- players.staff_admin  1 for an Admin: the developer title, glyph and wings, the developers' acts, the "dev" feature switches,
--                      the Market pull, the panel's Admin doors. Granted by an Owner from the panel, or by the operator.
-- players.staff_owner  1 for an Owner (an Admin who may also read the audit log, invite and cut staff, and grant or revoke
--                      Admin). Set only by the operator (tools/staffRole.mjs), never over HTTP. An Owner also holds staff_admin.
-- staff_discord        a Discord user id bound to an account id: a press in the moderators' queue is that account's act, and
--                      only while the account holds a staff role (discord.js actorOf). Set only by the operator.
--
-- The first Admin and Owner: docs/operations/staff-roles.md. No row carries a role until the operator or an Owner gives it.
ALTER TABLE players ADD COLUMN staff_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN staff_owner INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS players_staff_admin ON players (staff_admin) WHERE staff_admin = 1;

CREATE TABLE IF NOT EXISTS staff_discord (
  discord_id TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS staff_discord_player ON staff_discord (player_id);
