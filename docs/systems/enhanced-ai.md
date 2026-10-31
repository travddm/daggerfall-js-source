# Enhanced AI

This page covers the Enhanced AI: the optional layer over Daggerfall's classic foe behaviour that adds navmesh
pathfinding, group tactics, cover, telegraphed blows with poise and staggers, and the feud ledger that revenants read.
It also covers how the layer is switched on and how it falls back to the classic motor.

## Classic AI and the enhanced layer

The classic foe AI is `EnemyAI` in `src/characters/enemy/enemyMotor.js`, with attacks in
`src/characters/enemy/enemyAttack.js`. It ports Daggerfall Unity's `EnemyMotor` / `EnemySenses` / `EnemyAttack` classic
path: senses, the classic update tick, the destination, the yaw gates, the obstacle probe, knockback, flight, water.

The enhanced layer never replaces that motor. It hooks in at three points:

| Hook | What it changes | Where |
| --- | --- | --- |
| Destination | Where the foe walks to: the next navmesh waypoint instead of a straight line | `EnhancedEnemyAI` in `src/ai/enhancedMotor.js` (a subclass of `EnemyAI`) |
| Step decision | Which way the foe steps and whether it may strike or shoot | `tacticsStep` in `src/ai/tactics.js`, called from `EnemyAI`'s classic tick |
| Sight and missiles | Billboard props block sight and projectiles | `createCoverIndex` in `src/ai/cover.js`, stored as `collider.cover` |

With the switch off, `tacticsStep` returns false and writes nothing, the cover index answers nothing, and hosts build
plain `EnemyAI`. The result is Daggerfall Unity's classic behaviour.

Departure from Daggerfall Unity: DFU has its own "Enhanced Combat AI" setting ("Smarter Enemies"). This port does not
implement it; the port runs DFU's classic path only. The Enhanced AI here is a separate design that shares half a name.

## The switch

- Pref key `enhancedAI` in `src/systems/uiPrefs.js`, declared as the `enhanced-ai` row in `src/systems/features.js`
  (group `combat`).
- `initial: true` (on by default offline). `online: true`: the online lane forces it on for every player
  (`src/systems/online/onlineLane.js` derives this from the row).
- `PREF1_ADOPT_NEW_DEFAULT` in `uiPrefs.js` lists `enhancedAI`: a prefs shelf saved before the default changed adopts
  the new default once. A shelf with `featuresRestore` set and no `enhancedAI` key keeps it off.
