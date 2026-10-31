# Quests

This page covers the quest engine (a port of Daggerfall Unity's questing subsystem), how quests are offered, the
journal and guidance layers built over it, how quests behave online, the questlines layer, and the town bounty boards.

## The shape

- The engine is a port of Daggerfall Unity's (DFU) `Questing/` C# code. Each file in `src/systems/quest/` names the
  DFU class it ports (`Parser.cs`, `QuestMachine.cs`, `Quest.cs`, `Task.cs`, `Actions/*.cs`, and so on).
- It does not read classic Daggerfall's QBN/QRC binaries. DFU never parses those either: it runs decompiled `.txt`
  quest sources. The port runs the same sources, vendored at `vendor/dfu-quests/` (265 quests in `Quests/`, the data
  tables in `Tables/`, MIT, provenance in its `README.md`). No ARENA2 data is needed to parse or run a quest.
- The machine never knows about the presentation. The journal, guidance marks, questlines and quest sharing all read
  machine state through the bridge; none of them writes quest state except through machine methods.
- Everything in `src/systems/quest/` is headless and node-testable. The world comes in through injected `deps` and
  `hooks`. `src/scenes/quest/questBridge.js` is the one place that wires it to a live host.

## Engine modules (`src/systems/quest/`)

| File | Ports | What it does |
|---|---|---|
| `parser.js`, `parseUtils.js` | `Parser.cs` | Reads a quest source: header, QRC message blocks, QBN resources and tasks. The first unrecognised block is the headless startup task; a second one throws. |
| `quest.js` | `Quest.cs` | One live quest: messages, resources, tasks, the update loop, `EndQuest`'s two-tick grace, log steps, the tombstone, questor registry. |
| `task.js` | `Task.cs` | Task types: Headless, Standard (`_sym_ task:`), PersistUntil (`until _sym_ performed:`), Variable, GlobalVarLink. |
| `actions.js` | `Actions/*.cs` | DFU's 82 actions plus the `ActionTemplate` base (`StartTask`, `Say`, `ClickedNpc`, `PlaceNpc`, `GivePc`, `CreateFoe`, ...). Each has a `Pattern`; the machine matches a task line against every template. |
| `questActionsExtension.js` | Quest Actions Extension mod | Four extra actions (`raise time`, `reduce player fatigue`, `player possesses`, `player handsover`) used by the Foraging mod's quests. Behaviour restated from Jagget's mod, credited on the About screen. |
| `machine.js` | `QuestMachine.cs` | The live quest table, the action-template registry, scheduled starts, the tick, site links, save/restore, share receive and resync, shelving. |
| `clock.js` | `Clock.cs` | Timers. Also the online deadline/delay split (below). |
| `foe.js`, `item.js`, `person.js`, `place.js`, `symbol.js`, `message.js`, `questResource.js` | Resource classes | Declaration parsing plus world binding: site selection, NPC setup from factions, item minting, foe tracking. |
| `table.js`, `tables.js` | `Table.cs` | The data-table reader and the loaded tables (`Quests-StaticMessages`, `Quests-GlobalVars`, `Quests-Places`, `Quests-Items`, `Quests-Foes`, ...). An unset table throws by name. |
| `questMacros.js` | `QuestMacroHelper.cs`, `QuestMCP.cs` | Message macros: `_sym_`, `__sym_`, `___sym_`, `=sym_`, `%pcn`-style context macros. Error shapes are DFU's (`%x[undefined]`, `%x[unhandled]`, `%x[nullMCP]`). |
| `questLists.js` | `QuestListsManager.cs` | Quest pools from `vendor/dfu-quests/Tables/QuestList-Classic.txt` and `QuestList-DFU.txt`, with membership, rank and reputation gates. Mods register extra lists through `registerQuestList`. |
| `offerFlow.js` | Quest offer and guild popup windows | Draw, offer, accept or refuse, headless. Answers step descriptors the UI renders. |
| `resourceBehaviour.js`, `sceneMount.js` | `QuestResourceBehaviour.cs`, `GameObjectHelper` quest half | Stand quest people, items and foes in a scene; route clicks, injuries and deaths back to the quest. |
| `localizedQuest.js` | DFU `-LOC` files | A translation's quest text, read at parse, at message lookup, and at save load. |

Supporting modules that are the port's own (not DFU members):

| File | Purpose |
|---|---|
| `questPatches.js` | Text patches over vendored quests that are broken in play. A patch is exact old text plus an occurrence count; a wrong count throws, and the loader then falls back to the unpatched text. The vendored files stay verbatim. |
| `noAsksAgain.js` | A `prompt` whose "no" leads nowhere asks again on the next click, so a misclick does not soft-lock the quest. |
| `mainSpine.js` | Keeps the main-quest backbone `S0000999` running; the machine calls `keepSpine` on a fixed beat. |
| `questRepair.js` | `repairActiveQuests`: re-places people, items, foes and markers a fault took away, keeping progress. Exposed as a settings action. |
| `questReach.js` | "Nearby quests": limits remote sites to a Chebyshev map-pixel reach that grows with level. |
| `questGuidance.js` | Guidance tiers (below). |
| `questShare.js`, `shareActions.js` | Party quest sharing (below). |
| `questStamps.js` | Which clock each saved quest stamp stands on (below). |
| `onlineGuard.js`, `onlineRepute.js` | Online-only tuning of specific quests (below). |
| `markerCuration.js`, `castMarkers.js` | Fixes for unreachable quest markers in mod town packs; marker positions for generated Imperial City interiors. |
| `questFoeLine.js` | Names a quest's target foe on its hover plaque. |
| `videoQueue.js` | Plays quest videos one after another, as DFU's window stack does. |

## The tick

`QuestMachine.tick()` runs at `TICKS_PER_SECOND` (10) of real time, driven by the host. Clocks read world time
through `deps.nowSeconds()`. Each tick:

1. Starts quests queued by `scheduleQuest` / `scheduleQuestByName`.
2. Calls `quest.update()` on every active, non-shelved quest.
3. Tombstones completed quests. Tombstones expire after one in-game week.
4. Removes a quest whose update threw, unless it is in `PROTECTED_QUESTS` (`S0000999`, `S0000977`, `_BRISIEN` and the
   start quests).

Action lifetime follows DFU: an action is an object that persists, `SetComplete` stops re-execution until a rearm, and a
click lives for exactly one quest tick unless an action consumes it.

## The bridge and the hosts (`src/scenes/quest/`)

- `questBridge.js` `createQuestBridge(ctx)` builds the `QuestMachine`, `QuestListsManager`, `QuestOfferFlow`, the
  notebook, the questlines layer and the line offers. It checks the context against `QUEST_CTX_CONTRACT` and logs any
  unwired seam once at construction.
- It registers the extension actions and `questlineActionTemplates()` on the machine.
- Hosts use its verbs: `tick`, `clickNpc`, `offerSocialQuest`, `offerGuildQuest`, `offerCovenQuest`,
  `offerDaedricQuest`, `mountScene`, `questLog`, `news`, `repair`, `snapshot`, `restore`.
- `snapshot()` returns `{ machine, notebook, oneTimeQuestsAccepted, questlines }`. `restore()` clears machine state and
  every pending offer first, as DFU's load path does.
- `questData.js` `loadQuestPack()` preloads every quest source through Vite's `import.meta.glob`, so the machine's data
  seams stay synchronous. It is browser-only; node tests feed the bridge from the file system. It globs DFU's pack,
  the vendored mod packs (`vendor/roleplay-realism`, `vendor/warm-ashes-ships`, `vendor/foraging`), the questline
  scripts (`src/systems/questlines/quests/`) and the start quests (`src/systems/starts/quests/`).
- `questFoeHost.js` spawns and places quest foes (`mintQuestFoeWave`, `placeRoomQuestFoe`) and decides which party
  member's client owns a shared quest foe.
- `questProvinceSites.js` and `questProvinceWarm.js` give regions outside the Iliac Bay (no MAPS.BSA rows) remote sites,
  and pre-build those places in idle time so a draw does not stall a frame.
- `questClickFirst.js` lets a click on a quest person run the quest's reaction before the talk window opens.

## How quests are offered

| Door | Code | Notes |
|---|---|---|
| Guild "Get quest" service | `offerFlow.js` `offerGuildQuest`, `src/systems/guild/guildServiceFlow.js` | DFU's guild popup. Pool from `QuestListsManager` by guild group, membership and rank (or level, for guilds that use `isSatisfyQuestReqByLevel`). |
| Talk "work" answer, merchant/noble click | `offerSocialQuest` | DFU's quest offer window. The questor leaves the work pool. |
| Named quest | `offerNamedQuest` | A quest offered by name. |
| Witch coven | `offerCovenQuest` | Coven pool by reputation. |
| Main quest and story letters | `_BRISIEN` and `S0000999` start on their own | `mainSpine.js` restarts the backbone if it is lost. |
| Questline | `src/scenes/quest/questlineOffers.js` | Notice boards, a giver's door, or the Quests tab. A line is taken, never sent. |
| Bounty board | `src/systems/bounty/` | Not a machine quest (below). |

`offerFlow.js` keeps DFU's quirks on purpose (for example, the picker's index drift and a missing `QuestorOffer` showing
nothing). `questRepute.js` holds DFU's success and failure repute values, charged when a quest ends.

