// FONT-PICK (FIELD BUGS 2026-10-13, a player on Gentoo Linux with the Niri compositor under Wayland: "the font selector is
// a bit buggy on my setup as it has no scrolling ability ... I have 376 fonts recognized by DFO") - pinned. The installed
// font's list was the browser's own <datalist> popup, a surface the system draws outside the page: it ran off the screen
// and took no wheel there. It is the page's own list now - under the field, a fixed height that scrolls, filtered by what
// is typed, each name in its own face, picked by a click or Enter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fontMatches } from '../../../src/ui/textFont.js';

test('FONT-PICK the filter: nothing typed (or the name worn) shows every font; a typed piece shows the names holding it, those beginning with it first, case aside (mutants: the order, the case, the worn name)', () => {
  const fams = ['Arial', 'Bitstream Vera Sans', 'DejaVu Sans', 'DejaVu Serif', 'Noto Sans', 'Sans Forgetica'];
  assert.deepEqual(fontMatches(fams, ''), fams);
  assert.deepEqual(fontMatches(fams, '   '), fams);
  assert.deepEqual(fontMatches(fams, 'DejaVu Sans'), fams, 'the field opens on the name worn: the whole list');
  assert.deepEqual(fontMatches(fams, 'sans'), ['Sans Forgetica', 'Bitstream Vera Sans', 'DejaVu Sans', 'Noto Sans'], 'beginning with it first, then holding it');
  assert.deepEqual(fontMatches(fams, 'DEJA'), ['DejaVu Sans', 'DejaVu Serif']);
  assert.deepEqual(fontMatches(fams, 'zzz'), []);
  const many = Array.from({ length: 376 }, (_, i) => `Font ${String(i).padStart(3, '0')}`);
  assert.equal(fontMatches(many, '').length, 376, 'every one of a long list');
});

