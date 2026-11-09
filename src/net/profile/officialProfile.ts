// The official server's profile: the single source of every online rule it plays by (server-profile design, decision
// #65). The relay serves it at `/profile` and names its hash (`ph`) in every hello and welcome, so an edit here is a new
// relay bundle and every page on the old one is told to reload. `rules` holds keys that differ from the registry's online
// default; `pins` holds what the online lane forced before, as data the hash covers. `core`, `mods` and `terrain` are
// reserved. A leaf: the relay bundles it, so it imports nothing.

/** Features switches the room holds, at the room's value. Each row says `online: 'room'`, and features.js holds it to
 *  a pin here. */
const PREFS = Object.freeze({
  mediumDungeons: false, // one dungeon layout per room
  worldDungeonSizes: true,
  enhancedEnvironments: true,
  enhancedAI: true,
  enhancedClimbing: true,
  enhancedCombatVisuals: true,
  lootRarity: true,
  weaponTechniques: true,
  crimeRecovery: 'x4',
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
  naval: false,
  revenants: true,
  humanoidLoot: 'dfu',
  repairPriceByDamage: false,
  cureKeepsInfection: false,
  lockpickTumblers: false,
  dressForThePart: false,
  guildProbation: false,
  questlineRewards: true,
});

/**
 * Vendored mod switches the room holds. A mod switch is the room's when two players who disagree would stand on
 * different ground (terrain, rock, decks, towns), or when one player's choice reaches the others: the host's foes are
 * the party's foes, and loot changes hands. Looks and a player's own difficulty stay the player's.
 */
const MOD_KEYS = Object.freeze({
  // Which modes a character may be created in is the server's; Legacy is Project Legacy's `Enabled`.
  'character-modes': Object.freeze({
    Enabled: true,
    'Modes.Hardcore': true,
    'Modes.Ironman': true,
    'Modes.HardcoreIronman': true,
  }),
  'project-legacy': Object.freeze({ Enabled: true }),
  'roads-hazelnut': Object.freeze({
    Enabled: true, // which network is painted, and so which beds are smoothed
    SmoothRoads: true, // whether the beds are smoothed: the heights under every road
    RiversAndStreams: true, // rivers are cut into the land, so they are ground; on, past the mod's shipped off
  }),
  // Levels the ground under its camps and stands collidable rock; its peaks do the same.
  'world-of-daggerfall': Object.freeze({ Enabled: true, Mountains: false }),
  // Every owner's ship stands at the same map pixel, so its collidable deck props are shared ground.
  'detailed-ships': Object.freeze({ Enabled: true }),
  // Lays the towns out again: players who disagree walk different streets, and a building key names different buildings.
  'beautiful-villages': Object.freeze({ Enabled: true }),
  'beautiful-cities': Object.freeze({ Enabled: true }),
  // Raids are the shared world's: one player runs each raid and the others fight its raiders as puppets.
  'world-events-raiding-parties': Object.freeze({ Enabled: true }),
  // Online a map trip is travelled, never Daggerfall's fast travel (a teleport there). These four switches each reopened
  // the teleport, so they are the room's at the shipped defaults.
  'travel-options': Object.freeze({
    Enabled: true,
    'CautiousTravel.PlayerControlledCautiousTravel': true,
    'StopAtInnsTravel.PlayerControlledInnsTravel': true,
    'ShipTravel.OnlyFromPorts': true,
  }),
  // Stands collidable carriages at every city gate. DisableNormalTravel stays off so map trips stay walked journeys; on,
  // the map would refuse every trip. Its fares are the room's too (WHOLE_MODS).
  'immersive-travel': Object.freeze({
    Enabled: true,
    'General.DisableNormalTravel': false,
  }),
  // Carves the seafloor (ground), and its sea foes, sunken loot and swim rules reach the party. Its looks are the player's.
  'iliac-puddle-no-more': Object.freeze({
    Enabled: true,
    'General.WaterDepth': 250.0,
    'General.SpawnUnderwaterEnemies': true,
    'General.EnemyFrequency': 0.3,
    'General.MaxLiveEnemies': 32, // the port's default (modSettings.js)
    'General.SeafloorLootRate': 0.5,
    'General.MaxLiveLootObjects': 192,
    'General.TreasureClusterRate': 0.3,
    'General.MaxLiveTreasureClusters': 12,
    'General.TreasureCove': false,
    'General.SwimSpeedMultiplier': 1.0,
    'General.EnableSwimStroke': true,
    'General.ArgonianInfiniteBreath': true,
  }),
  // Sinks pits, each a dungeon of its own, into the seafloor: where the floor falls away is ground. Its looks are the
  // player's.
  'ocean-holes': Object.freeze({ Enabled: true, 'General.PitSpawnRate': 0.5, 'General.SeafloorHoleSize': 0.5 }),
  // The host's foes are the party's foes.
  pcaao: Object.freeze({ Enabled: true }),
  // Which enemy spawns is the host's roll, and the party fights the host's foes.
  'daggerfall-enemy-expansion': Object.freeze({ Enabled: true }),
  // Its rolls leave the roller's hands through corpses and shared containers.
  unleveledLoot: Object.freeze({ Enabled: true }),
  // Its items reach peers through shared containers, the host's foes and granted piles; a peer without the class would
  // receive a nameless record.
  'roleplay-realism-items': Object.freeze({
    Enabled: true,
    newWeapons: true,
    newArmor: true,
    lootRebalance: true,
    realisticEnemyEquipment: true,
  }),
  // One ruleset per room: the combat overrides at the mod's shipped values (equipDamage off, the port's default), and
  // intensive training off because the shared clock refuses the days it spends.
  'roleplay-realism': Object.freeze({
    Enabled: true,
    enemyAppearance: true,
    advancedArchery: true,
    weaponSpeed: true,
    weaponMaterials: true,
    classicStrengthDamageBonus: false,
    equipDamage: false,
    encumbranceEffects: true, // the port's default (modSettings.js)
    'RefinedTraining.intensiveTraining': false,
  }),
});

/**
 * Mods whose every key reads its shipped default online (the port's default where it differs), apart from the listed
 * free keys. Their dials are power and loot (material remaps, damage modules, loan caps, sale prices, level gains),
 * which one realm plays by one rule. A key MOD_KEYS names keeps its own value.
 */
const WHOLE_MODS = Object.freeze({
  pcaao: Object.freeze([]),
  'daggerfall-enemy-expansion': Object.freeze([]),
  unleveledLoot: Object.freeze([]),
  'roleplay-realism-items': Object.freeze([]),
  'roleplay-realism': Object.freeze(['variantNpcs', 'variantResidents']), // looks
  // A driver's fare is the price of land fast travel, so every rule is the room's; only the map's looks are free.
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
