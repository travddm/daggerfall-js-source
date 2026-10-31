// DA12 (2026-10-08, Mac: "is it possible to integrate the launcher inside the game? ... some game managers, like
// PlayNite, don't reconigze the launcher as a game and also I can't control the Launcher with a controller").
//
// THE SWITCH PAST THE FRONT DOOR, AND A PAD AT IT. The launcher was never a second program - it is the shell's
// first window (DA8) - but a game manager starts a game and watches its process, and an update installed before
// play (the app quits, the installer reopens it) reads as the game having quit. `--play` goes straight into the
// game, its updates the game's (the HUD line, installed at quit), and opens the launcher only when it has
// something to ask. And the launcher answers a controller: the game's own front-door loop (src/ui/menu/menuPad.js),
// served to its page as the one module, never a copy.
//
// The choice is pure (app/lib/launcherState.cjs directPlay) and driven here; the shell's wiring, the page and the
// packing are pinned by source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { attachMenuPad } from '../../src/ui/menu/menuPad.js';

const require = createRequire(import.meta.url);
const L = require('../../app/lib/launcherState.cjs');
const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('DA12: --play goes past the launcher only when there is nothing to ask', () => {
  const exe = ['C:\\Games\\DFO Online\\DFO Online.exe'];
  const play = [...exe, '--play'];
  assert.equal(L.PLAY_SWITCH, '--play');
  // no switch: the launcher, whatever is configured
  assert.equal(L.directPlay(exe, { arena2Path: 'D:\\DAGGER\\ARENA2' }), null);
  assert.equal(L.directPlay(exe, { arena2InGame: true }), null);
  // the switch with a saved folder: that folder, to be judged before the game is built
  assert.equal(L.directPlay(play, { arena2Path: 'D:\\DAGGER\\ARENA2' }), 'D:\\DAGGER\\ARENA2');
  // the game's own picker, chosen once and kept: the game, with no folder
  assert.equal(L.directPlay(play, { arena2InGame: true }), '');
  // the first run - no folder, no choice - is the launcher's card, switch or not
  assert.equal(L.directPlay(play, {}), null);
  assert.equal(L.directPlay(play, { arena2Path: '' }), null);
  assert.equal(L.directPlay(play, { arena2InGame: 'yes' }), null, 'only a real true');
  // a dev launch (`electron . --play`) reads the same
  assert.equal(L.directPlay(['electron', '.', '--play'], { arena2InGame: true }), '');
  assert.equal(L.directPlay(null, { arena2InGame: true }), null);
});

test('DA12: focusStyle false writes no style into the page - the default still does', () => {
  const made = [];
  const doc = {
    defaultView: { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, performance: { now: () => 0 } },
    head: { append: (e) => made.push(e) },
    createElement: (tag) => ({ tag, remove() {} }),
    querySelector: () => null,
  };
  attachMenuPad({ doc, getPads: () => [], focusStyle: false })();
  assert.deepEqual(made, []);
  attachMenuPad({ doc, getPads: () => [] })();
  assert.equal(made.length, 1);
  assert.equal(made[0].tag, 'style');
});