- The row has a sub-part `telegraphContrast` (default off, the player's own choice online): thicker telegraph lines, a
  white keyline, and a pattern per guard. `telegraphContrastOn` in `src/render/foeTelegraph.js` reads it each draw.

Each module reads the switch itself, so a host does not need to: `tacticsSwitchOn` (`tactics.js`), `coverSwitchOn`
(`cover.js`), and the `enabled` default of `createInteriorNav` (`src/scenes/interiorNav.js`). Tactics, cover and blows
read it live. Pathfinding takes effect from the next dungeon or building entered, because the motor class is chosen at
spawn.

## Navigation (navmesh)

Files in `src/ai/nav/` and `src/ai/triRaster.js`.

| File | Role |
| --- | --- |
| `navmesh.js` | Recast/Detour-style pipeline: voxelise colliders (`buildNav`), walkable filter and erosion (`buildCompact`), regions, contours, poly mesh, detail heights, `findPath` (poly A* plus funnel), dynamic obstacles (`addNavObstacle`, `syncNavObstacles`), serialise (`bakeNavData`, `hydrateBakedNav`) |
| `triRaster.js` | Turns the level's triangle soup into one box per (cell, span) that `navmesh.js` can voxelise (`trianglesToColliders`); packs boxes for transfer |
| `navBake.js` | The one bake core (`bakeSoup`, `bakeNavFromCollider`): soup from a `Collider` (`navInputFromCollider`), anchors that pick the reachable islands (`landAnchors`) |
| `navWorker.js` | Web Worker that runs `bakeSoup` off the frame and posts back the compact form plus packed boxes |
| `navClient.js` | `NavClient`: fingerprint the soup, ask the IndexedDB cache (`idbStore` from `src/world/roadsCache.js`), else the worker, else bake on the main thread; hydrate on the main thread |

`navmesh.js` was ported whole from an earlier sibling project. Its body is pinned by digest in
`test/ai/nav/enhancedAI.test.js`. Port-specific helpers (such as `reachableFrom`) sit above the pinned body. A change to
the body must re-record that digest on purpose.

### Who bakes

- **Dungeons**: `src/scenes/dungeonContext.js` creates a `NavClient` on entry when the switch is on, bakes the
  dungeon collider with the unlocked action doors left out of the soup, and anchors on the player and the layout's foes.
  The bake is cached per dungeon.
- **Building interiors**: `createInteriorNav` in `src/scenes/interiorNav.js`, mounted and released by
  `src/scenes/worldModes.js`. It bakes on need (the first frame a motor reads it), is not cached, and re-bakes when a
  door lock changes the soup or the hunted player stands off every island (a bounded number of times a room). It hands
  `nav` and `navGoal` to the watch (`src/scenes/cityGuards.js`) and the building's foes (`src/scenes/exteriorFoes.js`).
- **Party ping routes**: `src/scenes/partyPingHost.js` bakes its own `NavClient` to draw a route; this is not foe AI.
- **Streets and wilderness**: no navmesh. Foes there use the classic motor, with tactics and cover still active.

### The enhanced motor

`EnhancedEnemyAI` answers one question differently from `EnemyAI`: the destination. It reads the bake every step
through `opts.nav` (a thunk; null means classic). Per frame, `makeNavWorld().pathBudget` caps `findPath` calls
(`PATH_BUDGET_PER_FRAME`) so a spawned wave does not stall the frame.

- Repath every `REPATH_INT` s toward the moving target; back off `REPATH_FAIL` s after a failed path.
- Stuck watch: no progress for `STUCK_T` s triggers a side-step (`STUCK_NUDGE`) that goes through `collider.move`,
  never a direct write, then drops the route.
- Intermediate corners are projected along their direction to at least `stopDistance`, so the classic stop check does
  not halt the foe at each corner. The final point is not projected.
- Waypoint heights are not steered at. A corner takes the foe's own y; the goal takes classic `_aimY`. Flyers and
  swimmers would otherwise dive at the phantom floor under doorways.
- `_routeOffMesh`: when the goal is off the mesh (a player wedged between shelves), the host's `navGoal` names the
  nearest mesh point; the route ends there and the last leg is a straight walk.
- No bake, no path, or the classic detour running: the classic destination.

### Traps

- `NAV_BAKE_VERSION` in `navClient.js` is part of the cache key. Bump it by hand whenever the bake output for the same
  input changes, or players keep a stale bake per dungeon forever.
- The worker must be created with the literal `new Worker(new URL('./navWorker.js', import.meta.url), { type: 'module' })`.
  Vite bundles a worker only from that spelling; any other form silently falls back to a multi-second main-thread bake.
- `DEGENERATE_MIN_TRIS`, `DEGENERATE_MIN_POLYS`, `DEGENERATE_POLY_SHARE` reject a bake far smaller than its input. When
  the worker dies on a large soup, the client does not re-bake on the main thread; the classic motor stands and the
  console logs `[enhanced-ai]`.

## Tactics (the brain)

`src/ai/tactics.js` is a thin decision layer read only while a foe sees its target within `TACT.ENGAGE_RANGE`
(`TACT.SHOOT_RANGE` for a shooter). Out of sight, the motor's own pursuit (and the navmesh) finds the way. The brain
sets `ai._tacDir`, `ai._tacSpeed`, `ai._tacStrike`, `ai._tacShoot`; the motor still walks. All numbers are in the
frozen `TACT` table.

- **Tokens**: per target, at most `MELEE_TOKENS` melee and `RANGED_TOKENS` ranged holders. Holders attack on the
  classic clock. The rest hold a ring just outside reach, each on its own slot, circling slowly.
- **Strike window**: after its blow a holder hops back (`RECOVER_HOP`) and passes the token to the foe that waited
  longest. A foe past `PATIENCE` goes in anyway. A target whose back is turned (`BACK_TURNED_DEG`) is open.
- **Backing off**: losing `HURT_SHARE` of health inside `HURT_WINDOW` makes a foe walk away for `BACKOFF`, at most once
  per `BACKOFF_COOLDOWN`.
- **Fleeing**: animals and `COWARD_CLASSES` (Mage, Sorcerer, Healer, Bard, Burglar, Acrobat, Thief) run below
  `FLEE_SHARE` health. Undead, daedra, constructs and guards never flee (`isCoward`).
- **Kiting**: a shooter with a token backs off a target inside `KITE_IN`, one burst (`KITE_MAX`) per `KITE_COOLDOWN`;
  cornered, it fights in melee.
- Foes walk the way they face (turn first, `WALK_FACE_DEG`); nobody backpedals after a pressing target.

Tokens live in one registry keyed by target (`targetKey`): the local player is one key (`LOCAL_TARGET`), every other
target its own object. `releaseTactics` frees a foe's tokens; a holder unseen for `STALE` s loses them.

The brain's clock is `src/ai/tacticsClock.js` (`tickTactics`, `tacticsNow`). Hosts tick it with the foes' own step
(`foeFrameDt`) and hold it at 0 while a window pauses the foes (`src/scenes/world.js`, `exterior.js`, `dungeon.js`).
Hosts also call `noteLocalPlayer(feet, forward)` each frame so foes can see the player's back.

## Cover

`src/ai/cover.js`. Daggerfall flats are billboards with no collider. With the switch on, every flat that reads as solid
(at least `COVER_MIN_H` tall and `COVER_MIN_W` wide, not in `NOT_COVER_ARCHIVES`) gets an upright cylinder proxy
(`coverProxy`; trees get a trunk and crown, `coverProxies`). Proxies live in an index beside the collider, never in it:
walking, the navmesh and ground probes are unchanged.

- Readers: foe sight rays, the clear-shot test, and every missile (player and foe arrows and spell bolts) via
  `coverDistance`. A charge's lane must also be free of cover.
- Sets are keyed like the collider's buckets, so a streamed pixel, building or dungeon takes its cover with it.
- The same index files prop bodies (`src/world/propBodies.js`) in a separate grid that only the player's clamp reads
  (`src/player/bodyClamp.js`). That part works whatever the switch.
- Hosts that stand an index: `src/scenes/world.js`, `exterior.js`, `dungeonContext.js`, `interiorContext.js`.

## Crowding and doorways (always on)

`src/characters/foeSpacing.js` runs whatever the switch: `spaceFoes` and `spaceAcross` push foes apart within and across
pools; `clearDoorways` eases a foe out of a door threshold unless its way lies through the door; `sweepHeight` uses the
foe's live height so a tall foe ducking under a lintel is swept correctly. `indoorWatchSpot` in `cityGuards.js` spreads
the indoor watch into lanes. `yieldsToDoor` (`src/player/mobileEnemyActivate.js`) and `peacefulFoePass`
(`src/player/activate.js`) let a door press pass a non-hostile foe.

## Telegraphed blows and tells

Files: `src/ai/foeBlows.js` (blow lifecycle), `src/ai/blowShapes.js` (shapes, a leaf), `src/ai/tells.js` (poise and
every `TELL` number), `src/render/foeTelegraph.js` and `src/render/telegraphStyle.js` (the ground mark).

A blow is the foe's own swing, delayed and shaped. A foe winds up with the shape drawn on the ground; at the landing the
brain forces the swing, and the host's hit resolution asks `blowConnects` (the shape's verdict in place of the reach
test) and `blowScaled` (the shape's multiplier on DFU's own damage roll).

