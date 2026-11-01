# Operator workflows

This page covers the manual workflows that read or change production data: repairs to accounts and characters,
awards, messages, and load readings. Run them from the repository's Actions tab, on `main`.

## Rules that apply to all of them

- **Dry run first.** Every workflow that writes, except `account-recovery.yml`, has an `apply` input that is off by
  default. Run it once with `apply` off, read the run's summary, then run it again with `apply` on.
- **One account at a time.** Inputs name one account by its handle (username), or one guild by name. Queries read
  only that account's rows. Account rows are never exported whole.
- **Inputs reach scripts as environment variables**, and each script checks their shape before any SQL is built.
- **The SQL comes from a tested tool in `tools/`**, never from the workflow file. Change the tool and its test, not
  the YAML.
- All of them use `CLOUDFLARE_API_TOKEN` and `npx wrangler@4`. They resolve the D1 database id at run time (the
  `database_id` in `server-account/wrangler.toml` is a placeholder) and never create a database.
- Each has its own concurrency group, so a run never cancels a deploy that waits.

## Repairs that rewind the database

`realm-revive.yml` reads the past through D1 Time Travel. D1 can read its past only by
restoring the whole database in place, so this workflow:

1. Hold the account service for maintenance: deploy it with `--var MAINTENANCE:1`. Every route except `/v1/health`
   and `/v1/pubkey` answers 503, and a playing client's checkpoint waits. Any write during the rewind would be lost.
2. Record the present: its Time Travel bookmark and row counts. The bookmark and the restore command go into the run
   summary.
3. Restore the database to the moment asked for, read what is needed, then restore it to the present bookmark and
   check the row counts. This last step always runs.
4. Plan the repair from the two readings and, with `apply` on, write it with guarded statements.
5. Lift maintenance by deploying the Worker again. **If the present could not be put back, the service stays held**
   and the run prints the exact `wrangler d1 time-travel restore ... --bookmark ...` command to type.

Time Travel keeps 30 days on the Workers Paid plan and 7 on Free. Run these at a quiet hour; the hold lasts a few
minutes. A dry run holds the service too, because it reads the past through the same rewind. `realm-revive.yml`
finds the account and character before it holds anything, so a run that finds nothing holds nothing.

| Workflow | Inputs | What it repairs | Tool |
| --- | --- | --- | --- |
| `realm-revive.yml` | `handle`, `character` (`r` + 20 hex, when several fell), `keep_homes`, `keep_guild`, `apply` | Undoes one realm character's death: guild seat, homes, held pieces, union. The death is stamped as taken back (`src/systems/legacy/revived.js`), so a device with an old copy cannot kill the character again. Needs a game build and account service that carry that rule. | `tools/reviveRealmCharacter.mjs` |

## Repairs without a rewind

| Workflow | Inputs | What it does | Tool |
| --- | --- | --- | --- |
| `realm-rollback.yml` | `handle`, `character`, `apply` | Rolls one realm character back to its last clean save, using the review's own rollback (`server-account/src/review.js`). It refuses when that save is not from before the problem. The person running it must be an Admin account (`players.staff_admin`, see [Staff roles](staff-roles.md)); the run's actor is recorded in a staff finding. A client playing that character loses its seat. | `tools/realmRollback.mjs` |
| `guild-grant.yml` | `guild` (name, ignoring case and punctuation), `gold` (digits), `apply` | Adds gold to one guild's treasury and to the part of it that buys a hall (`realm_gold`). The guild ledger records the award. Fails, and writes nothing, on an unknown guild or a total over the treasury cap. | `tools/grantGuildGold.mjs` |
| `account-recovery.yml` | `handle`, `hash` | Sets a new recovery-code hash on one registered account; nothing else. Use it only after the owner of the account is verified. | `tools/reissueRecoveryCode.mjs` |
| `server-post.yml` | `handles` (comma-separated), `batch` (a name, once per account), `item` (`none` or a listed item), `subject` (80 chars), `message` (1200 chars, `\n` for a new line), `apply` | Sends a message from the developers to the mailbox of named accounts, optionally with an item minted by the game's own code (`POST_ITEMS`). A batch name reaches each account once, so a second run with the same name sends nothing new. An unknown handle fails the run. | `tools/sendServerPost.mjs` (`server-account/src/post.js`) |

### Issuing a recovery code

A player who lost both the password and every recovery code has no self-service way back (email is optional).

1. Verify that the person owns the account, outside the game.
2. `node tools/reissueRecoveryCode.mjs <handle>` locally. It prints the code and its hash.
3. Run `account-recovery.yml` with the handle and the **hash**. Never put the code into a workflow input: inputs show
   on the run page.
4. Give the code to the player. They use it in "Forgot password", choose a password, and get new recovery codes,
   which makes the issued code useless.

## Readings (no writes)

| Workflow | Inputs | What the run summary shows | Tool |
| --- | --- | --- | --- |
| `d1-load.yml` | `hours` (1-168), `sort_by` (`time`, `reads`, `writes`) | D1 query insights (`wrangler d1 insights`), and the account service's metrics from Analytics Engine: D1 wait by route per minute, cron jobs, non-2xx answers, rows written by route and table. | `tools/d1Load.mjs` (`test/server/d1load.test.js`) |
| `relay-load.yml` | `hours` (1-168) | The relay's room metrics (`server/src/relayScale.js`): rooms by kind, per five minutes, and the busiest rooms. | `tools/relayLoad.mjs` (`test/server/relayload.test.js`) |
| `do-active.yml` | `days` (1-7) | Durable Object active time from Cloudflare's GraphQL API: objects awake each day, objects awake more than 22 hours, object-days and cost, and the longest-awake objects. Durable Object duration is the largest part of the Cloudflare bill. | `tools/doActive.mjs` (`test/server/doactive.test.js`) |
| `sd-clears.yml` | `slot` (empty for the first ever cleared) | Every Abyss Dungeon cleared, and the names of the group that cleared the one asked for (`sd_kills` rows). | `tools/sdClears.mjs` |

## Adding an operator workflow

- Put the logic, including every SQL statement, in a tool under `tools/` with a test. The workflow only runs it.
- Default to a dry run, and write the plan to `$GITHUB_STEP_SUMMARY`.
- Pass inputs through `env:`, and validate them in the tool.
- Give it its own `concurrency` group with `cancel-in-progress: false`.
- If it must read the past, copy the hold-and-rewind steps of `realm-revive.yml` exactly, including the step that
  puts the present back and the refusal to lift maintenance over a rewound database.
