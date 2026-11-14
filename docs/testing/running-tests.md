# Running the tests

This page covers how the suite runs locally and in CI: the runner, the shard split, the changed-files loop, the
recorded times and the game data that some tests need.

## The runner

The suite uses Node's built-in runner, `node:test`, with `node:assert/strict`. There is no Jest, Mocha or Vitest.
Every file named `*.test.js` or `*.test.ts` anywhere under `test/` is a test file (`testFiles` in
`tools/testShards.mjs`). Each file runs in its own process. A new test file is `<module>.test.ts`; existing files keep
their names until the rename pass (decision 116 (9), [writing-tests.md](writing-tests.md)).

Node must be `>=22.18.0` (`package.json` `engines`), the first 22 release that runs `.ts` files. CI uses Node 22.

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
| `npm run pre-push` | The checks a pull request's CI runs, on this branch's changes (`tools/pre-push.ts`, [Before a push](#before-a-push)). |
| `npm test` | The whole suite: `node tools/testShards.mjs 1/1`. |
| `npm run test:changed` | Only the test files a change can affect (`tools/testChanged.mjs`, below). |
| `node tools/testShards.mjs 3/8` | Shard 3 of 8, as CI runs it. |
| `node tools/testShards.mjs 3/8 --list` | The files in shard 3 of 8, one a line. |
| `node tools/testShards.mjs --plan 8` | File count and recorded seconds for each of 8 shards. |
| `node --import ./tools/raw-import-hooks.ts --test test/ui/chatscroll.test.js` | One file, directly. The `--import` lets Node load a shader file imported with `?raw`; without it, a test that reaches such a module fails with `ERR_UNKNOWN_FILE_EXTENSION`. The tools above add it for you. |
| `npm run lint` | ESLint over `src/`, `server/src/`, `server-account/src/`, `test/`, `tools/`, `scripts/`, `app/` and the root `*.config.js`. It keeps a content-keyed cache in `node_modules/.cache/eslint/`. |
| `npm run types` | Two passes. `tsc -p tsconfig.json`: `checkJs` is off, so only `src/` files with `// @ts-check` on their first line are reported; `test/systems/save/hard3_types.test.js` decides which files must opt in. `tsc -p tsconfig.node.json`: the `.ts` files under `tools/` and `test/`, with Node's types. The second pass needs `@types/node` in this checkout's own `node_modules`. |
| `npm run build` | `vite build` into `dist/`. |
| `npm run check` | Lint, types, the whole suite and the build, in series. Slow; use it only when CI cannot run. |

To run one area, list its files with a quoted glob: `node --test "test/net/**/*.test.js"`. Do not pass a bare
directory such as `test/ui/`: a trailing directory path breaks file discovery on Node 22. A direct `node --test` needs
the `?raw` hook, as the table shows or through `NODE_OPTIONS` ([getting-started.md](../getting-started.md#node-and-shader-files)).

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
4. The test, or a file it imports, lists a folder that a changed file lies in (`tools/lib/test-scans.ts`). This catches
   tests that find their files by listing a folder instead of importing them.

Rule 4 knows a file's folders in three ways:

- A comment line declares them: `// test:changed scans: src/ server/src/`. `.` is the whole tree. `none` says that the
  file lists nothing in the tree, for a walk of a temporary folder.
- A file with no declaration that walks folders recursively (`recursive: true`, `git ls-files`, or a function that
  lists a folder and calls itself) scans the whole tree. Every tree-wide sweep, such as
  `test/tree/typescript-no-any.test.ts`, therefore runs for every change. About 125 files are in that set.
- A file that calls a listing function and names a changed file's folder lists that folder, when the folder is at
  least two levels deep (`server-account/migrations`, which `test/accountDb.mjs` lists). A file that builds the
  folder's path from parts needs a declaration.

A change to `package.json`, `package-lock.json` or `tsconfig.json` runs the whole suite (`EVERYTHING`).

"Changed" means: the diff from the merge base with the base ref, plus staged, unstaged and untracked files. A rename
counts as its old path and its new path. The base ref is `--base <ref>`, else `$BASE_REF`, else `config.baseRef` in
`package.json` (`tools/lib/base-ref.ts`). `tools/check-changed.mjs` and `tools/comment-refs.ts` read the same base.
When git cannot diff against the base (a ref that was never fetched), the tool stops with an error. A stacked pull
request whose base is another branch passes `--base`; the default only adds the other branch's changes, so it selects
more tests, never fewer.

- `--list` prints the chosen files and runs nothing.
- `--base <ref>` compares against another ref.
- Any other argument, except the runner's own `--test-*` flags, is refused.

The chosen tests fall into two tiers (`selectTests`):

- **Near**: the test changed, imports a changed file itself, names one, or lists a changed file's folder (itself or
  through a helper outside `src/`).
- **Far**: the test reaches a changed file only through other modules. A hub module sits in most tests' imports
  (`src/systems/features.js` in about 3,400), so an edit there puts most of the suite in the far tier.

`npm run test:changed` runs both tiers. `npm run pre-push` runs the far tier only when it is small (below).

## Shards and recorded times

`shardsOf` in `tools/testShards.mjs` splits files into N shards. It sorts files longest first and puts each file on
the shard with the least time so far. A file with no recorded time weighs the median. The split is deterministic, so
every CI job computes the same shards. Every file is in exactly one shard. `test/tooling/flow1_ci.test.js` holds this.

The weights live in `tools/testTimes.json` (file path to milliseconds). Stale or missing times only make the shards
less even. They never drop a file.

- `npm run test:times` (`tools/testTimes.mjs`) re-times every file on this machine. Run it on a quiet machine;
  background load inflates the numbers.
- `node tools/testTimes.mjs --jobs 2` limits the parallel jobs.
- `node tools/testTimes.mjs --merge <dir>` merges per-shard records (`*.json`) onto `tools/testTimes.json`. A
  recorded time moves the old one a third of the way towards it (`NEW_TIME_WEIGHT`): one run's time swings with the
  files that share its runner, and the last time alone left the slowest shard about a third over the mean. A file
  with no old time takes the recorded one. A file not in the suite any more is dropped.

`node tools/testShards.mjs i/n --record <file>` sets `TEST_TIMES_RECORD`. The fail-summary reporter then adds each
file's wall time to that JSON file (`tools/fileTimes.mjs`).

## What CI runs

`.github/workflows/verify.yml` is the one gate. It runs these jobs in parallel:

| Job | Steps |
| --- | --- |
| `static` | `npm run lint` (ESLint's cache restored from the newest `eslint-*` entry), the lint ratchet, `npm run types`, the shaders |
| `times` | Finds the newest saved times in the Actions cache (`test-times-*`), lookup only. |
| `test` (matrix 1..8) | Restores those times, then `node tools/testShards.mjs <i>/8 --record ...`. Uploads each shard's record as an artifact. |
| `build` | `npm run build`, unless the caller passes `build: false`. |

Every job restores `node_modules` from a cache keyed on `package-lock.json` and runs `npm ci` only on a miss.

`check.yml` (a pull request's full run), `deploy.yml`, `relay-deploy.yml`, `account-deploy.yml` and `release-desktop.yml`
all call `verify.yml`. After a run, `test-times.yml` merges the eight shard records and saves them to the Actions
cache under `test-times-<run_id>-<attempt>`. The next run's shards split by those times. A pull request's saved times
stay with its branch; the times saved by `deploy.yml` on `main` are visible to every branch.

### Local, draft and ready

| Where | What runs |
| --- | --- |
| This machine, before a push | `npm run pre-push`: lint, types, the doc and comment checks, and the near tier of the tests (the far tier too when the selection is small). It runs on the machine's platform; `CI_NODE` picks the Node of the tests. |
| A draft pull request | The light run (`.github/workflows/verify-light.yml`): lint and types, and the near tier on CI's Linux, two runners (`tools/test-near.ts`). No far tier, no build, no game probes. The `standards` job runs too. |
| A draft with a platform path or the `full-ci` label | The full verification, as at ready, and the game probes. |
| Marked ready for review, and every push after | The full verification (`verify.yml`): every test in eight shards and the build, then the game probes. |

`check.yml`'s `plan` job chooses (`tools/ci-plan.ts`). A draft gets the full run when it changes a path where
Windows and CI's Linux can disagree, or that the light run does not build: `.github/`, a `package.json` or
`package-lock.json`, `app/`, `selfhost/`, `tools/`, `scripts/`, the shared helpers `test/*.mjs`, `vite.config.js`
and `tsconfig*.json`. For any other change with a platform risk (path or file handling, a filesystem's case rules),
add the `full-ci` label. `full-ci.yml` re-runs the pull request's last `check.yml` and `probes.yml` runs, whose
`plan` reads the labels when it runs, and every later push to the draft gets the full run while the label stays.

The pull request check job `check` runs with `if: always()` and passes only when `plan` chose the full run and
`verify` succeeded. On a light run it fails and says so, so a light run never satisfies it; read the `light` jobs
for a draft's result. A required check that is skipped would pass, so `check` is never skipped. `ready_for_review` is
one of `check.yml`'s triggers, so marking a draft ready starts the full run on its head with no new push.

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

Run `npm run pre-push` (`tools/pre-push.ts`). It runs the checks of CI's `static` job and `standards` job on this
branch, and the tests `tools/testChanged.mjs` selects:

1. The installed dependencies: every dev dependency is in this checkout's `node_modules` at the lockfile's version. A
   worktree linked to an install made for another branch stops here.
2. The Node version of the tests: a warning, not a failure, when it differs from the `node-version` in
   `.github/workflows/verify.yml`. A different V8 can change what an allocation or timing test measures
   (`test/tooling/allocchild.test.js` passes on Node 22 and fails on Node 24). To match CI on a machine with a newer
   Node, unpack CI's major from nodejs.org into a folder of its own and name its binary in `CI_NODE`:
   `CI_NODE=<folder>/node.exe npm run pre-push`. Only the tests run on it; the other steps use the Node that started
   the command. The step fails when the `CI_NODE` binary does not run.
3. `npm run lint`, then `node tools/lintRatchet.mjs --strict`.
4. `npm run types`, both passes.
5. The formatting of added files, markdown, spelling and the references in added comments (`tools/check-changed.mjs`,
   `tools/comment-refs.ts`).
6. The shaders (`tools/glsl-check.ts`), when a shader file changed. Without `glslangValidator` installed, the step is
   skipped and says so.
7. The tests. The near tier always runs. The far tier runs too when the whole selection is at most a quarter of the
   suite (`FAR_TIER_SHARE`); a larger far tier is left to CI, and the summary says how many files. `--full` runs it
   here. The near tier has no cap: a change to a helper that many tests import directly can put a third of the suite
   in it.

Every step runs, and the summary lists each one's result and time. The exit status is 1 when a step failed. The
command does not build; CI builds every pull request.

Push and let CI run. On a draft, CI runs the light run; the full gate runs when the pull request is marked ready
(above, "Local, draft and ready"). A pull request is not done until `check` is green on its head commit. CI tests the
merge of the branch into its base, so merge the base in when it has moved.
