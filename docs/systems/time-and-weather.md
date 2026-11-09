# Time and Weather

This page covers the game clock (calendar, day and night, online and offline time, waits and rest), weather, the sky,
seasons and climates, and the survival arc that reads them. Terrain and the map are in [world.md](world.md).

## Calendar

`src/systems/gameDate.js` holds the calendar as pure functions. There is no mutable clock object, a departure from
Daggerfall Unity's `DaggerfallDateTime`.

- The base unit is the classic minute: 60 minutes an hour, 24 hours a day, 7-day weeks, 30-day months, 12 months, a
  360-day year.
- Names: `dayNames` (Sundas to Loredas), `monthNames` (Morning Star to Evening Star), `birthSignNames`, `SEASONS`
  (Fall 0, Spring 1, Summer 2, Winter 3). Text is localised through `src/systems/textManager.js`.
- A new game starts at `CLASSIC_GAME_START_TIME` (13:30, 4th of Morning Star, 3E 405), as Daggerfall Unity's
  `SetClassicGameStartTime`.
- Conversions: `dateFromClassicMinutes`, `dateToClassicMinutes`, `dayOfYearFromMinutes`, `seasonValue`,
  `dateTimeString`.
- Day and night: `DAWN_HOUR` 6, `DUSK_HOUR` 18. `isDayFromMinutes` is true for hours 6 to 17. `src/world/worldClock.js`
  uses the same hours for `isNight` and holds `LIGHTS_ON_HOUR` 17 and `LIGHTS_OFF_HOUR` 8 for street lights.

## The clock offline

`src/systems/worldTick.js` keeps one absolute classic-minute counter. Real frame time advances it at
`CLASSIC_MINUTES_PER_SECOND` (12 game minutes per real minute; a game day lasts two real hours).

- `createPlayerTicker` (`src/scenes/shared.js`) wraps `tickPlayerMinutes`. `ticker.advance(minutes)` is Daggerfall
  Unity's `RaiseTime`.
- `tickPlayerMinutes` runs the magic round, the per-minute loop, the calendar hooks (`runDayChange`,
  `runCalendarArms`) and, when the host passes a `survival` argument, the survival needs (see Survival arc below).
  Catch-up is capped at `MAX_CATCHUP_ROUNDS` (2880), Daggerfall Unity's `maxCatchupDays` figure.
- `src/systems/timeScale.js` scales game time for travel (`setTimeScale`, clamped to 0.01 to 100; `travelRateOf`).
  `src/scenes/world.js` calls `resetTimeScale` when a journey ends.

## The clock online

Online, nobody stores or moves the world clock. World time is a pure function of the relay's wall time.

- The relay (`server/src/index.js`) puts its `now` in the welcome message. `src/net/online.js` turns it into
  `clockOffsetMs` (accepted only within 366 days of the local clock) and fires `onClock`.
- `src/net/wire.js` `sharedClassicMinutes(nowMs)` maps wall time to classic minutes at `ONLINE_MINUTES_PER_MS` (the
  same 12 game minutes per real minute). `setSharedClock` in `worldTick.js` installs it as the source.
- Every client computes the same time; nothing about the clock is sent after the welcome.

Daggerfall Unity has one clock. Online, the code runs three:

| Clock | Function | Behaviour |
| --- | --- | --- |
| Event (world) clock | `worldMinutes()` | Wall-time function at 12x. Nobody can move it. |
| Sky clock | `skyMinutes()` | Faster rate from `SKY_SEGMENTS` in `src/net/skyLaw.js` (24x: a day every real hour). |
| Own clock | `ownMinutes()` | Per character, saved. Runs with the world in play, runs ahead on rests and raises, stands while away or dead. |

Offline all three are the same counter.

The separate sky clock is a departure for online play. Today it is a constant in `skyLaw.js`, not a setting: every
online room uses it. Decided default: one clock, as in Daggerfall Unity, with the separate sky clock as a
server-profile option (decision 117 (17)). That is not built yet.

- `setWorldMinutes` and `advanceWorldMinutes` do nothing online and return the shared time. A caller that expects the
  clock to move sees no error.
- `trustedWorldMinutes()` is `NaN` until the relay clock is heard.
- Rests, waits and quest charges go to `advanceOwnMinutes`. `raisedMinutes()` counts raises so quest countdowns charge
  them in full.
