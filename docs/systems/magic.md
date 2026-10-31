# Magic

This page covers spells and their effects: the spell record, casting and its cost, the effect library, absorption,
enchantments and the item maker, the arcane paths, the readied spellcasting hands, enemy casters, daedra summoning and
diseases. Daggerfall Unity (DFU, MIT, Daggerfall Workshop) is the reference design. Most of these modules port a named
DFU class and say where they depart from it.

## Map of the code

| Area | Files |
| --- | --- |
| Spell record and the classic list | `src/formats/spellsStd.js`, `src/systems/spell/standardSpells.js` |
| Cast engine (all hosts) | `src/scenes/hostMagic.js` `createPlayerMagic` |
| Saving throw, magnitude, ranges, missiles | `src/systems/spellcast.js` |
| Cast cost | `src/systems/spellcost.js` |
| Effect library and the magic round | `src/systems/effects.js`, `src/systems/worldTick.js`, `src/systems/effectBroker.js` |
| Spell power and pierce | `src/systems/spell/spellPower.js` |
| Cast speed | `src/systems/castSpeed.js` |
| Spell maker | `src/systems/spell/spellMaker.js`, `src/systems/spell/spellEffects.js`, `src/ui/spell/spellMakerWindow.js` |
| Spellbook | `src/ui/spellbookWindow.js`, `src/ui/spellbookDoor.js` |
| Absorption | `src/systems/absorption.js` |
| Enchantments (what they do) | `src/systems/enchantments.js`, `src/systems/artifactEffects.js` |
| Enchanting (the item maker) | `src/systems/enchanting.js`, `src/systems/enchantmentCatalogue.js`, `src/ui/item/itemMakerWindow.js` |
| Arcane paths | `src/systems/arcanePaths.js`, `src/systems/arcanePowers.js`, `src/systems/signatureSpells.js` |
| Readied hands | `src/combat/fpsSpellCasting.js`, `src/combat/weapon/weaponRig.js`, `src/combat/twoHands/spellHand.js` |
| Casts on a party mate | `src/systems/allyCast.js` |
| Enemy casters | `src/systems/enemySpells.js` |
| Daedra summoning | `src/systems/daedraSummoning.js`, `src/ui/daedraSummonedWindow.js` |
| Diseases | `src/systems/diseases.js`, `src/systems/infection.js` |

## The spell record

Every spell, made or classic, uses the SPELLS.STD record shape that `src/formats/spellsStd.js` reads: up to three
effects (`type`, `subType`, and duration, chance and magnitude settings), plus `element`, `rangeType`, `cost`, `name`,
`icon` and `index`. The spell maker builds the same shape (`buildCustomSpell`) instead of DFU's
`EffectBundleSettings`, so the cost table, the effect library, the cast engine and the spellbook read one format.

- `rangeType` is the target type: 0 CasterOnly, 1 ByTouch, 2 SingleTargetAtRange, 3 AreaAroundCaster, 4 AreaAtRange
  (`spellcast.js` `TARGET_TYPES`).
- `element` indexes `ELEMENTS` (fire, frost, poison, shock, magic).
- An effect key is the classic `type,subType` pair. `effects.js` dispatches all 91 classic DFU keys.
- `standardSpells.js` `standardSpellsByIndex` builds the classic list and merges each mod's `SpellRecords.json` in mod
  order, as DFU's `RebuildClassicSpellsDict` does. Build the list there; do not fold SPELLS.STD again elsewhere.

**Index bands.** Classic spells use non-negative indices. Made spells count down from -1 (`spellMaker.js`
`mintCustomSpellIndex`). Ready-made spells sit at or below `READY_MADE_INDEX_CEILING` (-45000), which the minter never
reaches. Quickslots and the readied spell are keyed by index, so a collision shows the wrong spell.

## Casting

`createPlayerMagic` in `src/scenes/hostMagic.js` is the one player cast engine. The exterior, the world, interiors
and dungeons all build it, so a casting change is made once. It owns:

