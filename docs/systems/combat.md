# Combat

This page covers physical combat: how a melee swing or an arrow becomes damage, weapons and their swing timing, two
weapons and bare hands, shields, weapon techniques, enemy strength (elites, champions, boss traits, place scaling),
the power ceiling, and blood. Spells and enemy spellcasting are on [magic.md](magic.md). Foe tactics (attack tokens,
telegraphed blows, cover) are on [enhanced-ai.md](enhanced-ai.md). Attributes, skills and levelling are on
[characters.md](characters.md).

The core is Daggerfall Unity's (DFU, MIT, Daggerfall Workshop) `FormulaHelper`, `WeaponManager` and `EnemyAttack`,
ported verbatim, with classic bugs kept where DFU keeps them. Vendored DFU mods change it through registered
overrides. Every departure the game makes is named below.

## Where it lives

| Concern | Files |
| --- | --- |
| Formulas (to-hit, damage, armour, wear) | `src/combat/formulas.js` |
| Physical Combat and Armor Overhaul (PCAAO) | `src/combat/pcaao.js`, `src/combat/pcaaoMeanerMonsters.js` |
| Player melee | `src/combat/playerWeapon.js` (`PlayerWeapon`, `resolveHit`) |
| Swing timing and state machine | `src/characters/weaponStates.js`, `src/combat/swingLaw.js` |
| Weapon tables | `src/characters/weapons.js` |
| Shared host combat laws | `src/scenes/hostCombat.js` |
| Arrows | `src/combat/arrowFlight.js`, `src/systems/fletching.js` |
| Two hands, fists, off hand | `src/combat/twoHands/` (`handsLaw.js` is the law) |
| Shields | `src/combat/pcaao.js` (block roll), `src/combat/shieldWidget.js` (drawing) |
| Techniques | `src/combat/technique/`, `src/combat/techniques.js` |
| Martial paths | `src/systems/martialPaths.js`, `src/systems/martialPowers.js` |
| Enemy attack, equipment | `src/characters/enemy/enemyAttack.js`, `src/combat/enemyEquipment.js`, `src/combat/rriEnemyEquipment.js` |
| Elites, champions, boss traits | `src/systems/eliteFoes.js`, `src/systems/champions.js`, `src/systems/bossTraits.js` |
| Power ceiling | `src/systems/powerCeiling.js`, `src/systems/entityMods.js` |
| Player damage door | `src/characters/playerEntity.js` (`hurtPlayer`) |
| Blood | `src/combat/blood/`, `src/scenes/hitEffects.js` |
| First-person drawing | `src/combat/weapon/weaponRig.js`, `src/combat/fpsWeapon.js`, `src/combat/weapon/weaponWidget.js`, `src/combat/diverseWeapons/`, `src/combat/fpArm.js` |
| Stats card numbers | `src/combat/combatStats.js` (drawn by `src/ui/statsCard.js`) |
| PvP duel blow | `src/combat/duelCombat.js` |

## The blow, end to end

1. **Swing.** `PlayerWeapon` steps the shared weapon state machine (`weaponStates.js`, used by player and foes). A
   drag or key picks a strike direction; the machine reports a `hit` frame.
2. **Reach.** `resolveHit(foes, player, canSee, ...)` keeps foes within `WEAPON_REACH` (2.25 + 0.25 m), in the camera
   view and with line of sight (`playerMeleeCanHit`). Protected foes (allies, pacified people) are struck only when
   nothing else is (`friendlyProtected`). Shipmates and refugees are never struck (`src/combat/friendlyFire.js`).
3. **Options.** `playerAttackOptions` adds the swing modifiers (`SWING_MODS`: thrust up -4 damage/+10 to hit, overhead
   +4/-10, diagonals +-2/+-5) and the backstab chance (`backstabChanceOf` in `hostCombat.js`). A bow release counts
   as an overhead strike.
