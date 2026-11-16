// KEPT-KILL. A quest's foes are its player's alone, and a shared quest's ride to the party only (QUEST-PARTY) -
// a stranger never sees, strikes or is hunted by one. The one kill no copy of the quest counted: a foe its owner HANDED
// (a death, a door out) to a party member whose copy holds no such quest (AUDIT DISC28 QS-J keeps it on the partner's
// word, `_keptTag`), killed with no linked copy in the room to see it fall - the owner came back to a fresh foe at the
// marker. The heir's party pose says the kill now (`qk`), and every linked copy counts it, once, wherever its member
// stands. Mounted, not matched: the dungeon's own-lane doors are sliced out of the context's source and run
// (test/scenes/questparty3c.test.js's harness); the quest is the real machine over a quest script; the hosts' wiring by source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { validPartyPose, validFoeRecord, FOE_HEALTH_MAX, FOE_LEVEL_MAX, CELL_FRAME_RECORDS_MAX, CELL_LOOSE_PUPPETS, FOES_FRAME_MAX,
  KEPT_KILL_POSE_MAX, KEPT_KILL_QUEST_RE, KEPT_KILL_SYMBOL_RE } from '../../../src/net/wire.js';
import { validQuestTags, questMarkerYields, QUEST_PUPPETS_MAX, validLooseSeqs, companionNames } from '../../../src/scenes/exteriorFoes.js';
import { summonedWord, summonedRecord, markSummoned } from '../../../src/systems/foeLootCap.js';
import { KeptKillLedger, creditKeptKills, KEPT_KILL_HOLD_MS, KEPT_KILL_MEMORY_MS } from '../../../src/scenes/quest/questFoeHost.js';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import { receiveSharedQuest, prepareQuestShare } from '../../../src/systems/quest/questShare.js';
import { getInnerSymbolName } from '../../../src/systems/quest/symbol.js';
import { foeSeed, applyWireLook } from '../../../src/characters/foeBodies.js';   // AUDIT MW-NPC II K3: the dungeon context's look seed, in the mounted scope
import { strikeTraits, traitWire, traitWireKey, readTraitWire, traitsAuthority, traitsFrame } from '../../../src/scenes/foeTraitsHost.js';   // AUDIT WORLD-EVENTS: the dungeon host's trait doors, in the mounted scope
import { bossClockS } from '../../../src/systems/bossTraits.js';
const TRAIT_DOORS = { strikeTraits, traitWire, traitWireKey, readTraitWire, traitsAuthority, traitsFrame, bossClockS };
import { partyOnlyQuestShare } from '../../../src/scenes/quest/questFoeHost.js';   // QUEST-OWNER: the dungeon's quest seam, narrowed to the party (ownShare)
import { isClassEnemyId, enemyEntityType } from '../../../src/characters/enemy/enemyBasics.js';   // DEX1: the hosts' class test and entity type (the mount's free names)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const scoped = (state) => new Proxy(state, {
  has: (t, k) => k !== '__s',
  get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : globalThis[k])),
  set: (t, k, v) => { t[k] = v; return true; },
});
const mount = (body, state) => new Function('__s', `with (__s) { ${body} }`)(scoped(state));
const tick = () => new Promise((r) => setTimeout(r, 0));

const QUEST = 'M0B00Y17';   // Runaway Pet - `Foe _tiger_ is Sabretooth_tiger`
const foe = (over = {}) => ({
  mobileType: 5, gender: 'male', dead: false, corpse: false, batch: { b: 1 },
  ai: { feet: [0, 0, 0], yaw: 0, moving: false, target: null, height: 1.8, resumeLive() { this.resumed = true; } },
  entity: { health: 30, maxHealth: 30, items: [] },
  ...over,
});
const questFoe = (symbol = 'tiger', over = {}) => foe({ questBehaviour: { questUID: 7, targetSymbol: { name: symbol } }, ...over });
const PARTY = new Set(['aaa-0001', 'mmm-0002', 'zzz-0009']);

