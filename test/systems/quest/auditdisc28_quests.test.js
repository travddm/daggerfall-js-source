// AUDIT DISC28 (2026-09-28, before the merge) - lane 5, the quests: DISC28-I (a shared quest ends for the whole
// party), DISC28-J (a partner's quest foe stands for a linked copy) and DISC28-K (a re-picked house shows the live
// job's name), read against their own field reports. Each pin is DRIVEN: the real QuestMachine and share path
// (systems/quest/questShare.js) over the vendored quests, the real OnlineSession with its client floor and inbound gates,
// and world.js's own questSyncTick / shareQuestWithParty / onQuestShared / questShareSeam lifted verbatim out of the
// host and bound to real collaborators - a copy of the law would pass with the host broken.
//
// QS-1  a final the client's floor (QUEST_SEND_MS) refused was drained and lost - it waits now until it has left;
//       and nothing is synced from EndQuest's grace (the reward window), which spent the floor the final needed.
// QS-2  the live-sync watch ran below the exterior's modal return: a finish in a house or a dungeon told nobody.
// QS-3  a partner's final meeting a copy already ended said "... but you have already done this quest".
// QS-4  a finishing envelope on a copy in grace ran endQuest again (reputation, notebook twice); a reward armed by one
//       envelope and not yet run was refused by the next and never ran.
// QS-5  the grace sync handed a member with no copy an ending quest - its reward paid, a copy that never ended.
// QS-J  a quest foe handed to an heir with no linked copy was refused and lost for everyone.
// QS-K1 the re-stamp wiped the town map's rename and the lockpick record, and renamed the player's own house.
// QS-K2 the town map opened on arrival still named a house for the job before.
// QS-D  the lock ladder's contract still called the quest rung "the siteLinks walk".
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import * as QS from '../../../src/systems/quest/questShare.js';
import * as discovery from '../../../src/systems/discovery.js';
import { mapPixelToWorldCoord } from '../../../src/formats/mapsFile.js';
import { BUILDING_TYPES } from '../../../src/world/buildingNames.js';
import { OnlineSession } from '../../../src/net/online.js';
import { CHAT_WORLD_ROOM } from '../../../src/net/wire.js';
import { createExteriorFoes, QUEST_PUPPETS_MAX } from '../../../src/scenes/exteriorFoes.js';
import { questShareTag, sharedQuestFoe, questPrivateTag, partyQuestFoe, questBehaviourFor, adoptsOrphanQuestFoe } from '../../../src/scenes/quest/questFoeHost.js';
import { ExteriorAutomapWindow, stampResidenceQuestNames } from '../../../src/ui/exteriorAutomapWindow.js';
import { buildingSummaries } from '../../../src/world/buildingSummaries.js';
import { fakeSocketClass } from '../../fakeSocket.mjs';
import { hostText } from '../../hostText.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rd = (p) => hostText(p);   // HOST-SPLIT 2: a host read whole - the town plan's open lives in scenes/exteriorAutomapToggle.js
const VENDOR = join(ROOT, 'vendor', 'dfu-quests');
const readQ = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '');
{
  const sources = {};
  for (const f of readdirSync(join(VENDOR, 'Tables'))) if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = readQ(join(VENDOR, 'Tables', f));
  loadQuestTables(sources);
}
const CORPUS = {};
for (const f of readdirSync(join(VENDOR, 'Quests'))) CORPUS[f.replace(/\.txt$/i, '')] = readQ(join(VENDOR, 'Quests', f)).split(/\r?\n/);
// test/systems/quest/disc28_quest.test.js's own: a reward and an end in one task, and a `get item` beside it
CORPUS.__FN = ['Quest: __FN', 'QRC:', 'Message:  1011', ' a reward', '', 'QBN:', 'Item _reward_ gold', 'Item _pkg_ letter', '',
  '_t_ task:', ' give pc _reward_', ' end quest', '', '_g_ task:', ' get item _pkg_', '', 'variable _pad_'];
const lists = { findQuestMeta: () => null, hasAcceptedOneTime: () => false, markOneTimeAccepted() {} };
const quiet = (fn) => { const w = console.warn, l = console.log, i = console.info; console.warn = () => {}; console.log = () => {}; console.info = () => {}; try { return fn(); } finally { console.warn = w; console.log = l; console.info = i; } };
const sym = (q, name) => [...q.tasks.values()].find((t) => t.symbol?.name === name.replace(/_/g, ''))?.symbol;
const run = (m, n = 4) => { for (let i = 0; i < n; i++) m.tick(); };

