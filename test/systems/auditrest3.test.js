// AUDIT REST III: six fresh lenses over every AUDIT REST II fix, each finding verified before it was fixed. The fixes a file of
// their own pins (the dungeon fires' E1 rides test/world/auditrest2_fires.test.js's harness, the H8 draw its own test) are
// RUN here where they can be: the hosts' own statements sliced out of the source and mounted over stubs
// (test/net/restsync.test.js's harness), the systems called.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { setSharedClock } from '../../src/systems/worldTick.js';
import { _resetForTests } from '../../src/systems/uiPrefs.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
afterEach(() => { setSharedClock(null); _resetForTests(); });

// ---- the hosts' own statements, mounted ----
const parsed = new Map();
function nodeOf(file, pred) {
  if (!parsed.has(file)) { const src = rd(file); parsed.set(file, { src, ast: acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }) }); }
  const { src, ast } = parsed.get(file);
  let hit = null;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || hit) return;
    if (pred(n)) { hit = n; return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast);
  assert.ok(hit, `${file} has the node`);
  return src.slice(hit.start, hit.end);
}
const fnOf = (file, name) => nodeOf(file, (x) => x.type === 'FunctionDeclaration' && x.id?.name === name);
const methodOf = (file, name) => nodeOf(file, (x) => x.type === 'Property' && x.method && x.key?.name === name);
const scoped = (state) => new Proxy(state, {
  has: (t, k) => k !== '__s',
  get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : globalThis[k])),
  set: (t, k, v) => { t[k] = v; return true; },
});
const mount = (body, state) => new Function('__s', `with (__s) { ${body} }`)(scoped(state));

test('AUDIT REST III D1: a held bounty\'s day moves with the lane - copied offline, a bounty taken half an hour before keeps its day and its kills on the character\'s own clock; the minute a bounty was paid moves with it (mutants: the rows left on the old clock; the paid minutes left)', async () => {
  const { offlineCopyOf, BOUNTY_RECORD_VENDOR } = await import('../../src/systems/offlineCopy.js');
  const { BOUNTY_VENDOR } = await import('../../src/systems/bounty/bountyBoard.js');
  assert.equal(BOUNTY_RECORD_VENDOR, BOUNTY_VENDOR, 'the record\'s own name');
  const own = 523530, world = 865550;
  const on = { held: [{ id: 'b1', takenAt: world - 30, killed: 2 }], paid: [], dropped: [], paidAt: { s1: world - 600 }, droppedKilled: {}, v: 2 };
  const back = offlineCopyOf({ classicMinutes: own, worldMinutes: world, modData: { [BOUNTY_VENDOR]: on } }).modData[BOUNTY_VENDOR];
  assert.equal(back.held[0].takenAt, own - 30, 'on the character\'s clock');
  assert.equal(back.held[0].killed, 2);
  assert.equal(back.paidAt.s1, own - 600);
});

test('AUDIT REST III B3: Firewood feeds the emptiest of my Campfires in reach that has room - a full one found first no longer takes the stick only to refuse it while a cold one beside it is empty (relit); all of them full still says full (mutants: room unasked; the first found; the full word lost)', async () => {
  const { setPref } = await import('../../src/systems/uiPrefs.js');
  const { setWorldMinutes } = await import('../../src/systems/worldTick.js');
  const { createCamps } = await import('../../src/scenes/camps.js');
  const { createSurvivalItem } = await import('../../src/systems/survival/items.js');
  const { TEMPLATE } = await import('../../src/systems/survival/food.js');
  const { createRestItem, REST_ITEM, REST_ITEM_TEXT } = await import('../../src/systems/rest/restItems.js');
  const { fireLit } = await import('../../src/systems/survival/camp.js');
  setPref('survival', true); setWorldMinutes(1000);
  const said = [];
  const entity = { items: [createSurvivalItem(TEMPLATE.Campfire), createSurvivalItem(TEMPLATE.Campfire), createSurvivalItem(TEMPLATE.Campfire)] };
  const p = createCamps({
    entity, camera: () => ({ feet: [0, 1, 0], yaw: 0 }), collider: () => ({ raycast: (o, d, m) => (d[1] < 0 && m >= o[1] ? o[1] : null) }),
    place: () => ({}), say: (l) => said.push(l), openRest: () => {}, showOverlay: () => {},
  });
  for (let i = 0; i < 3; i++) p.placeItem(entity.items[0], entity.items);
  assert.equal(p.camps.length, 3, 'three of mine stand in reach');
  const [full, half, cold] = p.camps;
  full.rec.wear = 8; half.rec.wear = 5; cold.rec.wear = 0; cold.rec.litUntil = 0;
  const wood = createRestItem(REST_ITEM.Firewood); wood.stackCount = 3;
  entity.items.push(wood);
  assert.equal(p.placeItem(wood, entity.items), true);
  assert.deepEqual([full.rec.wear, half.rec.wear, cold.rec.wear], [8, 5, 3], 'the empty cold one took it');
  assert.ok(fireLit(cold.rec, 1000), 'and was relit');
  assert.equal(p.placeItem(wood, entity.items), true);
  assert.deepEqual([full.rec.wear, half.rec.wear, cold.rec.wear], [8, 5, 6], 'the emptiest again');
  half.rec.wear = 8; cold.rec.wear = 8;
  assert.equal(p.placeItem(wood, entity.items), false);
  assert.equal(said.at(-1), REST_ITEM_TEXT.firewoodFull, 'every one full: the full word');
  assert.equal(wood.stackCount, 1, 'and the stick kept');
});