Plain bulletin boards are DFU's rumour board: `src/systems/bulletinBoard.js` composes the first rumour fit for a sign
(`src/systems/rumorMill.js`).

## Journal and guidance

- The journal faces are the Enhanced pause window's Quests tab (`src/ui/enhanced/enhancedMenu.js`), the Chronicle
  (`src/ui/enhanced/enhancedChronicle.js`) and the classic logbook (`src/ui/quest/questJournal.js`, DFU's window).
- `questBridge.questLog()` is the one walk of the machine. `src/ui/quest/questRail.js` orders entries, and
  `src/ui/quest/questLens.js` adds the "where" and the target. The faces never walk the machine themselves.
- `questHerald.js` announces journal changes, `questTracker.js` shows the followed quest, `questMarks.js` places map
  marks (all in `src/ui/quest/`).
- Guidance tier (`questGuidance.js`, Features row `quest-guidance`, pref `questGuidance`):

| Tier | Shows |
|---|---|
| `journal` (default) | Marks only places the player's map already knows, never inside a dungeon. |
| `town` | Also rings the building the latest entry names, on the town map and the compass. |
| `exact` | Also marks quest items, people and foes inside dungeons and buildings. Can spoil a quest. |

`town` and `exact` apply only on the Enhanced skin. The classic skin keeps DFU's behaviour.

## Online behaviour

Each client simulates its own world; there is no server-side quest state. The relay carries share envelopes only.

- **Clocks** (`clock.js`). Online, every clock is classified as a deadline or a delay from its script. A deadline runs
  on the character's played time as in DFU. A delay is cut once to `ONLINE_DELAY_SECONDS` (24 game minutes, about two
  real minutes). `ONLINE_DEADLINES` corrects scripts the reader misclassifies. Offline, every clock is DFU's.
