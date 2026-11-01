// MAC-SWING1. The rebind was not a failed workaround - it was the mechanism.
// setBinding clears the Mouse1 row when a key takes SwingWeapon, and
// nothing in src/ read the binding except as a MOUSE button
// (swingButton() answered -1, every isSwingButton false, no reader of
// held(keys, 'SwingWeapon') anywhere - the departure ui/input.js's
// header recorded). The desktop app's prefs file keeps the binding
// across reinstalls, so the swing stayed dead. A swing bound to a key
// or a pad button swings now: swingHeld reads the registry for any
// code, and each host polls swingKeyHeld beside its other held reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBindings, resetDefaults, setBinding, getBinding } from '../../src/systems/inputActions.js';
import { bindings, setBindings, swingButton, isSwingButton, swingHeld, swingKeyHeld, held } from '../../src/ui/input.js';
import { routeMouseDrag } from '../../src/scenes/shared.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const fresh = () => { const b = createBindings(); resetDefaults(b); return b; };

test('MAC-SWING1: the default is the mouse - Mouse1 (DOM button 2) swings, and no key latch is raised', () => {
  const had = bindings();
  try {
    setBindings(fresh());
    assert.equal(getBinding(bindings(), 'SwingWeapon'), 'Mouse1', 'InputManager.cs:1010');
    assert.equal(swingButton(), 2);
    assert.equal(isSwingButton(2), true);
    assert.equal(swingHeld(2, new Set(['Mouse1'])), true, 'the DOM buttons bit');
    assert.equal(swingHeld(0, new Set(['Mouse1'])), false, 'a mouse binding reads the buttons, not the set');
    assert.equal(swingKeyHeld(new Set(['Mouse1'])), false, 'mutants: the key latch raised for a mouse binding (a double press)');
  } finally { setBindings(had); }
});

test('MAC-SWING1: bound to a KEY or a PAD code the swing is reachable - swingHeld and the latch read the registry', () => {
  const had = bindings();
  try {
    for (const code of ['KeyG', 'JoystickAxis10Button0']) {
      const b = fresh();
      setBinding(b, code, 'SwingWeapon');
      setBindings(b);
      assert.equal(getBinding(b, 'SwingWeapon'), code);
      assert.equal(swingButton(), -1, 'setBinding cleared the Mouse1 row - the pre-fix death');
      assert.equal(isSwingButton(2), false);
      const keys = new Set();
      assert.equal(swingHeld(2, keys), false, 'the right button is nothing now');
      assert.equal(swingKeyHeld(keys), false);
      keys.add(code);
      assert.equal(held(keys, 'SwingWeapon'), true);
      assert.equal(swingHeld(0, keys), true, `mutants: ${code} held and the swing unreachable`);
      assert.equal(swingKeyHeld(keys), true, 'the latch the hosts feed the rig');
      assert.equal(swingHeld(0), false, 'no key set handed: no answer (the old signature, still honest)');
      // the gesture drag routes as a swing for the key too
      assert.equal(routeMouseDrag({ walkMode: true, buttons: 0, keys, mode: 'exterior', swingMode: 0 }), 'swing', 'mutants: routeMouseDrag not handed the keys');
      assert.equal(routeMouseDrag({ walkMode: true, buttons: 0, keys: new Set(), mode: 'exterior', swingMode: 0 }), 'look');
    }
  } finally { setBindings(had); }
});

