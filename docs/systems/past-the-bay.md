# The map past the Iliac Bay

This page covers the land the game adds past Daggerfall's Iliac Bay: the Tamriel frame and its data, the towns and
capitals made there, and their walls and streets. None of it is in Daggerfall Unity. The Bay itself, terrain,
streaming, roads, dungeons and travel are in [world.md](world.md).

The Tamriel trace past the Bay is being remade at the Bay's resolution, on a new terrain pipeline (a baked tile
pyramid drawn at continuous levels of detail, decision 38). This page describes the code as it stands.

## Frame and data

- Frame: `src/world/tamriel/tamrielFrame.js`. One Tamriel pixel equals one Bay pixel; the Bay is offset, not scaled.
  The continent is 6000 x 3750 pixels (`tamrielSize()`). At boot `fitBayToPicture` (`tamrielLand.js`) fits the Bay to
  the player's map picture; read `tamrielFit()`, never `BAY_ORIGIN` directly.
- Authored data: `src/world/tamriel/tamrielGeography.js` holds nine provinces as hand-authored rings, plus mountain
  ranges, rivers, seas and cities. `tamrielWaters.js` holds lakes and carved rivers; `tamrielBiomes.js` the biome table.
- Player data: `src/ui/tamrielTrace.js` `preloadTamrielTrace` reads `TMAP00I0.IMG`, `TAMRIEL2.IMG` and `MAP.PAL` from
  ARENA2 and caches the trace in IndexedDB (`tamrielBootCache.js`).
- Shipped bake: `src/world/tamriel/tamrielReliefData.js`, a generated relief module written by
  `tools/bakeTamrielRelief.mjs` from `src/assets/tamriel/source/tamriel-heightmap.png`. Edit the bake, not the module.
  If it fails to load, authored heights stand. The remake replaces this pipeline.
- Runtime generation: ground (`tamrielGround.js`, `tamrielRaster.js`), relief (`tamrielRelief.js`), landforms
  (`tamrielLandforms.js`), ground dress in a worker (`groundDress*.js`), places (`src/world/tamrielPlaces.js`,
  `tamrielCountry.js`, `tamrielDungeons.js`) and roads (`src/world/tamrielRoads.js` in `tamrielRoadsWorker.js`, cached
  through `roadsCache.js`). Nothing is read from Arena's own files.
- The terrain worker streams ground past the Bay, so it can be walked. `src/systems/travel/pastBayTravel.js`
  `pastBayJourney` refuses fast travel to it; teleports and Portal Stones (`portalLandAt`) may land there.
- Without the trace (`?tamrieltrace=off` or missing files), the authored continent stands and no places appear past
  the Bay.

## Town shapes

Iliac Bay towns keep Daggerfall's grid, its own wall blocks (`WALLAA**`) and Daggerfall Unity's square town ground.
Towns past the Bay get an outline, ground shaped to it, and round walls of their own:

- `src/world/townShape.js` maps each block's AutoMap bytes to tiles (`townOccupancy`) and grows a noisy margin around the
  buildings (`townShapeField`, `TOWN_SHAPE`).
- `src/world/townOutline.js` turns the shape into outline cells (`outlineTownLocation`).
- `src/world/townWalls.js` stands walls, towers and gates on the outline (`townWall`, `wallPieces`, `gatesOnStreets`),
  using Daggerfall's wall models 444 to 446. `src/world/townGates.js` finds gates for the gate roads.
- A location made past the Bay (`isPortMadeLocation`) is stamped and flattened to its outline
  (`blendShapedTerrain`), not to Daggerfall Unity's rectangle.

## Urban fabric

`src/world/urban/` dresses towns past the Bay: a province stone set (`townLook.js` `TOWN_LOOK`), province art styles
(`urbanRecords.js`, archive 38500), and streets, yards and fences (`townFabric.js` `fabricPlan`,
`townFabricModel.js`, `townFabricStand.js`).

## Capitals

`src/world/tamrielCapitals.js` lists seven capitals: the Imperial City, Solitude, Mournhold, Alinor, Falinesti, Torval
and Helstrom. Plans are in `src/world/capitalPlans.js` and `capitalSolitude.js`; landmarks in the `capital*.js` files.
Capitals flatten through `src/world/terrain/capitalRelief.js` and `capitalSea.js`. The Imperial City is its own build
(`src/world/imperialCity.js`, `imperialBlocks.js`, `imperialFabric*.js`, `imperialPrebuild*.js`), `IMPERIAL_SPAN` 25
pixels a side.

## Tests

| Area | Test files |
| --- | --- |
| Towns | `test/world/townoutline.test.js`, `test/world/townwalls.test.js`, `test/world/urban/urban3_fabric.test.js` |
| Frame, relief, places, roads | `test/world/tamriel2.test.js`, `test/world/tamrielrelief.test.js`, `test/tesa3_provinces.test.js`, `test/tesa4_roads.test.js` |

## Traps

- The province key is spelled `Sumurset` in `urbanRecords.js`, `townLook.js` and `tamrielCapitals.js`.