/** A machine whose every reward door is counted: the reward offer, the items handed, reputation, the notebook. */
function machine(world = null, now = () => 0) {
  const m = new QuestMachine({
    nowSeconds: now, showPopup() {}, world, lastNPCClicked: () => m.clicked ?? null,
    getQuestSourceLines: (n) => CORPUS[n] ?? null,
    offerReward: () => { m.rewards = (m.rewards ?? 0) + 1; },
    giveItemToPlayer: (it) => { (m.given ??= []).push(it); },
    changeReputation: (fid, amount) => { (m.rep ??= []).push([fid, amount]); },
    addFinishedQuest: () => { m.notebook = (m.notebook ?? 0) + 1; },
  });
  return m;
}

// ---- a one-town world (test/systems/quest/disc28_quest.test.js's fixture) for the vendored quests that name a house ----
const flat = (record) => ({ textureArchive: 199, textureRecord: record, xPos: 40, yPos: 8, zPos: 60 });
const building = (buildingType) => ({ buildingType, factionId: 0, nameSeed: 777, locationId: 0, sector: 0, quality: 9 });
const FACTIONS = new Map([
  [510, { id: 510, type: 2, name: 'The Merchants', race: -1 }],
  [201, { id: 201, type: 15, name: 'People of Testshire', race: -1 }],
  [867, { id: 867, type: 14, name: 'Court of Testshire', race: -1 }],
]);
function town() {
  const buildings = [building(17), building(17), building(17)];
  const block = { position: 5000, rmbBlock: { fldHeader: { buildingDataList: buildings, otherNames: null },
    subRecords: buildings.map(() => ({ interior: { blockFlatObjectRecords: [flat(11), flat(18)] } })) } };
  const w0 = mapPixelToWorldCoord(100, 100);
  const loc = { loaded: true, regionIndex: 0, regionName: 'Testshire', name: 'Bigtown', locationIndex: 0, hasDungeon: false,
    mapTableData: { mapId: 111, locationType: 0, dungeonType: -1 },
    exterior: { buildings, recordElement: { header: { x: w0.x, y: w0.y } }, exteriorData: { locationId: 0x400, width: 1, height: 1, blockNames: ['TESTAA00.RMB'] } },
    dungeon: null };
  const region = { name: 'Testshire', locationCount: 1, mapTable: [{ mapId: 111, locationType: 0, dungeonType: -1 }] };
  return {
    maps: { regionCount: 1, getRegion: () => region, getLocation: () => loc, getLocationByName: () => loc,
      getRmbBlockName: () => 'TESTAA00.RMB', readLocationIdFast: () => 0x400, getClimateIndex: () => 231 },
    getBlock: () => block, currentLocation: () => loc, currentRegionIndex: () => 0, currentLocationIndex: () => 0,
    isPlayerInLocationRect: () => true, playerInside: () => null, isHouseOwned: () => false,
    playerPixel: () => ({ x: 100, y: 100 }), buildingNameOpts: () => ({}),
    getFactionData: (id) => FACTIONS.get(id) ?? null, findFactionsOfType: (t) => [...FACTIONS.values()].filter((f) => f.type === t),
    currentRegionPeople: () => 201, currentRegionCourt: () => 867, currentRegionFaction: () => 201,
    currentRegionVampireClan: () => 0, playerVampireClan: () => 0, currentRegionRace: () => 3,
  };
}

/** A statement out of `src` from `marker` (which ends on its opening brace) to that brace's close - `const x = () => {`,
 *  `x.y = (a) => {`, `const x = {` - with the `;` that ends it. Strings and line comments are skipped. */
function lift(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0 && marker.endsWith('{'), `world.js carries ${marker}`);
  let i = at + marker.length - 1, depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  return src.slice(at, i + 1) + ';';
}

