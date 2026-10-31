# Professions and crafting

This page covers the gathering and crafting professions: the tracks and XP, the acts the player plays, the stations,
the item templates, the sounds, the Materials Bag, and the Foraging mod port they build on.

## The shape

- Daggerfall has no crafting skill. Its three makers (potion maker `src/systems/potions.js`, spellmaker, item maker
  `src/systems/enchanting.js`) stay as Daggerfall Unity (DFU) has them and use no skill. Professions are the port's
  own, a deliberate departure from DFU.
- **Professions are online only.** The account service credits every point of XP, rolls every yield, and keeps the
  Stores. Offline, nothing earns profession XP; the stations show a "done online" line.
- The account service gates the whole system with `PROFESSIONS_OPEN` (`off`, `dev`, `on`) in
  `server-account/wrangler.toml`, read by `profSwitchOf` and `profOpenFor` in `server-account/src/professions.js`.
- The client plays the act and reports how well it went. The service trusts that report only within a bound: a clean
  act moves a craft's quality roll by at most one step, or adds XP and bonus chances within caps the service checks.
- Shared law lives in `src/net/` and is pure (no clock, DOM or network). The client and the service import the same
  files.

## Where it lives

| Layer | Files |
|---|---|
| Shared law | `src/net/professionLaw.js` (tracks, ranks, XP, tiers, specialisations, materials, Stores bounds), `src/net/recipeLaw.js` (recipes, quality, craft XP, act tuning), `src/net/nodeLaw.js` (nodes per pixel per day, herb tables, yields), `src/net/provinceNodes.js` (what each province outside the Bay is rich in), `src/net/bagLaw.js` (Materials Bag bounds) |
| Account service | `server-account/src/professions.js` (tracks, Stores, harvests, crafts, withdrawals, Court writs), `alchemy.js`, `masterWork.js`, `craftWrits.js`, `writs.js`, `market.js`, `craftedPiece.js` |
| Client book | `src/net/profBook.js` (this device's view of tracks and Stores; queues and retries requests) |
| Gathering hosts | `src/scenes/gatherHost.js` (one shell for every node kind), with kinds `herbHost.js`, `mineHost.js`, `treeHost.js`, `huntHost.js`, `fishHost.js` (all in `src/scenes/`) |
| Act machines | `src/systems/herbAct.js`, `mineAct.js`, `chopAct.js`, `traceAct.js`, `fishAct.js`, `heatAct.js`, `planeAct.js`, `stitchAct.js`, `chiselAct.js`, `facetAct.js`, `panAct.js` |
| Products | `src/systems/smithItems.js`, `cookItems.js`, `alchemyItems.js`, `fletching.js`, `src/systems/professions/profItems.js` |
| Templates | `src/systems/professions/profTemplates.js` |
| Feel | `src/systems/professions/profSounds.js`, `src/systems/gatherSounds.js`, `src/systems/gatherBlow.js`, `src/systems/veinCrack.js` |
| UI | `src/ui/professions/profPages.js` (Professions, Stores and Crafting pages; station acts), `profHud.js` (toasts, rank banner), `profReticle.js` (the act drawn round the crosshair), `craftHall.js`, `masterBox.js` |
| Bag | `src/systems/materialsBag.js` |
| Foraging | `src/systems/foraging/` and `vendor/foraging/` |

The gathering host exists only on the streaming world host (`src/scenes/world.js` builds it with `createGatherHost`
when a professions book exists).

## The professions

`PROFESSIONS` in `professionLaw.js` lists ten tracks: five gathering and five crafting. Eight crafting disciplines
are filed under the five crafting tracks (`DISCIPLINES`, `trackOf`).

| Gathering | Crafting track | Disciplines |
|---|---|---|
| Mining (veins, boulders, dungeon veins) | Smithing | Smithing, Jewelcrafting |
| Logging (trees) | Building | Carpentry, Masonry |
| Herbalism (patches; the Basket) | Outfitting | Outfitting |
| Hunting (bodies the player killed) | Provisioning | Alchemy, Cooking |
| Fishing (the net, schools) | Enchanting | Enchanting (Disenchanting over DFU's item maker) |

## Ranks, tiers and XP

All in `professionLaw.js` and `recipeLaw.js`.

- A track runs from rank 0 to `PROF_RANK_MAX` (100). `RANK_NAMES`: Novice 0, Apprentice 25, Journeyman 50, Expert 75,
  Master 100.
- XP to hold rank n: `xpForRank(n)` = 10 x n^2 (Master = 100,000). `rankOfXp` inverts it.
- Every material, node and recipe has a tier 1 to 7. `TIER_RANKS` = `[0, 10, 25, 40, 55, 70, 90]` is the rank each
  tier needs; `tierOpen(rank, tier)` tests it.
- Harvest XP: `harvestXp` = 15 x tier, +50% for a clean act, a quarter for a node more than two tiers below the rank's
  top tier. Herbs and fish are worked at the highest tier the rank opens (`herbXpTier`, `haulTier`).
- Craft XP: `craftXp` = 20 x tier (a quarter if too far below rank). A first make of a pattern at a tier adds its
  track's share, `FIRST_MAKE_SHARE` (Smithing 500, Outfitting 511, Building 1823, Provisioning 3155; never under
  `FIRST_MAKE_FLOOR`). Masonry and Cooking have their own (`masonXp`, `cookXp`).
- Writ XP: `writXp` = 2 x its pay.
- `CRAFTS_ABOVE_JOURNEYMAN` (2): only two crafting tracks may pass rank 50. Gathering is unlimited.
- Specialisations: a choice at ranks 50 and 100 (`SPEC_RANKS`, `SPECIALISATIONS`, `specsAt`). Free to change for a day
  (`SPEC_TRIAL_S`); after that a change costs `RESPEC` (1,000 Marks, then a 7-day lock).

## Gathering: nodes and acts

1. **Nodes.** `nodeLaw.js` decides which nodes a wilderness map pixel holds on a UTC day: a pure function of day and
   pixel, the same on every client (`NODE_KINDS`: tree, herb, vein, boulder, dvein). The gathering host stands them as
   flats in the pixel's batches, and stands them again at the day's turn or when the service reports a node taken.
2. **Target and menu.** The node in reach nearest the look is the target. Its acts are rows on the world plaque (the
   loot menu's list), or a list on phones and classic skins.
3. **Checks.** Foraging's checks come first (`foragingInstall.js` `actChecksRefusal`): not in a settlement, not at sea
   except Fishing, no foe near, not fully encumbered. The tool must be in the pack. There is no time-of-day limit.
4. **The act.** A pure machine the host steps each frame with time and input; the host reads its state to draw the
   reticle (`profReticle.js`) and its report at the end.
5. **The ask.** The end wears the tool by 1 and sends the report through `profBook.js`, which keeps and retries it
   until answered. The service rolls the yield and the XP. The goods land in the Materials Bag or the pack.

| Act | Profession | Tool | Mechanic |
|---|---|---|---|
| `herbAct.js` | Herbalism | Sickle; Basket | Hold steady on a patch; the Basket finds glints |
| `mineAct.js` | Mining | Pick-Axe | Strike the moving glint on a vein or boulder |
| `chopAct.js` | Logging | Wood-Axe | Chop as a shrinking ring crosses the notch (a "clean cut" counts double) |
| `traceAct.js` | Hunting | Skinning Knife | Trace a line on a body the player's own blow felled |
| `fishAct.js` | Fishing | Fishing-Net | Hold to wind and cast, press on the tug, hold the net's weight inside a band to haul |

Swings land on DFU's melee hit frame. `gatherBlow.js` adds the hit feel and ore chunks, `veinCrack.js` the crack
shader on a worked vein, and `gatherSounds.js` the sounds (also heard from party members through
`src/net/peer/peerGather.js`).

Each act has a "gentle" form (pref `gentleActs`, an accessibility setting): every press is plain, with no clean act
and no bonus chance.

## Crafting: stations and acts

A craft is asked from the **Crafting page** (`profPages.js`) while standing at a station. The service consumes the
inputs and returns the product; the client mints the item.

| Station (`PROF_STATIONS`) | Where | Act | Disciplines |
|---|---|---|---|
| `forge` / anvil | Weaponsmith, Armorer | `heatAct.js`: strike while the glow is in the band | Smithing (smelting ores to ingots, weapons, armour, repair kits) |
| `workbench` | Furniture Store | `planeAct.js`: a steady drag along the grain | Carpentry (bows, staves, arrows, furniture, Ram Kit) |
| `loom` | Clothing Store | `stitchAct.js`: press on the beat | Outfitting (leather armour, clothing, cloth) |
| `mason` | General Store | `chiselAct.js`: strike the marked line | Masonry (cut stone, mortar, stone decor) |
| `jeweller` | Pawn Shop, Gem Store | `facetAct.js`: stop the turn where the light catches | Jewelcrafting |
| A fire | Campfire or hearth | `panAct.js`: take each pan off in its window | Cooking |
| Alchemy station | Alchemist | DFU's potion maker (`src/scenes/potionMakerHost.js`) | Alchemy (`server-account/src/alchemy.js`) |
| Enchanting station | Mages Guild hall | DFU's item maker | Enchanting, Disenchanting |

The station checks are the interior host's `forgeHere`, `workbenchHere`, `loomHere` and so on in
`src/scenes/worldModes.js`. A home or guild hall with a placed station also counts.

- **Quality.** `QUALITY_NAMES`: Crude, Standard, Fine, Superior, Masterwork. The service rolls it (`rollQuality`); a
  clean act and specialisations add steps (`craftQuality`). Kits, arrows, siege works and dishes take no quality
  (`takesQuality`).
- **Rarity ceiling.** A craft reaches Rare (Masterwork) at most. A Master's work (`masterWork.js`, `masterBox.js`) can
  reach Legendary. Aetheric, Artifact and Sigil pieces are never craftable.
- **Minting.** `smithItems.js` `mintPiece` makes DFU's own item first (`ItemBuilder.CreateWeapon` and friends), then
  lays the quality on it. It also owns tempering, reforging and repair kits. `cookItems.js` mints dishes and their
  effects (stamina, feasts shared with a party). `alchemyItems.js` mints brewed potions as DFU's own potion items.
- **Fletching** (`fletching.js`) works offline and online: using a piece of wood in the inventory turns it into its
  own weight in arrows. It is registered as an item-use handler in `src/systems/useItem.js`.

## Items and templates

- Materials are DFU's own items wherever DFU has one (gems, plants, creature parts, metals). A withdrawal mints the
  item DFU's loot would have made (`profItems.js` `mintMaterialItem`, `withdrawIntoPack`).
- New items use the reserved template range 600-699, registered with `registerCustomTemplates`
  (`src/systems/item/itemTemplates.js`) by `profTemplates.js`: ores 610-615, ingots 620-630, logs, planks, Charcoal,
  Resin and Heartwood 635-654, hides, leathers and cloth, stone 673-675, the Skinning Knife 603, dishes, essences and
  stone decor. Icons are DFU's own icons, recoloured at runtime.
- The gathering tools are the Foraging mod's: Wood-Axe 1600, Pick-Axe 1601, Sickle 1602, Fishing-Net 1603, Basket 1607
  (`foragingLaw.js` `FT`).

## Stores, the Materials Bag and the economy

- **Stores**: a per-character inventory the account service keeps (`STORES_MAX` units). Every unit carries an origin,
  `own` or `bought`.
- **Materials Bag** (`materialsBag.js`, `bagLaw.js`): a second item list beside the pack (`entity.bagItems`) with a
  weight limit (`BAG_KG_LIMIT`). Harvests go into the bag or the pack. The service counts what it handed out
  (`prof_carried`) and lets only counted units back into the Stores; a save-edited or looted item never enters them.
- A station may take a shortfall from the bag or pack as "loose" units. Loose units and their products never reach
  writs, guild Stores, the market or the carried count; they earn only the craft's XP.
- **Marks** (`src/net/marksLaw.js`) are the server-held currency for professions trade. The market
  (`src/net/marketLaw.js`, `server-account/src/market.js`), guild writs and commissions (`src/net/writLaw.js`,
  `server-account/src/writs.js`) and crafting writs (`src/net/craftWritLaw.js`, `server-account/src/craftWrits.js`,
  `src/scenes/craftWritHost.js`) build on the Stores. See [items-and-loot.md](items-and-loot.md) for item minting.

## Foraging (`src/systems/foraging/`)

A port of Harbinger451's **Foraging 1.7** for Daggerfall Unity, carried with the author's permission and credited on
the About screen. The mod ships as a compiled script with no source; the port's rules follow its IL, vendored at
`vendor/foraging/il/`.

- `foragingLaw.js`: the pure rules: the twelve templates 1600-1611 (`FORAGING_TEMPLATES`), the six tools, refusals,
  yields. `foragingCore.js` holds the parts the account service also reads (attribute bands, daylight, Basket blocks).
- `foragingInstall.js`: registers the templates, textures, item-use handlers, the console command and the loot hooks.
- `vendor/foraging/Quests/`: the mod's quest list and 22 quests, loaded by the quest pack loader. Four of their
  actions come from the Quest Actions Extension mod, restated in `src/systems/quest/questActionsExtension.js` (see
  [quests.md](quests.md)).
- Online, the shared clock cannot be moved, so the quests' `raise time by` becomes a wait the player sits through
  (`src/scenes/foragingWait.js`).
- Foraging works in both lanes. Using a tool from the inventory is the mod's own action. At a profession node, the
  same tool starts a profession act (online).

## Sounds

- `profSounds.js` `PROF_CUES`: one table of Daggerfall's own clips for station act cues; `profCue` plays one through
  a sink the host sets.
- `gatherSounds.js`: gathering sounds (`GATHER_SFX`, `createGatherEar`), installed with `installGatherSounds`.

## Tests

- Law and service: `test/net/prof1_service.test.js` to `test/net/prof12_service.test.js`, `prof*_law.test.js`,
  `craft1_chain.test.js` to `craft5_consumables.test.js`, `fb1018f_craftlimit.test.js`, `fb1015f_firstcraft.test.js`,
  `bag1_service.test.js`, `auditbagcraft.test.js`, `craftwrits_*.test.js`, `marks1.test.js`, `marketaudit.test.js`.
- Client: `test/systems/prof*_client.test.js`, `profreticle.test.js`, `gatherfeel.test.js`, `gf2_veincracks.test.js`,
  `auditgather.test.js`, `bag1_client.test.js`, `fb1009d_bagcraft.test.js`, `test/systems/professions/`.
- Foraging: `test/systems/foraging/` (`forage1_law.test.js`, `forage3_loot.test.js`), `test/systems/forage2_tools.test.js`.
- The rig for gathering host tests: `test/gatherRig.mjs`.

## Traps

- Never mint XP, yields or Stores units on the client. The service decides; the client only reports an act.
- Keep the shared law files pure: the service bundles `src/net/professionLaw.js`, `recipeLaw.js` and `nodeLaw.js`.
- Node placement must stay a pure function of day and pixel, or clients disagree about which nodes exist.
- New templates go in 600-699 through `registerCustomTemplates`; do not re-type a DFU item that already exists.
- A recipe or XP change moves the first-make shares (`FIRST_MAKE_SHARE` is derived by `tools/craftPace.mjs`). Rerun
  it and the law tests.
- Adding a gathering kind means a new kind module for `gatherHost.js`, not new code in `src/scenes/world.js`.
