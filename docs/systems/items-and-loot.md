# Items and loot

This page covers the item record and its templates, the pack, equipping, containers and transfers, the materials bag,
gem sockets, physical items in the world, loot generation and the rarity ladder, and banking. Daggerfall Unity (DFU,
MIT, Daggerfall Workshop) is the reference design. The rarity ladder and most of the loot layer are port additions on
top of DFU's loot tables.

## Map of the code

| Area | Files |
| --- | --- |
| Templates | `src/characters/itemTemplates.json`, `src/systems/item/itemTemplates.js`, `src/systems/item/itemTemplatesData.js` |
| Item record schema | `src/systems/item/itemFields.js` |
| Item validity and ids | `src/systems/item/itemLaw.js`, `src/systems/item/itemIds.js`, `src/systems/item/possessedItems.js` |
| Item text | `src/systems/item/itemInfo.js`, `src/systems/item/itemPowers.js`, `src/systems/item/itemLook.js` |
| Item flags | `src/systems/item/itemLock.js`, `itemJunk.js`, `itemBound.js`, `foundMark.js`, `heldOut.js` |
| Pack | `src/systems/inventory.js` |
| Equip | `src/systems/equip.js`, `src/characters/equipTable.js`, `src/characters/paperdoll/paperdoll.js`, `src/systems/armorMaterials.js` |
| Use | `src/systems/useItem.js`, `src/ui/useMagicItemWindow.js` |
| Transfers and sessions | `src/systems/item/itemTransfer.js`, `src/systems/inventorySession.js` |
| Containers | `src/systems/containers.js`, `src/systems/containerLoot.js`, `src/systems/roomLoot.js`, `src/systems/loot/claimLedger.js` |
| Materials bag | `src/systems/materialsBag.js`, `src/net/bagLaw.js` |
| Physical items | `src/systems/physicalItems.js`, `src/scenes/physicalItemsLayer.js`, `src/scenes/droppedLoot.js` |
| Loot tables | `src/systems/loot/loot.js`, `src/systems/loot/lootDataTables.js`, `src/systems/loot/lootThemes.js` |
| Rarity ladder | `src/systems/loot/lootRarity.js`, `src/systems/loot/lootPowers.js`, `src/systems/loot/lootLevelGate.js` |
| Loot extras | `lootDrought.js`, `lootCodex.js`, `lootCurse.js`, `lootScry.js` (all in `src/systems/loot/`), `src/systems/reforge.js` |
| Drop shaping | `src/systems/unleveledLoot.js`, `src/systems/foeLootCap.js`, `src/systems/renownLoot.js` |
| Gems | `src/systems/gems.js`, `src/systems/loot/gemGrades.js`, `src/ui/socketWells.js` |
| Quick loot | `src/systems/quickLoot.js` |
| Banking and wallet | `src/systems/banking.js`, `src/ui/bankWindow.js`, `src/systems/walletItem.js` |

## The item record

An item is a plain object. `templateIndex` and `group` name its template. Optional fields hold the rest: `material`,
`variant`, `stackCount`, `currentCondition` and `maxCondition`, `enchantments`, `isIdentified`, `rarity`, `affixes`,
`sockets`, `locked`, `junk`, `bound`, `uid`, and more.

- `itemFields.js` `ITEM_FIELDS` declares every field with its kind and bounds. `validItemField` and `validItemFields`
  check a record. A new field must be declared here. `test/systems/rf5_itemfields.test.js` runs every mint and fails
  on an undeclared key.
- `loot.js` `validLootItem` validates a record that arrives from a peer. It clamps undeclared fields and checks
  declared ones through the schema.
- `itemLaw.js` answers one question: could an honest client have minted this item? The client uses it on items a
  peer hands over (registered into `loot.js` through `setItemLaw`). The account service uses it in
  `server-account/src/judge.js`.
- `itemIds.js` gives each valuable, non-stacking piece a `uid` when a realm character's checkpoint is composed. The
  service's ledger finds copies by uid. Stacks and bound pieces get no uid.

