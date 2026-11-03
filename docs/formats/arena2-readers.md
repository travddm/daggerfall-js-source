# ARENA2 readers

This page maps each Daggerfall data file the game reads to its reader in `src/formats/`, the Daggerfall Unity (DFU)
source it was translated from, and the layout facts and traps a maintainer needs. How the bytes reach a reader is in
[arena2-data.md](arena2-data.md).

## How the readers are built

- Most readers are line-by-line translations of DFU's `DaggerfallConnect` classes (MIT, Daggerfall Workshop). Constants,
  tables and quirks are kept byte-exact. Each module's header names its DFU source and lists every departure.
- Readers take a `Uint8Array` and never touch the disk or the DOM. DFU's file plumbing (`FileProxy` disk modes,
  `RewriteRecord` write-back, path checks) is not ported: the runtime is read-only.
- A reader keeps DFU's quirks even where they look like bugs. Change one only on purpose, and say so in the module
  header and its test.
- A few readers have no DFU source (`hmiFile.js`, `derivedTexture.js`, the Unity bundle readers). They were written
  against real file bytes and say so in their headers.

## The file map

| ARENA2 file(s) | Reader | DFU source | Notes |
|---|---|---|---|
| any `*.BSA` container | `bsaFile.js` (`BsaFile`) | `BsaFile.cs` | 4-byte header (`int16` count, `uint16` directory type), records packed from offset 4, directory at the end. `NameRecord` 0x0100: 18-byte entries (14-byte name + `int32` size). `NumberRecord` 0x0200: 8-byte entries (`uint32` id + `int32` size). |
| `*.PAL`, `*.COL` | `dfPalette.js` | `DFPalette.cs` | 768-byte files are raw RGB; 776-byte files have an 8-byte header. `MAP.PAL` stores 6-bit values and is multiplied by 4 (selected by file name). An unloaded palette is all red. `PAL.PAL` index 1 is the transparency sentinel. |
| `TEXTURE.nnn` | `textureFile.js` + `baseImageFile.js` | `TextureFile.cs`, `BaseImageFile.cs` | Multi-record, multi-frame; frames decode lazily and are cached. `TEXTURE.215`, `.217`, `.436` are rejected (`UNSUPPORTED_FILENAMES`). Archives above 511 (`LAST_CLASSIC_TEXTURE_ARCHIVE`) are mod or port archives. The caller assigns the palette (DFU loads `ART_PAL.COL` itself). |
| `*.IMG` | `imgFile.js` | `ImgFile.cs` | One image per file. Headerless files get their size from an exact file-length table. Six files carry a 768-byte palette after the pixels, multiplied by 4. `FMAP0I00/01/16.IMG` are rejected. |
| `*.CIF`, `*.RCI` | `cifRciFile.js` | `CifRciFile.cs` | `FACES.CIF` is really an RCI. RCI sizes come from a per-name table. `WEAPONnn.CIF`: a wield image, then animation records (not for `WEAPON09.CIF`, the bow). |
| `*.CFA` | `cfaFile.js` | `CfaFile.cs` | One record, N same-size frames, one RLE run. Used for the riding sprites `MRED00I0.CFA` (horse) and `MRED01I0.CFA` (cart). |
| `*.GFX` | `gfxFile.js` | `GfxFile.cs` | Only `SCRL00I0.GFX` and `SCRL01I0.GFX`: the parchment scroll of the class-questions screen. |
| `*.BSS` | `bssFile.js` | `BssFile.cs` | 10-byte header of five `int16`, then raw frames of palette indices. Used for the compass needles. |
| `ARCH3D.BSA` | `arch3dFile.js`, `faceUVTool.js`, `arch3dPatch.js` | `Arch3dFile.cs`, `FaceUVTool.cs`, `Arch3dPatch.cs` | Number-record BSA of meshes. Output is DFU's `DFMesh` shape: submeshes by texture, planes as triangle fans, positions and normals divided by 256, UVs by 16. `arch3dPatch.js` holds DFU's byte fixes (mostly UVs), applied to each record's private copy before parsing. |
| `BLOCKS.BSA` | `blocksFile.js` | `BlocksFile.cs`, `DFBlock.cs` | RMB (city), RDB (dungeon) and RDI blocks. Asks the world-data door first ([world-data.md](world-data.md)). Applies DFU's `FixRdbData` dungeon repairs. Record 669 is a junk record named `FOO`. |
| `MAPS.BSA` | `mapsFile.js` + `mapsTables.js` | `MapsFile.cs`, `DFRegion.cs`, `DFLocation.cs` | 62 regions (17 empty), four records each: `MAPPITEM`, `MAPDITEM`, `MAPTABLE`, `MAPNAMES`. Region names, races and temples come from `FALL.EXE` tables. Asks the world-data door first. |
| `CLIMATE.PAK`, `POLITIC.PAK` | `pakFile.js` | `PakFile.cs` | 500 rows of run-length data, each expanded to 1001 bytes: a `uint32` offset table, then runs of `{u16 count, u8 value}`. |
| `WOODS.WLD` | `woodsFile.js` | `WoodsFile.cs` | 1000x500 heightmap plus a 5x5 large-map grid per pixel. The heightmap buffer is smoothed in place at startup (`TerrainHelper.SmoothLocationNeighbourhood`) and copied back for the terrain worker (`syncHeightMapBytes`). |
| `SKYnn.DAT` | `skyFile.js` | `SkyFile.cs` | 32 palettes (stride 776), then 64 frames of 512x220 at offset 549120. Record 0 is the east half, record 1 the west. Not ingested on the lean diet. |
| `DAGGER.SND` | `sndFile.js` | `SndFile.cs` | Raw unsigned 8-bit mono PCM at 11025 Hz; a 44-byte WAV header is synthesized. |
| `MIDI.BSA` | `hmiFile.js` | none | DFU plays pre-converted MIDI; the port reads the original. Records are HMI songs (`HMI-MIDISONG061595`), not XMI. Note-on carries a duration; delta times are ordinary MIDI variable-length values. |
| `*.VID` | `vidFile.js` | `VidFile.cs` | Interleaved audio and video blocks; video blocks patch one persistent frame buffer. |
| `*.CEL` | `flcFile.js` | `FlcFile.cs` | Autodesk FLIC, not VID. Only the chargen constellations. |
| `FONTnnnn.FNT` | `fntFile.js` | `FntFile.cs` | 240 glyphs, each 16 rows of a 16-bit bitfield. |
| `TEXT.RSC` | `textRsc.js` + `rscTable.js` | `TextFile.cs`, `TextProvider.cs` | Token stream: `0xFE` end of record, `0xFF` variant separator, `0xF6` end of page, `0xF9`/`0xFB` take one operand byte. `rscTable.js` holds the rows where DFU's `Internal_RSC` string table differs from the file; those are read first. |
| `FLATS.CFG` | `flatsFile.js` | `FlatsFile.cs` | Per-billboard caption and face index into `TFAC00I0.RCI` (portraits). |
| `CLASS*.CFG` | `classFile.js` | `ClassFile.cs` | 74-byte class record (also used for enemy careers). `CLASSES.DAT` (class-questions results) is read by `systems/chargenSession.js`. |
| `BIOGnnTn.TXT` | `biogFile.js` | `BiogFile.cs` | Chargen biography questions and their effects. |
| `FACTION.TXT` | `factionFile.js` | `FactionFile.cs` | `#`-headed blocks, tab depth gives the parent. Region ids are converted from 1-based to 0-based. |
| `SPELLS.STD` | `spellsStd.js` | `DaggerfallSpellReader.cs` | 89-byte records. `readSpellRecord` is shared with the save reader. |
| `MAGIC.DEF` | `magicDef.js` | `MagicItemsFile.cs` | A record's index is its stream position. |
| `PAINT.DAT` | `paintFile.js` | `PaintFile.cs` | Flat array of 40-byte records, no header. |
| `BOOKS/BOKnnnnn.TXT` | `bookFile.js` | `BookFile.cs` | Title and author fields, a price, page offsets; each page is a `TEXT.RSC`-style token stream. |
| classic saves (`SAVE0`-`SAVE5`) | `save/saveGames.js`, `save/saveTreeFile.js`, `save/saveVarsFile.js`, `save/saveImageFile.js`, `characterRecord.js`, `bioFile.js`, `rumorFile.js` | `API/Save/*.cs`, `BioFile.cs`, `RumorFile.cs` | `SAVETREE.DAT`, `SAVEVARS.DAT`, `IMAGE.RAW`, `SAVENAME.TXT`, `MAPSAVE.SAV`, `RUMOR.DAT`, `BIO.DAT`. `systems/classicSave.js` (`classicSaveToSnapshot`) converts a save into the port's own state. |

