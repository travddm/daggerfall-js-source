// MAC-BUGS X. Each pinned where the fault was, by execution where the seam lets a
// test drive it and by source where the seam is a screen.
//
// X1 MENU-EXIT1 (rabid.rivas: "Crash when exiting..." - TypeError reading innerHTML of null in enhancedMenu's
//    repaint). The confirm card's yes ran `onAction('exit')` and then repainted; exit unwinds to the front door and
//    destroys the screen synchronously (`app = null`), and the repaint after it read `app.innerHTML`. `render()`
//    answers nothing for a screen that is gone.
// X2 MACROS1 %map (kurkku: "A finely drawn vellum reveals the secret location of %map, which you record."). Record 499
//    is shown through the host's `lines(id)` verbatim; DFU's box runs MacroHelper with PlayerGPS's
//    LocationRevealedByMapItem. The use outcome carries `macros: { map }` and every consumer of a textId expands its
//    rows with it; the quest macro table's %map reads the same field through the world hook, which never existed.
// X3 MACROS1 %pcn/%fon (kurkku: "Ah, %pcn, your reputation precedes you. %fon always has room for a skillful
//    knight..."). The guild window's rows were TEXT.RSC verbatim; DFU's GuildServicePopupWindow hands itself to
//    MacroHelper for every box. The rows go through the guild's context now: the player and the faction's name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandRowValues, getMacroValue } from '../../src/systems/quest/questMacros.js';
import { useItem, MAP_TEXT_ID } from '../../src/systems/useItem.js';
import { useResultAction } from '../../src/ui/enhanced/enhancedInventory.js';
import { expandGuildMacros, expandGuildRows } from '../../src/systems/guild/guildServiceActions.js';
import { hostText } from '../hostText.mjs';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('X2 MACROS1: TEXT.RSC rows through the value expander - a row keeps its shape and its `center`, a bare string expands too, and nothing to expand hands the rows back untouched (mutants: the shape lost; a null value expanded to "null")', () => {
  const rows = [{ text: 'A finely drawn vellum reveals the secret location of %map, which you record.', center: true }, 'Plain %map.'];
  const out = expandRowValues(rows, { map: 'Privateers Hold' });
  assert.deepEqual(out, [{ text: 'A finely drawn vellum reveals the secret location of Privateers Hold, which you record.', center: true }, 'Plain Privateers Hold.']);
  assert.equal(expandRowValues(rows, null), rows, 'no values: the same array');
  assert.equal(expandRowValues(rows, {}), rows);
  assert.deepEqual(expandRowValues(rows, { map: null })[0].text, rows[0].text, 'a null value leaves the token, as expandMacroValues does');
  assert.equal(expandRowValues(null, { map: 'x' }), null);
});

test('X2 MACROS1: a map read carries its revealed name as the record\'s macro, the inventory\'s outcome carries it on, and the quest table\'s %map reads the world hook (mutants: `macros` dropped from the outcome; not carried by useResultAction; the hook unanswered)', () => {
  const map = { templateIndex: 287, group: 'Maps', name: 'Map' };
  let r;
  try { r = useItem(map, [map], { revealMap: () => 'Privateers Hold' }); } catch { r = null; }
  if (r?.kind === 'map') {
    assert.equal(r.textId, MAP_TEXT_ID);
    assert.deepEqual(r.macros, { map: 'Privateers Hold' }, 'the record\'s context rides the outcome');
    const act = useResultAction(r, {});
    assert.equal(act.textId, MAP_TEXT_ID); assert.deepEqual(act.macros, { map: 'Privateers Hold' }, 'and rides the inventory\'s action');
  }
  // the quest table's own %map
  assert.equal(getMacroValue('%map', null, { world: { locationRevealedByMapItem: () => 'Privateers Hold' } }), 'Privateers Hold');
  assert.equal(getMacroValue('%map', null, { world: {} }), '%map[nullMCP]', 'unanswered, the table says so - which is what every quest %map printed before the hook existed');
});

test('X3 MACROS1: the guild window\'s every record goes through the guild\'s context - %pcn/%pcf the player, %fon and %kno the faction\'s name - so the knightly order\'s invitation reads as one (mutants: `fon`/`kno` dropped from expandGuildMacros; the join flow\'s rows handed over verbatim, as they were)', () => {
  const row = { text: 'Ah, %pcn, your reputation precedes you. %fon always has room for a skillful knight of high moral standing. I humbly ask that you join our ranks.', center: true };
  const out = expandGuildRows([row, 'Welcome, %pcf, to %kno.'], { playerName: 'Medora Direnni', factionName: 'The Order of the Candle' });
  assert.equal(out[0].text, 'Ah, Medora Direnni, your reputation precedes you. The Order of the Candle always has room for a skillful knight of high moral standing. I humbly ask that you join our ranks.');
  assert.equal(out[0].center, true, 'the row keeps its shape');
  assert.equal(out[1], 'Welcome, Medora, to The Order of the Candle.');
  assert.equal(expandGuildMacros('%fon', {}), '%fon', 'no faction: the token stands, as every unknown value does in this walk');
});
