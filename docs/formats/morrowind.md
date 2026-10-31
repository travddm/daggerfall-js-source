# Morrowind assets: 3D bodies, armour and weapons

This page covers the optional Morrowind layer: the player attaches their own Morrowind data, and the enhanced skin then
draws characters as 3D Morrowind bodies (the first-person arms, the third-person body, other players, NPCs and foes)
instead of Daggerfall sprites. The readers are in `src/formats/morrowind/`; the port's own shipped meshes are in
`src/assets/mw/`.

## The rule and the gate

- Morrowind is sold, not freeware. Its files never enter the repository or the build. The player attaches
  `Morrowind.bsa`, the expansions, `Morrowind.esm` and any mod files through the Morrowind card of the enhanced menu (`morrowindCard` in
  `src/ui/enhanced/enhancedMenu.js`, which also reports why a body was refused); they live only in IndexedDB
  (store `morrowind`, see [arena2-data.md](arena2-data.md)).
- The layer is on when the enhanced skin is on and Morrowind data is attached: `isEnhanced() && morrowindDataCount() > 0`.
  There is no separate switch for the player's own arms and body. NPC bodies also honour the pref `mwNpcBodies`
  (`characters/npcBodies.js`).
- Without Morrowind data every character keeps the classic sprite or paperdoll. Every consumer must work in that state.
- The reference is OpenMW (GPL). `mwBsaFile.js`, `mwEsmFile.js` and `mwNifFile.js` state that OpenMW was used for
  behaviour only and no code was ported. `mwTexture.js` describes its path-correction functions as a verbatim
  translation of OpenMW's `misc/resourcehelpers.cpp`. Read a module's header for its own statement before you bring in
  more of OpenMW's logic.

## Data plumbing (`src/scenes/dataSource.js`)

| Function | Does |
|---|---|
| `pickMorrowindFiles`, `storeMorrowindFiles` | Store `.bsa`, `.esm`, `.esp`, and loose `.nif .kf .dds .tga .wav`. Loose files are keyed by `mwLoosePath`: lower-case, from the first known root (`meshes/`, `textures/`, `sound/`, `icons/`, `bookart/`, `animations/`, ...). |
| `registerMorrowindData` | Counts the stored archives at boot; bumps `morrowindDataGeneration()` when the stored set changed. |
| `loadMorrowindArchives` | Opens every source as a `{ has, get, load, loaded }` archive, in lookup order (below). Cached per generation. |
| `loadMorrowindFile` | Raw bytes of a stored `.esm`/`.esp`, cached per generation. |
| `loadMorrowindArmRecords` | The record set a body build needs from one `.esm`/`.esp` (`extractArmRecords` in `mwFirstPerson.js`: `ARMO BODY CLOT CREA GMST LIGH MGEF RACE STAT WEAP`), stored in the `derived` store under a key that includes `ARM_RECORDS_VERSION`, the file size and a content sample. |

Archive lookup order (first match wins):

1. the player's loose files (data files override archives, as in the engine);
2. the vendored Weapon Sheathing scabbards and bone add-ons (`systems/weaponSheathingAssets.js`);
3. the port's own assets (`systems/ownMwAssets.js`, below);
4. every `.bsa`: unknown packs first, then Bloodmoon, Tribunal, and `Morrowind.bsa` last.

A `.bsa` is opened by range off the stored Blob (`MwBsaFile.open`): the directory at once, entry bytes on demand.

**Trap: the generation counter.** Code that caches anything built from Morrowind data must key it on
`morrowindDataGeneration()`. A new attach or a clear changes the generation, and stale caches then serve the old set.
An async read must store its result in the cache generation it started under.

## Readers (`src/formats/morrowind/`)

| Module | Reads or does |
|---|---|
| `mwBsaFile.js` | Morrowind BSA v0x100 (unrelated to Daggerfall's BSA). Paths normalized by `normalizeBsaPath`. |
| `mwEsmFile.js` | TES3 `.esm`/`.esp`. Every record has a size, so unknown records are skipped and counted. Decodes `BODY`, `RACE`, `NPC_`, `CREA`; deleted records are dropped. Text is Windows-1252. |
| `mwNifFile.js` | NIF 4.0.0.2 only. Records have no size field, so the reader is strict: an unknown record type throws with its name and index. |
| `mwNifMesh.js` | Flattens a parsed NIF into draw batches: composed transforms, materials, base texture. |
| `mwDdsFile.js`, `mwTexture.js`, `mwTextureClient.js`, `mwTextureWorker.js` | DDS decode (DXT1/3/5, uncompressed masks) and the texture path rule; decoding runs in a worker pool. |
| `mwSkin.js`, `mwGpuSkin.js`, `mwSkinTransfer.js`, `mwAffine.js`, `mwKeys.js` | Skeleton, CPU skinning (the reference), GPU skinning (what the game draws), skinning a rigid worn mesh from the body under it, key-group sampling. |
| `mwAnim.js` | Text-key animation groups and per-bone tracks from NIF and KF files. |
| `mwCharacter.js`, `mwNpc.js` | Assemble a character: base skeleton plus parts joined by bone name; pick body parts from ESM records by race, sex and slot. |
| `mwFirstPerson.js` | The first-person and body-assembly rules, the record extraction, and the diagnostics. Re-exported by `src/tools/mwInspect.js` for `mw-inspect.html`. |
| `mwItemMap.js` | Maps every Daggerfall weapon, armour and clothing template and material to a Morrowind record, resolved against the player's records by search token. A row may say "keep the classic sprite"; it must say so explicitly. |
| `mwFaceMatch.js` | Pairs Daggerfall portraits with Morrowind heads and hairs. |
| `mwCloakFit.js`, `mwPartClock.js` | Cloak fitting and parts that animate on their own clock (for example an arrow on a bow). |
| `mwParticles.js`, `mwSpellFx.js`, `mwVfx.js` | NIF particle systems (torch flames), which Morrowind effect visuals a Daggerfall spell uses, and running an effect mesh (`scenes/mwMagicFx.js`). |

## Where it is used

- `src/combat/fpArm.js`: `createFpArm()` builds and draws the player's arms and, in third person, the whole body
  (`drawThird`). It draws into the renderer's offscreen character pass with its own projection (first person has its
  own field of view and a cleared depth buffer).