Shared helpers: `fileProxy.js` (`readCString`, the one C-string rule for classic records), `dfRandom.js` (classic
LCG, `DFRandom.cs`), `umRandom.js` (Unity.Mathematics xorshift, for byte-exact terrain noise), `netRuntime.js` (.NET
`string.GetHashCode` and similar seeds), `color32Order.js` (texel order, below).

Quest scripts are not read from ARENA2. The game reads DFU's decompiled quest text from `vendor/dfu-quests`
(`src/systems/quest/parser.js`, `questLists.js`). The `QBN`/`QRC` files are not ingested.

## Traps

**Texel order.** Every texture that reaches the GPU is in DFU's `GetColor32` order: row 0 of the buffer is the
picture's bottom row. `BaseImageFile.getColor32` writes it that way and the renderer uploads with `UNPACK_FLIP_Y_WEBGL`
off. A picture from a PNG, a canvas or a Unity bundle arrives top row first. It must pass `toColor32Order` (or
`toColor32`) in `src/formats/color32Order.js` exactly once. Two doors that flip produce a mirrored sprite; none produces
an upside-down one.

**Fixed-size loops that guard against bad data.** Some DFU arrays bound a loop. `cifRciFile.js` keeps
`MAX_WEAPON_RECORDS = 64` because a weapon record with a total size of 0 never advances the read head; without the
bound the loop never ends. `arch3dFile.js` keeps DFU's fixed decomposition buffer sizes and fails a record where C#
would throw.