- the readied spell (`readied()`, `setReadied`, `setReadiedByIndex`) and its stored price (`readiedCost()`);
- the click-to-cast latch: a CasterOnly spell casts when it is readied; any other spell arms the next attack click;
- the release frame (`releaseFrame`), which spends magicka, tallies school skill and plays the cast sound;
- the four range arms, missiles (flight, wall explosion, foe hits), and `explodeAt`;
- `applySpellToFoe` and `applySpellToPlayer`, which call `effects.js` `applySpell`;
- `spellVisual` for another player's cast (drawn only: nothing is applied or spent);
- `fireEnemyMissile`, so enemy casters use the same missile pool.

Each release mints a cast token `{ cost }`. Every landing of that cast (each foe an area hits, the missile) carries it,
so refunds and riders read what the cast really spent.

Input: Backspace opens the spellbook, Enter readies, and the attack click casts a readied spell (`src/ui/input.js`).

### Cost

`spellcost.js` `calculateCastCost` is DFU's `FormulaHelper.CalculateTotalEffectCosts`: per-effect component gold
from `EFFECT_COST_TABLE`, spell points as `gold * (110 - skill) / 400` in the effect's school, a target multiplier
(`TARGET_COST_MULT`), and a floor of 5 (`CAST_COST_FLOOR`).

Port additions:

- Online, a school past 100 still lowers the price, but never to zero.
- `registerSpellCostMod` and `registerSpellFreeCast` let loot, set bonuses and arcane paths change the price.
- `castSchool` prices a signature spell in its path's schools (see below).

### Saving throws, magnitude, power

`spellcast.js` holds `savingThrow`, `rollMagnitude`, the elemental resistance chance and the missile constants.
`spell/spellPower.js` adds what DFU does not have:

- `schoolPotency`: online, each effective point of a school's climb past 100 adds 1% to what that school does, up to
  x1.4. Destruction raises damage, Restoration raises healing, Alteration raises Shield, Illusion raises concealment
  duration, Mysticism and Thaumaturgy raise their chances. Offline, DFU's numbers stand.
- `registerSpellPowerMod` and `spellPowerMult` sum percent bonuses onto a player's damage spell at a foe.
- `registerSpellPierceMod` lowers a foe's saving throw.
- `registerSpellLandedListener` tells listeners when the player's spell lands. The cast engine calls `tellSpellLanded`.
- `ownSpellAt` limits all of this to the local player's own spell at a foe. Nothing applies at another player.

### Cast speed

`castSpeed.js` `castRate(entity)` sets the speed of both hand lanes, the classic sprites and the Morrowind arm. Speed
50 is rate 1. Registered modifiers (loot, arcane paths) add percents. The result is clamped to `CAST_RATE_MIN` and
`CAST_RATE_MAX`. `weaponRig.js` reads it once per cast. DFU uses a fixed animation clock; this is a port departure.

### Casts on a party mate

DFU has no other players. `allyCast.js` turns a beneficial spell aimed at a party mate into a cast frame
(`{t:'cast'}`, validated by `src/net/wire.js`). The target's own client applies the spell at the caster's level. A
caster never writes another player's vitals. `allyCastable` decides which spells and effects qualify.

## The effect library and the magic round

`effects.js` `applySpell(spell, casterLevel, target, sinks, rolls, caster, ctx)` applies a record to an entity. An
instant effect acts at once. A lasting effect pushes an entry onto `target.activeEffects`, with a `kind`, its settings
and `roundsRemaining`.

- One magic round is one classic minute. `worldTick.js` claims the elapsed rounds (`claimMagicRounds`) and runs them
  (`runMagicRoundsFor`), which calls `tickActiveEffects`.
- Duration is `DurationBase + DurationPlus * floor(casterLevel / DurationPerLevel)`, with no roll.
- A continuous effect rolls its magnitude and its saving throw again every round, as DFU does.
- Like-kind effects merge into one entry, as DFU's incumbent effects do. An arcane-path power that merges with the
  player's own keeps the larger Shield pool or ward chance.
- `ctx.bypassSavingThrows` is DFU's `BypassSavingThrows` flag, used by quest casts.
- Item-pinned entries (from worn enchantments) tick while the item stays equipped.
  `removeItemPinnedEffects` strips them on unequip.
- `effectBroker.js` holds DFU's `SyntheticTimeIncrease`. Prison time, fast travel and the vampirism fortnight set it,
  so item wear and similar enchantment arms skip the jumped time.
