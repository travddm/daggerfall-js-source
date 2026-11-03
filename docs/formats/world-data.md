# World data: replacing locations, blocks and buildings

This page covers the world-data door: how mods and the port's own content replace or add Daggerfall locations, blocks
and building records, and how mod world data ships without carrying Daggerfall's data. The code is in
`src/formats/worldData/` and `src/scenes/modWorldData.js`.

## The model

Daggerfall Unity (DFU) lets a mod replace world data with JSON files that its World Data Editor writes
(`WorldDataReplacement` and `WorldDataVariants` in `Assets/Scripts/Utility/AssetInjection/`). The port reproduces that
mechanism. `MapsFile` and `BlocksFile` ask the door before they read a region, a location or a block from the BSA. When
the door has a replacement, the reader returns it instead.

| File | Role |
|---|---|
| `src/formats/worldData/worldDataDoor.js` | A leaf with one setter and one getter (`setWorldDataDoor`, `worldDataDoor`). The readers import only this, so there is no import cycle. Unset, every ask answers "no replacement". |
| `src/formats/worldData/worldDataReplacement.js` | The door itself (DFU `WorldDataReplacement`). Registers files by DFU name, serves them, converts DFU JSON into the readers' camelCase structs (`locationFromJson`, `blockFromJson`, `rdbBlockFromJson`, `buildingReplacementFromJson`). `installWorldDataReplacement()` installs it on the leaf. |
| `src/systems/worldDataVariants.js` | Which variant of a location, block or building is in force (DFU `WorldDataVariants`). Quests set variants with `worldupdate`. Location key is `locationIndex * 100 + regionIndex`. |
| `src/formats/worldData/worldDataJson.js` | Serializes a classic block or location into DFU's JSON shape; `diffJson` / `patchJson` / `canonicalJson`. |
| `src/formats/worldData/worldDataPatch.js` | Rebuilds one mod file from the player's block plus a patch. |
| `src/formats/worldData/worldDataPack.js` | Rebuilds any file of a whole-mod pack on demand. |
| `src/scenes/modWorldData.js` | Loads every vendored mod's world data at boot and registers it on the door. |
| `src/systems/layoutPins.js` | Keeps a town in the layout a save's records were made in. |

### File names the door serves (DFU's)

