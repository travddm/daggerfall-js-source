# The account service

The account service is a Cloudflare Worker named `daggerfall-accounts` in `server-account/`. It holds accounts,
sessions, cloud saves, online characters and the whole persistent online economy, and it mints the identity tokens
the relay checks. This page covers its structure, API surface, auth, scheduled jobs and deploy. Its data model is in
[account-data.md](account-data.md).

## Bindings

`server-account/wrangler.toml`:

| Binding | Kind | Use |
| --- | --- | --- |
| `DB` | D1 database `daggerfall-accounts` | All tables; schema in `server-account/migrations/` |
| `SAVES` | R2 bucket `daggerfall-saves` | Cloud save slots and realm character checkpoints |
| `ADMIT` | Durable Object `AdmitGate` | Admission queue in front of sign-in routes |
| `RELAY` | Service binding to `daggerfall-online` | Pushes signed orders to the relay's `/v1/law` |
| `METRICS` | Analytics Engine `daggerfall_accounts` | Service metrics |

Placement is pinned to one region (`[placement] region`). Crons: `* * * * *` and `41 * * * *`.

## Code layout

| Path | Role |
| --- | --- |
| `server-account/src/index.js` | Worker entry: `fetch` calls `route(request, env)`; `scheduled` calls `runCron` |
| `server-account/src/service.js` | Route sets (`ROUTES`, `OPEN_ROUTES`, `SAFE_OPEN_ROUTES`, `STAFF_ROUTES`, `REPLICA_ROUTES`), body caps, `ACCOUNT_VERSION`, `routeDb` |
| `server-account/src/accounts.js` | Guests, register, login, recover, sessions |
| `server-account/src/password.js` | PBKDF2-SHA256 password hashing |
| `server-account/src/signing.js` | Identity signing key; receipt verification keys |
| `server-account/src/sessionPass.js` | Short-lived HMAC pass for hot routes |
| `server-account/src/titles.js` | Roles and titles from `*_HANDLES` vars; glyphs in the token |
| `server-account/src/admit.js` | `AdmitGate` Durable Object |
| `server-account/src/cron.js` | `MINUTE_JOBS`, `HOUR_JOBS`, `runCron` |
| `server-account/src/saves.js`, `realm.js` | Cloud saves; realm characters |
| `server-account/src/market.js`, `homes.js`, `decor*.js`, `guilds.js`, `professions.js`, `writs.js`, `townSeats.js`, ... | One module per feature area |
| `server-account/src/safety.js`, `sanctions.js`, `modAi.js`, `discord.js`, `staff*.js` | Moderation and staff; see [chat-safety.md](chat-safety.md) and [staff-tools.md](staff-tools.md) |

The service imports shared law from `src/net/` (for example `identityToken.js`, `marketLaw.js`, `decorLaw.js`,
`homeLaw.js`, `nameFilter.js`, `cellTree.js`), so client and server check the same rules.

## Routing

`route()` handles, in order:

1. `OPTIONS` (CORS). `Access-Control-Allow-Origin` is `ALLOWED_ORIGIN` (`*`). Allowed headers include
   `authorization`, `x-session-pass`, `x-d1-bookmark`, `x-realm-lease`, `x-realm-seq`, `x-staff-session`.
2. `/v1/health` and `/v1/pubkey` inline.
3. `SAFE_OPEN_ROUTES`: `/v1/mod/feed` (relay feed, signature over the exact bytes) and `/v1/discord/interactions`
   (Discord signature). No session.
4. Signed relay feeds: `/v1/mod/grant-feed`, `/v1/mod/reaction-feed`, `/v1/mod/hidden-seen`, `/v1/staff/net-feed`,
   each checked by a signature header.
5. `STAFF_ROUTES` (`/v1/staff/*`): POST, staff session in `x-staff-session`. Game sessions are refused.
6. `OPEN_ROUTES` (`/v1/auth/guest`, `/login`, `/recover`) and Patreon callbacks: no session, rate-limited.
7. Everything else needs a session: `Authorization: Bearer <secret>` (or a body `secret` on POST), resolved by
   `resolveSession`. Unknown paths return 404 from the one `ROUTES` set.

JSON bodies are capped at `MAX_BODY_BYTES` (4 KiB) except save uploads (`SAVE_MAX_BYTES`, 4 MiB) and screenshots
(`SHOT_MAX_BYTES`). Reads on `REPLICA_ROUTES` go to a D1 read replica; the `x-d1-bookmark` header keeps a client's
reads after its own writes.

