// SLOTS1 (Mac, 2026-09-12: "multiple save slots and then the ability
// to choose which save to use in online"). THE LIST EXECUTES: every
// restorable slot most recent first, the stale-version one skipped,
// the most-recent question riding the same walk; the front door's
// pick seams hand a key and a name over ONCE; the doors that act on
// them are pinned by source - main.js's enhanced branch (the key ->
// ?loadkey under the set-or-delete law), the pause door (the name ->
// the host's saveAs, the key -> its loadKey, behind the two verbs the
// MAC1 pin reads), and the three panes (Load and Online a card per
// slot, Save a slot name that overwrites or opens a new slot).
// Mutants: the list unsorted, the stale save listed, a pick taken
// twice, the key set on Continue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { restorableSaves, mostRecentRestorable, saveSlot, SAVE_INFO_PREFIX } from '../../../src/systems/save/saveSlots.js';
import { SAVE_VERSION } from '../../../src/systems/save/save.js';
import { takePickedSaveKey, takePickedSaveName } from '../../../src/ui/enhanced/enhancedMenu.js';

const rd = (p) => readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');

function mockStorage() {
  const m = new Map();
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
  };
}

test('SLOTS1: restorableSaves lists every slot this build can restore, most recent first, with its info and snap; the stale-version slot is skipped; mostRecentRestorable is its head (mutants: unsorted, the stale save listed)', () => {
  const s = mockStorage();
  saveSlot('Alaric', 'QuickSave', { v: SAVE_VERSION, name: 'Alaric', classicMinutes: 10 }, { storage: s, now: 100 });
  saveSlot('Alaric', 'Before the crypt', { v: SAVE_VERSION, name: 'Alaric', classicMinutes: 20 }, { storage: s, now: 300 });
  saveSlot('Beth', 'QuickSave', { v: SAVE_VERSION, name: 'Beth', classicMinutes: 5 }, { storage: s, now: 200 });
  saveSlot('Old', 'QuickSave', { v: SAVE_VERSION - 1, name: 'Old', classicMinutes: 1 }, { storage: s, now: 999 });
  const list = restorableSaves(s);
  assert.deepEqual(list.map((e) => [e.info.characterName, e.info.saveName, e.info.dateAndTime.realTime]),
    [['Alaric', 'Before the crypt', 300], ['Beth', 'QuickSave', 200], ['Alaric', 'QuickSave', 100]], 'most recent first, the stale-version slot (newest of all) left out');
  assert.equal(list[0].snap.classicMinutes, 20); assert.equal(typeof list[0].key, 'number');
  assert.deepEqual(mostRecentRestorable(s), { key: list[0].key, snap: list[0].snap }, 'the most-recent question is the list\'s head');
  s.removeItem(SAVE_INFO_PREFIX + list[0].key);
  assert.equal(restorableSaves(s).length, 2, 'a slot without its info is no slot (the SaveInfo-must-exist law)');
  assert.deepEqual(restorableSaves(mockStorage()), []);
});

test('SLOTS1: the pick seams hand a key and a name over once (mutant: a pick taken twice boots the next Continue into the wrong save)', () => {
  assert.equal(takePickedSaveKey(), null); assert.equal(takePickedSaveName(), null);
});

