# Desktop app release

This page covers the Electron desktop app: how it is built and run locally, how every merge to `main` becomes a
GitHub Release, how the app updates itself, and where the patch notes come from.

## What the app is

`app/` is an Electron shell around the same `dist/` the website serves. It adds two things a browser cannot:

- saves as real files, in Daggerfall Unity's layout (`app/lib/fileStorage.cjs`):
  `<userData>/Saves/SAVE<n>/SaveData.txt`, `SaveInfo.txt`, `Screenshot.jpg`, and `<userData>/Prefs/<key>`;
- ARENA2 read straight from the player's own folder (`app/lib/arena2Detect.cjs`, `app/lib/arena2Probe.cjs`).

Installers carry no game data. The player points the app at an ARENA2 folder, or the game's in-page picker takes
over.

| File | Role |
| --- | --- |
| `app/main.cjs` | Main process: the `dagger://` protocol that serves the game, the window fence (only `dagger://` loads inside; `http(s)` opens in the system browser), menus, updates. |
| `app/preload.cjs` | Exposes `window.daggerShell` (platform, versions, saves path, synchronous `storage`). |
| `src/systems/appStorage.js` | The game-side seam: uses `daggerShell.storage` when present, else `localStorage`. |
| `app/launcher/`, `app/launcherPreload.cjs` | The launcher window shown before the game. Its news panel shows the release notes. |
| `app/lib/*.cjs` | Pure logic, tested by `node --test` in `test/tooling/` and `test/systems/save/filestorage.test.js`. |
| `app/afterPack.cjs` | electron-builder hook. |

## Running and packaging locally

```sh
npm run build              # at the repository root; the shell loads dist/
cd app && npm install
npm start                  # run the app
npm run dist               # installers into app/release/ (runs the root build first)
```

| Variable | Effect |
| --- | --- |
| `DAGGER_DEV_URL=http://localhost:5173/play/` | Loads the game from a running Vite dev server. File saves still work; ARENA2 comes from the dev server. |
| `DAGGER_USER_DATA=<dir>` | Moves saves and config elsewhere (tests, portable use). |
| `DAGGER_SHELL_EXE=<path>` | Points `tools/appShellProbe.mjs` at a packaged binary. |
| `DAGGER_NO_UPDATE_CHECK=1` | Turns off the update check (probes). |
| `DAGGER_SKIP_ARENA2_PROMPT=1` | Uses the game's in-page ARENA2 picker instead of the launcher asking for a folder. |

