// AUDIT 24 (the seven-slice sweep), the SEAM GATE.
//
// The quest machine declares a `deps.world` contract and every action,
// resource and macro reaches the host through it with optional
// chaining - `world?.discoverLocation?.(...)`. That shape is the
// port's charter (a seam the host cannot honestly answer yet stays
// ABSENT and the law idles) and it is also a trapdoor: a seam nobody
// mounts is a ported law that evaporates silently, and nothing fails.
//
// It had happened four times over. The corpus's 193 `reveal` lines
// discovered nothing and filed no note; %oth had no TEXT.RSC to read;
// every Person whose faction race does not map fell to -1 instead of
// the region's race. All four seams were declared in Q3, wired to
// nothing, and green.
//
// So this gate reads the source both ways: every `world.x` the quest
// system calls must be MOUNTED on the host's questWorld, or named in
// PENDING below with the reason it cannot be answered yet. A new seam
// is a one-line decision either way - it cannot be forgotten.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT (at the merge of main into TESA): the world host read whole - questWorld is scenes/questWorld.js's

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Seams the machine declares that the HOST cannot answer yet, each
 *  with the slice that owns it. Removing a row means mounting it. */
const PENDING = new Map([
  // B1 (AUDIT 25 blocker 1) MOUNTED the foe spawn trio -
  // createFoeGameObjects, tryPlaceFoe, raiseOnEncounterEvent - after
  // the placement law sat fully ported in sceneMount.js with no
  // caller. A ported function with no caller is a comment.
  // B3 (blocker 3) MOUNTED the respawn trio - respawnPlayerAtSite,
  // isRespawning, setPlayerScenePosition (BT1 retired the Building
  // flag: DFU's TeleportPc has no building arm - insideDungeon is
  // hardcoded true for every place).
  // M-X: the macro table's talk/news and interior reads - the
  // handlers answer the charter's null through optional reads until
  // the talk-news arc (the TalkManager getters, the lord names) and
  // the interior host (the building name, the tavern pick) mount them.
  // TN1 (2026-08-28) MOUNTED the seven talk-news getters - the four
  // npcData faction names (TK-iv computed them; MacroHelper.cs:965-995
  // reads them), GetFactionName's HolyOrder deity arm,
  // GetLordNameForFaction and GetOldLeaderFateString. Removing a row
  // means mounting it, and it did.
  // IH1 (2026-08-28) MOUNTED %cbd (the interior building's name
  // regenerated through the ONE name bag) and %nt (the directory's
  // tavern pick).
  // QG1 MOUNTED getClassicSpellEffects (spellRecordOfIndex, the G4
  // registry) and spellHasMatchForClassicEffect (byte-folded classic
  // pairs) - removing a row means mounting it, and it did.
  ['readiedSpell', 'RETIRED by AUDIT 24 - the latch is the action\'s now; the name survives only in a comment'],
  // IH1 MOUNTED isHouseOwned (banking's own law over the current
  // region) and buildingNameOpts (townTalk's one name bag).
  // AUDIT 39 (#23) MOUNTED THE SIX ROWS THAT STOOD HERE -
  // currentRegionCourt, currentRegionFaction, currentRegionPeople,
  // currentRegionVampireClan, playerVampireClan and
  // playerVampireClanName. Removing a row means mounting it, and it
  // did: every producer was already in world.js (talk.js's People and
  // Courts getters, findFactions over the Province record for the
  // region faction and its `vam` clan, the curse entry for the PC's).
  // Unmounted, every quest Person declared `factiontype People/
  // Courts/Province/Vampire_Clan` - and the Resident1-4 career
  // default - resolved -1 into _setupFactionTypeNPC's ZERO_FACTION
  // arm, and %vam printed C#'s error literal at an actual vampire.
  // AUDIT 26 (F092) MOUNTED buildingCompassDirection, the third seam
  // the wave-26 alias hole hid. The excuse that stood here - "no
  // automap layout to transform the player into" - measured the wrong
  // thing: DFU's map transform is a translate+scale of the location's
  // own plane, so only the PAIR has to share a frame, and the building
  // directory and the player already share the location frame that
  // GetAnswerWhereIs' compass has used since T3c. Unmounted, every
  // directional answer expanded %di to '...never mind...'.
  //
  // ROAD-E E7 (2026-09-02) completed MacroHelper's table to all 217
  // rows, and fourteen of the new rows read seams THIS host does not
  // mount. Two groups, each with a real reason:
  //
  // 1. the TALK GLOBALS. MacroHelper's %key/%loc/%fcn/%hnr/%1com are
  //    static handlers reaching `GameManager.Instance.TalkManager`
  //    (MacroHelper.cs:1059-1100, :890-893, :957-960). The port's
  //    TalkManager is the ANSWER PIPELINE, and talkMacros.js's
  //    talkMacroHooks derives all nine seams off it for the duration
  //    of one expansion - ONE home for the derivation. Mounting them
  //    on questWorld as well would give a QUEST message the same
  //    reach C# has (the singleton is reachable from any MCP) at the
  //    cost of a second copy of the derivation; no corpus quest
  //    message carries these symbols, so the port stays
  //    coverage-ordered and they answer [nullMCP] outside talk.
  ['talkKeySubjectType', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['talkKeySubject', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['talkWorkString', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['talkCurrentQuestionListItem', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['talkMarkLocationOnMap', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['markKeySubjectLocationOnMap', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['talkLocationOfRegionalBuilding', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['talkHonoric', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  ['talkPCGreetingOrFollowUpText', 'the answer pipeline is the port\'s TalkManager - talkMacros.talkMacroHooks derives it per expansion'],
  // 2. the COURT four (%cri/%pen/%gtp/%dip) and %map. MacroHelper
  //    reads DaggerfallUI.Instance.DfCourtWindow and
  //    PlayerGPS.LocationRevealedByMapItem; the port's court record
  //    already expands through arrestFlow's VALUE MAP (which resolves
  //    before the ladder is ever reached, and whose bodies are
  //    court.js's CRIME_NAMES and penaltyText), and no live map-item
  //    reveal is held anywhere for %map to read. Both answer
  //    [nullMCP] until a host mounts them - a table row for a window
  //    that is not open.
  ['courtCrimeName', 'the court record expands through arrestFlow\'s value map; the table row waits on a live court seam'],
  ['courtPenaltyText', 'the court record expands through arrestFlow\'s value map; the table row waits on a live court seam'],
  ['courtFine', 'the court record expands through arrestFlow\'s value map; the table row waits on a live court seam'],
  ['courtDaysInPrison', 'the court record expands through arrestFlow\'s value map; the table row waits on a live court seam'],
]);

/** Bridge-ctx seams the HOST cannot answer yet. Same rule as PENDING
 *  above: removing a row means mounting it. */
const CTX_PENDING = new Map([
  // endVampirism/endLycanthropy left this list at V2d: the world host
  // mounts both onto the real cures (cureVampirism/cureLycanthropy).
  // FE1 MOUNTED addFace/dropFace - the HUD escorting faces panel
  // (ui/hud/hudEscortFaces.js) - and the new onQuestEnded sweep beside
  // them.
  ['onQuestStarted', "an OPTIONAL host listener - the bridge already fans RaiseOnQuestStartedEvent to the QuestListsManager's one-time recording itself"],
  // QL12: the questlines' two seams, both OPTIONAL BY DESIGN (questBridge.js QUEST_CTX_OPTIONAL_BY_DESIGN)
  ['onQuestlineOffer', 'an OPTIONAL host listener - the runner starts a line\'s step itself; a host may hear it'],
  ['questlineService', 'the bridge builds its own (scenes/quest/questlineHost.js questlineService - the account claim online, none offline); a test hands one in'],
]);

/** Every `world.<name>` the quest system reaches for.
 *
 *  AUDIT 24 (wave 26): THE ALIAS HOLE. This scanned for the literal
 *  `world.` / `world?.` and nothing else, so a module that binds the
 *  seam to a local first -
 *
 *      const w = hooks?.world;
 *      return w?.findFactionByTypeAndRegion?.(7, w.currentRegionIndex?.());
 *
 *  - was invisible to the gate ENTIRELY. questMacros.js is written
 *  that way throughout, and it hid three unmounted seams behind the
 *  alias: locationCompassDirection, buildingCompassDirection and
 *  findFactionByTypeAndRegion. That is the fifth, sixth and seventh
 *  instance of the exact failure this gate's own header says had
 *  "happened four times over", sitting in the one module the gate
 *  could not see.
 *
 *  So the scan resolves aliases: any `const <id> = <...>world<...>`
 *  binding in a file makes `<id>.x` count as `world.x` in that file. */
function calledSeams() {
  const dir = 'src/systems/quest';
  const names = new Set();
  for (const f of readdirSync(join(ROOT, dir))) {
    if (!f.endsWith('.js')) continue;
    const src = read(join(dir, f));
    for (const m of src.matchAll(/\bworld\??\.(\w+)/g)) if (m[1] !== 'js') names.add(m[1]);   // TIDY2: `scenes/world.js` in a comment is no seam
    // Locals bound to the world seam ITSELF - `const w = hooks?.world;`
    // and `const w = world();`, the two shapes questMacros.js uses.
    // The initialiser must END at `world` (or `world()`): a local bound
    // to something world RETURNS - `const loc = world?.currentLocation?.()`
    // - is a location, not the seam, and counting its properties would
    // report `building` and `dungeon` as missing seams. The first draft
    // of this scan did exactly that.
    const aliases = new Set(
      [...src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*?)\s*;/g)]
        .filter(([, , init]) => /^[\w$]*(\??\.[\w$]+)*\??\.?world(\?\.)?(\(\))?$/.test(init))
        .map((m) => m[1])
        .filter((a) => a !== 'world'),
    );
    for (const a of aliases) {
      for (const m of src.matchAll(new RegExp(`\\b${a}\\??\\.(\\w+)`, 'g'))) names.add(m[1]);
    }
  }
  return names;
}

// ---- the questorData STRUCT ----

test('audit24: `add X as questor` leaves the ZERO struct, and the three unguarded reads survive it', async () => {
  // StaticNPC.NPCData is a C# STRUCT (StaticNPC.cs:88-107): there is no
  // null for it, and an un-setup questor holds all zeros. The port used
  // null, and three reads dereference it WITHOUT a guard - topicTree's
  // GetPersonBuildingKey (:350) and its quest-topic rebuild (:773), and
  // sceneMount's questor billboard pick (:63). Every one is reachable:
  // the OTHER route to isQuestor is `add <sym> as questor`
  // (Quest.addQuestor), which sets the flag and never calls
  // SetupQuestorNPC - exactly as C#'s Quest.cs:472 does, because there
  // the struct is already sitting in the field.
  const { ZERO_NPC_DATA } = await import('../../../src/characters/staticNpc.js');
  const { Person } = await import('../../../src/systems/quest/person.js');
  const { questNpcFlatData } = await import('../../../src/systems/quest/sceneMount.js');
  const { TopicTree } = await import('../../../src/systems/topicTree.js');

  // a Person straight out of the CONSTRUCTOR - nothing has set up a
  // questor NPC, which is precisely the `add X as questor` state
  const p = new Person(null);
  p.isQuestor = true;
  assert.deepEqual(p.questorData, ZERO_NPC_DATA, 'the ctor holds the struct, not null');
  for (const [k, v] of Object.entries(ZERO_NPC_DATA)) assert.equal(v, 0, `${k} is its zero`);

  // sceneMount's billboard pick - an unguarded .billboardArchiveIndex
  assert.deepEqual(questNpcFlatData(p), { archive: 0, record: 0 },
    'the zero struct answers zeros, where null threw');

  // topicTree's building key - an unguarded .buildingKey. The zero key
  // falls through to the home-building name lookup, which is the whole
  // point of C#'s `!== 0`.
  const tree = Object.create(TopicTree.prototype);
  tree.deps = {};
  tree.listBuildings = [{ name: 'BLANK', buildingKey: 4242 }];   // a home-less Person's name
  assert.equal(tree.getPersonBuildingKey(p), 4242, 'buildingKey 0 means "look me up by name"');
  tree.listBuildings = [];
  assert.equal(tree.getPersonBuildingKey(p), 0, 'and a miss reads the struct default, 0');

  // and the quest-topic rebuild's unguarded .mapID
  assert.equal(p.questorData.mapID, 0, 'the third read');

  // the save envelope carries the struct, and a pre-AUDIT-24 save whose
  // questorData is null restores to the struct rather than to null
  const restored = new Person({ hooks: {} });
  restored.restoreSaveData({ ...restored.getSaveData(), questorData: null });
  assert.deepEqual(restored.questorData, ZERO_NPC_DATA, 'an old null envelope restores to zeros');
});

// ---- wave 10: the parity sweep's tail ----

test('audit24: ParseQuest swallows every exception and answers null', async () => {
  // QuestMachine.ParseQuest wraps the whole parse in
  // `try { ... } catch (Exception ex) { LogFormat("Parsing quest {0}
  // FAILED!..."); return null; }` (:670-687). The port had no catch,
  // so a quest whose QBN the parser chokes on threw out of the guild
  // picker instead of answering null - and questLists.loadQuest already
  // carried the `if (!quest) return null;` arm C# feeds it, sitting
  // unreachable. One broken row took the whole list with it.
  const { QuestMachine } = await import('../../../src/systems/quest/machine.js');
  const { loadQuestTables } = await import('../../../src/systems/quest/tables.js');
  const { readFileSync, readdirSync } = await import('node:fs');
  const sources = {};
  for (const f of readdirSync(join(ROOT, 'vendor/dfu-quests/Tables'))) {
    if (f.endsWith('.txt')) {
      sources[f.replace('.txt', '')] = readFileSync(join(ROOT, 'vendor/dfu-quests/Tables', f), 'utf8').replace(/^﻿/, '');
    }
  }
  loadQuestTables(sources);
  const m = new QuestMachine({ nowSeconds: () => 0 });
  const good = m.parseQuestForLists(['Quest: __OK', 'QRC:', 'Message:  1011', ' x', '', 'QBN:', 'variable _pad_'], 0, { rolls: () => 0 });
  assert.ok(good, 'a good source parses');
  const bad = m.parseQuestForLists(['Quest: __BAD', 'QRC:', 'QBN:', 'this is not a line signature at all'], 0, { rolls: () => 0 });
  assert.equal(bad, null, 'and a broken one answers NULL rather than throwing');
});

test('audit24: a NEW CHARACTER starts the two hard-coded quests, main quest included', async () => {
  // StartGameBehaviour.cs:444-456 starts THREE things on a new
  // character: "_TUTOR__", "_BRISIEN", and then the InitAtGameStart
  // list. The port called only the third - and with vanilla tables
  // that list is EMPTY, so a new character started no quests at all
  // and the MAIN QUEST never began. Both files are vendored; neither
  // had ever been parsed.
  const { GAME_START_QUESTS, createQuestBridge } = await import('../../../src/scenes/quest/questBridge.js');
  const { loadQuestTables } = await import('../../../src/systems/quest/tables.js');
  const { readFileSync, readdirSync, existsSync } = await import('node:fs');

  // TUT1 (2026-10-11): DFO's own tutorial replaced _TUTOR__; the curse its close started (`start quest 977 977`)
  // stands in its place. START1 (2026-10-24): the Bay's start quest stands in _BRISIEN's - its commission, opened,
  // starts the main quest in the city of Daggerfall (test/systems/starts/start1_bay.test.js)
  assert.deepEqual([...GAME_START_QUESTS], ['S0000977', '_STARTIB'],
    'the tutorial\'s curse in its place, and the Bay\'s start in the main quest\'s');

  const QUESTS = join(ROOT, 'vendor/dfu-quests/Quests');
  const TABLES = join(ROOT, 'vendor/dfu-quests/Tables');
  if (!existsSync(QUESTS)) return;   // the vendored pack is the gate's data
  const sources = {};
  for (const f of readdirSync(TABLES)) {
    if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = readFileSync(join(TABLES, f), 'utf8').replace(/^﻿/, '');
  }
  loadQuestTables(sources);

  // START1: the start's quest is the port's own script, beside DFU's pack (scenes/quest/questData.js reads both)
  const STARTS = join(ROOT, 'src/systems/starts/quests');
  const sourceOf = (n) => [join(QUESTS, `${n}.txt`), join(STARTS, `${n}.txt`)].find((f) => existsSync(f)) ?? null;
  for (const name of GAME_START_QUESTS) {
    assert.ok(sourceOf(name), `${name}.txt is in the pack`);
  }

  const started = [];
  const bridge = createQuestBridge({
    data: {
      readListTable: (n) => (existsSync(join(TABLES, `${n}.txt`)) ? readFileSync(join(TABLES, `${n}.txt`), 'utf8') : ''),
      getQuestSourceLines: (n) => {
        const f = sourceOf(n);
        return f ? readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/) : null;
      },
    },
    world: null,
    classicSeconds: () => 0,
    playerEntity: { level: 1, name: 'Tester' },
    onQuestStarted: (q) => started.push(q.questName),
  });
  bridge.initAtGameStart();
  assert.deepEqual(started.slice(0, 2), ['S0000977', '_STARTIB'],
    'both hard-coded quests really start, in order');
  assert.equal(bridge.machine.quests.size >= 2, true, 'and they are LIVE in the machine');
});
