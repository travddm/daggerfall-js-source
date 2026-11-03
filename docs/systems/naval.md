# Naval and sailing

This page covers the player's boats and how they sail, the sea fight (gunnery, damage, boarding, rams, AI ships),
crews and captains, harbours, shipyards and passage, sea trade, the Eltheric Ocean, and how ships are shared online.
Daggerfall has no sea fight and Daggerfall Unity has none either: everything here except the boats themselves is this
project's own design.

## Building blocks

| Layer | What it is | Where |
| --- | --- | --- |
| Boats | Port of the **Come Sail Away 2.1** mod (RedRoryOTheGlen): boats as items, placing, oars, sails, waves, cargo, the position map | `src/systems/comeSailAway/`, `src/scenes/comeSailAway/`, `vendor/come-sail-away/` |
| Responsive helm | How a hull gathers way and answers the helm, for the player and the AI | `src/systems/helmWay.js` |
| Sea fight | Ships, guns, damage, AI captains, boarding, law, plunder | `src/systems/naval/` (pure), `src/scenes/naval/` (host) |
| Pirate quests | Port of **Warm Ashes - Ships 1.1** (Kamer): ship encounters on sea travel and the pirate quest | `src/systems/warmAshesShips.js`, `src/systems/seaRaiders.js` |
| Swimming | Port of **Iliac Puddle No More** (jet082): its player API lets a boat suppress the outdoor swim | `src/systems/deepWater/`, `vendor/iliac-puddle-no-more/` |
| Eltheric Ocean | A procedural sea past "the Veil", with its own events and vaults | `src/systems/naval/etherCrossing.js`, `etherShips.js`, `src/systems/sea/`, `src/world/ethericSea.js` |

Almost every module under `src/systems/naval/` is pure: the host passes positions, a water test, the wind and the
clock, and gets numbers or events back. Keep it that way; the tests depend on it.

## Hosts and switches

- **Come Sail Away runtime**: `createComeSailAwayRuntime` in `src/systems/comeSailAway/comeSailAway.js`, built by
  `src/scenes/world.js` when the mod is on (`csaOn()`). It owns the boats (`AllBoats`), placing, the helm and sailing,
  and saves under the per-mod vendor `come-sail-away` (`COME_SAIL_AWAY_VENDOR`).
- **Naval host**: `createNavalHost` in `src/scenes/naval/navalHost.js`, built by `src/scenes/world.js`. It stands the
  sea's ships, runs the director, captains, guns and boarding each exterior frame, and draws through
  `src/render/navalRender.js`. The other files in `src/scenes/naval/` are modules it wires (rams, flames, crew, passage,
  fishing fleet). New behaviour goes into such a module, not into `createNavalHost` or
  `createComeSailAwayRuntime` themselves.
- **Only the streaming world has a sea.** Interiors and dungeons (`src/scenes/worldModes.js`,
  `src/scenes/dungeonContext.js`) have none, and every transition, teleport and load empties the sea. The `?exterior`
  bench (`src/scenes/exterior.js`) has no Come Sail Away runtime and therefore no sea fight.
- **Feature switches** (`src/systems/features.js`, row `naval-combat`): `naval` (on; forced on online) plus the drawer
  prefs `naval-ships` (few/some/many), `naval-boarders`, `naval-raid-prize`, `naval-aim-camera`, `naval-handling`
  (`responsive` or `classic`) and `naval-auto-repair`. `navalOn()` in `world.js` needs both the Come Sail Away runtime
  and the `naval` pref. With Come Sail Away off there is no sea fight.

## Boats and sailing (Come Sail Away)

- Five hulls (`HULL` in `src/systems/naval/navalShips.js`): Rowboat 0, Large Boat 1, Small Ship 2 (the galleon),
  Large Galley 3, Carrack 4. The hull table (names, prices, weights) is the leaf `comeSailAwayHulls.js`, so the account
  service's item law can read it without loading renderer code.
- Boats are items: parts (template 1320) and deed (1321), defined in `comeSailAwayItems.js`. `comeSailAwayBoat.js`
  builds a boat, `comeSailAwayModels.js` reads the meshes that `tools/comeSailAwayExtract.mjs` extracted, and
  `src/world/unityAnimator.js` replays the mod's Unity Animator clips (sails, oars, rudder).
