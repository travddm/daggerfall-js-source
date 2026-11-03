# Balance harness

`tools/balance/` measures combat balance by player level under Daggerfall Unity's (DFU) rules and under this game's
rules, so a retune can show before and after numbers against a target. It changes no gameplay.

## What it measures

For five reference builds (warrior, archer, spellsword, mage, thief) at levels 1, 5, 10 ... 45, against a weak, an
average and a strong foe, plus an elite and a boss (this game only; DFU has neither):

- **dps**: hit chance x damage a swing, shot or cast, over the seconds it takes.
- **kill s**: the foe's mean health over that dps.
- **foe dps**: the foe's hit chance x damage an attack (after the player's armour and guard) over its attack interval.
- **dies s**: the player's health over the foe's dps.

Each is printed for DFU, for this game, and as the ratio ours / DFU.

## How to run

```bash
node tools/balance/run.mjs --build warrior,mage --levels 1,12,30,45
node tools/balance/run.mjs --layers -hero,-stats --md out.md --json out.json
node tools/balance/run.mjs --ablate --levels 1,10,20,30,45
```

| Option | Meaning |
| --- | --- |
| `--build`, `--levels` | Comma lists. Default: all builds, levels 1, 5, 10, 15, 20, 25, 30, 35, 40, 45. |
| `--layers` | `default`, `all`, `none`, a list, or `+x` / `-x` edits of the default set. |
| `--dungeon` | The encounter table foes come from (default `orcstronghold`, which has no class foes). |
| `--swings` | Seeded swings per cell (default 4000). The same options always print the same numbers. |
| `--gear-percentile` | Percentile of DFU's `RandomMaterial(level)` the build's gear is drawn at (default 0.9). |
| `--arena2` | ARENA2 folder (or set `ARENA2_PATH`): real monster attributes. Without it every foe attribute is 50 in both rule sets. |
| `--ablate` | Prints the power ratio with each layer switched off in turn. |

## The two rule sets

**DFU** (`dfu.mjs`) is a port of `FormulaHelper.cs` as expectations: hit chance, weapon damage, swing and bow timing,
a monster's three attacks with the Reflexes gate, and the monster attack timer. It does not call `src/combat`, because
the game's stock core still carries port-only seams. `test/tooling/balanceHarness.test.js` checks it against that core
on a classic fight (hit chance within 0.015, damage a swing within 0.25).

**Ours** (`ours.mjs`) runs seeded swings through the game's real `calculateAttackDamage` in both directions, with the
real foe builder, scaling seams, equip table and swing law. Each layer is a switch the game reads:

| Layer | What it switches |
| --- | --- |
| `pcaao` | Physical Combat And Armor Overhaul (`installPcaao`), tuned toward DFU in B3. |
| `stats` | The classic monster rows under Enemy Expansion and MUDEX, with the stat pass, read when the foe is built. |
| `master` | Master Skills: mastered skills climb to 200 and read up to 140. |
| `online` | Online-only rules: the level law, the weapon skill's blow and pace past 100, school potency and spell cost past 100. |
| `onlineHealth` | The online health floor (`evenHpFloor`). |
| `skyHealth` | The online layer's other health at its most: Renown's (`renownBonus`, Renown 50) and the Firmament's at its channels' sums (`firmamentHealth`). Off by default; the maxed character adds it (`+ceiling,+skyHealth`). |
| `hero` | Hero's threat: plain foes grow with player level past 30 (`heroThreat`). |
| `power` | Loot-ladder gear: a damage line on the weapon, an armour line on each piece, at the tier the level wears. |
| `techniques` | The best weapon technique the gear tier can roll. |
| `swing` | The swing law: DFU's Speed line with the weapon's heft and handling (B3). |
| `virtue` | Oblivion-style levelling, 12 attribute points a level (off by default). |
| `ceiling` | The maxed character: the blow takes the rest of its room up to `BLOW_MOST`, the hurt and the spell likewise (off by default; add it with `--layers +ceiling,-hero,-stats`). |

The default is the game as an online room runs it.

## The reference characters

Stated in `builds.mjs` and `progression.mjs`; none comes from a save.