- **Shapes** (`BLOW`): lunge, sweep, slam, ring, charge, leap, aimed shot, and the revenant pyre. `blowShapesOf` picks
  them by family (`BLOW_FAMILY`); `inBlow` tests a point.
- **Who**: `blowTier` - level `BLOW_TIER_LEVEL` and up, an elite, a champion or a revenant. Higher tiers get the whole
  set and shorter cooldowns (`TELL.COOLDOWN`, `blowCooldown`).
- **Sparingly**: one wind-up near the player at a time (`BLOW_NEAR`, `windupNear`), a per-foe cooldown, and only from a
  melee token holder in reach (charge, leap and aimed shot from their own bands).
- **Poise and stagger**: a winding-up foe takes no knockback; blow weight (`blowWeight`, weapon class `blowK`, back hits
  `POISE_BACK`) fills its poise (`poiseOf`). Full, the wind-up breaks and the foe is staggered (`STAGGER_S`), taking
  `STAGGER_TAKEN` more. `windupStruck` in `tactics.js` runs the meter.
- **Iron blows** (red, hatched) cannot be broken; they must be dodged.
- **Punish window**: a missed blow leaves the foe overreached (`PUNISH_S`, takes `PUNISH_TAKEN` more). Leaving the shape
  in the last `TELL_LATE` s is a perfect dodge with a longer window.
- **Patterns**: varied wind-up length, tracking lunges and charges, feints (`feints`; a feint never glints), chains.
- **Landing effects**: `src/systems/blowEffects.js` (push, bleed, rattle, knock-down; `blowEffectOf`, `drainBlowEffects`).
- **Damage modifiers**: staggered and overreached multipliers register through `registerBlowTakenMod` in
  `src/systems/blowTaken.js`, a leaf the combat formulas read.
