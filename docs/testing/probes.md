# Probes

A probe is a script in `tools/` that checks what `node --test` cannot: layout and pixels in a real browser, a Worker
running in real workerd, or the Electron shell. Probes are not part of `npm test` or CI. Run the probes that cover a
change by hand, and before a visible change ships.

## Browser probes (`tools/*Probe.mjs`)

There are a few hundred, one or more for each feature that draws something. Find the ones for your change by name
(`ls tools/*Chat*Probe.mjs`) or by searching for the module you changed. The header comment of each probe says what
it checks, how to run it and what it needs.

### The common shape

Most browser probes follow one pattern:

1. Start Vite in-process on a fixed port: `createServer({ server: { port, strictPort: true } })` from `vite`. A few
   older probes expect a dev server that is already running at `PROBE_BASE` (default `http://127.0.0.1:5199`); their
   header says so (`npx vite --port 5199`).
2. Launch Chromium through Playwright (`chromium.launch`), headless.
3. Load a page. Probes of a whole scene load `/play/?...` with boot parameters. Probes of one panel mount the real
   panel module over the real stylesheet in an empty page.
4. Measure through the DOM or read pixels back, and print one line per check: `ok  <name>` or `FAIL <name> - detail`.
5. Save screenshots, then exit with status 1 when any check failed, else 0.

The `?shot` boot parameter installs the probe hooks (`window.__X` seams) that scene probes read. Without it most hooks
do not exist; the few that are always on are listed, with a reason, in `test/tree/probegate.test.js`, which enforces
the rule. Other boot parameters are read through
`src/systems/pageQuery.js` and the scene hosts in `src/scenes/`.

### Running one

```sh
node tools/chatScrollProbe.mjs
```

Some have an npm script (`npm run blood`, `npm run firsthour`, `npm run perf`; see `package.json`).

Probes that draw the 3D world need WebGL. On a machine without a GPU they launch Chromium with SwiftShader:
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` (`SWIFTSHADER_ARGS` in `tools/frameProbe.mjs`).
Expect SwiftShader to be slow; timing numbers from it are not real-GPU numbers.

Scene probes that enter the game world need `ARENA2_PATH` (see
[running-tests.md](running-tests.md#game-data-arena2)). Probes that mount one panel usually do not.

### Environment variables

| Variable | Meaning |
| --- | --- |
| `PLAYWRIGHT_BROWSERS_PATH` | Where Playwright's browsers are. Many probes default it to `/opt/pw-browsers`; set it on any other machine, or run `npx playwright install chromium`. |
| `CHROMIUM` | Path to a Chromium-family executable, passed as `executablePath`. On Windows, point it at Microsoft Edge (`msedge.exe`) to avoid a separate download. |
| `PW_CHANNEL` | A Playwright channel name (`msedge`), read by a few probes. |
| `PROBE_PORT`, `PORT` | Override the probe's fixed Vite port when it is taken. |
| `PROBE_BASE` | The dev server URL for probes that do not start their own. |
| `SHOT_DIR`, `SHOTS`, `PROBE_SHOTS`, `OUT` | Where screenshots go. Each probe reads one of these; its header says which and gives the default. |
| `W`, `H` | Viewport size, for probes that take one. |
| `NOFONTS=1` | Use the fallback fonts instead of the web fonts. |

Not every probe reads every variable. Read the probe's header.

Screenshot folders (`tools/shots/`, `firsthour-shots/`, `scratch/` and others) are in `.gitignore`. Never commit a
screenshot.

### Writing a probe

- Mount the real module through the same function the scene hosts call. A probe that writes its own markup measures
  itself, not the game.
- If the host drives a panel every frame, drive it every frame in the probe too (`requestAnimationFrame`). Some panels
  hide themselves when nobody draws them.
- Measure what the eye sees: a label's own box inside its button, not `scrollWidth`.
- Cover the sizes the change reaches: a desktop window, a narrow window and a phone (390 x 844 portrait and
  844 x 390 landscape, with `hasTouch` and `isMobile` for the touch skin).
- Fail with status 1. A probe that only prints is easy to misread.
- Close the browser and the Vite server in every exit path. A leaked browser holds its port for the next run.

## Account service probe

`npm run account` (`tools/accountProbe.mjs`) starts `server-account/` in a real workerd through `wrangler dev
--local`. It applies the real migrations through wrangler's own ledger (`wrangler d1 migrations apply --local`) and
drives the account lifecycle and a cloud-save round trip against workerd's local R2.

It catches what the suite cannot:

- a Worker entry that workerd refuses to start (a module Worker treats every named export of its entry as a handler,
  so an exported constant breaks the boot);
- a binding renamed in `wrangler.toml` (the suite hands the Worker its own `env` and never reads that file);
- a migration that does not apply through wrangler;
- the cost of the password hash inside a Worker's CPU budget, and Ed25519 support in that runtime.

Each run uses a fresh `--persist-to` directory, so runs do not share state. Set `ACCOUNT_PROBE_PORT` when the default
port (8811) is taken. `--local` has no network, no D1 limits and no cold start, so it is not Cloudflare.

`tools/lib/wranglerLaunch.mjs` starts and stops wrangler on Linux, macOS and Windows. On Windows it runs npm's
`npx-cli.js` under the current Node and stops the process tree with `taskkill /T /F`.

## Load harness

`npm run load` (`tools/loadHarness.mjs`) runs a fleet of bots against the real relay and the real account service,
both in local workerd. A bot is the client's own modules: it registers a guest, makes a realm character, opens the
same rooms the world host opens as `OnlineSession`s, sends poses and chat, and makes the client's account calls on
the client's own timers.

```sh
node tools/loadHarness.mjs --bots 200 --minutes 5
node tools/loadHarness.mjs --help      # every option and its default
```

It reports the relay's and the service's work per bot. Local numbers are relative: they compare two builds on one
machine. They are not production capacity.

## Desktop shell probe

`tools/appShellProbe.mjs` launches the real Electron shell (`app/main.cjs`) and checks that the `dagger://` protocol
serves the built game, that the preload bridge (`window.daggerShell.storage`) works, and that a save written from the
page lands on disk in Daggerfall Unity's layout (`Saves/SAVE<n>/SaveData.txt`, `SaveInfo.txt`, `Screenshot.jpg`) and
reads back byte-identical. It needs no ARENA2.

```sh
npm run build
(cd app && npm install)
xvfb-run -a node tools/appShellProbe.mjs     # a display is needed; xvfb on a headless Linux box
```

`DAGGER_SHELL_EXE` points it at a packaged binary (for example `app/release/linux-unpacked/...`) to check an
installer's payload. See [../operations/desktop-release.md](../operations/desktop-release.md).

## Other checks outside the suite

- `tools/verify-deploy.mjs [url]`: after `npm run build`, polls the live site until it serves your build, by
  content. HTTP 200 alone proves nothing, because a failed deploy leaves the previous build up.
- Intro probes (`tools/introProbe.mjs`, `tools/introCapture.mjs`, `tools/introAudioCheck.mjs`): run by
  `intro-quality.yml`.
