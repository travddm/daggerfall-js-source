import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountRig } from '../../src/player/mountRig.js';
import { TRANSPORT_MODES } from '../../src/systems/transport.js';
import { MOUSE_CODES, mouseCode, routeAction } from '../../src/ui/input.js';
import { ControlsWindow } from '../../src/ui/controlsWindow.js';
import { currentDict } from '../../src/systems/controlsConfig.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

// ═══ MAC-K: THREE THINGS MAC FOUND IN PLAY ════════════════════════
//
// 2026-09-15, verbatim:
//   1. Mouse keybindings not working properly
//   2. Logbook not reflecting quests
//   3. T to mount not working outside interiors
//
// Three reports, and the same shape under two of them: a seam wired in
// three of THE FOUR HOSTS and missing from the fourth, where no
// source-text pin aimed at one host could see it. The pins below are
// aimed at POPULATIONS for exactly that reason.
//
// K2's own pins live with what they moved - test/systems/quest/questbridge.test.js
// for the walk and test/ui/enhanced/enhancedChronicle.test.js for the window.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => hostText(p);
const HOSTS = ['exterior', 'world', 'worldModes', 'dungeonContext'];

// ── K1: the mouse ────────────────────────────────────────────────

test('AUDIT-MACK F2: ONE feeder per held-key Set, and every reader is on a fed one', () => {
  // THE PIN THIS REPLACES WAS WRONG, and wrong in the direction that
  // matters: it asserted that every file reading `held(keys, ...)`
  // must itself write the mouse codes into that Set. `worldModes.js`
  // does not OWN a Set - it takes `keys` off the host bag
  // (`exterior.js:"channel, so the interior"`) - and the lender's own mousedown writes the
  // codes UNGATED on a listener that is never removed. The codes were
  // always there.
  //
  // So MAC-K1's first cause was a misdiagnosis: it read AUDIT 39r's
  // "three hosts fixed, this one missed" as a gap, and added a second
  // writer to a Set that already had one. Idempotent, harmless, and a
  // second law for one fact.
  //
  // The real invariant is ownership: a file that DECLARES a held-key
  // Set must feed it both edges; a file that BORROWS one must not,
  // because two writers on one Set is how you get a release that
  // half-happens. Derived from the declarations, so it cannot be
  // satisfied by a list.
  const files = [...HOSTS, 'dungeon'].map((h) => [`src/scenes/${h}.js`, rd(`src/scenes/${h}.js`)]);
  const owners = [];
  const borrowers = [];
  for (const [f, src] of files) {
    if (!/\bheld\(keys,|\bkeys\.has\(/.test(src)) continue;
    (/const keys = new Set\(\)/.test(src) ? owners : borrowers).push([f, src]);
  }
  assert.ok(owners.length >= 2 && borrowers.length >= 1,
    `the port has both kinds (${owners.length} owners, ${borrowers.length} borrowers)`);

  for (const [f, src] of owners) {
    // MWCROUCH: `keys.add(mc)` now sits in a block beside the key-edge
    // ring's own note of the same button - one feeder, two readers.
    assert.match(src, /const mc = mouseCode\(e\.button\);\s*\n?\s*if \(mc\) \{ keys\.add\(mc\);/s,
      `${f} DECLARES the Set, so a mouse press must reach it - Mouse2 is the party's ping and Mouse0 the drawn bow's un-draw at the shipped bindings`);
    assert.match(src, /const mc = mouseCode\(e\.button\);\s*\n?\s*if \(mc\) \{ keys\.delete\(mc\);/s,
      `${f} must also let the button GO - a stuck Mouse2 is a stuck ping`);
    // ...and the write must be UNGATED, which is what makes a borrower
    // safe: the lender records the press whatever mode is mounted.
    const line = src.split('\n').find((l) => l.includes("addEventListener('mousedown'") && l.includes('keys.add(mc)'));
    assert.ok(line, `${f}: the feed is on the mousedown listener`);
    const gate = Math.min(...['modeNow()', 'overlayActive', 'walkMode'].map((g) => {
      const at = line.indexOf(g);
      return at < 0 ? Infinity : at;
    }));
    assert.ok(line.indexOf('keys.add(mc)') < gate,
      `${f}: the press is recorded BEFORE any gate, or a borrower's interior would be starved`);
  }
  for (const [f, src] of borrowers) {
    assert.ok(!/keys\.add\(mc\)/.test(src),
      `${f} borrows its Set and must not write to it too - one feeder, or a release half-happens`);
  }
  assert.ok(borrowers.some(([f]) => f.endsWith('worldModes.js')),
    'worldModes.js is the borrower MAC-K1 mistook for a gap');
});

test('MAC-K1: the crossed middle name is spelled ONCE, and the hosts read that table', () => {
  // Unity counts Mouse0/1/2 as left/RIGHT/middle; MouseEvent.button
  // counts left/MIDDLE/right. The two middle names cross, so a host
  // that spelled 'Mouse' + e.button would hand the wheel the right
  // button's action.
  assert.deepEqual([...MOUSE_CODES], ['Mouse0', 'Mouse2', 'Mouse1', 'Mouse3', 'Mouse4']);   // VIEW-TOGGLE: and the two side buttons (from VOICE1, which is reverted), the view toggle's
  assert.equal(mouseCode(0), 'Mouse0', 'left');
  assert.equal(mouseCode(1), 'Mouse2', 'the DOM’s middle is Unity’s Mouse2');
  assert.equal(mouseCode(2), 'Mouse1', '...and the DOM’s right is Unity’s Mouse1');
  assert.equal(mouseCode(3), 'Mouse3', 'VIEW-TOGGLE: the back side button is Unity\'s Mouse3');
  assert.equal(mouseCode(5), null, 'a sixth button is not a KeyCode');
  assert.equal(mouseCode(-1), null);
  for (const f of [...HOSTS.map((h) => `src/scenes/${h}.js`), 'src/scenes/dungeon.js',
    'src/ui/controlsWindow.js', 'src/ui/enhanced/enhancedControls.js']) {
    const src = rd(f);
    if (!src.includes('mouseCode')) continue;
    assert.ok(!/['"`]Mouse['"`]\s*\+/.test(src), `${f} must not spell the crossing a second time`);
  }
});

test('MAC-K1: BOTH controls skins can capture a mouse button, which is what "not working properly" was', () => {

  // ...AND IT IS DRIVEN, not read. THE CAMPAIGN'S OWN LESSON, for the
  // sixth time in this port: the first cut of this pin grepped for the
  // binding line, and a mutant that put the old `return true` back and
  // left the new arm under `if (false)` SURVIVED it - the text was
  // still there. A source-text pin cannot tell a live branch from a
  // dead one. This one arms a real capture and clicks.
  const win = new ControlsWindow();
  const jump = win.buttons.find((b) => b.action === 'Jump');
  assert.ok(jump, 'the grid offers Jump');
  const hit = (right, middle) => win.click(jump.x + 1, jump.y + 1, right, middle);
  hit(false, false);                       // the left click that ARMS
  assert.equal(win.capture, 'Jump', 'a left click on the row arms the capture');
  hit(false, false);                       // the NEXT press binds
  assert.equal(win.capture, null, 'and one press ends it');
  // KB1: every mouse button is somebody's (activate, swing, auto-run), so the press ASKS before it moves (law 4)
  assert.equal(win.top, 'replace', 'the left button is the activate\u2019s - the window asks');
  win.input('KeyY');
  assert.equal(currentDict(win.unsaved).get('Jump'), 'Mouse0', 'the left button binds');

  hit(false, false);
  hit(true, false);
  win.input('KeyY');
  assert.equal(currentDict(win.unsaved).get('Jump'), 'Mouse1',
    'the RIGHT button is Unity\u2019s Mouse1 - the crossed middle name, read off the one table');
  hit(false, false);
  hit(false, true);
  win.input('KeyY');
  assert.equal(currentDict(win.unsaved).get('Jump'), 'Mouse2', 'and the wheel press is Mouse2');

  // the remove gesture is still the remove gesture when NOTHING is armed
  assert.equal(win.capture, null);
  const before = currentDict(win.unsaved).get('Jump');
  win.click(0, 0, true);                   // a right click on dead space
  assert.equal(currentDict(win.unsaved).get('Jump'), before, 'and it did not bind anything');
});

// ── K3: the mount ────────────────────────────────────────────────

test('MAC-K3: the picker refuses AIRBORNE in silence, and opens grounded', () => {
  // dfuiOpenTransportWindow (DaggerfallUI.cs:690-700): `if
  // (isGrounded)` with NO else. Airborne is not a refusal line, it is
  // nothing at all.
  const shown = [];
  const player = { grounded: false, transportMode: TRANSPORT_MODES.Foot, setTransportMode() {} };
  const rig = createMountRig({
    renderer: {}, canvas: {}, fetchBytes: async () => new Uint8Array(),
    palette: null, audio: { playOneShot() {}, setLoop() {} },
    player, playerEntity: { items: [] },
    showOverlay: (w) => shown.push(w),
  });
  rig.open();
  assert.equal(shown.length, 0, 'airborne: nothing, and no line either');
  // grounded, but the picker's own ART is not loaded in node, so the
  // second half of the gate still refuses - which is the honest answer
  // and is why this pin asserts the GATE rather than a window object
  player.grounded = true;
  rig.open();
  assert.equal(shown.length, 0, 'grounded but artless: still nothing to show');
});

test('MAC-K3: setMode is the ONE motor call, and it drops the art before it loads the new mount', () => {
  // HC1 (2026-09-14, Mac: "audit the horse and cart ... the sprites
  // actually show"): the art loads where the MODE changes, not on the
  // T-key pick alone - three other paths set it (a loaded save on
  // horseback, the Test Room's ride out, the ship's landing) and each
  // used to leave a rider with no horse under them.
  const calls = [];
  const player = { grounded: true, transportMode: TRANSPORT_MODES.Foot, standing: true, isRunning: false, movingLessThanHalfSpeed: false,
    setTransportMode(m) { calls.push(m); this.transportMode = m; } };
  const rig = createMountRig({
    renderer: {}, canvas: {}, fetchBytes: async () => { throw new Error('no ARENA2 here'); },
    palette: null, audio: { playOneShot() {}, setLoop() {} },
    player, playerEntity: { items: [] }, showOverlay: () => {},
  });
  rig.setMode(TRANSPORT_MODES.Horse);
  assert.deepEqual(calls, [TRANSPORT_MODES.Horse], 'the motor is told, once');
  assert.equal(rig.loaded(), false, 'and a failed art load leaves NO mount rather than a stale one');
  rig.setMode(TRANSPORT_MODES.Foot);
  assert.deepEqual(calls, [TRANSPORT_MODES.Horse, TRANSPORT_MODES.Foot]);
});

test('MAC-K3: a frame while dismounted draws nothing, and cannot reach a canvas it has not got', () => {
  // The draw is gated on `isRiding` AND on the art being up, so the
  // per-frame call is safe on foot - which matters because the fixed-
  // city host now runs it every frame and had never run it before.
  let drew = 0;
  const player = { grounded: true, transportMode: TRANSPORT_MODES.Foot, standing: true, isRunning: false, movingLessThanHalfSpeed: false, setTransportMode() {} };
  const rig = createMountRig({
    renderer: { drawScreenQuad: () => { drew++; } },
    canvas: null,                       // deliberately: nothing may reach it
    fetchBytes: async () => new Uint8Array(), palette: null,
    audio: { playOneShot() {}, setLoop() {} },
    player, playerEntity: { items: [] }, showOverlay: () => {},
  });
  rig.frame(1 / 60);
  assert.equal(drew, 0, 'on foot, nothing is drawn');
});

// ═══ AUDIT-MACK F1: THE DOOR IS NOT THE KEY ═══════════════════════

test('AUDIT-MACK F1b: the fall-through is DRIVEN, and it declines what is not there', () => {
  // The arm itself, run: `routeAction` opens a door that exists,
  // refuses one that does not, and never invents a third answer. That
  // refusal is what lets the two outdoor hosts take the whole table
  // without claiming doors they have not built.
  const opened = [];
  const ctx = { openTransport: () => opened.push('transport') };
  assert.equal(routeAction('Transport', ctx), true, 'a door that exists is opened...');
  assert.deepEqual(opened, ['transport']);
  assert.equal(routeAction('UseMagicItem', ctx), false, '...and one that does not is DECLINED, not broken');
  assert.equal(routeAction('NotAnAction', ctx), false);
  assert.deepEqual(opened, ['transport'], 'and nothing else fired');

  // ...and both outdoor hosts really end their ladder on it, INSIDE
  // the overlay/mode gate - a fall-through outside it would open the
  // picker through an open window.
  for (const h of ['exterior', 'world']) {
    const src = rd(`src/scenes/${h}.js`);
    const at = src.indexOf('if (routeAction(act, hudCtx))');
    assert.ok(at > 0, `${h}.js ends its ladder on the table`);
    // INSIDE, checked by BRACE DEPTH rather than by "the gate text
    // appears earlier in the file" - a mutant that moved the line one
    // brace out survived exactly that weaker reading, because the gate
    // is still earlier either way.
    const gate = src.lastIndexOf("!townTalk.overlayActive && (modes?.mode ?? 'exterior') === 'exterior'", at);
    assert.ok(gate > 0 && gate < at, `${h}.js: the gate opens before the fall-through`);
    let depth = 0;
    for (const ch of src.slice(gate, at)) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    assert.ok(depth > 0,
      `${h}.js: the fall-through must sit INSIDE the overlay/mode gate - outside it, the T key would open the picker through an open window`);
  }
});

test('AUDIT-MACK F3: a rig a host builds unconditionally is never optional-chained', () => {
  // MAC-K3 shipped `let mountRig = null` in world.js with
  // `mountRig?.setMode(mode)`, `mountRig?.open()` and
  // `mountRig?.frame(dt)` - three silent no-ops dressed as a guard
  // against the build order. They guarded nothing: the rig is built
  // unconditionally at the top level of the host function and every
  // caller sits in a closure that cannot run before that body has.
  //
  // What the `?.` DID do was turn a broken build order into a player
  // quietly staying on foot through a loaded save, the Test Room's
  // ride and the ship's landing - instead of a throw at the line that
  // broke. `scenes/exterior.js` already had the loud shape; two
  // spellings of one seam is how two hosts drift.
  // COMMENTS STRIPPED FIRST. The note above spells `mountRig?.setMode`
  // to say what it replaced, and the first cut of this pin reddened on
  // its own prose - the same trap AUDIT-EOTB's dead-export walk hit.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const h of ['exterior', 'world']) {
    const raw = rd(`src/scenes/${h}.js`);
    if (!raw.includes('createMountRig(')) continue;
    const src = strip(raw);
    assert.match(src, /const mountRig = createMountRig\(\{/,
      `${h}.js: the rig is a const, bound at its build`);
    assert.ok(!/mountRig\?\./.test(src),
      `${h}.js: no call on the rig may be optional-chained - a silent no-op here is a player left on foot`);
    assert.ok(/mountRig\.setMode\(|mountRig\.open\(|mountRig\.frame\(/.test(src),
      `${h}.js really calls it, so the assertion above is not vacuous`);
  }
});

// ═══ MAC-L1: THE PAUSE DOOR THREW THE SESSION AWAY ════════════════
//
// 2026-09-16, dycaite, on the live site:
//
//   getting this when i press escape indoors (when playing thru the
//   website)
//     TypeError: can't access property "at", w is null
//       togglePause@.../main-C_DM3ji_.js
//   oh... actually, it's also happening outdoors now too
//
// `main-C_DM3ji_` is `ff0cb3b` - the commit AUDIT-MACK shipped. Two
// faults met, and the first of them was written by the fix above.

const PAUSE_HOSTS = ['src/scenes/exterior.js', 'src/scenes/world.js', 'src/scenes/worldModes.js', 'src/scenes/dungeonContext.js'];

test('MAC-L1: the door survives a null, and pauseOpts is its one reader', async () => {
  // THE SECOND FAULT, and the one that made the first fatal: `opts = {}`
  // is a default parameter, and a default parameter fires on `undefined`
  // ALONE. `routeAction`'s own default for `setPlayerPos` is `null`, so
  // the hosts got a hard null and `opts.at` threw.
  const { pauseOpts } = await import('../../src/ui/pauseDoor.js');
  assert.deepEqual(pauseOpts(null), { at: null, setPlayerPos: null }, 'a hard null is an empty door, not a TypeError');
  assert.deepEqual(pauseOpts(undefined), { at: null, setPlayerPos: null });
  assert.deepEqual(pauseOpts({ at: 'stats' }), { at: 'stats', setPlayerPos: null });
  const put = () => {};
  assert.equal(pauseOpts({ setPlayerPos: put }).setPlayerPos, put);
  // A FUNCTION where the options should be - what the old positional
  // call actually delivered when the router had an applier - reads as no
  // options rather than as an option named `at`. This is a law about the
  // ANSWER, not about a guard: `?? {}` alone gives it, because reading a
  // property off a function is `undefined` exactly as it is off `{}`.
  // The campaign proved the extra typeof screen inert and it is gone.
  assert.deepEqual(pauseOpts(put), { at: null, setPlayerPos: null });

  // and every host reads through it rather than off the argument
  for (const f of PAUSE_HOSTS) {
    const src = rd(f).replace(/^\s*\/\/.*$/gm, '');
    assert.match(src, /pauseOpts\(doorOpts\)/, `${f} reads its options through the one reader`);
    assert.doesNotMatch(src, /\bat: opts\.at\b/, `${f} must not read the raw argument`);
  }
});

test('MAC-L1: Escape through routeAction does not throw on ANY host shape', () => {
  // THE CRASH ITSELF, driven. Each host shape is stood up as a ctx and
  // the router is asked for Escape exactly as a keydown does. Before the
  // fix this threw `Cannot read properties of null (reading 'at')` -
  // Firefox words it `can't access property "at", w is null`.
  const seen = [];
  const hostShapes = [
    // the three that read argument one as the options
    ['opts-first', { togglePause: (doorOpts = {}) => { seen.push(doorOpts); } }],
    // ...and a host that pulls the applier back out of the bag
    ['applier-in-the-bag', { togglePause: (doorOpts = {}) => { seen.push(doorOpts?.setPlayerPos ?? null); } }],
  ];
  for (const [name, ctx] of hostShapes) {
    assert.doesNotThrow(() => routeAction('Escape', ctx), `${name}: Escape must never throw - the pause screen is how a player saves`);
  }
  assert.equal(routeAction('Escape', {}), false, 'a host with no door declines, it does not crash');

  // the applier really arrives, so the fix is not "stop passing it"
  const put = () => {};
  routeAction('Escape', { togglePause: (doorOpts = {}) => seen.push(doorOpts.setPlayerPos) }, put);
  assert.equal(seen[seen.length - 1], put, 'the position applier still reaches the door it was always for');
});

test('MAC-L1: the routeAction fall-through is the LAST arm of every ladder it is in', () => {
  // THE ORDERING FAULT. AUDIT-MACK's fall-through was written ABOVE
  // world.js's Escape arm, so the table claimed Escape first and the
  // ladder's own arm - the one that passes NO options and could never
  // have crashed - became unreachable. That is how the signature fault
  // above reached a player at all.
  //
  // A tail that is not last is not a tail. Derived: for each ladder,
  // find the fall-through and assert no named `act === ...` arm follows
  // it in the same block.
  for (const f of ['src/scenes/exterior.js', 'src/scenes/world.js']) {
    const src = rd(f).replace(/^\s*\/\/.*$/gm, '');
    const at = src.indexOf('if (routeAction(act, hudCtx)) { e.preventDefault(); return true; }');
    assert.ok(at > 0, `${f} has the fall-through`);
    // the rest of the enclosing block: up to the brace that closes it
    const after = src.slice(at);
    const end = after.indexOf('\n      }');   // UXB1-S: the ladder is a function of its own now, one level deeper
    assert.ok(end > 0, `${f}: the fall-through's block closes`);
    const tail = after.slice(0, end);
    assert.doesNotMatch(tail, /if \(act === '/,
      `${f}: a named arm below the fall-through is an arm the table has already eaten`);
  }
});

// ═══ MAC-L3: RIGHT CLICK ESCAPED THE GAME ═════════════════════════
//
// 2026-09-16, Orion: "right click in general seems to cause either a
// new window to open, or for the page to refresh to the menu, causing
// unsaved progress to be lost."
//
// Two halves, and neither is really about the right button.

const DOM_DOORS = [
  'src/ui/pauseDoor.js', 'src/ui/inventoryDoor.js', 'src/ui/spellbookDoor.js',
  'src/ui/talkDoor.js', 'src/ui/chronicleDoor.js', 'src/ui/bookDoor.js',
  'src/ui/charSheetDoor.js', 'src/ui/heldMap.js',   // MAP1: the held map took the relief map's seat
];

test('MAC-L3: the browser menu is shut ONCE, on the document, and text entry keeps its own', async () => {
  const { installContextMenuGuard } = await import('../../src/ui/input.js');

  // DRIVEN. A fake document that records its listeners, so the pin sees
  // the guard WORK rather than sees the word `contextmenu` in a file.
  const mk = () => {
    const ls = [];
    return { ls, addEventListener: (t, fn, capture) => ls.push({ t, fn, capture }) };
  };
  const doc = mk();
  assert.equal(installContextMenuGuard(doc), true);
  assert.equal(installContextMenuGuard(doc), false, 'idempotent - four hosts may each install it');
  assert.equal(doc.ls.length, 1, 'and there is still ONE listener');
  const [{ t, fn, capture }] = doc.ls;
  assert.equal(t, 'contextmenu');
  assert.equal(capture, true, 'capture, so it runs before anything the doors bind themselves');

  const fire = (target) => { let p = false; fn({ target, preventDefault: () => { p = true; } }); return p; };
  assert.equal(fire({ tagName: 'CANVAS' }), true, 'the canvas: the right button is the SWING');
  assert.equal(fire({ tagName: 'DIV', className: 'px-window' }), true, 'a DOM door over the canvas - the half that was leaking');
  assert.equal(fire(null), true, 'and a target the browser did not name');
  assert.equal(fire({ tagName: 'INPUT' }), false, 'a text field KEEPS its menu - a player must be able to paste');
  assert.equal(fire({ tagName: 'TEXTAREA' }), false);
  assert.equal(fire({ tagName: 'DIV', isContentEditable: true }), false);
});

test('MAC-L3: every host installs the ONE guard, and none rolls its own', () => {
  // A rule enforced by thirteen copies is a rule enforced by memory.
  // THIRTEEN surfaces are appended to document.body and exactly TWO
  // suppressed the menu themselves, which is why right-clicking the
  // pause screen or the pack opened the browser's.
  for (const f of ['src/scenes/world.js', 'src/scenes/exterior.js', 'src/scenes/worldModes.js', 'src/scenes/dungeon.js']) {
    const src = rd(f).replace(/^\s*\/\/.*$/gm, '');
    assert.match(src, /installContextMenuGuard\(/, `${f} installs the guard`);
    assert.doesNotMatch(src, /addEventListener\('contextmenu'/, `${f} must not roll its own`);
  }
  // ...and the doors do not need one each. (enhancedBook keeps its own
  // because it binds a full listener SET it also tears down; that is a
  // lifecycle, not a second law.)
  const rolled = DOM_DOORS.filter((f) => /addEventListener\('contextmenu'|oncontextmenu/.test(rd(f)));
  assert.deepEqual(rolled, [], 'no DOM door needs its own copy of the rule');
});

test('MAC-L3: a running game guards the way out, and a door the GAME opened does not ask', async () => {
  const g = await import('../../src/systems/unloadGuard.js');
  g.resetUnloadGuard();
  assert.equal(g.unloadGuardArmed(), false, 'nothing armed, nothing asked');
  assert.equal(g.unloadGuardWouldAsk(), false);

  const win = { ls: [], addEventListener(t, fn) { this.ls.push({ t, fn }); } };
  let spawned = false;
  const release = g.armUnloadGuard(() => spawned, win);
  assert.equal(win.ls.length, 1);
  assert.equal(win.ls[0].t, 'beforeunload');

  // THE PREDICATE IS ASKED AT THE NAVIGATION, not at the arming - a host
  // arms at boot and answers honestly later.
  const ask = () => { let p = false; const e = { preventDefault: () => { p = true; }, returnValue: undefined }; win.ls[0].fn(e); return p; };
  assert.equal(ask(), false, 'before the player is placed there is nothing to lose');
  spawned = true;
  assert.equal(ask(), true, 'with a game running, the browser asks');

  // MANY ARMS, ONE ANSWER. A single slot meant the last host to arm
  // replaced the first one's word - the same shape of bug as MAC-L1's
  // one name for two meanings.
  const release2 = g.armUnloadGuard(() => false, win);
  assert.equal(win.ls.length, 1, 'and still one listener');
  assert.equal(ask(), true, 'ANY host saying yes is a yes');
  spawned = false;
  assert.equal(ask(), false);
  release2();
  release();
  assert.equal(g.unloadGuardArmed(), false, 'an arm releases its OWN answer');

  // the game's own door
  spawned = true;
  g.armUnloadGuard(() => spawned, win);
  assert.equal(ask(), true);
  g.releaseUnloadGuard();
  assert.equal(ask(), false, 'exitToTitleMenu stands every arm down before it navigates');
  g.resetUnloadGuard();
});

// ═══ MAC-L4: SPELLS DISAPPEARED FROM THE SPELLBOOK ════════════════
//
// 2026-09-16, bigdaddywetwet: "also it appears that something causes
// spells to disappear from the spellbook".
//
// They were being deleted by a `.filter(Boolean)` at the end of a
// lookup, in a window where the lookup table did not exist yet.

test('MAC-L4: a restore HOLDS a spell it cannot resolve - it never drops it', async () => {
  const { restorePlayer, snapshotPlayer, resolvePendingSpells } = await import('../../src/systems/save/save.js');

  const stock = (index, name) => ({ index, name, effects: [] });
  const table = new Map([[7, stock(7, 'Fireball')], [12, stock(12, 'Heal')]]);
  const made = { custom: true, index: 9001, name: 'Mac’s Own', effects: [] };

  // THE SAVE a player actually has: two stock spells (bare indices) and
  // one made one (a whole record).
  const snap = { version: undefined, spells: [7, 12, made] };

  // ...restored by a host whose SPELLS.STD has NOT landed yet. This is
  // the exact state `scenes/world.js` is in for the first seconds of a
  // session, and the old walk swept both stock spells into nothing.
  const early = { name: 'Mac' };
  restorePlayer(early, { ...snapshotPlayer(Object.assign({ spells: [] }, early)), spells: snap.spells }, null);
  assert.deepEqual(early.spells.map((s) => s.name), ['Mac’s Own'], 'only the made one can be read without a table');
  assert.deepEqual(early.spellsPending, [7, 12], 'and the two it could NOT read are HELD, not dropped');

  // THE KILLER: the next save must not write the loss down. Before this,
  // the emptied list round-tripped and the spells were gone for good.
  const out = snapshotPlayer(early);
  assert.equal(out.spells.length, 3, 'the save still carries all three');
  assert.deepEqual(out.spells.filter((s) => typeof s === 'number').sort((a, b) => a - b), [7, 12]);

  // ...and a later load, with the table, gets them all back.
  const later = { name: 'Mac' };
  restorePlayer(later, out, table);
  assert.deepEqual(later.spells.map((s) => s.name).sort(), ['Fireball', 'Heal', 'Mac’s Own']);
  assert.deepEqual(later.spellsPending, []);

  // ...or the SAME session gets them back the moment the table lands.
  assert.equal(resolvePendingSpells(early, table), 2);
  assert.deepEqual(early.spells.map((s) => s.name).sort(), ['Fireball', 'Heal', 'Mac’s Own']);
  assert.deepEqual(early.spellsPending, []);
  assert.equal(resolvePendingSpells(early, table), 0, 'and nothing is resolved twice');

  // an index no table will ever have is held rather than silently eaten
  const orphan = { name: 'Mac' };
  restorePlayer(orphan, { ...out, spells: [7, 4242] }, table);
  assert.deepEqual(orphan.spells.map((s) => s.name), ['Fireball']);
  assert.deepEqual(orphan.spellsPending, [4242], 'an unknown index is still the player’s data');
});

// ═══ AUDIT-MACL: THE AUDIT OF THE FIX ═════════════════════════════
//
// Three findings against MAC-L itself, all in the half that was
// WIRING rather than law. Two of them are classes this port had
// already named and written down within the week.

test('AUDIT-MACL F4: the large HUD’s options panel is a SECOND route to the same door', async () => {
  // MAC-L1 named the keyboard route and stopped there. `ui/hud/hudLarge.js`
  // dispatches its clicked panels through the SAME table -
  // `routeAction(hit.action, ctx)` - and the options panel's action is
  // `Escape`. So on `ff0cb3b` the crash was reachable by MOUSE, with no
  // key pressed at all: two routes, one door, and only one of them was
  // in the report.
  //
  // That matters beyond bookkeeping. A bug with two routes and one
  // named route is a bug that looks fixed from the report and is not.
  const { LARGE_HUD_PANELS } = await import('../../src/ui/hud/hudLarge.js').catch(() => ({}));
  void LARGE_HUD_PANELS;

  // DRIVEN: the click path, on a host shaped like the three that broke.
  const { routeAction } = await import('../../src/ui/input.js');
  let got;
  assert.doesNotThrow(() => routeAction('Escape', { togglePause: (doorOpts = {}) => { got = doorOpts; } }),
    'the mouse route must not throw either');
  assert.deepEqual(got, { setPlayerPos: null }, 'and it arrives as an OPTIONS BAG, never a bare null');
});

test('AUDIT-MACL F6 (MAC-L2): the banker’s popup is DRIVEN through both arms, and neither throws', async () => {
  // MAC-L2 - "Talking to a banker crashes the game" (Orion) - was closed
  // on a READING of the window contract, which is the weakest evidence
  // this port accepts for anything. It is driven here instead: the
  // banker's popup is the only NPC surface that opens a two-button
  // panel, and it is the one window mounted with `mountInterior` (a
  // PUSH) whose buttons then write the slot DIRECTLY, so the stack and
  // the slot can disagree. That is the mechanism worth a pin whether or
  // not it is the reported crash.
  const { makeWindowStack } = await import('../../src/ui/windowStack.js');
  const { MerchantServiceWindow } = await import('../../src/ui/merchant/merchantServiceWindow.js');

  const host = () => {
    let slot = null;
    const stack = makeWindowStack({ onTop: (w) => { slot = w; } });
    const mount = (w) => {
      if (!w) return;
      stack.reconcile(slot);
      if (stack.containsWindow(w)) return;
      stack.pushWindow(w);
    };
    return { stack, mount, get slot() { return slot; }, set slot(v) { slot = v; } };
  };
  const press = (w, rect) => w.click(95 + rect[0] + 1, 79 + rect[1] + 1);
  const { MERCHANT_RECTS } = await import('../../src/ui/merchant/merchantServiceWindow.js');

  // ARM ONE - SERVICE. The bank window is assigned to the slot directly
  // while the stack still holds the popup; `reconcile` must replace the
  // top rather than leave the two disagreeing for ever.
  {
    const h = host();
    const bank = { done: false, draw() {} };
    const msw = new MerchantServiceWindow({ service: 'Banking', onTalk: () => {}, onService: () => { h.slot = bank; } });
    h.mount(msw);
    assert.equal(h.slot, msw);
    assert.doesNotThrow(() => press(msw, MERCHANT_RECTS.service), 'the service press must not throw');
    assert.equal(msw.done, true, 'the popup closes itself first (DFU order)');
    assert.equal(h.slot, bank, 'and the bank window has the slot');
    for (let i = 0; i < 3; i++) assert.doesNotThrow(() => h.stack.reconcile(h.slot), `frame ${i} must not throw`);
    assert.equal(h.stack.topWindow(), bank, 'the stack caught up with the slot rather than holding a dead popup');
  }

  // ARM TWO - TALK, which is what the report actually names. The popup
  // is `done` and still on the stack when the talk window is pushed
  // over it, so a frame after the talk window closes has a DONE window
  // in the slot. The drain must take it, not choke on it.
  {
    const h = host();
    const talk = { done: false, draw() {}, input() {} };
    const msw = new MerchantServiceWindow({ service: 'Banking', onTalk: () => h.mount(talk), onService: () => {} });
    h.mount(msw);
    assert.doesNotThrow(() => press(msw, MERCHANT_RECTS.talk), 'the talk press must not throw');
    assert.equal(h.slot, talk);
    talk.done = true;
    const seen = [];
    assert.doesNotThrow(() => {
      for (let i = 0; i < 4; i++) {
        if (h.stack.topWindow()?.done) h.stack.popWindow();
        else h.stack.reconcile(h.slot);
        seen.push(h.slot);
      }
    }, 'the drain must not throw on a done popup left under a closed talk window');
    assert.equal(h.slot, null, 'and it unwinds to an empty slot rather than wedging');
    assert.ok(seen.includes(msw), 'the done popup really did surface for a frame - that is the state being pinned');
  }
});
