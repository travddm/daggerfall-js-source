// P0 SERVER PROFILE: THE OFFICIAL SERVER'S PROFILE (server-profile design, sections 3 and 8; decision #65).
//
// The single source of every online rule the official server plays by. The relay bundles this file and serves it at
// `/profile`; the client fetches it before the world boots and installs it (systems/online/serverProfile.ts); its
// hash (`ph`, profileHash.ts) rides every hello and welcome. A server owner edits this file and deploys: a change is a
// new relay bundle (test/net/relayversion.test.js) and a new `ph`, and every page open on the old one is refused
// with words to reload.
//
// - `rules`: values for keys of the registry (profileKeys.ts) that differ from the key's online default. Empty: the
//   official server plays every key at today's online value.
// - `pins`: what the online lane forced before the profile existed (systems/online/onlineLane.js), moved here as
//   data so the hash covers it. Phase 6 turns these into rule mods' settings.
//   - `prefs`: port switches the room holds, at the value it holds them (a features.js row says `online: 'room'`).
//   - `modKeys`: a vendored mod's switches the room holds, by vendor and key.
//   - `wholeMods`: mods whose every key reads its shipped default online, apart from the listed free keys.
// - Reserved for later phases (mod-system design, section 5): `core` ({ version, ecs }), `mods`, `terrain`.
//
// A leaf: no imports (test/importGraph.mjs walks the relay's bundle and reads a .ts file's imports too).

/**
 * THE PORT'S SWITCHES THE ROOM HOLDS (RF4: they were declared on the Features registry's rows as `online: true`,
 * `false` or a tier, and folded into the lane by declareOnlinePrefs). Each row now says `online: 'room'`, and the
 * registry's own check holds every such row to a pin here (systems/features.js).
 */
const PREFS = Object.freeze({
  mediumDungeons: false, // ON53: Medium dungeons forced off online - one layout per room
  worldDungeonSizes: true, // ON53: the world's dungeon sizes forced on online
  enhancedEnvironments: true,
  enhancedAI: true,
  enhancedClimbing: true,
  enhancedCombatVisuals: true,
  lootRarity: true,
  weaponTechniques: true,
  crimeRecovery: 'x4', // ON43: the bad name's pace, the room's tier
  dungeonFires: true,
  weatherEvents: true,
  realForests: true,
  banthaJungle: true,
  tamrielLands: true,
  landforms: true,
  roadVerges: true,
  climateBlend: true,
  questlines: true,
  wildernessCamps: true,
  naval: true,
});