4. **Resolution.** `formulas.js` `calculateAttackDamage(attacker, target, opts)`. If a core is registered under
   `calculateAttackDamage` (PCAAO's), it runs instead of the stock body. Either way the tail runs: concealment, the
   weapon's Cast When Strikes payload, poison, the struck-part hook, the HUD report (`setPlayerAttackHook`) and the
   resolution listeners.
5. **Blow modifiers.** `entityMods.js` `weaponBlowMods` applies loot powers, set powers, mastery, martial paths and
   the sky's channels inside the blow ceiling (below).
6. **Apply.** The host's `damageFoe` (`src/scenes/exteriorFoes.js`, `src/scenes/dungeonContext.js`) runs boss traits,
   shield pools, knockback (`enemyKnockbackApplies`), hit flash and blood. Damage to the player goes through
   `hurtPlayer`.

Foes use the same `calculateAttackDamage`. A monster without a weapon rolls up to three damage spans, each gated by
the player's reflexes (`50 - 10 * (reflexes - 2)` per cent).

### The stock formula (`formulas.js`)

- Material gate: a target with `minMetalToHit` above the weapon's material takes nothing.
- To hit: weapon skill + swing and option terms + proficiency and racial modifiers (player) + backstab chance +
  material x 10, then `calculateSuccessfulHit` adds stats, skills, armour of the struck part
  (`calculateStruckBodyPart`) and adjustments, clamps to 3..97, and rolls `dice100`.
- Damage: `weaponAttackDamage` (base span from `weapons.js`, strength `damageModifier`, material, enemy-type bonus)
  or `handToHandAttackDamage`; a backstab triples it.
- Wear: `damageEquipment` damages the weapon and the struck armour.

### PCAAO (on by default)

`installPcaao` registers overrides with `registerFormulaOverride`. Its switches read the mod settings live
(`pcaaoModules`); defaults: `Enabled` on, `armorHitFormulaRedone` on, `fixedStrengthDamageModifier` on,
`criticalStrikesIncreaseDamage` on, `equipmentDamageEnhanced` (faster wear) off. With the redone formula, armour
reduces damage instead of lowering the chance to be hit: the player reads a flat 100, a class foe a flat 60, a monster
its part's armour value.

Departures from the mod: every striker's weapon skill counts x1.5 to hit (`Math.ceil(skill * 1.5)`), and every
striker rolls criticals as `crit / (4 - luckTerm)`. Condition bands above 75% give no bonus while
`equipmentDamageEnhanced` is off (`pcaaoAlterDamageBasedOnWepCondition`'s `sharpEdge`); worn gear still loses
effectiveness. Bows take the two-handed strength term.

## Weapons and swing timing

`weapons.js` holds DFU's weapon enums, the damage table (`weaponMinDamage`, `weaponMaxDamage`), material modifiers
and multipliers, and `weaponSkillUsed`. Departure: the Short Bow deals 5-17 and the Long Bow 5-19 (DFU 4-16, 4-18).

Swing tempo is the game's own law, not DFU's (`weaponStates.js`, read through `swingLaw.js`):

```text
frame seconds = clamp(0.09, 0.4, SWING_BASE_FRAME * swingTempo(speed) * heft * handling)
```

- `swingTempo`: 1.4 at Speed 0, 1 at 50, 0.6 at 100.
- `swingHeft(weightKg, strength)`: weight above 2.5 kg slows the swing, less with high Strength, at most +35%.
- `swingHandling`: per weapon type; two-handers x1.06; every short blade handles as a dagger.
- `registerSwingPaceMod` lets powers speed the swing (at most `SWING_PACE_MOST`, 50%).

The enemy melee timer (`enemyAttack.js` `resetMeleeTimer`) and bow cooldown (`getBowCooldownTime`) stay DFU's.

## Two hands and bare hands

`handsLaw.js` is pure; both drawing lanes and the swing read it. `handsModeOf` returns:

| Mode | When |
| --- | --- |
| `fists` | both hands empty: both fists up, both strike |
| `dual` | two one-handed melee weapons (`DUAL_TYPES`) |
| `single` | everything else: a shield, a two-hander, a bow, a staff, one weapon, a held light |

In a pair the lead hand opens; a strike within `FLURRY_WINDOW` (0.75 s) of the last is the other hand's and starts
one frame in. The off hand's blow (`DUAL`, `OFF_HAND_BLOW`) deals 0.8 of the rolled damage, takes -5 to hit at
Agility 50 (range -10..0), feels its weapon 1.5x heavier (paid as held ticks), and counts as 0.8 of a blow for
per-blow effects. Fists keep DFU's numbers. `H` swaps hands or picks the lead. Drawing:
`src/combat/twoHands/twoHands.js` (sprite lane), `src/combat/twoHands/mirrorRig.js` (Morrowind arm). A readied spell in the free hand is on
[magic.md](magic.md).

## Ranged

Two lanes resolve a player's arrow; both call `calculateAttackDamage` with the bow's options:

- **Dungeon:** full missiles in `src/scenes/dungeonContext.js` (foe seeking, recovery).
- **Every other host:** `arrowFlight.js` `ArrowFlight` and `playerArrowHitFoe`.

Shafts fly at `ARROW_FLIGHT_SPEED` (`src/systems/spellcast.js`, 1.35 x `MISSILE_SPEED`); spells stay at
`MISSILE_SPEED`. A shaft that hits the world sticks (`stickArrow`, at most `STUCK_ARROWS_MAX` = 40) and can be picked
up; one that hits a foe lodges with chance `ARROW_LODGE_CHANCE` (0.5) in the foe's pack, to be
looted. Arrows are also
fletched from carried wood (`fletching.js`) and sold. Enemy archers aim through `enemyTargets.js`
`arrowAimDirection`.

## Shields and blocking

There is no block key. A shield is armour on the body parts it covers (`enemyEquipment.js`
`shieldProtectedBodyParts`). Under PCAAO a hit on a covered part rolls a block (`pcaaoShieldBlockChanceCalculation`):
a base chance per shield (Buckler 30, Round 35, Kite 45, Tower 55 on a covered part; lower on an uncovered one) bent
by the six physical stats. A block routes the damage reduction and wear to the shield. `shieldWidget.js` (the Shield
Widget mod, default on) only draws the shield and its recoil.

## Weapon techniques and martial paths

A technique is a rolled loot line on a weapon or on gauntlets (`AFFIX_KINDS.technique`, see
[items-and-loot.md](items-and-loot.md)), used with the Weapon technique key. `techniqueRoster.js` `TECHNIQUES` holds
twelve: Volley and Piercing Shot (archery), Leap Strike and Whirlwind (long blade), Shadowstep and Lunge (short
blade), Cleave and Headsman's Chop (axe), Ground Slam and Skull Crack (blunt), Flying Kick and Haymaker (hand to hand).
Each has a mechanic, aim, fatigue, cooldown and a `base` multiplier on the normal `calculateAttackDamage` result (a
miss stays a miss); the line adds +5..50% (`TECHNIQUE_BANDS`). `techniques.js` runs them, `techniqueBlow.js` shapes
the blow (reach, arc; never against a player), `techniqueFx.js` adds the feel. DFU has no techniques: with the loot
ladder off, none roll.

Martial paths (`martialPaths.js`): with Master Skills on and two weapon skills mastered, a character picks one of 15
paths (one per pair of weapon skills). A path adds passives, riders and a signature technique outside the loot roster
(`martialPowers.js`, blow bonus at most `MARTIAL_BLOW_MOST`).

## Enemy strength

- **Base stats:** `enemyEntity.js` (see [characters.md](characters.md)). Equipment: `assignEnemyStartingEquipment`;
  Roleplay Realism Items' realistic equipment (`rriEnemyEquipment.js`) replaces it while its switch is on (default
  on). Meaner Monsters (`src/characters/meanerMonsters.js`, default on) retunes about 20 monsters; with PCAAO on its
  PCAAO edit (`pcaaoMeanerMonsters.js`) is used.
- **Place threat:** `skillSoftcap.js` `placeVeteran(tier)` grades a place by the loot ladder's dungeon tier (4 =
  none, 18 = full; wilderness 5 by day, 7 by night). At full share a foe has x2 health, x1.25 damage, +10 skill.
  `enemyEntity.js` `applyProgressionScaling` is the one writer. Towns and interiors never scale.