- `region-<region>.json`
- `location-<region>-<index><variant>.json` (replace a location); `locationnew-<name>-<region>.json` (add one)
- `<BLOCK>.RMB<variant>.json` (a block from JSON; a new block gets an index past the BSA's count)
- `<BLOCK>-<blockIndex>-building<n><variant>.json` (one building record inside a classic block)

The helpers `locationReplacementFilename`, `blockReplacementFilename` and `buildingReplacementFilename` build them.
Building replacements apply to RMB blocks only.

### The gate

Offline, the door is open when the setting `Enhancements/AssetInjection` is on (DFU's rule). Online it is always open,
because world-data mods that the room owns change ground every player walks on (see `ONLINE_ROOM_MOD_KEYS` in
`src/systems/online/onlineLane.js`). The gate is read once per game (`latchWorldDataDoor`): closing it mid-game would
leave holes where a pack's new blocks stand. Each mod's own `Enabled` switch still decides its files.

### Load order

The door keeps every mod's entry for a name, highest priority first (DFU `ModManager.TryGetAsset` walks enabled mods in
reverse load order). `WORLD_DATA_PRIORITY` in `src/scenes/modWorldData.js` sets the town packs' priorities.

### The port's own content uses the same door

`registerPortBlock`, `registerPortBlockOf`, `registerPortBlockFamily` and `registerLocationEdit` let port features add
blocks and edit locations (the arena city, capitals, town outlines and similar, wired from `loadModWorldData`). The
door also lays curated people and placements on every block it serves (`world/curatedPeople.js`,
`world/curatedPlacements.js`).

## Why patches and packs exist

A DFU world-data file is mostly the classic block or location, serialized, with the author's edits in it. That is game
data and cannot be in the repository. So the port vendors only the edit and rebuilds the file from the player's own
`BLOCKS.BSA` and `MAPS.BSA` at load time.

Rebuilding needs the classic data as the BSA holds it, before any replacement: `BlocksFile.readClassicBlock(index)` and
`MapsFile.readClassicLocation(region, index)` read past the door and the block cache.

## Patch format (one file at a time)

Vendored as `vendor/<mod>/WorldDataPatches/*.json`:

```text
{ format: 'dfe-worlddata-patch/1',
  rebuilds: '<DFU file name>.json',
  base: { kind: 'block', block: 'W0000000.RDB', index: 1016 }
      | { kind: 'building', block: 'SHIPAA00.RMB', index: 390, record: 0 },
  sha256: '<sha256 of the author's file in canonical JSON>',
  ops: [...] }
```

Ops apply in order; each path is read against the document the earlier ops left:

| Op | Meaning |
|---|---|
| `s` | set a key, replace an element, or replace the root |
| `d` | delete a key |
| `i` | insert into an array |
| `r` | remove an array element |
| `ci` / `cs` | insert / set a copy of a node from a classic block's JSON (`{ block, path }`) |

`rebuildWorldDataPatch(patch, blocksFile)` throws when the format is wrong, the named block is not at the named index,
or an op does not land. Make a patch with `node tools/worldDataPatch.mjs`; it refuses to write a patch that does not
rebuild the author's file hash for hash, and it checks through the runtime's own rebuild.

## Pack format (a whole mod)

Large town mods ship thousands of files. A pack holds the edit of every file once, gzipped, as
`vendor/<mod>/WorldDataPack/<mod>.pack.json.gz`:

```text
{ format: 'dfe-worlddata-pack/1', vendor, mod: { title, version, author },
  bases, classicNames,
  files: { '<DFU file name>': [sha256, base, ops] },
  nodes: [ value, ... ] }
```

- `bases` (optional) lists the pack files other files are built on, so they are kept after a rebuild. `classicNames`
  maps each classic block index a `$c` reference reads to the name the pack was built against; it is checked.
- A base is a classic block `['b', name, index]`, a classic location `['l', region, index, name]`, or another file of
  the same pack `['f', name]` (rebuilt first; never more than two deep). Names are checked against the player's data.
- Ops are the patch ops plus `sr`: set a run of consecutive array elements at once (an automap in one op).
- A value may contain references: `{ $n: k }` (pack node k), `{ $c: [index, path] }` (a node of classic block `index`),
  either with `$o: ops` (ops laid on a copy); `{ $r: runs }` (run-length number array); and record rows
  `{ $m | $f | $d | $3 | $b | $t | $g: rows }` (models, flats and people, doors, section 3, building data, ground tiles,
  scenery). A row is a fixed list of numbers expanded back into DFU's object, key for key. No DFU object has a key
  starting with `$`, so a one-`$`-key object is always a reference.
- `openWorldDataPack(pack, { blocks, onRebuilt })` answers `names`, `has`, `sha256Of`, `baseOf`, `rebuild(name, maps)`
  and `release`. A file is rebuilt the first time the door asks for it.
- Build with `node tools/worldDataPackBuild.mjs`. The builder is deterministic (the bundle and ARENA2 decide the bytes)
  and refuses a pack in which any file does not rebuild to the author's sha256 through `worldDataPack.js` itself.

## Loading (`src/scenes/modWorldData.js`)

`loadModWorldData()` runs before the first region loads, so the readers' synchronous asks find the files. It globs:

- `vendor/*/WorldData/*.json` (whole files a mod ships that contain no classic data);
- `vendor/*/WorldDataPatches/*.json` (patches, rebuilt from the bound `BLOCKS.BSA` at load);
- `vendor/*/WorldDataPack/*.pack.json.gz` (as URLs; a pack is fetched only when its mod is loaded for the game, or when
  a save's layout pins need it).

Rebuilt files are spot-checked against the author's sha256 in the background (a sample of blocks and locations), and a
mismatch is logged once per pack. When the player's BSA differs from the one the mod was made against, the rebuild is
the author's edit applied to the player's block. It is served, and the hash difference is logged. A patch whose ops do
not land is logged and not served.

## Layout pins

Town mods replace whole towns, and the game keys buildings by position (`(blockX << 16) + (blockY << 8) + record`). A
save's building-keyed records (a bought house and its decor, a rented room, a quest building) would otherwise land in a
different building when a mod is switched. `src/systems/layoutPins.js` stamps those records with the mods that served
the town; that town is then served in that layout for that save until nothing in it needs the pin.

## Editor behaviours present in mod files

DFU's editor round trip leaves these in authors' files, and the port serves them as DFU would:

- `GetBlockAutoMap(removeGroundFlats)` mutates its block, so an automap's `0xFB` ground-flat bytes come back zeroed.
- The RDB root list can be regrouped (empty roots dropped).
- Rotations pass through Unity Euler angles: 512 can come back as -1536, and some models move by a few units.
- Header record counts are not kept in step with arrays. Layout reads the arrays.

## Tests

`test/formats/worldData/` holds the door, patch and pack tests. With `ARENA2_PATH` set, `wd3_pack.test.js` rebuilds
every file of both town packs from the player's BSA files and compares hashes.
