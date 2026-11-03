# Tools nobody else names

Most of `tools/` is reached from `package.json`, a workflow, a doc or another tool. This page lists the hand-run
tools that none of those name. Each is run by a person, and its header comment holds the usage.

The browser probes (`tools/*Probe.mjs`) are covered by [../testing/probes.md](../testing/probes.md). The probe suite,
the balance harness and the CI runner live in `tools/probes/`, `tools/balance/` and `tools/ci-runner/`.

## Data from ARENA2, Daggerfall Unity or a mod

| Tool                                                     | What it does                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract-enemy-basics.mjs`, `extractEnemyBasics.lib.mjs` | Regenerates `src/characters/enemy/enemyBasics.js` from DFU's `EnemyBasics.cs`. The library half is the code a test re-runs.                                                           |
| `roadsOracle.py`, `roadsJoins.py`                        | Transliterate Hazelnut's `BasicRoadsTexturing.cs`: the oracle emits the tilemaps that `test/world/road/roadsParity.test.js` compares; the joins script generates the join statements. |
| `rscTableDiff.mjs`                                       | Lists the records where DFU's internal text table differs from the player's `TEXT.RSC`.                                                                                               |
| `rmbrpHills.mjs`                                         | Measures the RMB resource pack's hills; the result is `src/world/rmbrpHillShapes.js`.                                                                                                 |
| `raidTowns.mjs`                                          | Prints the towns-table hash that `RAID_TOWNS_SHA256` in `server/wrangler.toml` pins.                                                                                                  |
| `classSkinsListing.mjs`                                  | Writes the listing that `test/tooling/doctrine.test.js` holds `vendor/class-skins/` to.                                                                                               |
| `layered-armor/listing.mjs`                              | Writes the listing that the same test holds `vendor/layered-armor/` to. Run it after every rebuild of the art.                                                                        |
| `eotbIl.mjs`, `ilDump.py`                                | Pull the Eye of the Beholder assembly out of its `.dfmod` and dump its CIL.                                                                                                           |
| `dxbcGlsl.py`                                            | Reads a Unity bundle's compiled shaders back as GLSL.                                                                                                                                 |
| `worldTooltipsAssets.mjs`, `readiedHandsAssets.mjs`      | Pull a mod's own source out of its `.dfmod` bundle.                                                                                                                                   |

## Art and asset builders

| Tool                                                            | What it does                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `layered-armor/build_strips.py`, `layered-armor/build_cloak.py` | Build the layered-armor strips and the cloak layer in `vendor/layered-armor/` from the artist's packages. |
| `skin/`                                                         | The baked skin pipeline; see `skin/README.md`.                                                            |
| `parity/`                                                       | The differential parity harness against DFU's reader classes; see `parity/README.md`.                     |
| `neutral/`                                                      | The standalone orbit viewer for the neutral paperdoll body; see `neutral/README.md`.                      |
| `villagerSheet.mjs`, `villagerDesignSheet.mjs`                  | Contact sheets of the villager archives and the villager designs, drawn from ARENA2.                      |
| `bodyMotionSheet.mjs`                                           | Contact sheets of the body-motion layer's poses, drawn as skeletons.                                      |

## Measurements

| Tool                                | What it does                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `landsMeasure.mjs`                  | Measures the forest field behind the Tamriel lands table.                          |
| `jungleExtent.mjs`                  | Counts the map pixels, regions and towns the jungle area covers.                   |
| `pixelBuildSweep.mjs`               | Runs the world host's pixel build over the map to find builds that throw.          |
| `csaBench.mjs`, `hubShardBench.mjs` | Time the Come Sail Away pool and the hub's shards without a renderer or a network. |
| `frameAb.mjs`, `travelViewPerf.mjs` | Compare two frame-probe runs; time the overworld view's frame.                     |