### API surface

| Area | Paths |
| --- | --- |
| Accounts and auth | `/v1/auth/{guest,register,login,recover,logout,session,token}`, `/v1/account/*` (password, email, recovery codes, title, aura, icon, glyph, name, played), `/v1/heartbeat` |
| Saves | `GET /v1/saves`; `PUT/GET/DELETE /v1/saves/<charId>/<name>` plus `/data`, `/shot` |
| Realm characters | `/v1/realm` (list), `/v1/realm/{create,join,leave,delete,trade,die,raise,wed,lineage,lineages,unions}`, `/v1/realm/<id>/data` (checkpoints) |
| Economy | `/v1/market/*` (list, buy, cancel, order, fill, auction, bid, gold, collect), `/v1/marks/*`, `/v1/broker/settle`, `/v1/stores/*`, `/v1/writs/*`, `/v1/prof/*` |
| Homes | `/v1/homes/*` (claim, release, transfer, entry, rooms, rent, decor, yards, layouts, vote, deed) |
| Guilds | `/v1/guilds/*` (found, invite, ranks, vault, hall, castle, board, heraldry) |
| Towns and seats | `/v1/towns/*`, `/v1/seats/*` (influence, sieges, royal tourney, fealty) |
| Group content claims | `/v1/gate/claim`, `/v1/raid/claim`, `/v1/sd/claim`, `/v1/arena/*`, `/v1/duel/*`, `/v1/serpent/claim`, `/v1/star/claim` |
| Other features | `/v1/chapters/*`, `/v1/firmament/*`, `/v1/festival/*`, `/v1/ql/claim`, `/v1/renown/xp`, `/v1/board/*`, `/v1/post/*`, `/v1/mail/*`, `/v1/sea/*` |
| Safety | `/v1/safety/*`, `/v1/report/*`, `/v1/mod/*` |
| Staff | `/v1/staff/*`, `/v1/staff-chat/*` |

## Auth

- **Accounts.** A player starts as a guest (`createGuest`) and may register a handle and password. Handles are
  checked by `checkName` (`src/net/nameFilter.js`) and `handleShape.js`. Recovery uses recovery codes.
- **Passwords.** `password.js` stores `pbkdf2-sha256$<iterations>$<salt>$<hash>`. Iterations are capped at 100 000,
  the Workers limit. `needsRehash` upgrades old hashes on login.
- **Sessions.** `openSession` mints a 32-byte secret and stores only its hash (`sessions` table). Sessions idle out
  after a year. Login is rate-limited (`LOGIN_MAX` per `LOGIN_WINDOW_S`).
- **Session pass.** `sessionPass.js` issues an HMAC pass (key derived by HKDF from the identity key) in
  `x-session-pass`, so hot routes skip the session lookup.
- **Identity token.** `POST /v1/auth/token` mints `v1.<payload>.<Ed25519 signature>` (`mintToken`,
  `src/net/identityToken.js`) with `IDENTITY_PRIVATE_KEY`. TTL is at most 300 s. The payload is built from server rows,
  never from the request: account id `s`, shown name `n` (`wornNameOf`), account kind `k`, worn title and **glyphs**
  (staff and title marks), mute end `mu`, level `lv`, guild, realm-character flag `rc` and id `ci`, and the house
  when it fits under `TOKEN_MAX_CHARS`. The relay verifies it with `IDENTITY_PUBLIC_KEY`. `/v1/pubkey` publishes the
  public key.
- **Orders.** The service signs short-lived orders (`ORDER_TTL_S`, 60 s) with the same key for the relay: bans,
  mutes, staff orders and home orders (`mint*Order`).
- **Roles.** `titles.js` reads comma-separated handle lists from vars (`DEVELOPER_HANDLES`, `MODERATOR_HANDLES`,
  `OWNER_HANDLES`, tier lists in `TIER_LISTS`) through `handleList`, fresh on every request. Removing a handle removes
  the role at once. `players.staff_mod` also grants moderator.

### AdmitGate

`server-account/src/admit.js` is one Durable Object queue, shared by the whole service, in front of `ADMIT_ROUTES`
(guest, login, recover, token, session). A relay deploy drops every player, and they all sign in again within a
minute; without the queue D1 refuses as overloaded.

