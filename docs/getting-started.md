# Getting started

This page covers what you need to build, run and test DFO Online on your own machine, and where things live in the
repository. Read it first; then read [architecture/](architecture/README.md).

DFO Online is a browser RPG based on The Elder Scrolls II: Daggerfall. It reads the player's own copy of
Daggerfall's data (ARENA2) at runtime and draws it with a hand-written WebGL2 renderer. Daggerfall Unity (MIT,
Interkarma and contributors) is the baseline for the data formats and the game logic. The game departs from it only for
online play or for a written design that is better for play ([README.md](README.md#scope)).

## Prerequisites

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | `>=22.18.0` (`package.json` `engines`) | Vite, the test runner, every tool |
| npm | the one that ships with Node | installs |
| Git Bash, or any POSIX shell | - | `tools/fetch-data.sh` and the examples below |
| `curl` and `unzip` | - | fetching ARENA2 |
| A browser with WebGL2 | Chrome, Edge, Firefox or Safari 15+ | running the game |
| Playwright's browser (optional) | from `playwright` in devDependencies | the probe tools under `tools/` |

The relay (`server/`) and the account service (`server-account/`) are Cloudflare Workers and need `wrangler`. The
desktop shell (`app/`) needs Electron. You need neither to run the game locally against your own data.

## Install

```sh
npm ci
```

`npm ci` installs the root devDependencies only: Vite, ESLint, TypeScript, Playwright, esbuild, Rollup, acorn and
pngjs. The client has no runtime npm dependencies. `server/` and `app/` each have their own `package.json`; run
`npm ci` inside them only when you work on them.

## Fetch the game data (ARENA2)

Daggerfall's data is freeware but not redistributable. It never enters the repository or the build. Fetch it once:

```sh
sh tools/fetch-data.sh                  # extracts to /home/claude/dfdata/arena2
sh tools/fetch-data.sh "$HOME/dfdata"   # or to a folder you choose (the argument is the parent of arena2/)
export ARENA2_PATH="$HOME/dfdata/arena2"
```

The script downloads `DaggerfallGameFiles.zip` (about 150 MB, the archive the Daggerfall Unity install guide links to)
and extracts only `arena2/`. It does nothing if `arena2/` already exists.

`ARENA2_PATH` is read in two places:

- **The dev server.** `vite.config.js` (`arena2DevServer`) serves the folder at `/arena2/*` and `/play/arena2/*`. It
  matches names case-insensitively, because real installs mix upper- and lowercase file names, and it falls back to
  `BOOKS/` for `BOK*.TXT`. The default is `/home/claude/dfdata/arena2`, so set the variable on any other machine.
- **The tests.** Tests that read real data skip with a message such as "ARENA2_PATH not set or missing" when the
  variable is unset or the folder does not exist. A skipped test is a check that did not run, not a pass.

In the browser, `src/scenes/dataSource.js` loads data in this order: memory cache, IndexedDB, then the network
(`./arena2/*`). On the deployed site the network path returns 404, so `ensureArena2()` shows a folder picker. The
player picks their ARENA2 folder once and the files are kept in IndexedDB (database `project-dagger`).

The Elder Scrolls: Arena data is optional. The player attaches their own ARENA folder in the game; tests read it from
`ARENA_PATH`.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload. The landing page is `/`, the game is `/play/`. |
| `npm run build` | Production build into `dist/`. `prebuild` writes the commit into `src/buildTag.js`; `postbuild` restores the file. |
| `npm run preview` | Serves `dist/` for a check of the built site. |
| `npm test` | Runs every `test/**/*.test.js` with `node --test`, in one shard (`tools/testShards.mjs 1/1`). |
| `npm run test:changed` | Runs only the tests a change can affect (`tools/testChanged.mjs`). See below. |
| `npm run lint` | ESLint over `src/`, `server/src/`, `server-account/src/`, `test/`, `tools/`, `scripts/`, `app/` and the configs. |
| `npm run types` | `tsc -p tsconfig.json`: type-checks the files marked `// @ts-check` and the JSDoc types. No output is emitted. |
| `npm run check` | `lint`, `types`, `test` and `build` in series. Slow; CI runs the same steps in parallel. |
| `npm run perf` | `tools/perfProbe.mjs`: boots the real game in Playwright and logs FPS, frame time and draw counts. Needs ARENA2. |
| `npm run shot` | `tools/screenshot.mjs`: boots a scene with `?shot` and saves a screenshot. |

Most other scripts in `package.json` run one probe from `tools/` (a Playwright script that boots a page and checks one
feature).

### How the tests choose what to run

- `tools/testChanged.mjs` selects a test file when the file changed, when a file it imports changed (followed through
  every relative `import`, `export ... from` and `import()`), or when its own text names a changed file. "Changed"
  means against the merge base with `origin/main`, plus staged, unstaged and untracked files. A change to
  `package.json`, `package-lock.json` or `tsconfig.json` runs everything. `--list` prints the selection.
- `tools/testShards.mjs N/M` splits the suite into M shards balanced by recorded times (`tools/testTimes.json`) and
  runs shard N, longest files first, on every core.
- CI (`.github/workflows/verify.yml`) runs lint, types, the whole suite in eight shards, and the build on every pull
  request and before every deploy. A pull request that conflicts with its base runs no workflow, so merge the base in
  first.

Before a push, run `npm run lint`, `npm run types` and `npm run test:changed`. When `test:changed` selects most of the
suite (a change to a module everything imports, such as `src/scenes/worldModes.js`), run the change's own test files
and let CI run the rest.

## Running the game locally

```sh
export ARENA2_PATH="$HOME/dfdata/arena2"
npm run dev
# open http://localhost:5173/play/
```

`src/main.js` routes on the query string. With no parameters you get the intro and the main menu. Useful entries:

| URL | Opens |
| --- | --- |
| `/play/` | intro, then the main menu |
| `/play/?nointro` | the main menu without the intro video |
| `/play/?world` | the streaming world directly |
| `/play/?exterior&region=<name>&loc=<name>` | one location, standalone |
| `/play/?dungeon=<name>` | one dungeon, standalone |
| `/play/?interior=<block>:<record>` | one building interior, standalone |
| `/play/?shot` | a fixed dungeon vantage for screenshot tools |
| `/play/?fps` | the FPS counter, over any of the above |

The Test Room (main menu) boots the streaming world with a prebuilt character (`src/systems/testRoom.js`). More
parameters are listed in [architecture/source-layout.md](architecture/source-layout.md#debug-hooks-and-url-parameters).

## HTML entry points

Every entry is registered in `vite.config.js` under `build.rollupOptions.input`.

| File | Purpose |
| --- | --- |
| `index.html` | The landing page (`/`). Mounts no game code; `scripts/landingHtml.mjs` injects its palette, fonts and sky at build. |
| `play/index.html` | The game (`/play/`). A canvas `#c` and `src/main.js`. |
| `terms/index.html`, `privacy/index.html` | Legal pages. |
| `sky.html`, `water.html` | Labs for the enhanced sky and the water surface (`src/tools/skyLab.js`, `src/tools/waterLab.js`). |
| `viewer.html`, `mw-viewer.html`, `mw-inspect.html` | Paperdoll viewer, Morrowind mesh viewer and data inspector. |
| `studio.html` | Art studio listing (`src/tools/studioLab.js`; its index is built by `scripts/studioArtIndex.mjs`). |
| `menu.html`, `chargen.html`, `enhanced.html`, `levelup.html`, `growth.html`, `firmament.html` | UI labs for the Enhanced menu, character creation, level-up and the passive tree. |
| `abyss.html` | A lab for scenes drawn by the game's renderer (`src/tools/abyssLab.js`). |

The labs are development aids. The player reaches only `index.html`, `play/index.html` and the legal pages.

## Repository layout

| Folder | Holds |
| --- | --- |
| `src/` | The browser client: entry `src/main.js`, scenes, systems, UI, renderer, format readers. See [architecture/source-layout.md](architecture/source-layout.md). |
| `server/` | The multiplayer relay: a Cloudflare Worker with one Durable Object `Room` per room (`server/src/index.js`). |
| `server-account/` | The account service: a Cloudflare Worker with a D1 database (`migrations/`) and the Discord bot. |
| `app/` | The Electron desktop shell (`app/main.cjs`, preloads, launcher). Builds with `electron-builder`. |
| `play/` | The game's HTML entry. |
| `public/` | Static files copied to the build as they are: icons, fonts, sound effects, skins and approved art packs. |
| `vendor/` | Third-party Daggerfall Unity mods and assets, one folder each, that the code loads or translates: shaders, art, data tables, fonts. |
| `locales/` | Translations, one folder per language. |
| `test/` | `node --test` suites, one folder per `src/` layer, plus `server/`, `tooling/` and shared helpers (`test/*.mjs`). |
| `tools/` | Development scripts: test runners, Playwright probes, asset extractors, `fetch-data.sh`. |
| `scripts/` | Build-time scripts called by Vite and the release workflows. |
| `.github/workflows/` | CI (`verify.yml`), the site deploy (`deploy.yml`), relay and account deploys, desktop releases. |
| `terms/`, `privacy/` | Legal pages. |
| `docs/` | This documentation. |

## Rules that hold everywhere

- **No game data in the repository.** No ARENA2 file, and no screenshot or derived picture of it, is committed or
  shipped. The only exceptions are art packs that their authors gave permission for, each in its own named directory
  (for example `public/art/vanilla-enhanced/`). `test/tooling/doctrine.test.js` checks this.
- **Daggerfall Unity is the reference.** Before you build something Daggerfall Unity has, read its version. Format
  readers read ARENA2 exactly as Daggerfall Unity does. When behaviour departs from it on purpose, say so in a comment
  that names the Daggerfall Unity member.
- **New behaviour goes into its own module.** The scene hosts do not grow. See
  [architecture/hosts-and-modules.md](architecture/hosts-and-modules.md).
