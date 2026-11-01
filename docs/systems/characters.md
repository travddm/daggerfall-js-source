# Characters and stats

This page covers the player character: races, classes, attributes and skills, character creation, skill advancement
and levelling, the player entity, and the bodies that draw characters, NPCs and foes. Physical combat is on
[combat.md](combat.md); spells and the arcane paths are on [magic.md](magic.md).

The rules are Daggerfall Unity's (DFU, MIT, Daggerfall Workshop), ported from `PlayerEntity`, `FormulaHelper`,
`DaggerfallSkills`, `RaceTemplate` and the chargen windows. Each departure is named below.

## Where it lives

| Concern | Files |
| --- | --- |
| The player entity (shared singleton) | `src/characters/playerEntity.js` |
| Races | `src/systems/races.js`, `src/systems/racialLive.js` |
| Skills model | `src/systems/skills.js`, `src/systems/skillSoftcap.js`, `src/systems/masterSkills.js` |
| Attribute modifiers (fortify, drain) | `src/systems/statMods.js` (`liveStat`) |
| Class files | `src/formats/classFile.js` (CLASSnn.CFG reader), `src/systems/stockClasses.js` |
| Custom class builder | `src/systems/customClass.js` (laws), `src/ui/chargenArt.js` (window) |
| Class questionnaire | `src/systems/classQuestions.js` |
| Creation | `src/systems/chargen.js`, `src/systems/chargenSession.js`, `src/ui/chargen.js`, `src/systems/startingGear.js` |
| Biography | `src/formats/biogFile.js`, `src/systems/biography.js` |
| Advancement and levelling | `src/systems/advancement.js`, `levelCap.js`, `levelClimb.js`, `levelEven.js`, `skillSwap.js` (all in `src/systems/`) |
| Equip slots and paperdoll | `src/characters/paperdoll/`, `src/characters/equipRules.js`, `src/characters/equipTable.js`, `src/systems/equip.js` |
| Enemy entities | `src/characters/enemy/enemyEntity.js`, `src/characters/enemy/enemyBasics.js` |

## Races

`races.js` holds `RACES`, DFU's `EntityEnums.Races` for the eight playable races (Breton 1 to Argonian 8).
Vampire, werewolf and wereboar are transformed pseudo-races and are not selectable. `RACE_TEMPLATES` builds the
eight templates from one art scheme. `raceArt` resolves paperdoll art. Each race has 10 faces (`FACES_PER_RACE`, the
records in each FACE*.CIF).

Body morphology is a separate axis that armour art keys on: Argonian, Elf (three elves), Human (three humans),
Khajiit. `races.js` names it from `BODY_MORPHOLOGY` in `src/systems/armorMaterials.js`, so the two tables cannot drift.

The entity carries both `race` (a key such as `'Breton'`) and `raceId` (the 1-based enum). Readers use either; write
both. `racialLive.js` holds `liveVampirism`, a leaf so that `src/combat/formulas.js` can ask whether a player target
is undead without an import cycle.

## Attributes and skills

- Eight attributes, in `DFCareer.Stats` order: Strength, Intelligence, Willpower, Agility, Endurance, Personality,
  Speed, Luck (`STAT_KEYS_ORDER` in `statMods.js`). Read a live value with `liveStat(entity, key)`: it adds fortify and
  drain effects. Never read `entity.stats` directly in a formula.
- 35 skills (`SKILLS`, `SKILL_NAMES`, `SKILL_COUNT` in `skills.js`). `tallySkill` counts a use into
  `entity.skillUses`.
- Values above 100 exist only with Master Skills (below). Formulas read `skillValue`, which applies `effectiveSkill` (`skillSoftcap.js`), not
  the raw value: past 100 a point is worth a quarter (`OVERCAP_POINT_WEIGHT`), plus milestone bonuses at 125, 150,
  175 and 200 (`SKILL_MILESTONES`). A raw 200 reads as 140. Screens print the raw value (`displaySkillValue`).

## Classes

A career is DFU's `DFCareer` shape: `primarySkills` (3), `majorSkills` (3), `minorSkills` (6), `hitPointsPerLevel`,
`advancementMultiplier`, the special-ability bitfield (spell points, regeneration, sun damage and the rest), and the
armour, shield and weapon proficiency flags.

### Stock classes

`chargenSession.js` `loadCareers` reads the 18 CLASS00..17.CFG files through `src/formats/classFile.js` (exact reader)
and passes each career through `reviseStockCareer` (`stockClasses.js`). The revision is a deliberate departure from
DFU: it re-chooses only the primary, major and minor skill lists, by four rules.

