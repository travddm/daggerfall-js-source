import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseHeldInputOnBlur } from '../../src/ui/release-held-input.js';
import { mouseCode } from '../../src/ui/input.js';

/** A window and a document as the wiring reads them, with the host's release paths recorded. */
function wired(heldCodes) {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const held = new Set(heldCodes);
  const released = { keys: [], buttons: [] };
  const releaseAll = releaseHeldInputOnBlur({
    target,
    doc,
    held,
    releaseKey: (code) => {
      released.keys.push(code);
      held.delete(code);
    },
    releaseButton: (button) => {
      released.buttons.push(button);
      held.delete(mouseCode(button));
    },
  });
  return { target, doc, held, released, releaseAll };
}

test('a key or button held as the window loses focus is released through the host, each once: a key by its code, a mouse button by its DOM button (mutants: no blur listener; a button released as a key)', () => {
  const swing = mouseCode(2);
  const { target, held, released } = wired(['KeyW', 'ShiftLeft', swing]);
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(released.keys, ['KeyW', 'ShiftLeft']);
  assert.deepEqual(released.buttons, [2]);
  assert.equal(held.size, 0, 'nothing is left held');
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(released.keys, ['KeyW', 'ShiftLeft'], 'a second blur finds nothing held');
});

test('a tab hidden with a key held releases it; the tab shown again releases nothing (mutants: the hidden tab ignored; every visibility change releasing)', () => {
  const { doc, released } = wired(['KeyD']);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(released.keys, [], 'shown: nothing released');
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(released.keys, ['KeyD']);
});