test('AUDIT REST III A2, A3: a tent\'s Stoke is its owner\'s - a friend\'s cold tent offers none (stoked on my screen alone, put out by its owner\'s next frame under the rest it promised); online my own cold tent keeps its Rest after its Stoke (the rest stokes it first, and was never refused); one worn out, neither; offline the list is as it was (mutants: the tent\'s stoke for anyone; the tent\'s rest dropped; any cold camp\'s rest kept)', async () => {
  const { campMenu, CAMP_KIND } = await import('../../src/systems/survival/camp.js');
  const keys = (rows) => rows.map((r) => r.key);
  const coldTent = { kind: CAMP_KIND.Tent, wear: 30, litUntil: 5 };
  // AUDIT C&C I11 (
  // the one it was less its Cook
  assert.deepEqual(keys(campMenu(coldTent, 10, false, { online: true })), [], 'a friend\'s cold tent: nothing, as a friend\'s cold fire');
  assert.deepEqual(keys(campMenu(coldTent, 10, true, { online: true })), ['stoke', 'rest', 'pack'], 'mine: Stoke, then the Rest that stokes it');
  assert.deepEqual(keys(campMenu({ ...coldTent, wear: 0 }, 10, true, { online: true })), ['pack'], 'worn out: neither');
  assert.deepEqual(keys(campMenu({ kind: CAMP_KIND.Fire, fuel: true, wear: 6, litUntil: 5 }, 10, true, { online: true })), ['stoke', 'pack'], 'a cold Campfire still offers no rest (relight it first)');
  assert.deepEqual(keys(campMenu(coldTent, 10, true)), ['rest', 'stoke', 'pack'], 'offline (every camp mine): as it was, less its Cook');
  assert.deepEqual(keys(campMenu({ ...coldTent, litUntil: 99 }, 10, false, { online: true })), ['rest', 'cook'], 'a friend\'s lit tent: rest and cook');
});

test('AUDIT REST III B5, H12 by behaviour (lens F8): an Ember Jar\'s fire is named as itself when looked at, as on its hover; online my cold Campfire\'s list leads with Relight and the plaque\'s Rest does not rest - the pool reads the lane on its own (mutants: the jar a Campfire; the lane unread)', async () => {
  const { setPref } = await import('../../src/systems/uiPrefs.js');
  const { setWorldMinutes } = await import('../../src/systems/worldTick.js');
  const { createCamps } = await import('../../src/scenes/camps.js');
  const { createSurvivalItem } = await import('../../src/systems/survival/items.js');
  const { TEMPLATE } = await import('../../src/systems/survival/food.js');
  const { createRestItem, REST_ITEM } = await import('../../src/systems/rest/restItems.js');
  const { CAMP_TEXT, campInfoText, CAMP_KIND } = await import('../../src/systems/survival/camp.js');
  assert.equal(campInfoText({ kind: CAMP_KIND.Fire, jar: true, wear: 1, litUntil: 99 }, 10, true), CAMP_TEXT.seeOwnJar);
  assert.equal(campInfoText({ kind: CAMP_KIND.Fire, jar: true, wear: 1, litUntil: 99 }, 10, false), CAMP_TEXT.seeJar);
  assert.equal(CAMP_TEXT.seeOwnJar, 'You see your Ember Jar fire.');
  assert.equal(campInfoText({ kind: CAMP_KIND.Fire, fuel: true, wear: 6, litUntil: 99 }, 10, true), CAMP_TEXT.seeOwnFire, 'a Campfire stays one');
  const pool = (entity, rests) => createCamps({
    entity, camera: () => ({ feet: [0, 1, 0], yaw: 0 }), collider: () => ({ raycast: (o, d, m) => (d[1] < 0 && m >= o[1] ? o[1] : null) }),
    place: () => ({}), say: () => {}, openRest: () => rests.push(1), showOverlay: () => {},
  });
  setPref('survival', true); setWorldMinutes(1000);
  const jarEntity = { items: [createRestItem(REST_ITEM.EmberJar)] };
  const said = [];
  const jp = createCamps({ entity: jarEntity, camera: () => ({ feet: [0, 1, 0], yaw: 0 }), collider: () => ({ raycast: (o, d, m) => (d[1] < 0 && m >= o[1] ? o[1] : null) }), place: () => ({}), say: (l) => said.push(l), openRest: () => {}, showOverlay: () => {} });
  jp.placeItem(jarEntity.items[0], jarEntity.items);
  jp.activate(`camp:${jp.camps[0].rec.id}`, 'info');
  assert.equal(said.at(-1), CAMP_TEXT.seeOwnJar, 'the pool says it too');
  for (const online of [false, true]) {
    setSharedClock(online ? () => 5_000_000 : null);
    const rests = [];
    const entity = { items: [createSurvivalItem(TEMPLATE.Campfire)] };
    const p = pool(entity, rests);
    assert.equal(p.placeItem(entity.items[0], entity.items), true);
    p.camps[0].rec.litUntil = 0;   // burned down, its fuel left
    const key = `camp:${p.camps[0].rec.id}`;
    assert.equal(p.hoverName(key).actions[0].id, online ? 'stoke' : 'rest', online ? 'online: Relight leads' : 'offline: as it was');
    p.activate(key, 'grab', 'rest');
    assert.equal(rests.length, online ? 0 : 1, online ? 'the plaque\'s Rest rests nobody at a cold fire online' : 'offline it rests, as DFU rests anywhere');
  }
});