- Level L needs a counted-skill gain of 15 L - 28 (`CalculatePlayerLevel`, inverted), shared evenly over the build's six
  counted skills. Other skills the build uses rise at half that pace.
- DFU caps skills at 100, so its characters stop at level 31. Past that the DFU column repeats the level-31 character
  and its row is marked `*`.
- With Master Skills the online level law spreads the climb over 800 effective points and reaches level 45.
- Attributes: 5 points a level by the build's weights, each held at 100. Hit points: `25 + h`, then the class mean roll
  plus the Endurance modifier each level.
- Gear: a longsword, bow, dagger or staff, and seven armour pieces (plate, chain, leather or none by build), all at the
  material `RandomMaterial` gives at the gear percentile. Same gear in both rule sets. No shields.
- Foes: DFU's encounter-table band for the level (`RandomEncounters.ChooseRandomEnemy`), ranked by health x damage a
  swing. Weak, average and strong are its 10th, 50th and 90th percentile. Health is the row mean. Elite is the strong
  foe at the elite tier (x2 health, x1.3 damage); boss is an elite in an Elite Dungeon (x7 and x4).
- Casters cast the Lightning spell (SPELLS.STD 31) while magicka lasts, then swing, over a 30-second horizon.

## How to read it

The target (from the owner) is a maxed character at about 1.5x a DFU character, falling in a straight line to 1.0 at
level 1. Two numbers are compared with it:

- **Character power**: the geometric mean of dps ratio and dies-s ratio when this game's character meets **DFU's own foe
  row** (the foe layers `stats` and `hero` are switched off for it). It isolates the character.
- **Fight power**: the same mean when the character meets this game's foe. A value under 1 means the foes are harder
  than DFU's by more than the character is stronger.

`Character / target` is how far each level is from the target: 1.00 is on target.

## The player-power budget (B1)

