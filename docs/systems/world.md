# World

This page covers the Iliac Bay overworld: terrain and its heightmap, landforms, roads, towns and cities, dungeons,
wilderness encounters, discovery and travel. The land past the Bay is in [past-the-bay.md](past-the-bay.md).
Ships and the sea are in [naval.md](naval.md); the clock, weather and seasons are in
[time-and-weather.md](time-and-weather.md).

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
- `src/world/terrain/terrain-quad-cut.ts` decides which diagonal each mesh quad is cut on. Every reader of the drawn
  ground uses it: the index buffers, the height and normal reads, the water sheet and the placers.
- `src/world/terrain/terrainNature.js`, `floraCover.js` and `jungleNature.js` scatter plants; `src/world/ecotone.js`
  makes the seam between two pixel climates wander.

Water levels: a height at or under `SCALED_OCEAN_ELEVATION` (27.2) is a water tile; the beach band reaches 41.5.

Departure: `src/world/perlin.js` uses Ken Perlin's improved noise, not Unity's `Mathf.PerlinNoise`. Terrain samples are
therefore close to Daggerfall Unity's, not byte-equal.

Departure, as an option that stays in core (decision 103): Unity cuts every terrain quad on one fixed diagonal, (x, z)
to (x+1, z+1). The **Ground follows slopes** row (`terrainSlopeCut`, `src/systems/terrainSlopeCutRow.js`, off by
default) cuts each quad on the diagonal that its ground follows instead, so a ridge or a valley is not folded into a
row of teeth. `terrainSlopeCutOn` (`src/systems/terrainSlopeCut.js`) reads it on the enhanced skin and online only,
once as the world mounts. `TerrainGenClient` sends it to the terrain worker at init, so the drawn, walked and water
ground stay one surface. Off, every pixel of a stride draws one shared index set (`sharedTerrainIndices`); on, each
pixel builds its own. Online the room holds it: the server kit's default profile (`src/net/profile/officialProfile.ts`,
named before decision 95) pins it off, the ground that `GROUND_LAW` 3 (`src/net/wire.js`) records.

## Landforms

`src/world/landforms.js` (`createLandforms`, `landformLift`, `landformLiftField`) adds relief on top of the Daggerfall
Unity kernel. It is not a Daggerfall Unity feature. It is an option: the `landforms` Features row, on by default, held
by the room online. It is an agreed design departure (decision 39); in the Bay remake, decision 47's generated ground
replaces it over the beach knee, which is not built yet.

- It lifts only the small-heightmap term (`reliefLift`). The large-heightmap hills and ground noise keep their scale.
- It adds massifs (`src/world/peaks/massif.js`), sharp peaks (`peakField`) and snowcaps (`src/world/peaks/snowcap.js`).
- It cuts and fills roads to their grade and carves rivers.
- The lift fades to zero near the sea (`cliffFadeAt`): zero within one pixel of the coast, full three pixels inland.

Invariants:

- Landforms are a pure function of world position, `WOODS.WLD` and the road network. There is no session seed. Two
  pixels that share an edge compute the same heights there.
- At or under the beach knee (41.5) heights are Daggerfall Unity's unchanged, so coasts and water tiles do not move.
- A location of Daggerfall's own map has every ground tile of its grid stamped and its rectangle flattened to the
  pixel's mean, as in Daggerfall Unity (`setLocationTiles`, `blendLocationTerrain`).

## Streaming

- `StreamingWorldState` (`streamingWorld.js`) keeps a (2d+1)^2 grid of pixels around the player and a floating origin.
  The origin shifts by whole pixels; a vertical recentre happens past 500 units.
- The view radius is `landViewDistance` (`src/world/landView.js`): 1 to 6, default 5 (11 x 11 pixels). The classic lane
  caps at Daggerfall Unity's 4.
- Builds go nearest-first (`nearestFirstFrom`). A failed build retries on `BUILD_RETRY_MS`.
- The kernel runs in a module worker (`src/world/terrain/terrainGenWorker.js`, driven by `TerrainGenClient`);
  `?terrainthread=off` runs it on the main thread.