See [../testing/probes.md](../testing/probes.md#desktop-shell-probe) for the shell probe.

## Two version numbers

Do not confuse them.

| Number | Form | Source | Used for |
| --- | --- | --- | --- |
| Installer version | `app-v0.1.<N>` | `MAJOR.MINOR` from `app/package.json` `version`; `N` = `git rev-list --count HEAD` on `main` (full history) | The release tag, the version electron-builder stamps, electron-updater's comparisons. Never lower it: the updater does not take a lower version. |
| Update number | `<UPDATE_LINE>.<N>` | `scripts/updateNumber.mjs`: `UPDATE_LINE` (`MAJOR.MINOR`) in `scripts/updateLine.mjs`, set by hand; `N` = count of first-parent commits on `main` since the commit that last changed that line | Shown to players in the game and launcher; stamped into `src/buildTag.js` by `scripts/buildTag.mjs`. |

A shallow clone cannot compute either. The workflow checks out with `fetch-depth: 0`, computes both once, and passes
them to the build legs (`DFO_UPDATE`).

## The release workflow (`release-desktop.yml`)

Triggers: every push to `main`; a pushed tag `app-v*`; a manual run with `release_tag` (empty = build artifacts
only, no release). Pushes to `main` share one concurrency group and never cancel a running release. Of several
queued merges, the newest is released next and carries the others' commits. A tag or manual run has its own group.
A published release is never cut again in place; a hotfix uses a new tag.

Jobs:

1. **`version`**: resolves the tag, the installer version, the update number and the shell id
   (`scripts/desktopRelease.mjs shell`, a hash of every file the shell is built from).
2. **`gate`**: `verify.yml` on the same commit. A red gate stops the release.
3. **`build`** (Ubuntu, Windows, macOS): `npm ci`, `npm run build`, `npm ci` in `app/`, `npm version` with the
   installer version, index the bundled game (`desktopRelease.mjs seed dist app/game-seed.json`),
   `npx electron-builder --publish never`. When a release is being cut, the Ubuntu leg also packs the game
   (`desktopRelease.mjs pack`). Each leg uploads
   its files as an artifact. Builds are unsigned: no signing identity exists.
4. **`publish`** (only when every leg passed):
   - `alias`: copies the four downloads under their older names, for old links.
   - `check`: fails unless every expected file is present (`EXPECTED_RELEASE_FILES`): the four downloads, their
     aliases, `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, two blockmaps, and the game manifest and pack.
   - `delta`: compares the game manifest with the previous release's. It fails when an update with an unchanged shell
     would re-download more than half the game (`MAX_UPDATE_SHARE`), or the shell id moved with no shell file changed.
   - `notes`: writes the release body (below).
   - Stages a draft with every file attached, then publishes it in one step. `latest` decides whether the release
     becomes "latest" (`shouldMarkLatest`: a re-cut of an older build does not take it).

Download names never change (`app/lib/downloads.cjs` `DOWNLOAD_FILES`):
`DFO-Online-win-x64-setup.exe`, `DFO-Online-win-x64-portable.exe`, `DFO-Online-mac-arm64.dmg`,
`DFO-Online-linux-x86_64.AppImage`. The landing page links `releases/latest/download/<name>` directly. If
electron-builder starts naming files differently, `check` fails the release before a dead link goes live, and
`test/tooling/rel4_release.test.js` fails first.

## How the app updates

Two channels:

- **The game** (`app/lib/gameChannel.cjs`, `app/lib/gameStore.cjs`). Each release carries `DFO-Online-game.pack`
  (every file of `dist/` compressed on its own, end to end) and `DFO-Online-game.json.gz` (a manifest with each
  file's path, size and sha256). A running copy fetches only the changed files, by byte range, into
  `<userData>/Game/v<version>/`, holding only the files that differ from the seed (the copy bundled in the install).
  Each file is checked against its sha256. The folder counts only once its `index.json` is renamed into place. The new
  version is then on trial: its first successful boot deletes the previous version; a boot that fails rolls back to
  the previous version, and that release takes the installer path from then on.
- **The installer path** (`app/lib/autoUpdate.cjs`). A copy takes it when the release's manifest names another shell
  id or another channel generation (`GAME_CHANNEL`), or when the game channel failed. electron-updater replaces the
  installed app from `latest*.yml`. This works for the Windows NSIS install and for a Linux AppImage run as an
  AppImage. macOS (unsigned; `app/afterPack.cjs` signs it ad hoc), the Windows portable exe and unpackaged runs cannot
  replace themselves; they show a notice that links to the download (`app/lib/updateCheck.cjs`).

Raise `GAME_CHANNEL` in `app/lib/gameChannel.cjs` only when a release must not reach existing shells through the game
channel (the manifest's shape or the shell-to-game contract changed).

## Patch notes

Patch notes for players live in the pull request description, never in a file in the tree.
`test/tooling/rel4_release.test.js` fails the suite on a committed patch-notes file.

- Write them under `## Patch notes: <title>`, with parts under `###` headings
  (`.github/pull_request_template.md`). Leave the section out when players would not notice the change.
- Write them in ASD-STE100 Simplified Technical English. `ste-notes.yml` runs `scripts/steNotes.mjs` on every open
  pull request when the description changes or a commit is pushed. It checks what a machine can: sentence and
  paragraph length, semicolons, `-ing` forms, contractions, complex verbs. The approved-word rules are the
  reviewer's. Check a draft locally with `node scripts/steNotes.mjs <file>`.
- At release time `desktopRelease.mjs notes` finds the pull request numbers in the first-parent commit subjects since
  the previous `app-v` tag, reads each from the GitHub API, and takes the `## Patch notes` section (`patchNotesOf`)
  of each merged pull request opened by an owner, member or collaborator. GitHub's generated list of merged changes
  follows the notes. The launcher's news panel shows the part above that list.
- **Editing a merged pull request's description rewrites its release's notes.** `release-notes.yml` runs on that
  edit, finds the first release that shipped the pull request, and replaces the notes part of its body
  (`desktopRelease.mjs renotes`). Release files are not touched. A manual run takes a release tag.
- Never give the loot level gate's numbers (`src/systems/loot/lootLevelGate.js`) in patch notes, release notes or
  announcements. Say only that Rare and Legendary gear is rarer early on and more common as a character grows.