1. A class can fight from level 1: a primary or major in a weapon it may use, or in Destruction.
2. A movement skill (Jumping, Running, Swimming, Climbing) is a primary or major only where it defines the class.
3. No language takes a group slot.
4. A pure fighter's primaries are two weapons and Critical Strike.

It also corrects the Burglar's armour bits (forbidden chain and plate, not leather and chain). Attributes, hit points,
the advancement multiplier and every advantage stay as the file has them. The questionnaire, the headless
`?class=N` character and legacy births all read the revised list. Class enemies read their own CFG unrevised.

### Custom classes

`customClass.js` ports `CreateCharCustomClass` and `CreateCharReputationWindow`. Key laws:

- `difficultyPoints(hp, adv, disadv)`: hit points above the default add points, below it subtract twice as many.
- `advancementMultiplier(points) = 0.3 + 2.7 * (points + 12) / 52`.
- `buildCustomCareer` returns the career object; `classAffinityIndex` picks the stock class whose skills overlap most,
  which chooses the biography quiz. It scores against the revised stock lists (a departure from DFU, which scores
  against the files).
- A custom class can be saved and loaded as JSON: `customClassDoc` and `parseCustomClassDoc`, with
  `format: 'daggerfall-enhanced/custom-class'` and `version: 1` (`CLASS_FILE_FORMAT`, `CLASS_FILE_VERSION`). The
  parser refuses other formats and newer versions and strips control and format characters from the name.