- `src/systems/skyCalendar.js` converts between the event and sky clocks (`skyMinuteOfEvent`, `eventMinuteOfSky`).
  Weather and seasons read the sky date online.
- The fast-travel arrival clamp (`arrivalClampMinutes`) runs offline only.
- `SKY_SEGMENTS` rows start at aligned instants (`tools/skyCutover.mjs` lists them) so a rate change does not make the
  sky jump.

## Rest and waits

`src/systems/rest/restSession.js`:

- `canRest` gives the verdict (allowed, bed, crime and guards in town). `restDecision` picks the outcome.
- `RestSession` has three modes: `timed`, `full` and `loiter`. `tick(dt)` is the frame driver.
- Rest is paced in real time: every sub-tick advances 10 game minutes, then ticks quests. An hour of rest takes 0.45
  real seconds (loiter is slower).
- Each game hour it checks nearby enemies, registered prevent-rest conditions (`registerPreventRestCondition`), vitals
  and inn rent (`checkRent`, from Daggerfall Unity's `TickRest`).
- A rest ends on an enemy spawn (`abortForEnemySpawn`), a follower's cancel, an `endEarly` call, or a window covering
  the rest window.

Other rest files:

- `src/systems/rest/rest.js`: health, fatigue and magicka recovery rates; `exhaustionOutcome`.
- `src/systems/rest/restAct.js`: the online rest. Today it is one act at a rest point (a lit fire or a bed) that moves
  the character's own clock eight hours at once (`NIGHT_HOURS` 8, due every `NIGHT_INTERVAL_MINUTES` 120 own
  minutes), plus ambush nights, channel heals and short sleeps. Decided replacement: rest wherever Daggerfall Unity's
  `CanRest` allows, with its hour choice on the character's own clock, no free full top-up, and fire-only rest as a
  server-profile key (decision 62). Open pull request #143 builds it.
- `src/systems/rest/restItems.js` and `restItemRows.js`: bedrolls, ember jars, firewood, tonics, salts. They belong to
  the survival arc (below).
- `src/systems/rest/restWarning.js`: ailment lines shown before a rest.

## Holidays

`src/systems/holidayTables.js` holds Daggerfall's holidays, the regions that keep each one, and their days of the year.
`src/systems/holidays.js` `getHolidayId(gameMinutes, regionIndex)` is a port of `GetHolidayId`; it also lists the
holidays that give free or half-price cures. Days 356 to 360 are never holidays.

`src/systems/seasonBook.js` is not the calendar. It builds the pause screen's season window from the clock, the town
seats and the season boards. The season boards are cut (decision 46) and the seats become a mod (decision 102).

## Weather

`src/world/weather.js` `WEATHER_TYPES` holds Daggerfall's seven words in Daggerfall Unity's order (sunny, cloudy,
overcast, fog, rain, thunder, snow) plus two of the port's own: sandstorm and ashfall. The table never rolls the last
two. The same file holds fog settings (`fogForWeather`), sky offsets and `isSnowFreeClimate`.

### Classic lane

- `src/systems/weather/weatherTable.js` `WEATHER_TABLE` holds the odds per climate group and season, from Daggerfall
  Unity's `WeatherTable.json`. `rollWeather` walks the cumulative odds.
- `src/systems/weather/weatherSim.js` keeps one sky state. `rollClimateWeathersForDay` rolls six climate-zone words
  once a game day. `tickWeather` applies the player's zone on the next exterior frame; a day rolled indoors applies as
  a jump. `weatherRespawn` re-rolls only when the climate base type changes on travel.
- Departure: a fast-travel arrival applies the destination zone's word without a fresh roll.
- The save keeps only the current word (`snapshotWeather`, `restoreWeather`); the six-zone array re-rolls at the next
  day change.

### Enhanced lane

A departure from Daggerfall Unity, on two Features rows: `weather-events` (`weatherEvents`) and
`enhanced-environments` (`enhancedEnvironments`), both on by default and both held by the room online. The parts
gated on the enhanced skin fall under decision 117 (16): they are made to work in every skin where that is cheap, or
move into the skin mod ([ui.md](ui.md)).