// ---- the quest: the real machine over a script whose `killed` task is the ping ----
const VENDOR = join(ROOT, 'vendor', 'dfu-quests');
const read = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '');
{
  const sources = {};
  for (const f of readdirSync(join(VENDOR, 'Tables'))) if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = read(join(VENDOR, 'Tables', f));
  loadQuestTables(sources);
}
// Runaway Pet's kill, as the script says it (M0B00Y17's `_S.03_`: `killed 1 _tiger_`, `say 1030`) - its Places need a
// world to resolve, so the Foe and the task stand alone here
const CORPUS = {
  __KK: ['Quest: __KK', 'QRC:', 'Message:  1030', ' Oops. You killed the tiger.', '', 'QBN:', 'Foe _tiger_ is Sabretooth_tiger', '',
    '_S.03_ task:', ' killed 1 _tiger_', ' say 1030', '', 'variable _pad_'],
};
const lists = { findQuestMeta: () => null, hasAcceptedOneTime: () => false, markOneTimeAccepted() {} };
function machine() {
  const m = new QuestMachine({ nowSeconds: () => 0, showPopup: (id) => { (m.said ??= []).push(id); }, world: null, lastNPCClicked: () => null, getQuestSourceLines: (n) => CORPUS[n] ?? null });
  return m;
}
const tigerOf = (m) => [...m.sharedCandidateNamed('__KK').resources.values()].find((r) => r.isFoe);
const triggered = (m) => [...m.sharedCandidateNamed('__KK').tasks.values()].find((t) => t.symbol?.name === 'S.03')?.triggered === true;

test('KEPT-KILL: the party pose carries `qk` - at most eight rows of a quest name, a Foe symbol and a stream number; a row out of its law is dropped, none omitted', () => {
  const pose = { px: 10, py: 20, h: 1, hm: 1, f: 1, fm: 1, m: 1, mm: 1 };
  assert.equal(validPartyPose(pose).qk, undefined, 'none: no field');
  assert.equal(validPartyPose({ ...pose, qk: [] }).qk, undefined, 'empty: no field');
  assert.deepEqual(validPartyPose({ ...pose, qk: [{ q: QUEST, s: 'tiger', i: 3, junk: 'x' }] }).qk, [{ q: QUEST, s: 'tiger', i: 3 }], 'a lawful row, projected');
  const bad = [null, [1], { q: QUEST, s: 'tiger' }, { q: QUEST, s: 'tiger', i: -1 }, { q: QUEST, s: 'tiger', i: 1.5 }, { q: QUEST, s: 'tiger', i: 2 ** 31 },
    { q: 'M0B00Y17<script>', s: 'tiger', i: 1 }, { q: QUEST, s: 'ti ger', i: 1 }, { q: '', s: 'tiger', i: 1 }, { q: QUEST, s: 'x'.repeat(49), i: 1 }, { q: 'Q'.repeat(81), s: 'tiger', i: 1 }];
  for (const r of bad) assert.equal(validPartyPose({ ...pose, qk: [r] }).qk, undefined, `refused: ${JSON.stringify(r)}`);
  assert.ok(validPartyPose({ ...pose, qk: [null, { q: QUEST, s: 'tiger', i: 1 }] }), 'a bad row never refuses the pose');
  const many = Array.from({ length: 12 }, (_, i) => ({ q: QUEST, s: 'tiger', i }));
  assert.equal(validPartyPose({ ...pose, qk: many }).qk.length, KEPT_KILL_POSE_MAX, 'bounded');
});

test('KEPT-KILL: every quest the game reads and every Foe it declares fits the row\'s law - a kill of any of them can be said', () => {
  let quests = 0, foes = 0;
  for (const dir of ['dfu-quests', 'roleplay-realism', 'warm-ashes-ships', 'foraging']) {
    for (const f of readdirSync(join(ROOT, 'vendor', dir, 'Quests'))) {
      if (!f.endsWith('.txt') || f.startsWith('QuestList-')) continue;
      const name = f.replace(/\.txt$/, '');
      assert.match(name, KEPT_KILL_QUEST_RE, `${dir}/${f}: its name`);
      quests++;
      for (const line of read(join(ROOT, 'vendor', dir, 'Quests', f)).split(/\r?\n/)) {
        const m = /^\s*Foe\s+(\S+)\s+is\s/i.exec(line);
        if (!m) continue;
        assert.match(getInnerSymbolName(m[1]), KEPT_KILL_SYMBOL_RE, `${dir}/${f}: Foe ${m[1]}`);
        foes++;
      }
    }
  }
  assert.ok(quests > 250 && foes > 100, `the corpus was read (${quests} quests, ${foes} Foes)`);
  assert.ok(read(join(VENDOR, 'Quests', `${QUEST}.txt`)).includes('Foe _tiger_ is Sabretooth_tiger'), 'Runaway Pet\'s tiger');
  assert.equal(getInnerSymbolName('_tiger_'), 'tiger', 'its symbol on the row');
});