/**
 * THE MOD KEYS THE ONLINE LANE FORCES - AND THEY ARE THE GROUND.
 *
 * MODS-ONLINE-2. The first answer was half of one: eight mods freed, eight
 * left forced because they sounded like world state. This is the other
 * half, and it is a READING of the port rather than a reading of the
 * names.
 *
 * WHAT THE ROOM ACTUALLY AGREES ON. The port is already owner-
 * authoritative everywhere a mod could disagree, by design and by pin:
 *
 *   - a blow's damage is the STRIKER's number and the host applies it
 *     without recomputing (dungeonContext applyHit: "The number is a
 *     peer's word and the host trusts it"), so PCAAO's formulas were
 *     never shared - each machine already rolls its own;
 *   - a foe's stats are minted where it SPAWNS (makeEnemyEntity) and a peer sees a puppet the owner steps, so a
 *     joiner already fights the host's foes under the host's numbers,
 *     whatever the joiner's shelf says;
 *   - a corpse's loot is rolled and granted by the owner's word
 *     (WORLD6b-iii(c)), so Unleveled Loot's rolls are the owner's;
 *   - a blow AT a body is mitigated where it lands - hurtPlayer for me,
 *     damageFoe for the host's foe, both through damageShieldPool - so
 *     the Shield Widget's block is always the defender's own;
 *   - Oblivion leveling is written into a CHARACTER at creation and
 *     kept by that character; Handheld Torches is an item in my save
 *     with a light on my screen. (Travel Options was "my own journey"
 *     here until TRAVEL-ONLINE, below: its off switch was a teleport.)
 *
 * None of those reaches a second machine as a RULE. Each reaches it as
 * a RESULT, which is exactly what the wire carries.
 *
 * ONE THING IS DIFFERENT, and it is not a rule either - it is the
 * floor. Basic Roads rewrites TERRAIN HEIGHTS: terrainGen calls
 * smoothRoadHeights over the road beds, so which network is painted
 * (`Enabled`: Hazelnut's arrays or the port's own generated network,
 * BR3) and whether the beds are smoothed at all (`SmoothRoads`) decide
 * where the ground IS. Two players who disagree stand on two floors
 * along every road in the Bay, and a pose is a position on that floor,
 * so each sees the other sunk into or floating over the bed. That is
 * the room disagreeing about the world itself, and it is the only
 * place in the shelf where a switch does that.
 *
 * AND THIS WAS ALREADY BROKEN. `SmoothRoads` is a DIAL, and the old
 * lane forced only `Enabled`, so the smoothing has been the player's
 * on every online page since the lane was written - the heights
 * already diverged, quietly, for anyone who turned it off for the
 * "minor extra performance" its own description offers. Forcing
 * `Enabled` bought the room nothing while its own dial gave the floor
 * away. So the table is by KEY, not by mod.
 *
 * `RiversAndStreams` WAS NOT HERE, and that was measured too:
 * SMOOTHED_TILES is {46, 0xff} - the road and track beds - and the
 * painter lays a road before it ever considers water (roadPainter
 * paintRoads), so a river painted tiles and never moved a height. It
 * was paint, and paint is the player's.
 *
 * LANDFORM3: IT IS
 * GROUND NOW. The landforms (world/landforms.js - the room's ground,
 * forced on below) cut every painted river and stream into the land,
 * so the river switch decides where the ground IS beside every river
 * in the Bay - the roads' own reason - and it is the room's. And the
 * room's rivers are ON, past the mod's shipped off: a room that held
 * the mod's default would have no rivers at all, and the channels are
 * what Mac asked to see online. (The smoother still moves no river's
 * height; the kernel's cut does - test/systems/landform.test.js measures it.)
 *
 * MODS-ONLINE-4: AND
 * THE READING ABOVE ANSWERED THE WRONG QUESTION FOR THREE OF THEM.
 *
 * "Does it desync?" and "does my switch reach another player?" are not
 * the same question, and the passes above only asked the first. The
 * port really is owner-authoritative, so nothing below breaks a room -
 * but OWNERSHIP IS NOT PRIVACY. Two of the places a machine owns
 * something are places its answer is handed to everyone else:
 *
 *   THE HOST OWNS THE DUNGEON'S FOES. A world room's layout foes are
 *   streamed by its host and stood as puppets by everyone else
 *   (WORLD2), so the host's PCAAO is not "the
 *   host's own game" - it is what the whole party fights. A host
 *   with it off runs a softer dungeon for four other people who
 *   never chose that, and none of them can see why.
 *
 *   ITEMS CHANGE HANDS. A corpse's pile is granted to peers
 *   (WORLD6b-iii(c)) and a room's containers are shared (WORLD4), so
 *   Unleveled Loot's rolls do not stay with the roller. One player
 *   rolling level-scaled drops and handing them across is two
 *   rulesets feeding one economy.
 *
 * So these three are the room's - not because a room where they
 * differ falls apart, but because a room where they differ is one
 * player's setting spending someone else's evening.
 *
 * WHAT STAYED THE PLAYER'S AFTER THE SAME QUESTION. Climates &
 * Calories reaches another player only through a corpse's FOOD -
 * meat and rations, no power and no gear - and forcing it means
 * nobody may opt out of freezing to death, which is a live
 * complaint; the Shield Widget, Handheld Torches and Oblivion leveling
 * only ever make the player's OWN run harder or easier.
 *
 * So: what the lane forces is the floor the room stands on, and the
 * three switches that spend a stranger's evening. (CORPSE-FOOD, 2026-09-23: the food itself is the room's - minted online whatever the tier, survival/switch.js corpseFoodOn - and the tier stays the player's.)
 */
