// FIELD BUGS 2026-10-18c, STAKE-ROW, and AUDIT STAKE-ROW (bible/01-Overview/bugs/Field-Bugs-2026-10-18c.md,
// bible/01-Overview/audits/Audit-Stake-Row.md; Mac: "The top option doesnt work when using the weird key", then "Weir key",
// then "It can be tapped"): the start window's word rows - the stake ("Weir Keys: 3 - one will be staked."), the keyless
// line and the quest warning - are words, not choices; picked, the port's list picker (ui/listPicker.js `_pick`) has
// already closed itself and the host drains it, so the window asks its list again - never no window and a flow that
// still asks. And the audit's siblings in the same flow: the question's No brings the list back (its box still holds the
// slot when it answers); a list put off the screen unpicked cancels the window once; the key used from the pack closes
// the pack, so its window has the screen.
//
// THE SHAPE THE PRODUCER MINTS (Home.md): the real townTalk (scenes/townTalk.js createTownTalk - the street's slot);
// worldModes.js's mountSpellWindow, closeSpellWindow and topWindow read out of the source and run over it in the street's
// arm; world.js's egWindowSlot and its start window's list and question doors read out of the source and run over those
// (ui/eliteGates/egStartWindow.js egStartListDoors over the real ListPickerWindow, egStartAsk over the real
// YesNoBoxWindow); keys through townTalk.keydown, and the enhanced skin's row press itself (ui/enhanced/enhancedPicker.js
// pickRow -> replayClick -> townTalk.pointerdown).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTownTalk } from '../../../src/scenes/townTalk.js';
import { ListPickerWindow, PICKER_X, PICKER_Y, PICKER_RECTS, _setListPickerArtForTests, listPickerArtLoaded } from '../../../src/ui/listPicker.js';
import { YesNoBoxWindow } from '../../../src/ui/yesNoBox.js';
import { pickRow } from '../../../src/ui/enhanced/enhancedPicker.js';
import { useResultAction } from '../../../src/ui/enhanced/enhancedInventory.js';
import { nativeMetrics } from '../../../src/ui/native/nativePanel.js';
import { openEgStartWindow, egStartAsk, egStartListDoors } from '../../../src/ui/eliteGates/egStartWindow.js';
import { EG_TEXT } from '../../../src/net/eliteGates/egLaw.js';
import { weirKeys, setWeirKeyOpener } from '../../../src/systems/eliteGates/weirKey.js';
import { useItem } from '../../../src/systems/useItem.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
function grab(src, re, what) {
  const m = re.exec(src);
  assert.ok(m, `${what} is no longer where this pin reads it`);
  return m.slice(1);
}
const ME = 'acct-mac';
const tick = () => new Promise((r) => setImmediate(r));

test('AUDIT STAKE-ROW L1-U1, L2-3: the list\'s doors - a list put off the screen unpicked cancels the window once; a mount refused, or no list to ask with, cancels it on the next tick (mutants: no leave guard; a refused mount or a missing list said nothing)', async () => {
  const other = { draw() {}, input() {}, done: false };
  // ...and once at the door itself, whatever its occupant guards
  let told = 0;
  const lone = egStartListDoors({ ready: () => true, makeList: () => ({}), slot: { top: () => null, mount: () => true, close() {} } }).openList([], () => {}, () => told++);
  lone.dispose(); lone.dispose();
  assert.equal(told, 1, 'the door tells a leave once');
  await tick();
  _setListPickerArtForTests(null);
  await tick();
});

test('AUDIT STAKE-ROW L1-2: the Weir Key used from the pack closes the pack when its start window will ask (the opener\'s empty line), so the window has the screen; a line said leaves the pack up, and the enhanced pack reads the close (mutant: the pack left up - the window refused, unsaid)', () => {
  const entity = { items: [], wagonItems: [] };
  const use = () => useItem(weirKeys(1), entity.items, { entity });
  try {
    setWeirKeyOpener(() => '');
    assert.deepEqual(use(), { kind: 'text', text: '', closesWindow: true }, 'the window will ask: the pack closes');
    setWeirKeyOpener(() => EG_TEXT.opening);
    assert.deepEqual(use(), { kind: 'text', text: EG_TEXT.opening, closesWindow: false }, 'a line: the pack shows it');
    setWeirKeyOpener(null);
    assert.deepEqual(use(), { kind: 'text', text: EG_TEXT.cold, closesWindow: false }, 'no opener: cold');
    setWeirKeyOpener(() => '');
    assert.equal(useResultAction(use()).closesWindow, true, 'the enhanced pack closes on it');
  } finally { setWeirKeyOpener(null); }
});
