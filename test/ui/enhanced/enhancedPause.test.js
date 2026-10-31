// U51 - THE PAUSE DOOR, pinned.
//
// Escape's screen is now a decision, and this file holds the decision
// and its edges. Two kinds of assertion, kept apart on purpose:
//
//   BEHAVIOUR - the fork itself runs in node. `?skin=` is a URL and
//   uiSkin reads one from an injected string, so both branches can be
//   taken here for real rather than read off the page.
//
//   SOURCE SWEEPS, and they say so. The enhanced screen is DOM and
//   the hosts are canvases; node can drive neither. What a sweep CAN
//   hold is the structure a browser check would not notice going
//   wrong - a second copy of the design, a host that slipped back to
//   importing the classic window directly, an eager import that makes
//   the classic skin pay for a module it never shows, or a listener
//   with no owner. The screen itself is proven in a real browser by
//   tools/enhancedPauseProbe.mjs.
//
// A PIN MUST FAIL: every assertion below dies under a one-character
// change to the law it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { openPauseFlow, pauseDoorReady, pauseArtLoaded } from '../../../src/ui/pauseDoor.js';
import { _resetForTests } from '../../../src/systems/uiPrefs.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole
import { remainWords } from '../../../src/ui/quest/questRail.js';   // PX22: the words, pinned by what they say (AUDIT OW-REVISITED L5-6)

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => hostText(p);

// uiSkin reads globalThis.location.search when it is given no string,
// and node has no location. Set one, and reset the stored pref so one
// test's choice never answers for the next.
const skin = (value) => { _resetForTests(); globalThis.location = { search: `?skin=${value}` }; };

// A DOCUMENT, JUST ENOUGH OF ONE. The fork's second clause is
// `typeof document !== 'undefined'`, and node has none - so a test that
// only sets the skin takes the CLASSIC branch on both skins and passes
// for the wrong reason. Mutation M4 (drop `isEnhanced()` from the
// condition) survived the first draft of this file for exactly that
// reason, which is the vacuous-pin shape AUDIT 17e Wave 3 went hunting.
//
// The enhanced branch touches four things before it goes async, and
// this is those four. The pending dynamic import lands after the test
// body; disposing the overlay synchronously makes its `if (fired)`
// guard take the early return, which is that guard's own pin.
function withDocument(fn) {
  const node = { id: '', style: {}, removed: false, remove() { this.removed = true; } };
  globalThis.document = { createElement: () => node, body: { append() {} } };
  try { return fn(node); } finally { delete globalThis.document; }
}

/** The same, held open across the lazy import. */
async function withDocumentAsync(fn) {
  const node = { id: '', style: {}, removed: false, remove() { this.removed = true; } };
  globalThis.document = { createElement: () => node, body: { append() {} } };
  try { return await fn(node); } finally { delete globalThis.document; }
}

/** Let the dynamic import in pauseDoor.js land. The module is warmed
 *  first so the import resolves from the registry rather than off the
 *  disk, then a few turns of the loop for the .then to run. */
