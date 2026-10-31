# GitHub Actions workflows

This page lists every workflow in `.github/workflows/`: what starts it, what it does and which repository secrets it
reads. Details of the deploys are in [deploying.md](deploying.md), of the desktop release in
[desktop-release.md](desktop-release.md), and of the operator workflows in [admin-workflows.md](admin-workflows.md).

## Checks and deploys

| Workflow | Trigger | What it does | Secrets |
| --- | --- | --- | --- |
| `verify.yml` | Called by other workflows (`workflow_call`) | The one gate: lint and types, the suite in 8 shards, the course sweep (`eg-sweep.yml`), the build. Inputs: `ref`, `build`, `sweep` (seeds a band). Output: the cache key of the test times it used. | None |
| `check.yml` | Every pull request; manual | Calls `verify.yml`, then `test-times.yml`. Its `check` job is the required status: it fails unless `verify` succeeded. | None |
| `test-times.yml` | Called by `check.yml` and `deploy.yml` | Merges the 8 shards' recorded file times (`tools/testTimes.mjs --merge`) and saves them in the Actions cache for the next run's split. Also uploads them as the `test-times` artifact. | None |
| `eg-sweep.yml` | Called by `verify.yml`; daily at 06:41 UTC; manual | Crosses every Elite Breach course of 4 bands with the real movement code (`tools/egSpanSolve.mjs --sweep --golden`). 25 seeds a band on a pull request, 500 on the schedule, a manual run and before a relay deploy (split in 6 parts above 100 seeds). | None |
| `deploy.yml` | Push to `main`; manual | Verifies `main`'s head, builds the site, waits until the account service serves this build's `ACCOUNT_VERSION`, then publishes to GitHub Pages. | None (uses `pages: write`, `id-token: write`) |
| `relay-deploy.yml` | Push to `main`; manual (`force`, `redeploy`) | Deploys `server/` only when `RELAY_VERSION` in `src/net/wire.js` differs from the live relay's `/health`. Runs `verify.yml` (500 sweep seeds) first. Drops every connected player. | `CLOUDFLARE_API_TOKEN` |
| `account-deploy.yml` | Push to `main` that touches `server-account/**` or a file the account Worker imports; manual | Runs `verify.yml`, creates the D1 database and R2 bucket if missing, applies migrations, waits for the relay, deploys `server-account/`, mints missing keys, puts optional secrets, verifies the live service, registers Discord commands. | `CLOUDFLARE_API_TOKEN`; optional `PATREON_CLIENT_SECRET`, `PATREON_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `DISCORD_BOT_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `intro-quality.yml` | Push to branch `codex/cinematic-intro-overhaul`; pull requests that touch the intro's files | Runs the intro's 3 test files, then `tools/introAudioCheck.mjs`, `tools/introProbe.mjs` and `tools/introCapture.mjs` (Playwright and ffmpeg), and uploads the review video as an artifact. | None |

## Desktop release and patch notes

| Workflow | Trigger | What it does | Secrets |
| --- | --- | --- | --- |
| `release-desktop.yml` | Push to `main`; push of a tag `app-v*`; manual (`release_tag`) | Gates on `verify.yml`, builds the Electron installers on Ubuntu, Windows and macOS, then publishes one GitHub Release with every file and notes from the merged pull requests. A manual run without a tag only uploads run artifacts. | Built-in `github.token` only |
| `release-notes.yml` | A merged pull request's description is edited (`pull_request_target: edited`); manual (`tag`) | Re-reads the patch notes for the release that first shipped that pull request and rewrites that release's body (`scripts/desktopRelease.mjs renotes`). Files are not touched. | Built-in `github.token` only |
| `ste-notes.yml` | Pull request opened, edited, reopened or pushed to (open ones only) | Checks the `## Patch notes` section of the description against the machine-checkable rules of ASD-STE100 Simplified Technical English (`scripts/steNotes.mjs`). A description with no patch notes passes. | None |

## Operator workflows (manual only)

All read or write production through `npx wrangler@4` with `CLOUDFLARE_API_TOKEN`. Each has its own concurrency
group, so a read never cancels a waiting deploy.

| Workflow | Writes? | What it does |
| --- | --- | --- |
| `realm-restore.yml` | Yes (dry run first) | Restores rows deleted by a past bug from D1 Time Travel. Holds the service in maintenance during the rewind. |
| `realm-revive.yml` | Yes (dry run first) | Undoes one realm character's death from D1 Time Travel. Holds the service in maintenance during the rewind. |
| `realm-rollback.yml` | Yes (dry run first) | Rolls one realm character back to its last clean save, through the review's own rollback. |
| `guild-grant.yml` | Yes (dry run first) | Awards gold to one guild's treasury. |
| `account-recovery.yml` | Yes | Sets a new recovery-code hash on one account. |
| `server-post.yml` | Yes (dry run first) | Sends a message from the developers, optionally with an item, to named accounts. |
| `d1-load.yml` | No | D1 query insights and the account service's own metrics for a time window. |
| `relay-load.yml` | No | The relay's room metrics for a time window. |
| `do-active.yml` | No | Durable Object active time and cost by day, from Cloudflare's GraphQL API. |
| `sd-clears.yml` | No | Lists Abyss Dungeon clears and the names of one group. |

See [admin-workflows.md](admin-workflows.md) for inputs and procedure.

## Conventions the workflows share

- **Permissions** default to `contents: read`. No checkout keeps a token (`persist-credentials: false`) where nothing
  pushes.
- **Dependencies** are cached by `package-lock.json`; `npm ci` runs only on a cache miss.
- **Inputs reach scripts as environment variables**, never pasted into the script text, so an input cannot inject
  shell. Keep this when you add an input.
- **Writes are dry runs by default.** Every operator workflow that writes, except `account-recovery.yml`, has an
  `apply` input that defaults to off. The dry run writes its plan to the run's summary page.
- **Facts are read from source, not typed twice.** Workflows read `RELAY_VERSION` (`src/net/wire.js`),
  `ACCOUNT_VERSION` (`server-account/src/service.js`), `DEFAULT_SERVER` (`src/net/online.js`) and
  `DEFAULT_ACCOUNT_SERVICE` (`src/net/accountClient.js`) with `grep`. Keep those declarations on one line in the
  form `export const NAME = '...'`, or the workflows cannot read them.
- **Exception:** `relay-deploy.yml` hard-codes the relay's and the account service's `workers.dev` hosts in its
  `curl` lines. If a Worker or the Cloudflare subdomain is renamed, edit those lines by hand.
- **Tests read the workflows.** `test/server/relaydeploy.test.js`, `test/server/accountdeploy.test.js`,
  `test/tooling/flow1_ci.test.js`, `test/tooling/citimes.test.js` and others check workflow structure. Run
  `npm run test:changed` after a workflow edit.