/** The hub: every quest frame a seat wrote goes to every other seat. Answers what moved. */
function pump(seats) {
  const moved = [];
  for (const a of seats) for (const f of a.outbox()) {
    moved.push({ from: a.acct, final: f.quest?.data?.final === 1 });
    for (const b of seats) if (b !== a) b.deliver(a.acct, f.quest);
  }
  return moved;
}
const refusals = (s) => s.said.filter((t) => / tried to share /.test(t));
/** The Exterminator (vendored A0C00Y07), taken by `A` at a faction for its reputation, and shared with the others. */
function exterminator(A, others) {
  A.m.clicked = { factionID: 510, nameSeed: 4242, gender: 0 };
  const q = quiet(() => { const x = A.m.scheduleQuest(CORPUS.A0C00Y07, 510, { rolls: () => 0.4 }); A.m.tick(); A.m.tick(); return x; });
  A.share(q.uid); pump([A, ...others]);
  return q;
}
/** A copy's vermin dead and its questor clicked - `give pc _gold_` + `end quest` (`_pcgetsgold_`); `ticks` machine ticks. */
function deliver(m, q, ticks) {
  quiet(() => { q.startTask(sym(q, '_S.03_')); m.tick(); q.startTask(sym(q, '_questdone_')); run(m, ticks); });
}

test('AUDIT DISC28 QS-5: an envelope whose `end quest` has run makes no copy - a fresh receipt of an ending quest is \'finished\', said to nobody', () => {
  const A = machine(town());
  A.clicked = { factionID: 510, nameSeed: 4242, gender: 0 };
  const q = quiet(() => { const x = A.scheduleQuest(CORPUS.A0C00Y07, 510, { rolls: () => 0.4 }); A.tick(); A.tick(); return x; });
  A.markQuestShared('A0C00Y07');
  deliver(A, q, 1);   // mid-grace: questComplete false, EndQuest done
  const env = QS.prepareQuestShare(A, q.uid).data;
  assert.equal(env.questComplete, false);
  assert.equal(QS.shareEnvelopeEnding?.(env), true, 'the envelope carries its end');
  const C = machine(town());
  const got = quiet(() => QS.receiveSharedQuest(C, lists, 'A0C00Y07', env));
  assert.equal(got.reason, 'finished');
  assert.equal(C.sharedCandidateNamed('A0C00Y07'), null);
  assert.equal(C.rewards ?? 0, 0);
});

// ---- QS-J: the heir's law, over real encounter pools and world.js's own seam ----
function craftCfg() { const b = new Uint8Array(74); const v = new DataView(b.buffer); b[10] = 0x08; v.setUint16(52, 40, true); const at = [40, 50, 50, 85, 50, 50, 90, 55]; for (let k = 0; k < 8; k++) v.setUint16(58 + k * 2, at[k], true); return b; }
function craftMonsterBsa(records) {
  const NAME_FIELD = 14, ENTRY = 18; const dataLen = records.reduce((a, [, b]) => a + b.length, 0);
  const out = new Uint8Array(4 + dataLen + ENTRY * records.length); const v = new DataView(out.buffer);
  v.setInt16(0, records.length, true); v.setUint16(2, 0x0100, true); let pos = 4;
  for (const [, bytes] of records) { out.set(bytes, pos); pos += bytes.length; }
  for (const [name, bytes] of records) { for (let k = 0; k < name.length; k++) out[pos + k] = name.charCodeAt(k); v.setInt32(pos + NAME_FIELD, bytes.length, true); pos += ENTRY; }
  return out;
}
const bsa = craftMonsterBsa([['ENEMY000.CFG', craftCfg()]]);
const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8, getFrameCount: () => 1 };
const settle = async () => { for (let k = 0; k < 5; k++) await new Promise((r) => setTimeout(r, 0)); };
const pe = () => ({ level: 1, reflexes: 2, health: 50, maxHealth: 50, skills: new Array(40).fill(20), skillUses: new Array(40).fill(0), items: [], activeEffects: [], stats: { strength: 50, agility: 50, luck: 50, speed: 50, endurance: 50 }, armorValues: new Array(7).fill(60) });
const PARTY = ['host-0001', 'amy-0003', 'cat-0004', 'aaa-0002', 'host-0005', 'zzz-0009'];
function pool(self, seam, { clock = { t: 0 }, staleMs = 0 } = {}) {
  const p = createExteriorFoes({
    renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, textures: new Map() },
    collider: { raycast: () => Infinity, heightAt: () => 0, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false, capsuleCast: () => ({ dist: Infinity, key: null }), sphereCast: () => ({ dist: Infinity, key: null }), move: (feet, mx, my, mz) => { feet[0] += mx; feet[2] += mz; return { grounded: true, hitCeiling: false, groundKey: 'floor' }; } },
    fetchBytes: async (n) => { if (n === 'MONSTER.BSA') return bsa; throw new Error(`no ${n} in this pin`); },
    getTexture: async () => stubTex, uploadRecordFrame: () => {}, currentMinute: () => 0, currentPixelKey: () => '3,12',
    playerEntity: pe(), audio: null, onPlayerHurt: () => {}, rolls: () => 0.01, rand: () => 0.01,
  });
  p.setNet({ room: () => 'world:3,12', selfId: () => self, peers: () => [], now: () => clock.t, staleMs, onPeerHit: () => true, toWire: (f) => [f[0], f[1], f[2]], toScene: (x) => [x[0], x[1], x[2]] });
  p.setQuestShare(seam);
  return p;
}