The default run measures typical gear, which never reaches the stacking limits. `+ceiling` measures the same character with
every stacking source near its top, held by the safety net. Before B1 that character was x20 to x54 a DFU character at level
45 (ARENA2 attributes, DFU's own foe row).

B1 rescaled the numbers on the sources, so a card prints what a blow gets and no registry is cut:

- each registry's records reach exactly its top (`BLOW_TOPS`, `GUARD_TOPS` in `powerCeiling.js`), held equal by
  `test/combat/powerceiling.test.js`;
- blow percents add (the runner sums them; they multiplied before);
- the net (`BLOW_MOST` and `GUARD_LEAST`) was +75.4% and 74% at B1, above a normal kit and below the tops summed;
  B5 made it the tops summed (+34.5%, 86.35%);
- a skill past 100 pays 0.2% a point, gear on a weapon skill 0.1% a point up to 5%, and a mastered skill reads at most 110
  to hit and to crit (`AIM_PAST_MAX`);
- a technique aims +5 to +10 and tops at x1.95 of a blow. The Firmament tree is left to B5.

`test/tooling/playerPowerBudget.test.js` holds the character-power bounds.

## The combat core (B3)

B3 tuned the combat core toward DFU and gave the swing its Speed line back. Each departure from DFU is named in the
code next to it.

- **To hit** (`pcaao.js`): the weapon skill counts once, as `FormulaHelper.cs` reads it (the mod's x1.5 is gone). To
  keep the hit chance at DFU's from level 10 to 30, a weapon's material gives x6 + 2 (DFU x10, the mod x2 + 2) and
  dodging takes a quarter (DFU's; the mod halves it).
- **Critical strikes** (`pcaao-critical.ts`): a critical multiplies the blow by `1 + 0.025` a five points of Critical
  Strike (x1.5 at 100; the mod's x2.0, DFU's none) and adds `crit / 10` to the chance to hit (DFU's; the mod `crit /
  4`). A slight edge over DFU: about +12% a blow at 100, rolled one blow in four.
- **Swing** (`weaponStates.js`): the frame time is DFU's `3 * (115 - Speed) / 980` with Speed held to 0..100, times
  the weapon's heft (at most +8%) and handling (0.9 to 1.04, two-handers x1.03). The slowest weapon costs 13.6% of
  DFU's swing rate. Before B3 the port flattened the line (1.4 at Speed 0 to 0.6 at 100) and added up to +35% heft and
  +12% handling, so a Speed-100 build swung at 0.42 of DFU's rate. Roleplay & Realism's weaponSpeed and Items'
  weaponBalance (the game ships weaponBalance on) read weight and Strength against Speed. Their cost is folded into the
  heft (`modHeft`: a quarter of the time they would cost, at most 8%) and is no longer fed to the law as a lower Speed,
  which cost a Speed-100 build half its swing rate in the running game. The harness's `swing` layer raises
  weaponBalance's swing answer, so it matches the game; the maxed numbers below come from that corrected model.
- **Bows**: the strength term is taken once, as DFU does (BAL-ARCHERY doubled it). The +1 on the damage span stays, as
  does the random shield armour (not touched here).

Effect on the budget (ARENA2 attributes, DFU's own foe row, character power, base -> B3):

| Typical gear (default run) | Level 1 | 10 | 20 | 30 | 45 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warrior | 0.82 -> 0.85 | 0.63 -> 0.68 | 0.88 -> 0.94 | 0.84 -> 0.99 | 0.89 -> 1.41 |
| Thief | 1.00 -> 1.14 | 0.77 -> 0.95 | 0.75 -> 1.04 | 0.72 -> 1.14 | 0.85 -> 1.34 |
| Mage | 0.84 -> 0.90 | 0.84 -> 0.89 | 0.85 -> 0.94 | 1.10 -> 1.17 | 1.39 -> 1.50 |
| Spellsword | 0.89 -> 0.91 | 0.83 -> 0.86 | 1.00 -> 1.04 | 1.16 -> 1.21 | 1.38 -> 1.51 |
| Archer | 1.00 -> 0.99 | 0.98 -> 0.97 | 1.18 -> 1.11 | 1.32 -> 1.23 | 1.50 -> 1.40 |

The target line runs from 1.0 at level 1 to 1.5 at level 45. A character at Speed 100 swings 2.1 times as often as one
at Speed 75 in DFU's own formula, so the melee builds that reach Speed 100 climb past level 30; that is DFU's law with
level 45 attributes. The maxed character (`+ceiling`) rises with it:

| Maxed (`+ceiling`), level 45 | B1 | B3 |
| --- | ---: | ---: |
| Warrior | 1.32 | 2.08 |
| Thief | 1.29 | 2.04 |
| Spellsword | 1.77 | 1.95 |
| Mage | 1.74 | 1.90 |
| Archer | 2.21 | 2.06 |

Even with no blow bonus at all, a Speed-100 warrior at level 45 is roughly 1.6 (estimated from the dps and survival
ratios) against DFU's level-31 character, so the swing law alone puts the maxed melee builds over 1.5. The remaining
distance is the gear (B4) and the Firmament tree (B5). `test/tooling/playerPowerBudget.test.js` holds the new bounds;
they are higher than B1's for the swinging builds.

## Loot and economy (B4)

B4 tamed the loot affixes toward Daggerfall's enchantment strength and put the economy near DFU's. Each departure from
DFU that stays is named here.

- **Affix bands** (`AFFIX_RANGES`, the Legendary records and the Gilded and Regalia lines): about 0.6 of the first
  ladder for damage, armor, stat, resist, skill, and about 0.6 for the lines that act (elemental, leech, thorns, focus,
  slayer, casting speed, potency, wellspring). Legendary stays at least 1.4 times Rare in the middle of its band. The
  numbers are rescaled at the source: nothing new is cut by a cap, and a card prints what applies. The carrying-capacity
  line (DFU's 25% and 50% allowance), the techniques and the survival lines are unchanged. The Legendary powers were
  rescaled in B1 and are unchanged.
- **Drought and foe cap**: the bad-luck drought is removed. The three-piece cap on a plain foe's body is removed; the
  plain ladder, the kit roll and the bare summon stay. The level gate stays.
- **Kill gold** (`kill-gold.ts`): the table's range times `1 + 1.5 ln(level)`: 1 at level 1, 4.5 at 10, 5.5 at 20,
  6.7 at 45. DFU multiplies by the level (45 at level 45); Unleveled Loot made it flat.
- **Healing potions**: a looting foe carries one 0.35 times in 100 and a deep pile 0.45 (DFU's random potion gives
  about 0.15 and 0.2), at most 2.8 times DFU at the highest Renown online. The alchemist's shelf is unchanged.
- **Repair cost, the Daedric sale and the soul value**: repair costs DFU's price (it was a third); a counter pays
  Daedric gear its whole value; the general-spawn Dragonling binds at DFU's 0 (it had been -5000, a gift of budget).

Character power, ARENA2 attributes, DFU's own foe row, before -> after (typical gear):

| Build | L1 | L10 | L20 | L30 | L45 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warrior | 0.87 -> 0.87 | 0.69 -> 0.66 | 0.96 -> 0.94 | 0.97 -> 0.93 | 1.47 -> 1.36 |
| Thief | 1.14 -> 1.14 | 0.95 -> 0.94 | 1.04 -> 1.03 | 1.11 -> 1.08 | 1.32 -> 1.26 |
| Mage | 0.88 -> 0.88 | 0.88 -> 0.88 | 0.94 -> 0.93 | 1.17 -> 1.17 | 1.52 -> 1.52 |
| Spellsword | 0.91 -> 0.91 | 0.86 -> 0.83 | 1.06 -> 1.05 | 1.22 -> 1.21 | 1.52 -> 1.48 |
| Archer | 0.99 -> 0.99 | 0.95 -> 0.93 | 1.11 -> 1.09 | 1.23 -> 1.18 | 1.40 -> 1.31 |

Maxed (`+ceiling`), level 45: warrior 2.16 -> 2.00, thief 2.01 -> 1.92, spellsword 1.96 -> 1.90, mage 1.93 -> 1.92,
archer 2.06 -> 1.92. Loot lowers a maxed melee or archer build by 0.05 to 0.16 and a mage by almost nothing: the
rest of the excess is the swing law, the other registries' tops (the Firmament tree, the sets, mastery) and the online
health floor, which B5 takes. `MAXED_POWER_MOST` in `test/tooling/playerPowerBudget.test.js` is 2.08 / 2.13 / 2.00 /
1.96 / 2.20 (no ARENA2), down from B3's 2.25 / 2.31 / 2.17 / 2.02 / 2.36.

## Online health (B5)

Online, a body is the stored health, the Endurance floor (`levelEven.js` `evenHpFloor`), and the layer that rides
above it (`renownLayer.js`). DFU has the stored health alone: each level's roll (`CalculateHitPointsPerLevelUp`, with
`HitPointsModifier`, Endurance / 10 - 5) added once and never repaid. Decisions (the owner's):

- **Endurance floor: kept.** A departure from DFU, online: a character never sits under the average-roll body of its class,
  level and current Endurance. In the harness it is the `onlineHealth` layer.
- **Firmament health: a few per cent.** The tree's Health was 66 raw points on six key stars and 17% on the small stars,
  held to +75 together by a hidden cap, a quarter of a level-45 body. The key stars now give 15 raw points in all (Giant's
  Heart 4, Cavalier 3, the other four 2) and the small stars 8% (one per cent a star). `hp` and `hpPct` end at those
  sums (15 and 8%), the +75 budget over both is gone, and a card prints what applies. The whole tree is a tenth of a
  level-45 body at most, and a walk to the Warrior's Health wheel a few per cent.
- **Renown health: dropped.** Renown gave 3 health a level (147 at Renown 50) on top of the floor and the tree. It still
  gives 2 magicka a level.

Survival, the harness's `skyHealth` layer on the maxed character (`+ceiling,+skyHealth`; Renown 50 and a full tree at
every level, so low levels show the raw points at their largest). ARENA2 attributes, DFU's own foe row. Survival is
the time the foe takes to kill the character, ours over DFU's. Before -> after:

| Survival | L1 | L10 | L20 | L30 | L45 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warrior | 6.98 -> 1.52 | 1.93 -> 0.92 | 2.96 -> 1.91 | 2.13 -> 1.62 | 1.47 -> 1.24 |
| Thief | 10.19 -> 2.00 | 4.69 -> 1.64 | 3.66 -> 1.83 | 3.45 -> 2.22 | 2.51 -> 1.95 |
| Mage | 10.43 -> 1.98 | 5.72 -> 1.78 | 3.98 -> 1.78 | 3.59 -> 2.15 | 2.16 -> 1.61 |
| Spellsword | 8.05 -> 1.63 | 3.70 -> 1.49 | 3.85 -> 2.18 | 3.33 -> 2.26 | 2.32 -> 1.85 |
| Archer | 8.01 -> 1.62 | 3.81 -> 1.53 | 3.75 -> 2.03 | 3.19 -> 2.17 | 2.53 -> 2.03 |

| Body (health) | L1 | L10 | L20 | L30 | L45 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warrior | 261 -> 57 | 373 -> 178 | 517 -> 333 | 710 -> 542 | 943 -> 793 |
| Thief | 255 -> 50 | 309 -> 108 | 388 -> 194 | 516 -> 332 | 739 -> 573 |
| Mage | 253 -> 48 | 293 -> 91 | 357 -> 160 | 470 -> 282 | 671 -> 499 |
| Spellsword | 257 -> 52 | 333 -> 134 | 437 -> 247 | 561 -> 381 | 807 -> 646 |
| Archer | 257 -> 52 | 333 -> 134 | 418 -> 226 | 561 -> 381 | 807 -> 646 |

At level 45 the changes take 150 to 172 points (16% to 26%) off the body of a maxed character. A character with no Renown
and no tree is unchanged. The raw points weigh most at level 1, where a full tree is 15 on a body of 40, and that tree is
out of reach before the Renown that buys its stars.

## The finished budget (B5)

The owner's target (decision 41): a maxed character about x1.6 a DFU one in melee and about x1.75 for the casters,
typical gear
at or under x1.5. Loot (B4) could not take the maxed builds lower, because typical gear sat under its target. So B5 took
the
rest from the other sources, each rescaled at its records. A card, a sheet and a tooltip print what applies. The net is
the tops
summed, so it is met only by a kit with every registry at its top, and it cuts nothing a card prints.

| Source | Blow, at its best (was -> now) | Where |
| --- | --- | --- |
| Weapon skill past 100 (Master Skills to 200) | +21 -> +7 (0.2% -> 0.07% a point; gear 5 -> 1) | `spellPower.js`, `weaponMastery.js` |
| Sigil (Legendary) | +4 -> +3 (bands 1 / 1-2 / 2-3) | `sigil.js` |
| Sets, best two of four | +20 -> +6 (percents x0.3, to the half) | `sigilSets.js` |
| Loot powers, best kit | +23 -> +8.5 (Silent Death 9 -> 2.5, Sweet Mother's Kiss 5 -> 1.5, First Blood 6 -> 1.5) | `lootRarity.js`, `gilded.js` |
| Firmament, damage stars | +50 -> +6 (stars x0.2; blow cap 5, total 6) | `firmamentTree.js`, `firmamentLaw.js` |
| Paths (martial) | +6 -> +4 | `martialPaths.js` |
| **Net** | **+75.4 -> +34.5** | `powerCeiling.js` |

Guards (share off a hurt, at their best): loot 12.4 -> 4.4, sets 10 -> 3, Firmament 15 -> 3, martial and arcane paths 4
-> 2. The
net keeps 86.35% (was 74.1%). Spell potency: the loot's cap 9 -> 4 (worn potency 6 -> 3), the Firmament's spell stars
x0.2 (cap 6).
Techniques keep their own setting and aim at +5 to +10 (B1). The swing is not a lever: heft is already at the 15% bound
(`swinglaw.test.js`), so it stays. Technique and swing numbers are unchanged. A Firmament damage star is at least half a
per
cent. The Firmament's Health is in the health section above.

Character power (ARENA2 attributes, DFU's own foe row), before -> after. Typical gear (default run, B4 numbers before):

| Typical | L1 | L10 | L20 | L30 | L45 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warrior | 0.85 -> 0.85 | 0.66 -> 0.66 | 0.92 -> 0.92 | 0.94 -> 0.94 | 1.32 -> 1.29 |
| Thief | 1.14 -> 1.14 | 0.94 -> 0.94 | 1.03 -> 1.03 | 1.11 -> 1.11 | 1.28 -> 1.25 |
| Mage | 0.90 -> 0.90 | 0.89 -> 0.89 | 0.93 -> 0.93 | 1.17 -> 1.17 | 1.49 -> 1.46 |
| Spellsword | 0.91 -> 0.91 | 0.84 -> 0.84 | 1.03 -> 1.03 | 1.20 -> 1.20 | 1.48 -> 1.44 |
| Archer | 0.99 -> 0.99 | 0.94 -> 0.94 | 1.08 -> 1.08 | 1.17 -> 1.17 | 1.31 -> 1.27 |

Maxed (`+ceiling,+skyHealth`: every source at its top and the online health at its most), before -> after:

| Maxed | L1 | L10 | L20 | L30 | L45 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warrior | 1.55 -> 1.25 | 1.10 -> 0.89 | 1.50 -> 1.21 | 1.51 -> 1.22 | 2.04 -> 1.65 |
| Thief | 2.03 -> 1.66 | 1.57 -> 1.26 | 1.69 -> 1.36 | 1.78 -> 1.45 | 2.05 -> 1.62 |
| Mage | 1.52 -> 1.29 | 1.36 -> 1.17 | 1.31 -> 1.18 | 1.57 -> 1.43 | 2.00 -> 1.77 |
| Spellsword | 1.68 -> 1.35 | 1.38 -> 1.13 | 1.59 -> 1.33 | 1.68 -> 1.49 | 2.00 -> 1.75 |
| Archer | 1.83 -> 1.48 | 1.57 -> 1.27 | 1.77 -> 1.43 | 1.90 -> 1.54 | 2.02 -> 1.63 |

The casters stay higher than the melee builds because they sit at x1.54 to x1.57 with no stacking source at all: the
level-45
spell magnitude, Master school potency and the health floor are not stacking sources. `MAXED_POWER_MOST` in
`test/tooling/playerPowerBudget.test.js` is 1.77 / 1.82 / 1.85 / 1.84 / 1.84 (warrior, archer, spellsword, mage, thief;
no
ARENA2, with the online health), down from B4's 2.08 / 2.13 / 2.0 / 1.96 / 2.2.

## Not modelled

The `power` layer gives a caster no spell line (potency, cast speed): a mage's gear line is a damage line on a staff it
rarely swings. Martial and arcane paths, sets, champions, boss traits, the Enhanced AI (tokens, flanking; F1 removed its
damage multipliers, so a foe's blow is the formulas' roll in the room as here), shields and
the block roll, backstab, saving throws and elemental tolerance, class foes, Enemy Expansion tables, spell
effects other than damage, fatigue, and healing. A value from the harness is a comparison of rule sets on these
builds, not a prediction of play.
The audit's theoretical x119.95 blow stack is a cap; the `power` layer measures the gear a level typically wears.

## The foe-side budget (B2)

B2 tamed the foes to match the tamed player. The foe layers are `stats` and `hero`:

- `stats`: the 29 classic monsters that Enemy Expansion and MUDEX rewrite stand at the numbers in
  `src/systems/enemyExpansion/classic-stat-pass.ts`, each field within 30% of DFU's row. The test for that file holds
  the bound.
- `hero`: a plain foe is DFU's row up to level 30. From level 31 to 45 its blows grow 3.6% a level and its health 1.8%
  (about 1.7 and 1.3 at level 45, 1.5 in fight power). A promoted foe, an ally and a tuned stage take none.
- Elites (x2 health, x1.3 damage) and champions (x1.4, x1.15) stand at 1% and 2% of eligible foes. Neither takes
  another foe layer.

Place threat, the Master Skills veteran layer and its climb layer, and the Renown threat no longer exist.
Fight power is the same measure as character power with this game's foe; a foe on target keeps the ratio of fight
power to character power between 0.7 and 1.35 at every level, and near 1 at level 45.
