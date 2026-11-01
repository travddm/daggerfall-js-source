# Staff roles

Admin, Moderator and Owner belong to **accounts**. They are columns of the account's row in `players`
(`staff_admin`, `staff_mod`, `staff_owner`; migration `0191`), not handle lists. A handle is free to whoever registers it
first, so a role keyed on a name would pass to a stranger. No variable in `server-account/wrangler.toml` names a role.

| Role | Can do | Set by |
| --- | --- | --- |
| Moderator | mute, ban and lift on cases; staff chat | an Admin, from the staff panel (`/v1/staff/mod/add`, `/mod/remove`), or the operator |
| Admin | everything a Moderator does, the developers' acts, the `"dev"` feature switches, POI building | an Owner, from the staff panel (`/v1/staff/admin/add`, `/admin/remove`), or the operator |
| Owner | everything an Admin does, plus the audit log, staff invites and cuts, Admin grants, private reports, POI approval | the operator only |

A Moderator cannot grant or remove any role. An Admin who is not an Owner cannot grant or remove an Admin. No HTTP
route makes or removes an Owner.

## Set the first Owner (once, by the operator)

The operator needs deploy access to the Cloudflare account (the same access as `wrangler d1 migrations apply`).

1. Register the account in the game, as any player does.
2. Find its id, and check that the registration time is yours:

   ```bash
   cd server-account
   node ../tools/staffRole.mjs find <handle>
   ```

3. Give the account the role:

   ```bash
   node ../tools/staffRole.mjs set <account id> owner
   ```

   `set` takes `owner`, `admin`, `moderator` or `none`; it replaces the account's earlier role. Add `--local` for the
   local database and `--print` to show the SQL without running it. Without the tool, the same change is one
   `wrangler d1 execute daggerfall-accounts --remote --command "UPDATE players SET staff_owner = 1, staff_admin = 1 WHERE id = '<account id>'"`.

4. The Owner enrols its staff-panel extension: `OWNER_KEYS` in `wrangler.toml` names the public key of the Owner's first
   computer (`<handle>:<key>`). The key only works for an account that already holds `staff_owner`. Every other staff
   member is invited from the panel (`/v1/staff/invite`).

## Discord moderators

A press in the moderators' queue is an account's act. Link the Discord user id to the account id, and the account must
hold a staff role:

```bash
node ../tools/staffRole.mjs discord <account id> <discord user id>
node ../tools/staffRole.mjs discord <account id> --remove
```

Taking the role off the account stops its presses at once. The link grants nothing by itself.

## Notes

- A role taken off applies on the account's next request and the next token. A banned or cut account holds no role
  while the ban or cut stands.
- The remaining `*_HANDLES` vars (`FOUNDER_HANDLES`, `HOURS_FIRST_HANDLES`, `DUNGEON_MASTER_HANDLES`, the Patreon tier
  lists) grant honorary **titles** and glyphs, not staff rights.
- The staff panel's audit log records `admin-add`, `admin-remove`, `mod-add` and `mod-remove`.