**Templates.** `itemTemplates.js` reads DFU's 288-row `ItemTemplates.txt` (as `src/characters/itemTemplates.json`)
and exposes `templateByIndex`. Mod and port items register extra rows through `registerCustomTemplates`, marked
`custom`. The graded gems use rows 1900-1931. `itemTemplatesData.js` is generated from DFU's `ItemEnums.cs`. Regenerate
it; do not edit it by hand.

**Enchantments and affixes are two lists.** `item.enchantments` holds DFU's `{ type, param }` pairs. `item.affixes`
holds the rarity ladder's numeric lines. DFU readers expect only the classic enum in `enchantments`, so never put a
port effect there. See [magic.md](magic.md) for enchantments.

## The pack

`inventory.js` ports DFU's `ItemCollection` rules. The pack is `entity.items`.

- `isStackable`: ingredients, potions, books, gold, oil and arrows stack. Equipped items, enchanted ingredients and
  quest items do not. Summoned items do not stack, except arrows. Stolen pieces stack only with stolen pieces.
- `addItem` merges into an existing stack (`findExistingStack`) or appends. It does not add a record the list already holds.
- Weight: `itemWeight`, `totalWeight` and `carriedWeight` follow DFU, including material weights for armour.
  `canHoldAmount` checks against the encumbrance limit.
- Gold is an item (`GOLD_TEMPLATE`, `goldStack`). A letter of credit is `LETTER_OF_CREDIT_TEMPLATE`.

**Flags a player sets.** `locked` blocks drop, sale and trade. `junk` marks a piece for one-press selling. These live
in `itemLock.js` and `itemJunk.js`. **Bound** pieces (`itemBound.js`) never pass to another player. A template row or
the item itself can mark it bound.

`heldOut.js` keeps pieces that a trade window holds out of the pack (an Identify lot, a sale) in every save until the
window closes.

## Equipping

`equip.js` ports DFU's `ItemEquipTable` equip and unequip mechanics. The table is `entity.equip`, and
`equipTableOf(entity)` gives its 27 slots (`paperdoll.js` `EQUIP_SLOTS`).

- `equipItem(entity, item)` finds the slot (`getEquipSlot`), unequips what is there and what the item displaces, and
  returns the result. `unequipItem` reverses it.
- `isForbiddenEquip` applies the class's forbidden armour, shields, weapons and materials. Broken items cannot be
  equipped (`isBrokenItem`).
- `equipDelayFor` charges DFU's equip delay when the inventory closes.
- `armorValuesOf` and `updateEquippedArmorValues` compute armour per body part. Material constants live in
  `armorMaterials.js`.
- `blowWear` and `lowerCondition` wear gear down.
- `addEquipChangeListener` tells listeners (enchantments, folds) of every change.

`useItem.js` is DFU's `UseItem` branch table: potions, books, light sources, magic items and more.

## Transfers, containers and sessions

`itemTransfer.js` is DFU's `TransferItem` as functions, shared by every inventory screen. `planTake`, `planStore` and
`planDropGold` decide a move and return refusals. `applyTransfer` performs it. Quest items, the kept spellbook, weight
limits and the wagon limit (`WAGON_KG_LIMIT`) are checked here.

`inventorySession.js` decides the remote side of the window: the wagon (`entity.wagonItems`), the ground, a chest or
container, a shop. It also decides what closing the window owes the world (`closeSession`).

`containers.js` identifies private house containers from furniture model ids, as DFU's `DaggerfallInterior` does.
`containerLoot.js` raises DFU's `OnLootSpawned` event after a shelf or a house container is stocked.

**Shared room loot.** Online, a dungeon's or building's container is one list for every player in the room
(`roomLoot.js`):

