# World

This page covers the overworld: terrain and its heightmap, landforms, roads, towns and cities, dungeons, places of
interest, travel, and the map past the Iliac Bay. Ships and the sea are in [naval.md](naval.md); the clock, weather and
seasons are in [time-and-weather.md](time-and-weather.md).

## Units and frames

| Quantity | Value | Where |
| --- | --- | --- |
| Map | 1000 x 500 map pixels | `MAX_MAP_PIXEL_X/Y` in `src/world/streamingWorld.js` |
| Map pixel | 819.2 world units (32768 x `GLOBAL_SCALE` 0.025) | `TERRAIN_SIZE` in `src/world/terrain/terrainSampler.js` |
| Heightmap per pixel | 129 x 129 samples (128 cells, about 6.4 units each) | `HEIGHTMAP_DIMENSION` |
| Ground tiles per pixel | 128 x 128 | `src/world/terrain/terrainTiles.js` |
| RMB block (town) | 102.4 units | `RMB_SIDE` in `src/world/locationLayout.js` |
| RDB block (dungeon) | 51.2 units | `RDB_SIDE` in `src/world/dungeon/dungeonLayout.js` |

`worldCoordToMapPixel` and `mapPixelToWorldCoords` (`streamingWorld.js`) convert; map Y is flipped against world Z.

## Terrain and heightmap

Heights come from Daggerfall's `WOODS.WLD` (a 1000 x 500 byte heightmap plus a small large-scale map), read by
`src/formats/woodsFile.js`. Per-pixel climate comes from `CLIMATE.PAK` through `src/formats/mapsFile.js`. The game reads
both from the player's ARENA2 folder; nothing of it ships in the repository.

