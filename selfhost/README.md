# Self-hosting on one machine

This folder runs the relay (`server/`) and the account service (`server-account/`) on one machine under
[workerd](https://github.com/cloudflare/workerd), the runtime Cloudflare Workers run on. Nothing here changes the
Cloudflare deploys: `relay-deploy.yml` and `account-deploy.yml` still read the two `wrangler.toml` files, and so does
the generator here. The design and its later stages (a harness mode, then cluster mode) are in the hosting study,
outside the repository.

workerd is pinned to `1.20261108.1` in `package.json`. Cluster mode is not used.

## What runs

`generate.ts` bundles each Worker with esbuild, as wrangler does, and writes `build/dfo.capnp` from the two TOML files.
One workerd process then serves:

| Service    | Source                        | Role                                                                          |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `relay`    | `server/src/index.js`         | The relay and its `Room` Durable Objects, on port 8787                        |
| `accounts` | `server-account/src/index.js` | The account service and its `AdmitGate`, on port 8788                         |
| `d1`       | `d1/worker.ts`                | The `DB` binding: one SQLite Durable Object that speaks D1's fetcher protocol |
| `r2`       | `r2/worker.ts`                | The `SAVES` binding: R2's protocol over a disk directory or an S3 bucket      |
| `metrics`  | `metrics/sink.ts`             | Only with `--metrics`: prints each `METRICS` data point as a JSON line        |

Durable Object storage, the database and the saves live under the data directory (`data/`, or `/data` in Docker), one
folder for each disk service. The database applies `server-account/migrations/*.sql` when it starts, once each, and
records them in `d1_migrations` as wrangler does.

Each toml binding maps to a self-hosted one: a `[[services]]` binding to the other Worker in the same process, `[vars]`
to text, `[[d1_databases]]` to `d1`, `[[r2_buckets]]` to `r2`, `[[analytics_engine_datasets]]` to the metrics sink
when it is on (unbound otherwise, which both services allow). A toml key that the generator does not translate stops
it with an error. `[triggers]` is not translated: the cron sidecar posts each schedule to the account service's cron
door (`POST /__cron`, `server-account/src/cron-triggers.ts`).

## Secrets

`keys.ts` writes `.env` (git-ignored): a new identity signing pair, a gate receipt pair, a cron door secret and an
operator door secret. It keeps a value that is already there, so running it again changes nothing. workerd reads these
from the environment:

| Variable                                                                            | Read by                | Unset                                  |
| ----------------------------------------------------------------------------------- | ---------------------- | -------------------------------------- |
| `IDENTITY_PRIVATE_KEY`, `IDENTITY_PUBLIC_KEY`                                       | both                   | No sign-in token can be minted or read |
| `GATE_SIGNING_KEY`, `GATE_PUBLIC_KEY`                                               | relay, accounts        | Gate kills are not counted             |
| `OPERATOR_SECRET`                                                                   | accounts               | The operator door is off               |
| `CRON_SECRET`                                                                       | accounts, cron sidecar | The cron door is off                   |
| `ANTHROPIC_API_KEY`, `STAFF_ANALYTICS_*`                                            | as on Cloudflare       | That feature is off                    |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | r2, with `--r2 s3`     | The bucket refuses every request       |

The chat reviewer sends player chat to a third party. With `ANTHROPIC_API_KEY` set and `MOD_AI` turned from `off` to
`shadow` or `on` in `server-account/wrangler.toml`, the account service sends reported lines, and the public chat lines
that the relay posts to `MOD_FEED_URL`, to Anthropic's Messages API (`api.anthropic.com`). Speakers go as `P1`, `P2`,
but the text is whatever the players typed. The kit ships `MOD_AI = "off"`, so the key alone sends nothing.

The feed and law URLs in both `wrangler.toml` files name the reserved hosts `accounts.invalid` and `relay.invalid`. The
kit routes them through the service bindings, which use only the path. A deploy without those bindings must set its
own hosts there.

The relay's `IDENTITY_PUBLIC_KEY` comes from the environment, not from `server/wrangler.toml`: that file holds the
Cloudflare deploy's value.

## Run it with Docker

```bash
node selfhost/keys.ts
```

```bash
DFO_RELAY_HOST=relay.example.org DFO_ACCOUNTS_HOST=accounts.example.org docker compose -f selfhost/docker-compose.yml up -d --build
```

Caddy terminates TLS for both names and proxies to workerd. Players enter one address in the game, the relay's
(`wss://<relay host>`, Settings, Online, Relay). The relay names its account service at `/profile` from
`ACCOUNT_SERVICE_URL`, which the compose file sets to `https://<accounts host>`. `GENERATE_FLAGS="--metrics"` or
`GENERATE_FLAGS="--r2 s3"` before `docker compose` passes generator options into the image.

## Run it without Docker

```bash
npm ci --prefix selfhost
```

```bash
node selfhost/generate.ts
```

```bash
node selfhost/keys.ts
```

Then start workerd with `.env` in its environment, and the cron sidecar beside it. Put
`ACCOUNT_SERVICE_URL=https://<accounts host>` in `.env`, or the relay names no account service and players cannot
sign in:

```bash
set -a && . selfhost/.env && set +a && selfhost/node_modules/.bin/workerd serve selfhost/build/dfo.capnp --experimental
```

```bash
set -a && . selfhost/.env && set +a && node selfhost/cron/sidecar.ts
```

`--experimental` is required: Durable Object storage on disk (`localDisk`) is an experimental workerd feature.

## Operator commands

`node selfhost/operator.ts` sets staff roles, issues recovery codes, sends server posts and rolls back realm
characters through the account service's operator door. It runs on the host, with `OPERATOR_SECRET` from `.env`;
Caddy does not pass the door to the public name. See `docs/operations/operator-commands.md`.

## Limits

- The R2 shim serves what the account service uses: get, head, put, list by prefix and delete. Ranges, conditional
  requests, delimited listings and multipart uploads are refused.
- The disk backend keeps one file for each object and its key index in a SQLite Durable Object.
- A restart of workerd drops every connected player, as a relay deploy does on Cloudflare.
- Generated files (`build/`) and data (`data/`) are not in git. Regenerate after a change to a toml or to the code.