const MOD_KEYS = Object.freeze({
  'roads-hazelnut': Object.freeze({
    Enabled: true, // which network is painted, and so which beds are smoothed
    SmoothRoads: true, // whether the beds are smoothed at all - the dial that gave the floor away
    RiversAndStreams: true, // LANDFORM3: whether rivers are painted, and so cut into the land - on, past the mod's shipped off (above)
  }),
  // WOD1: the second floor. World of Daggerfall levels the
  // ground under every camp and rock field it stands (LocationLoader.cs
  // lerps the heightmap toward the site's mean) and stands collidable
  // rock in it, so two players who disagree walk two terrains and pass
  // through each other's boulders - the roads' own reason, word for
  // word. Its one switch is the room's.
  'world-of-daggerfall': Object.freeze({ Enabled: true, Mountains: false }), // WOD-PEAKS: and its spires the room's too - they level the ground and stand rock
  // DS1: the third floor. Every owner's ship stands at the SAME
  // map pixel - (2,2) for the small, (5,5) for the large (banking.js
  // SHIP_COORDS) - so a room's sailors share one deck, and Detailed Ships
  // stands collidable railings, crates, tenders and rigging on it. Two
  // players who disagree would walk two decks and pass through each
  // other's crates; the switch is the room's. (Below decks opens no room -
  // worldModes' ship interior is the player's own.)
  'detailed-ships': Object.freeze({ Enabled: true }),
  // WD3: the
  // towns themselves. Beautiful Villages and Beautiful Cities lay 7,727 of Daggerfall's places out again - new streets,
  // new walls, every building where its block now stands - so two players who disagree walk two towns, one through the
  // other's houses, and a building KEY (an online home's, a shared quest's) names two different buildings. The switch is
  // the room's. The homes bought before them keep the towns they were bought in, for everyone (net/homeLaw.js WD3).
  'beautiful-villages': Object.freeze({ Enabled: true }),
  'beautiful-cities': Object.freeze({ Enabled: true }),
  // RAID2: the towns' raids are the
  // WORLD's - the day's roll is the shared day's, one player runs each raid and every other stands its raiders as
  // puppets and fights them, and a raid's deaths are every owner's summed. A player with the switch off would walk a
  // raided town the others fight in, unable to see the raiders striking him; the switch is the room's.
  'world-events-raiding-parties': Object.freeze({ Enabled: true }),
  // TRAVEL-ONLINE: online a trip on the map is TRAVELLED -
  // the mod's journey, or the Overworld's on the enhanced skin - never Daggerfall's fast travel, which online is a
  // teleport (it arrives at the world's present: no world time to spend). Three switches reached that teleport: the mod
  // off, and either of the two dials that send a Cautious or an Inns trip down the journey (ui/travel/travelPopUp.js
  // isPlayerControlledTravel; TO-LIVE put both on the tile). AUDIT TRAVEL-ONLINE T1: and a fourth - the ports rule. Off,
  // nothing knocks the ship toggle (on by default, travelMapState.js) off a trip from the wilderness to an inland place,
  // and a ship is never walked: the teleport again, free with Camp Out. All four are the room's, at the shipped defaults.
  // A ship's passage from a port, and a party's journey to its leader (DFU's fast travel by design), are not touched.
  'travel-options': Object.freeze({
    Enabled: true,
    'CautiousTravel.PlayerControlledCautiousTravel': true,
    'StopAtInnsTravel.PlayerControlledInnsTravel': true,
    'ShipTravel.OnlyFromPorts': true,
  }),
  // IT1: IMMERSIVE TRAVEL. Its switch is the room's for the floor's reason: it stands a carriage, two
  // horses and a driver at every city gate (its four gate blocks, laid onto Beautiful Cities' as well), collidable
  // models a player without them would walk through. And DisableNormalTravel is the room's, OFF - the port's shipped
  // default (IT1's recorded departure: the mod ships it on) - so online the travel map's trips stay Travel Options'
  // walked journeys and a driver's fare is fast travel over land (a port's ship passage, TRAVEL-ONLINE item 9, the other
  // fast travel online - AUDIT IT1 W5); on, the map would refuse every trip to a place.
  // The fares and the driver's rules are the room's too, whole (WHOLE_MODS below).
  'immersive-travel': Object.freeze({
    Enabled: true,
    'General.DisableNormalTravel': false,
  }),
  // DW-A to DW-D: the fourth floor, and more than a floor. Iliac
  // Puddle No More carves the sea out from under the terrain - the switch
  // and the depth decide where the seafloor stands, so two players who
  // disagree would swim over two floors (one walking on water where the
  // other dives). Its deep-sea foes and its sunken loot are the host's
  // foes and a roll that leaves the roller's hands (MODS-ONLINE-4's two
  // reasons), and its swim multiplier, its stroke and the Argonians'
  // unbounded breath are rules a room plays by (MODS-ONLINE-5): a 30x swim
  // is a player outrunning the party's foes. Its looks - the surfaces, the
  // fog, the fish and the weed - are each player's own.
  'iliac-puddle-no-more': Object.freeze({
    Enabled: true,
    'General.WaterDepth': 250.0,
    'General.SpawnUnderwaterEnemies': true,
    'General.EnemyFrequency': 0.3,
    'General.MaxLiveEnemies': 32, // SEA-CAP: the port's default (modSettings.js), the room's too
    'General.SeafloorLootRate': 0.5,
    'General.MaxLiveLootObjects': 192,
    'General.TreasureClusterRate': 0.3,
    'General.MaxLiveTreasureClusters': 12,
    'General.TreasureCove': false,
    'General.SwimSpeedMultiplier': 1.0,
    'General.EnableSwimStroke': true,
    'General.ArgonianInfiniteBreath': true,
  }),
  // OH-A: the fifth floor, cut into the fourth. There's a Hole in
  // the Bottom of the Ocean sinks a pit into Iliac Puddle No More's seafloor
  // at the pixels its hash picks, and stands the pit's way in - a dungeon, a
  // world room of its own (roomKeyFor's `dungeon:m<id>`: the abyss's map id is
  // the pit's). Its switch, its spawn rate and its seafloor hole size decide
  // where the floor falls away and which pixels open, so two players who
  // disagree would swim over two floors, one diving into a pit the other
  // cannot see: the room's (DECLARED, Port-Ledger, the Ocean Holes row). Its
  // looks - the surface disc's size, the miasma, the abyss's fog and
  // darkness - are each player's own.
  'ocean-holes': Object.freeze({ Enabled: true, 'General.PitSpawnRate': 0.5, 'General.SeafloorHoleSize': 0.5 }),
  // MODS-ONLINE-4: the host's foes are the party's foes.
  pcaao: Object.freeze({ Enabled: true }),
  // DEX0: the same reading for Daggerfall Enemy Expansion - which enemy stands is the table's at its spawn, and a peer
  // fights the owner's foes; a player with it off would face Goblins and Trolls they could not see standing in a room.
  'daggerfall-enemy-expansion': Object.freeze({ Enabled: true }),
  // MODS-ONLINE-4: a roll that leaves the roller's hands.
  unleveledLoot: Object.freeze({ Enabled: true }),
  // RRI1/RR1 (merged 2026-09-23), asked MODS-ONLINE-4's question - "does
  // my switch reach another player?": Roleplay & Realism: Items' custom
  // items stand in shared containers (lootRebalance), on the host's foes
  // (realisticEnemyEquipment) and in the piles a killer grants to peers
  // (newWeapons, newArmor) - a peer with the class unregistered receives
  // a nameless record, Unleveled Loot's exact shape. Its formula and
  // pricing dials are the player's own. Roleplay & Realism adds a
  // LOCATION to a region (RR3b's world data, under Enabled) - the ground
  // - and rewrites the host's foes' behaviour (enemyAppearance: a
  // Sorcerer that casts); every other switch is the player's own run.
  'roleplay-realism-items': Object.freeze({
    Enabled: true,
    newWeapons: true,
    newArmor: true,
    lootRebalance: true,
    realisticEnemyEquipment: true,
  }),
  // MODS-ONLINE-5: ONE RULESET PER ROOM. PCAAO was forced
  // whole - its player-side formulas with its foe-side ones - and RR's
  // six combat overrides are the same kind of thing (FormulaHelper
  // overrides on the striker's own blow, the wearer's own armor, the
  // walker's own load), so they take the same answer for the same
  // reason, forced to the mod's own shipped defaults - all but
  // `equipDamage`, which the port ships off (WEAR-VANILLA, 2026-10-01:
  // the mod ships it on) and the room holds off. And ONE that is
  // an exploit rather than a preference: intensive training spends four
  // days of world time for its +4, and the shared clock refuses the
  // days (CLOCK-REFUSAL) - online it would be four points for nothing.
  // Forced OFF, which is what the mod ships anyway.
  'roleplay-realism': Object.freeze({
    Enabled: true,
    enemyAppearance: true,
    advancedArchery: true,
    weaponSpeed: true,
    weaponMaterials: true,
    classicStrengthDamageBonus: false,
    equipDamage: false,
    encumbranceEffects: true, // WEAR-VANILLA: armour x5 off, the port's default (modSettings.js)
    'RefinedTraining.intensiveTraining': false,
  }),
});

