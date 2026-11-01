# Deploying the site and the services

This page covers the three production deploys that run off `main` (the site, the relay and the account service),
the order they keep, the Cloudflare configuration, the secrets, and the D1 migrations.

## The three parts

| Part | Source | Host | Deployed by |
| --- | --- | --- | --- |
| Site (landing page at `/`, game at `/play/`, plus `terms/`, `privacy/` and lab pages) | `src/`, `index.html`, `play/`, `public/`; entries in `vite.config.js` `input` | GitHub Pages | `deploy.yml` |
| Relay (multiplayer rooms, Durable Objects) | `server/` (`server/src/index.js`; shared law in `src/net/wire.js`) | Cloudflare Worker `daggerfall-online` | `relay-deploy.yml` |
| Account service (accounts, tokens, saves, realm) | `server-account/` (`server-account/src/index.js`) | Cloudflare Worker `daggerfall-accounts`, one D1 database, one R2 bucket | `account-deploy.yml` |

A merge to `main` starts all three workflows, plus `release-desktop.yml`. Each one decides on its own whether it has
work, and each one waits for the part it depends on.

## The order: relay, then account service, then site

The account service signs identity tokens that the relay verifies. The site's forms call the account service. So a
change must reach production in this order:

1. **Relay.** `relay-deploy.yml` deploys when the source's `RELAY_VERSION` differs from the live one.
2. **Account service.** `account-deploy.yml` waits, up to about 5.5 hours, until the live relay's `/health` reports
   a version at least the source's `RELAY_VERSION`. The trailing number of the version string is compared.
3. **Site.** `deploy.yml` waits, up to about 5 hours 50 minutes, until the account service's `/v1/health` reports a
   version at least the source's `ACCOUNT_VERSION`. Then it publishes.

If one step fails, the later ones time out and fail too. Fix the failed deploy and re-run it; then re-run the later
ones, or let the next push to `main` retry them. Every deploy is idempotent.

## The site (`deploy.yml`)

1. Pins `main`'s head commit once. Every later job uses that commit.
2. Runs `verify.yml` on it (without its own build) in parallel with the site build.
3. Builds the site: `npm ci`, `npm run build` (Vite, `vite.config.js`, `base: './'`). The build writes the commit
   into `src/buildTag.js` (`prebuild`: `scripts/buildTag.mjs`) and restores the file after (`postbuild`).
4. Adds a preview under `site/preview/`: a build of the branch `chatgpt/exact-face-atlas`. **A missing
   `chatgpt/exact-face-atlas` branch fails the site deploy.** Remove the step when that preview is no longer wanted.
5. Waits for the account service's version (above), then publishes with `actions/deploy-pages`.

Only one site deploy runs at a time; a newer push cancels an older run (`concurrency: pages`).

`tools/verify-deploy.mjs` checks by content that the live site serves a given build.

## The relay (`relay-deploy.yml`)

**A relay deploy restarts every Durable Object and drops every connected player.** They reconnect on their own, and
the reconnect wave loads the account service (one token mint a socket).

So the trigger is the version, not the changed paths. `src/net/wire.js` changes often for client-only reasons.

- Bump `RELAY_VERSION` in `src/net/wire.js` (the `worldNNN` string) when, and only when, the relay's behaviour
  changes. The welcome message carries it, the client compares it, and `/health` reports it.
- A push that bumps no version stops after one `curl`: the relay is already current.

Steps when the versions differ:

1. `drift`: compares source and live. If they differ, `verify.yml` runs.
2. Refuses to deploy on a push when `/health` does not answer. A manual run may.
3. Checks that `IDENTITY_PUBLIC_KEY` in `server/wrangler.toml` equals the key the account service publishes at
   `/v1/pubkey`. A mismatch stops the deploy, because the relay would refuse every token. No answer is only a warning.
4. **Siege blackout:** waits, in 5-minute steps, while the account service's `/v1/seats/sieges/live` says a siege is
   live or starts within 30 minutes.
5. `npx wrangler@4 deploy` in `server/`.
6. Polls `/health` until it reports the new version (5 minutes at most).

Manual inputs:

- `force`: skips the siege wait. It voids any live siege.
- `redeploy`: deploys even when the live version already matches. Use it for a change that only `wrangler.toml`
  carries (a var).

Runs never cancel each other (`cancel-in-progress: false`): a run stopped between deploy and verify would leave an
unconfirmed state.