test('KEPT-KILL: the ledger - the heir\'s rows ride its pose for the hold and no longer, eight at most; a member counts a kill once, by sight or by word, and remembers it past the hold', () => {
  const L = new KeptKillLedger();
  assert.equal(L.rows(0), null, 'nothing said: no field');
  assert.equal(L.said(null, 1, 0), false);
  assert.equal(L.said({ q: QUEST, s: 'tiger' }, 1.5, 0), false, 'a number, or nothing');
  L.said({ q: QUEST, s: 'tiger' }, 4, 1000);
  assert.deepEqual(L.rows(1000 + KEPT_KILL_HOLD_MS - 1), [{ q: QUEST, s: 'tiger', i: 4 }], 'held');
  assert.equal(L.rows(1000 + KEPT_KILL_HOLD_MS), null, 'and let go');
  for (let i = 0; i < 12; i++) L.said({ q: QUEST, s: 'rat' }, i, 2000);
  assert.deepEqual(L.rows(2000).map((r) => r.i), [4, 5, 6, 7, 8, 9, 10, 11], 'the newest eight');
  assert.ok(KEPT_KILL_MEMORY_MS > KEPT_KILL_HOLD_MS, 'a member remembers past the hold, so no repeat of a held row counts twice');
  assert.equal(L.credit('acct-b', QUEST, 'tiger', 4, 0), true, 'first');
  assert.equal(L.credit('acct-b', QUEST, 'tiger', 4, KEPT_KILL_HOLD_MS), false, 'the same kill, said again or seen');
  assert.equal(L.credit('acct-b', QUEST, 'tiger', 5, 0), true, 'another foe');
  assert.equal(L.credit('acct-c', QUEST, 'tiger', 4, 0), true, 'another holder');
  assert.equal(L.credit('acct-b', QUEST, 'tiger', 4, KEPT_KILL_MEMORY_MS), true, 'forgotten past the memory');
});

test('KEPT-KILL: the ping - Runaway Pet\'s `killed 1 _tiger_` fires on the owner\'s copy and every linked copy from the heir\'s word, wherever they stand, once; a copy that holds no such quest counts nothing', () => {
  const A = machine(), R = machine();
  const q = A.scheduleQuest(CORPUS.__KK, 0, { rolls: () => 0 });
  A.tick();
  A.markQuestShared('__KK');   // the owner shared it
  assert.ok(receiveSharedQuest(R, lists, '__KK', prepareQuestShare(A, q.uid).data).ok, 'a member took it');
  const solo = machine();   // a member who took it on their own: never linked, nothing of the party's to count
  solo.scheduleQuest(CORPUS.__KK, 0, { rolls: () => 0 });
  solo.tick();
  const rows = [{ q: '__KK', s: 'tiger', i: 3 }];
  for (const [m, n] of [[A, 1], [R, 1], [solo, 1]]) {   // DESYNC-ZERO: every holder of the quest in the party counts it
    const L = new KeptKillLedger();
    assert.equal(creditKeptKills(m, L, 'acct-heir', rows, 0), n);
    assert.equal(creditKeptKills(m, L, 'acct-heir', rows, 1000), 0, 'the pose repeats its rows: once');
    m.tick(); m.tick();
  }
  for (const m of [A, R, solo]) {
    assert.equal(tigerOf(m).killCount, 1, 'the kill');
    assert.equal(tigerOf(m).injuredTrigger, true, 'a kill is a blow landed');
    assert.equal(triggered(m), true, '`killed 1 _tiger_` - "Oops. You killed the tiger."');
  }
  // a witness counted the fall by sight first: the word that follows counts nothing
  const B = machine();
  B.scheduleQuest(CORPUS.__KK, 0, { rolls: () => 0 }); B.tick(); B.markQuestShared('__KK');
  const L = new KeptKillLedger();
  assert.equal(L.credit('acct-heir', '__KK', 'tiger', 3, 0), true, 'seen (the host\'s onPuppetDied asks the same ledger)');
  assert.equal(creditKeptKills(B, L, 'acct-heir', rows, 10), 0, 'then said: already counted');
});