The class questionnaire (`classQuestions.js`, DFU's `CreateCharClassQuestions`) picks ten questions from TEXT.RSC
record 9000 and walks CLASSES.DAT to a class index (`resolveClassIndex`); `NO_CLASS_INDEX` returns to the list.

## Character creation

`chargenSession.js` is the one door every host uses: the dungeon, both exterior hosts and the test room. Do not copy
load or apply code into a host.

- `createChargenFlow(fetchBytes)` loads careers, spells (`loadSpellIndex`), biographies and the questionnaire, and
  returns a `ChargenFlow` (`src/ui/chargen.js`). `createChargenWindow` wraps it for the overlay seam.
- `ChargenFlow` states, in order: `race`, `gender`, `classMethod`, `classQuestions`, `class`, `customClass`,
  `bioMethod`, `biography`, `name`, `face`, `stats`, `skills`, `reflexes`, `summary`, `done`. Two wizard skins exist
  (classic and enhanced, chosen by `isEnhanced` in `src/systems/uiSkin.js`).
- After the wizard: the levelling-system question (offline only), the Project Legacy model question when that mod is
  on, and the start-location choice (`src/systems/starts/starts.js`).
- `finishChargen` applies the result: `applyCharacter`, starting spells (`assignStartingSpells`), starting equipment
  (`startingGear.js`), biography effects, faction reputation and region data.
- `applyHeadlessChargen(entity, classIndex)` builds a character with no window (`?class=N`, tests).

### Rolls and the entity (`chargen.js`)

`rollStats` and `rollSkills` are DFU's `StatsRollout` and `SkillsRollout`; each skill group gets a bonus pool that
the player spends by hand (headless: `spendPoolLowest`). Level-1 health is `rollMaxHealthLevel1` (25 +
`hitPointsPerLevel`), magicka `spellPoints(intelligence, multiplier)`, fatigue `(strength + endurance) *
FATIGUE_MULTIPLIER`. `applyCharacter` assigns onto the shared `playerEntity` object (it does not make a new one):

| Field | Meaning |
| --- | --- |
| `name`, `gender`, `race`, `raceId`, `faceIndex` | identity, read by the paperdoll and race tables |
| `career`, `careerIndex` | the career object (saved whole) and its stock index |
| `level`, `stats`, `skills` | level 1, the eight attributes, the 35 skills |
| `maxHealth` / `rawMaxHealth`, `health` | `maxHealth` is a getter (see below) |
| `maxMagicka`, `magicka`, `fatigue` | derived pools |
| `skillUses`, `skillsRecentlyRaised`, `lastSkillCheckTime` | advancement counters |
| `startingLevelUpSkillSum`, `currentLevelUpSkillSum` | the level sums |
| `chargenDone`, `characterId` | creation complete; the save slot identity |

`defineLiveMaxHealth` makes `maxHealth` an accessor: the stored value, capped by `maxHealthLimiter` (lycanthropy),
plus online-only layers (Renown health and similar) that are never saved. Any path that builds an entity calls it and
`defineLiveMaxMagicka` (the save loader does).

## Advancement and levelling

### Skill advancement (`advancement.js`)

DFU's law, verbatim below 100:

```text
usesNeeded = floor(skillValue * skillMult * careerAdvMult * 1.04^level * 2/5) + 1
```

`SKILL_ADVANCEMENT_MULTIPLIER` holds the 35 per-skill multipliers; reflexes scale the counted uses. Every 360 classic
minutes (`SKILL_RAISE_CHECK_INTERVAL`) a skill with enough uses rises one point. Without Master Skills a skill stops at
100, and once a primary skill is mastered no other skill at 95 or more may rise.

### The level

- `levelUpSkillSum` = sum of primaries + sum of majors - lowest major + highest minor.
- Offline (DFU): `calculatePlayerLevel` = `floor((current - starting + 28) / 15)`. Online:
  `levelClimb.js` `onlineLevelFor` spreads the climb from the starting sum to `LEVEL_SUM_TOP` (800) over 45 levels,
  so every start reaches the cap on its last point. `onlineLevelConvert` re-reads a realm character's level at join.
- `checkForLevelUp` sets `readyToLevelUp`; the character sheet applies one level per visit. `applyLevelUp` adds
  `hitPointsPerLevelUp` and hands a bonus pool for attributes: 4 to 6 points offline, 5 online (`ONLINE_BONUS_POOL`).
- Online, `levelEven.js` `evenHpFloor` keeps maximum health at or above an average-roll floor for the class, level
  and current Endurance. It rides the online layer and is never saved.
- `LEVEL_CAP` is 45 online and offline (`levelCap.js`), a departure: DFU has no cap. `releaseCapLatch` clears a level-up
  latched in an old save at the cap.

### Master Skills and the soft cap

`masterSkills.js` lets skills pass 100 up to 200 (`SKILL_HARD_CAP`). Online it is always on; offline it is the
player's switch, asked once. Only mastered skills pass 100: 3 primary, 2 major, 1 minor (`MASTERY_SLOTS`), chosen as
each reaches 100 and permanent. Past 100 a point costs more uses (`SOFTCAP_TIERS`: x1.5, x2, x4), and combat uses
count only against foes tough enough for the skill (`overcapTallyWeight`). Mastered weapon skills open the martial
paths ([combat.md](combat.md)); spell schools open the arcane paths ([magic.md](magic.md)).

`skillSwap.js` lets a character pay gold to swap one unmastered class skill for a miscellaneous skill in the same
group. The career becomes the character's own copy.

## The firmament (online passive tree)

The firmament is a passive skill tree that applies online only. Offline the character is the save's, with no tree.

- The tree's nodes and links are in `src/net/firmament/firmamentTree.js`; its rules (purses, stat definitions, caps)
  are in `src/net/firmament/firmamentLaw.js`. Both are pure, so the account service and the client share them.
- The account service owns each character's tree (`server-account/src/firmament.js`): it validates and applies spends.
  The client keeps the last answer in `src/net/firmament/firmamentBook.js`.
- Points come from two purses: Stars from Renown (`starsFor`) and Craft points from profession ranks
  (`craftPointsFor`).
- `src/systems/firmamentLive.js` holds the tree in force and whether it applies; `src/systems/firmamentPowers.js`
  applies its combat channels. Mentor mode scales the combat stars. The window is `src/ui/firmamentWindow.js`.
- Tests: `test/net/firmament/`, `test/systems/firm1_powers.test.js`, `test/systems/firm_status.test.js`.

## Bodies, equipment and the paperdoll

- **Equip slots.** `src/characters/paperdoll/paperdoll.js` holds `EQUIP_SLOTS` (DFU's 27-slot table) and the 288 item templates
  (`src/characters/itemTemplates.json`, DFU's ItemTemplates.txt). `equipRules.js` is generated from DFU's
  `ItemEquipTable` (do not hand-edit); `equipTable.js` assigns slots. `src/systems/equip.js` is the runtime API.
- **Classic paperdoll.** `src/characters/paperdoll/paperdollArt.js` resolves worn-item art from ARENA2 TEXTURE archives, by race
  morphology, with dyes applied as palette band swaps (`src/characters/dyes.js`).
- **Morrowind bodies (enhanced skin).** The player, peers, NPCs and foes can stand in Morrowind NIF bodies read from
  the player's own Morrowind data (`src/formats/morrowind/`). `src/combat/fpArm.js` builds the rig;
  `src/net/peer/peerBodies.js` budgets and draws bodies. `npcBodies.js` is the NPC lane (a tier switch: Off, Near,
  All); `foeBodies.js`, `folkBodies.js`, `peopleBodies.js` and `creatureBodies.js` map foes, street walkers, standing
  people and creatures to a look. `wardrobe.js` dresses NPCs procedurally by role and tier. An actor with no body
  falls back to its classic billboard. `src/characters/ownModels/` holds armour, clothing and weapon models the game
  ships that Morrowind lacks; `src/systems/ownMwAssets.js` serves them.
- **Classic sprites.** Without a Morrowind body, foes and NPCs are DFU's billboards (`enemyBasics.js` textures,
  `src/characters/staticNpc.js`, `src/characters/mobile/`).
- The voxel neutral rig (`neutralBody.js`, `raceCharacter.js`, `clothing.js`, `armorSet.js`, `src/characters/pieces/`) is parked;
  it is reachable only behind `?voxelfolk` in `src/scenes/interiorContext.js` and the paperdoll tools.

## The player entity and the player folder

`playerEntity.js` exports the one `playerEntity` object. Before creation it holds DFU's placeholder (Breton, flat
skills, 50 health); never treat those values as real. Its damage door is `hurtPlayer` (see
[combat.md](combat.md)). It also exports registries other systems hook into: `registerPlayerDamageMod`,
`registerPlayerDeathSave`, `registerPlayerHurtListener`, `registerShieldSoakMod`, `setDeathPresenter`.

`src/player/` is movement and interaction, not stats: `motor.js` (DFU speeds, gravity, jump), `collider.js`,
`climbing.js` and `parkour.js`, `activate.js` and `interactionMode.js`, `cameraView.js` (the melee view gate),
`lockOn.js` (touch targeting), `mwView.js` (camera to Morrowind rig), `enterExit.js`.

## Enemy entities in brief

`enemyEntity.js` ports `SetEnemyCareer`. Monsters (mobile ids 0-42) take a fixed level and a health range from
`ENEMY_BASICS`, careers from ENEMYnnn.CFG in MONSTER.BSA, and armour values of `ArmorValue * 5`. Class enemies (ids
128+) take `CLASSnn.CFG` (index = id - 128), the player's level (city watch +3 to +6), and health of 10 plus one
`Range(1, hitPointsPerLevel + 1)` roll per level. Every enemy skill is `min(100, 5 * level + 30)` (`skillsLevel`).
`applyProgressionScaling` is the one writer of place and Master Skills scaling. `customEnemies.js` registers ids
beyond DFU's ranges for vendored enemy mods. Stats, elites and boss traits are on [combat.md](combat.md).

## Tests

- Creation: `test/systems/chargen.test.js`, `chargenseam.test.js`, `chargenui.test.js`, `customclass.test.js`,
  `stockclasses.test.js`, `races.test.js`.
- Advancement and levelling: `test/systems/advancement.test.js`, `level45_cap.test.js`,
  `fb1026d_masterthree.test.js`, `fb1019b_leveleven.test.js`, `fb1019b_skillswap.test.js`.
- Bodies: `test/characters/paperdoll.test.js`, `equip.test.js`, `mwnpc4_npclane.test.js`, `mwnpc17_wardrobe.test.js`,
  `humanclasses.test.js`, `enemies.test.js`.

Several class and race tests read real ARENA2 files: run `sh tools/fetch-data.sh` and set `ARENA2_PATH`.

## Traps

- **The save keeps the career whole.** A change to stock class lists or class files does not reach existing
  characters. Plan a migration if it must.
- **`maxHealth` is an accessor.** Write `rawMaxHealth` semantics through the setter; never replace the property with a
  plain value, or the limiter and online layers vanish.
- **Effective vs raw skill.** A formula that reads `skills[i]` directly over-counts skills past 100 and misses effect
  mods and mentor mode. Formulas read `skillValue`; screens read `displaySkillValue`.
- **Online and offline differ** in level formula, bonus pool, health floor and Master Skills. Test
  both lanes (`isOnlinePage` in `src/systems/online/onlineLane.js`).
- **Leaf modules.** `levelCap.js`, `masterSkills.js`, `skillSoftcap.js`, `statMods.js` and `racialLive.js` import
  little or nothing on purpose; adding an import there can close a cycle through `skills.js` or `formulas.js`.