test('AUDIT REST III E2: a mirrored placement\'s floor looks up to the collider as the world pass draws it - its winding turned back (staticBatch.js WOD5), so `back` is the game\'s own face on every placement; the normal faces the ray either way (mutant: the mirror unread)', async () => {
  const { Collider } = await import('../../src/player/collider.js');
  const positions = [-1, 0, -1, -1, 0, 1, 1, 0, 1, 1, 0, -1];   // a floor, wound to look up
  const indices = [0, 1, 2, 0, 2, 3];
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const MX = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];   // an x mirror (scale -1)
  for (const [name, m] of [['as placed', I], ['mirrored', MX]]) {
    const c = new Collider(() => -Infinity);
    c.addMesh('dungeon', positions, indices, m);
    const down = c.raycastHit([0.2, 2, 0.3], [0, -1, 0], 5);
    assert.equal(down.dist, 2, name);
    assert.equal(down.back, false, `${name}: a floor's top, seen from above, is its front`);
    assert.deepEqual(down.normal.map((v) => Math.round(v * 1000) / 1000 + 0), [0, 1, 0], `${name}: the normal faces the ray`);
    const up = c.raycastHit([0.2, -2, 0.3], [0, 1, 0], 5);
    assert.equal(up.back, true, `${name}: from under, its back`);
  }
});

test('AUDIT REST III D2: a time limit the text sets keeps its days online - K0C00Y07\'s ransom and B0B71Y03\'s daughter read their number, not "a few", beside the deadline that kept its own; offline as ever (mutants: either out of the table)', async () => {
  const { QuestMachine } = await import('../../src/systems/quest/machine.js');
  const { PLAYED_STEP_MAX_SECONDS } = await import('../../src/systems/quest/clock.js');
  const { loadQuestTables } = await import('../../src/systems/quest/tables.js');
  const { readdirSync } = await import('node:fs');
  const bare = (p) => rd(p).replace(/^\uFEFF/, '');
  const sources = {};
  for (const f of readdirSync(new URL('../../vendor/dfu-quests/Tables', import.meta.url))) if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = bare(`vendor/dfu-quests/Tables/${f}`);
  loadQuestTables(sources);
  const parse = (name, online) => {
    const lines = bare(`vendor/dfu-quests/Quests/${name}.txt`).split(/\r?\n/);
    return new QuestMachine({
      nowSeconds: () => 0, raisedSeconds: () => 0, questClockStepMax: () => (online ? PLAYED_STEP_MAX_SECONDS : Infinity),
      showPopup() {}, getQuestSourceLines: () => lines, sharedClock: () => online,
    }).parseQuestShape(name);
  };
  const log = console.log; console.log = () => {};
  try {
    for (const [quest, clock] of [['K0C00Y07', '2ransom'], ['B0B71Y03', 'finddaughter']]) {
      const on = parse(quest, true).resources.get(clock), off = parse(quest, false).resources.get(clock);
      assert.equal(on.isDeadline, true, `${quest}:${clock} a deadline`);
      assert.equal(on.waitsShort, false, 'no short wait online');
      assert.match(String(on.expandMacro(5)), /^\d+$/, `${quest}: online "=${clock}_ days" reads its number`);
      assert.equal(on.expandMacro(5), off.expandMacro(5), 'the same number offline');
    }
  } finally { console.log = log; }
});