- `registerModEffectKind` lets a mod add an effect kind.

Tests: `test/systems/effects.test.js`, `effectcoverage.test.js`, `effectarms.test.js`, `spellcast.test.js`,
`spellcost.test.js`, `castspeed.test.js`, `allycast.test.js`, and `test/systems/spell/`.

## Spell maker and spellbook

`spell/spellMaker.js` ports DFU's spell maker and effect settings editor: the allowed targets and elements, the
spinner ranges (`SPINNER_RANGES`, `clampSetting`), the purchase checks (`validateSpellPurchase`, `purchaseSpell`) and
the price (`spellMakerCost`, which calls `calculateCastCost`). `spell/spellEffects.js` is the effect catalogue the
maker's pickers list. Its support flags decide what a player may set, and the cost table decides what is charged.
DFU keeps the two apart too.

`spell/identifyRefund.js` prices the Identify refund through the cast's own formula, so the refund never exceeds what
the cast spent.

## Absorption

`absorption.js` `tryAbsorption` ports DFU's `TryAbsorption`, in DFU's order:

1. Only Destruction effects can be absorbed.
2. The cost is computed as if the target cast the spell (`effectCastingCost`).
3. The target needs room: if `cost > maxMagicka - magicka`, nothing is absorbed.
4. The sources are checked in order: the Spell Absorption effect, the career flag (`careerAbsorbs`), then any
   registered chance (`registerAbsorptionChance`, used by arcane paths).

Port changes: the Absorbs Spells item enchantment is a roll (`ABSORB_ENCHANT_CHANCE`), not always. The Spell
Absorption effect's chance is capped (`SPELL_ABSORPTION_CHANCE_CAP`). Every absorb refunds half the points, floored
(`ABSORB_REFUND_SCALE`, `absorbRefund`). A career with absorption Always (the Sorcerer) still absorbs every time.
Tests: `test/systems/absorption.test.js`, `absorb_nerf.test.js`.

## Enchantments

An item carries `item.enchantments`, a list of `{ type, param }` pairs from MAGIC.DEF (`src/formats/magicDef.js`).
Loot rarity affixes are a separate list (see [items-and-loot.md](items-and-loot.md)). Keep them apart: every DFU
reader of `enchantments` expects the closed classic enum.

`enchantments.js` runs them in DFU's two ways:

- **Held bundles.** A Cast When Held effect becomes an item-pinned active effect (`assignHeldSpell`).
  `computeEnchantmentMods` folds the constant modifiers.
- **Payload callbacks.** `doItemEnchantmentPayloads` dispatches by context flag (`PAYLOAD`: Enchanted, Used,
  Equipped, Unequipped, Held, Strikes, Breaks, MagicRound, RerollEffect).

`artifactEffects.js` handles the nine Daedric artifacts (enchantment type 26, sub-dispatched by artifact subtype).

**The item maker.** `enchanting.js` ports `DaggerfallItemMakerWindow`'s accounting, and
`enchantmentCatalogue.js` holds every effect's `EnchantmentSettings` cost. Two sums matter:

- The enchantment-point sum counts powers and side effects, and excludes forced enchantments. Side effects cost
  negative points, so a drawback buys budget.
- The gold sum counts powers only, includes forced enchantments, and multiplies by ten.

Gold is checked before the item's limit. An item holds at most `MAX_ENCHANTMENTS`. Aetheric and Gilded pieces take no
enchantment. Item power is the template's base plus the material multiplier, floored (`itemEnchantmentPower`).
Tests: `test/systems/enchanting.test.js`, `enchantments.test.js`, `enchantmentcatalogue.test.js`,
`enchantcast.test.js`.

## Arcane paths

A port-only system: DFU has no specialisations. A player who has mastered two of the six magic schools (Master Skills
in force) chooses one path, named by the pair. There are fifteen. Each has a passive and a signature spell with a
rider.

- `arcanePaths.js` is the data and the rules: `PATHS`, `PATH_NUMBERS` (every number a path names), `choosePath`,
  `pathHeld`, `pathAwake`, `pathCastSchool`, and `pathFindings` for the account service. It is a leaf module, so the
  cost code and the server judge import it without a cycle. `entity.arcanePath` stores the choice. Giving it up costs
  `SPEC_RESET_GOLD`.
