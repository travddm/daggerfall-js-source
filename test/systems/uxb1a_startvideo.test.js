// UXB1-A (2026-09-25, the UX backlog: '"Skip Start Video" in the options. Watching it once is great, having to skip
// it every time is tedious. Disabled by default, of course.'): THE PLAYER'S OWN SKIP.
//
// Both start videos were skippable only by the press a player makes EVERY launch (the film's Skip intro, Escape; any
// key on the classic splash) or by an address-bar flag a player never sees (?nointro, ?novideo - and the desktop app
// has no address bar at all). The switch is a port pref (uiPrefs skipStartVideo, off), drawn under Settings >
// Interface, read by main.js at both doors; skipping by the pref keeps the menu's music, as the Skip intro button does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';
import { ONLINE_PLAYERS_OWN_PREFS, ONLINE_FORCED_PREFS, onlineForcedPref } from '../../src/systems/online/onlineLane.js';
import { runCinematicFrontDoor } from '../../src/ui/intro/introScreen.js';
import { MENU_THEME_GAIN } from '../../src/systems/introTheme.js';
import { titleHeld } from '../../src/ui/intro/titleHeld.js';
import { introPage } from '../introDom.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('UXB1-A: the switch is a port pref, OFF by default, and the player\'s own online', () => {
  assert.equal(PREF_DEFAULTS.skipStartVideo, false, 'disabled by default - the film is how the game introduces itself');
  assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes('skipStartVideo'), 'nothing the room agrees on reads it');
  assert.ok(!('skipStartVideo' in ONLINE_FORCED_PREFS));
  assert.equal(onlineForcedPref('skipStartVideo', '?online=1'), undefined);
});

/** A theme that records what the door asks of it - the IntroTheme calls enterMenu makes. */
function fakeTheme() {
  const calls = [];
  return {
    calls, source: null, disposed: false, context: null,
    unlock() { calls.push('unlock'); return Promise.resolve(true); },
    prepare() { calls.push('prepare'); return Promise.resolve(true); },
    setLevel(level, seconds) { calls.push(['setLevel', level, seconds]); },
    start() { calls.push('start'); this.source = {}; return true; },
    async pause() {},
    async dispose() { this.disposed = true; calls.push('dispose'); },
  };
}
function fakeDoc() {
  const listeners = new Map();
  return {
    listeners, hidden: false, defaultView: {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
  };
}
const settle = () => new Promise((r) => setImmediate(r));

// TITLE-DOOR (2026-10-27): the held title is the front door now, so the player's skip lands there too - the film's last
// frame with no film before it, the menu at once on it - and the music law is unchanged
test('UXB1-A: a skip by the pref lands on the title with no film before it, the menu at once on it, and the first gesture starts the menu\'s music at the menu\'s level - once', async () => {
  const theme = fakeTheme();
  const page = introPage(), doc = page.doc;
  const warn = console.warn;
  const warned = [];
  console.warn = (...a) => warned.push(a.join(' '));
  let opened = 0;
  let resolveMenu;
  const gesture = (type) => { for (const f of [...(doc.listeners[type] ?? [])]) f({ type }); };
  try {
    const door = runCinematicFrontDoor(() => { opened++; page.mountMenu(); return new Promise((r) => { resolveMenu = r; }); }, { skip: true, menuMusic: true, doc, theme });
    await settle();
    assert.equal(opened, 1, 'the menu is revealed at once');
    assert.ok(titleHeld(doc) && doc.getElementById('intro').querySelector('.intro-gate').hidden, 'on the held title, with no gate before it');
    assert.deepEqual(warned, [], 'nothing failed on the way');
    assert.deepEqual(theme.calls, [], 'nothing plays before a gesture - a browser would refuse it');
    gesture('pointerdown');
    await settle();
    assert.deepEqual(theme.calls, ['unlock', 'prepare', ['setLevel', MENU_THEME_GAIN, 0], 'start'],
      'the Skip intro button\'s music: unlocked on the gesture, at the menu\'s gain');
    gesture('keydown');
    await settle();
    assert.equal(theme.calls.filter((c) => c === 'start').length, 1, 'a second gesture starts nothing more');
    resolveMenu('new');
    assert.equal(await door, 'new');
    assert.ok(theme.disposed, 'every exit releases the audio');
    assert.equal(Object.values(doc.listeners).flat().length, 0, 'and every listener it added');
    assert.equal(doc.getElementById('intro'), null, 'and the title it stood on');
  } finally { console.warn = warn; }
});

test('UXB1-A: ?nointro (menuMusic off) skips as it always did - silent, whatever the gestures', async () => {
  const theme = fakeTheme();
  const doc = fakeDoc();
  let resolveMenu;
  const door = runCinematicFrontDoor(() => new Promise((r) => { resolveMenu = r; }), { skip: true, doc, theme });
  await settle();
  doc.listeners.get('pointerdown')();
  doc.listeners.get('keydown')();
  await settle();
  assert.deepEqual(theme.calls, []);
  resolveMenu('load');
  assert.equal(await door, 'load');
});
