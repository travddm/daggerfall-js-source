// HOTFIX 1003f (2026-10-03, (ui/arena/arenaSessionButton.js, wired in scenes/world.js arenaFrame); "crackling still happens after the bout
// ends" (the verdict's roar, systems/arena/arenaCrowd.js); "get rid of the static crowd noise when cheering and booing"
// (systems/arena/arenaSound.js); "it shouldnt kick players after a bout" (world.js myHealth - the relay's 0 a fall, never a death).
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createArenaSessionButton, ARENA_SESSION_KEY } from '../../src/ui/arena/arenaSessionButton.js';
import { synthCheer, synthBoo, synthBed } from '../../src/systems/arena/arenaSound.js';

const all = (n) => (n?.children ?? []).flatMap((c) => (c?.tagName ? [c, ...all(c)] : []));

test('HOTFIX 1003f: the session\'s button stands on the screen while a session holds me, hidden otherwise; its press and the / key open the window (mutants: never shown; the key unheard; the key heard in a text field)', () => {
  let opened = 0;
  const listeners = {};
  const win = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener: (k) => { delete listeners[k]; } };
  const doc = Object.create(document);
  doc.defaultView = win;
  const B = createArenaSessionButton({ open: () => { opened++; }, doc });
  B.frame(true);
  const btn = all(document.body).find((x) => String(x.className).includes('arena-session-btn'));
  assert.ok(btn, 'on the screen');
  assert.equal(btn.hidden, false);
  (btn.listeners?.click ?? []).forEach((f) => f({ preventDefault() {}, stopPropagation() {} }));
  assert.equal(opened, 1, 'its press opens the window');
  listeners.keydown({ code: ARENA_SESSION_KEY, target: { tagName: 'CANVAS' }, preventDefault() {} });
  assert.equal(opened, 2, 'and the / key');
  listeners.keydown({ code: ARENA_SESSION_KEY, target: { tagName: 'INPUT' }, preventDefault() {} });
  assert.equal(opened, 2, 'never in a text field');
  B.frame(false);
  assert.equal(btn.hidden, true, 'hidden out of a session');
  assert.equal(listeners.keydown, undefined, 'and its key let go');
  B.dispose();
});

test('HOTFIX 1003f: with the voices, the cheer, the boo and the bed are the voices alone - no noise under them (mutant: the noise kept)', () => {
  // a voice of silence: whatever sounds is the noise
  const hush = [new Float32Array(11025).fill(0)];
  for (const x of [synthCheer(hush), synthBoo(hush), synthBed(hush)]) assert.ok(x.every((v) => v === 0), 'nothing but the voices');
});