**Adding a Durable Object class** to the relay needs a new `[[migrations]]` entry in `server/wrangler.toml`
(`new_sqlite_classes`), and the class exported from `server/src/index.js`. Export only handlers and classes from a
Worker entry; workerd refuses to start an entry that exports a plain value.

## The account service (`account-deploy.yml`)

This Worker holds no sockets, so a deploy drops nobody. The trigger is a path filter: `server-account/**` plus every
file under `src/`, `vendor/` and `tools/` that the Worker imports. `test/server/accountdeploy.test.js` checks that
list against the Worker's real import graph (`test/importGraph.mjs`). When the test fails, add the missing paths to
the `paths:` list.

Bump `ACCOUNT_VERSION` in `server-account/src/service.js` and the `ACCOUNT_VERSION` var in
`server-account/wrangler.toml` (the `acctNNN` string) with every change to the service. The site deploy waits for it,
and `test/server/accountdeploy.test.js` fails when the two differ.

Steps (every one is safe to re-run):

1. `verify.yml`.
2. Stops at once when `CLOUDFLARE_API_TOKEN` is not set.
3. Creates the D1 database `daggerfall-accounts` if it does not exist, reads its id from Cloudflare, and writes it
   into the runner's copy of `wrangler.toml` in place of the sentinel `resolved-by-account-deploy-workflow`.
4. Creates the R2 bucket named by `bucket_name` in `wrangler.toml` if it does not exist. A Worker bound to a missing
   bucket does not start.
5. Records the database's Time Travel bookmark in the run summary, with the restore command.
6. Applies migrations (below).
7. Turns on D1 read replication. A refusal is a warning.
8. Waits for the relay (see the order, above).
9. `wrangler deploy`. The URL is read from wrangler's output, not typed.
10. Mints the identity signing pair (`IDENTITY_PRIVATE_KEY`, `IDENTITY_PUBLIC_KEY`) **only if the Worker has none**.
    Minting again would invalidate every token in use. A new public key must then be copied into
    `server/wrangler.toml` `IDENTITY_PUBLIC_KEY`; the run summary says so.
11. Mints the gate receipt pair if either half is missing: the private half goes to the relay as `GATE_SIGNING_KEY`,
    the public half to this Worker as `GATE_PUBLIC_KEY`. `secret put` redeploys a Worker, so a run that mints this
    pair also redeploys the relay and drops every connected player, once.
12. Puts the optional secrets the repository has (below). A missing one turns its feature off; it is not an error.
13. Verifies the live service: `/v1/health` names this version, the gate public key is held, a password route runs
    on the platform, `/v1/pubkey` answers.
