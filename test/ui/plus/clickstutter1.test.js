// CLICK-STUTTER, OW-DUNGEON-DOT, GRIM-MARKS. A click in the world restyles nothing and asks no lock the canvas holds (the lock half is pinned in
// macfive's PL3 and fb1002_herbcursor_audit's A4/B4); a found dungeon in the Overworld's grid is the dungeons' mark and
// switch; the Grimoire compass's marks stand on its parchment, not under its frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markGroup } from '../../../src/systems/travel/travelViewFilters.js';
import { installPlusCursor } from '../../../src/ui/plus/plusCursor.js';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('CLICK-STUTTER the press frame is not worn while the pointer is locked - no class on <html>, so no restyle of the page; unlocked, worn once and taken off (mutant: the lock unread)', () => {
  const classes = new Set();
  const root = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
  const listeners = {};
  const win = { addEventListener: (t, f) => { listeners[t] = f; } };
  const doc = { documentElement: root, defaultView: win, pointerLockElement: null };
  installPlusCursor(doc);
  doc.pointerLockElement = { canvas: true };
  listeners.pointerdown({ pointerType: 'mouse' });
  assert.equal(classes.has('plus-press'), false, 'a swing in the world wears nothing');
  doc.pointerLockElement = null;
  listeners.pointerdown({ pointerType: 'mouse' });
  assert.equal(classes.has('plus-press'), true, 'a press on a window wears the frame');
  listeners.pointerup({});
  assert.equal(classes.has('plus-press'), false);
  listeners.pointerdown({ pointerType: 'touch' });
  assert.equal(classes.has('plus-press'), false, 'a touch never');
});

test('OW-DUNGEON-DOT a found dungeon\'s plate in the grid is the dungeons\' - its mark the arch, its switch Dungeons; a town\'s plate stays the towns\' (mutant: the dungeon word unread)', () => {
  assert.equal(markGroup('place dungeon'), 'dungeons');
  assert.equal(markGroup('place'), 'towns');
  assert.equal(markGroup('far dungeon'), 'dungeons');
});

