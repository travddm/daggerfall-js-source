# Source layout, global state and debug hooks

This page maps `src/`, says where a new file goes, and lists the global debug hooks and URL parameters that tools and
manual testing use.

## `src/` by folder

| Folder | Holds |
| --- | --- |
| `src/main.js` | The entry point and scene router ([boot-and-frame.md](boot-and-frame.md)). |
| `src/buildTag.js` | The build's commit, written by `scripts/buildTag.mjs` at build time. Do not edit. |
| `src/ai/` | Enemy behaviour: tactics, attack choice, tells, cover, navigation (`nav/`). |
| `src/assets/` | Source art that the code imports (images, meshes, data). |
| `src/characters/` | People and creatures: bodies, rigs, animation, equipment rules, paperdoll, name generation, encounter tables. |
| `src/combat/` | Combat rules: formulas, weapons, first-person arms, blood, techniques, spell casting in first person. |
| `src/formats/` | Readers for Daggerfall's file formats (BSA, TEXTURE, IMG/CIF, ARCH3D, BLOCKS, MAPS, SKY, sound, video, saves) and for Morrowind and Unity data (`morrowind/`, `unity/`, `save/`, `worldData/`). |
| `src/net/` | The online client (`online.js`, `accountClient.js`, chat) and the rules both the client and the relay run (`*Law.js`). Feature folders per online feature. |
| `src/player/` | The player in the world: motor, collision, camera, pointer lock, first-person views, seats, climbing. |
| `src/poi/` | The points-of-interest editor and feed. |
| `src/render/` | The WebGL2 renderer, its shaders and passes ([rendering/](../rendering/README.md)). |
| `src/scenes/` | The scene hosts (`world.js`, `worldModes.js`, `dungeonContext.js`, `exterior.js`, `interior.js`, `dungeon.js`), the host modules they wire (`*Host.js` and others), and shared scene code (`shared.js`, `dataSource.js`, `dataPipeline.js`). |
| `src/systems/` | Game rules that are neither combat nor online: items, quests, guilds, travel, time, weather, saving, sound, settings, preferences. About 60 feature folders. |
| `src/tools/` | Code for the lab pages (`sky.html`, `water.html`, `studio.html` and others). Not loaded by the game. |
| `src/ui/` | Every window, menu and HUD element, classic and Enhanced; input (`input.js`), touch (`touch/`), the intro. |
| `src/world/` | World assembly: terrain, blocks, locations, dungeons, buildings, water, roads, the map of Tamriel (`tamriel/`), the registry of places (`worldWide/`). |

## Where a new file goes

1. Choose the layer first: `src/net/` for rules the relay also runs, `src/render/` for drawing, `src/ui/` for windows
   and HUD, `src/systems/` for game rules, `src/world/` for what the world is made of, `src/scenes/` for wiring into a
   host.
2. A feature with three or more modules in one layer gets a folder of its own name in that layer (for example
   `src/systems/arena/`, `src/net/arena/`, `src/scenes/arena/`, `src/ui/arena/`).
3. Code shared across features stays loose in the layer folder.
4. Name the file for what it holds. Avoid generic names (`utils.js`, `helpers.js`): the test selector and search
   match by file name.

`test/` mirrors these layers: a module in `src/render/` is tested in `test/render/`.

## Global state

There is no global store. State lives in:

- **Host scope.** Most live game state is local to `bootWorld` (and to the other host functions) and reaches modules
  through getters ([hosts-and-modules.md](hosts-and-modules.md)).
- **Module scope.** Some modules keep a single instance at module level, for example the frame generation in
  `src/scenes/shared.js` (`claimFrame`, `frameAlive`), the notification queue in `src/systems/notify.js`, and the
  ARENA2 cache in `src/scenes/dataSource.js`. These modules export a reset function for tests where needed (for
  example `_resetNotifyForTests`).
- **Storage.** Preferences and settings persist in `localStorage` through their modules. ARENA2 files, user music and
  local saves persist in IndexedDB. Always go through the owning module; storage can throw in private browsing, and
  the modules handle that.
