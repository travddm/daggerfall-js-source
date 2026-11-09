# Items and loot

This page has two parts. The first covers Daggerfall Unity's (DFU, MIT, Daggerfall Workshop) item system as the game
ports it: the item record and its templates, the pack, equipping, containers and transfers, loot tables and banking,
plus the vendored mods that change them. The second covers the loot rarity ladder and its extras, the game's own
departure, which leaves core as a mod.

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
| Loot tables | `src/systems/loot/loot.js`, `src/systems/loot/lootDataTables.js`, `src/systems/loot/lootThemes.js` |
| Drop shaping | `src/systems/humanoidLootShare.js`, `src/systems/loot/kill-gold.ts` |
| Banking and wallet | `src/systems/banking.js`, `src/ui/bankWindow.js`, `src/systems/walletItem.js` |
| Vendored mods | `src/systems/physicalItems.js`, `src/scenes/physicalItemsLayer.js`, `src/systems/unleveledLoot.js` |
| Rarity ladder | `src/systems/loot/lootRarity.js`, `src/systems/loot/lootPowers.js`, `src/systems/loot/lootLevelGate.js`, `src/systems/foeLootCap.js`, `src/systems/renownLoot.js` |
| Ladder extras | `taken-mark.js`, `lootCodex.js`, `lootCurse.js`, `lootScry.js`, `gemGrades.js` (all in `src/systems/loot/`), `src/systems/reforge.js`, `src/systems/gems.js`, `src/ui/socketWells.js`, `src/systems/quickLoot.js` |

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
  peer hands over (registered into `loot.js` through `setItemLaw`); the account service uses it in
  `server-account/src/judge.js`.
- `itemIds.js` gives each valuable, non-stacking piece a `uid` when an online character's checkpoint is composed, so
  the account service can find copies. Stacks and bound pieces get no uid.

**Templates.** `itemTemplates.js` reads DFU's 288-row `ItemTemplates.txt` (as `src/characters/itemTemplates.json`)
and exposes `templateByIndex`. Mod and port items register extra rows through `registerCustomTemplates`, marked
`custom`. `itemTemplatesData.js` is generated from DFU's `ItemEnums.cs`. Regenerate it; do not edit it by hand.

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
in `itemLock.js` and `itemJunk.js`. **Bound** pieces (`itemBound.js`) never pass to another player. `heldOut.js` keeps
pieces that a trade window holds out of the pack (an Identify lot, a sale) in every save until the window closes.

## Equipping

`equip.js` ports DFU's `ItemEquipTable` equip and unequip mechanics. The table is `entity.equip`, and
`equipTableOf(entity)` gives its 27 slots (`paperdoll.js` `EQUIP_SLOTS`).

- `equipItem(entity, item)` finds the slot (`getEquipSlot`), unequips what is there and what the item displaces, and
  returns the result. `unequipItem` reverses it.
- `isForbiddenEquip` applies the class's forbidden armour, shields, weapons and materials. Broken items cannot be
  equipped (`isBrokenItem`).
- `equipDelayFor` charges DFU's equip delay when the inventory closes.
- `armorValuesOf` and `updateEquippedArmorValues` compute armour per body part; material constants are in
  `armorMaterials.js`. `blowWear` and `lowerCondition` wear gear down.
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

## Loot generation

`loot.js` ports DFU's `LootTables.cs` and the `ItemBuilder` random pick rules.

- `LOOT_MATRICES` and `lootMatrix` hold DFU's loot tables. `enemyLootTableKey` picks a foe's table.
  `generateItems` rolls a table.
- `createRandomWeapon`, `createRandomArmor`, `createRandomOfGroup`, `createRegularMagicItem` and `createArtifact`
  build pieces.
- `addEnemyLootExtras` and `addPileLootExtras` add maps, potions and recipes. Mods register more through
  `registerEnemyLootExtra`.
- `lootThemes.js` ties creature-ingredient drops to the creature that died, so an imp does not drop a unicorn horn.