- **Base.** Every client computes the same base list from dice seeded by the container's name and the room's terms
  (party level at the container's birth, Luck 50). The terms ride the room's messages; the list does not.
- **Takes.** The room's word records only takes (pieces gone, stacks drawn down) and stored pieces. Two words merge
  the same in any order.
- **Claims.** A take of a shared piece is a claim. The room's host grants it, first come first served.
  `claimLedger.js` holds a claim in the taker's hands until the verdict.
- **Bonus.** Each player's Renown and Luck roll a personal layer over the base. Only that player sees it, and the
  save records what they took.

`quickLoot.js` takes from the hover plaque without a window. It is a port feature with no DFU original.

## Materials bag

`materialsBag.js` is a second list beside the pack, `entity.bagItems`. It works like DFU's wagon. The bag is an item
in the pack; owning it means holding it. Only materials go in it: an item whose group and template are those
`professions/profItems.js` `mintMaterialItem` produces. A bag that holds anything cannot be sold or dropped. The weight
limit and counts live in `src/net/bagLaw.js`. See [professions.md](professions.md) for harvesting and stations.

## Physical items

A port of the Physical Items mod (demifiend000; vendored under `vendor/physical-items/`). Items in the world are drawn
as their inventory picture on a billboard, with simple physics, instead of a loot bag.

- `physicalItems.js` holds the mod's rules, read from its compiled assembly: the sixteen categories, world size, the
  scatter round a body, the shift-drop spiral, and a fixed-step integrator in place of Unity's rigidbody.
- `scenes/physicalItemsLayer.js` is the scene half. The ground-pile pool every host builds
  (`scenes/droppedLoot.js` `createDroppedLoot`) stands the layer. Each host attaches its half.
- A body's items are pictures of items the body still holds. Pressing one takes it from the body.
- Online, it is the player's own mod. A peer's body shows no items.

Test: `test/systems/pi1_physicalitems.test.js`.

## Loot generation

`loot.js` ports DFU's `LootTables.cs` and the `ItemBuilder` random pick rules.

- `LOOT_MATRICES` and `lootMatrix` hold DFU's loot tables. `enemyLootTableKey` picks a foe's table.
  `generateItems` rolls a table.
- `createRandomWeapon`, `createRandomArmor`, `createRandomOfGroup`, `createRegularMagicItem` and `createArtifact`
  build pieces.
- `addEnemyLootExtras` and `addPileLootExtras` add maps, potions and recipes. Mods register more through
  `registerEnemyLootExtra`.
- `lootThemes.js` ties creature-ingredient drops to the creature that died, so an imp does not drop a unicorn horn.

**Unleveled Loot** (`unleveledLoot.js`, a port of Ralzar's mod, MIT) replaces DFU's material rolls. Luck, shop quality
and dungeon type drive them instead of player level. It divides a corpse's gold by the player's level and adds a
daedric or orcish piece to Daedra and Orcs. It is a feature switch (`features.js` `unleveledLoot`).

**Drop shaping.** `foeLootCap.js` caps how many items a plain foe drops and gives plain foes their own rarity
weights. Elite foes, champions, bosses and named foes are exempt. `renownLoot.js` scales the loot bonus with the
roller's Renown online.

The hosts apply rarity where they mint loot: `scenes/hostCombat.js` for bodies (`rollCorpseLoot`), and
`scenes/dungeonContext.js`, `scenes/interiorContext.js`, `scenes/world.js` and `src/systems/searchables.js` for piles
(`rollLootRarity`).

## The rarity ladder

`lootRarity.js` is a port departure from DFU, on by default and always on online (`lootRarityOn`, the `lootRarity`
preference). Off, it writes no field and DFU's loot is unchanged.

| Tier | What it is |
| --- | --- |
| common | A plain DFU item |
| magic | One or two affixes, or a DFU MAGIC.DEF item |
| rare | Three or four affixes, a name from its lines, and one DFU enchantment as flavour |
| legendary | A fixed record from `LEGENDARIES`, with its own power |
| aetheric | A boss's set piece (`src/systems/aetheric.js`); never rolled |
| artifact | DFU's artifacts, unchanged |
| gilded | Fixed records (`src/systems/gilded.js`); never rolled |

- `rollRarity` and `rarityChances` draw a tier from the **source**: a corpse's level, a dungeon's kind
  (`DUNGEON_RARITY_TIER`), a pile or boss multiplier (`SOURCE_MULT`), and the player's Luck (`luckMult`). Tuning
  weights are in `RARITY_WEIGHTS`.
- `applyRarity` dresses an item for its tier. `rollAffixes` rolls lines that lean to the item's own skills.
- `affixFold` folds a wearer's affixes onto the entity through `src/systems/entityMods.js`. DFU's formulas then read
  them (armour, damage, stats, skills, saving throws, encumbrance).
- `lootPowers.js` runs affixes that act (sear, leech, thorns, focus, slayer) and Legendary powers, through registered
  hooks. It also sums the cast-speed line.
- Rare and Legendary pieces carry a DFU enchantment, so they drop unidentified. Identify works as in DFU.

**The level gate.** `lootLevelGate.js` scales the Rare and Legendary thresholds by a factor of the roller's level.
Rare and Legendary gear is rarer for a young character and more common as the character grows. Magic is not gated.
Shared and receipt-seeded spoils are not gated. A room's base roll uses the room's level (`withRollerLevel`). The
gate's levels, factors and chances are kept out of all player-facing text: patch notes, release notes and posts say
only the general rule. Tests: `test/systems/lootgate1.test.js`.

**Around the ladder:**

- `lootDrought.js`: taking eligible pieces without a Legendary raises the source's Legendary chance, up to a cap.
- `lootCodex.js`: a collection log of every Legendary and Aetheric taken. It also imprints a Legendary's power on a
  Rare.
- `lootCurse.js`: some Rare and Legendary finds are cursed: one extra line and one drawback. A temple lifts it.
- `lootScry.js`: points to where an unfound Legendary's family lives.
- `reforge.js`: salvage for Welkynd Shards, reforge a line, hone a line, imbue a tier, and set or extract gems.

## Gem sockets

A Rare or Legendary piece, and some Magic weapons, can carry `sockets`: one to three entries, each `'empty'` or the id
of the gem set in it. The older `socket` string still reads as a list of one (`socketsOf`).

- `socketMax` sets a weapon's sockets by its size: short blades 1, one-handed 2, two-handed 3. Armour and jewellery
  hold 1. Ammunition and garments hold none.
- `weaponSocketPass` gives weapons their sockets after the other draws, so a seeded mint's earlier draws stay the
  same.
- `setGem` sets a gem. Gems of one kind on one piece add up to at most the top of that kind's Rare band.
- `gems.js` defines the four port grades (Chipped, Flawed, Flawless, Perfect) beside DFU's plain grade, the world's gem
  find (`rollGemFind`) and the bosses' gems. Shops never stock graded gems.
- Setting a gem in the pack is free. Extracting it whole costs gold at the Reforge (`EXTRACT_PRICE`).

Tests: `test/systems/gem1_sockets.test.js`, `loot20_sockets.test.js`, `clothgems_client.test.js`.

## Banking

`banking.js` ports DFU's `DaggerfallBankManager` and `LoanChecker`. Offline, each region has its own account. Online,
every branch uses one Empire account (`EMPIRE_ACCOUNT_REGION`, `goldRegion`). `foldEmpireAccounts` merges older
regional balances at boot. A loan stays in the region that made it.

DFU behaviours kept: a withdrawal can be refused for weight; the letter-of-credit commission comes off the account,
not the letter; insufficient funds is checked before the minimum; a loan debits its interest at once. The module also
handles house and ship deeds. `walletItem.js` groups currency items (letters of credit and others) in the pack
without moving them out of `entity.items`.

Tests: `test/systems/banking.test.js`, `bankwindow.test.js`, `empirebank.test.js`, `wallet1.test.js`.

## Testing

Run a file with `node --test <file>`. Start with `test/systems/inventory.test.js`, `itemTransfer.test.js`,
`inventorySession.test.js`, `equiprestrictions.test.js`, `useitem.test.js`, `lr1_lootrarity.test.js`,
`unleveledLoot.test.js`, `partyloot.test.js`, `quickloot.test.js`, and the folders `test/systems/loot/` and
`test/systems/item/`. The `loot1`-`loot21` tests cover the ladder's features one by one.

## Traps

- Declare every new item field in `itemFields.js`, or the field test fails and the wire clamps it.
- A new port item stat goes in `affixes`, never in `enchantments`.
- Keep seeded draws in order. Add new draws after the existing draws for a door. Otherwise every seeded mint and
  every shared room base changes.
- A shared room's base must read only the room's terms, never the local player's Luck, level or Renown.
- Test the ladder on and off: off must equal DFU's loot.
- Never publish the level gate's numbers.