- **Cues**: `tellCues` in `src/scenes/hostCombat.js` (glint, wind sound, release whoosh); `foeGlint` and `poiseTrack` in
  `tactics.js`.

`blowShapes.js` imports nothing so the renderer can read the shapes without pulling the brain onto its boot graph
(`test/render/boot2.test.js` checks this).

### Online

`src/ai/puppetBlows.js`. Each foe record carries its owner's live wind-up (`blowWire`): `wk` (shape index in
`WIRE_KINDS`, plus `WIRE_IRON`, `WIRE_FEINT` flags), `wy` yaw, `wl` milliseconds to landing (relative, because each
client's tactics clock is its own), `wo` origin, `wp` leap or shot distance, `ws` staggered/overreached. Peers rebuild a
synthetic brain state on the puppet (`applyBlowRecord`, marked `puppet`), so every reader treats it as local. Each
client judges its own feet at the landing. The class of a blow on a puppet rides back as `wc` (`blowClassOf`) so the
owner's poise meter weighs it. Senders and receivers: `src/scenes/dungeonContext.js` and `src/scenes/exteriorFoes.js`.

## Feud ledger

`src/systems/feudLedger.js` records how the player fought a foe that may become a revenant. It is a leaf: it imports
nothing, so the brain, the magic rounds and the hosts can write to it without loading the revenant system.

- The ledger lives on the foe's entity as `entity._feud`, opened on first write by `feudOf` only if the gate passes.
- Shape: `{ dmg: {<FEUD_CLASSES>: n}, silver, staggers, dodged, perfect, backHits, backstab, weak, night, place, start,
  last }`. `FEUD_CLASSES` is blade, blunt, axe, h2h, arrow, fire, frost, shock, poison, magic, other.
- Writers: `noteFeudHarm` (revenant strike listener, `src/scenes/hostMagic.js`, `src/systems/effects.js`), `noteFeud`
  (`tactics.js` for dodged and perfect, `hostCombat.js` for staggers and back hits), `noteFeudBackstab`.
- `src/systems/revenant/revenant.js` injects the gate (`setFeudGate` = `revenantCandidate`), the clock and night flag
  (`setFeudClock`), and the weakness test (`setFeudWeakTest`). `revenantDeed` takes the ledger with `takeFeud` and folds
  it into the revenant's scars (`src/systems/revenant/revenantFeud.js`).
- Revenants exist only with the Loot rarity row on (`revenantOn` = `lootRarityOn`). Their rules that need a telegraph
  (signature blows, the last-stand burst) also need the Enhanced AI switch.

## Tests

| Area | Tests |
| --- | --- |
| Switch and row | `test/systems/ft5_enhancedai.test.js`, `test/ai/audit59_enhancedai.test.js` |
| Navmesh and motor | `test/ai/nav/enhancedAI.test.js`, `enhancedAI4.test.js`, `audit62_enhancedai.test.js`, `audit68_enemies.test.js`, `audit0928_nav.test.js`, `fb1016b_indoorwatch.test.js` |
| Classic motor | `test/characters/enemy/enemymotor.test.js` |
| Cover | `test/scenes/tact1.test.js`, `test/net/cellcover.test.js`, `test/player/propbodies.test.js` |
| Tactics | `test/characters/enemy/tact2.test.js`, `tact5_feedback.test.js`, `test/scenes/audittact.test.js` |
| Crowding and doors | `test/player/tact3.test.js`, `test/characters/enemy/fb1014b_doorjam.test.js` |
| Blows and tells | `test/characters/enemy/tact4.test.js`, `tell2_tell.test.js` to `tell7_tier.test.js`, `tell6a_ring.test.js` to `tell6d_aimed.test.js`, `test/scenes/audittell.test.js` |
| Online wind-ups | `test/ai/tell8_online.test.js` |
| Feud ledger | `test/systems/rvn1_ledger.test.js`, `auditfeud.test.js`, `auditfeud2.test.js`, `test/characters/feudmerge.test.js` |

## Known limits

- No pathfinding on streets or in the wilderness; foes there use the classic motor.
- Interior bakes are not cached; each building a foe fights in bakes once per visit.
- The in-game feature note still says pathfinding works in dungeons only, but building interiors also bake a mesh.
- Changing the switch mid-level does not swap motors of foes already spawned.

See also [combat.md](combat.md) for hit resolution and damage, and [characters.md](characters.md) for foe types.