- **Elites** (`eliteFoes.js`): x5 health, x3 damage, 1.25x size, a glow, better loot; x7/x4 in an Elite Dungeon and
  x9/x4.5 in the super dungeon. 5% of overworld foes; in a plain dungeon one, one time in five; three or four in an
  Elite Dungeon. Never under level 3, never the watch, an ally or a quest foe. Online always; offline only while the
  loot ladder is on. Each elite carries one boss trait.
- **Champions** (`champions.js`): 70 per mille, level 3+, x2 health, x1.25 damage, and one trait from
  `CHAMPION_TRAITS` (Mighty, Stalwart, Swift, Vampiric, Thorned).
- **Boss traits** (`bossTraits.js`): `warded` (a ward of 30% health that regrows), five element proofs (a spell of
  that element lands 25%), `bladeturning` (blades and arrows land 50%), `stoneskin` (blunt and fists land 50%),
  `curbing` (no blow over 5% of health), `wrathful` (x1.6 damage 75 s into a fight), `thorned` (20% of weapon damage
  returns). Elites carry one, raid leaders two; relay bosses take one element proof and one of
  `RELAY_BOSS_BLOW_TRAITS`. `bossStrike` runs on the striker's machine, `bossTake` on the foe owner's; the traits
  answer player blows only. The wire field is `bt` (a mask over `BOSS_TRAITS`, append only).