- Beyond the near grid, `src/world/terrain/midRingGrid.js` builds a mid ring (`MID_RADIUS` 14) and a far field
  (`FAR_RADIUS` 60) at lower resolution, streamed in bands.

## Roads

> Leaves core: the Basic Roads mod (decision 99).

The road network the player sees is Hazelnut's Basic Roads data, vendored as four 500,000-byte arrays in
`vendor/roads-hazelnut/` (`roadData`, `trackData`, `riverData`, `streamData`). Each byte is one map pixel's
8-direction compass mask.

- `src/world/roadsProducer.js` `loadModRoads` fetches the arrays at boot; `retryModRoads` retries. If they cannot load,
  `buildRoadsFromArchives` generates a different network from MAPS.BSA and `WOODS.WLD`
  (`src/world/road/roadNetwork.js` `buildRoadNetwork`: spanning tree plus A* over the heightmap). A generator failure
  returns `null` and the world draws without roads; it does not stop the boot.
- `src/world/roadsCache.js` caches generated networks in IndexedDB under `GENERATOR_VERSION`. Bump it whenever the
  generator's output changes, or players keep stale roads.
- `src/world/road/roadPainter.js` `paintRoads` is a port of Basic Roads' `PaintPath` (MIT). The rest of
  `src/world/road/` smooths kinks, blends paving, keeps flats off the road, cuts land, fords rivers, stands bridges and
  lays gate roads (`gateRoads.js` `layGateRoads`). Rivers and streams load but are off by default, as in the mod.

## Towns and cities

A location is assembled by `layoutLocation` (`src/world/locationLayout.js`), a port of Daggerfall Unity's
`DaggerfallLocation.LayoutLocation`. Each MAPS.BSA grid cell names an RMB block in BLOCKS.BSA; the block is placed at
`(x * RMB_SIDE, y * RMB_SIDE)`.

- `src/world/rmbLayout.js` `layoutRmbBlock`: one block's buildings, models and ground tilemap.
  `src/world/rmbFlats.js`: block and misc flats (billboards). Editor flats (archive 199) are kept with `editor: true`
  and not drawn. Departure: nature flats under a building's footprint are not placed.
- `src/world/staticBuildings.js`, `staticDoors.js`, `buildingNames.js`: bounds, doors, names. Interiors:
  `src/world/interior/`. `src/world/city/`: NPC walk grid (`cityNavigation.js`), gates by the clock, street lights.

### Puddle drying

> Leaves core: with the Iliac Puddle No More mod (decision 99; decision 117 (23)).

`src/world/puddleDry.js` `dryPuddles` turns a town block's one-tile puddles and shallow-water pools into the ground
around them. `src/formats/blocksFile.js` applies it to every RMB block it serves, with no setting; `readClassicBlock`
returns the block as the BSA holds it. Decision 117 (23) ties it to the Iliac Puddle No More switch, so it leaves with
that mod. That is not built yet.

### Townsfolk and town systems

The streets hold one of two populations, picked where a town is built (`src/scenes/pixelBuild.js`):

- **Living World** (`src/systems/livingWorld/`, the `living-world` Features row, on by default, each player's own
  online): named townsfolk with homes, trades and daily routines, plus caravans, road travellers and outlaws. A
  departure from Daggerfall Unity, kept for now (decision 23d). `livingWorldOn` (`livingSwitch.js`) is true only on
  the enhanced skin.
- **Classic walkers** (`src/systems/town/townPopulation.js` `TownPopulation`, `maxPopulationFor`): Daggerfall Unity's
  `PopulationManager` wanderers. The game uses them when the row is off or on the classic skin.

Beside them: guards answering threats (`src/systems/town/townWatch.js`), the town economy (`townEcon.js`), hub cities
(`src/systems/region/regionHubs.js`, `marketHubs.js`), and region flags and faction power (`regionConditions.js`,
`regionPower.js`, a port of `RegionPowerAndConditionsUpdate`).