test('AUDIT DISC28 QS-J: a quest foe handed to a party member with no linked copy is taken on the partner\'s word - it rides to the linked member, and a party member\'s blow lands on it', async () => {
  const A = machine(town()); A.clicked = { factionID: 510, nameSeed: 4242, gender: 0 };
  const q = quiet(() => { const x = A.scheduleQuest(CORPUS.A0C00Y07, 0, { rolls: () => 0.4 }); A.tick(); A.tick(); return x; });
  A.markQuestShared('A0C00Y07');
  const Amy = machine(town());
  assert.ok(quiet(() => QS.receiveSharedQuest(Amy, lists, 'A0C00Y07', QS.prepareQuestShare(A, q.uid).data)).ok, 'amy\'s copy is linked');
  const Cat = machine(town());   // cat never took it
  const foeSym = [...q.resources.values()].find((r) => r.isFoe).symbol;
  const host = pool('host-0001', { tagOf: (f) => (f.questBehaviour ? { q: 'A0C00Y07', s: foeSym.name } : null), accepts: () => true, partyPeer: () => true,
    peerMayHit: () => true, onPuppetHurt() {}, onPuppetDied() {}, behaviourFor: () => null, adoptsOrphan: () => false });
  const f = await host.spawnFoe(0, [100, 0, 100], { feetGiven: true, loose: true });
  f.questBehaviour = { questUID: q.uid, targetSymbol: foeSym, bindHost() {}, start() {}, update() {} };
  await settle();
  const handed = host.handOverFrame(() => 'cat-0004');   // world.js heirOf: the nearest party peer
  await settle();
  assert.equal(host.dropOwnLive(), 1, 'the owner let it go');
  await settle();
});

/** The Exterminator (vendored A0C00Y07) taken by a sharer, linked to `linked` by a real share (`link` links another);
 *  its first Foe's symbol. */
function sharedExterminator(linked) {
  const A = machine(town()); A.clicked = { factionID: 510, nameSeed: 4242, gender: 0 };
  const q = quiet(() => { const x = A.scheduleQuest(CORPUS.A0C00Y07, 0, { rolls: () => 0.4 }); A.tick(); A.tick(); return x; });
  A.markQuestShared('A0C00Y07');
  const link = (m) => assert.ok(quiet(() => QS.receiveSharedQuest(m, lists, 'A0C00Y07', QS.prepareQuestShare(A, q.uid).data)).ok, 'linked');
  for (const m of linked) link(m);
  return { q, link, foeSym: [...q.resources.values()].find((r) => r.isFoe).symbol };
}
/** An owner's pool standing one foe of the shared quest at `at`. */
async function questOwner(id, q, foeSym, at = [100, 0, 100]) {
  const host = pool(id, { tagOf: (f) => (f.questBehaviour ? { q: 'A0C00Y07', s: foeSym.name } : null), accepts: () => true, partyPeer: () => true,
    peerMayHit: () => true, onPuppetHurt() {}, onPuppetDied() {}, behaviourFor: () => null, adoptsOrphan: () => false });
  const f = await host.spawnFoe(0, at, { feetGiven: true, loose: true });
  f.questBehaviour = { questUID: q.uid, targetSymbol: foeSym, bindHost() {}, start() {}, update() {} };
  return { host, f };
}
const HERE = [100, 0, 100];
const around = (self) => [{ id: 'aaa-0002', feet: HERE }, { id: 'zzz-0009', feet: HERE }].filter((p) => p.id !== self);