**`MAPNAMES` names fill 32 bytes.** Two locations have no terminator. The 32-byte stride keeps the next name correct;
the 32-character cap keeps these two from absorbing the next name.

**Byte truncation is load-bearing.** The RMB block-name letter uses `(byte)(2 * c) >> 6`; the location type uses
`uint` wraparound. Port both as 8-bit and 32-bit unsigned arithmetic.

**RMB subrecords step by the header's sizes**, not by the bytes read. RDB object roots must start exactly at
`objectRootOffset` or the block fails.

**`mapsTables.js` must stay reader-free.** It holds the pure region, race and climate tables. The account service
imports it (`server-account/src/market.js`, `server-account/src/professions.js`); a reader import here would bundle a
BSA reader into the Worker.

**`blocksFile.js` serves a block with port changes laid on.** The door may replace it, and an RMB's puddles are served
dry (`world/puddleDry.js`). `readClassicBlock` returns the block as the BSA holds it, past both. Use it when you need
the original (world-data patches do).

**Departures are listed in headers.** `mapsFile.js` returns `null` where C# returns a default struct, memoizes
`loadRegion`, and bounds a terminator scan at the record end. `bsaFile.js` bounds the name scan at the 14-byte field.
Keep these lists current when you add one.

## Adding or changing a reader

1. Read the DFU class first (see [mods-and-vendor.md](mods-and-vendor.md), "Daggerfall Unity as the baseline").
2. Translate it; keep constants and quirks; list departures in the header.
3. Add a test in `test/formats/` with a synthetic fixture and a real-data half gated on `ARENA2_PATH`.
4. Add the file kind to `KEEP` in `src/scenes/dataSource.js` and bump `MANIFEST_V` if it is not already ingested.
5. Run the real-data half locally (`sh tools/fetch-data.sh`, then `ARENA2_PATH=... node --test test/formats/<file>`).
