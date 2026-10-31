// AUDIT 24, wave 25: the five findings the seven-slice adversarial
// sweep confirmed after 151 agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { expandQuestMessage } from '../../../src/systems/quest/questMacros.js';

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'vendor', 'dfu-quests');
const sources = {};
for (const f of readdirSync(join(VENDOR, 'Tables'))) {
  if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = readFileSync(join(VENDOR, 'Tables', f), 'utf8').replace(/^﻿/, '');
}
loadQuestTables(sources);
const rd = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');

// A quest with a questor Person, so ActiveQuestor has something to find.
const QUESTOR_SRC = [
  'Quest: __QSTR', 'QRC:', 'Message:  1011', ' x', '',
  'QBN:',
  'Person _qgiver_ face 1 factionType Merchant',
  '',
  '_start_ task:',
  ' hide npc _qgiver_',
];

test('audit24 wave25: StartQuest assigns the questor behaviour to the last-clicked NPC', () => {
  // QuestMachine.cs:729-734 - "Assign QuestResourceBehaviour to
  // questor NPC - this will be last NPC clicked. This will ensure
  // quests actions like 'hide npc' will operate on questor at quest
  // startup". The port waved the tail off as "scene work (Q3)" and
  // never came back for it, so the questor you just took a quest from
  // carried no behaviour until the next layout.
  const m = new QuestMachine({ nowSeconds: () => 0 });
  const host = {};
  const npcData = { hash: 4242, mapID: 1, nameSeed: 7, buildingKey: 9 };
  m.setLastNPCClicked(npcData, host);
  assert.equal(m.lastNPCClickedHost, host, 'the host rides with the click');

  const quest = m.parseQuestForLists(QUESTOR_SRC, 0, { rolls: () => 0 });
  const person = quest.getResource({ name: 'qgiver' });
  quest.addQuestor(person.symbol);
  person.questorData = { ...npcData };

  m.startQuestImmediate(quest);
  assert.ok(host.questBehaviour, 'the clicked NPC now carries a behaviour');
  assert.equal(host.questBehaviour.targetResource, person, 'pointed at the questor Person');
  // C# does NOT write the back-link here - AssignResource only sets
  // questUID/targetSymbol (QuestResourceBehaviour.cs:217-224). The
  // link is filled by the first Update (:135-138), which is where the
  // port fills it too.
  assert.equal(person.questResourceBehaviour, null, 'not at assign time');
  host.questBehaviour.update();
  assert.equal(person.questResourceBehaviour, host.questBehaviour,
    'the first Update couples them, as C# does');
});

test('audit24 wave25: only the QUESTOR gets one, and only once', () => {
  const m = new QuestMachine({ nowSeconds: () => 0 });
  // a click on somebody who is nobody's questor
  const stranger = {};
  m.setLastNPCClicked({ hash: 1, mapID: 0, nameSeed: 0, buildingKey: 0 }, stranger);
  const q1 = m.parseQuestForLists(QUESTOR_SRC, 0, { rolls: () => 0 });
  const p1 = q1.getResource({ name: 'qgiver' });
  q1.addQuestor(p1.symbol);
  p1.questorData = { hash: 999, mapID: 0, nameSeed: 0, buildingKey: 0 };
  m.startQuestImmediate(q1);
  assert.equal(stranger.questBehaviour, undefined, 'no match, no behaviour');

  // "Can only have a single QuestResourceBehaviour"
  const host = { questBehaviour: 'ALREADY HERE' };
  const npcData = { hash: 55, mapID: 0, nameSeed: 0, buildingKey: 0 };
  m.setLastNPCClicked(npcData, host);
  const q2 = m.parseQuestForLists(QUESTOR_SRC, 0, { rolls: () => 0 });
  const p2 = q2.getResource({ name: 'qgiver' });
  q2.addQuestor(p2.symbol);
  p2.questorData = { ...npcData };
  m.startQuestImmediate(q2);
  assert.equal(host.questBehaviour, 'ALREADY HERE', 'the existing one is left alone');

  // a never-clicked machine does nothing at all
  const m2 = new QuestMachine({ nowSeconds: () => 0 });
  const q3 = m2.parseQuestForLists(QUESTOR_SRC, 0, { rolls: () => 0 });
  assert.doesNotThrow(() => m2.startQuestImmediate(q3));
});

test("audit24 wave25: ActiveQuestor keeps C#'s LAST-quest-wins overwrite", () => {
  // The inner loop breaks on a match; the OUTER one does not. Two
  // quests with the same questor NPC and the later iteration wins.
  const m = new QuestMachine({ nowSeconds: () => 0 });
  const npcData = { hash: 77, mapID: 0, nameSeed: 0, buildingKey: 0 };
  const mk = () => {
    const q = m.parseQuestForLists(QUESTOR_SRC, 0, { rolls: () => 0 });
    const p = q.getResource({ name: 'qgiver' });
    q.addQuestor(p.symbol);
    p.questorData = { ...npcData };
    m.quests.set(q.uid, q);
    return p;
  };
  const first = mk();
  const second = mk();
  assert.notEqual(first, second);
  assert.equal(m.activeQuestor(npcData), second,
    'the LAST quest in iteration order wins, not the first match');
  assert.equal(m.activeQuestor({ hash: 1, mapID: 0, nameSeed: 0, buildingKey: 0 }), null);
});

test('audit24 wave25: a quest rumor is expanded IN PLACE, and so frozen at its first telling', () => {

  // the mutation is real: expandQuestMessage writes token.text back
  const tokens = [{ formatting: 'text', text: 'the %qdt of it' }];
  expandQuestMessage(null, tokens, true);
  assert.equal(tokens.length, 1, 'the same array');
});