**Humanoid loot.** The `humanoid-loot` Features row (`src/systems/humanoidLootRow.js`; `humanoidLootShare.js` reads
it) sets how much of a humanoid foe's loot reaches its body: class foes, Orcs, Centaurs and human foes. The default,
`dfu`, is DFU's whole table roll and whole worn kit. `cut` keeps a quarter of each, the game's earlier rule. Online the
server profile pins the room to `dfu`.

**Kill gold.** `kill-gold.ts` sets a killed foe's gold: the table's range times `1 + 1.5 ln(level)`, so gold grows
early and flattens late (DFU multiplies by the level; Unleveled Loot made it flat). It applies where Unleveled Loot's
death handler runs.

## Banking

`banking.js` ports DFU's `DaggerfallBankManager` and `LoanChecker`. Offline, each region has its own account. Online,
every branch uses one Empire account (`EMPIRE_ACCOUNT_REGION`, `goldRegion`); `foldEmpireAccounts` moves a character's
regional balances into it. A loan stays in the region that made it.

DFU behaviours kept: a withdrawal can be refused for weight; the letter-of-credit commission comes off the account,
not the letter; insufficient funds is checked before the minimum; a loan debits its interest at once. The module also
handles house and ship deeds. `walletItem.js` groups currency items (letters of credit and others) in the pack
without moving them out of `entity.items`.

## Physical Items

> Leaves core: the Physical Items mod (decision 99).

A port of demifiend000's Physical Items mod (`vendor/physical-items/`). Items in the world are drawn as their inventory
picture on a billboard, with simple physics, instead of a loot bag. `physicalItems.js` holds the mod's rules, read from
its compiled assembly; `scenes/physicalItemsLayer.js` is the scene half, stood by the ground-pile pool
(`scenes/droppedLoot.js` `createDroppedLoot`). A body's items are pictures of items the body still holds; pressing one
takes it. Online it is the player's own mod, and a peer's body shows no items.

## Unleveled Loot

> Leaves core: the Unleveled Loot mod (decision 99).

`unleveledLoot.js` ports Ralzar's Unleveled Loot (MIT, `vendor/unleveledLoot/`) behind its feature switch
(`features.js` `unleveledLoot`). It replaces DFU's material rolls: Luck, shop quality and dungeon type drive them
instead of player level. It divides a corpse's gold by the player's level and adds a daedric or orcish piece to Daedra
and Orcs.

## The rarity ladder

> Leaves core: the Loot rarity mod, its large features as mods of their own (decisions 73 and 102).

`lootRarity.js` is the game's own departure from DFU. It is the `loot-rarity` Features row (`lootRarity`), on by
default, and the server kit's default profile holds it on for the room. Off, it writes no field and DFU's loot is
unchanged. The hosts apply it where they mint loot: `scenes/hostCombat.js` for bodies (`rollCorpseLoot`), and
`scenes/dungeonContext.js`, `scenes/interiorContext.js`, `scenes/world.js` and `src/systems/searchables.js` for piles
(`rollLootRarity`).

| Tier | What it is |
| --- | --- |
| common | A plain DFU item |
| magic | One or two affixes, or a DFU MAGIC.DEF item |
| rare | Three or four affixes, a name from its lines, and one DFU enchantment as flavour |
| legendary | A fixed record from `LEGENDARIES`, with its own power |
| aetheric | A boss's set piece (`src/systems/aetheric.js`); never rolled |
| artifact | DFU's artifacts, unchanged |
| gilded | Fixed records (`src/systems/gilded.js`); never rolled |

- `rollRarity` and `rarityChances` draw a tier from the source: a corpse's level, a dungeon's kind
  (`DUNGEON_RARITY_TIER`), a pile or boss multiplier (`SOURCE_MULT`), and the player's Luck (`luckMult`). Tuning
  weights are in `RARITY_WEIGHTS`.