- `src/world/terrain/terrainSampler.js` is a port of Daggerfall Unity's `DefaultTerrainSampler`: a bicubic 4 x 4 base,
  9 x 9 feature noise, and a sea floor. `sampleKernel` and `generateSamples` produce the grid. Samples are
  `clamp01(h / 1539)`; world height is `sample * 1539 * 1.25` (`STREAMING_TERRAIN_SCALE`, the value of the Daggerfall
  Unity game scene, not the prefab's 1.5).
- `src/world/terrain/terrainGen.js` `generatePixelTerrain` builds one pixel: samples, landforms, water beds
  (`gridBed`), roads, location flattening and tiles.
- `src/world/terrain/terrainTiles.js` classifies ground tiles (`generateTileData`: water, dirt, grass, stone), runs the
  marching-squares `assignTiles`, and flattens locations (`blendLocationTerrain`, `calcAvgMaxHeight`,
  `setLocationTiles`). These are ports of Daggerfall Unity's `TerrainHelper`.
- `src/world/terrain/terrainSurface.js` builds the mesh and answers ground queries (`surfaceHeightAt`, `walkGroundAt`).
- `src/world/terrain/terrainNature.js`, `floraCover.js` and `jungleNature.js` scatter plants; `src/world/ecotone.js`
  makes the seam between two pixel climates wander.

Water levels: a height at or under `SCALED_OCEAN_ELEVATION` (27.2) is a water tile; the beach band reaches 41.5.

Departure: `src/world/perlin.js` uses Ken Perlin's improved noise, not Unity's `Mathf.PerlinNoise`. Terrain samples are
therefore close to Daggerfall Unity's, not byte-equal.

## Landforms

`src/world/landforms.js` (`createLandforms`, `landformLift`, `landformLiftField`) adds relief on top of the Daggerfall
Unity kernel. It is not a Daggerfall Unity feature.

- It lifts only the small-heightmap term (`reliefLift`). The large-heightmap hills and ground noise keep their scale.
- It adds massifs (`src/world/peaks/massif.js`), sharp peaks (`peakField`) and snowcaps (`src/world/peaks/snowcap.js`).
- It cuts and fills roads to their grade and carves rivers.
- The lift fades to zero near the sea (`cliffFadeAt`): zero within one pixel of the coast, full three pixels inland.

Invariants:

- Landforms are a pure function of world position, `WOODS.WLD` and the road network. There is no session seed. Two
  pixels that share an edge compute the same heights there.
- At or under the beach knee (41.5) heights are Daggerfall Unity's unchanged, so coasts and water tiles do not move.
- A location's rectangle is flattened to the pixel's mean (`blendLocationTerrain`). Capitals flatten through
  `src/world/terrain/capitalRelief.js` and `capitalSea.js`.

## Streaming

- `StreamingWorldState` (`streamingWorld.js`) keeps a (2d+1)^2 grid of pixels around the player and a floating origin.
  The origin shifts by whole pixels; a vertical recentre happens past 500 units.
- The view radius is `landViewDistance` (`src/world/landView.js`): 1 to 6, default 5 (11 x 11 pixels). The classic lane
  caps at Daggerfall Unity's 4.
- Builds go nearest-first (`nearestFirstFrom`). A failed build retries on `BUILD_RETRY_MS`.
- The kernel runs in a module worker: `src/world/terrain/terrainGenWorker.js`, driven by `TerrainGenClient` in
  `terrainGenClient.js`. `?terrainthread=off` runs the same kernel on the main thread. Results come back as transferred
  typed arrays (`src/world/terrain/natureWire.js` packs nature).
- Beyond the near grid, `src/world/terrain/midRingGrid.js` builds a mid ring (`MID_RADIUS` 14) and a far field
  (`FAR_RADIUS` 60) at lower resolution, streamed in bands.

## Roads

The road network the player sees is Hazelnut's Basic Roads data, vendored as four 500,000-byte arrays in
`vendor/roads-hazelnut/` (`roadData`, `trackData`, `riverData`, `streamData`). Each byte is one map pixel's
8-direction compass mask.

- `src/world/roadsProducer.js` `loadModRoads` fetches the arrays at boot; `retryModRoads` retries. If they cannot load,
  `buildRoadsFromArchives` generates a different network from MAPS.BSA and `WOODS.WLD`
  (`src/world/road/roadNetwork.js` `buildRoadNetwork`: spanning tree plus A* over the heightmap). A generator failure
  returns `null` and the world draws without roads; it does not stop the boot.
- `src/world/roadsCache.js` caches generated networks in IndexedDB under `GENERATOR_VERSION`. Bump it whenever the
  generator's output changes, or players keep stale roads.
- `src/world/road/roadPainter.js` `paintRoads` is a port of Basic Roads' `PaintPath` (MIT). `roadCurves.js` smooths the
  45 and 90 degree kinks, `roadEdge.js` blends paving into the ground, `roadVerge.js` and `roadClearance.js` keep trees
  and props off the road, `roadLand.js` cuts land along routes and fords rivers.
- Bridges: `src/world/road/roadBridges.js` and `bridgeModels.js`. Gate roads: `src/world/road/gateRoads.js`
  `layGateRoads` runs a road from each town gate to the network.
- Rivers and streams load but are off by default, as in the mod.

## Towns and cities

A location is assembled by `layoutLocation` (`src/world/locationLayout.js`), a port of Daggerfall Unity's
`DaggerfallLocation.LayoutLocation`. Each MAPS.BSA grid cell names an RMB block in BLOCKS.BSA; the block is placed at
`(x * RMB_SIDE, y * RMB_SIDE)`.

- `src/world/rmbLayout.js` `layoutRmbBlock`: one block's buildings, models and ground tilemap.
  `src/world/rmbFlats.js`: block and misc flats (billboards). Editor flats (archive 199) are kept with `editor: true`
  and not drawn. Departure: nature flats under a building's footprint are not placed.
- `src/world/staticBuildings.js`, `staticDoors.js`, `buildingNames.js`: bounds, doors, names. Interiors:
  `src/world/interior/`. `src/world/city/`: NPC walk grid (`cityNavigation.js`), gates by the clock, street lights.

### Town shapes

Iliac Bay towns keep Daggerfall's grid and its own wall blocks (`WALLAA**`). Towns past the Bay get an outline and
round walls of their own:

- `src/world/townShape.js` maps each block's AutoMap bytes to tiles (`townOccupancy`) and grows a noisy margin around the
  buildings (`townShapeField`, `TOWN_SHAPE`).
- `src/world/townOutline.js` turns the shape into outline cells (`outlineTownLocation`).
- `src/world/townWalls.js` stands walls, towers and gates on the outline (`townWall`, `wallPieces`, `gatesOnStreets`),
  using Daggerfall's wall models 444 to 446. `src/world/townGates.js` finds gates for the gate roads.

### Urban fabric

`src/world/urban/` dresses towns past the Bay: a province stone set (`townLook.js` `TOWN_LOOK`), province art styles
(`urbanRecords.js`, archive 38500), and streets, yards and fences (`townFabric.js` `fabricPlan`,
`townFabricModel.js`, `townFabricStand.js`). None of this is in Daggerfall Unity.

### Capitals

`src/world/tamrielCapitals.js` lists seven capitals: the Imperial City, Solitude, Mournhold, Alinor, Falinesti, Torval
and Helstrom. Plans are in `src/world/capitalPlans.js` and `capitalSolitude.js`; landmarks in the `capital*.js` files.
The Imperial City is its own build (`src/world/imperialCity.js`, `imperialBlocks.js`, `imperialFabric*.js`,
`imperialPrebuild*.js`), `IMPERIAL_SPAN` 25 pixels a side.

### Town and region systems

| File | Role |
| --- | --- |
| `src/systems/town/townPopulation.js` | Wandering townsfolk (`TownPopulation`, `maxPopulationFor`) |
| `src/systems/town/townWatch.js` | Guards answering threats (`createTownWatch`) |
| `src/systems/town/townEcon.js` | Town economy (`createTownEcon`) |
| `src/systems/town/townSeats.js` | Seats of rule and palaces (`deriveTownSeats`) |
| `src/systems/region/regionHubs.js`, `marketHubs.js` | Hub cities per region and province |
| `src/systems/region/regionConditions.js`, `regionPower.js` | Region flags and faction power, port of `RegionPowerAndConditionsUpdate` |

Trap: the province key is spelled `Sumurset` in `urbanRecords.js`, `townLook.js` and `tamrielCapitals.js`.

## Dungeons

`layoutDungeon` (`src/world/dungeon/dungeonLayout.js`, port of `DaggerfallDungeon.cs`) places RDB blocks on a grid and
calls `layoutRdbBlock` (`src/world/rdbLayout.js`) for each: models, action doors, flats, lights and markers. Only the
starting block carries start markers and the exit door (model 70300). Only dungeon-exit doors leave a dungeon.

- `src/world/actionSystem.js` `ActionSystem` runs action records (doors, movers, linked chains). Chain keys are
  namespaced per block instance, a departure from Daggerfall Unity that keeps two copies of a block apart.
- Size: `src/world/smallerDungeons.js` `dungeonSizeFor` returns `small`, `medium` or `full`. Main-story dungeons,
  capital castles and super dungeons are always full. `medium` is the port's own size.
- Tier: `src/systems/dungeon/dungeonTier.js` `dungeonTier` returns `regular`, `elite` or `super`. Respawn times are in
  `src/systems/dungeon/dungeonRespawn.js`; offline, nothing respawns.
- Spawned dungeons: `src/world/spawnedDungeons.js` rolls extra dungeons per map pixel from a hash and keeps a spawn
  ledger (cleared, expired, reborn).
- Delve aids, all overlays on the same layout: dungeon sense (`src/systems/dungeon/dungeonSense.js`), the echo book of
  movers set going (`dungeonEcho.js`), and the way-out compass (`src/systems/wayOut.js`).

### Super dungeons

A super dungeon (shown to players as an Abyss Dungeon) exists online only. The relay rules its lifecycle
(`src/net/superDungeon/sdLaw.js`: gone, risen, found, fell). `src/systems/superDungeon/sdSite.js` picks a pixel near a
great city and clones a large real dungeon as its template. Its rift leads to a made realm
(`src/world/superDungeon/sdRealm.js`). `sdOmen.js` places the beacon and compass marks; `sdSlots.js` limits each
account to one life per slot; `sdSpoils.js` rolls rewards. `sdScore.js` is music, not points.

## Places of interest and discovery

- `src/systems/discovery.js` records what the player has found: `discoverLocation`, `discoverBuilding`,
  `discoveryKeyOf`. Bay places are keyed by the low 20 bits of the map id; made places
  (`src/world/placeIds.js` `isMadePlaceId`) by the whole id.
- `src/world/locationKey.js` `locationKeyOf` builds the map-table key (temples, shops, guild halls) that "Where is" talk
  reads.
- Editor-placed POIs are a separate system in `src/poi/` (`poiLaw.js`, `poiRuntime.js`, `poiService.js`), approved by
  the realm and drawn with a map marker.

## Travel

`src/systems/travel/travel.js` ports Daggerfall Unity's travel maths:

- `calculateTravelTime` walks the pixels between two points and prices each one. Transport modifiers: horse 128, cart
  192, on foot 256. Reckless travel halves the minutes.
- `calculateTripCost`: inns cost per day; ship fares cost per ocean pixel.
- `arrivalClampMinutes` moves an arrival to dusk or morning (offline only).
- `src/ui/travel/travelPopUp.js` performs the trip, mirroring `DaggerfallTravelPopUp.performFastTravel`, with guild
  temple blessings applied. Arrival stands the player at the location's edge or start marker
  (`src/world/locationEntrance.js`).

Walked travel (autopilot) is the port's own: `travelRoute.js` `planRoute` (costs road 1, track 1.6, open 3.5, capped by
`ROUTE_MAX_EXPANSIONS`), `travelAutopilot.js`, `travelSteer.js`, `travelPace.js` (speed steps and caps),
`travelPathMode.js` (`roads` or `free`). `travelThreat.js` and `travelBands.js` pace road threats. `travelPorts.js`
hands off to ships (see [naval.md](naval.md)). `src/systems/immersiveTravel.js` ports the Immersive Travel mod's
carriage and sailor services.