## Damage to the player (`hurtPlayer`)

Order: damage veto (`registerPlayerDamageVeto`), evasion (`registerPlayerBlowEvasion`), damage modifiers
(`playerDamageMods`, inside the guard ceiling), the magic shield pool (`damageShieldPool`), the duel's spare, then the
full-health guard: one foe blow never kills a player at full health (it leaves 1). Falls, spells, traps and world
bosses are not blows. Then death saves (`registerPlayerDeathSave`), then the guild's avoid-death hook, then death.

## The power ceiling

`powerCeiling.js` holds two products. `BLOW_TOPS` gives each blow registry its top (sigil, sets, loot, sky, mastery,
paths); `GUARD_TOPS` gives each guard registry its share. `weaponBlowMods` and `playerDamageMods` open the ceiling per
blow and per hurt (`openBlowCeiling`, `openGuardCeiling`); each registry asks `blowRoom` / `guardRoom` under its own
name and is cut at its own top. The rule for new content: add sideways (new builds, new mechanics), not higher numbers.
`test/combat/powerceiling_walk.test.js` checks every fixed record against the item tops;
`node tools/powerCeiling.mjs` prints the measured tables.

## Blood

The game's own system, no mod. `bloodSwitch.js` reads the switches: `blood-marks` (on; `?blood=off` disables),
`blood-gore` (`light`, `normal`, `heavy`, `abattoir`: density and mark capacity), `blood-overkill`, `blood-screen`.
`bloodDecals.js` and `bloodMarks.js` keep pools of marks on surfaces; `bloodBleed.js` makes wounded and dead bodies
bleed; `bloodGibs.js` throws gibs on a heavy overkill; `bloodArt.js` generates the atlas at boot.
`src/scenes/hitEffects.js` draws the classic splash. `src/systems/hitFlash.js` flashes a struck body red.

## First-person weapons

`weaponRig.js` is the one surface all hosts mount. Lanes: the classic sprite (`fpsWeapon.js`), the Weapon Widget clone
(default on), Diverse Weapons sprites (default on), and the Morrowind arm (`fpArm.js`, enhanced skin, very large).
`src/systems/weaponGlow.js` draws a weapon's element.

## Tests

`test/combat/formulas.test.js`, `combatStats.test.js`, `twohands.test.js`, `twohands_mw.test.js`,
`balArchery.test.js`, `enemyequipment.test.js`, `sw1_shield_widget.test.js`, `duel_combat.test.js`,
`blood1_decals.test.js`, `powerceiling.test.js`, `powerceiling_walk.test.js`, `test/combat/weapon/`;
`test/systems/bosstraits.test.js`, `elite_spawn_audit.test.js`, `loot7_champions.test.js`, `martial_paths.test.js`;
`test/characters/backstab.test.js`, `test/characters/enemy/`.

## Traps

- **Two cores.** Any formula change must be made in both `formulas.js` and `pcaao.js`, or be gated on the switch.
  `combatStats.js` models both for the stats card; update it too.
- **One door each way.** Damage to the player goes through `hurtPlayer`; a melee swing through `resolveHit`; a blow's
  resolution through `calculateAttackDamage`. A host that computes damage itself skips traits, ceilings and reports.
- **Shared state in PCAAO.** `shieldBlockSuccess` is a module-level static, as in the mod; it is valid only within one
  resolution.
- **Import cycles.** `enemyGroups.js`, `racialLive.js`, `blowTaken.js`, `healthShare.js` and `powerCeiling.js` are
  leaves so formulas can read them. Keep them import-free.
- **Frame-rate independence.** Off-hand costs and flurries are counted in machine ticks, not seconds; keep new timing
  terms in ticks.