### Town seats

> Leaves core: the town seats mod (decisions 52 and 102).

`src/systems/town/townSeats.js` `deriveTownSeats` finds the seats of rule and palaces. The `town-seats` Features row
(`townSeatsRow.js`, on by default, held by the room online) switches the system.

## Dungeons

`layoutDungeon` (`src/world/dungeon/dungeonLayout.js`, port of `DaggerfallDungeon.cs`) places RDB blocks on a grid and
calls `layoutRdbBlock` (`src/world/rdbLayout.js`) for each: models, action doors, flats, lights and markers. Only the
starting block carries start markers and the exit door (model 70300). Only dungeon-exit doors leave a dungeon.

- `src/world/actionSystem.js` `ActionSystem` runs action records (doors, movers, linked chains). Chain keys are
  namespaced per block instance, a departure from Daggerfall Unity that keeps two copies of a block apart.
- Tier: `src/systems/dungeon/dungeonTier.js` `dungeonTier` returns `regular`, `elite` or `super`. Respawn times are in
  `src/systems/dungeon/dungeonRespawn.js`; offline, nothing respawns.
- Spawned dungeons: `src/world/spawnedDungeons.js` rolls extra dungeons per map pixel from a hash and keeps a spawn
  ledger (cleared, expired, reborn). It has no Features row yet; decision 122 (7) gives it one, off by default.
- Delve aids, all overlays on the same layout: dungeon sense (`src/systems/dungeon/dungeonSense.js`), the echo book of
  movers set going (`dungeonEcho.js`), and the way-out compass (`src/systems/wayOut.js`).

### Dungeon size

`src/world/smallerDungeons.js` `dungeonSizeFor` returns `small`, `medium` or `full`. Main-story dungeons, capital
castles and super dungeons are always full. Offline the player picks: Daggerfall Unity's Smaller Dungeons setting
(`small`), the `medium-dungeons` row (`medium`, the game's own size), or the `world-dungeon-sizes` row (each dungeon at
its online size). Without any of them a dungeon is whole, as in Daggerfall Unity.

Online, each dungeon gets `onlineDungeonSize`: one seeded draw on its map id, weighted small 1, medium 2, whole 5
(`ONLINE_DUNGEON_SIZES`), the same on every client and every visit (decision 16). A quest's dungeon is the exception:
online its markers are chosen on the whole dungeon, so `smallerDungeonsStateNow` stamps the quest `Disabled` (whole).

### Dungeon campfire

`src/world/dungeon/dungeonFires.js` `dungeonFirePlan` stands one permanent campfire at a dungeon's entrance, a rest
point and a hearth; a palace gets none. The plan is pure over the layout, so every client stands the same fire. The
`dungeon-fires` row (`src/systems/dungeonFiresRow.js`, on by default, held by the room online) switches it; off is
Daggerfall Unity's dungeon with no fire. A small departure, cut to one entrance fire by decision 17a.

### Super dungeons

A super dungeon (shown to players as an Abyss Dungeon) exists online only. The relay rules its lifecycle
(`src/net/superDungeon/sdLaw.js`). `src/systems/superDungeon/sdSite.js` picks a pixel near a great city and clones a
large real dungeon as its template; its rift leads to a made realm (`src/world/superDungeon/sdRealm.js`). `sdOmen.js`,
`sdSlots.js`, `sdSpoils.js` and `sdScore.js` (music, not points) hold the rest.

## Wilderness camps

A departure, kept and made rarer by decision 15. `src/systems/campEncounters.js` adds a second roll beside Daggerfall
Unity's lone wanderers (`src/systems/encounters.js`): each chunk entered has a `CAMP_CHANCE_ON_CHUNK_LOAD` (12.5%)
chance to stand one group of two to four foes from the same encounter table, a camp or a pack. One member that notices
the player wakes the rest. The `wilderness-camps` row (on by default, held by the room online) switches it.

## Discovery

