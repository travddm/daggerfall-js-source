# Writing tests

This page covers where a test goes, the shared helpers and fakes, the tests that need game data or a Daggerfall Unity
checkout, and what a good test looks like in this repository.

## Where a test goes

`test/` mirrors `src/` by area. Put a test in the folder of the code it covers, in a sub-folder for the feature when
one exists.

| Folder | Covers |
| --- | --- |
| `test/ai/` | `src/ai/` (enemy navigation, tactics) |
| `test/characters/` | `src/characters/` (enemies, paperdoll, items, classes) |
| `test/combat/` | `src/combat/` |
| `test/formats/` | `src/formats/` (BSA, IMG, CFG and other file readers) |
| `test/net/` | `src/net/` (the wire, online session, shared laws of relay and account service) |
| `test/player/` | `src/player/` (motor, climbing, ground rays) |
| `test/render/` | `src/render/` |
| `test/scenes/` | `src/scenes/` (the scene hosts and the modules they wire) |
| `test/server/` | `server/src/` (relay) and `server-account/src/` (account service) |
| `test/systems/` | `src/systems/` (the largest area) |
| `test/ui/` | `src/ui/` |
| `test/world/` | `src/world/` |
| `test/tooling/` | `tools/`, `scripts/`, `app/` and the workflows |
| `test/tree/` | Rules over the whole source tree (see below) |
| `test/fixtures/` | Data files that tests load. It holds no tests. |

Some test files sit at the top of `test/`. New tests go in an area folder.

Name a new test file `<module>.test.ts`, after the module it covers, in kebab-case like every new file (decision 116
(9)). A test for a camelCase module is named in kebab-case now (`heroThreat.js` gets `hero-threat.test.ts`), and the
module follows in the rename pass (decision 122). Existing files keep their names until the rename pass (decision 101
Q1). Many of them are named for a ticket or an audit (`audit*`, `fb*`, `rel4_`, `tesa*`); do not copy those names.
Say what the file covers in a header comment and in each `test()` title. Shared code that is not a test goes in a
`.mjs` file at the top of `test/`, never in a test file.

A minimal test:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shardsOf } from '../../tools/testShards.mjs';

