// FIX-F (2026-09-08, Mac: "Changing keybinds in classic/enhanced do not
// work"). Two defects, neither in the rebinding law itself (which
// round-trips): the enhanced skin - the default - had NO door to it
// (ui/enhanced/enhancedControls.js, pinned in its own file), and on the classic
// skin the controls window offered rows that nothing read: the swing was
// the raw right button in every host while the registry carried
// Mouse1 -> SwingWeapon; TurnLeft/TurnRight/LookUp/LookDown had no
// consumer; RecastSpell/AbortSpell had none; a bound F8 was eaten by the
// debug arm above the registry read; the interior host read a raw M for
// the automap. Slide and CenterView have no consumer in DFU either
// (only the enum names them) and stay as they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindings, keyboardLook, isSwingButton, swingButton, swingHeld, mouseCode } from '../../src/ui/input.js';
import { setBinding, clearBindingByCode, resetDefaults } from '../../src/systems/inputActions.js';
import { keyboardLookRate, KEYBOARD_LOOK_UNITS_PER_SECOND } from '../../src/ui/lookSettings.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const read = (p) => hostText(p);

test('FIX-F: the keyboard look reads the four turn/look actions off the registry (InputManager.cs:1854-1865)', () => {
  const b = bindings(); resetDefaults(b, true);
  assert.deepEqual(keyboardLook(new Set()), { x: 0, y: 0 });
  assert.deepEqual(keyboardLook(new Set(['ArrowLeft'])), { x: -1, y: 0 }, 'TurnLeft');
  assert.deepEqual(keyboardLook(new Set(['ArrowRight'])), { x: 1, y: 0 }, 'TurnRight');
  assert.deepEqual(keyboardLook(new Set(['Insert'])), { x: 0, y: 1 }, 'LookUp');
  assert.deepEqual(keyboardLook(new Set(['Delete'])), { x: 0, y: -1 }, 'LookDown');
  assert.deepEqual(keyboardLook(new Set(['ArrowLeft', 'ArrowRight'])), { x: 0, y: 0 }, 'both cancel');
  // REBOUND: the read follows the registry, which is the whole point
  clearBindingByCode(b, 'ArrowLeft'); setBinding(b, 'KeyJ', 'TurnLeft');
  assert.deepEqual(keyboardLook(new Set(['KeyJ'])), { x: -1, y: 0 }, 'a rebound TurnLeft turns');
  assert.deepEqual(keyboardLook(new Set(['ArrowLeft'])), { x: 0, y: 0 }, 'and the old key does not');
  resetDefaults(b, true);
  // the rate: one look unit a frame at 60 fps, a unit a degree per sensitivity point
  assert.equal(KEYBOARD_LOOK_UNITS_PER_SECOND, 60);
  assert.ok(keyboardLookRate() > 0);
  // AUDIT 65 MC-4: EVERY LookFilter OWNER, which is four files - the
  // three player hosts and ?interior's fly-cam (`new LookFilter()` at
  // world.js, exterior.js, dungeon.js, interior.js). Not THE FOUR HOSTS
  // (worldModes.js and dungeonContext.js own no filter); this is the
  // seam's own set, and DFU has ONE InputManager for all of them.
  for (const h of ['src/scenes/world.js', 'src/scenes/exterior.js', 'src/scenes/dungeon.js', 'src/scenes/interior.js']) {
    // HELM-KEYS: the streaming world's helm takes the turn keys for the rudder (inputActions.js HELM_RUDDER_ACTIONS) - the
    // one line between the read and the feed, and only there
    // PIN MOVED (AUDIT CAPTAIN'S SEA S13): the streaming world's slowed by the captain's glass, as its mouse look is
    const glass = h === 'src/scenes/world.js' ? String.raw` \* glassLookScale\(spyglass\.lens\)` : '';
    assert.match(read(h), new RegExp(String.raw`else lookFilter\.tick\(dt, cam\);\s*\n(?:\s*\/\/[^\n]*\n)*\s*const kb = keyboardLook\(keys\);\s*\n(?:\s*if \(helmTurnKeys\(\)\) kb\.x = 0;[^\n]*\n)?\s*if \(kb\.x \|\| kb\.y\) lookFilter\.add\(kb\.x \* keyboardLookRate\(\) \* dt${glass}, kb\.y \* keyboardLookRate\(\) \* dt \* lookInvert\(\)${glass}\);`), `${h}: the keyboard look feeds the same filter the mouse does, every frame, owed to the next tick`);
    assert.equal(/if \(helmTurnKeys\(\)\) kb\.x = 0;/.test(read(h)), h === 'src/scenes/world.js', `${h}: the helm's rudder takes the turn keys in the streaming world alone`);
  }
});

test('FIX-F: the swing button is the registry’s - rebind SwingWeapon and the hosts follow', () => {
  const b = bindings(); resetDefaults(b, true);
  assert.equal(mouseCode(2), 'Mouse1', 'the right button is Unity’s Mouse1');
  assert.equal(swingButton(), 2);
  assert.equal(isSwingButton(2), true); assert.equal(isSwingButton(0), false);
  assert.equal(swingHeld(2), true, 'buttons bit 2 is the right button');
  assert.equal(swingHeld(1), false); assert.equal(swingHeld(3), true, 'held with the left too');
  clearBindingByCode(b, 'Mouse1'); setBinding(b, 'Mouse0', 'SwingWeapon');
  assert.equal(swingButton(), 0, 'rebound to the left button');
  assert.equal(isSwingButton(0), true); assert.equal(isSwingButton(2), false);
  assert.equal(swingHeld(1), true); assert.equal(swingHeld(2), false);
  clearBindingByCode(b, 'Mouse0'); setBinding(b, 'KeyX', 'SwingWeapon');
  assert.equal(swingButton(), -1, 'a swing on a KEY is no mouse button');
  assert.equal(swingHeld(2), false);
  resetDefaults(b, true);
  // every host reads it - no raw right-button swing survives
  for (const h of ['src/scenes/world.js', 'src/scenes/exterior.js', 'src/scenes/dungeon.js', 'src/scenes/worldModes.js']) {
    const s = read(h);
    assert.ok(!/e\.button === 2 && !townTalk\.overlayActive|e\.button === 2 && !ctx\.uiOverlayActive|e\.button === 2 && !modalWindowUp/.test(s), `${h}: no raw right-button swing`);
    assert.ok(!/\(e\.buttons & 2\)/.test(s), `${h}: no raw right-button drag`);
  }
});

