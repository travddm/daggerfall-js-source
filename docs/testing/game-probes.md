# Game probes

`npm run probes` boots the running game in a browser and drives it end to end. The suite (`npm test`) tests modules;
these probes catch what breaks in the wiring when a host file (`src/scenes/world.js`, `worldModes.js`, the relay's
`Room`) changes. Each probe reads game state through the `?shot` hooks, not pixels, and fails on any console error that
`tools/probes/lib/allowedErrors.mjs` does not name.

| Probe     | What it drives                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boot`    | The front door and the main menu draw with no errors.                                                                                                                               |
| `dungeon` | The real chargen wizard to a character, the starting dungeon, a move, a kill, the loot, the way out.                                                                                |
| `town`    | A town exterior; a shop (buy, then sell back: gold and inventory change); a tavern room.                                                                                            |
| `travel`  | Fast travel through the travel map (the journey ends at the place asked for, the clock runs); a rest in a rented room heals and advances the clock.                                 |
| `save`    | Save, load in the page, then reload the page and load again: position, gold, inventory and level match.                                                                             |
| `pause`   | Every tab and side row of the pause menu opens and draws.                                                                                                                           |
| `online`  | The real relay and account service in local workerd; two clients join one room (the starting dungeon, which software GL can boot), each sees the other move, one chat line arrives. |

## Running

```sh
sh tools/fetch-data.sh           # once: freeware ARENA2, ~150 MB, never in the repository
export ARENA2_PATH=/home/claude/dfdata/arena2
npm run probes                   # every probe, in order
npm run probes -- save pause     # the named probes
```

- `PW_CHANNEL=msedge` drives the installed Edge on the GPU (the way to run locally on Windows). Without it
  Playwright's Chromium runs on SwiftShader, which is what CI uses and is several times slower.
- `PROBE_SOFTGL=1` with `PW_CHANNEL` renders on SwiftShader through the installed browser: it reproduces CI's speed.
  The window is 640x400 (`PROBE_W`, `PROBE_H`): software GL costs by the pixel.
- `PROBE_DIST=<folder>` serves a built game (`vite preview`) instead of a dev server. Build it once with
  `node tools/probes/build.mjs [outDir]` (default `scratch/probe-dist`; run `sh tools/fetch-vendor.sh` first). A dev
  server transforms every module on its first request, in every run; a built game is a few chunks. `online` needs a
  build made with its source edits: `node tools/probes/build.mjs <outDir> --online`.
- `PROBE_LIGHT=1` sets two stored settings before the game loads: the streamed grid
  (`Experimental/TerrainDistance`) to 1 and the enhanced skin's `landViewDistance` to 1. On software GL the world is
  ready in 22 s instead of 86 s. CI sets it; it is off by default and changes nothing in the game.
- `PROBE_NODRAW=1` stubs the WebGL draw calls (`drawArrays`, `drawElements` and their instanced forms, `clear`) for a probe
  that opened its `Game` with `drawless: true`: `dungeon`, `travel`, `rest`, `save`, `pause` and `online`. They read state
  through the hooks and the DOM, never pixels; the simulation, loading, input and UI run, and software GL draws nothing.
  `boot` and `town` keep drawing. A probe that reads the canvas must not set `drawless`; its screenshots (taken on
  a failure) come out black in this mode.
- `online` needs the relay's tools: `npm ci --prefix server`. It uses ports 8872 and 8873 (`PROBE_SVC_PORT`).
- `PROBE_PORT` moves the first Vite port (default 5260). `SHOT_DIR` sets where screenshots go (default
  `scratch/probe-shots/`, ignored by git).
- A probe prints `ok` or `FAIL` for each check, and the run ends with one `PASS`/`FAIL` line for each probe. The exit
  status is 1 when any probe failed.
- The old `npm run probes` (the enhanced menu and the feature rail) is now `npm run probes:ui`.

Probes drive a headless browser with the pointer lock answered inside the page (`lib/fakePointerLock.mjs`), so a run
never takes the real mouse. Requests to hosts other than `localhost` and `127.0.0.1` are blocked: a probe never reaches
the live services.

## Reading a failure

- Read the first `FAIL` of a probe: later checks often depend on it.
- `scratch/probe-shots/<probe>-*.png` holds the screenshots a probe took at the points that were unclear to it.
- Hooks that a probe reads (`__mode`, `__travelProbe`, `__shopOverlay`, ...) are installed by `?shot`; a refactor that
  moves a hook breaks every probe that reads it. Move the hook with the code.

## The error allow list

`tools/probes/lib/allowedErrors.mjs` starts empty of anything the game does by design. An entry needs a reason that
names the cause. Today it holds two open findings: the 404s for the 184 `BOK*.TXT` books that the freeware ARENA2 does
not have, and the 403s that a guest account gets from the account service when the online client asks for professions,
market, homes and hunt state. Remove an entry when its cause is fixed.

## Probe-only edits

The `online` probe serves the source through three in-memory edits (`ONLINE_PROBE_EDITS` in
`tools/onlineFrameProbe.mjs`, plus a peer reader): the account base may be the local service, `?shot` survives an online
boot, and two read hooks. The repository is not changed. Every other probe runs the unedited source.

## CI

`.github/workflows/probes.yml` runs on pull requests that touch `src/`, `server/`, `server-account/` or the probes, one
runner per probe, so the slowest probe (`online`) sets the wall time. It is not part of the `check` job. ARENA2 is
downloaded once and cached. A `build` job builds the game once (and once more with the online probe's edits) and the
probes download it (`PROBE_DIST`). Playwright's Chromium is cached by its version. The set does not run for a
change that touches only documents (`*.md`, `docs/`); it also runs every night and on demand.

To tell a flaky probe from a real fault, run one probe many times on CI (each run is its own runner):

```bash
gh workflow run probes --ref <branch> -f probe=save -f repeat=10
```

A failed check prints the page's trace (console lines, failed requests) and, for `save`, the pack item by item.
