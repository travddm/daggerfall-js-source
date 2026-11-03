# ARENA2: where the game data comes from

This page covers how the game gets Daggerfall's own data files (the `ARENA2` folder) at runtime, in development and in
tests. The readers that parse the files are in [arena2-readers.md](arena2-readers.md).

## The rule

Daggerfall's data is freeware but not redistributable. It never enters the repository, the build or a deploy. Every
reader parses bytes that the player supplies, in the player's own browser. The same rule holds for Morrowind data
([morrowind.md](morrowind.md)) and for a player's own Daggerfall Unity mod bundles
([mods-and-vendor.md](mods-and-vendor.md)).

## The runtime path: `src/scenes/dataSource.js`

`getBytes(name)` is the one door every scene uses to read an ARENA2 file. It answers a `Uint8Array` from, in order:

1. a memory cache (`mem`, keyed by the normalized name);
2. IndexedDB, database `project-dagger`, object store `arena2`;
3. the network, `./arena2/<name>` (only the dev server answers this; the deployed site returns 404).

Names are normalized by `normalizeName`: the basename, upper-cased. Real ARENA2 files are upper-case; user folders vary.
`forgetBytes(name)` drops a cached file, but only when it can be read again from IndexedDB or the network.

`ensureArena2()` is the boot gate. When no source can serve the data, it shows a DOM overlay that asks for the ARENA2
folder (directory input, drag and drop, or a `.zip`) and stores the files in IndexedDB, so the player picks once.
`src/main.js` calls it through `ensureData()` only on paths that need data. The enhanced front menu runs before the
gate, so a player can open settings without picking a folder.

The desktop shell (`app/`) looks for an existing install before it asks: `app/lib/arena2Detect.cjs` and
`app/lib/arena2Probe.cjs` check known locations (for example Daggerfall Unity's `settings.ini` and Steam libraries).

### The ingest filter (`KEEP`)

ARENA2 is about 517 MB; the game reads about 155 MB. `KEEP(name, lean)` decides which files are stored:

- every `TEXTURE.nnn`;
- every file with extension `BSA COL PAL PAK CFG FNT WLD DEF STD IMG CIF RSC RCI SND TXT GFX BSS CFA`;
- named files: `CLASSES.DAT`, `PAINT.DAT`, the videos the game plays (`ANIM0001.VID` splash, `ANIM0012.VID` death,
  `ANIM0002.VID` and `ANIM0004.VID` infection dreams) and the chargen constellations `ROGUE.CEL`, `MAGE.CEL`,
  `WARRIOR.CEL`;
- `SKYnn.DAT` sky sets (about 247 MB), but only when not `lean`.

`lean` is true on a touch-primary browser without the desktop shell. On the lean diet the sky falls back to a gradient.

**Trap: a new reader needs its file in `KEEP`.** A file that the filter drops is absent on the deployed site and on
phones, but present in development (the dev server serves the whole folder). The failure is silent: callers warn and
skip. When you add a reader for a file kind that `KEEP` drops, add the file to `KEEP` and bump `MANIFEST_V`. A stored set
with an older manifest version is wiped and the player is asked to pick again. A test re-derives the list of ARENA2 names
the source fetches and fails when `KEEP` drops one of them.

### Other stores in the same database

| Store | Holds | Cleared by an ARENA2 re-pick |
|---|---|---|
| `arena2` | the filtered ARENA2 files and a `__MANIFEST__` record | yes |
| `music` | player-supplied replacement music | no |
| `textures` | player-supplied loose replacement textures | no |
| `morrowind` | Morrowind `.bsa`, `.esm`, `.esp` and loose files | no |
| `derived` | artifacts generated from player data (Morrowind record sets) | yes |
| `arena` | retired; emptied once at world boot by `clearRetiredArena` | swept |

`?music` and `?textures` on the URL open the music and texture pickers (`pickMusicFolder`, `pickTextureFolder`).

## Development

- `sh tools/fetch-data.sh [dest]` downloads the freeware game files published for Daggerfall Unity installs and
  extracts `arena2/` to `/home/claude/dfdata/arena2` by default (about 150 MB). Set `ARENA2_PATH` to that folder.
- `vite.config.js` `arena2DevServer` serves `ARENA2_PATH` (default `/home/claude/dfdata/arena2`) at `/arena2/*` and
  `/play/arena2/*`. It serves every file, not only the `KEEP` set.
- Boot URLs that go straight to a scene (`?world`, `?exterior`, `?region`, `?loc`, `?dungeon`, `?interior`, `?shot`,
  `?nomenu`) call the data gate first.

## Tests

- Reader tests live in `test/formats/` (and `test/formats/morrowind/`, `test/formats/worldData/`).
- Each reader test has two halves. Synthetic in-memory archives run everywhere, including CI. Real-data tests run only
  when `ARENA2_PATH` points at an existing folder, and otherwise skip with a message. See `test/formats/bsa.test.js` for
  the pattern (`skipReal`).
- Shared real-data helpers: `test/arena1Data.mjs`, `test/fb1004dArena.mjs` (both read `ARENA2_PATH`).
- CI has no ARENA2, so a reader change must be run locally with `ARENA2_PATH` set. "Skipped" is not "passed".
- A real-data invariant that proves a container parse: for a BSA, the records fill `[4, directoryStart)` with no gaps,
  and `directoryStart + entrySize * count == fileLength` (`assertStructuralClosure` in `test/formats/bsa.test.js`).