The weather map, the field and the forecast run on the `weatherEvents` preference alone, in every skin, on DFU's own
weather words. Enhanced Environments adds to them (the clouds' cells, the air's snow-or-rain law, the hourly
evolution) and is not required. The rest of this section is behind the enhanced skin and the Enhanced Environments
preference:

- `src/systems/weather/weatherMap.js` `weatherAt(x, z, minutes, climateAt)`: weather systems (storms, rain bands,
  squalls, sandstorms, ashfall, fog banks, cloud decks) are born per map node, drift, grow and die. The map is a pure
  function of place and minute.
- `weatherField.js` spreads the day's six words over the land. `evolveClimateWeathers` (in `weatherSim.js`) re-rolls
  zones hourly when the map is off.
- `weatherFront.js` `createWeatherFront` eases sky, sound and precipitation through a three-hour front.
- `src/systems/wind/wind.js` `createWindModel`: daily calm and front strength, seeded (`?wseed` overrides the seed).
- `owForecast.js`: the forecast. `nightFog.js`: fog colour from the lit air, so fog darkens at night.

Lane gates in `weatherSim.js` (`weatherFieldOn`, `weatherMapOn`, `snowGroundLawOn`, `precipLawOn`,
`weatherEvolutionOn`) are read per call. Each has a URL switch: `?wxfield=off`, `?wxmap=off`, `?snowground=off`,
`?biomeprecip=off` (refused online), `?evolve=off`.

### Weather online