14. Registers the Discord bot's commands and endpoint when `DISCORD_BOT_TOKEN` is set (`server-account/src/
    discordCommands.js`, `tools/discordModCommands.mjs`).

A secret listing that cannot be read stops the job. It must never be read as "no secrets", because that would
re-mint the signing pair.

### D1 migrations

- Files: `server-account/migrations/NNNN_name.sql`, numbered in order. `0001_schema.sql` holds the whole schema an
  empty database starts from. A schema change is a new file with the next number (`0002_<what>.sql`); never edit a
  file that was applied, `0001_schema.sql` included.
- Applied by `wrangler d1 migrations apply`, which records each applied file in the `d1_migrations` table and runs
  only the missing ones, in order. A file is not idempotent (`ALTER TABLE ADD COLUMN`, `CREATE TABLE` without
  `IF NOT EXISTS`), so never run one by hand with `d1 execute`.
- When D1 answers "overloaded" (code 7429 with that wording), the step retries after 20, 40, 60, 90 and 120 seconds.
  Any other failure stops the deploy. A 7429 "reset" (CPU limit) is never retried: retrying would reset the live
  database again.
- To undo a bad migration, restore the database with D1 Time Travel to the bookmark the run recorded:
  `npx wrangler d1 time-travel restore daggerfall-accounts --bookmark <b>`, then redeploy.
- Tests apply every migration to `node:sqlite` (`test/accountDb.mjs`); `npm run account` applies them through
  wrangler (see [../testing/probes.md](../testing/probes.md#account-service-probe)).

## Cloudflare configuration (`wrangler.toml`)

Both Workers share one Cloudflare account (`account_id`) and run on `workers.dev`.

`server/wrangler.toml` (relay):

| Entry | Purpose |
| --- | --- |
| `[[durable_objects.bindings]] ROOMS` -> class `Room` | Every room (map cells, the hub, region channels, instances). SQLite-backed (`[[migrations]] v1`). |
| `[[services]] ACCOUNTS` | Service binding to the account Worker. |
| `[[analytics_engine_datasets]] METRICS` | Room metrics (`server/src/relayScale.js`), read by `relay-load.yml`. |
| `[vars] IDENTITY_PUBLIC_KEY`, `IDENTITY_MAX_TTL_S` | Verifies identity tokens. Must match the account service's key. |
| `[vars] CELL_SPLIT_AT`, `CELL_MERGE_AT`, `*_DWELL_MS`, `REGION_SHARDS` | Crowd thresholds for splitting and merging cells. |
| `[vars] *_FEED_URL`, `HIDDEN_SEEN_URL` | Account service endpoints the relay calls for moderation and staff feeds. |
| `[vars] *_DISCORD_ROLE`, `*_DISCORD_THREAD` | Discord targets for event announcements; empty turns one off. |

`server-account/wrangler.toml` (account service):

| Entry | Purpose |
| --- | --- |
| `[[d1_databases]] DB` | The one database. `database_id` is the sentinel the workflows replace. |
| `[[r2_buckets]] SAVES` | Cloud saves. |
| `[[durable_objects.bindings]] ADMIT` -> class `AdmitGate` | The sign-in line: queues the burst of sign-ins after a relay deploy (`server-account/src/admit.js`). |
| `[[services]] RELAY` | Service binding to the relay. |
| `[[analytics_engine_datasets]] METRICS` | Service metrics (`server-account/src/metrics.js`), read by `d1-load.yml`. |
| `[placement] region` | Runs the Worker near the D1 primary. |
| `[triggers] crons` | The service's own clock (`server-account/src/cron.js` `runCron`): sweeps and retention. |
| `[vars] ACCOUNT_VERSION` | Must equal `ACCOUNT_VERSION` in `server-account/src/service.js`. |
| `[vars] *_HANDLES`, `OWNER_KEYS`, `DISCORD_MODERATORS` | Role lists: comma-separated account handles for developers, moderators, owners and honorary titles. Changing one is a code change and a deploy. |
| `[vars] *_OPEN`, `SEASON_ZERO_WEEK`, `DOMAINS_WEEK` | Feature switches and season schedule. |
| `[vars] MOD_AI`, `MOD_AI_MODEL`, `MOD_AI_DAILY_MAX` | The chat-safety reviewer's mode and limits. |
| `[vars] DISCORD_MOD_CHANNEL`, `DISCORD_PUBLIC_KEY`, `DISCORD_INVITE_URL` | The moderation bot's channel and interaction key. |
| `[vars] PATREON_CLIENT_ID`, `PATREON_TIERS` | Patreon linking. |

A var change in the relay's file deploys only with a manual `relay-deploy.yml` run with `redeploy` on. A var change
in the account file deploys on the next push (the file is under `server-account/**`).

## Secrets

Repository secrets (Settings > Secrets and variables > Actions):

| Secret | Used by | Effect when absent |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Every deploy and operator workflow | Nothing deploys. Needs Workers, D1 (edit), R2 and Durable Objects permissions. |
| `ANTHROPIC_API_KEY` | `account-deploy.yml` -> Worker secret | The chat-safety reviewer (`server-account/src/modAi.js`) is off. |
| `DISCORD_BOT_TOKEN` | `account-deploy.yml` -> Worker secret and command registration | The Discord bot is off. |
| `PATREON_CLIENT_SECRET`, `PATREON_WEBHOOK_SECRET` | `account-deploy.yml` -> Worker secrets | Patreon linking or pledge tracking is off. |

Worker secrets the workflow mints and never stores in the repository: `IDENTITY_PRIVATE_KEY`, `IDENTITY_PUBLIC_KEY`,
`GATE_PUBLIC_KEY` (account service) and `GATE_SIGNING_KEY` (relay). Rotate the identity pair only on purpose: delete
the secrets, run the deploy, copy the new public key into `server/wrangler.toml`, and redeploy the relay. Every
signed-in player must sign in again.

## Running the services locally

- Relay: `cd server && npm ci && npx wrangler dev`. Point the game at it with `?server=ws://127.0.0.1:8787` (the
  world host reads `?server=`, then the `onlineServer` preference, then `DEFAULT_SERVER`).
- Account service: `npm run account` runs it in workerd with fresh state; `npm run load` runs both Workers together
  (see [../testing/probes.md](../testing/probes.md)).