- `src/combat/weapon/weaponRig.js`: builds the rig from the player's equip table.
- `src/net/peer/peerBodies.js`: other players' bodies, one `createFpArm()` instance each, nearest first, capped, built
  one at a time.
- `src/characters/npcBodies.js`, `foeBodies.js`, `wardrobe.js`: NPC and foe bodies, dressed from a seeded role and
  wealth tier so every client dresses a person the same way.
- `src/characters/bodyMotion/`: walking, carrying and striking laws measured off each skeleton's rest pose.
- `src/world/horseModel.js`: the 3D horse.
- Tools: `mw-viewer.html` (`src/tools/mwViewer.js`) and `mw-inspect.html` read the player's files in the page and show
  what parses; an unknown NIF record shows as its type name. Probes: `npm run mwinspect`, `mwarm`, `mwviewer`,
  `mwattach`.

## Rules that are easy to get wrong

These come from the engine's behaviour, read in OpenMW, and are recorded in detail in the readers' comments.

- **A first-person part is a record, not a file name.** A `BODY` record whose id ends in `1st` is the first-person
  version. Never derive a mesh path by inserting `.1st`.
- **Only arm parts fall back.** If a first-person record is missing, hand, wrist, forearm and upper arm may use the
  third-person mesh. Other parts are dropped. In first person only head and hair are suppressed.
- **Left and right are separate parts**, each attached at its own bone (`Right Hand`, `Left Hand`, ...). A left-side
  rigid part is the mesh with X negated.
- **The skeleton depends on sex and beast race**: male non-beast `xbase_anim.1st.nif`, female
  `base_anim_female.1st.nif`, Khajiit and Argonian `base_animkna.1st.nif`. `base_anim.nif` is the third-person
  skeleton.
- **Texture paths are corrected, not prefixed.** NIFs name `.tga`; archives hold `.dds`. `correctTexturePath` re-roots
  the path at `textures/` (or `bookart/`), swaps the extension, and probes four candidates in a fixed order. When all
  miss it returns the `.dds` name so the warning texture shows.
- **Bone lookup is case-insensitive; duplicates resolve to the first.** Text keys are lower-cased, trimmed and split on
  newlines once, at load.
- **The root node's transform is discarded** unless the node is named `bip01`.

## The port's own Morrowind-format assets (`src/assets/mw/`)

Some armour and clothing has no Morrowind record, so the port ships its own. The folder is a Data Files tree:

- `meshes/*.nif` and `textures/*.dds`: real NIF 4.0.0.2 and DDS files, read through the same readers as retail data.
  Families: steel plate and ebony plate (cuirass, pauldrons, gauntlets, greaves, boots, helm, skirt), brigandines in
  each metal, cloaks in eight colours, Breton heads and hairs, and townsfolk clothing.
- `source/`: the authoring files (`.fbx` and `.png`) they were baked from.

`systems/ownMwAssets.js` globs the tree (`import.meta.glob`, browser only; empty under node) and serves it as an
archive keyed by `ownMwDataPath` (`meshes/x.nif`). A file added in the right folder needs no other entry. The tables in
`src/characters/ownModels/` (`ownArmorModels.js`, `ownClothingModels.js`, `ownHeadModels.js`) say which Daggerfall
template and material each mesh replaces and which Morrowind part slot it fills. A player's loose file with the same
path replaces the shipped one.

The tree also holds gun meshes (`thunderlock.nif`, `pistolet*.nif`, `Pellet_Shot.fbx`), and
`ownWeaponModels.js` maps them; both belong to a feature being removed.

## Tests

`test/formats/morrowind/` runs on synthetic fixtures in `test/fixtures/mw/` (small NIF, KF, ESM, BSA and DDS files plus
rig builders). No retail Morrowind data is needed or available in CI. A change to body assembly should also be checked
in the running game with real data attached.
