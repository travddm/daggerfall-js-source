# Boot and the frame

This page covers how the client starts, which scene host takes over, and the order of work inside one frame. Read it
before you add anything that runs every frame.

## The entry: `src/main.js`

`play/index.html` holds one canvas (`#c`) and loads `src/main.js`. `boot()` in that file does this, in order:

1. `installFramePacer()` (`src/systems/frameCap.js`) and `installCursor()` (`src/ui/cursor.js`).
2. Creates the one `Renderer` (`src/render/renderer.js`) on the canvas. Every scene uses this renderer; no scene
   creates a second WebGL context for the world.
3. Gives the renderer its per-frame setting sources: `setRetroSource(retroFrameConfig)` and
   `setRenderScaleSource(renderScaleSetting)`. The renderer asks them once per world frame, so a settings change
   applies on the next frame.
4. Loads the language (`src/scenes/localeData.js` `initLocale`), mounts the FPS counter (`src/ui/fpsCounter.js`) and,
   in the desktop app, the update notice.
5. Routes on the query string (table below). A route that needs game data first awaits `ensureArena2()`
   (`src/scenes/dataSource.js`).

With no route parameter, `boot()` runs the intro (`src/ui/intro/introScreen.js` `runCinematicFrontDoor`) and the
Enhanced main menu (`src/ui/enhanced/enhancedMenu.js` `runEnhancedMenu`). The menu answers with a choice (`continue`,
`load`, `online`, `online-new`, `test:<preset>`, `begin`). `boot()` turns the choice into query parameters (`load`,
`loadkey`, `online`, `realm`, `test`, `classic` and others), publishes them with `publishBootParams`
(`src/systems/online/onlineLane.js`), and calls `bootWorld`. The `begin` choice takes the classic path: the
`ANIM0001.VID` splash, the classic menu (`src/scenes/menu.js` `runMenu`), then `bootWorld` with `classic=1`.

| Query | Host | Module |
| --- | --- | --- |
| (none), `?world` | `bootWorld` | `src/scenes/world.js` |
| `?exterior`, `?region=`, `?loc=` | `bootExterior` | `src/scenes/exterior.js` |
| `?dungeon=<name>` | `bootDungeon` | `src/scenes/dungeon.js` |
| `?interior=<block>:<record>` | `bootInterior` | `src/scenes/interior.js` |
| `?shot`, `?nomenu` | `bootDungeon` | `src/scenes/dungeon.js` |

Every host has the signature `(canvas, renderer, params, status)`. `status(text)` sets the document title.

### The hosts are dynamic imports

`main.js` reaches each host through a dynamic `import()` at the moment of use (`const bootWorld = (...a) =>
import('./scenes/world.js').then(...)`). A static import would pull the whole game graph into the entry chunk before
the menu shows. `test/scenes/boot1.test.js` walks the entry's static import graph and fails if a host appears on it.
Keep it that way: do not import a scene host, or a module that imports one, from `main.js` or from the menu.

Hosts must have no import-time side effects, so loading them later changes only when they evaluate.

### Boot failures

`boot()`'s promise has one catch. `staleChunkAction` (`src/systems/staleChunk.js`) decides whether the error is a
missing chunk from an older deploy. If so, the page reloads once (a flag in `sessionStorage` prevents a reload loop).
Otherwise the page shows `boot failed: <message>`. When the error is about the stored ARENA2 folder, the page also
offers a button that clears IndexedDB (`clearStoredData`) and reloads.

## The streaming world: `bootWorld`

`bootWorld` (`src/scenes/world.js`) is the main game. It is one very large function: every piece of game state is a
local variable in its scope, and the modules it wires read that state through closures. It sets up, in source order:

1. Realm session and save state (`createRealmSession`, `src/systems/realmSaves.js`), map data (`MapsFile`), the
   location index, the boot start (`createBootStart`, `src/scenes/bootStartHost.js`) and the sky
   (`createSkyController`, `src/scenes/shared.js`).
2. The streaming terrain: `BuiltPixels` and `StreamingWorldState`. The world is streamed by map pixel; each built pixel
   holds its terrain, models, flats and colliders.
3. Camera (`cam`, `LookFilter`, `CameraRecoiler`) and the player motor (`PlayerMotor`, `src/player/`).
4. UI: the HUD, town talk, the weapon rig and the windows.
5. Host modules, for example `createGatherHost` (`src/scenes/gatherHost.js`).
6. Input: the edge latch, the held-key set, `attachTouch` (`src/ui/touch/`) and `attachGamepad`.
7. Online: `new OnlineSession({...})` (`src/net/online.js`), when the boot asked for online play.
8. The mode machine: `createWorldModes({...})` (`src/scenes/worldModes.js`).
9. The frame function `frame(now)`, started with `requestAnimationFrame(frame)`.

## The modes: `createWorldModes`