The relay has no weather code. Online, `src/scenes/world.js` calls `setSharedWeather(true)`: the day roll is seeded by
the event-clock day (`rollsFor`), and the season comes from the sky date, so every client rolls the same six words.
The weather map, distant storms, snowpack and forecast are pure in place and minute, so clients agree without
messages. Online the room holds the weather-events preference on (`weatherEvents: true` in
`src/net/profile/officialProfile.ts`, the server kit's default profile).

### Rendering

| Effect | File |
| --- | --- |
| Rain and snow particles | `src/render/precipitation.js`, travel-view veils in `src/render/rainCurtains.js` |
| Clouds | `src/render/volumetricClouds.js`, `cloudShadow.js` |
| Lightning | `src/systems/lightning.js` (strikes, bolt paths), drawn by `src/render/lightningBolts.js` |
| Distant storms | `src/systems/distantStorms.js`: strikes seeded by storm and minute; thunder at 343 m/s, audible within 25 km |

## Sky

- Classic sky: `src/render/skyRenderer.js`.
- Enhanced sky: `src/render/enhancedSky.js` draws the sun, the two moons Masser and Secunda (phases from the
  calendar), stars and cloud layers.
- `src/world/dreadSky.js` is an event sky with red strikes.

### Dynamic Skies

> Leaves core: the Dynamic Skies mod (decision 99).

`src/systems/dynamicSkies/dynamicSkies.js` ports the logic of the Dynamic Skies mod
(`vendor/dynamic-skies/`): presets, light curve, moon orbits, and fog presets that replace the weather manager's.
`dynamicSkiesRuntime.js` holds the instance, `src/render/dynamicSkiesRenderer.js` draws it. It runs on the enhanced
lane when the mod setting is on; `createSkyController` in `src/scenes/shared.js` decides.

The firmament (`src/systems/firmamentLive.js`, `firmamentPowers.js`) is not a sky. It is the online passive skill
tree; see [characters.md](characters.md).

## Snow

Classic winter ground is calendar-only: `src/world/climateSwaps.js` `getTerrainGroundArchive` swaps to the winter
archive, as Daggerfall Unity's `ClimateSwaps`. This stays in core. Two snow systems sit on top of it:

- `src/systems/weather/snowpack.js` integrates snow water over the weather map's history with
  `src/systems/weather/airTemperature.js`, and gives snowlines that `src/render/snowCoverGlsl.js` reads. It is part of
  the weather map's lane.
- Snowfall, below.

### Snowfall

> Leaves core: the Snowfall mod (decision 99).

`src/systems/snowfall.js` and `snowfallRuntime.js` port demifiend000's Snowfall 1.0.5 (`vendor/snowfall/`): depth
grows 0.1 m per 3 hours of snowfall and melts 0.1 m per 72 clear hours, with footprint tracks (`PersistentTrackField`,
saved). The host is `src/scenes/snowfallHost.js`; the shader is `src/render/snowfallSurface.js`.

## Seasons and climates

- `src/world/climateSwaps.js` ports `ClimateSwaps.ApplyClimate`. It has its own `SEASON` enum (Summer 0, Winter 1,
  Rain 2), not `gameDate.js`'s. Interiors always use summer.
- `src/world/seasonReskin.js` `createSeasonReskin` re-skins or rebuilds streamed pixels when the season changes.
- `src/systems/weather/airTemperature.js` is an air model in Celsius (lapse rate with altitude). It decides the snow
  share of precipitation (`snowShareOf`) and feeds the snowpack. It does not feed the survival arc's felt temperature.

### Seasons of the Iliac Bay

> Leaves core: the Seasons of the Iliac Bay mod (decision 99).

`src/systems/seasonsIliacBay.js` ports RosyTheRascal's Seasons of the Iliac Bay 1.1 (`vendor/seasons-iliac-bay/`):
seasonal texture atlases swapped in at each new month, load and fast travel.

## Survival arc

> Leaves core: Climates & Calories, whole, with the arc built on it (decisions 77 and 93).

The game's own design after Ralzar's Climates & Calories (`vendor/climates-calories/`). One Features row,
`mod-climates-calories` (key `survival`), picks a tier: Off (Daggerfall Unity's game), Boons (the default), Casual or
Hard. Each player picks their own online. `src/systems/survival/switch.js` (`survivalTier`, `survivalOn`,
`survivalRules`) is the one switch every part reads. When the arc leaves, core falls back to Daggerfall Unity's
starting gear, shops and rest.

- `src/systems/survival/needs.js` `survivalMinute`: hunger, thirst, sleep, wetness and exposure, one law per world
  minute, run from `tickPlayerMinutes`.
- `src/systems/survival/temperature.js`: the felt temperature in abstract degrees (`CLIMATE_TEMP`, `MONTH_TEMP`,
  `NIGHT_MULT`, `WEATHER_TEMP`, `feltTemperature`).
- `src/systems/survival/` also holds food, camps (`camp.js`, stood by `src/scenes/camps.js`), hearths and the tier
  table (`difficulty.js`). The rest supplies are `src/systems/rest/restItems.js` and `restItemRows.js`.

## Tests

| Area | Test files |
| --- | --- |
| Clock | `test/world/clock.test.js`, `test/systems/clockrefusal.test.js`, `test/systems/time1_sky.test.js`, `test/systems/time2_moon.test.js` |
| Calendar, holidays | `test/systems/holidays.test.js`, `test/scenes/seasoncalendar.test.js`, `test/systems/daychange.test.js` |
| Rest | `test/systems/rest/rest.test.js`, `test/systems/rest/canrest.test.js`, `test/systems/rest/restx2_online_rest.test.js`, `test/net/restsync.test.js` |
| Weather | `test/systems/weather/weathersim.test.js`, `test/systems/weather/weather3a_weathermap.test.js`, `test/systems/weatherfront.test.js`, `test/systems/weather3d_distantstorms.test.js` |
| Sky | `test/systems/dynamicSkies.test.js`, `test/render/sky.test.js` |
| Snow | `test/systems/snowfall1_model.test.js`, `test/render/snowfall1_runtime.test.js`, `test/systems/weather/precip3_snowpack.test.js` |
| Seasons, climate | `test/systems/seasonsIliacBay.test.js`, `test/formats/climate.test.js`, `test/systems/survival/fb1015f_wetfall.test.js` |

## Traps

- Two season enums, two temperature models and two snow systems exist side by side. Check which one a caller reads.
  `gameDate.js`'s `SEASONS` and `climateSwaps.js`'s `SEASON` are Daggerfall Unity ports and stay in core. The felt
  temperature leaves with the survival arc, and Snowfall leaves as its own mod.
- Online, a write to the world clock silently does nothing. Move the character's own clock instead.
- `bandNight` in `src/scenes/world.js` repeats the dawn and dusk hours as literal minutes (360 and 1080).
- Weather must stay a pure function of place, minute and the shared seed, or online clients disagree.