Map: `src/systems/map/mapTabs.js` (automap, town, world sheets), `mapWaypoints.js` (personal, party, guild
waypoints); the surface is `src/ui/heldMap.js`. Horse and wagon: `src/systems/horse/horseCart.js` runs them,
`horseCartLaw.js` holds the modes; `src/systems/wagon/` holds wagon kinds, seats, ropes, looks and upkeep.

## The map past the Iliac Bay

The Tamriel trace past the Bay is being remade. This section describes the code as it stands.

- Frame: `src/world/tamriel/tamrielFrame.js`. One Tamriel pixel equals one Bay pixel; the Bay is offset, not scaled.
  The continent is 6000 x 3750 pixels (`tamrielSize()`). At boot `fitBayToPicture` (`tamrielLand.js`) fits the Bay to
  the player's map picture; read `tamrielFit()`, never `BAY_ORIGIN` directly.
- Authored data: `src/world/tamriel/tamrielGeography.js` holds nine provinces as hand-authored rings, plus mountain
  ranges, rivers, seas and cities. `tamrielWaters.js` holds lakes and carved rivers; `tamrielBiomes.js` the biome table.
- Player data: `src/ui/tamrielTrace.js` `preloadTamrielTrace` reads `TMAP00I0.IMG`, `TAMRIEL2.IMG` and `MAP.PAL` from
  ARENA2 and caches the trace in IndexedDB (`tamrielBootCache.js`).