- Three hulls (1, 2, 4) are the project's own models. If a model fails to load, the mod's own prefab stands in, and
  `navalShips.js` switches that hull to the mod's build (`MOD_BUILDS`, `setShipStanding`, `hullBuild`). Gun counts and
  colliders differ between the two builds, so always read a hull through `hullBuild`.
- `comeSailAwayWaves.js` is the wave mesh. `csaBoatMenu.js` is the boat's verb menu. `peaceWay.js` gives a boat
  `PEACE_WAY` (1.15x) speed when no fight is near.
- `src/systems/helmWay.js` is the responsive helm (the default); `classic` keeps the mod's handling. The AI captains
  use the same steerage curve.

### Two winds (trap)

Sailing does not read `src/systems/wind/`. The boats use Come Sail Away's own wind (`UpdateWind` in
`comeSailAway.js`: a strength from the weather type, a direction from the hour and the map row, none indoors). The naval
host reads that same vector (`windVectorCurrent`). `src/systems/wind/wind.js` (`createWindModel`) and `windDrive.js`
are the enhanced sky's wind for clouds, grass, flora sway and rain; `windAudio.js` is its sound. A change to one does
not move the other. `csaLoadWind.js` makes sure a load that lands outdoors never keeps the indoor zero wind.

## The sea fight

### Ships and classes

`src/systems/naval/navalShips.js` holds the guns (`GUNS`: long, swivel, heavy, chain, barrel), the per-hull builds
(`HULL_BUILDS`: muzzles, hit boxes, rig boxes, deck height), the factions (`NAVAL_FACTIONS`: pirate, merchant, navy),
the three crowns (`CROWNS`: Daggerfall, Wayrest, Sentinel) and `SHIP_CLASSES`. The classes are nine drawn by level
and weight (`classFor`), six Eltheric legends and two fishing boats. Legends and fishers have `minLevel` set to
`LEGEND_LEVEL` so no level draw finds them; they are launched by id.
Hull and sail points scale by `SHIP_TOUGHNESS`; the player's crew losses scale by `PLAYER_CREW_TOUGHNESS`.

### Gunnery and ballistics

- `navalGunnery.js`: the look's bearing picks a battery (`sideForBearing`), `aimSolution` lays it, `volleyLaunches`
  scatters the balls from a seed and the crew's skill, `reloadSeconds` scales by crew left. Load groups are broadside,
  bow and stern.
- `navalBallistics.js`: closed-form flight (`p(t) = p0 + v0 t - g t^2 / 2`), no integration. A volley is fully
  reproducible from `(seed, skill)`, which is how peers fly the same balls without sending them.
- `shotKinds.js`: round, grape, chain and heated shot, each a factor over the gun's own numbers (`shotGun`).
- `navalShots.js`: balls in flight, fire barrels and floating casks, reported as events. `galleonGunDeck.js` animates
  gunport shutters. `navalEffects.js` is smoke and spray as numbers; `navalSounds.js` registers the clips that
  `tools/navalSfx.mjs` synthesises.

### Damage

`navalDamage.js`: a ship is three numbers, hull, sails and crew (`createShipDamage`). Hits near the waterline do more
(`HOLED_BONUS`); rig hits tear canvas; hull hits may start fires (`FIRE_CHANCE`, up to `FIRE_STACK`). States are
`SHIP_STATES`: afloat, struck, sinking, sunk, prize, wrecked. An AI ship strikes her colours at `STRUCK_AT` of her hull
and can then be boarded. **The player's boat never sinks**: at zero it is wrecked (no sail, slow oars, silent guns)
until repaired. Repairs: `navalYard.js` (shipwright prices, crew mending at sea) and `navalStores.js` (timber, pitch,
canvas as cargo).

### Rams

