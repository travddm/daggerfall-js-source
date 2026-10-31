// AUDIT 26 (F019, with F190 its exact duplicate): THE STREET'S STATIC
// NPCs. collectExteriorNpcs was a faithful port of RMBLayout's
// non-zero-FactionID rule (RMBLayout.cs:366-378 / :442-454) with ZERO
// production callers - a ported function with no caller is a comment,
// so no exterior NPC was ever stood, and none could be activated or
// talked to above ground.
//
// These pins are the law and the wiring: the exterior overload of
// StaticNPC.SetLayoutData (StaticNPC.cs:180-207), the record the hosts
// stand, and the fact that the two hosts owning RMB blocks collect
// them and the mode machine's exterior ray clicks them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectBlockFlats } from '../../../src/world/rmbFlats.js';
import { collectExteriorNpcs, exteriorNpcRecord, setupExteriorQuestStaticNpcs } from '../../../src/characters/exteriorNpcs.js';
import { makeInteriorPersonHost } from '../../../src/scenes/interiorContext.js';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { QuestResourceBehaviour } from '../../../src/systems/quest/resourceBehaviour.js';
import { FACTION_TYPES } from '../../../src/formats/factionFile.js';
import {
  exteriorNpcFlags, staticNpcData, NPC_CONTEXT, ZERO_NPC_DATA,
} from '../../../src/characters/staticNpc.js';
import { staticNpcRoute } from '../../../src/systems/guild/guildServiceFlow.js';
import { npcServiceKind } from '../../../src/systems/guild/guildServices.js';
import { GUILD_GROUPS } from '../../../src/formats/factionFile.js';
import { GENDERS } from '../../../src/characters/nameHelper.js';
import { RACES } from '../../../src/systems/races.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const src = (f) => hostText(f);   // HOST-SPLIT 2: a host whole

/** A one-block RMB with an NPC flat in EACH of RMBLayout's two flat
 *  sites, plus one unfactioned flat that must not be collected. */
function block() {
  const scenery = Array.from({ length: 16 }, () =>
    Array.from({ length: 16 }, () => ({ textureRecord: -1 })));
  return {
    rmbBlock: {
      fldHeader: { groundData: { groundScenery: scenery } },
      miscFlatObjectRecords: [
        // the misc-site NPC (AddMiscBlockFlats :366-378)
        { textureArchive: 179, textureRecord: 5, xPos: 100, yPos: -4, zPos: 200, factionID: 42, flags: 32, position: 12345 },
        // scenery: faction 0, never an NPC
        { textureArchive: 212, textureRecord: 1, xPos: 0, yPos: 0, zPos: 0, factionID: 0, flags: 0, position: 7 },
      ],
      subRecords: [{
        xPos: 0, zPos: 0,
        exterior: {
          blockFlatObjectRecords: [
            // the subrecord-site NPC (AddExteriorBlockFlats :442-454)
            { textureArchive: 181, textureRecord: 2, xPos: 8, yPos: 0, zPos: 8, factionID: 510, flags: 0, position: 99 },
            // an EDITOR flat is skipped before the faction check
            { textureArchive: 199, textureRecord: 1, xPos: 0, yPos: 0, zPos: 0, factionID: 777, flags: 0, position: 1 },
          ],
        },
      }],
    },
  };
}

