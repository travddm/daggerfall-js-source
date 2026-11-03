// OT1 - A TAP OUTSIDE ANY UI CLOSES IT.
//
//
// One helper on the overlay registry, wired on every enhanced window
// that stands in a scrim: the pause window, the pack, the spellbook,
// the chronicle, the talk panel. The book and the dial already closed
// on a tap beside them. The front door has no scrim and nothing to
// close.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeOnOutsideTap, swallowTapClick, TAP_CLICK_MS } from '../../../src/ui/enhanced/enhancedOverlays.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

/** A shell with one listener slot, and targets that answer closest(). */
const shellOf = () => {
  const shell = { handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; }, removeEventListener(t) { delete this.handlers[t]; } };
  const inside = { closest: (sel) => (sel.includes('.px-win') ? {} : null) };
  const outside = { closest: () => null };
  return { shell, inside, outside };
};

test('OT1 helper: a primary press on the shell outside the kept selector closes; inside, a drag button, or a bare shell miss does not', () => {
  const { shell, inside, outside } = shellOf();
  let closed = 0, prevented = 0;
  const off = closeOnOutsideTap(shell, '.px-win, .px-foot', () => { closed++; });
  const fire = (target, button = 0) => shell.handlers.pointerdown({ target, button, preventDefault: () => { prevented++; } });
  fire(inside);
  assert.equal(closed, 0, 'inside the window: the window\'s own');
  fire(outside);
  assert.equal(closed, 1, 'on the scrim: closed');
  assert.equal(prevented, 1, 'and the press is consumed');
  fire(shell);
  assert.equal(closed, 2, 'the shell itself is outside');
  fire(outside, 2);
  assert.equal(closed, 2, 'a secondary button is not a tap');
  off();
  assert.equal(shell.handlers.pointerdown, undefined, 'unwired');
  assert.equal(typeof closeOnOutsideTap(null, '.x', () => {}), 'function', 'no shell: a no-op unwire');
});

test('AUDIT SEASON-BOOK U1: a window closed by its press swallows that tap\'s click - in the capture phase, once, and never past a new press or TAP_CLICK_MS; a scrim that resumes the game asks for nothing (mutants: the swallow never armed; the click let through; the watch never ended)', async () => {
  const listeners = [];
  const doc = { addEventListener: (t, f, c) => listeners.push([t, f, c]), removeEventListener: (t, f) => { const i = listeners.findIndex(([x, g]) => x === t && g === f); if (i >= 0) listeners.splice(i, 1); } };
  const shell = { ownerDocument: doc, handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; }, removeEventListener(t) { delete this.handlers[t]; } };
  let closed = 0;
  closeOnOutsideTap(shell, '.px-win', () => { closed++; }, { swallow: true });
  shell.handlers.pointerdown({ target: shell, button: 0, preventDefault() {} });
  assert.equal(closed, 1);
  const eat = listeners.find(([t, , c]) => t === 'click' && c === true);
  assert.ok(eat, 'the next click watched for, in the capture phase');
  let stopped = 0, prevented = 0;
  eat[1]({ preventDefault: () => { prevented++; }, stopPropagation: () => { stopped++; }, stopImmediatePropagation() {} });
  assert.deepEqual([stopped, prevented], [1, 1], 'eaten');
  assert.equal(listeners.filter(([t]) => t === 'click').length, 0, 'once');
  // a new press ends the watch, and so does time
  swallowTapClick(doc);
  await new Promise((r) => setTimeout(r, 5));
  const down = listeners.find(([t]) => t === 'pointerdown');
  assert.ok(down, 'a new press is watched for, after this one');
  down[1]({});
  assert.equal(listeners.length, 0, 'a new press is a new gesture: the watch is over');
  assert.ok(TAP_CLICK_MS > 0 && TAP_CLICK_MS <= 1000);
  // the face's own scrim (a resume) never swallows: its click is the game's
  const plain = { ownerDocument: doc, handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; }, removeEventListener() {} };
  closeOnOutsideTap(plain, '.px-win', () => {});
  plain.handlers.pointerdown({ target: plain, button: 0, preventDefault() {} });
  assert.equal(listeners.length, 0);
});