- `arcanePowers.js` registers each path's effects at import through the existing hooks: spell power, pierce, cost,
  cast speed, the entity fold, the player's damage and hurt listeners, blow evasion, kills, the magic round and
  absorption. Every power is off in a refereed fight (`sigil.js` `sigilDueling`).
- `signatureSpells.js` builds each signature spell's record with the spell maker's builder. Records use their own
  index band from `SIGNATURE_INDEX_BASE`. Only the Mages Guild (or temple) shelf sells it, and only to the path's
  holder. Without its holder, the spell is the plain classic bundle with no rider.
- `spellcost.js` `castSchool` prices and trains a signature spell in its path's two schools.
- `server-account/src/judge.js` flags (finding code `path`) a save whose `arcanePath` names schools it has not
  mastered.

Tests: `test/systems/schools_arcane.test.js`, `audit_schools.test.js`.

## Readied spellcasting hands

A port of the Readied Spellcasting Hands mod (jefetienne, MIT, vendored in `vendor/readied-spellcasting-hands/`,
credited in `src/ui/credits.js`). A readied spell that is not CasterOnly shows frame 0 of its element's cast art until
the cast starts.

- `fpsSpellCasting.js` `readiedHandsFrame(spell, castPlaying)` answers frame 0 or -1. It returns -1 for no spell, a
  playing cast, CasterOnly (`rangeType` 0), or an element with no art.
- `weaponRig.js` draws it with `drawSpellCastHands`, at the same layout as the cast. It hides the readied hands while
  the climbing hands (`src/combat/climbHands.js`) are showing.
- With a one-handed weapon and a free hand, `twoHands/spellHand.js` `drawSpellHand` raises one hand beside the weapon
  instead of hiding the weapon.
- Classic sprite lane only. The Morrowind arm has its own spell stance.

Tests: `test/combat/fpsspellcasting.test.js`, `spellhand.test.js`, `climbhands2.test.js`.

## Enemy casters

`enemySpells.js` `setEnemySpells` ports DFU's `EnemyEntity.SetEnemySpells`. It sets `MaxMagicka = 10 * level + 100`,
forces the six magic skills to 80, and resolves the spell lists (`MONSTER_SPELL_LISTS`, `ENEMY_CLASS_SPELLS`) from the
standard list. A missing record is skipped with a warning. Enemy missiles fly through the cast engine's
`fireEnemyMissile`. Test: `test/systems/enemyspells.test.js`.

## Daedra summoning

`daedraSummoning.js` ports DFU's `DaedraSummoningService`. Each prince answers on one day of the year (`DAEDRA`,
`dayOfYear`). The Glenmoril Witches always summon Hircine. Any other coven summons a random prince (never Hircine),
chosen once a day. Temples and the Mages Guild summon whoever's day it is. The cost is
`200000 - reputation * 1000` (`summoningCost`). Sheogorath can gatecrash, more often in a storm. A weather term
(`weatherBonus`) applies to princes with a `bonusCond`. `src/ui/daedraSummonedWindow.js` plays the prince's FLC film
with the quest offer. Test: `test/systems/daedrasummoning.test.js`.

## Diseases

`diseases.js` ports DFU's `DiseaseEffect` and the `OnMonsterHit` riders. A disease is a permanent active-effect entry
(`kind: 'disease'`). It runs a daily tick on top of the magic round: each new classic day it rolls damage once and
applies the `DISEASE_DATA` row to stats, health, fatigue and magicka. `inflictDisease` gates on the player's level and
a full saving throw. The same disease cannot be caught twice. `onMonsterHit` holds the monster attack riders. Spider
Touch paralysis is one. Lycanthropy and vampirism go to `infection.js`. Cure effects live in `effects.js`
(`cureAllDiseases`). Test: `test/systems/diseases.test.js`.

## Traps

- `hostMagic.js` is shared by every host. Test a change in town, an interior and a dungeon.
- Online, apply a cast at another player through the cast frame, never by writing their entity.
- Add a new bonus through a `register*` hook (`spellPower.js`, `spellcost.js`, `castSpeed.js`, `absorption.js`), not
  as a branch inside the cast engine.