`navalRam.js` is bounded: a ram deals a share of the lesser hull (`RAM_SHARE`, `GALLEY_SHARE` for a galley's ram),
scaled by closing speed and the face struck, and never takes a ship below her strike line (`ramLine`). The rammer
takes recoil and can never ram herself to her own strike (`ramPaid`). `src/scenes/naval/navalRams.js` detects the
contacts.

### AI captains and traffic

- `navalAI.js`: sailing by the wind (`windFactor`, tacking, no point higher than close-hauled), steering off land and
  other hulls, fighting by class tactic (broadside or a galley's bow guns), fleeing, boarding. Modes on the wire:
  `cruise`, `engage`, `board`, `flee`, `answer`, `struck`, `prize`, `boarded`.
- `navalDirector.js`: spawns ships out of sight on a ring around players on the water, despawns them far away,
  picks the faction by waters and notoriety (navy hunters). Spawn seeds are `hash32(seedBase, count)`, so the same
  waters on the same day send the same ships.
- `shipLife.js`: harbours found from the terrain (`findHarbour`; there is no dock data), a bounded A* over water,
  and errands (moored, depart, voyage, arrive, patrol, lurk) drawn from the ship's seed. `seaLanes.js` and
  `src/scenes/naval/worldLanes.js` run packet ships between ports. `fishingBoats.js` and
  `src/scenes/naval/fishingFleet.js` stand each port's fishing boats.
- `navalRaiders.js` turns Warm Ashes' seeded overworld raiders (`src/systems/seaRaiders.js`) into real pirate ships
  near the player.
- `seaClock.js`: the sea steps on world time, but on a shared sea (a peer within range) it runs in real seconds
  (`seaSeconds`). Without this, one player's travel time scale sped up every AI ship for everyone.

### Boarding, plunder, law

- `navalBoarding.js`: grapples within `BOARD_RANGE` of a struck ship, a haul that draws her alongside, a muster of
  her crew (the class's `boarders`, thinned by losses) led by her captain, the player's own hands as allies. Kill the
  captain and enough of the muster and she is a prize.
- `navalPlunder.js`: the hold is lots drawn from DFU's loot tables by trade-specific keys, seeded by the ship. The
  captor picks Repair, Powder or Press, then scuttles, sets adrift or claims her as a new boat. A sunk ship drops casks.
  `navalTransfer.js` applies carry rules to plunder.
- `navalLaw.js`: at sea DFU's region is a coast with no court, so crimes go to the nearest crown (`crownOf`). The
  first hit on a lawful ship is DFU's `Piracy` crime through `lowerRepForCrime`. Notoriety (0-100 per crown) decays
  daily; past thresholds that crown's navy fights on sight and sends hunters.

## Crews and captains

| Module | Holds |
| --- | --- |
| `shipCrew.js` | Named hands with roles, morale and deck orders; saved per boat |
| `crewLife.js` | Crew walking, talking and singing on deck; `playerCrewCount` per hull |
| `navalDeck.js` | The walkable deck read from a ship's colliders |
| `shipWatch.js` | Night watch, lookout, lanterns |
| `crewCompanions.js` | Up to two hands who follow the player ashore |
| `captainLedger.js` | The captain's log, standing with each crown, ranks and favours, letters of marque (save vendor `Captain`) |
| `captainTree.js` | The captain's skill tree |
| `shipKnowledge.js` | The spyglass: what a captain knows of a ship before and after looking |
| `harbourBoard.js` | The harbourmaster's contracts and bounties |
| `src/systems/crewHall.js` | The shipyard's daily roster of recruits |

## Ports, shipyards and passage

- **Harbours**: `harbourBook.js` keeps the harbours near the player for both the quays and the sea, sounded every
  exterior frame whatever runs on the water. `harbourKeep.js` keeps a port's ships outside the town walls. `quays.js`
  is docking at the port's quays; `src/scenes/quayPool.js` draws them; `src/world/portSites.js` decides which towns are
  ports.
- **Shipyards**: `src/systems/shipyards.js` (the trade: every hull bought and sold), `src/systems/crewHall.js`,
  `src/systems/fleet.js` (the player's ships as a fleet book, save vendor `Fleet`), the window
  `src/ui/shipyardWindow.js` and its host half `src/scenes/shipyardHost.js` (with `src/scenes/fleetHost.js`).
  Cosmetics: `shipLivery.js` (paint), `shipFlag.js` (flags, guild insignia), `deckFittings.js` (props),
  `seaColours.js` (AI ships' liveries), `src/scenes/shipFlagHost.js`, `src/scenes/sailingCabin.js` (cabin interiors).
- **Passage**: `passage.js` is the law (destinations, fares via DFU's `calculateTripCost`). A friendly moored ship
  becomes the boat the player rides, and the Overworld crossing sails her (`src/systems/seaHelm.js`). Hosts:
  `src/scenes/naval/passageHost.js`, `passageBerths.js`, `passageHelm.js`, `passageQuay.js`. `seaClearance.js` steers
  the journey's helm round other ships. The voyage is sailed, never jumped.

## Trade

`tradeGoods.js`: eight Bay goods, each crown making some and wanting others, each port adding one twist, plus three
Eltheric goods; each isle's freeport also makes one Bay good. Prices drift by world day, so every client sees the
same price. Goods are real items (custom templates), so any shop buys them at base value. `crewTrade.js` sells and
buys crew headcount at the exchange. `treasureCharts.js` turns a pirate's chart into a marked cache.

## The Eltheric Ocean

`etherCrossing.js` offers the crossing at a helm in the open Abecean (`crossingWaters` in `src/world/ethericSea.js`)
and takes `CROSS_DAYS`. `etherShips.js` holds its traffic and six legends. `src/systems/sea/seaEvents.js` (Aether
Storm, treasure fleet on a shared clock), `seaVaults.js` and `seaSpoils.js` are its activities;
`src/scenes/seaVenturesHost.js` wires them.

## Online

- Come Sail Away boats ride the owner's foes frame as `sa` (`comeSailAwayWire.js`): pose, sails, helm, lanterns, and a
  velocity for smooth leading. Peers can stand on another player's boat (`src/scenes/comeSailAway/comeSailAwayAboard.js`)
  but never sail or open it.
- The sea's ships ride as `nv` (`src/systems/naval/navalWire.js`): ships (`s`), volleys (`v`), barrels (`b`), the
  owner's boat (`p`), notoriety (`n`), traffic density (`t`) and more. The relay reads nothing inside a foes frame,
  so naval changes need no relay change, and `navalWire.js` stays out of the relay's bundle.
- One player **stands** the sea for everyone within `NAVAL_SHARE_RADIUS`: the lowest id among players on the water
  (the election in `src/systems/campEncounters.js`). Others show puppets eased toward the stander's word.
- A ship is her seed. Her word carries a handover count (`gen`); of two claims the higher count wins, then the lower
  id. A ship is handed over when her stander leaves or when a player boards her.
- Hits on another player's ship go to its owner (`navalHitData`, `validNavalHit`). Volleys carry their age, so a
  reader flies the balls from the same point in flight as the shooter.
- Every field added to a record must keep older readers working: they read entries by position, and a shorter
  record must still parse (`validNavalRecord`).

## Save

| Vendor | Holds |
| --- | --- |
| `come-sail-away` | The player's boats, placed or packed, their cargo |
| `NavalCombat` (`NAVAL_SAVE_VENDOR`, version 1) | Each boat's hull, sails, crew, fire and state by deed UID; notoriety and its decay day; raids started |
| `Captain` | The captain's ledger |
| `Fleet` | The fleet book |

The sea's AI ships are never saved: they are rolled again from the waters and the day.

## Testing

- Unit tests: `test/systems/naval/` (for example `nav_a_guns.test.js`, `nav_c_ships.test.js`, `nav_d_boarding.test.js`,
  `nav_g_online.test.js`, `nav_h_host.test.js`, `ramreturn.test.js`, `shiplife.test.js`, `passage.test.js`,
  `capttrade.test.js`, `ethercross.test.js`), `test/systems/comeSailAway/` (`csa_sailing.test.js`, `csa_wind.test.js`,
  `csa_online.test.js`, `peaceway.test.js`), `test/systems/sea/`, `test/scenes/naval/`, and
  `test/systems/shipyards1*.test.js`, `test/systems/wa1_warmAshesShips.test.js`.
- Harnesses: `test/csaScene.mjs` runs the real Come Sail Away runtime; `test/navalSea.mjs` and `test/navalRoom.mjs`
  build a sea and an online room for the naval host.
- In game: buy a boat at a port's shipyard, sail out and fight. Online needs two clients near each other on the water.

## Known limits and traps

- `navalHost.js`, `comeSailAway.js` and `navalAI.js` are very large. Put new behaviour in a new module the host wires.
- A hull's gun count depends on which model loaded. The project's carrack carries five long guns a side; the mod's
  fallback carrack carries seven.
- The galley cannot berth at a quay.
- Changing the `naval-handling` pref takes effect the next time the player takes a helm.
- A shared sea is sailed at the lowest "Ships at sea" setting among its players.