`createWorldModes(host)` (`src/scenes/worldModes.js`) owns everything modal. The host scene stays in `exterior` mode
until the player uses a static door. Then the mode machine swaps the whole frame pipeline (draws, lighting, fog,
collider) to a built context, and swaps it back on exit.

- **Modes:** `exterior`, `interior` and `dungeon`. Further modal arms (the gate arena, the arena floor, the Shattered
  Hour realm and the abyss) enter through their own `enter*` functions.
- **Contexts:** an interior is built by `src/scenes/interiorContext.js`; a dungeon by `buildDungeonContext`
  (`src/scenes/dungeonContext.js`), which builds against the host's caches.
- **Switching:** `setMode(next)` changes the mode. Entries go through `gatedTransition` and `createTransitionGate`
  (`src/scenes/transitionGate.js`) so that only one transition runs at a time (`transitioning`). The main paths are
  `enterBuildingDoor` / `interiorTransition` / `exitInteriorNow` and `tryEnterDungeon` / `dungeonTransition` /
  `tryExitDungeon` / `exitDungeonNow`.
- **Host contract:** the host passes the live scene objects (`canvas`, `renderer`, `player`, `cam`, `keys`), the edge
  latch, `blocks`, the data `pipeline` (`src/scenes/dataPipeline.js`), `doorTargets()` and `baseCollider()`, plus many
  callbacks and getters. The header comment of `worldModes.js` lists the core of it.
- **Returned API (`modesApi`):** `mode` (getter), `frame(dt, now)`, `forceExitToExterior`, `dungeonCtx`,
  `transitioning`, `quickSaveNow` and others.

`modes.frame(dt, now)` returns `false` in exterior mode. In any other mode it runs the whole modal frame (player
update, interaction, render) and returns `true`; the host then skips its exterior path. Door-target translations must
not change while a mode is active, which holds because the host skips its streaming and recentre step.

`bootExterior` also uses `createWorldModes`, so one location behaves like the world. `bootInterior` and `bootDungeon`
are standalone scenes with their own loops; `bootWorld` never calls them.

## One frame of `bootWorld`

`frame(now)` in `src/scenes/world.js` runs once per animation frame. The order matters: a later step reads what an
earlier step wrote.

| Step | Work | Notes |
| --- | --- | --- |
| 1 | Guards: `frameAlive`, `frameCapSkip`, `frameBegin` | A stale frame token stops an old loop; the frame cap (`src/systems/frameCap.js`) may skip this frame. |
| 2 | Input edges: `beginInputFrame(latch.edge)` | Edge-detected presses are valid for this frame only. |
| 3 | `frameHeld()` | A full-screen video holds the frame and returns early. |
| 4 | `dt` (clamped to 0.1 s), `gamepad.tick(dt)`, look filter | |
| 5 | `cameraRecoiler.update` | |
| 6 | `onlineFrame(now, dt)` | Only when online and the player has spawned: sends look and pose, then `online.tick()`. |
| 7 | Loading and foes: `syncInteriorLoad`, `syncLoading`, `tickTactics`, ambient text | |
| 8 | `modes.frame(dt, now)` | Interior, dungeon and modal arms draw here and the host returns. |
| 9 | Exterior simulation: travel view, `player.update`, host module ticks (`gatherHost.tick`), season, ambience, wind, spawners, city gates | |
| 10 | Render setup: `setFog`, `setLighting`, `setClearColor`, `renderer.beginFrame(proj, view, sunDirection(minute), WORLD_FRAME)` | |
| 11 | World draws: terrain and meshes, sky (`sky.draw`), billboards (`drawBillboards`), held items, particles | Pass order inside the renderer: [rendering/renderer.md](../rendering/renderer.md). |
| 12 | HUD: `frameHud()` | 2D pass; the first screen-space draw composites the enhanced post effects. |
| 13 | `renderer.resolveFrame()`, `frameEnd()`, `requestAnimationFrame(frame)` | |

Rules for code that runs in the frame:

- Each host claims a frame generation at boot (`claimFrame()` in `src/scenes/shared.js`) and checks it at the top of
  every frame (`frameAlive(token)`). A later boot or an unwind claims a new generation, so an old loop stops instead of
  updating foes against torn state. A new host loop must do the same.
- Keep simulation independent of what was drawn. Frustum culling (`src/render/frustum.js`) and render scale decide
  draws; game logic must not read their results.
- Do not allocate per frame on hot paths. Reuse typed arrays and scratch objects as the surrounding code does.
- A host module runs its per-frame work from the host's frame (its `tick(dt)` or `frame(dt)`), not from its own
  `requestAnimationFrame`. A module that must stop while a modal mode runs is called only from the exterior branch.
- Wrap a module's tick in `try`/`catch` when a failure in it must not stop the frame; the host already does this for
  `gatherHost.tick`.