- **Stamps** (`questStamps.js`). Online, a quest reads three clocks: the character's own (`nowSeconds`, all
  countdowns), the sky (`skySeconds`, hour/date/season), and the event clock (`worldSeconds`, journal dates). Offline
  they are one clock.
- **Guard windows** (`onlineGuard.js`). `N0B10Y03` ("Guard the Guild") opens its watch ten game minutes (about 50 real seconds) after arrival for
  one game hour, instead of waiting for the shared midnight.
- **Repute gates** (`onlineRepute.js`). Online, two Mages Guild quests are offered only once guild standing reaches the
  value their headers name, because online standing is held by the account service.
- **Sharing** (`questShare.js`). The sender captures a quest's save envelope (`machine.getShareableQuestData`); the
  receiver gates it with `canReceiveSharedQuest` and rebuilds a live copy (`machine.receiveSharedQuest`). Each member
  keeps an independent copy. While partied, the host re-shares changed quests and the receiver updates in place
  (`machine.updateSharedQuest`). `shareActions.js` fixes which action state a resync may overwrite; new actions fail
  closed. The envelope must fit `QUEST_SHARE_MAX_BYTES`.
- **Questlines** are forced on online (Features row `questlines`, `online: true`).
- **Nearby quests** (`questReach.js`, Features row `nearby-quests`) is the player's choice online. Reach is
  `QUEST_REACH_BASE` + `QUEST_REACH_PER_LEVEL` per level above 1 (`questReachPixels`), with at least `QUEST_REACH_MIN_CHOICES` candidates.

## Questlines (`src/systems/questlines/`)

A layer over the machine that adds objectives, branches, outcome rewards and multi-quest storylines. It never runs a
quest; the machine does not import it. It is the port's own; DFU quests pay only what their scripts say.

- **Switch and stamp** (`qlLaw.js`). `questlinesOn()` reads the `questlines` pref. A quest that starts while it is on is
  stamped for life (`startStamp`, state in `qlState.js`); turning the switch off strands nothing.
- **Objective sheets** (`qlSheets.js`, `sheets/<family>.json`, families in `qlFamilies.js`). One sheet per quest. A
  sheet names state the machine already keeps: `task`, `item`, `clock`, `step`, `global`, `foeDead`, `act`, `choice`,
  combined with `all`/`any`/`not` (`BINDING_KINDS`). Objectives latch: once shown, an objective stays shown.
- **Branches** (`qlPatches.js`, `patches/<family>.json`). Flagship quests get a choice through text patches applied as
  the script is read, only while the switch is on. A patch that misses its text throws.
- **Extra actions** (`qlActions.js`): `ask` (two to four worded choices), `outcome`, `ql act`, `ql paid`, `ql name`,
  `ql gone`.
- **Acts** (`qlActs.js`). A feature calls `noteAct('fish-caught')` and every running stamped quest hears it. The module
  is a leaf so features import it without pulling in the layer. `qlEliteFoe.js` emits `elite-foe-slain`.
