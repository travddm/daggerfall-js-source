// PX24 - THE CHRONICLE: the logbook and the history as ONE window.
//
// Mac: "with the logbook and history, I want them as one detailed UI."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chronicleModel, chronicleLines, chronicleEntry, CHRONICLE_SECTIONS } from '../../../src/ui/enhanced/enhancedChronicle.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const T = (text) => ({ formatting: 'text', text });

test('MAC-K2: FOUR sections, and QUESTS leads them - the L key opens what it is named for', () => {
  // THE PIN THAT HAD TO BE REVERSED. It read "three sections, and
  // QUESTS are deliberately not among them", and asserted
  // `doesNotMatch(cr, /questLog/)` - the defect written down as a law.
  // The reasoning behind it was about duplication and it was sound;
  // what it got wrong was WHICH DOOR. `LogBook` is InputManager's own
  // name for the L key, this is the window it opens, and what a player
  // pressing it got was their notebook. Mac, 2026-09-15: "Logbook not
  // reflecting quests."
  assert.deepEqual(CHRONICLE_SECTIONS.map(([id]) => id), ['quests', 'notes', 'messages', 'history']);
  assert.equal(CHRONICLE_SECTIONS[0][1], 'Quests', 'and it leads, because it is what the key is for');

  const ids = new Set(CHRONICLE_SECTIONS.map(([id]) => id));
  for (const want of ['quests', 'notes', 'messages']) assert.ok(ids.has(want), want);

});

test('PX24 model: each section from its own source, and the orders differ on purpose', () => {
  const nb = {
    getNotes: () => [[T('a note')], [T('another')], []],
    getMessages: () => [[T('first')], [T('second')]],
  };
  const m = chronicleModel({ notebook: () => nb, entity: { backStory: ['line one', '', 'line two'] } });
  assert.deepEqual(m.notes.map((e) => e.body), [['a note'], ['another']], 'an empty entry is dropped');
  assert.deepEqual(m.messages.map((e) => e.body), [['first'], ['second']]);
  assert.deepEqual(m.history, ['line one', 'line two'], 'backStory is already lines');
  // No notebook at all is not a crash - a host may open this before one exists.
  assert.deepEqual(chronicleModel({}), { quests: [], notes: [], messages: [], history: [] });

  // MAC-K2: THE QUESTS SECTION, driven. One entry per quest, the title
  // as its head and the trail as its body, NEWEST STEP FIRST - the log
  // arrives oldest-first from the machine and the last thing you were
  // told is the thing you opened the window for.
  const q = chronicleModel({
    questLog: () => ({
      active: [
        { id: 7, name: 'Main Quest: Lysandus\u2019 Revenge', questName: 'S0000011', messages: [[T('go to Daggerfall')], [T('find the ghost')]] },
        { id: 8, name: 'A Rat Problem', questName: 'M0B00Y00', messages: [[T('kill the rats')]] },
        { id: 9, name: 'Silent', questName: 'M0B00Y01', messages: [] },
      ],
      finished: [[{ formatting: 'highlight', text: 'The Riddle completed at 3 Hearthfire:' }, T('you solved it')]],
    }),
  });
  assert.deepEqual(q.quests.map((e) => e.head),
    ['Lysandus\u2019 Revenge', 'A Rat Problem', 'The Riddle \u2014 completed 3 Hearthfire'],
    'the kind label comes off the title, and the archive follows the live ones');
  assert.deepEqual(q.quests[0].body, ['find the ghost', 'go to Daggerfall'], 'newest step first');
  assert.deepEqual(q.quests[2] && q.quests[2].body, ['you solved it']);
  assert.equal(q.quests.length, 3, 'a quest that has written NOTHING is not a row - the machine says so, not this window');
  // and a host with no quest source at all is not a crash and not a lie
  assert.deepEqual(chronicleModel({ questLog: () => null }).quests, []);
  assert.deepEqual(m.notes.map((e) => e.head), [null, null], 'no highlight, no head - and that is honest');
  // The token flattener is the journal's own set.
  assert.deepEqual(chronicleLines([T('x'), { formatting: 'nope', text: 'y' }]), ['x']);
  assert.deepEqual(chronicleLines(null), []);
});

// ── PX24b: THE FIRST DRAFT WAS THIN, AND LOST TWO THINGS ──────────
// Mac: "you can do better than this." He was right on both counts.
test('PX24b: an entry keeps its DATED HEAD - the notebook wrote one and the first draft dropped it', () => {
  // PlayerNotebook._createNote puts a HIGHLIGHT token first: the
  // dated header, from the host's own clock and city (notebook.js:"this.deps.dateTimeString?.()").
  // Flattening every token to a string turned that into just another
  // line, and the window numbered entries 1, 2, 3 instead.
  const H = (text) => ({ formatting: 'highlight', text });
  const e = chronicleEntry([H('11 Frostfall, 3E 405 in Daggerfall:'), T('The smith owes me a favour.')]);
  assert.deepEqual(e, { head: '11 Frostfall, 3E 405 in Daggerfall:', body: ['The smith owes me a favour.'] });
  // A CONTINUATION page files with NO header (notebook.js:"if ((note.length - 2) >= (MAX_LINES_SMALL * 2))".."this.notes.push(note);") and
  // comes back headless rather than borrowing the previous one.
  assert.deepEqual(chronicleEntry([T('...and the rest of it.')]), { head: null, body: ['...and the rest of it.'] });
  assert.deepEqual(chronicleEntry(null), { head: null, body: [] });
});

// ── PX24d: A DOOR WITH NO CALLERS IS UNREACHABLE UI ───────────────
// Mac: "the new chronicles UI is nowhere to be found ingame." It was
// not: PX24 built ui/chronicleDoor.js and the window behind it and
// then hung the door on NOTHING - zero callers - so every host still
// constructed the classic QuestJournalWindow directly, and PX25's
// Chronicle button on the Stats page opened the classic journal.
test('PX24d: EVERY enhanced door has a host that calls it', () => {
  // The general law, so the next unhung door fails here rather than in
  // play. A door module exists to be the ONE way in; one with no
  // caller is a window nobody can reach.
  const hosts = ['src/scenes/world.js', 'src/scenes/exterior.js',
    'src/scenes/dungeonContext.js', 'src/scenes/worldModes.js'].map(read).join('\n');
  for (const [door, fn] of [
    ['chronicleDoor', 'createChronicleWindow'],
    ['spellbookDoor', 'createSpellbookWindow'],
    ['charSheetDoor', 'createCharSheetWindow'],
    ['inventoryDoor', 'createInventoryWindow'],
    ['pauseDoor', 'openPauseFlow'],
  ]) {
    assert.ok(hosts.includes(`${fn}(`), `${door}: no host calls ${fn} - the door opens on nothing`);
    assert.ok(hosts.includes(`from '../ui/${door}.js'`), `${door} is imported by a host`);
  }
});