/**
 * REALM P0.2: THE BALANCE MODS ARE THE ROOM'S WHOLE, NOT THEIR ENABLE SWITCH.
 *
 * MODS-ONLINE-4/5 forced these mods on and left their DIALS the player's, reading each dial as the player's own run.
 * A realm with one ruleset has no "own run" for power and loot. The dials left free were exactly the holes the REALM
 * research found:
 *   - Unleveled Loot's material remaps: Iron -> Daedric turns a 300-gold cuirass into a 153,600-gold one, handed to
 *     peers through corpses, shared piles and shop shelves;
 *   - PCAAO's modules: `fixedStrengthDamageModifier` off doubles the strength bonus (`fadingEnchantedItems` stood
 *     here too - off, it kept broken enchanted gear - until WEAR-VANILLA, 2026-10-01, made keeping it the rule: the
 *     port ships both of the overhaul's wear modules off, so the room's shipped default keeps a player's broken
 *     enchanted piece, repairable, and the item sink the realm research counted is given up by choice);
 *   - Roleplay & Realism's `loanAmountPerLevel`, which EMPIRE-BANK's cap reads;
 *   - RRI's `conditionBasedPrices`: off, worn loot sells for up to 5x more;
 *   - Oblivion leveling's dials: up to 40 attribute points a level.
 * So online, every key of these mods reads its SHIPPED default - the port's, where the port ships it otherwise
 * (WEAR-VANILLA's three wear modules) - apart from the keys named here, which stay the player's. A key MOD_KEYS names keeps its own value (RR's classic strength bonus and intensive training
 * are forced off whatever they ship as).
 */