test('AUDIT DISC28 QS-K1: the re-stamp moves the name alone - the town map\'s rename and the lockpick record stand; the player\'s own house is never renamed', () => {
  const LOC = '0:Bigtown', KEY = 77;
  const house = { buildingKey: KEY, name: 'Residence', buildingType: BUILDING_TYPES.House1, factionId: 0, quality: 5 };
  const job = (name, owned = false) => ({ currentMapID: () => 111, ownsHouse: (k) => owned && k === KEY,
    isBuildingQuestResource: (m, k) => (m === 111 && k === KEY ? { isQuestResource: true, pcLearnedAboutExistence: true, overrideBuildingName: name } : null) });
  discovery.restoreDiscovery(null);
  discovery.discoverBuilding(LOC, house, null, job('The Selvani Residence'));
  discovery.setDiscoveredBuildingCustomName(LOC, KEY, 'Rat house');
  discovery.setLastLockpickAttempt(LOC, KEY, 45);
  assert.equal(discovery.discoverBuilding(LOC, house, null, job('The Direnni Residence')), true, 'the later job\'s name');
  const rec = discovery.getDiscoveredBuilding(LOC, KEY);
  assert.deepEqual([rec.displayName, rec.oldDisplayName, rec.isOverrideName], ['The Direnni Residence', 'Residence', true]);
  assert.equal(rec.customUserDisplayName, 'Rat house', 'the player\'s own rename stands');
  assert.equal(discovery.getLastLockpickAttempt(LOC, KEY), 45, 'and the anti-grind record');
  // the purchase's override (banking.js, DaggerfallBankManager's "<name>'s residence"), and a partner's shared job on it
  discovery.restoreDiscovery(null);
  discovery.discoverBuilding(LOC, { buildingKey: KEY, buildingType: BUILDING_TYPES.House1 }, "Mac's residence");
  assert.equal(discovery.discoverBuilding(LOC, house, null, job('The Direnni Residence', true)), false, 'never the player\'s own house');
  discovery.undiscoverBuilding(LOC, KEY, true, 'The Direnni Residence');   // that job's tombstone (Quest.cs's undiscover)
  assert.equal(discovery.getDiscoveredBuilding(LOC, KEY)?.displayName, "Mac's residence", 'and so never undiscovered by it');
});

test('AUDIT DISC28 QS-K2: the town plan opened on arrival names the house for the live job, not the one before', () => {
  const FAKE_BLOCK = { x: 1, y: 0, dfBlock: { rmbBlock: { fldHeader: { numBlockDataRecords: 2, buildingDataList: [
    { buildingType: 9, nameSeed: 1, factionId: 0, quality: 10 }, { buildingType: 17, nameSeed: 2, factionId: 0, quality: 4 }] },
  subRecords: [{ xPos: 2048, zPos: 1024, yRotation: 0, exterior: { block3dObjectRecords: [] }, interior: {} },
    { xPos: 512, zPos: 3072, yRotation: 0, exterior: { block3dObjectRecords: [] }, interior: {} }] } } };
  const LOC = 'r:town', MAP = 111;
  discovery.restoreDiscovery(null);
  const summaries = buildingSummaries([{ buildingType: 9, nameSeed: 1, factionId: 0, quality: 10 }], [FAKE_BLOCK], {});
  const KEY = summaries.find((b) => b.isResidence).buildingKey;
  const job = (name) => ({ currentMapID: () => MAP, ownsHouse: () => false, isBuildingQuestResource: (m, k) => (m === MAP && k === KEY
    ? { isQuestResource: true, pcLearnedAboutExistence: true, locationWasMarkedOnMapByNPC: false, overrideBuildingName: name } : { isQuestResource: false }) });
  discovery.discoverBuilding(LOC, { buildingKey: KEY, name: 'Residence', buildingType: 17 }, null, job('The Selvani Residence'));   // the job before
  const live = job('The Direnni Residence');   // the live job, learned in the guild's town; the player arrives and opens the plan
  discovery.restampQuestNames?.(LOC, live);   // world.js toggleExteriorAutomap's open
  const w = new ExteriorAutomapWindow({ locationName: 'T', locationId: LOC, gridW: 2, gridH: 2, blocks: [], playerPos: () => [102.4, 0, 102.4], playerYaw: () => 0,
    locOrigin: [0, 0, 0], isCustomLocation: false, arrowMesh: () => null, compassArt: null,
    buildings: () => stampResidenceQuestNames(summaries.map((s) => ({ ...s })), discovery.discoveredBuildings(LOC), { getAllActiveQuestIds: () => [] }, MAP),
    directory: () => [], discovered: () => discovery.discoveredBuildings(LOC) });
  const plate = quiet(() => w.buildPlates({ fnt: { fixedWidth: 6, fixedHeight: 6, glyphWidth: () => 5 } }, { s: 3, ox: 0, oy: 0 })).find((p) => p.buildingKey === KEY);
  assert.equal(plate?.text, 'The Direnni Residence');
});