- `applyRarity` dresses an item for its tier. `rollAffixes` rolls lines that lean to the item's own skills.
  `affixFold` folds a wearer's affixes onto the entity through `src/systems/entityMods.js`, where DFU's formulas read
  them. `lootPowers.js` runs affixes that act (sear, leech, thorns, focus, slayer) and Legendary powers.
- Rare and Legendary pieces carry a DFU enchantment, so they drop unidentified. Identify works as in DFU.
- **The level gate.** `lootLevelGate.js` scales the Rare and Legendary thresholds by a factor of the roller's level,
  so Rare and Legendary gear is rarer for a young character and more common as the character grows. Magic, shared
  spoils and receipt-seeded spoils are not gated. A room's base roll uses the room's level (`withRollerLevel`).
- **Plain foes.** `foeLootCap.js` (the name is older than its job) marks plain foes for their own rarity weights, rolls
  a foe's kit at its death, and keeps a summon's body bare. It caps nothing. Elite foes, champions, bosses and named
  foes stay off the plain ladder. `renownLoot.js` scales the loot bonus with the roller's Renown online.
- **Extras.** `taken-mark.js` clears a piece's `untaken` mark on its first take. `lootCodex.js` is a collection log of
  Legendary and Aetheric finds. `lootCurse.js` adds a line and a drawback to some finds; a temple lifts it.
  `lootScry.js` points to where an unfound Legendary's family lives. `reforge.js` salvages for Welkynd Shards,
  reforges, hones and imbues lines, and sets or extracts gems. `quickLoot.js` takes from the hover plaque without a
  window (the `quick-loot` row).

**Gem sockets.** A Rare or Legendary piece, and some Magic weapons, can carry `sockets`: one to three entries, each
`'empty'` or a gem id (`socketsOf` also reads the older `socket` string). `socketMax` sets a weapon's count by size
(short blades 1, one-handed 2, two-handed 3; armour and jewellery 1). `gems.js` defines four graded gems (Chipped,
Flawed, Flawless, Perfect, templates 1900-1931) beside DFU's plain grade; shops never stock them. `setGem` is free in
the pack; extracting a gem whole costs `EXTRACT_PRICE` at the Reforge.

The Materials Bag (`src/systems/materialsBag.js`, `src/net/bagLaw.js`) belongs to the professions; see
[professions.md](professions.md).

## Decided, not built

Two decisions change defaults that this area's code still has the old way. Their code lives beside it:

- Elite stacking: in an Elite Dungeon an elite foe runs at x7 health and x2.6 damage, and in a super dungeon x9 and
  x3 (`src/systems/eliteFoes.js`), so the elite layer stacks on the dungeon's. Decided default: capped at the elite
  tier, with the old stacking as an option (decision 117 (19)).
- Absorption: `src/systems/absorption.js` halves the refund (`ABSORB_REFUND_SCALE` 0.5) and caps the chances at 50,
  with no option. Decided default: DFU's value, with the halved refund as an option (decision 117 (20)).

## Testing

Run a file with `node --test <file>`. Start with `test/systems/inventory.test.js`, `itemTransfer.test.js`,
`inventorySession.test.js`, `useitem.test.js`, `banking.test.js`, `pi1_physicalitems.test.js`,
`unleveledLoot.test.js`, `lr1_lootrarity.test.js`, `lootgate1.test.js`, `gem1_sockets.test.js`, and the folders
`test/systems/loot/` and `test/systems/item/`.

## Traps

- Declare every new item field in `itemFields.js`, or the field test fails and the wire clamps it.
- A new port item stat goes in `affixes`, never in `enchantments`.
- Keep seeded draws in order. Add new draws after the existing draws for a door. Otherwise every seeded mint and
  every shared room base changes.
- A shared room's base must read only the room's terms, never the local player's Luck, level or Renown.
- Test the ladder on and off: off must equal DFU's loot.
- Patch notes describe the level gate and do not tabulate it: say that Rare and Legendary gear is rarer early on and
  more common as a character grows, without its levels, factors or chances (decision 116 (3)).