- `src/systems/discovery.js` records what the player has found: `discoverLocation`, `discoverBuilding`,
  `discoveryKeyOf`. Bay places are keyed by the low 20 bits of the map id; made places
  (`src/world/placeIds.js` `isMadePlaceId`) by the whole id.
- `src/world/locationKey.js` `locationKeyOf` builds the map-table key (temples, shops, guild halls) that "Where is" talk
  reads.

## Travel

`src/systems/travel/travel.js` ports Daggerfall Unity's travel maths:

- `calculateTravelTime` walks the pixels between two points and prices each one. Transport modifiers: horse 128, cart
  192, on foot 256. Reckless travel halves the minutes.
- `calculateTripCost`: inns cost per day; ship fares cost per ocean pixel.
- `arrivalClampMinutes` moves an arrival to dusk or morning (offline only).
- `src/ui/travel/travelPopUp.js` performs the trip, mirroring `DaggerfallTravelPopUp.performFastTravel`, with guild
  temple blessings applied. Arrival stands the player at the location's edge or start marker
  (`src/world/locationEntrance.js`).

Walked travel (autopilot) is the port's own: `travelRoute.js` `planRoute` (costs road 1, track 1.6, open 3.5),
`travelAutopilot.js`, `travelSteer.js`, `travelPace.js`, `travelPathMode.js`, road threats in `travelThreat.js` and
`travelBands.js`, and the hand-off to ships in `travelPorts.js` (see [naval.md](naval.md)).

Map: `src/systems/map/mapTabs.js` (automap, town, world sheets), `mapWaypoints.js` (personal, party, guild
waypoints); the surface is `src/ui/heldMap.js`. Horse and wagon: `src/systems/horse/horseCart.js` runs them,
`horseCartLaw.js` holds the modes; `src/systems/wagon/` holds wagon kinds, seats, ropes, looks and upkeep.

### Immersive Travel

> Leaves core: the Immersive Travel mod (decision 99).

`src/systems/immersiveTravel.js` ports the Immersive Travel 1.5 mod (`vendor/immersive-travel/`): carriages and
drivers outside walled cities, and sailor services.

## Tests

| Area | Test files |
| --- | --- |
| Terrain and streaming | `test/world/terrain/terrain.test.js`, `test/world/terrain/terrainworker.test.js`, `test/world/streaming.test.js` |
| Landforms | `test/world/terrain/landform6.test.js`, `test/world/terrain/auditlandforms.test.js`, `test/world/peaks2_massif.test.js` |
| Roads | `test/world/road/roads.test.js`, `test/world/road/roadsReal.test.js`, `test/world/gateroads.test.js` |
| Towns | `test/world/puddledry.test.js`, `test/systems/livingWorld/` |
| Dungeons | `test/world/dungeon.test.js`, `test/world/action.test.js`, `test/world/spawneddungeons.test.js`, `test/systems/ft1_smallerdungeons.test.js`, `test/systems/survival/rest3_dungeonfires.test.js` |
| Delve, super dungeons | `test/systems/sense1_dungeonsense.test.js`, `test/systems/echo1_dungeonecho.test.js`, `test/systems/superDungeon/sd2_sdsite.test.js` |
| Camps | `test/systems/camp1_groups.test.js`, `test/systems/camproll.test.js` |
| Discovery, travel | `test/systems/audit26_discovery.test.js`, `test/systems/audit64_travel.test.js`, `test/ui/heldmap.test.js` |

Tests that read the map need ARENA2: run `sh tools/fetch-data.sh` and set `ARENA2_PATH`.

## Traps

- Terrain must stay a pure function of position. Any per-session or per-pixel randomness makes two neighbouring
  pixels disagree on their shared edge and opens seams.
- The generated road network differs from Basic Roads. A failed vendor fetch changes the roads with no error, and once
  Basic Roads leaves core, the generated network is what a game without the mod draws.
- Changing the town flatten or the beach knee moves coasts and building plinths everywhere.
- A dungeon's size online comes from `onlineDungeonSize`, not from `smallerDungeonsStateNow`. The second one is the
  quest stamp only.