- **The page URL.** Read query parameters through `src/systems/pageQuery.js` (`pageParam(name)`, `pageHas(name)`),
  which parses the URL once. Online boot parameters are published by `publishBootParams`
  (`src/systems/online/onlineLane.js`) so every reader of `location.search` sees the same values.
- **The desktop shell.** In the Electron app, `globalThis.daggerShell` is the bridge from `app/preload.cjs`. Check
  for it before use; the browser does not have it.

## Debug hooks and URL parameters

### `window.__*` hooks

The hosts publish debug hooks on `window` for the Playwright probes in `tools/` and for manual testing in the
console. Most are set only when the page has `?shot` (`shotMode` in each host). They are not an API for game code:
game code must never read them.

| Hook | Set by | Gives |
| --- | --- | --- |
| `__console(line)` | `world.js` offline (`src/systems/consoleCommands.js`) | Runs a developer console command. Works only when the setting `Enhancements.LypyL_GameConsole` is on. Not gated by `?shot`. |
| `__frame` | all hosts | A frame counter; probes wait on it to advance. |
| `__shotReady` | `dungeon.js`, `exterior.js`, `interior.js` | True when the `?shot` scene is ready to capture. |
| `__renderer` | `world.js`, `dungeon.js`, `exterior.js` | The `Renderer`, for `stats` and `frameInfo`. |
| `__player`, `__playerEntity`, `__cam` | `world.js`, `dungeon.js`, `exterior.js` | The player motor, its entity and the camera. |
| `__move`, `__pose`, `__look` | `world.js` | Place the player and set the view. |
| `__streamIdle`, `__builtCount`, `__currentPixel`, `__pixelBuild` | `world.js` | Streaming state, for probes that wait for the world to settle. |
| `__quickSave`, `__quickLoad`, `__loadSave`, `__saveKeys` | `world.js` | Saves. |
| `__travelMap`, `__openTeleportMap`, `__encounters`, `__spawnEncounter` | `world.js` | Travel and encounters. |
| `__talk`, `__people`, `__guards`, `__crime`, `__townDebug` | `exterior.js`, `src/scenes/townProbes.js` | Town probes. |
| `__foes`, `__damageFoe`, `__hp`, `__piles` | `dungeon.js` | Dungeon probes. |

Search `src/` for `window.__` for the full list. The lab pages set their own hooks (`__lab`, `__skyReady`,
`__waterReady`); these are not game hooks.

### URL parameters

Routes are in [boot-and-frame.md](boot-and-frame.md). Other parameters:

| Parameter | Effect |
| --- | --- |
| `?fps` | Shows the FPS counter with the renderer's counts (draws, binds, GPU name, frame size). |
| `?perf` | Logs GPU frame time and pass counts to the console (`src/render/perfMeter.js`). |
| `?shot` | Fixed vantage and debug hooks for `tools/screenshot.mjs` and the probes. |
| `?nointro`, `?novideo` | Skip the intro and the splash video. |
| `?test=<preset>` | Start in the Test Room with a prebuilt character (`src/systems/testRoom.js`). Online is refused there. |
| `?online`, `?load`, `?loadkey=`, `?realm=` | Set by the menu for the chosen start. Rarely typed by hand. |
| `?renderscale=<tier>` | Overrides the render scale preference (`src/systems/renderScale.js`). |
| `?lighting=classic`, `?air=off`, `?contact=off`, `?clusters=off`, `?shadowcache=off` | Turn off parts of enhanced lighting. |
| `?sky=classic`, `?sky=dynamic`, `?clouds=off`, `?water=off`, `?wisps=off`, `?cull=off` | Turn sky, clouds, water, wind wisps or frustum culling off or switch them. |
| `?music`, `?textures` | Open the folder pickers for replacement music or textures. |
| `?introat=<s>`, `?introdebug` | Dev server only: freeze or debug the intro. |

The renderer's switches are described in [rendering/performance.md](../rendering/performance.md).
