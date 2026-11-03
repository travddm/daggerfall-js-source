# Hosts and the modules they wire

This page covers the scene hosts, the rule that keeps them from growing, the shape of a module a host wires, and how
systems, UI and networking connect to a host. Read it before you add a feature to a scene.

## The hosts

A host is a function that owns a scene's state and frame. Most game state lives in local variables inside it.

| Host | File | Role |
| --- | --- | --- |
| `bootWorld` | `src/scenes/world.js` | The streaming world: the main game. |
| `createWorldModes` | `src/scenes/worldModes.js` | The interior, dungeon and modal-arm machine inside a host. |
| `buildDungeonContext` | `src/scenes/dungeonContext.js` | Builds and runs one dungeon against the host's caches. |
| `bootExterior` | `src/scenes/exterior.js` | One location, standalone. |
| `createNavalHost` | `src/scenes/naval/navalHost.js` | Ships and sea travel. |
| `createComeSailAwayRuntime` | `src/systems/comeSailAway/comeSailAway.js` | The ship-crew runtime. |
| `Room` (`_message`) | `server/src/index.js` | The relay's per-room Durable Object and its message dispatcher. |

These functions are each thousands of lines long. Any change inside them is hard to review and is reached by most of
the test suite.

## The rule: new behaviour goes into a module the host wires

Do not add a feature to a host function. Write it in a module of its own, and add only the wiring to the host:

- The module owns its state and its per-frame work.
- The host constructs it once, passes it what it needs, and calls it from the frame.
- On the relay, new message handling goes into a `Room` method of its own. `_message` only dispatches to it.

When you change code that is already inside a host, consider moving that code and its close neighbours out into a
module first, unchanged, and then making the change in the module. Move and behaviour change go in separate commits.

## The shape of a host module

A host module exports a constructor that takes one object of dependencies and returns an object of methods. Most live
in `src/scenes/` and are named `<feature>Host.js`. `src/scenes/merchantYardsHost.js` is a clear example:

```js
// src/scenes/merchantYardsHost.js
export function createMerchantYards({
  renderer = null, getTexture = null, sites, groundAt, collider = () => null,
  eye = () => null, feet = () => null, open = () => false, say = () => {}, now = () => performance.now(),
  /* ... */
}) {
  const yards = new Map();   // the module's own state
  return {
    frame() { /* per frame: stand, move or take down each yard */ },
    draw(r = renderer, cull = null) { /* its part of the world pass */ },
    batches() { /* billboards for the host's batch list */ },
    targets() { /* what the player can activate */ },
    activate(key, mode, verb) { /* a press */ },
    dispose() { /* release GPU and collider resources */ },
  };
}
```

And the host side, in `bootWorld`:

```js
merchantYards = createMerchantYards({
  renderer, getTexture, uploadRecordFrame, collider: () => collider,
  sites: () => { /* read the built pixels, return yard sites in scene coordinates */ },
  groundAt: (x, z) => surfaceAt(x, z),
  eye: () => cam.pos,
  open: (site, mode, name) => modes?.openYardTrade?.(/* ... */) ?? false,
  say: (text) => townTalk.say(text),
});
```

Conventions:

- **Dependencies are named fields of one object, with defaults.** A value that the host can replace (the collider,
  the current mode, the online session) is passed as a getter, `() => collider`, never as the value. A constant or a
  function that never changes can be passed directly.
- **Callbacks back into the host are dependencies too** (`open`, `say`). The module does not import the host and does
  not reach into its variables.
- **Returned methods are the whole interface.** Typical names: `tick(dt)` or `frame(dt)` for per-frame work, `draw`
  for render work, `onBuilt(pixel)` / `onDestroyed(pixel)` for streaming events, `targets` / `activate` for
  interaction, `dispose()` for teardown.
- **Pure helpers are separate named exports** of the same module, so tests can call them without a host.
- **A test imports the module and runs it** with fake dependencies. It does not read the module's source text.

