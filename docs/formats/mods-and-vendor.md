# Mods, `vendor/`, and Daggerfall Unity as the reference

This page covers how the game carries Daggerfall Unity (DFU) mods: what `vendor/` holds, how a vendored mod's switches
work (`src/systems/modSettings.js`), how a player's own `.dfmod` bundle is read, and how DFU's source is used as the
reference.

## What a "mod" is here

DFU mods are Unity asset bundles (`.dfmod`) with C# scripts. The browser cannot run them, so the port does one of four
things with each mod it supports:

1. **Port the code.** The mod's logic is rewritten in JS under `src/` (usually `src/systems/<mod>.js` or a folder).
   The original source, or a text disassembly (IL) of its compiled `.dll`, is kept in `vendor/<mod>/` as the reference.
2. **Vendor the data the authors allow.** Text tables, item templates, settings, sounds, textures, models and world data
   are copied into `vendor/<mod>/` and loaded by the port, with the authors' permission recorded in the folder README.
3. **Rebuild from the player's data.** Where a mod's file is mostly Daggerfall's own data (world data, edited classic
   textures), only the edit is vendored and the file is rebuilt at load ([world-data.md](world-data.md),
   `src/formats/derivedTexture.js`).
4. **Read the player's own bundle.** A texture mod the player owns is attached at runtime and never enters the
   repository (below).

## Layout of a `vendor/<mod>/` folder

| File or folder | Meaning |
|---|---|
| `README.md` | What the mod is, its version and source, what is vendored, what the port does with it, and the permission or licence. Read it before touching the mod. |
| `*.dfmod.json` | The bundle's manifest, verbatim (title, version, GUID, file list, dependencies). |
| `modsettings.json`, `modpresets.json` | The mod's own settings and presets, verbatim. The port's copy of the keys lives in `modSettings.js`. |
| `Scripts/`, `*.cs` | The mod's C# source, where it was published. |
| `*.dll`, `il/` | The compiled assembly and its IL disassembly (`<Name>.il.txt`), the reference when no source was published. |
| `Textures/`, `Sound/`, `Audio/`, `Models/`, `*.dae`, `shaders/` | Vendored assets. Some art is served from `public/art/<mod>/` instead. |
| `*.files.json` | For a loose-file pack (no `.dfmod`): the archive's file list with hashes, proving each vendored file is the archive's bytes. |
| `ItemTemplates.json`, `*.csv`, `Quests/`, `Tables/` | Data tables the port loads. |
| `WorldData/`, `WorldDataPatches/`, `WorldDataPack/` | World data ([world-data.md](world-data.md)). |

Vite globs these folders at build time (`import.meta.glob('../../vendor/...')`). Under node the globs are empty, so
tests register vendored data from the file system.

## The folders

DFU's own data (MIT, vendored verbatim):