test('AUDIT 26 F019: SetLayoutData exterior overload - FLATS.CFG owns the gender flag (StaticNPC.cs:185-194)', () => {
  // `flatCFG.gender.Contains("2")` sets bit 32; anything else CLEARS it
  // with `flags &= 223`. Both directions, and the other bits stand.
  assert.equal(exteriorNpcFlags(0, { gender: '2' }), 32, 'a female flat must gain bit 32');
  assert.equal(exteriorNpcFlags(32, { gender: '1' }), 0, 'a male flat must LOSE the record bit - the flag is invalid outdoors');
  assert.equal(exteriorNpcFlags(0, { gender: '1' }), 0);
  assert.equal(exteriorNpcFlags(32, { gender: '2' }), 32);
  // Contains, not equals: "?2" is the ChildGard censor mark on a female flat.
  assert.equal(exteriorNpcFlags(0, { gender: '?2' }), 32);
  assert.equal(exteriorNpcFlags(32, { gender: '?1' }), 0);
  // 223 is ~32 in a byte: every other bit survives the clear.
  assert.equal(exteriorNpcFlags(0b11111111, { gender: '1' }), 0b11011111);
  assert.equal(exteriorNpcFlags(0b11011111, { gender: '2' }), 0b11111111);
  // C# only enters the branch when GetFlatData answered true.
  assert.equal(exteriorNpcFlags(32, null), 32, 'a flat FLATS.CFG does not carry keeps its own flags');
  assert.equal(exteriorNpcFlags(5, null), 5);
});

test('AUDIT 26 F019: the collected flats carry the RAW record triple the position hash reads', () => {
  const flats = collectBlockFlats(block(), 504);
  const npcs = collectExteriorNpcs(flats);
  // both flat sites, the unfactioned flat and the editor flat excluded
  assert.deepEqual(npcs.map((n) => n.archive), [179, 181]);
  // GetPositionHash reads the UNSCALED XPos/YPos/ZPos (StaticNPC.cs:210,
  // :333-336) - the scaled billboard position cannot answer it.
  assert.deepEqual(
    { rawX: npcs[0].rawX, rawY: npcs[0].rawY, rawZ: npcs[0].rawZ },
    { rawX: 100, rawY: -4, rawZ: 200 });
  assert.deepEqual(
    { rawX: npcs[1].rawX, rawY: npcs[1].rawY, rawZ: npcs[1].rawZ },
    { rawX: 8, rawY: 0, rawZ: 8 });
});

test('AUDIT 26 F019: one collected flat derives the exterior NPCData (StaticNPC.cs:180-224)', () => {
  const npc = collectExteriorNpcs(collectBlockFlats(block(), 504))[0];
  // FLATS.CFG says MALE for this flat; the record's own bit 32 says
  // female and is invalid outdoors.
  const pn = exteriorNpcRecord(npc, { gender: '1' });
  const data = staticNpcData(pn, {
    mapId: 999, locationIndex: 7, buildingKey: 0, context: pn.context,
    getFaction: (id) => (id === 42 ? { race: 2, type: 0 } : null),   // FactionRaces.Redguard
    raceOfCurrentRegion: () => RACES.Nord,
  });
  assert.deepEqual(data, {
    ...ZERO_NPC_DATA,
    // GetPositionHash(100, -4, 200) = 100 ^ (-4 << 2) ^ (200 >> 2)
    //                               = 100 ^ -16 ^ 50 = -90
    hash: -90,
    flags: 0,                       // 32 & 223 - the FLATS.CFG repair
    factionID: 42,
    billboardArchiveIndex: 179,
    billboardRecordIndex: 5,
    // position ^ (buildingKey + locationIndex) = 12345 ^ (0 + 7)
    nameSeed: 12350,
    gender: GENDERS.Male,           // the repaired flag, not the record's
    race: RACES.Redguard,           // FactionRaces 2, not the region's Nord
    // the exterior overload's own two: no building above ground
    context: NPC_CONTEXT.Custom,
    buildingKey: 0,
    mapID: 999,
  });
  // ...and the record itself stamps Context.Custom (:206), which is
  // what the click reads to pick the overload.
  assert.equal(pn.context, NPC_CONTEXT.Custom);
});