Some modules plug into a host module instead of the host. `src/scenes/gatherHost.js` (`createGatherHost`) runs every
gathering profession; each profession is a "kind" object built by its own module, for example `fishKind({ book, host
})` in `src/scenes/fishHost.js`, and passed in its `kinds` list. Add a new profession as a new kind, not as code in
`gatherHost.js`.

Other examples of the pattern: `createBountyHost`, `createCaravanHost`, `createMentorHost`, `createCraftWritHost`,
`createGrantHost`, `createChatSafetyHost`, `createCityGuards` and `createPixelBuild` (all in `src/scenes/`).

## How systems, UI and net connect

There is no event bus. Coupling is explicit:

- **Direct imports.** A host imports the system, UI and net modules it uses. `world.js` imports several hundred.
  Systems and net modules import each other directly.
- **Closures and getters.** A module reads host state through the getters it was given. Hosts read each other through
  closures (`() => online`, `() => modes`).
- **The mode machine's host object.** `createWorldModes` receives one large object literal of values, getters and
  callbacks from `bootWorld`. A new modal feature adds its fields there.
- **Online.** `bootWorld` creates one `OnlineSession` (`src/net/online.js`) when the boot asks for online play.
  `onlineFrame` sends the player's pose and look and calls `online.tick()` each frame. Feature code reaches the session
  through a getter and must handle `online` being `null` (offline play).
- **Shared law in `src/net/`.** Rules that both the client and the relay run (`*Law.js` files and others) live in
  `src/net/`, and `server/` imports them. Keep those modules free of DOM and WebGL so the Worker can load them.
- **Messages to the player.** `src/systems/notify.js` presents message boxes and HUD text (`messageBox`,
  `hudTextWhenShown`). Windows are mounted through it so they queue correctly.

## Settings and preferences

There are three stores. `src/systems/features.js` is the registry that the Features screen draws over all three; it
holds no values itself.

| Store | Module | Holds |
| --- | --- | --- |
| Daggerfall Unity's settings | `src/systems/settings/settings.js` (`getInt`, `getBool`) | The settings Daggerfall Unity has, by section and key, for example `Video.RetroRenderingMode`. |
| The game's own preferences | `src/systems/uiPrefs.js` (`getPref`) | Everything Daggerfall Unity does not have: enhanced lighting, render scale, touch options. |
| Mod settings | `src/systems/modSettings.js` | The settings of each vendored mod. |

The UI skin (`enhanced` or `classic`) is `src/systems/uiSkin.js` (`isEnhanced()`). Many enhanced visual features
require the enhanced skin and their own preference.

## Code standard

Write new code to this standard; do not copy the denser style of the hosts.

1. One statement per line.
2. Names say what a thing is: `pixel`, not `p`; `deepWaters`, not `dw`. Abbreviations only where the field uses them
   (`DFU`, `HUD`, `UV`).
3. Comments say why: the reason, the trap, or the Daggerfall Unity member the code follows or departs from. History
   belongs in git, not in comments.
4. Shapes are declared. An object that travels between functions has a JSDoc `@typedef` or a class. Do not add fields
   to a plain object where it is used. Shapes that cross into the renderer are in `src/render/contract.js`.
5. A file and a function fit in a reader's head.

New files should start with `// @ts-check` so `npm run types` checks them.

## Daggerfall Unity as the reference

DFO Online is its own game. Daggerfall Unity is where you look first, not a target to match:

- Before you build something Daggerfall Unity has, read its version, and search this tree for the member's name and
  its constants so you do not create a second copy.
- Format readers in `src/formats/` read ARENA2 exactly as Daggerfall Unity does. Constants and tables translated from
  it stay byte-exact.
- When behaviour departs from Daggerfall Unity on purpose, the comment names the member it departs from (for example
  `FormulaHelper.CalculateX`) and says why.
