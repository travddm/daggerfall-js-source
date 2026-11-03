// B5-6-7 (AUDIT 25 blockers 5-7): the talk window's OTHER pages, and
// the static-NPC conversation that finally OPENS.
//
// The engine under the window has been ~95% ported since TK-v - the
// tree assembles listTopicTellMeAbout / Person / Thing, the pipeline
// answers every QuestionType - and the window mounted ONE of its five
// pages (Where-is > Location) while nativeTalk.js:"(:944-949), SetTalkModeWhereIs" pended the rest
// as INTERIM no-ops. "Any news?", "Where am I?", quest topics and
// work were computed and thrown away; every non-service static NPC
// answered "You get no response." over a fully-computed greeting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeTalkWindow, TALK_RECTS } from '../../../src/ui/native/nativeTalk.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const at = (r) => [r[0] + 1, r[1] + 1];

const mkHooks = () => {
  const state = { tone: 1, workAsked: 0 };
  return {
    state,
    categories: () => [{ label: 'Taverns', buildings: [{ label: 'The Howling Wolf' }] }],
    tellMeAboutTopics: () => [
      { label: 'Any news?', listItem: { questionType: 1 } },
      { label: 'Where am I?', listItem: { questionType: 2 } },
    ],
    peopleTopics: () => [{ label: 'Lord Bridwell', listItem: { questionType: 5 } }],
    thingsTopics: () => [],   // classic never implemented Things - EMPTY, verbatim
    workQuestion: () => 'Do you know of any work?',
    askWork: () => { state.workAsked++; return 'You might try the Odd Blades.'; },
    question: (row) => `About ${row.label}...`,
    answer: (row) => `${row.label}: an answer`,
    tone: () => state.tone,
    setTone: (t) => { state.tone = t; },
    npcName: 'Cims Ravel',
  };
};

test('B5: Tell me about opens the flat engine list and a pick asks through the same Q/A pair', () => {
  const w = new NativeTalkWindow('greeting', mkHooks());
  assert.ok(w.click(...at(TALK_RECTS.tellMeAbout)));
  assert.equal(w.topicMode, 'topics');
  assert.equal(w.topics.length, 2);
  // ROAD-D D10: one click SELECTS row 0 and fills the player-says
  // label; the pair needs the double click (or OKAY).
  // AUDIT 65 UI-1: the hosts dispatch `click(vx, vy, right, middle)`,
  // so the clock is stepped on the window's own `_now()` seam.
  let t = 1000;
  w._now = () => t;
  w.click(...at(TALK_RECTS.topicList));   // row 0: Any news?
  assert.equal(w.conversation.length, 1, 'one click asks nothing');
  assert.equal(w.question, 'About Any news?...');
  t = 2000;
  w.click(...at(TALK_RECTS.topicList), false, false);
  t = 2100;
  w.click(...at(TALK_RECTS.topicList), false, false);
  assert.equal(w.conversation.length, 3);   // greeting + question + answer
  assert.equal(w.conversation[1].kind, 'question');
  assert.equal(w.conversation[2].text, 'Any news?: an answer');
});

// ═══ AUDIT 58 (seams): SetListboxTopics REPAIRS every row it adds ═══
//
// DaggerfallTalkWindow.cs:863-872 runs, for EVERY row, before AddItem:
// a null caption falls back to the row's KEY, and an empty caption -
// originally, or after that fallback - becomes the localized
// `resolvingError`, which Internal_Strings.csv:582 spells
// `...never mind...`. The port drew the caption verbatim and carried
// no substitution anywhere, so a row the tree hands it with an empty
// caption came out as a zero-width, unlabelled - but selectable, and
// still answerable - gap in the list.
//
// The caption is reachable empty from the port's own assembler:
// topicTree's `captionString` starts '' and the NotSet arm never
// overwrites it, the Location arm's null test takes an EMPTY
// buildingName as the caption (quest/place.js builds dungeon and town
// siteDetails with `buildingName: ''`), and the Thing arm fills it
// only once the Item resource has minted its daggerfallUnityItem.
//
// The literal is DFU's, not the port's constant: change
// rumorMill.js's RESOLVING_ERROR and this pin still demands
// `...never mind...`.
test('AUDIT 58: an empty or null caption draws "...never mind...", never a blank row', () => {
  const hooks = mkHooks();
  // the tree's own ListItem - a CLASS in DFU (TalkManager.cs:159), so
  // the repair is a write-back the next reader sees
  const place = { questionType: 4, key: '_dungeon_', caption: '' };
  hooks.tellMeAboutTopics = () => [
    { label: '', listItem: place },                        // Place on a dungeon site: buildingName ''
    { label: null, listItem: { key: '_qgiver_' } },        // null caption -> "just try to take key"
    { label: null, listItem: { key: '' } },                // null caption AND empty key
    { label: 'Any news?', listItem: { questionType: 1 } }, // untouched
  ];
  const w = new NativeTalkWindow('greeting', hooks);
  assert.ok(w.click(...at(TALK_RECTS.tellMeAbout)));
  assert.deepEqual(w.topics.map((r) => r.label),
    ['...never mind...', '_qgiver_', '...never mind...', 'Any news?'],
    'the caption repair (DaggerfallTalkWindow.cs:863-872) did not run over every row');
  assert.equal(place.caption, '...never mind...',
    'DFU writes the repaired caption BACK onto the ListItem - it is a class, not a struct');
  // ...and UpdateQuestion builds the player-says line off the REPAIRED
  // label, because SetListboxTopics repairs before SelectIndex(0).
  assert.match(w.question, /never mind/,
    'the player-says label was built off the unrepaired empty caption');
});

