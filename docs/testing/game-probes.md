# Game probes

`npm run probes` boots the running game in a browser and drives it end to end. The suite (`npm test`) tests modules;
these probes catch what breaks in the wiring when a host file (`src/scenes/world.js`, `worldModes.js`, the relay's
`Room`) changes. Each probe reads game state through the `?shot` hooks, not pixels, and fails on any console error that
`tools/probes/lib/allowedErrors.mjs` does not name.

| Probe | What it drives |
| --- | --- |
| `boot` | The front door and the main menu draw with no errors. |
| `dungeon` | The real chargen wizard to a character, the starting dungeon, a move, a kill, the loot, the way out. |
| `town` | A town exterior; a shop (buy, then sell back: gold and inventory change); a tavern room. |
| `travel` | Fast travel through the travel map (the journey ends at the place asked for, the clock runs); a rest in a rented room heals and advances the clock. |
| `save` | Save, load in the page, then reload the page and load again: position, gold, inventory and level match. |
| `pause` | Every tab and side row of the pause menu opens and draws. |
| `online` | The real relay and account service in local workerd; two clients join one room (the starting dungeon, which software GL can boot), each sees the other move, one chat line arrives. |

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
downloaded once and cached.