test('AUDIT 26 F019: the wiring - collectExteriorNpcs has production callers in every host that owns RMB blocks', () => {
  // THE FOUR HOSTS. exterior.js and world.js are the only hosts that
  // lay out RMB blocks (RMBLayout is a block layout); the dungeon
  // hosts are RDB and the standalone interior scene builds one
  // building, so neither has an exterior flat to collect.
  for (const f of ['src/scenes/exterior.js', 'src/scenes/world.js']) {
    const host = src(f);
    assert.match(host, /import \{ collectExteriorNpcs, exteriorNpcRecord\s*[,}]/, `${f}: the collection is not imported`);
    assert.ok(host.includes('collectExteriorNpcs(blockFlats)'), `${f}: the collection is never called on the block's flats`);
    assert.ok(host.includes('exteriorNpcRecord('), `${f}: no NPC record is ever stood`);
    assert.ok(host.includes('npcTargets: ()'), `${f}: the NPCs never reach the mode machine`);
  }
  for (const f of ['src/scenes/dungeonContext.js', 'src/scenes/dungeon.js', 'src/scenes/interior.js']) {
    assert.ok(!src(f).includes('collectBlockFlats'), `${f}: N/A only holds while this host lays out no RMB block`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// ROAD-E E3: RMBLayout's THIRD act on an exterior StaticNPC
// (RMBLayout.cs:377 / :453) - the one the AUDIT 26 wiring left flagged.
// The law is `QuestMachine.Instance.SetupIndividualStaticNPC(go,
// obj.FactionID)` at LAYOUT, per NPC, and its two observable halves:
// the away arm's SetActive(false) (out of the draw AND out of the ray)
// and the bootstrap QuestResourceBehaviour every other individual gets.
// ═══════════════════════════════════════════════════════════════════

/** A machine whose one site link places the individual 305 AWAY from
 *  home (or at home), without parsing a quest: the walk reads
 *  SiteLink -> Quest -> Place -> selectedMarker -> resource. */
function individualMachine({ atHome = false } = {}) {
  const m = new QuestMachine({
    world: {
      getFactionData: (id) => (id === 305 ? { id: 305, type: FACTION_TYPES.Individual }
        : id === 510 ? { id: 510, type: FACTION_TYPES.Group } : null),
    },
  });
  const person = {
    isPerson: true, symbol: { name: 'ind' }, isIndividualNPC: true,
    isIndividualAtHome: atHome, factionId: 305, factionData: { id: 305 },
    questResourceBehaviour: null,
  };
  const place = { isPlace: true, siteDetails: { selectedMarker: { targetResources: [{ name: 'ind' }] } } };
  const quest = {
    uid: 7, questComplete: false, questTombstoned: false,
    resources: new Map([['ind', person], ['lair', place]]),
    getPlace: (sym) => (sym?.name === 'lair' ? place : null),
    getResource: (sym) => quest.resources.get(sym?.name) ?? null,
  };
  person.parentQuest = quest;   // AssignResource reads targetQuest.uid off the resource
  m.quests.set(quest.uid, quest);
  m.siteLinks.push({ questUID: quest.uid, placeSymbol: { name: 'lair' }, siteType: 0, mapId: 999, buildingKey: 0, magicNumberIndex: 0 });
  return { m, person };
}

/** The two records one town pixel would stand: the individual, and a
 *  Group-faction street NPC that is not one. */
const npcRecords = () => [
  { ...exteriorNpcRecord({ archive: 179, record: 5, x: 1, y: 0, z: 2, factionID: 305, flags: 0, rawX: 1, rawY: 0, rawZ: 2, recordPosition: 12 }), active: true, questBehaviour: null, host: null },
  { ...exteriorNpcRecord({ archive: 181, record: 2, x: 3, y: 0, z: 4, factionID: 510, flags: 0, rawX: 3, rawY: 0, rawZ: 4, recordPosition: 13 }), active: true, questBehaviour: null, host: null },
];

test('E3: the away arm takes the home copy out of the draw AND the ray (RMBLayout.cs:377)', () => {
  const { m } = individualMachine({ atHome: false });
  const npcs = npcRecords();
  assert.equal(setupExteriorQuestStaticNpcs(npcs, m, makeInteriorPersonHost), true, 'the pass ran');
  assert.equal(npcs[0].active, false, 'an individual placed elsewhere loses its home copy (SetActive(false))');
  assert.equal(npcs[0].questBehaviour, null, 'the away arm attaches NO behaviour - it returns false first');
  // ...and the second half of "out of the ray": a deactivated
  // GameObject has no BoxCollider, so the host must not offer it as a
  // target. This is the shape scenes/world.js filters on.
  assert.deepEqual(npcs.filter((pn) => pn.active).map((pn) => pn.factionID), [510]);
  // the Group faction is not an individual: plain true, still standing
  assert.equal(npcs[1].active, true);
  assert.equal(npcs[1].questBehaviour, null);
});

test('E3: at home every individual gets the BOOTSTRAP behaviour, and it is coupled to the Person', () => {
  const { m, person } = individualMachine({ atHome: true });
  const npcs = npcRecords();
  setupExteriorQuestStaticNpcs(npcs, m, makeInteriorPersonHost);
  assert.equal(npcs[0].active, true, 'at home the copy stands');
  assert.ok(npcs[0].questBehaviour instanceof QuestResourceBehaviour,
    'the follow-up-quest bootstrap click needs a behaviour on EVERY individual');
  assert.equal(person.questResourceBehaviour, npcs[0].questBehaviour, 'coupled back to the Person');
  // the host carries the faction DoClick's individual broadcast reads
  assert.equal(npcs[0].host.staticNpcFactionId, 305);
});

test('E3: a host with no quest machine is C-sharp\'s empty-machine answer - everyone stands, nobody is touched', () => {
  const npcs = npcRecords();
  assert.equal(setupExteriorQuestStaticNpcs(npcs, null, makeInteriorPersonHost), false,
    'the pass must report that it did NOT run, so the caller can run it again when a machine exists');
  assert.deepEqual(npcs.map((pn) => [pn.active, pn.questBehaviour, pn.host]), [[true, null, null], [true, null, null]]);
});

// ═══════════════════════════════════════════════════════════════════
// ROAD-F GS1: the OTHER gap AUDIT 26 flagged at this seam - the GUILD
// SERVICE popup above ground.
//
// StaticNPCClick pushes it on `Services.HasGuildService` ALONE
// (PlayerActivate.cs:1552-1568): the BuildingDiscoveryData beside it
// supplies the guild GROUP, and :1543-1546 has already answered
// GuildGroups.None for a player who is not inside a building. So a
// street NPC carrying a guild-service faction opens the popup in C#,
// into DFU's ONE UserInterfaceManager stack. The port has three slots,
// one per mode, and this whole chain wrote the interior one - which
// only the interior and dungeon frames draw, tick, key and click.
// ═══════════════════════════════════════════════════════════════════

test('ROAD-F GS1: an outdoor street NPC with a guild-service faction routes to the popup', () => {
  // The ROUTING has answered this since G8 and it is DFU's own order:
  // HasGuildService is asked before the building is, and a player who
  // is not inside one carries GuildGroups.None into the group pick, so
  // the NPC's own ggroup decides (PlayerActivate.cs:1552-1560).
  const route = staticNpcRoute({
    npcFactionId: 850,                                   // FG_Repair
    npcFaction: { id: 850, ggroup: GUILD_GROUPS.FightersGuild, sgroup: 0, type: 0 },
    buildingFaction: null, buildingType: -1, insideBuilding: false,
  });
  assert.equal(route.kind, 'guildService', 'a street guild NPC does not route to the popup at all');
  assert.equal(route.guildGroup, GUILD_GROUPS.FightersGuild, "the NPC's own guild group must decide outdoors");
  assert.equal(route.buildingFactionId, 0, 'there is no building faction in the street');
  assert.equal(npcServiceKind(850), 'Repair', 'the service the popup would offer');
});