test('B5: People is the flat person list; Things opens EMPTY (classic never implemented it)', () => {
  const w = new NativeTalkWindow('greeting', mkHooks());
  assert.ok(w.click(...at(TALK_RECTS.categoryPeople)));
  assert.equal(w.topics.length, 1);
  assert.equal(w.topics[0].label, 'Lord Bridwell');
  assert.equal(w.selected, 0, 'a filled list SelectIndex(0)s itself (:895-900)');
  assert.match(w.question, /Lord Bridwell/, 'and UpdateQuestion fills the player-says label');
  assert.ok(w.click(...at(TALK_RECTS.categoryThings)));
  assert.equal(w.topicMode, 'topics');
  assert.deepEqual(w.topics, []);
  // ClearItems -> SelectNone (ListBox.cs:532-537, :773-776), then the
  // setter's trailing UpdateQuestion(SelectedIndex) takes the
  // out-of-range arm (:1232-1236) and BLANKS the label - the People
  // question must not stay on screen over the empty Things page.
  assert.equal(w.selected, -1, 'an empty list leaves nothing selected');
  assert.equal(w.question, '', 'and the player-says label is cleared');
});

test('B6: Work clears the list, shows the question, and OKAY asks it (ButtonOkay :1534-1543)', () => {
  const h = mkHooks();
  const w = new NativeTalkWindow('greeting', h);
  assert.ok(w.click(...at(TALK_RECTS.categoryWork)));
  assert.equal(w.topicMode, 'work');
  assert.deepEqual(w.topics, []);
  assert.equal(w.question, 'Do you know of any work?');
  w.click(...at(TALK_RECTS.okay));
  assert.equal(h.state.workAsked, 1);
  assert.equal(w.conversation.at(-1).text, 'You might try the Odd Blades.');
  // ROAD-D D10: OKAY off the Work page asks the SELECTED topic
  // (ButtonOkay's else arm, SelectTopicFromTopicList :1547) - it was
  // a recorded no-op only while the window had no selection.
  w.click(...at(TALK_RECTS.tellMeAbout));
  assert.equal(w.selected, 0);
  w.click(...at(TALK_RECTS.okay));
  assert.equal(h.state.workAsked, 1, 'the Work hook is not asked again');
  assert.equal(w.conversation.at(-1).text, 'Any news?: an answer');
});

test('B5-6: a page whose hook is absent consumes the click and opens nothing (the pre-engine host)', () => {
  const h = mkHooks();
  delete h.tellMeAboutTopics; delete h.workQuestion;
  const w = new NativeTalkWindow('greeting', h);
  assert.ok(w.click(...at(TALK_RECTS.tellMeAbout)));
  assert.equal(w.topicMode, 'none');
  assert.ok(w.click(...at(TALK_RECTS.categoryWork)));
  assert.equal(w.topicMode, 'none');
});

test('MERGE: Where-is remembers the selected category (SetTalkModeWhereIs :960-971 re-runs SetTalkCategory)', () => {
  const h = mkHooks();
  const w = new NativeTalkWindow('greeting', h);
  w.click(...at(TALK_RECTS.categoryPeople));
  assert.equal(w.topicMode, 'topics');
  w.click(...at(TALK_RECTS.tellMeAbout));       // leave for Tell me about
  w.click(...at(TALK_RECTS.whereIs));           // back to Where-is
  assert.equal(w.topics[0].label, 'Lord Bridwell', 'People again, not Location - the C# category persists');
  // and the default arm is Location for a fresh window
  const w2 = new NativeTalkWindow('greeting', mkHooks());
  w2.click(...at(TALK_RECTS.whereIs));
  assert.equal(w2.topicMode, 'categories');
});

