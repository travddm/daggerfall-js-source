# Running the tests

This page covers how the suite runs locally and in CI: the runner, the shard split, the changed-files loop, the
recorded times and the game data that some tests need.

## The runner

The suite uses Node's built-in runner, `node:test`, with `node:assert/strict`. There is no Jest, Mocha or Vitest.
Every file named `*.test.js` anywhere under `test/` is a test file. Each file runs in its own process.

Node must be `^20.19.0 || >=22.12.0` (`package.json` `engines`). CI uses Node 22.

All lists of test files go through one function, `runTests` in `tools/testShards.mjs`. It does three things:

- It orders the files longest first by their recorded times, so the slow files start first.
- It sets `--test-concurrency` to every core (`os.availableParallelism()`). Node's default leaves one core idle.
- It adds two reporters: the runner's own (`spec` on a terminal, `tap` elsewhere) and `tools/failSummary.mjs`.

`tools/failSummary.mjs` writes one line for each failing test at the end of the log: file, line, name and the first
line of the error. On GitHub Actions it also writes an `::error` annotation for each failure and a table in the job
summary. It does not change any verdict.

On Windows the command line is limited to 32,767 characters. `runTests` splits a long file list into several runner
processes that run one after another (`WIN32_ARGV_BUDGET`). Elsewhere it uses one process.

## Commands

| Command | What it runs |
| --- | --- |
| `npm test` | The whole suite: `node tools/testShards.mjs 1/1`. |
| `npm run test:changed` | Only the test files a change can affect (`tools/testChanged.mjs`, below). |
| `node tools/testShards.mjs 3/8` | Shard 3 of 8, as CI runs it. |
| `node tools/testShards.mjs 3/8 --list` | The files in shard 3 of 8, one a line. |
| `node tools/testShards.mjs --plan 8` | File count and recorded seconds for each of 8 shards. |
| `node --test test/ui/chatscroll.test.js` | One file, directly. |
| `npm run lint` | ESLint over `src/`, `server/src/`, `server-account/src/`, `test/`, `tools/`, `scripts/`, `app/` and the root `*.config.js`. It keeps a content-keyed cache in `node_modules/.cache/eslint/`. |
| `npm run types` | `tsc -p tsconfig.json`. `checkJs` is off: only `src/` files with `// @ts-check` on their first line are reported. `test/systems/save/hard3_types.test.js` decides which files must opt in. |
| `npm run build` | `vite build` into `dist/`. |
| `npm run check` | Lint, types, the whole suite and the build, in series. Slow; use it only when CI cannot run. |

To run one area, list its files with a quoted glob: `node --test "test/net/**/*.test.js"`. Do not pass a bare
directory such as `test/ui/`: a trailing directory path breaks file discovery on Node 22.

Runner flags pass through the tools. `npm test -- --test-name-pattern=foo` and
`node tools/testChanged.mjs --test-only` hand every `--test-*` argument to each runner process (`runnerFlags`).

## The changed-files loop

`npm run test:changed` (`tools/testChanged.mjs`) is the loop while you work. It picks a test file when any of these
is true:

1. The test file itself changed.
2. A file the test imports changed. It follows relative `import`, `export ... from` and `import()` through every
   depth of modules (`closureOf`).
3. The test file's text contains a changed file's path or its base name. This catches tests that read source files
   as text. Matching by base name can pick too many files, never too few.

A change to `package.json`, `package-lock.json` or `tsconfig.json` runs the whole suite (`EVERYTHING`).

"Changed" means: the diff from the merge base with `origin/main` (else `HEAD`), plus staged, unstaged and untracked
files. Options:

- `--list` prints the chosen files and runs nothing.
- `--base <rev>` compares against another commit.

When a change touches a module that most tests import (a scene host such as `src/scenes/world.js`), the tool picks
most of the suite. In that case run the change's own test files and let CI run the rest.

## Shards and recorded times

`shardsOf` in `tools/testShards.mjs` splits files into N shards. It sorts files longest first and puts each file on
the shard with the least time so far. A file with no recorded time weighs the median. The split is deterministic, so
every CI job computes the same shards. Every file is in exactly one shard. `test/tooling/flow1_ci.test.js` holds this.

The weights live in `tools/testTimes.json` (file path to milliseconds). Stale or missing times only make the shards
less even. They never drop a file.

- `npm run test:times` (`tools/testTimes.mjs`) re-times every file on this machine. Run it on a quiet machine;
  background load inflates the numbers.
- `node tools/testTimes.mjs --jobs 2` limits the parallel jobs.
- `node tools/testTimes.mjs --merge <dir>` merges per-shard records (`*.json`) onto `tools/testTimes.json`. A recorded
  time replaces the old one. A file not in the suite any more is dropped.

`node tools/testShards.mjs i/n --record <file>` sets `TEST_TIMES_RECORD`. The fail-summary reporter then adds each
file's wall time to that JSON file (`tools/fileTimes.mjs`).

## What CI runs

`.github/workflows/verify.yml` is the one gate. It runs these jobs in parallel:

| Job | Steps |
| --- | --- |
| `static` | `npm run lint`, `npm run types` |
| `times` | Finds the newest saved times in the Actions cache (`test-times-*`), lookup only. |
| `test` (matrix 1..8) | Restores those times, then `node tools/testShards.mjs <i>/8 --record ...`. Uploads each shard's record as an artifact. |
| `build` | `npm run build`, unless the caller passes `build: false`. |

Every job restores `node_modules` from a cache keyed on `package-lock.json` and runs `npm ci` only on a miss.

`check.yml` (every pull request), `deploy.yml`, `relay-deploy.yml`, `account-deploy.yml` and `release-desktop.yml`
all call `verify.yml`. After a run, `test-times.yml` merges the eight shard records and saves them to the Actions
cache under `test-times-<run_id>-<attempt>`. The next run's shards split by those times. A pull request's saved times
stay with its branch; the times saved by `deploy.yml` on `main` are visible to every branch.

The pull request check job `check` runs with `if: always()` and fails unless `verify` succeeded. A required check
that is skipped would otherwise pass.

A pull request that has a merge conflict with its base runs no workflow at all. Merge the base in before the push you
want verified.

## Game data (ARENA2)

Many tests read Daggerfall's own data files. The data is freeware but is never committed.

- `sh tools/fetch-data.sh [dest]` downloads Daggerfall Unity's `DaggerfallGameFiles.zip` (about 150 MB) and extracts
  `arena2/` to `/home/claude/dfdata` by default.
- Set `ARENA2_PATH` to that `arena2` folder before `npm test`.
- The dev server (`npm run dev`) serves the same folder at `/arena2/*` (`vite.config.js`), with
  `/home/claude/dfdata/arena2` as the default path.

Without `ARENA2_PATH`, the gated tests skip (see [writing-tests.md](writing-tests.md#arena2-gated-tests)). **CI has no
ARENA2**, so gated tests never run there. When you change a rule that a gated test checks, run the gated tests
locally with the data.

Gated tests assume the English retail data. A localised install (German, for example) has different faction records,
location names and spell indices, and many gated tests fail on it for that reason alone. Real installs also mix
file-name case (`INVE00I0.img` beside `INVE04I0.IMG`). The game's loader (`normalizeName` in
`src/scenes/dataSource.js`) and the dev
server are case-insensitive; the test harness reads the folder literally.

## Before a push

1. `npm run lint` and `npm run types`.
2. `npm run test:changed` (or the change's own files when it picks most of the suite).
3. Push and let CI run the whole gate. A pull request is not done until `check` is green on its head commit.
