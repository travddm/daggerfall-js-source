# Formats

Data files the game reads (Daggerfall's ARENA2, Morrowind, Daggerfall Unity mods), the readers that parse them, and
how player-visible text is localized.

- [arena2-data.md](arena2-data.md) - where ARENA2 bytes come from: the data gate, IndexedDB stores, the ingest filter,
  the dev server, real-data tests.
- [arena2-readers.md](arena2-readers.md) - each ARENA2 file, its reader in `src/formats/`, its DFU source, and the
  layout facts and traps.
- [world-data.md](world-data.md) - the world-data door, and how mod locations, blocks and buildings ship as edits
  rebuilt from the player's own data.
- [morrowind.md](morrowind.md) - the optional Morrowind 3D body layer: attaching data, the readers, the rules, and the
  port's own Morrowind-format assets.
- [mods-and-vendor.md](mods-and-vendor.md) - what `vendor/` holds, mod switches, a player's own `.dfmod` bundles, and
  how Daggerfall Unity is used as the reference.
- [localization.md](localization.md) - the text core, `t()`, the `locales/` tree, and the translation tools.
