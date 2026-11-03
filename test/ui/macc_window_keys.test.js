// ---------------------------------------------------------------------------
// MAC-C - THE TWO WINDOW KEYS.
//
// TWO FAULTS, ONE ROOT. The pack's key arm read `e.key !== 'F6'` - the DFU
// DEFAULT spelled as a literal - and the sheet had no key arm at all,
// because PX27 made the enhanced sheet the pause window's Stats page and
// `enhancedMenu`'s capture handler answers exactly one key: Escape, the
// back stack's. That is right for the pause face it shares (F5 must not
// close a paused game), which is why the arm belongs on the OVERLAY F5
// opened rather than in the screen it happens to wear.
//
// The literal is the same bug I2 and FIX-F each found once already: a
// player who rebinds Inventory gets a pack that opens on their key and
// closes on Bethesda's. Both keys come off the REGISTRY now, in all three
// windows that answer them (the enhanced pack, the enhanced sheet page,
// and the classic canvas sheet).
//
// And the cross-over is the same law read sideways: a window key that
// names ANOTHER window closes this one and opens that one, in that order,
// because `showOverlay` REPLACES the host's single slot. The sheet already
// had the door (its own Items button); the pack needed one, so every host
// hands it the same `openCharSheet` it already hands `openSpellbook`.
// ---------------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setBindings } from '../../src/ui/input.js';
import { createBindings, resetDefaults, setBinding } from '../../src/systems/inputActions.js';
import { CharSheet } from '../../src/ui/charsheet.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const defaults = () => { const b = createBindings(); resetDefaults(b); return b; };

test('MAC-C: the classic sheet closes on the BOUND sheet key, not on the literal F5', () => {
  setBindings(defaults());
  const entity = { name: 'Mac', skills: {}, stats: {}, level: 1 };
  const sheet = new CharSheet(entity, {});
  assert.equal(sheet.done, false);
  sheet.input('F5');
  assert.equal(sheet.done, true, 'the default still closes it');

  // ...and a REBIND moves the key with it, which the literal could not.
  const b = defaults();
  setBinding(b, 'KeyP', 'CharacterSheet', true);
  setBindings(b);
  const rebound = new CharSheet(entity, {});
  rebound.input('F5');
  assert.equal(rebound.done, false, 'F5 is nobody’s key now');
  rebound.input('KeyP');
  assert.equal(rebound.done, true, 'and the player’s key closes their sheet');
});

test('MAC-C: the classic sheet CROSSES OVER to the pack, and only with a door', () => {
  setBindings(defaults());
  const entity = { name: 'Mac', skills: {}, stats: {}, level: 1 };
  let opened = 0;
  const sheet = new CharSheet(entity, { inventory: () => { opened++; } });
  sheet.input('F6');
  assert.equal(opened, 1, 'the pack key opened the pack');
  assert.equal(sheet.done, true, '...and closed the sheet first');

  // a host that hands no pack gets a key that falls through - the same
  // honest refusal the sheet's own Items button gives.
  const noDoor = new CharSheet(entity, {});
  noDoor.input('F6');
  assert.equal(noDoor.done, false, 'no door, no key');
});