const WHOLE_MODS = Object.freeze({
  pcaao: Object.freeze([]),
  'daggerfall-enemy-expansion': Object.freeze([]), // DEX0: the troll's getting back up is the room's too - online it does, the mod's shipped way
  unleveledLoot: Object.freeze([]),
  'roleplay-realism-items': Object.freeze([]),
  'roleplay-realism': Object.freeze(['variantNpcs', 'variantResidents']), // who stands behind a counter and in a house: looks
  // IT1: a driver's fare is the price of fast travel over land online - a fee of 0, a dungeon on his list or the region
  // lock off would be a free or a wider teleport a dial away, so every rule is the room's at the mod's own value. Only
  // the map's looks stay the player's: the dots' sizes, the roads drawn on the page, a captain's map showing docks alone.
  'immersive-travel': Object.freeze([
    'General.ClearerMapDots',
    'General.DrawRoads',
    'General.DrawTracks',
    'ShipTravel.ShowLargerDocks',
    'ShipTravel.ShowOnlyDocks',
  ]),
});

export const OFFICIAL_PROFILE = Object.freeze({
  schema: 1,
  rules: Object.freeze({}),
  pins: Object.freeze({ prefs: PREFS, modKeys: MOD_KEYS, wholeMods: WHOLE_MODS }),
});