- Shipped bake: `src/world/tamriel/tamrielReliefData.js`, a generated relief module written by
  `tools/bakeTamrielRelief.mjs` from `src/assets/tamriel/source/tamriel-heightmap.png`. Edit the bake, not the module.
  If it fails to load, authored heights stand.
- Runtime generation: ground (`tamrielGround.js`, `tamrielRaster.js`), relief (`tamrielRelief.js`), landforms
  (`tamrielLandforms.js`), ground dress in a worker (`groundDress*.js`), places (`src/world/tamrielPlaces.js`,
  `tamrielCountry.js`, `tamrielDungeons.js`) and roads (`src/world/tamrielRoads.js` in `tamrielRoadsWorker.js`, cached
  through `roadsCache.js`). Nothing is read from Arena's own files.
- The terrain worker streams ground past the Bay, so it can be walked. `src/systems/travel/pastBayTravel.js`
  `pastBayJourney` refuses fast travel to it; teleports and Portal Stones
  (`portalLandAt`) may land there.
- Without the trace (`?tamrieltrace=off` or missing files), the authored continent stands and no places appear past
  the Bay.

## Tests

| Area | Test files |
| --- | --- |
| Terrain and streaming | `test/world/terrain/terrain.test.js`, `test/world/terrain/terrainworker.test.js`, `test/world/streaming.test.js` |
| Landforms | `test/world/terrain/landform6.test.js`, `test/world/terrain/auditlandforms.test.js`, `test/world/peaks2_massif.test.js` |
| Roads | `test/world/road/roads.test.js`, `test/world/road/roadsReal.test.js`, `test/world/gateroads.test.js` |
| Towns | `test/world/townoutline.test.js`, `test/world/townwalls.test.js`, `test/world/urban/urban3_fabric.test.js` |
| Dungeons | `test/world/dungeon.test.js`, `test/world/action.test.js`, `test/world/spawneddungeons.test.js`, `test/systems/ft1_smallerdungeons.test.js` |
| Delve, super dungeons | `test/systems/sense1_dungeonsense.test.js`, `test/systems/echo1_dungeonecho.test.js`, `test/systems/superDungeon/sd2_sdsite.test.js` |
| Discovery, travel | `test/systems/audit26_discovery.test.js`, `test/systems/audit64_travel.test.js`, `test/ui/heldmap.test.js` |
| Past the Bay | `test/world/tamriel2.test.js`, `test/world/tamrielrelief.test.js`, `test/tesa3_provinces.test.js`, `test/tesa4_roads.test.js` |

Tests that read the map need ARENA2: run `sh tools/fetch-data.sh` and set `ARENA2_PATH`.

## Traps

- Terrain must stay a pure function of position. Any per-session or per-pixel randomness makes two neighbouring
  pixels disagree on their shared edge and opens seams.
- The generated road network differs from Basic Roads. A failed vendor fetch silently changes the roads.
- Changing the town flatten or the beach knee moves coasts and building plinths everywhere.
- `smallerDungeonsStateNow` returns `Disabled` online, whatever nearby comments say.
