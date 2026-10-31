// TWO PARITY DETAILS B1-B7 MISSED, caught by the AUDIT 25 lane's
// reading of the same C# and folded back after the merge.
//
// 1. THE DUNGEON QUEST-FLAT ANCHOR. AddQuestNPC raises the billboard
//    by half its height `if (!inDungeon)` (GameObjectHelper.cs:
//    1032-1036). DFU's billboard is CENTRE-anchored, so that puts the
//    base ON the marker inside a building and half a height BELOW it
//    inside a dungeon. This port's shader is BOTTOM-anchored (position
//    = base - the C11 law stated at dungeonContext.js:"actions.onTrespass", learned
//    when a centre-anchor holdover floated every corpse), so the same
//    visual result needs the shift on the DUNGEON side. It is the very
//    shift the dungeon's own RDB flats already take
//    (dungeonContext.js:"(systems/mysticism.js)") and that a building's flats correctly do
//    not (interiorContext.js passes its centers through).
//
//    B2 stood dungeon quest flats at the raw marker y, so every quest
//    NPC and item in a dungeon hung half a sprite too high. Nothing
//    caught it because nothing pinned the anchor - and a distant
//    screenshot passes a half-height float exactly as it passed a
//    vertically flipped billboard for six milestones.
//
// 2. ALIGNBILLBOARDTOGROUND (GameObjectHelper.cs:335-345), which
//    AddQuestNPC calls with distance 4, was absent from BOTH arms.
//    AUDIT 26 F068 corrected this header: AddQuestItem does NOT call
//    it - it never rays at all (:1128-1141) - so the two resources
//    are stood by different laws and only the NPC aligns.
//
// 3. THE TALK WINDOW'S CATEGORY GATE. All four category handlers open
//    with `if (selectedTalkOption == TalkOption.WhereIs)` and play the
//    click sound INSIDE that gate (:1465-1498) - so while
//    Tell-me-about is selected those buttons do nothing AND make no
//    sound. B5-6 fired them unconditionally. The sound's placement is
//    the tell that DFU treats them as genuinely disabled, not merely
//    unhelpful.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeTalkWindow, TALK_RECTS } from '../../../src/ui/native/nativeTalk.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');

/** A window over recording hooks; clicks are in native 320x200 space. */
function makeWindow() {
  const sounds = [];
  const w = new NativeTalkWindow('Greetings.', {
    categories: () => [{ label: 'Taverns', buildings: [{ label: 'The Rusty Dagger', listItem: {} }] }],
    tellMeAboutTopics: () => [{ label: 'Any news?', listItem: {} }],
    peopleTopics: () => [{ label: 'Brisienna', listItem: {} }],
    thingsTopics: () => [],
    workQuestion: () => 'Any work?',
    question: (r) => `Q:${r.label ?? 'work'}`,
    answer: (r) => `A:${r.label ?? 'work'}`,
    tone: () => 1, setTone: () => {}, onClose: () => {},
  });
  w._sounds = sounds;
  return w;
}
const clickAt = (w, [x, y, cw, ch]) => w.click(x + Math.floor(cw / 2), y + Math.floor(ch / 2));

test('questflatanchor: a category click while Tell-me-about is selected changes nothing', () => {
  const w = makeWindow();
  clickAt(w, TALK_RECTS.tellMeAbout);
  const before = { mode: w.topicMode, rows: w.topics.map((t) => t.label), cat: w._lastCategory };
  for (const rect of [TALK_RECTS.categoryLocation, TALK_RECTS.categoryPeople,
    TALK_RECTS.categoryThings, TALK_RECTS.categoryWork]) {
    assert.equal(clickAt(w, rect), true, 'the window still swallows the click');
  }
  assert.equal(w.topicMode, before.mode, 'the page did not change');
  assert.deepEqual(w.topics.map((t) => t.label), before.rows, 'nor the rows');
  assert.equal(w._lastCategory, before.cat, 'nor the remembered category');
});

test('questflatanchor: Where-is re-enables the categories, and restores the one last used', () => {
  const w = makeWindow();
  clickAt(w, TALK_RECTS.categoryPeople);
  assert.equal(w._lastCategory, 'people');
  clickAt(w, TALK_RECTS.tellMeAbout);
  assert.equal(w._talkOption, 'tellMeAbout');
  clickAt(w, TALK_RECTS.whereIs);
  assert.equal(w._talkOption, 'whereIs', 'Where-is puts the option back');
  assert.deepEqual(w.topics.map((t) => t.label), ['Brisienna'],
    'and SetTalkCategory(selectedTalkCategory) returns to People, not Location');
  // The categories answer again.
  clickAt(w, TALK_RECTS.categoryLocation);
  assert.equal(w.topicMode, 'categories', 'the gate is open once more');
});