| Folder | Holds | Used by |
|---|---|---|
| `dfu-text` | DFU's nine English string tables (`Internal_*.csv`) | Translation masters ([localization.md](localization.md)); `formats/rscTable.js` rows. Not loaded at runtime. |
| `dfu-quests` | DFU's decompiled quest sources (`Quests/*.txt`) and quest lists (`Tables/`) | `systems/quest/parser.js`, `questLists.js` |
| `dfu-books` | Book id mapping | `systems/books.js`, `systems/booksData.js` |
| `dfu-settings` | `defaults.ini` and `GameSettings.txt` | `systems/settings/settingsDefaults.js` (the settings model's defaults) |
| `dfu-icons`, `dfu-cursor` | Interaction-mode icons, default cursor | `ui/modeIcons.js`, `ui/cursor.js` |

Mods (the folder README has the version, credits and permission):

| Folder | What is vendored |
|---|---|
| `ambient-text` | Ambient Text: its text table |
| `aquatic-sprites`, `detailed-ships`, `warm-ashes-ships`, `immersive-travel` | World-data patches (and quests, IL, drawings where the mod has them) |
| `beautiful-villages`, `beautiful-cities` | One world-data pack each |
| `better-ambience`, `immersive-footsteps`, `readied-spellcasting-hands`, `world-tooltips` | C# sources and clips |
| `class-skins`, `layered-armor`, `sands-of-the-alikr` | Sprite and texture art (loose packs) |
| `climates-calories`, `foraging`, `roleplay-realism`, `roleplay-realism-items`, `travel-options` | Item templates, mod data CSVs, textures, quests |
| `come-sail-away`, `eye-of-the-beholder`, `heat-haze`, `horse-cart-and-cargo`, `iliac-puddle-no-more`, `ocean-holes`, `physical-items`, `project-legacy`, `snowfall`, `windfall`, `world-events-raiding-parties` | Assembly and IL (code ported off the IL), plus any art, sounds and shaders |
| `daggerfall-arena`, `windmills-kamer`, `low-poly-trees` | Models and placements (tree atlases are rebuilt from the player's data) |
| `daggerfall-enemy-expansion`, `meanerMonsters`, `mudex`, `unleveledLoot`, `pcaao` | Monster, class and loot tables; settings |
| `diverse-weapons`, `seasons-iliac-bay`, `vanilla-enhanced` | Manifests and settings; the textures come from a bundle (the player's, or for Vanilla Enhanced a pack the port ships) |
| `dynamic-skies`, `handheld-torches`, `shield-widget`, `weapon-widget` | Settings, textures, shaders |
| `grimoire-ui` | UI art listing (`systems/uiPack.js`) |
| `weapon-sheathing` | An OpenMW mod's scabbard meshes and bone add-ons (`systems/weaponSheathingAssets.js`) |
| `oblivion-remaster-leveling` | An OpenMW Lua mod's source (leveling rules) |
| `raum-book` | The animated journal's book and paper code |
| `pixelify-glyphs`, `silkscreen-five` | Single glyphs for the enhanced skin's fonts |
| `roads-hazelnut` | Basic Roads' road, track, river and stream bitmaps |
| `vorbis-fsb-setups` | Vorbis setup headers for turning Unity audio clips into Ogg (`tools/lib/fsb5Vorbis.mjs`) |
| `kings-gambit` | Belongs to a feature being removed |

## A mod's switches (`src/systems/modSettings.js`)

- `MOD_SETTINGS[vendor]` declares each vendored mod that has switches: `title`, `author`, and `keys`. A key is
  `Section.Key` as in the mod's `modsettings.json`, with its default, description and kind: boolean, integer slider
  (`min`/`max`), float slider (`float: true`), choice (`options`), text, tuple or colour. Descriptions and option names
  are `t()` getters ([localization.md](localization.md)).
- Each declared mod has an `Enabled` key. DFU enables a mod by listing it; the port has no mod list, so this is the port's own.
  Mods default to on.
- Read with `modSetting(vendor, key)`, write with `setModSetting(vendor, key, value)`. Both throw for an undeclared key.
  `modSettingIfDeclared` answers `undefined` instead (the analogue of DFU's `ModManager.GetMod` for a mod that is not
  loaded). `modSettingsOf(vendor)` returns every key resolved.
- Values are stored in one record, `dfjs-mod-settings`, through `systems/appStorage.js` (in memory where there is no
  storage). `modSettingsGeneration()` changes on every write; a reader that caches a resolved copy keys on it.
- **Online, the room decides some keys.** `onlineModSetting` (via `systems/online/onlineLane.js`) forces keys the shared
  ground depends on (`ONLINE_ROOM_MOD_KEYS`) and reads whole balance mods at their shipped defaults
  (`ONLINE_WHOLE_MODS`). While a room's shared loot base rolls, every key reads its shipped default (`asTheRoom`).
- **Load-time mods latch.** A mod that takes effect on the next game load is read once by the host that builds it
  (`latchModLoaded`); its other code asks `modLatchedOn` so a mid-game switch reaches nothing until the next load.
- `flattenModPreset` turns a DFU preset (`{ Values: { Section: { Key: "True" } } }`) into store keys.
  `KEY_MIGRATIONS`, `SWITCH_RESETS` and `RETIRED_KEYS` move, reset and drop stored keys when a declaration changes.
- The Mods pane is in the enhanced menu (`src/ui/enhanced/enhancedMenu.js`).

Per-mod save data goes through `systems/modSaveData.js` (DFU's `GetSaveData`/`RestoreSaveData`).

## A player's own `.dfmod` bundle

A texture mod has no code, only DFU's asset-injection names packed into a bundle. One door serves them all:
`src/systems/dfmodTextures.js`.

- `src/formats/unity/unityBundle.js` reads UnityFS bundles: LZ4 or LZ4HC blocks only (LZMA is refused), SerializedFile
  14 or later with a type tree (a stripped tree is refused). Texture formats decoded (`TEXTURE_FORMAT`): Alpha8, RGB24,
  RGBA32, ARGB32, DXT1, DXT5, BC7, and crunched DXT1/DXT5 (`crunch.js`); Texture2DArray formats map to these. Also
  TextAssets.
- Opening a large bundle takes seconds, so at attach time the bundle is indexed once and the index stored as JSON. A
  bundle is opened later, in a worker (`unityBundleClient.js`, `unityBundleWorker.js`), from a small shared pool
  (`unityBundlePool.js`), only when one of its pictures is needed.
- Names follow DFU's `TextureReplacement`: `{archive:000}_{record}-{frame}[_{dye}][_{map}].png` (for example
  `003_5-0.png`), plus `IMG`/`CIF` names and `.xml` sidecars (billboard scale, paperdoll rect). `systems/
  textureReplacement.js` holds the naming and the texture tiers; only the `Albedo` and `Mask` maps are used.
- Load order follows DFU's `ModManager`: where two mods carry a name, the one loaded last wins, and a mod loads after
  its dependencies. A shipped pack (`systems/vanillaEnhanced/`) registers through the same door; a player's attached
  copy of the same mod shadows it.
- Every picture from a bundle or PNG is top row first and must be converted once to the port's texel order
  (`formats/color32Order.js`, see [arena2-readers.md](arena2-readers.md)).
- Loose replacement textures and music (picked folders) use the same naming, through `textureReplacement.js` and
  `musicReplacement.js`. All replacement is gated by DFU's `Enhancements/AssetInjection` setting.

## Daggerfall Unity as the reference

The game is its own design, not a copy of DFU. DFU is where to look first:

- **Read DFU before building a system it has.** Grep this tree for the DFU class name and its constants; a port may
  already exist.
- **Cite DFU by file and class** in comments and docs: `FormulaHelper.CalculateAttackDamage`,
  `TextureReplacement.cs` `TextureReplacement`. Do not cite DFU line numbers; they move.
- **Name a departure** where it is made: the DFU member it leaves and why.
- **Readers stay exact** ([arena2-readers.md](arena2-readers.md)). Gameplay may depart.
- **DFU's source is never vendored**, except its data tables (`vendor/dfu-*`). Licence: MIT, Interkarma and
  contributors; credit it in public-facing material.

Tools that use a DFU checkout:

- `test/dfuRoot.mjs`: tests that regenerate a port table from DFU's C# (enemy basics, loot tables, item enums) find the
  checkout through `DFU_PATH`, else the sparse clone under `tools/parity/dfu`. Without a checkout they skip.
- `tools/parity/prepare.sh` sparse-clones DFU (or reuses `DFU_PATH`). `tools/parity/run.sh` compiles a C# driver with
  `mcs`/`mono` and diffs its output against the JS readers for BSA, TEXTURE, IMG, CIF/RCI, ARCH3D, BLOCKS, MAPS and
  more. It needs `ARENA2_PATH`.

  Run: `DFU_PATH=/path/to/daggerfall-unity ARENA2_PATH=/path/to/arena2 bash tools/parity/run.sh`.