async function settleImport() {
  await import('../../../src/ui/enhanced/enhancedMenu.js');
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

// ── THE FORK ─────────────────────────────────────────────────────

test('U51: the classic skin still gets the classic window', () => {
  skin('classic');
  withDocument(() => {
    let shown = null;
    const win = openPauseFlow((w) => { shown = w; }, { exitToMenu() {} });
    assert.equal(win?.constructor?.name, 'PauseOptionsWindow',
      'a player who chose classic must get OPTN00I0, not the DOM screen');
    assert.equal(shown, win, 'and the host gets the same object the factory returns');
  });
});

test('U51: the enhanced skin gets the DOM screen, and the host holds it', () => {
  skin('enhanced');
  withDocument((node) => {
    let shown = null;
    const win = openPauseFlow((w) => { shown = w; }, {});
    assert.notEqual(win?.constructor?.name, 'PauseOptionsWindow',
      'the enhanced skin must not get the canvas window');
    assert.equal(shown, win, 'the host slot holds it - which is what stops the motor and the clock');
    assert.equal(win.done, false, 'a screen that reports done on arrival is torn down on arrival');
    assert.equal(node.id, 'enhanced-pause');
    assert.match(node.style.cssText, /position:fixed;inset:0/,
      'over the canvas, and opaque - the renderer clears to the Iliac Bay sky');
    // dispose BEFORE the lazy import lands: the mount must take its
    // early return rather than mounting into a div already removed.
    win.dispose();
    assert.equal(win.done, true, 'dispose closes the door');
    assert.equal(node.removed, true, 'and takes the div with it');
  });
});

test('U51: a host with no document keeps the canvas window, on either skin', () => {
  // The same guard chargenSession's fork carries, for the same reason:
  // node drives these hosts headless and must not have a special case
  // written for it. `document` is undefined here, so the enhanced
  // branch cannot be taken however the skin reads.
  skin('enhanced');
  assert.equal(typeof document, 'undefined', 'this test is only meaningful headless');
  const win = openPauseFlow(() => {}, {});
  assert.equal(win?.constructor?.name, 'PauseOptionsWindow');
});

// ── THE ART GATE MOVED WITH THE DOOR ─────────────────────────────
// The four hosts gate Escape on this predicate. Classic cannot draw
// one pixel of its panel without OPTN00I0.IMG; the enhanced screen
// needs no ARENA2 at all, which is the whole premise of U49's front
// door. Gating the enhanced screen on classic art would strand a
// player whose art load failed with no pause menu, no settings and no
// way out of a game that would have rendered perfectly.
test('U51: the door needs classic art only where the classic window draws it', () => {
  assert.equal(pauseArtLoaded(), false, 'no ARENA2 in this container - that is the point');
  skin('classic');
  assert.equal(pauseDoorReady(), false, 'classic with no OPTN00I0 has nothing to draw');
  skin('enhanced');
  assert.equal(pauseDoorReady(), true, 'the enhanced screen reads no game data at all');
});

test('U51: every host gates on the door, and not on the classic art', () => {
  for (const rel of ['scenes/world.js', 'scenes/exterior.js',
    'scenes/worldModes.js', 'scenes/dungeonContext.js']) {
    const src = read(`src/${rel}`);
    assert.match(src, /pauseDoorReady\(\)/, `${rel} must gate on the door`);
    assert.doesNotMatch(src, /pauseArtLoaded\(\)/,
      `${rel} must not gate the enhanced screen on classic art`);
    assert.match(src, /from '\.\.\/ui\/pauseDoor\.js'/,
      `${rel} reaches the pause screen through the ONE seam`);
    assert.doesNotMatch(src, /from '(?:\.\.?\/)+(?:[\w-]+\/)*pauseWindow\.js'/,
      `${rel} must not import the classic window past the fork`);
  }
});

// THE RACE THE GUARD IS FOR. The screen mounts asynchronously and a
// host can tear its overlay out before the module lands - the death
// sequence and a scene change both do exactly that. Without the guard
// the mount runs into a div that is already off the document, and the
// menu it builds has no owner: `close()` has already fired, so the
// unmount that would remove its capture keydown never runs, and Escape
// is swallowed for the rest of the session by a screen nobody can see.
test('U51: a dispose before the module lands mounts nothing at all', async () => {
  skin('enhanced');
  const warns = [];
  const real = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  try {
    await withDocumentAsync(async (node) => {
      const win = openPauseFlow(() => {}, {});
      win.dispose();
      assert.equal(node.removed, true, 'the div goes with the dispose');
      await settleImport();
      assert.deepEqual(warns, [],
        'the mount must take its early return - a mount attempt into a removed div '
        + 'is the leaked-listener path, and it announces itself through the catch');
      assert.equal(globalThis.__menu, undefined, 'and it built no screen');
    });
  } finally { console.warn = real; }
});

test('PX22: the timer PX5 designed is still there, and only when there is one', () => {
  // PIN MOVED (AUDIT OW-REVISITED L5-6): the words go through the text core now - pinned by what they say
  assert.deepEqual([remainWords(2 * 86400 + 3 * 3600), remainWords(86400), remainWords(86400 + 3600)], ['2 days 3 hours', '1 day', '1 day 1 hour']);
  assert.deepEqual([remainWords(3 * 3600 + 5 * 60), remainWords(3600), remainWords(25 * 60)], ['3 hours 5 min', '1 hour', '25 min']);
  assert.equal(remainWords(30), '1 min', 'never "0 min" - a live clock always has a minute left');
  // ...and NO host walks it any more, derived rather than listed.
  for (const h of ['exterior', 'world', 'worldModes', 'dungeonContext']) {
    assert.ok(!read(`src/scenes/${h}.js`).includes('remainingTimeInSeconds'),
      `${h}.js must take the bridge's walk, timers and all`);
  }
});

test('AUDIT UI 2: every enhanced window is REACHABLE from a host', () => {
  // PX24's fault, as a law: the chronicle's door and window were built,
  // pinned and browser-verified, and NOTHING called the door. Every pin
  // it wrote was about the door's own behaviour and all of them passed.
  // Reachability has to follow DYNAMIC imports - the doors load their
  // windows with import() - which is what made the first version of
  // this sweep report every window as unreachable.
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.js'));
  const text = Object.fromEntries(files.map((f) => [f, hostText(f)]));
  const edges = {};
  for (const f of files) {
    // INTRO4: and a worker - `new Worker(new URL('./x.js', import.meta.url))` is how Vite bundles one, so the module
    // it names is reached by the page that starts it (src/ui/intro/introBuildWorker.js, the first worker under src/ui/)
    edges[f] = [...new Set([...text[f].matchAll(/(?:from|import\(|new Worker\(new URL\()\s*['"](\.[^'"]+)['"]/g)]
      .map((m) => relative(root, resolve(join(root, dirname(f)), m[1])))
      .filter((p) => text[p] !== undefined))];
  }
  // The roots are the hosts AND main.js: the cursor and the crash line
  // hang off boot, not off a scene, and the first version of this
  // sweep called them orphans for it.
  const seen = new Set(['src/main.js', ...files.filter((f) => f.startsWith('src/scenes/'))]);
  const q = [...seen];
  while (q.length) for (const n of edges[q.pop()] ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  const windows = files.filter((f) => /^src\/ui\/(enhanced|pixel|loot)/.test(f)
    && !/enhancedStyle|enhancedOverlays/.test(f));
  assert.ok(windows.length >= 8, `${windows.length} enhanced windows found`);
  assert.deepEqual(windows.filter((w) => !seen.has(w)), [],
    'a window nothing reaches is a window nobody can open');
  // ...and no src/ui module at all is orphaned. THE STAGING EXEMPTION
  // IS GONE, as its own counter-pin instructed: flight 2 mounted
  // ui/automap/automapChrome.js from BOTH ends - c2/S5's native dungeon window
  // and c2/S10's exterior town map - so the chrome is reached from the
  // hosts like everything else, the list is empty and the sweep is
  // unconditional again, which is the state it has to be in for PX24's
  // fault (a window nothing reaches) to stay caught.
  assert.deepEqual(files.filter((f) => f.startsWith('src/ui/') && !seen.has(f)), [],
    'a src/ui module nothing reaches is a module nobody can open');
  assert.ok(seen.has('src/ui/automap/automapChrome.js'),
    'the automap chrome is reachable - flight 2 mounted it in both automap windows');
});