test('a file with no recorded time weighs the median', () => {
  const shards = shardsOf(['a', 'b', 'c'], 2, { a: 10, b: 30 });
  assert.equal(shards.flatMap((s) => s.files).length, 3);
});
```

## What makes a good test

- **Import the module and run it.** Assert on what it returns, what it writes and what it sends. A behavioural test
  survives a refactor that keeps the behaviour, and it fails when the behaviour breaks.
- **Never read source text to check a module.** A test that greps a file for a line passes on a comment that quotes
  the line and fails when correct code moves. Several hundred older test files do this (about 440 use
  `test/hostText.mjs` alone; `test/codeOnly.mjs` is the other helper). Do not copy that style, and rewrite such a test
  as a behavioural one when you touch it. When the split plan ends, one tree test fails any test that reads source
  text, except a listed set of tree-wide sweeps (decision 101 Q3).
- **A source sweep is correct only to enforce a rule across many files.** Examples in `test/tree/`:
  - `probegate.test.js`: every `window.__X =` (also `globalThis.` and `self.`) in `src/` must sit behind the
    screenshot gate (`shotMode`, `params.has('shot')`, `pageHas('shot')`) or be listed as always on, with a reason.
    Probe hooks must not reach a normal player's page.
  - `tdz.test.js`, `tdz_selfreference.test.js`: no read of a `const` before its declaration (a temporal dead zone),
    which lint and the build cannot see.
  - `moduleload_smoke.test.js`: every module under `src/` imports under Node without throwing, except an exact list
    of browser-only modules.
  - `csstarget.test.js`: the CSS minifier target in `vite.config.js` stays below the browsers the game supports.
- **A test that lists a folder tells the selector which one.** `npm run test:changed` finds a recursive walk by
  itself and runs it for every change. A sweep of one area may declare it, `// test:changed scans: src/`, so it runs
  only for changes there. A helper that builds a listed folder's path from parts must declare the folder, or a new
  file there selects nothing ([running-tests.md](running-tests.md#the-changed-files-loop)).
- **Use the real code under a fake boundary, not a fake of the code.** Fake the network, the Durable Object state, the
  database or the DOM. Do not fake the module under test.
- **Use one shared fake.** If a fake exists in `test/*.mjs`, import it. Two copies of a fake drift apart, and a fake
  that differs from production lets a test pass that production would fail.
- **Pick a fixed seed and a fixed clock** for anything random or timed. Most game code takes a random source or a
  time as an argument for this reason.

## Shared helpers and fakes

All live at the top of `test/`. Read the header comment of each before use.

| Helper | What it gives you |
| --- | --- |
| `modsOff.js` | Import for its side effect. It turns every vendored mod off and switches the survival preference off, so a test checks Daggerfall Unity's own numbers. Import it first in any test that compares with DFU formulas. |
| `fakeRoom.mjs` | `fakeRoom()` builds a real relay `Room` (`server/src/index.js`) over a fake Durable Object state: sockets, storage (`get`, `put`, batched `put`, `delete`, `deleteAll`, `list`, alarms) and the runtime's 2 KiB socket attachment limit. `wake()` simulates hibernation: a fresh `Room` over the same state. |
| `fakeSocket.mjs` | A fake `WebSocket` for `OnlineSession`. `sent` holds the raw strings written; `open()` and `receive()` drive it. |
| `accountDb.mjs` | The account service over `node:sqlite` with every migration in `server-account/migrations/` applied. It mimics D1's surface (`prepare`, `bind`, `first`, `all`, `run`, `batch` as one transaction) and gives a helper that registers an account. |
| `laggyD1.mjs` | A D1 binding with one read replica that lags the primary, for tests of D1's Sessions API use. |
| `memoryIdb.mjs` | An in-memory IndexedDB. |
| `chargenDom.mjs`, `hudPage.mjs`, `introDom.mjs`, `launcherDom.mjs`, `lockDom.mjs`, `decorFakes.mjs`, `virtFakes.mjs` | Minimal DOMs for specific UI surfaces. |
| `windowContract.mjs` | The host-to-window contract, derived, for the overlay and window tests. |
| `glsl.mjs` | A GLSL ES 3.00 evaluator. It runs a shader's own functions in JavaScript, so a test checks the code the GPU runs. |
| `retroGl.mjs` | A stateful fake WebGL2 context that enforces WebGL2's draw-time rules. |
| `importGraph.mjs` | The import graph of a Worker entry, as wrangler bundles it. Used for the relay version hash and the account deploy's path filter. |
| `relayVersion.mjs` | Reads `RELAY_VERSION` so tests do not hard-code it. |
| `unityFixture.mjs` | Builds a small UnityFS bundle in memory for the asset-bundle reader tests. |
| `dfuRoot.mjs` | Finds a Daggerfall Unity checkout (below). |

Other `.mjs` files at the top of `test/` are harnesses for one feature (towns, roads, ships, arena data). Search for
their importers before you change one.

## ARENA2-gated tests

A test that needs Daggerfall's data reads `ARENA2_PATH` and skips without it. The common shape:

```js
const ARENA2 = process.env.ARENA2_PATH;
const skipReal = !ARENA2 || !existsSync(ARENA2)
  ? 'ARENA2_PATH not set or missing - real-data validation skipped' : false;

test('reads the real BLOCKS.BSA', { skip: skipReal }, () => { /* ... */ });
```

Some files check for one archive instead (`join(ARENA2, 'BLOCKS.BSA')`). Shared loaders such as `test/arena1Data.mjs`
and `test/fb1004dArena.mjs` read `ARENA2_PATH` once for a group of files.

Rules:

- Give the skip a reason string, so the skip shows in the report.
- Keep every test that can run without data out of the gated block. CI never has the data.
- When you change a rule, search the gated files for it too, and run them with data (`tools/fetch-data.sh`, see
  [running-tests.md](running-tests.md#game-data-arena2)).

## Daggerfall Unity parity tests

Some tests regenerate a table from Daggerfall Unity's C# source and compare it cell for cell with the port (enemy
stats, loot matrices, item groups). They find the checkout through `test/dfuRoot.mjs`, which reads `DFU_PATH`, and
they skip without it:

```sh
DFU_PATH=/path/to/daggerfall-unity npm test
```

`tools/parity/prepare.sh` reads the same variable. A skipped parity test reads like a passing one at a glance. Check
the skip count when you change code that mirrors a DFU table.

## Tests of the services

- **Relay** (`server/src/`): build a `Room` with `fakeRoom()` and drive it with messages. The wire's shared
  rules live in `src/net/wire.js`; test them there.
- **Account service** (`server-account/src/`): use `accountDb.mjs` and call the Worker's `fetch` with a `Request`.
  Such tests prove the code agrees with itself. They cannot prove the Worker starts in workerd or that a binding in
  `wrangler.toml` exists. `tools/accountProbe.mjs` checks that (see [probes.md](probes.md#account-service-probe)).
- **Workflows and release scripts**: test the pure functions that `scripts/` and `tools/` export (`test/tooling/`).
  A workflow test may read the YAML when it enforces a rule, for example `test/server/accountdeploy.test.js`, which
  holds the account deploy's path filter to the Worker's real import graph.
