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
| `pcaao` | Physical Combat And Armor Overhaul (`installPcaao`). |
| `stats` | The classic monster rows under Enemy Expansion and MUDEX, with the stat pass, read when the foe is built. |
| `master` | Master Skills: mastered skills climb to 200 and read up to 140. |
| `online` | Online-only rules: the level law, the weapon skill's blow and pace past 100, school potency and spell cost past 100. |
| `onlineHealth` | The online health floor (`evenHpFloor`). |
| `hero` | Hero's threat: plain foes grow with player level past 30 (`heroThreat`). |
| `power` | Loot-ladder gear: a damage line on the weapon, an armour line on each piece, at the tier the level wears. |
| `techniques` | The best weapon technique the gear tier can roll. |
| `swing` | The port's own swing and cast speed curve. |
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
- the net (`BLOW_MOST`, +75.4%, and `GUARD_LEAST`, 74%) sits above a normal kit and below the tops summed;
- a skill past 100 pays 0.2% a point, gear on a weapon skill 0.1% a point up to 5%, and a mastered skill reads at most 110
  to hit and to crit (`AIM_PAST_MAX`);
- a technique aims +5 to +10 and tops at x1.95 of a blow. The Firmament tree is left to B5.

`test/tooling/playerPowerBudget.test.js` holds the character-power bounds.

## Not modelled

The `power` layer gives a caster no spell line (potency, cast speed): a mage's gear line is a damage line on a staff it
rarely swings. Martial and arcane paths, sets, champions, boss traits, the Enhanced AI (tokens, slams), shields and
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
