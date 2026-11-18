import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindKeyRelease, bindButtonRelease } from '../../src/ui/release-held-input.js';
import { keyEdges, mouseCode, beginInputFrame, noteKeyDown } from '../../src/ui/input.js';

/** A window and a document as the bindings read them, with the host's release paths recorded. */
function wired(heldCodes) {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const held = new Set(heldCodes);
  const edges = keyEdges();
  const log = { keys: [], keyUps: [], buttons: [] };
  const releaseKey = bindKeyRelease({
    target,
    held,
    edges: () => edges,
    released: (code) => log.keys.push(code),
    keyUp: (e) => log.keyUps.push(e.code),
  });
  bindButtonRelease({
    target,
    doc,
    held,
    releaseKey,
    released: (e) => {
      log.buttons.push(e.button);
      held.delete(mouseCode(e.button));
    },
  });
  return { target, doc, held, edges, log };
}

const keyup = (code) => Object.assign(new Event('keyup'), { code });

test('a keyup drains the held set, notes the edge, then runs the host release and the host keyup in that order', () => {
  const { target, held, log } = wired(['KeyW']);
  target.dispatchEvent(keyup('KeyW'));
  assert.equal(held.has('KeyW'), false);
  assert.deepEqual(log.keys, ['KeyW']);
  assert.deepEqual(log.keyUps, ['KeyW']);
});

test('a key or button held as the window loses focus is released through the host, each once: a key by its code with no keyup sent to an open window, a mouse button by its DOM button (mutants: no blur listener; a button released as a key; the window told of the key)', () => {
  const swing = mouseCode(2);
  const { target, held, log } = wired(['KeyW', 'ShiftLeft', swing]);
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(log.keys, ['KeyW', 'ShiftLeft']);
  assert.deepEqual(log.keyUps, [], 'no keyup reaches the host on focus loss');
  assert.deepEqual(log.buttons, [2]);
  assert.equal(held.size, 0, 'nothing is left held');
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(log.keys, ['KeyW', 'ShiftLeft'], 'a second blur finds nothing held');
});

test('a key released by focus loss leaves its release edge for the frame, as a keyup does', () => {
  const { target, edges } = wired(['KeyW']);
  noteKeyDown(edges, 'KeyW');
  target.dispatchEvent(new Event('blur'));
  beginInputFrame(edges);
  assert.equal(edges.upFrame.has('KeyW'), true);
});

test('a mouseup reaches the host release with its event', () => {
  const { target, log } = wired([]);
  target.dispatchEvent(Object.assign(new Event('mouseup'), { button: 0 }));
  assert.deepEqual(log.buttons, [0]);
});

test('a tab hidden with a key held releases it; the tab shown again releases nothing (mutants: the hidden tab ignored; every visibility change releasing)', () => {
  const { doc, log } = wired(['KeyD']);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(log.keys, [], 'shown: nothing released');
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(log.keys, ['KeyD']);
});
