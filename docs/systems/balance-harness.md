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

The harness reaches modules that import shader files, so set `NODE_OPTIONS` first
([getting-started.md](../getting-started.md#node-and-shader-files)).

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
| `--content` | Measures endgame content instead: foe tiers and the relay bosses at levels 30 and 45 (`content.mjs`, factors read through `tiers.mjs`). |

## The two rule sets

**DFU** (`dfu.mjs`) is a port of `FormulaHelper.cs` as expectations: hit chance, weapon damage, swing and bow timing,
a monster's three attacks with the Reflexes gate, and the monster attack timer. It does not call `src/combat`, because
the game's stock core still carries port-only seams. `test/tooling/balanceHarness.test.js` checks it against that core
on a classic fight (hit chance within 0.015, damage a swing within 0.25).

**Ours** (`ours.mjs`) runs seeded swings through the game's real `calculateAttackDamage` in both directions, with the
real foe builder, scaling seams, equip table and swing law. Each layer is a switch the game reads:

| Layer | What it switches |
| --- | --- |
| `pcaao` | Physical Combat And Armor Overhaul (`installPcaao`), tuned toward DFU. |
| `stats` | The classic monster rows under Enemy Expansion and MUDEX, with the stat pass, read when the foe is built. |
| `master` | Master Skills: mastered skills climb to 200 and read up to 140. |
| `online` | Online-only rules: the level law, the weapon skill's blow and pace past 100, school potency and spell cost past 100. |
| `onlineHealth` | The online health floor (`evenHpFloor`). |
| `skyHealth` | The online layer's other health at its most: the Firmament's at its channels' sums (`firmamentHealth`). It also reads Renown at 50 (`renownBonus`), which gives no health now (`hp: 0`). Off by default; the maxed character adds it (`+ceiling,+skyHealth`). |
| `hero` | Hero's threat: plain foes grow with player level past 30 (`heroThreat`). |
| `power` | Loot-ladder gear: a damage line on the weapon, an armour line on each piece, at the tier the level wears. |
| `techniques` | The best weapon technique the gear tier can roll. |
| `swing` | The swing law: DFU's Speed line with the weapon's heft and handling. |
| `ceiling` | The maxed character: the blow takes the rest of its room up to `BLOW_MOST`, the hurt and the spell likewise (off by default; add it with `--layers +ceiling,-hero,-stats`). |

The default set (`DEFAULT_LAYERS` in `ours.mjs`) is every layer but `ceiling` and `skyHealth`: the rules
online play turns on under the official profile, with a character of typical gear.

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
  foe at the elite tier (x2 health, x1.3 damage); boss is an elite in an Elite Dungeon (x7 and x2.6).
- Casters cast the Lightning spell (SPELLS.STD 31) while magicka lasts, then swing, over a 30-second horizon.

## How to read it

The report's target column (`targetRatio` in `report.mjs`) is 1.0 at level 1, rising in a straight line to decision
41's budget at level 45 (`TARGET_TOP_RATIO`): about 1.6x a DFU character for a melee or archer build, and about 1.75x
for a build that casts. Typical gear stays at or under 1.5x. Two numbers are compared with the target:

- **Character power**: the geometric mean of dps ratio and dies-s ratio when this game's character meets **DFU's own foe
  row** (the foe layers `stats` and `hero` are switched off for it). It isolates the character.
- **Fight power**: the same mean when the character meets this game's foe. A value under 1 means the foes are harder
  than DFU's by more than the character is stronger.

`Character / target` is how far each level is from the target: 1.00 is on target. A foe on target keeps fight power
over character power between 0.7 and 1.35 at every level, and near 1 at level 45.

## Not modelled

The `power` layer gives a caster no spell line (potency, cast speed): a mage's gear line is a damage line on a staff it
rarely swings. The harness also leaves out martial and arcane paths, sets, champions, boss traits, the Enhanced AI
(tokens, flanking), shields and the block roll, backstab, saving throws and elemental tolerance, class foes, Enemy
Expansion tables, spell effects other than damage, fatigue, healing, and a boss's armour and resistances. A value from
the harness compares two rule sets on these builds; it does not predict play.