- It admits `ADMIT_RATE` places a second, first come first served, and up to `ADMIT_BURST` at once when quiet.
- The rest get 503 `queue` with their place and a wait (`ADMIT_WAIT_MIN_MS` to `ADMIT_WAIT_MAX_MS`), without touching
  the database. A place belongs to an address and is dropped after `ADMIT_KEEP_MS` without asking.
- An admitted address holds a pass for `ADMIT_PASS_MS`, so one sign-in (guest row, token, session) waits once.
- **It fails open**: no binding, a throw, or no answer within `ADMIT_ASK_MS` lets the caller in.

## Feature switches

Feature areas have a var with `off`, `dev` (developers only) or `on`: `MARKS_OPEN`, `BOARD_OPEN`, `PROFESSIONS_OPEN`,
`SEATS_OPEN`, `CHAPTERS_OPEN`, `FIRMAMENT_OPEN`, `QUESTLINES_OPEN`, `FESTIVAL_OPEN`; `TOWNS_OPEN` is open unless
`off`. Each module reads its switch through a `*SwitchOf` function at each use. The market has no switch of its own:
`marketOpenFor` needs boards, professions and marks open. `MAINTENANCE` adds a maintenance flag to `/v1/health`.

## Scheduled jobs

`scheduled` calls `runCron(env, { cron })` (`server-account/src/cron.js`), which runs `jobsFor(cron)`:

- **Every minute** (`MINUTE_JOBS`): `auctions`, `guild-writs`, `contracts`, `seats`, `seat-facts`, `town-shares`,
  `yard-snap`, `arena-champion`, `rez-holds`, `safety` (the chat reviewer, Discord cards and freeze-push retries),
  `motherlodes`.
- **Hourly at :41** (`HOUR_JOBS`): `board`, `guild-board`, `harvests`, `craft-writs`, `market-history`, `town-econ`,
  `rate-limits`, `sessions`, `guild-invites`, `realm-findings`, `realm-wealth-hours`, `progress-hours`,
  `crew-signs`, `patrons`, `safety-sweep`, and the staff sweeps (audit, evidence,
  census, messages, events, feeds, reactions, staff chat).

Each job is bounded (`SWEEP_ROWS`, `ROUNDS_MAX`, `FIRING_STATEMENTS_MAX`). A minute job that runs long competes with
player requests for D1.

## Health and deploy

- `/v1/health` returns `{ ok, v: ACCOUNT_VERSION }`. `ACCOUNT_VERSION` is in both `wrangler.toml` and
  `service.js`; `test/server/accountworker.test.js` holds them equal.
- `.github/workflows/account-deploy.yml` deploys the service. It resolves the D1 database id (creating the database
  if absent) in place of the `database_id` placeholder, records a D1 Time Travel bookmark, applies migrations
  (`wrangler d1 migrations apply --remote`, retried only on "overloaded"), puts secrets (`IDENTITY_PRIVATE_KEY`,
  `IDENTITY_PUBLIC_KEY`, the relay's `GATE_SIGNING_KEY`/`GATE_PUBLIC_KEY`, `ANTHROPIC_API_KEY`,
  `DISCORD_BOT_TOKEN`), waits until the live relay serves the source's `RELAY_VERSION` or later (so the service
  never signs what the relay refuses; it gives up without deploying after about five and a half hours), deploys, and
  points Discord at the service.
- **A service deploy drops nobody.** Sockets live on the relay, and requests are stateless.
- Repair workflows (manual, same concurrency group `account-deploy`): `account-recovery.yml`,
  `realm-revive.yml` (a D1 Time Travel restore), `realm-rollback.yml`, `guild-grant.yml`. `sd-clears.yml` and
  `d1-load.yml` only read.

## Running and testing

- `test/accountDb.mjs` builds an in-memory database by running every migration file in name order. Service tests in
  `test/server/` call the handlers with it (for example `accountflow.test.js`, `cloudsaves.test.js`,
  `sessionsign.test.js`).
- `test/laggyD1.mjs` simulates a slow D1.
- `npm run account` (`tools/accountProbe.mjs`) probes a running service. `npm run load` starts local copies of both
  Workers in workerd.
- `cd server-account && npx wrangler dev` runs it locally (a local D1 needs `wrangler d1 migrations apply --local`).