- **Rewards** (`qlRewards.js`). Gold stays DFU's formula times the outcome's `PAY_PROFILES` factor. An outcome that pays
  gear offers `REWARD_CHOICES` pieces fitted to the player, seeded by the quest. Account currencies are paid only by
  the account service (`server-account/src/questlines.js`) against receipts it witnessed (`src/net/questlineClaims.js`).
- **Lines** (`qlLines.js` `QL_LINES`, `qlLineRunner.js`). A line is data: steps (quests in `quests/*.txt`), tier, and
  when it opens (level, another line, online, a live event). A line whose gate holds is offered; the player takes it;
  later steps start an hour (`STEP_GAP_S`) after the previous one; a failed later step is offered again a day later.
  Lines include `burningDoors`, `covensHoard`, `weirRoad`, `hourThatWasNot`, `oldCoil`, `thirteenthFrostfall` and the
  `intro*` lines (`introCrafts`, `introGear`, `introSea`, `introRoad`, `introTables`, `introArena`, `introBay`,
  `introFirmament`).
- **Ladders** (`qlLadders.js`). Shows each joined guild's own quests by rank as a questline. Read-only.
- **Host seam**: `src/scenes/quest/questlineHost.js` (account service door, online only) and `questlineOffers.js`.
- **Tools**: `tools/qlCheck.mjs <Family>` checks sheets against their scripts with `tools/qlSheetLaw.mjs`;
  `tools/qlPatchKit.mjs` cuts a hand-in branch; `tools/qlSheetDraft.mjs` drafts a sheet.

## Bounty boards (`src/systems/bounty/`)

The port's own. Half of a town's bulletin boards (`questBoardIndices`, every other one by position, the same on every
client) are bounty boards; the rest show DFU's rumour.

- `bountyBoard.js` is the pure law. A posting is a pure function of (day, town pixel, slot): `BOUNTIES_PER_DAY` (4)
  hunts, each 4 to 10 map pixels out (Chebyshev), a pack of 4-8 (2-4 in a dungeon). `BOUNTY_TIERS` maps the reader's
  level to a beast tier. At most `BOUNTY_ACTIVE_MAX` (4) held; each lapses after one game day.
- `bountyQuarry.js` replaces the global beast ladder with the land's own wild where the encounter tables know it.
- `bountyReward.js` mints the gold purse and one weapon or armour piece.
- `bountyJournal.js` is a leaf the journal faces call to list, abandon and share a held bounty (id `bounty:<id>`).
- `src/scenes/bountyHost.js` stands packs and pays; `src/scenes/bountyFarms.js` stands a farmstead for farm notices;
  `src/ui/bounty/bountyWindow.js` is the board window. Saved in the mod-save slot `bountyBoard`.
- Online, a party shares hunts within a tier through the party pose; one member's client owns the pack. A peer's
  "cleared" flag pays the party; this is client trust, the same as shared quests.

## Tests

- Engine: `test/systems/quest/quest.test.js`, `questmachine.test.js`, `questactions.test.js`, `questplaces.test.js`,
  `questpersons.test.js`, `questitems.test.js`, `questfoes.test.js`, `questmacros.test.js`, `questoffers.test.js`,
  `questbridge.test.js`, `questsave.test.js`, `questscene.test.js`.
- Online and fixes: `time3_quests.test.js`, `rest8_questwaits.test.js` (ticks every vendored clock past the short
  wait), `guardonline.test.js`, `fb1015g_reputegate.test.js`, `sharecopy.test.js`, `qrepair.test.js`,
  `nearby_quests.test.js`, `fb1017b_shamtrail.test.js`, `fb1013e_noasks.test.js`, `fb1026d_mainspine.test.js`.
- Guidance: `test/ui/automap/guide8_questguidance.test.js`.
- Questlines: `test/systems/questlines/` (`ql1_sheets.test.js` holds every sheet to its script; `ql12_lines.test.js`,
  `qloffered.test.js`, `ql3_rewards.test.js`, `ql4_branches.test.js`, `qlvoice.test.js`).
- Bounty: `test/systems/bounty1.test.js`, `test/systems/auditbounty1.test.js`, `test/systems/bulletinboard.test.js`.

## Traps

- Do not edit `vendor/dfu-quests/`. Fix a broken quest with a patch in `questPatches.js` (or `qlPatches.js` for a
  branch).
- Many DFU quirks are kept deliberately and commented `QUIRK KEPT`. Check the comment before "fixing" one.
- `parseUtils.js` is a leaf the resource modules import. Keep shared helpers there, not in `parser.js`: parser.js imports every resource module, and resources extend
  `QuestResource`, so a helper in parser.js closes an import cycle.
- Random draws go through the quest's injectable roll, never `Math.random`, so seeded tests stay seeded.
- A host change to quest wiring belongs in `questBridge.js`, not in each scene host.
- Offline and online differ in clocks, gates and the questlines switch. Test both lanes.
