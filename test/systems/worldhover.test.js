// WORLD-HOVER - THE PLAQUE AT THE CROSSHAIR, driven rather than read.
//
// Mac handed over World Tooltips 1.1 (jefetienne) with two conditions:
// an enhanced skin for it rather than the mod's own tooltip panel, and
// a merge with the loot plaque the port already had (PX21c). This file
// holds the first slice of that - the model, the draw, and the one law
// both exist to keep.
//
// BEHAVIOURAL PINS, against a minimal fake document - the shape
// test/enhancedControls.js uses, grown the two things a plaque needs
// (a classList, because `on` and `has-list` ARE the states, and a
// style.setProperty, because the anchor is two custom properties).
// The source-text pins that hold the seams live beside their subjects
// in enhancedInventory.test.js; what is here is the behaviour, because
// a plaque that says the wrong thing passes every source sweep ever
// written.
//
// A PIN MUST FAIL: each assertion below dies under a one-line change
// to the law it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
  resolveHover, frameSignature, hoverLines, keyItemises, keyPreviews, ITEMISED_KEYS, PREVIEW_KEYS, HOVER_MAX,
  composeActivationTargets, plaqueWindow,
} from '../../src/systems/worldHover.js';
import {
  showWorldPlaque, destroyWorldPlaque, hideWorldPlaque, plaqueAnchor, worldPlaqueOn, worldHoverFrame,
  worldHoverFaults, PLAQUE_GAP, PLAQUE_WATCHDOG_MS, _plaqueSignatureForTests, _setPlaqueClockForTests,
} from '../../src/ui/worldPlaque.js';
import { foldQuickLoot, quickLootWheel, resetQuickLoot, quickLootRow, quickLootStats, quickLootTake, quickLootSelection } from '../../src/systems/quickLoot.js';   // QUICK-LOOT B3: the two draw pins at the foot of this file drive the highlight through its own module
import { PREF_DEFAULTS, setPref } from '../../src/systems/uiPrefs.js';
import { CROSSHAIR_ARM, crosshairCentreY } from '../../src/ui/hud/hudCrosshair.js';
import { hudScale } from '../../src/ui/hud/hud.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole
import { _frameForTests, DRAW_FRAMES_UNDRAWN } from '../../src/ui/drawWatchdog.js';   // DISC29-D: frames that pass undrawn

const read = (p) => hostText(p);

/** The word a HOST's own namer answers for a pile. AUDIT-WH M5: the
 *  model has no fallback of its own any more - an itemised key with no
 *  word draws NOTHING, exactly as a named key does - so a fixture that
 *  drives the item ROWS supplies the title its host would. */
const PILE = () => ({ title: 'Loot Pile' });

// ── A DOCUMENT, JUST ENOUGH OF ONE ───────────────────────────────

function fakeEl(tag) {
  const classes = new Set();
  const n = {
    tag,
    children: [],
    dataset: {},
    attrs: {},
    props: {},
    style: { setProperty(k, v) { n.props[k] = v; } },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((x) => classes.add(x)); },
    get textContent() { return n.children.map((c) => c.textContent ?? '').join(''); },
    set textContent(v) { n.children.length = 0; if (v) n.children.push({ textContent: v, children: [] }); },
    append(...cs) { for (const c of cs) n.children.push(c); },
    setAttribute(k, v) { n.attrs[k] = v; },
    remove() { n.removed = true; const i = _body.indexOf(n); if (i >= 0) _body.splice(i, 1); },
  };
  return n;
}

// AUDIT-WH2 L5-F6/F11: THE FAKE BODY KEEPS ITS CHILDREN.
//
// It used to be `body: { append() {} }` - a no-op - and `root()` looked
// in the `made` array rather than in the document, so every draw
// assertion in this file passed against a DETACHED div. Two mutants
// lived in that gap: deleting `document.body.append(node)` from
// `ensure()` (the plaque draws nothing in a browser, suite stays green)
// and deleting `node?.remove()` from `destroyWorldPlaque()` (every host
// teardown orphans a body child). Both are now killed by
// `bodyChildren()` below.
let _body = [];
const bodyChildren = () => _body;

function withPlaque(fn, { skin = 'enhanced', touch = false } = {}) {
  const made = [];
  _body = [];
  globalThis.document = {
    createElement: (t) => { const e = fakeEl(t); made.push(e); return e; },
    body: { append: (...cs) => { for (const c of cs) _body.push(c); } },
    head: { append() {}, appendChild() {}, querySelector: () => null },
    querySelector: () => null,
    getElementById: () => null,
  };
  const search = `?skin=${skin}${touch ? '&touch=on' : '&touch=off'}`;
  // uiSkin.skinOverride reads globalThis.location; touchDevice.isTouchDevice
  // reads globalThis.window. Both doors, because both gates are real.
  globalThis.location = { search };
  globalThis.window = { location: { search }, matchMedia: () => ({ matches: false }) };
  destroyWorldPlaque();
  try { return fn(() => made.find((e) => e.classList?.contains?.('wplaque')) ?? null); } finally {
    destroyWorldPlaque();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.location;
  }
}

/** Every node under `n` carrying the class. */
function find(n, cls, out = []) {
  if (n?.classList?.contains?.(cls)) out.push(n);
  for (const c of n?.children ?? []) find(c, cls, out);
  return out;
}
const textsOf = (root, cls) => find(root, cls).map((n) => n.textContent);

const hit = (key, distance = 1, reach = 3.2) => ({ key, distance, reach });

// ── THE ONE LAW: IT CANNOT DISAGREE WITH THE DOOR ────────────────

test('WORLD-HOVER: the reach gate is the resolver\'s first act, before anything is named or read', () => {
  // AUDIT 65 MC-2: the pick reaches as far as DFU's ONE ray does
  // (RayDistance, PlayerActivate.cs:76/:314), so a too-far pile still
  // WINS the pick - it just reaches a handler that refuses it out loud.
  // A plaque that trusted the pick alone would name a chest across the
  // room that the activate key cannot open, which is the founding law
  // broken on the first frame.
  let named = 0, read = 0;
  const deps = { name: () => { named += 1; return { title: 'Chest', subs: [] }; },
    contents: () => { read += 1; return [{ name: 'Ruby' }]; } };
  assert.equal(resolveHover(hit('loot:1', 9, 3.2), deps), null, 'out of reach says nothing');
  assert.equal(named + read, 0, 'and nothing was named or read to find that out');
  assert.equal(resolveHover(hit('loot:1', 3.2, 3.2), deps)?.kind, 'items', 'exactly at reach is IN reach');
  assert.equal(resolveHover(hit('loot:1', 3.20001, 3.2), deps), null, 'a hair past it is not');
});

test('WORLD-HOVER: a key the ladder has no word for draws NOTHING, not its own key string', () => {
  // The mod's own behaviour: an empty `ret` leaves the tooltip down
  // (vendor .cs:169-172). It is also what stops a family nobody has ported
  // a namer for from labelling itself `act:2:41` in front of a player.
  assert.equal(resolveHover(hit('act:2:41'), { name: () => null }), null);
  assert.equal(resolveHover(hit('act:2:41'), { name: () => ({ title: '' }) }), null, 'an empty title is no title');
  assert.equal(resolveHover(hit('act:2:41'), {}), null, 'and no namer at all is not a crash');
  assert.equal(resolveHover(null, {}), null, 'nor is nothing under the crosshair');
  assert.equal(resolveHover(hit(null), {}), null, 'nor a hit with no key');
});

test('WORLD-HOVER: only the loot keys itemise - everything else is a name', () => {
  // These are PREFIXES of the keys the hosts' own *Targets() producers
  // mint, never strings written out here. `foeCorpse:`/`guardCorpse:`
  // are the two above-ground bodies, which PX21c could not reach.
  // DW-E3: `dwFish:` is Iliac Puddle No More's fish, a DaggerfallLoot of one item.
  // WB9f: `spoil:` a piece of the Burning Court's spoils on its floor, a pile of one; its gold (`spoilGold:`) a name.
  assert.deepEqual([...ITEMISED_KEYS], ['loot:', 'corpse:', 'droppedLoot:', 'foeCorpse:', 'guardCorpse:', 'dwFish:', 'spoil:']);
  for (const k of ['loot:0', 'corpse:3', 'droppedLoot:9', 'foeCorpse:abc', 'guardCorpse:x', 'dwFish:12', 'spoil:2']) {
    assert.equal(keyItemises(k), true, k);
  }
  for (const k of ['door:2', 'person:1', 'act:1:2', 'exit:0', 'container:4', 'eotbWagon', '17', 'spoilGold:4', null, undefined]) {
    assert.equal(keyItemises(k), false, String(k));
  }
  // and the itemised arm reads contents while the named arm never does
  let read = 0;
  const contents = () => { read += 1; return []; };
  resolveHover(hit('door:2'), { name: () => ({ title: 'Door' }), contents });
  assert.equal(read, 0, 'a door is not a container - it is never asked for one');
  resolveHover(hit('loot:2'), { contents, name: PILE });
  assert.equal(read, 1);
});

test('CONTAINER-PEEK: a cupboard lists what it already holds, and stays a name until it has a list', () => {
  assert.deepEqual([...PREVIEW_KEYS], ['container:', 'decor:']);
  assert.equal(keyPreviews('container:4'), true);
  assert.equal(keyPreviews('decor:chest'), true);
  assert.equal(keyItemises('container:4'), false, 'a cupboard is not a pile - the take stays the press\'s');
  const ruby = { name: 'Ruby' };
  const listed = resolveHover(hit('container:4'), {
    name: () => ({ title: 'Chest', subs: ['Private property'], tone: 'private' }),
    contents: () => [ruby],
  });
  assert.equal(listed.kind, 'items');
  assert.equal(listed.preview, true, 'a glance, not a take list');
  assert.equal(listed.title, 'Chest');
  assert.deepEqual(listed.subs, ['Private property']);
  assert.equal(listed.tone, 'private');
  assert.equal(listed.rows[0].name, 'Ruby');
  assert.equal(listed.empty, false);
  let read = 0;
  const named = resolveHover(hit('container:4'), {
    name: () => ({ title: 'Chest', subs: ['Private property'], tone: 'private' }),
    contents: () => { read += 1; return null; },
  });
  assert.equal(read, 1, 'an unstocked cupboard is asked, and has nothing to list');
  assert.equal(named.kind, 'name', 'so the plaque stays the name, and never says Empty');
  assert.equal(named.tone, 'private');
  assert.equal(named.rows.length, 0);
  const verbs = resolveHover(hit('decor:chair'), {
    name: () => ({ title: 'Chair', actions: [{ id: 'move', label: 'Move' }, { id: 'remove', label: 'Remove' }] }),
    contents: () => null,
  });
  assert.equal(verbs.kind, 'actions', 'decorating lists the verbs; the contents glance does not drop them');
  assert.deepEqual(verbs.rows.map((r) => r.id), ['move', 'remove']);
  let far = 0;
  assert.equal(resolveHover(hit('container:4', 9, 3.2), {
    name: () => { far += 1; return { title: 'Chest' }; }, contents: () => { far += 1; return [ruby]; },
  }), null, 'out of reach, a cupboard is not named and not read');
  assert.equal(far, 0);
});

test('WORLD-HOVER: an itemised frame carries the rows, the tail and the empty flag', () => {
  const many = Array.from({ length: HOVER_MAX + 3 }, (_, i) => ({ name: `x${i}` }));
  const f = resolveHover(hit('loot:1'), { contents: () => many, name: () => ({ title: 'Loot Pile' }) });
  assert.equal(f.kind, 'items');
  assert.equal(f.title, 'Loot Pile', 'the namer\'s title, not a kind label');
  // and the plaque draws HOVER_MAX of them, the rest its tail
  assert.equal(f.rows.length, HOVER_MAX + 3);
  assert.equal(f.rest, 0);
  const drawn = plaqueWindow(f).frame;
  assert.equal(drawn.rows.length, HOVER_MAX);
  assert.equal(drawn.rest, 3);
  assert.equal(f.empty, false);
  const e = resolveHover(hit('corpse:1'), { contents: () => [], name: PILE });
  assert.equal(e.empty, true);
  assert.equal(e.title, 'Loot Pile', 'the namer\'s title again - an empty pile is still named by its host');
  // AUDIT-WH M5: ...and a namer that says NOTHING draws nothing, on an
  // itemised key exactly as on a named one. The model used to fall
  // back to the literal 'Loot' here, a word World Tooltips does not
  // contain, and that fallback is how a dropped pile outdoors read
  // "Loot" for a whole slice while the same pile indoors read the
  // mod's "Loot Pile".
  assert.equal(resolveHover(hit('corpse:1'), { contents: () => [{ name: 'Ruby' }], name: () => null }), null,
    'an itemised key with no word draws nothing, like every other key');
  assert.equal(resolveHover(hit('corpse:1'), { contents: () => [{ name: 'Ruby' }] }), null,
    '...and no namer at all is the same answer, not a different word');
  // QUICK-LOOT-STATS: the row grew an `item` - the source object, so
  // the plaque can read the lit row's stats without walking the pile a
  // second time. This pin's law is unchanged and is about what is
  // DRAWN, so it compares the drawn fields and names the new one
  // separately rather than freezing the whole shape.
  const ruby = { name: 'Ruby', stackCount: 4 };
  const rubyRow = hoverLines([ruby]).shown[0];
  assert.deepEqual({ name: rubyRow.name, stack: rubyRow.stack, rarity: rubyRow.rarity },
    { name: 'Ruby', stack: 4, rarity: null });
  assert.equal(rubyRow.item, ruby, 'and the row carries the item it was made from, by reference');
});

// ── THE GUARD SEES WHAT WOULD BE PAINTED ─────────────────────────

test('WORLD-HOVER: the signature changes when the LIST does, under a constant key', () => {
  // PX21c guarded on the key alone. That cannot see a pile whose
  // contents changed while it was being looked at - a quest machine
  // writing into a container, the room's own word arriving online
  // (WORLD4), or the next arc's quick loot. It was safe by accident
  // (taking needed a window, and the window unmounted the driver) and
  // an accident is not a law.
  const of = (items) => frameSignature(resolveHover(hit('loot:1'), { contents: () => items, name: PILE }));
  const a = of([{ name: 'Ruby' }, { name: 'Helm' }]);
  assert.notEqual(a, of([{ name: 'Helm' }]), 'a row taken');
  assert.notEqual(a, of([{ name: 'Ruby', stackCount: 2 }, { name: 'Helm' }]), 'a stack grown');
  assert.notEqual(a, of([{ name: 'Ruby' }, { name: 'Helm' }, { name: 'Ring' }]), 'a row added');
  assert.equal(a, of([{ name: 'Ruby' }, { name: 'Helm' }]), 'and the same list is the same signature');
  // the sub-lines count too: a door that just got locked reads differently
  const door = (subs) => frameSignature(resolveHover(hit('door:2'), { name: () => ({ title: 'Door', subs }) }));
  assert.notEqual(door([]), door(['Lock Level: 12']));
  assert.equal(frameSignature(null), null);
  // AUDIT-WH2 L5-F5: ...AND THE TITLE, under a CONSTANT KEY.
  //
  // Nothing here ever changed a title without changing the key, so
  // dropping `|${f.title}` from the signature survived. That is PX21c's
  // own bug one field over: a `mobileFoe:0` that turns hostile, or a
  // door whose building resolves on a later frame, keeps the old word on
  // screen for as long as the player keeps looking at it.
  const named = (t) => frameSignature(resolveHover(hit('door:2'), { name: () => ({ title: t }) }));
  assert.notEqual(named('Door'), named('The Rusty Sword'), 'a changed WORD under one key repaints');
  // AUDIT-WH2 L5-F4: ...AND THE TAIL. `rest` is not derivable from
  // `rows` - the rows are capped at HOVER_MAX - so two frames with the
  // same six visible rows and different "and N more" tails collided into
  // one signature and the plaque kept the stale count.
  const many = (n) => frameSignature(resolveHover(hit('loot:1'), {
    contents: () => Array.from({ length: n }, (_, i) => (i < HOVER_MAX ? { name: `Item${i}` } : { name: `Spare${i}` })),
    name: PILE,
  }));
  const six = resolveHover(hit('loot:1'), { contents: () => Array.from({ length: HOVER_MAX + 1 }, (_, i) => ({ name: `Item${i}` })), name: PILE });
  const seven = resolveHover(hit('loot:1'), { contents: () => Array.from({ length: HOVER_MAX + 2 }, (_, i) => ({ name: `Item${i}` })), name: PILE });
  assert.deepEqual(plaqueWindow(six).frame.rows.map((r) => r.name), plaqueWindow(seven).frame.rows.map((r) => r.name), 'the same six rows are visible');
  assert.notEqual(plaqueWindow(six).frame.rest, plaqueWindow(seven).frame.rest, '...and the tails differ');
  assert.notEqual(many(HOVER_MAX + 1), many(HOVER_MAX + 2), 'a changed TAIL under the same visible rows repaints');
});

// ── THE DRAW ─────────────────────────────────────────────────────

test('WORLD-HOVER: the plaque paints the frame, and a null frame TAKES IT DOWN', () => {
  withPlaque((root) => {
    showWorldPlaque(resolveHover(hit('loot:1'), {
      contents: () => [{ name: 'Ruby', stackCount: 3 }, { name: 'Helm' }],
      name: () => ({ title: 'Iron Chest', subs: ['Lock Level: 12'] }),
    }));
    const n = root();
    assert.ok(n, 'a node was made');
    assert.equal(n.classList.contains('on'), true);
    assert.equal(n.classList.contains('has-list'), true, 'the divider only exists where there is something to divide');
    assert.deepEqual(textsOf(n, 'wplaque-title'), ['Iron Chest']);
    assert.deepEqual(textsOf(n, 'wplaque-sub'), ['Lock Level: 12']);
    assert.deepEqual(textsOf(n, 'wplaque-row'), ['Ruby×3', 'Helm']);
    assert.equal(n.attrs['aria-hidden'], 'true', 'the crosshair is not a reading order');

    // A NAMED frame grows no list at all.
    showWorldPlaque(resolveHover(hit('person:4'), { name: () => ({ title: 'Marcus Grey' }) }));
    assert.equal(n.classList.contains('has-list'), false);
    assert.deepEqual(textsOf(n, 'wplaque-title'), ['Marcus Grey']);
    assert.deepEqual(textsOf(n, 'wplaque-row'), []);

    // AND NOTHING TAKES IT DOWN, actively. A persistent DOM overlay
    // stays painted unless it is told otherwise (AUDIT 64 F37) - the
    // notice panel's own law, and the reason ENH-NOTICE1 has a
    // watchdog. The plaque must not rely on a teardown for this.
    showWorldPlaque(null);
    assert.equal(n.classList.contains('on'), false);
    assert.equal(n.classList.contains('has-list'), false);
    assert.equal(n.children.length, 0, 'and it is emptied, not just hidden');
  });
});

test('WORLD-HOVER: one node, rewritten only when what would be painted changes', () => {
  withPlaque((root) => {
    const f = (items) => resolveHover(hit('loot:1'), { contents: () => items, name: PILE });
    showWorldPlaque(f([{ name: 'Ruby' }]));
    const n = root();
    // AUDIT-WH2 L5-F18: `assert.equal(n.children, before)` USED TO SIT
    // HERE and it was a tautology - the fake element's `set textContent`
    // does `n.children.length = 0`, so the array OBJECT survives a full
    // clear-and-refill and the identity holds whether or not the guard
    // ran. The previous audit noticed, added the `__mark` test below
    // that really does catch a deleted guard, and then left this one in
    // place still reading as evidence. Two pins, one law, one of them
    // false: the false one goes.
    const sig = _plaqueSignatureForTests();
    showWorldPlaque(f([{ name: 'Helm' }]));
    assert.notEqual(_plaqueSignatureForTests(), sig, 'a changed list repaints');
    assert.deepEqual(textsOf(n, 'wplaque-row'), ['Helm']);
  });
});

test('WORLD-HOVER: the empty container says so', () => {
  withPlaque((root) => {
    showWorldPlaque(resolveHover(hit('corpse:2'), { contents: () => [], name: () => ({ title: 'Remains' }) }));
    assert.deepEqual(textsOf(root(), 'wplaque-empty'), ['Empty']);
  });
});

test('WORLD-HOVER: a long pile says how many more rather than growing', () => {
  withPlaque((root) => {
    const many = Array.from({ length: HOVER_MAX + 4 }, (_, i) => ({ name: `x${i}` }));
    showWorldPlaque(resolveHover(hit('loot:1'), { contents: () => many, name: PILE }));
    assert.deepEqual(textsOf(root(), 'wplaque-more'), ['and 4 more']);
    assert.equal(find(root(), 'wplaque-row').length, HOVER_MAX + 1, 'six rows and the tail - a pile is a glance');
  });
});

// ── WHERE IT HANGS ───────────────────────────────────────────────

test('WORLD-HOVER: the anchor is the reticle\'s own, a fixed gap BELOW the cross', () => {
  // PX21c stood the plaque at `bottom: 16%` because it had no way to
  // read the cross's real place, and said so in a comment ("centred low
  // so it never sits on the reticle"). hud.js exports the two terms its
  // own crosshair draw uses, so there is ONE answer to "where is the
  // reticle" and the plaque asks it.
  const canvas = { width: 1600, height: 900, clientWidth: 800 };   // dpr 2
  const a = plaqueAnchor(canvas);
  assert.equal(a.x, 400, 'the middle, in CSS pixels');
  // centre 450 device px, + the arm, / dpr, + the gap. The cross is
  // never covered because the plaque STARTS below its lower tip and
  // grows downward, in any state at any length.
  // The cross is never covered because the plaque STARTS below its
  // lower tip and grows downward, in any state at any length. The terms
  // are hud.js's own, so this pin dies if the plaque ever derives a
  // second copy of them.
  const s = hudScale(canvas.width, canvas.height);
  const centre = crosshairCentreY(canvas.height, 0);
  assert.equal(centre, 450);
  assert.equal(a.top, (centre + CROSSHAIR_ARM * s) / 2 + PLAQUE_GAP);
  // AUDIT-WH2 L5-F19: `a.top` IS `(centre + CROSSHAIR_ARM * s) / 2 +
  // PLAQUE_GAP`, so the old assertion here read `X + PLAQUE_GAP > X` and
  // could only fail if the gap went negative. The claim worth pinning is
  // the one the sentence above makes - the plaque starts below the
  // cross's LOWER TIP - so measure against the tip itself.
  const lowerTip = (centre + CROSSHAIR_ARM * s) / 2;
  assert.equal(a.top - lowerTip, PLAQUE_GAP, 'exactly the gap below the cross\'s lower tip');
  assert.ok(a.top > lowerTip, 'strictly below the cross\'s lower tip');
  assert.equal(plaqueAnchor(null), null);
  assert.equal(plaqueAnchor({ width: 0, height: 0 }), null, 'an unsized canvas has no anchor');
});

test('AUDIT-WH2 L5-F1: the SEAM moves the plaque - a host hands it a canvas and the name follows the reticle', () => {
  // A mutant proved this was unheld against the WHOLE 972-file suite:
  // `showWorldPlaque(frame, plaqueAnchor(canvas))` -> `showWorldPlaque(frame)`
  // survived it. Every anchor pin in this file calls `plaqueAnchor` and
  // `showWorldPlaque` BY HAND; not one ever passed a `canvas` through
  // `worldHoverFrame`, which is the only door four hosts use. In the
  // shipping game the plaque would have sat wherever the first paint put
  // it - through a resize, through a large HUD docking, forever.
  withPlaque((root) => {
    const collider = { raycast: () => Infinity };
    const targets = () => [{ key: 'person:1', aabb: { min: [-1, -1, 1], max: [1, 1, 2] }, distance: 76.8, reach: 6.4 }];
    const frame = (canvas) => worldHoverFrame({
      eye: [0, 0, 0], dir: [0, 0, 1], collider, targets, canvas,
      name: () => ({ title: 'Marcus Grey' }), contents: () => null,
    });
    frame({ width: 1600, height: 900, clientWidth: 800 });
    const n = root();
    assert.ok(n, 'the seam painted');
    assert.equal(n.props['--wp-x'], '400.0px', 'the seam asked plaqueAnchor, not nothing');
    const wide = n.props['--wp-top'];
    // ...and it asks EVERY frame, so a resize moves the name with the
    // reticle rather than stranding it at the old centre.
    frame({ width: 800, height: 1200, clientWidth: 400 });
    assert.equal(n.props['--wp-x'], '200.0px', 'a resized canvas moves the plaque');
    assert.notEqual(n.props['--wp-top'], wide, '...in both axes');
    // A host that hands NO canvas still draws - the anchor is optional,
    // the name is not (the CSS defaults hold it at mid-screen).
    frame(null);
    assert.equal(n.classList.contains('on'), true, 'no canvas is not no plaque');
  });
});

test('WORLD-HOVER: the anchor is written as custom properties, and only when it moves', () => {
  withPlaque((root) => {
    const canvas = { width: 1600, height: 900, clientWidth: 800 };
    const f = resolveHover(hit('person:1'), { name: () => ({ title: 'Marcus Grey' }) });
    showWorldPlaque(f, plaqueAnchor(canvas));
    const n = root();
    assert.equal(n.props['--wp-x'], '400.0px');
    assert.match(n.props['--wp-top'], /px$/);
    n.props['--wp-x'] = 'TOUCHED';
    showWorldPlaque(f, plaqueAnchor(canvas));
    assert.equal(n.props['--wp-x'], 'TOUCHED', 'an unmoved reticle does not rewrite the style');
    showWorldPlaque(f, plaqueAnchor({ width: 800, height: 900, clientWidth: 800 }));
    assert.equal(n.props['--wp-x'], '400.0px', 'and a moved one does');
  });
});

// ── THE TWO GATES ────────────────────────────────────────────────

test('AUDIT-WH2 L5-F6/F11: the plaque is ON THE PAGE while it lives, and OFF it when the host unwinds', () => {
  // Two mutants, one gap. `ensure()` without `document.body.append(node)`
  // and `destroyWorldPlaque()` without `node?.remove()` BOTH survived the
  // suite, because nothing here had ever looked in the document - the
  // harness's body was a no-op and `root()` searched the created-element
  // list instead. A plaque that is never attached draws nothing in a
  // browser; one that is never detached is orphaned on every mode change,
  // which is the allocation-owner law this slice is pinned on hardest.
  withPlaque((root) => {
    assert.equal(bodyChildren().length, 0, 'nothing on the page before the first draw');
    showWorldPlaque(resolveHover(hit('person:1'), { name: () => ({ title: 'Marcus Grey' }) }));
    const n = root();
    assert.ok(n, 'a node was built');
    assert.ok(bodyChildren().includes(n), 'and it is ATTACHED - a detached plaque draws nothing in a browser');
    // a hide leaves it attached: it is reused every frame and only the
    // teardown owns its removal.
    showWorldPlaque(null);
    assert.ok(bodyChildren().includes(n), 'a hide blanks it, it does not orphan it');
    destroyWorldPlaque();
    assert.equal(n.removed, true, 'the teardown removed it');
    assert.equal(bodyChildren().includes(n), false, '...and it is off the page, not merely unreferenced');
  });
});

test('AUDIT-WH2 L5-F8: the TITLE is painted above the sub-lines and the rows', () => {
  // `textsOf` collects by class, so document order was never asserted and
  // moving `n.append(title)` below the subs loop survived. Every plaque
  // in the game would read "Lock Level: 12 / To The Rusty Sword".
  withPlaque((root) => {
    showWorldPlaque(resolveHover(hit('door:2'), { name: () => ({ title: 'The Rusty Sword', subs: ['Lock Level: 12'] }) }));
    const classes = root().children.map((c) => c.className ?? '');
    assert.ok(classes.length >= 2, 'a title and a sub-line were painted');
    assert.match(classes[0], /wplaque-title/, 'the title is FIRST in the tree, not merely present');
    assert.ok(classes.findIndex((c) => /wplaque-sub/.test(c)) > 0, '...and the sub-lines come after it');
  });
});

test('AUDIT-WH2 L5-F3: a bad namer is said ONCE, not once a frame', () => {
  // ONCRASH1's idiom is "a latch, not a per-frame console", and the latch
  // was held by prose plus the sight of `_faultSaid = false` in the
  // teardown - never by behaviour. `if (!_faultSaid)` -> `if (true)`
  // survived. A third-party namer that throws would put 60 lines a second
  // into the console of a game that is otherwise running fine.
  const warn = console.warn;
  const said = [];
  console.warn = (m) => said.push(m);
  try {
    withPlaque(() => {
      const exploding = () => { throw new TypeError('boom'); };
      for (let i = 0; i < 5; i++) {
        worldHoverFrame({
          eye: [0, 0, 0], dir: [0, 0, 1], collider: { raycast: () => Infinity },
          targets: () => [{ key: 'loot:0', aabb: { min: [-1, -1, 1], max: [1, 1, 2] }, distance: 76.8, reach: 3.2 }],
          name: exploding, contents: () => [],
        });
      }
      assert.equal(worldHoverFaults(), 5, 'every frame is counted');
      assert.equal(said.length, 1, '...and exactly one is SAID');
      assert.match(said[0], /world-hover/);
    });
    // ...and the latch is re-armed by the teardown, so the next host says it once too.
    said.length = 0;
    withPlaque(() => {
      worldHoverFrame({
        eye: [0, 0, 0], dir: [0, 0, 1], collider: { raycast: () => Infinity },
        targets: () => [{ key: 'loot:0', aabb: { min: [-1, -1, 1], max: [1, 1, 2] }, distance: 76.8, reach: 3.2 }],
        name: () => { throw new TypeError('boom'); }, contents: () => [],
      });
      assert.equal(said.length, 1, 'a new host gets its own one line');
    });
  } finally { console.warn = warn; }
});

test('AUDIT-WH2 L3-F1: the GATE the hosts reach takes the plaque DOWN, it does not merely stop drawing', () => {
  // L5 put the hide on `showWorldPlaque`. `grep -rn showWorldPlaque
  // src/scenes/` returns NOTHING - every host calls `worldHoverFrame` and
  // only `worldHoverFrame`, whose gate was a bare `return null` - so the
  // fix was unreachable in production for its whole life. Both terms of
  // the gate can flip under a painted plaque: the skin is a live setting
  // and `isTouchDevice` reads a media query a tablet-mode flip changes.
  withPlaque((root) => {
    const seam = () => worldHoverFrame({
      eye: [0, 0, 0], dir: [0, 0, 1], collider: { raycast: () => Infinity },
      targets: () => [{ key: 'person:1', aabb: { min: [-1, -1, 1], max: [1, 1, 2] }, distance: 76.8, reach: 6.4 }],
      name: () => ({ title: 'Wardrobe' }), contents: () => null,
    });
    seam();
    const n = root();
    assert.equal(n.classList.contains('on'), true, 'a name is on screen');
    // the flip a tablet makes, under the painted plaque
    globalThis.window.matchMedia = () => ({ matches: true });
    globalThis.location.search = '?skin=enhanced&touch=on';
    globalThis.window.location.search = '?skin=enhanced&touch=on';
    assert.equal(worldPlaqueOn(), false, 'the gate is shut');
    assert.equal(seam(), null, 'and the seam refuses');
    assert.equal(n.classList.contains('on'), false, '...and the stranded name is GONE, not left painted');
  });
});

test('AUDIT-WH2 L3-F2: the plaque has a heartbeat - frames that stop coming take it down', () => {
  // The seam's try/catch contains a throw INSIDE the hover call. It
  // cannot contain one BESIDE it: each host runs hundreds of lines
  // between `worldHoverFrame(...)` and its bare
  // `requestAnimationFrame(frame)`, which is not in a `finally`. A DOM
  // overlay stays painted unless it is told otherwise (AUDIT 64 F37), so
  // the last name floated over a game that had stopped. ENH-NOTICE1 met
  // the same shape and answered it the same way.
  let armed = null;
  const fired = [];
  _setPlaqueClockForTests((fn, ms) => { armed = { fn, ms }; return { id: fired.length }; }, (t) => { if (t) fired.push(t); });
  try {
    withPlaque((root) => {
      showWorldPlaque(resolveHover(hit('person:1'), { name: () => ({ title: 'Marcus Grey' }) }));
      const n = root();
      assert.ok(armed, 'a draw arms the watchdog');
      assert.equal(armed.ms, PLAQUE_WATCHDOG_MS);
      assert.equal(n.classList.contains('on'), true);
      // ...and it is re-armed by every draw, including the ones the
      // signature short-circuits - a plaque standing still on one name is
      // still a live frame.
      armed = null;
      showWorldPlaque(resolveHover(hit('person:1'), { name: () => ({ title: 'Marcus Grey' }) }));
      assert.ok(armed, 'an unchanged frame re-arms it too');
      // DISC29-D: a frame SLOWER than the timer is not a stop - the timer fires with no frame gone by undrawn, and
      // the plaque stays (the check re-arms) rather than coming down and going up again every slow frame
      const slow = armed;
      armed = null;
      slow.fn();
      assert.equal(n.classList.contains('on'), true, 'a slow frame keeps the plaque');
      assert.ok(armed, 'and re-arms the heartbeat');
      // now the frames stop, and the timer is what is left
      _frameForTests(DRAW_FRAMES_UNDRAWN);
      armed.fn();
      assert.equal(n.classList.contains('on'), false, 'a plaque nobody is drawing comes down by itself');
    });
  } finally { _setPlaqueClockForTests(
    (fn, ms) => (typeof setTimeout === 'function' ? setTimeout(fn, ms) : null),
    (t) => { if (t != null && typeof clearTimeout === 'function') clearTimeout(t); },
  ); }
});

test('WORLD-HOVER: the classic skin never builds a node, and never injects the sheet', () => {
  // AUDIT 39's finding, and it matters MORE now: four hosts calling one
  // seam is four more chances to reach ensure() on a classic page,
  // where injectEnhancedStyle() would put the enhanced sheet's UNSCOPED
  // head rules (`*`, `html, body`, `body`, `button`, `#app`) onto it.
  withPlaque((root) => {
    assert.equal(worldPlaqueOn(), false);
    showWorldPlaque(resolveHover(hit('loot:1'), { contents: () => [{ name: 'Ruby' }], name: PILE }));
    assert.equal(root(), null, 'no node, so no sheet');
    assert.equal(worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider: {}, targets: () => [] }), null);
  }, { skin: 'classic' });
});

test('WORLD-HOVER: a touch device gets no plaque at all', () => {
  // There the activation ray is through the FINGER (`_tapPoint` ->
  // `_tapDir` through rayDirFromScreen), not the crosshair - so a
  // centre-anchored plaque would name what a tap would NOT open. A
  // wrong answer delivered confidently is worse than no answer.
  withPlaque((root) => {
    assert.equal(worldPlaqueOn(), false);
    showWorldPlaque(resolveHover(hit('loot:1'), { contents: () => [{ name: 'Ruby' }], name: PILE }));
    assert.equal(root(), null);
  }, { touch: true });
});

// ── THE SEAM ─────────────────────────────────────────────────────

test('WORLD-HOVER: the seam pulls the target list through a THUNK, and not at all when it cannot answer', () => {
  // The cost of a hover in this port is not the ray (~3us) and not the
  // pick (~21ns a target) - it is BUILDING the target list, 95-97% of
  // it. A thunk lets a host hand over a list it is already holding, or
  // rebuild one only when something moved, without this seam knowing.
  withPlaque(() => {
    let pulled = 0;
    const targets = () => { pulled += 1; return []; };
    const collider = { raycast: () => Infinity };   // collider.raycast answers Infinity on a miss
    worldHoverFrame({ eye: null, dir: [0, 0, 1], collider, targets });
    worldHoverFrame({ eye: [0, 0, 0], dir: null, collider, targets });
    worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider: null, targets });
    worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider, targets, cursorActive: true });
    assert.equal(pulled, 0, 'a frame that cannot answer pays nothing');
    worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider, targets });
    assert.equal(pulled, 1);
  });
});

test('WORLD-HOVER: an open window takes the plaque down - by law, not by scheduling', () => {
  // In the dungeon this was an accident: the driver only ran when no
  // overlay was up. `cursorActive` is the crosshair's OWN first
  // statement (hudCrosshair.js) and it is now the plaque's, so a host
  // with no such accident behaves the same.
  withPlaque((root) => {
    const collider = { raycast: () => Infinity };   // collider.raycast answers Infinity on a miss
    const targets = () => [{ key: 'loot:1', aabb: { min: [-1, -1, 0.5], max: [1, 1, 2] }, reach: 3.2 }];
    const f = worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider, targets,
      contents: () => [{ name: 'Ruby' }], name: PILE });
    assert.equal(f?.key, 'loot:1', 'the pick found it');
    assert.equal(root().classList.contains('on'), true);
    assert.equal(worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider, targets, cursorActive: true }), null);
    assert.equal(root().classList.contains('on'), false, 'and the node is actually hidden, not merely skipped');
  });
});

test('SKIN-PLAQUE (FIELD BUGS 2026-10-16c): a gathering act\'s pick (gatherHost ACT_OWNS_LOOK) takes the plaque and its loot rows down - the body under the knife behind it is not named, and nothing stays lit for the wheel or a take', async () => {
  const { ACT_OWNS_LOOK } = await import('../../src/scenes/gatherHost.js');
  withPlaque((root) => {
    resetQuickLoot();
    const collider = { raycast: () => Infinity };
    const body = { key: 'loot:1', distance: 1, reach: 3.2 };
    const deps = { eye: [0, 0, 0], dir: [0, 0, 1], collider, contents: () => [{ name: 'Raw Meat' }, { name: 'Smelly Raw Meat' }], name: PILE };
    assert.equal(worldHoverFrame({ ...deps, pick: () => body })?.key, 'loot:1', 'no act: the body\'s loot is the plaque\'s');
    assert.equal(root().classList.contains('on'), true);
    assert.notEqual(quickLootSelection(), null);
    // the hosts' own shape: `gatherHost.hoverHit(ray) ?? ray` - the act's pick is kept over the body behind it
    assert.equal(worldHoverFrame({ ...deps, pick: () => ACT_OWNS_LOOK ?? body }), null);
    assert.equal(root().classList.contains('on'), false, 'the plaque is down mid-act');
    assert.equal(quickLootSelection(), null, 'and nothing is lit for the wheel or a take');
  });
});

test('WORLD-HOVER: the seam resolves through the SAME pick the take runs', () => {
  // The whole law, end to end: a target in reach is named, the same
  // target out of reach is not, and the difference is the pick's own
  // `reach` - not a second distance this module invented.
  withPlaque(() => {
    const collider = { raycast: () => Infinity };   // collider.raycast answers Infinity on a miss
    const near = () => [{ key: 'loot:1', aabb: { min: [-1, -1, 1], max: [1, 1, 2] }, reach: 3.2 }];
    const far = () => [{ key: 'loot:1', aabb: { min: [-1, -1, 40], max: [1, 1, 41] }, reach: 3.2 }];
    const deps = { contents: () => [{ name: 'Ruby' }], name: PILE };
    assert.equal(worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider, targets: near, ...deps })?.key, 'loot:1');
    assert.equal(worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider, targets: far, ...deps }), null,
      'the pick WINS it and the reach gate refuses it - DFU says nothing about a pile you cannot open');
  });
});

test('WORLD-HOVER: an occluded target is not named', () => {
  // pickActivatableHit casts ONE ray at the winner, and a wall in
  // front of it is the answer. The plaque inherits that for free,
  // which is the point of asking the same pick.
  withPlaque(() => {
    const targets = () => [{ key: 'loot:1', aabb: { min: [-1, -1, 1], max: [1, 1, 2] }, reach: 3.2 }];
    const deps = { contents: () => [{ name: 'Ruby' }], name: PILE };
    const open = { raycast: () => Infinity };
    const walled = { raycast: () => 0.4 };   // a wall well in front of the box, and outside it
    assert.equal(worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider: open, targets, ...deps })?.key, 'loot:1');
    assert.equal(worldHoverFrame({ eye: [0, 0, 0], dir: [0, 0, 1], collider: walled, targets, ...deps }), null);
  });
});

// ── ONE CONSTRUCTION SEAM ────────────────────────────────────────

test('WORLD-HOVER: the seam composes the context\'s own families and the host\'s, in that order', () => {
  // Driven, not read: a registry that silently drops a producer, or
  // appends one twice, passes every source sweep above.
  const own = [{ key: 'loot:0' }];
  const a = [{ key: 'exit:0' }];
  const b = [{ key: 'person:0' }];
  const hosts = [];
  const add = (fn) => { hosts.push(fn); return () => { const i = hosts.indexOf(fn); if (i >= 0) hosts.splice(i, 1); }; };
  assert.deepEqual(composeActivationTargets(own, hosts), own, 'nothing registered is the context alone');
  const off = add(() => a);
  add(() => b);
  add(() => []);
  add(() => null);
  assert.deepEqual(composeActivationTargets(own, hosts).map((t) => t.key), ['loot:0', 'exit:0', 'person:0'],
    'the context first, then each host family in the order it was registered; an empty one adds nothing');
  off();
  assert.deepEqual(composeActivationTargets(own, hosts).map((t) => t.key), ['loot:0', 'person:0'],
    'and a producer that leaves takes its family with it');
});

// ── WORLD TOOLTIPS' NAMING LADDER ────────────────────────────────
//
// The mod's own words, ported 1:1 from `vendor/world-tooltips/Scripts/
// Modded_HUDTooltipWindow.cs`. Every assertion names the line it holds.

test('WORLD TOOLTIPS: the sixteen Daedra by BILLBOARD RECORD, which is not the summoning table\'s order', async () => {
  const wt = await import('../../src/systems/worldTooltips.js');
  const ds = await import('../../src/systems/daedraSummoning.js');
  // .cs:334-384 - archive 175, records 0..15.
  assert.equal(wt.DAEDRA_BY_RECORD.length, 16);
  assert.equal(wt.npcHoverName('Somebody', { archive: 175, record: 0 }), 'Azura');
  assert.equal(wt.npcHoverName('Somebody', { archive: 175, record: 14 }), 'Sheogorath');
  assert.equal(wt.npcHoverName('Somebody', { archive: 175, record: 15 }), 'Vaermina');
  // ...and anything that is NOT a summoning billboard keeps its own name.
  assert.equal(wt.npcHoverName('Marcus Grey', { archive: 334, record: 0 }), 'Marcus Grey');
  assert.equal(wt.npcHoverName('Marcus Grey', { archive: 175, record: 99 }), 'Marcus Grey', 'a record past the table');
  assert.equal(wt.npcHoverName('', { archive: 334, record: 1 }), null, 'a nameless NPC says nothing');
  // THE TWO TABLES ARE DIFFERENT ORDERINGS OF ONE PANTHEON, on purpose.
  // systems/daedraSummoning.js is by factionId and its index 8 is
  // load-bearing for the summoning itself; this one is by billboard
  // record. Re-sorting either to serve the other breaks the other.
  const summoning = ds.DAEDRA.map((d) => d.name);
  assert.notDeepEqual([...wt.DAEDRA_BY_RECORD], summoning, 'two orderings, not one');
  assert.equal(summoning[8], 'Sheogorath', 'the summoning table\'s load-bearing index');
  assert.equal(wt.DAEDRA_BY_RECORD[8], 'Meridia', 'and the billboard table disagrees with it, correctly');
  // The spelling difference is real and deliberate: this table is the
  // MOD's, verbatim; the other is Daggerfall's own.
  assert.ok(summoning.includes('Vaernima'), 'the port\'s summoning table keeps Daggerfall\'s spelling');
  assert.ok(wt.DAEDRA_BY_RECORD.includes('Vaermina'), 'the mod\'s table keeps the mod\'s');
});

test('WORLD TOOLTIPS: an action object is named by its model, and an unlisted MultiTrigger says NOTHING', async () => {
  const { actionName, INTERACT_TEXT } = await import('../../src/systems/worldTooltips.js');
  const { TRIGGER_FLAGS } = await import('../../src/world/rdbLayout.js');
  // .cs:420-431 - the three the mod names outright.
  assert.equal(actionName(TRIGGER_FLAGS.Direct, 74037), 'Wheel');
  assert.equal(actionName(TRIGGER_FLAGS.Direct, 61027), 'Lever');
  assert.equal(actionName(TRIGGER_FLAGS.Direct6, 61028), 'Lever');
  assert.equal(actionName(TRIGGER_FLAGS.Direct, 74143), 'The Mantella');
  // .cs:403-405 - only Direct, Direct6 and MultiTrigger are named at
  // all. The rest are chain links and traps the player is not meant to
  // read as interactive.
  for (const t of [TRIGGER_FLAGS.None, TRIGGER_FLAGS.Collision01, TRIGGER_FLAGS.Collision03,
    TRIGGER_FLAGS.Collision09, TRIGGER_FLAGS.Attack, TRIGGER_FLAGS.Door]) {
    assert.equal(actionName(t, 74037), null, `trigger ${t} is not named`);
  }
  // .cs:465-466 - a named-trigger object with no word of its own.
  assert.equal(actionName(TRIGGER_FLAGS.Direct, 12345), INTERACT_TEXT);
  assert.equal(actionName(TRIGGER_FLAGS.Direct, 12345, { hideInteract: true }), null,
    'HideDefaultInteractTooltip - the author\'s own knob, so the main quest\'s puzzles are not given away');
  // .cs:459-461 - THE MULTITRIGGER RULE, and the reason for it:
  // MultiTrigger is the flag on collision plates and trap volumes, so
  // an unlisted one is SILENCED outright rather than defaulted.
  assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, 12345), null, 'a pressure pad is not labelled');
  assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, 74037), 'Wheel', 'but a named one still speaks');
  // .cs:432-437 - four the mod lets through WITHOUT a name of their own.
  for (const id of [62323, 72019, 74215, 74225]) {
    assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, id), INTERACT_TEXT, `${id} is allowed through`);
    assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, id, { hideInteract: true }), null);
  }
});

test('WORLD TOOLTIPS: a pile of ONE is named by that item; a corpse is named by who it was', async () => {
  const { lootPileName, corpseName, LOOT_PILE_TEXT } = await import('../../src/systems/worldTooltips.js');
  // .cs:534-548 - exactly one item names the pile, with its stack count.
  const ruby = { name: 'Ruby', templateIndex: -1 };
  assert.equal(lootPileName([]), LOOT_PILE_TEXT);
  assert.equal(lootPileName(null), LOOT_PILE_TEXT);
  assert.equal(lootPileName([ruby, { name: 'Helm', templateIndex: -1 }]), LOOT_PILE_TEXT, 'two is a pile');
  assert.match(lootPileName([ruby]), /Ruby/);
  assert.match(lootPileName([{ ...ruby, stackCount: 4 }]), /\(4\)$/, 'the stack count, in parentheses');
  assert.doesNotMatch(lootPileName([{ ...ruby, stackCount: 1 }]), /\(1\)$/, 'a stack of one is not a count');
  // .cs:526
  assert.equal(corpseName('Skeletal Warrior'), 'Skeletal Warrior (dead)');
  // AUDIT-WH M9: and NOTHING ELSE. `loot.entityName + " (dead)"` has no
  // fallback, and the port had invented 'Body' for a nameless one - a
  // word World Tooltips does not contain, on a branch neither pool can
  // reach (both name a body through `enemyDisplayName`, which answers
  // for every mobile in the table). An invented word on an unreachable
  // branch is still an invented word, and this pin was asserting it.
  assert.equal(corpseName(''), ' (dead)', 'the mod has no fallback, so neither has this');
  assert.equal(corpseName(undefined), ' (dead)');
});

test('WORLD TOOLTIPS: a door says its lock level only when it is locked', async () => {
  const { actionDoorName } = await import('../../src/systems/worldTooltips.js');
  // .cs:641-650 - the mod joins the two with `\r`; the port carries the
  // second as a sub-line, because a DOM line is a node.
  assert.deepEqual(actionDoorName(false, 0), { title: 'Door' });
  assert.deepEqual(actionDoorName(true, 12), { title: 'Door', subs: ['Lock Level: 12'] });
});

test('WORLD TOOLTIPS: a static door names where it goes, its lock, and the shop it says is shut', async () => {
  const { staticDoorName } = await import('../../src/systems/worldTooltips.js');
  const { BUILDING_TYPES } = await import('../../src/world/buildingNames.js');
  // .cs:763-771 - stepping out, or into a dungeon, names the place.
  assert.deepEqual(staticDoorName('buildingExit', { locationName: 'Daggerfall' }), { title: 'To\nDaggerfall' });
  assert.deepEqual(staticDoorName('dungeonEntrance', { locationName: 'Privateer\'s Hold' }), { title: 'To\nPrivateer\'s Hold' });
  // .cs:777-782 - a dungeon exit names its TOWN, or the region when
  // there is no town, because you step out into open country.
  assert.deepEqual(staticDoorName('dungeonExit', { locationName: 'Daggerfall', regionName: 'Daggerfall', inTown: true }),
    { title: 'To\nDaggerfall' });
  assert.deepEqual(staticDoorName('dungeonExit', { locationName: 'Privateer\'s Hold', regionName: 'Tigonus', inTown: false }),
    { title: 'To\nTigonus Region' });
  // .cs:726-733 - Town23 is the city wall, which has no name of its own.
  assert.deepEqual(staticDoorName('building', { buildingType: BUILDING_TYPES.Town23, locationName: 'Daggerfall', unlocked: true }),
    { title: 'To\nDaggerfall City Walls', subs: [] });
  // .cs:735-738 - the lock level, only when locked, off the port's own
  // GetBuildingLockValue (quality / 2).
  const shut = staticDoorName('building', { displayName: 'The Rusty Sword', buildingType: BUILDING_TYPES.GeneralStore, unlocked: false, quality: 20 });
  assert.equal(shut.title, 'To\nThe Rusty Sword');
  assert.equal(shut.subs[0], 'Lock Level: 10');
  assert.match(shut.subs[1], /^Store is closed\. Open from \d+:00 to \d+:00\.$/, 'the sentence, from its ONE home');
  // TWO DEPARTURES OF THE MOD'S OWN FROM PlayerActivate, ported as the
  // mod's rather than folded into the port's pinned activateBuilding:
  // the gate is `<= Palace` where DFU's is `< Temple`...
  const temple = staticDoorName('building', { displayName: 'Temple', buildingType: BUILDING_TYPES.Temple, unlocked: false, quality: 20 });
  assert.equal(temple.subs.length, 2, 'the mod tells you a temple is shut; DFU does not');
  // ...and a Palace substitutes its own word for "Store".
  const palace = staticDoorName('building', { displayName: 'Castle Daggerfall', buildingType: BUILDING_TYPES.Palace, unlocked: false, quality: 20 });
  assert.match(palace.subs[1], /^Palace is closed\./);
  // An unlocked building says only where it goes.
  const open = staticDoorName('building', { displayName: 'The Rusty Sword', buildingType: BUILDING_TYPES.GeneralStore, unlocked: true });
  assert.deepEqual(open.subs, []);
  // ...and a door onto nothing named says nothing at all.
  assert.equal(staticDoorName('building', { displayName: '', unlocked: true }), null);
  assert.equal(staticDoorName('buildingExit', { locationName: '' }), null);
  assert.equal(staticDoorName('nonsense', {}), null);
});

test('WORLD TOOLTIPS: a quest ITEM stand is named; the Totem is named by hand', async () => {
  const { questResourceName, TOTEM_TEXT } = await import('../../src/systems/worldTooltips.js');
  // .cs:491-505 - archive 211 record 54, before the resolver runs.
  assert.equal(questResourceName(null, { archive: 211, record: 54 }), TOTEM_TEXT);
  assert.equal(questResourceName({ name: 'Ruby', templateIndex: -1 }, { archive: 211, record: 54 }), TOTEM_TEXT,
    'the billboard wins over the item');
  assert.match(questResourceName({ name: 'Ruby', templateIndex: -1 }, { archive: 211, record: 0 }), /Ruby/);
  assert.equal(questResourceName(null, { archive: 211, record: 0 }), null, 'no item, no word');
});

test('WORLD TOOLTIPS: the naming ladder is insertion order, first answer with a title wins', async () => {
  const { composeNamer } = await import('../../src/systems/worldHover.js');
  // The mod's extension API (vendor .cs:228-257): a Map keyed by reach,
  // walked in insertion order, FIRST NON-EMPTY WINS, run before the
  // mod's own ladder. The port keeps the law and drops the key, because
  // reach is already decided by the pick.
  const n = composeNamer([
    (k) => (k === 'a' ? { title: 'first' } : null),
    (k) => (k === 'a' ? { title: 'second' } : null),
    (k) => (k === 'b' ? { title: 'b' } : null),
    null,
    (k) => (k === 'c' ? { title: '' } : null),   // an empty title is no answer
    (k) => (k === 'c' ? { title: 'c' } : null),
  ]);
  assert.equal(n('a').title, 'first', 'insertion order is priority');
  assert.equal(n('b').title, 'b');
  assert.equal(n('c').title, 'c', 'an empty title does not stop the walk');
  assert.equal(n('d'), null, 'a key nobody knows draws nothing');
  assert.equal(composeNamer(null)('a'), null);
});

// ── THE SEVEN THE FIRST MUTATION RUN FOUND ───────────────────────
//
// Every assertion below was written because a mutant SURVIVED the
// suite as it stood. They are the campaign's findings, not its
// decoration: `tools/mutants/worldhover.json` names each one.

test('WORLD-HOVER: a docked large HUD moves the plaque, because it moves the reticle', () => {
  // ROAD-E E5: HUDCrosshair re-centres into the view a docked bar
  // leaves, because the world pass is drawn there. A plaque that read
  // the scale but not the bar height sat below a cross that had moved
  // up - and nothing caught it, because every fixture drew with no bar.
  const canvas = { width: 1600, height: 900, clientWidth: 800 };
  const plain = plaqueAnchor(canvas);
  // `hudReticle` answers the LIVE bar, so drive the term it reads
  // rather than the module state: the law is that the two agree.
  const s = hudScale(canvas.width, canvas.height);
  const withBar = (h) => (crosshairCentreY(canvas.height, h) + CROSSHAIR_ARM * s) / 2 + PLAQUE_GAP;
  assert.equal(plain.top, withBar(0), 'undocked, the middle is the middle');
  assert.ok(withBar(200) < withBar(0), 'a docked bar raises the reticle...');
  assert.equal(withBar(200), plain.top - 50,
    '...by exactly half its height, in device pixels, over the device ratio - E5\'s own arithmetic through the plaque\'s');
});

test('WORLD-HOVER: the signature guard really stops the repaint', () => {
  // The first pin compared `n.children` by reference, which a repaint
  // preserves - so deleting the guard changed nothing it could see.
  // Mark the tree and check the MARK survives.
  withPlaque((root) => {
    const f = (items) => resolveHover(hit('loot:1'), { contents: () => items, name: PILE });
    showWorldPlaque(f([{ name: 'Ruby' }]));
    const n = root();
    n.children[0].__mark = 'untouched';
    showWorldPlaque(f([{ name: 'Ruby' }]));
    assert.equal(n.children[0]?.__mark, 'untouched', 'an unchanged frame does not rebuild the tree');
    showWorldPlaque(f([{ name: 'Helm' }]));
    assert.notEqual(n.children[0]?.__mark, 'untouched', 'and a changed one does');
  });
});

test('WORLD-HOVER: a title with a line break is DRAWN as two lines', () => {
  // The mod joins a door's label with `\r` - "To\rPrivateer's Hold" -
  // and flattening that to one line passed every pin, because nothing
  // drove a multi-line title through the draw.
  withPlaque((root) => {
    showWorldPlaque({ key: 'exit:0', kind: 'name', title: 'To\nPrivateer\'s Hold', subs: [], rows: [], rest: 0, empty: false });
    const lines = find(root(), 'wplaque-titleline').map((n) => n.textContent);
    assert.deepEqual(lines, ['To', 'Privateer\'s Hold']);
    showWorldPlaque({ key: 'person:1', kind: 'name', title: 'Marcus Grey', subs: [], rows: [], rest: 0, empty: false });
    assert.deepEqual(find(root(), 'wplaque-titleline').map((n) => n.textContent), ['Marcus Grey'],
      'and a single-line title is still one line');
  });
});

test('WORLD TOOLTIPS: a house for sale is never told it is shut', async () => {
  // PlayerActivate.cs:474 and the mod's :738 both exempt it by name,
  // and no fixture had ever used the type - so deleting the exemption
  // changed nothing any pin could see.
  const { staticDoorName } = await import('../../src/systems/worldTooltips.js');
  const { BUILDING_TYPES } = await import('../../src/world/buildingNames.js');
  const forSale = staticDoorName('building', { displayName: 'A House', buildingType: BUILDING_TYPES.HouseForSale, unlocked: false, quality: 20 });
  assert.equal(forSale.subs.length, 1, 'it says it is locked...');
  assert.match(forSale.subs[0], /^Lock Level: /, '...and nothing about opening hours');
});

test('WORLD-HOVER: ONE precedence - the press DERIVES from raceWinner, driven over 200k sets', async () => {
  // AUDIT-WH H1. This pin replaces one that certified the bug.
  //
  // The old version drove six hand-picked cases and asserted, three
  // lines above them, that `raceWinner({corpse@3, ground@2})` names the
  // DOOR - which the press contradicted, because its corpse and pile
  // arms never compared against `doorDistance` at all. Every case in
  // the agreement loop had the corpse or pile NEARER than the door, so
  // the divergence could not show. A suite that picks its own examples
  // is not a differential.
  //
  // `raceActivation` derives its answer from `raceWinner` now, so the
  // two agree BY CONSTRUCTION - which is worth more than any number of
  // cases. This drives it anyway, because "by construction" is a claim
  // and a claim is what a pin is for.
  const { raceWinner, raceActivation, GROUND_KEY } = await import('../../src/player/activationRace.js');
  const p = (key, distance) => ({ key, distance, reach: 3.2 });

  assert.equal(raceWinner({}), null, 'nothing under the ray');
  assert.equal(raceWinner(), null);
  assert.equal(raceWinner({ ground: p('door', 2) }).key, 'door', 'the only candidate wins');
  assert.equal(raceWinner({ corpse: p('body', 1), ground: p('door', 2) }).key, 'body', 'nearest wins');
  // ...AND THE CASE THE OLD PIN GOT BACKWARDS. DFU casts one ray and
  // dispatches to the nearest hit; a body at 3 does not out-rank a
  // door at 2, and now neither reader says it does.
  assert.equal(raceWinner({ corpse: p('body', 3), ground: p('door', 2) }).key, 'door');
  assert.equal(raceActivation({ corpse: p('body', 3), doorDistance: 2 }).loot, null,
    'the PRESS lets the nearer door win too - this is the bug the old pin asserted as law');

  // THE TIE ORDER IS THE HOSTS' ARM LADDER: camp, water, wagon, torch,
  // body, pile, ground. Driven at EXACT ties, the only distance at
  // which a precedence is observable at all.
  const all = { gate: p('gate', 2), camp: p('camp', 2), water: p('water', 2), wagon: p('wagon', 2), torch: p('torch', 2), corpse: p('body', 2), pile: p('pile', 2), ground: p('door', 2) };
  const order = ['gate', 'camp', 'water', 'wagon', 'torch', 'body', 'pile', 'door'];   // WB2: the gate's fire heads the ladder
  const byKey = { gate: 'gate', camp: 'camp', water: 'water', wagon: 'wagon', torch: 'torch', body: 'corpse', pile: 'pile', door: 'ground' };
  for (let i = 0; i < order.length; i++) {
    const bag = {};
    for (const k of order.slice(i)) bag[byKey[k]] = all[byKey[k]];
    assert.equal(raceWinner(bag).key, order[i], `at an exact tie, ${order[i]} takes it from ${order.slice(i + 1).join(', ') || 'nothing'}`);
  }

  // ── THE DIFFERENTIAL ──────────────────────────────────────────
  // The hosts' ladder, transcribed from world.js / exterior.js: camp,
  // water, wagon, torch, then the body, then the pile, then the door.
  const pressOpens = (r) => (r.gateWins ? 'gate' : r.campWins ? 'camp' : r.waterWins ? 'water' : r.wagonWins ? 'wagon'
    : r.torchWins ? 'torch' : r.loot ? r.loot.key : r.drop ? r.drop.key : 'ground');
  let seed = 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  // distances chosen to land ON the reach constants and to collide,
  // because ties are where an ordering law is observable.
  const D = [0.5, 1, 1.5, 2, 2, 3, 3.75, 6.4, 12, 40, Infinity];
  const one = (k) => { const d = D[(rnd() * D.length) | 0]; return d === Infinity ? null : { key: k, distance: d, reach: 3.2 }; };
  const bad = [];
  for (let i = 0; i < 20000; i++) {
    const c = { corpse: one('body'), pile: one('pile'), torch: one('torch'), wagon: one('wagon'), camp: one('camp'), water: one('water'), gate: one('gate') };
    const dd = D[(rnd() * D.length) | 0];
    const press = pressOpens(raceActivation({ ...c, doorDistance: dd }));
    const won = raceWinner({ ...c, ground: Number.isFinite(dd) ? { key: GROUND_KEY, distance: dd } : null });
    const plaque = won ? (won.key === GROUND_KEY ? 'ground' : won.key) : 'nothing';
    // "the press falls through to tryEnter with no door there" and
    // "the plaque names nothing" are the same answer.
    if (press !== plaque && !(press === 'ground' && plaque === 'nothing')) {
      bad.push(`press=${press} plaque=${plaque} ${JSON.stringify({ ...c, doorDistance: dd })}`);
    }
  }
  assert.deepEqual(bad.slice(0, 3), [], `the press and the plaque disagree on ${bad.length}/20000 pick sets`);
});

// ── AUDIT-WH: THE SEAM INTO THE HOSTS ────────────────────────────
//
// The audit's own headline: the four pure modules were in good shape
// and every break was at the seam into the hosts - which is exactly
// where there were no pins and no mutants. A 9,644-test suite and a
// 42/42 mutation campaign both certified a build that crashed on the
// commonest interaction in a town, because nothing in `test/` called a
// host namer at all.

test('AUDIT-WH L1: the seam CONTAINS its host closures - a bad namer costs a frame, not the game', () => {
  // ONCRASH1's law, applied where it matters more than the wire: `pick`,
  // `targets`, `name` and `contents` are host closures called from
  // inside frame bodies with nothing between a throw and a dead
  // requestAnimationFrame. The slice also advertises an extension API
  // into that path ("the same door a third party would use"), so the
  // containment is not belt-and-braces - it is the door's lock.
  withPlaque((root) => {
    const exploding = () => { throw new TypeError('a third-party namer exploded'); };
    const targets = () => [{ key: 'loot:0', aabb: { min: [-1, -1, 1], max: [1, 1, 2] }, distance: 76.8, reach: 3.2 }];
    const collider = { raycast: () => Infinity };
    // AUDIT-WH2 L5-F2: PAINT A NAME FIRST, then break the namer.
    //
    // Without this the assertion below was a TAUTOLOGY and a mutant
    // proved it: the namer threw on the very first frame, so
    // `showWorldPlaque` was never reached, `ensure()` never ran, `root()`
    // answered null, and `null ?? false === false` passed whether or not
    // the catch arm took the plaque down. Deleting
    // `showWorldPlaque(null)` from the catch survived the WHOLE suite.
    // The law is "it does not freeze on its last answer", so there has
    // to BE a last answer.
    assert.doesNotThrow(() => worldHoverFrame({
      eye: [0, 0, 0], dir: [0, 0, 1], collider, targets, name: () => ({ title: 'Chest' }), contents: () => [],
    }));
    assert.equal(root()?.classList.contains('on'), true, 'a name is on screen before the namer breaks');
    for (let i = 0; i < 3; i++) {
      assert.doesNotThrow(() => worldHoverFrame({
        eye: [0, 0, 0], dir: [0, 0, 1], collider, targets, name: exploding, contents: () => [],
      }), 'the host frame survives');
    }
    assert.equal(worldHoverFaults(), 3, 'and every contained frame is COUNTED');
    // a readout that cannot answer shows NOTHING - it does not freeze
    // on its last answer, which would be a plaque naming a thing it can
    // no longer resolve. The node EXISTS here (the frame above painted
    // "Chest" into it), so this now reads the class rather than reading
    // `null ?? false`.
    assert.ok(root(), 'the node is still there - this is about what it SHOWS');
    assert.equal(root().classList.contains('on'), false);
    assert.equal(root().textContent, '', 'and it is blank, not holding the word it can no longer resolve');
    // an exploding PICK and an exploding TARGETS are the same class.
    for (const bad of [{ pick: exploding }, { targets: exploding }]) {
      assert.doesNotThrow(() => worldHoverFrame({
        eye: [0, 0, 0], dir: [0, 0, 1], collider, targets, name: () => null, contents: () => [], ...bad,
      }));
    }
    assert.equal(worldHoverFaults(), 5);
  });
});

test('AUDIT-WH H3: an above-ground body LISTS what it holds, from one ladder', async () => {
  const { composeContents, resolveHover } = await import('../../src/systems/worldHover.js');
  const { corpseLootTargets, corpseEntryFor, corpseContents } = await import('../../src/scenes/corpseMarker.js');

  // THE ROUND TRIP THAT WAS BROKEN. `foeCorpse:` and `guardCorpse:`
  // have itemised since the first slice - the plaque opens a LIST for
  // them - and neither above-ground host answered their contents, so
  // `hoverLines(null)` said `empty` and every body you killed in a
  // street or in the wilderness read "Empty" over a full pack. The
  // plaque said the OPPOSITE of what the press would show you, which
  // is the one law the whole slice exists to keep.
  //
  // Driven over the shape the pools mint: one lens, minting the key
  // and resolving it back, exactly as exteriorFoes and cityGuards use
  // it now.
  // AUDIT-WH2 L5-F15: THE PRODUCER'S LENS, not a simplified copy of it.
  //
  // This used to be a three-key transcription that omitted the encounter
  // pool's WORLD6b-iii(c) term, so dropping that term from the real lens
  // survived - a PUPPET's body became a lootable target again even when
  // its owner's word said it holds nothing. A pin that drives its own
  // shorter version of the producer is testing the pin.
  const lens = {
    isCorpse: (e) => !!e.corpse && !!e.entity && (!e.puppet || (e._pup?.o | 0) > 0),
    idOf: (e) => e.id,
    feetOf: (e) => e.feet,
  };
  const rat = { id: 7, corpse: true, feet: [0, 0, 2], entity: { items: [{ shortName: 'Long Bow', templateIndex: 130 }] } };
  const bare = { id: 9, corpse: true, feet: [0, 0, 3], entity: { items: [] } };
  const shut = { id: 11, corpse: true, corpseDisabled: true, feet: [0, 0, 4], entity: { items: [{ shortName: 'Gold', templateIndex: 530 }] } };
  // a PUPPET's body: its owner's word is what says whether it holds
  // anything, and an owner who says "empty" takes it out of the ray.
  const puppetFull = { id: 13, corpse: true, feet: [0, 0, 5], puppet: true, _pup: { o: 2 }, entity: { items: [] } };
  const puppetSpent = { id: 15, corpse: true, feet: [0, 0, 6], puppet: true, _pup: { o: 0 }, entity: { items: [] } };
  const pool = [rat, bare, shut, puppetFull, puppetSpent];
  const keys = corpseLootTargets(pool, 'foeCorpse', lens).map((t) => t.key);
  assert.deepEqual(keys, ['foeCorpse:7', 'foeCorpse:9', 'foeCorpse:13'],
    'a disabled body is not a target at all, and neither is a puppet its owner says is empty');
  assert.equal(corpseEntryFor(pool, 'foeCorpse:7', 'foeCorpse', lens), rat, 'the key the producer minted resolves back');
  assert.deepEqual(corpseContents(rat), rat.entity.items, 'and the body answers what it holds');
  // An EMPTY body answers `[]`, not null: "it holds nothing" is an
  // answer, and it draws differently from "I do not stand this key".
  assert.deepEqual(corpseContents(bare), []);
  assert.equal(corpseContents(shut), null, 'a disabled container is not ours to list');
  assert.equal(corpseContents(null), null);

  // THE LADDER. composeNamer's law with a different predicate: FIRST
  // NON-NULL WINS, insertion order is priority, and `[]` stops the walk.
  const asked = [];
  const contents = composeContents([
    (key) => { asked.push('piles'); return key.startsWith('droppedLoot:') ? [{ shortName: 'Apple', templateIndex: 0 }] : null; },
    (key) => { asked.push('foes'); return corpseContents(corpseEntryFor(pool, key, 'foeCorpse', lens)); },
    (key) => { asked.push('guards'); return null; },
  ]);
  assert.deepEqual(contents('foeCorpse:7'), rat.entity.items);
  assert.deepEqual(asked, ['piles', 'foes'], 'the walk STOPS at the first answer');
  asked.length = 0;
  assert.deepEqual(contents('foeCorpse:9'), [], 'an empty body stops it too');
  assert.deepEqual(asked, ['piles', 'foes']);
  assert.equal(contents('corpse:7'), null, 'a key no reader stands answers null, and every reader was asked');
  assert.equal(composeContents(null)('loot:0'), null);

  // ...AND THE FRAME THE PLAQUE ACTUALLY DRAWS. This is the assertion
  // the bug would have failed: a body under the crosshair draws ROWS.
  const hit = { key: 'foeCorpse:7', distance: 2, reach: 3.2 };
  const f = resolveHover(hit, { name: () => ({ title: 'Rat (dead)' }), contents });
  assert.equal(f.kind, 'items');
  assert.equal(f.title, 'Rat (dead)');
  assert.equal(f.empty, false, 'NOT "Empty" - that was the bug, in one word');
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].name, 'Long Bow', 'the row is the ITEM, through the port\'s own resolver');
  // and a body that really is empty still says so.
  assert.equal(resolveHover({ key: 'foeCorpse:9', distance: 2, reach: 3.2 }, { name: () => ({ title: 'Rat (dead)' }), contents }).empty, true);
});

test('AUDIT-WH H2: the mod\'s MOBILE BAND - a townsperson and a live foe, named and raced', async () => {
  const { mobilePersonName, mobileEntityName, liveEntityName } = await import('../../src/systems/worldTooltips.js');
  const { liveFoeTargets, liveFoeFor, foeAabb, MOBILE_NPC_ACTIVATION_DISTANCE, RAY_DISTANCE } = await import('../../src/player/activate.js');
  const { raceWinner } = await import('../../src/player/activationRace.js');
  const { resolveHover } = await import('../../src/systems/worldHover.js');

  // .cs:299-302 - a walking townsperson is MobilePersonNPC.NameNPC.
  assert.equal(mobilePersonName('Brisienna Magnessen'), 'Brisienna Magnessen');
  assert.equal(mobilePersonName(''), null, 'a nameless one draws nothing, not an empty plaque');
  assert.equal(mobilePersonName(undefined), null);
  // .cs:304-312 - a live entity is Entity.Name, and ONLY when its
  // motor is not hostile. The mod will not label the thing trying to
  // kill you, and an unnamed key draws NOTHING.
  assert.equal(mobileEntityName('Knight', { hostile: false }), 'Knight');
  assert.equal(mobileEntityName('Rat', { hostile: true }), null, 'a hostile one says nothing');
  // `!enemyMotor || !enemyMotor.IsHostile` - no motor at all IS named,
  // which in the port is a stub standing without an `ai`.
  assert.equal(mobileEntityName('Knight'), 'Knight', 'no motor, still named');
  assert.equal(mobileEntityName('', { hostile: false }), null);
  // AUDIT-WH2 L4-F1: ...AND WHICH MEMBER THE WORD COMES FROM. The
  // campaign caught this one with no pin behind it: reverting the four
  // call sites to `enemyDisplayName(f.mobileType)` survived.
  //
  // The mod's LIVE arm is `.cs:310`
  // `((DaggerfallEntityBehaviour)comp).Entity.Name`, which is
  // EnemyEntity.cs:314 `name = career.Name` - set after the if/else, so
  // a monster and a class enemy both take their CAREER's name. The mod's
  // CORPSE arm is a different member entirely: `.cs:526`
  // `loot.entityName`, which GameObjectHelper.cs:701 fills from
  // `GetLocalizedEnemyName(...)`. The port handed the corpse's member to
  // the live arm, so a living city watchman was labelled from the enemy
  // table instead of his career.
  assert.equal(liveEntityName({ entity: { name: 'Knight' } }, 'City Watch'), 'Knight',
    'the CAREER name wins - it is the member the mod reads');
  // RECORDED DEPARTURE: the port's enemy entity only carries a career
  // name for CLASS enemies (`name: isClass ? career.name : undefined`,
  // characters/enemy/enemyEntity.js), because nothing else has ever needed a
  // monster's career template. A monster falls through to the enemy
  // name, which is the only word the port holds for it.
  assert.equal(liveEntityName({ entity: { name: undefined } }, 'Rat'), 'Rat',
    'a monster has no career name in this port and takes the enemy name');
  assert.equal(liveEntityName({}, 'Rat'), 'Rat', 'and so does a record with no entity at all');
  assert.equal(liveEntityName(null, null), null, 'no word anywhere is no word');
  // ...and all FOUR hosts read it through that one door rather than
  // reaching for the corpse's member again. HOVER-PLAIN: none tells the
  // door anything but hostility - LOOT7-CHECK CHAMP-HOVER's exception is
  // retired (test/systems/loot7check.test.js pins the law).
  for (const [f, v] of [['src/scenes/exteriorFoes.js', 'f'], ['src/scenes/cityGuards.js', 'g'],
    ['src/scenes/worldModes.js', 'f'], ['src/scenes/dungeonContext.js', 'f']]) {
    assert.match(read(f), new RegExp(String.raw`mobileEntityName\(liveEntityName\(${v}, enemyDisplayName\(${v}\.mobileType\)\), \{ hostile: !!${v}\.ai\?\.isHostile[^}]*\}\)`),
      `${f}: the live arm takes Entity.Name, with the enemy name only as the port's fallback`);
  }

  // THE FAMILY. The RAY's distance with the MOD's 6.4 beside it -
  // AUDIT 65 MC-2's law, because the band is a gate inside the handler
  // and not a shorter ray (the press's Info arm has no gate at all,
  // PlayerActivate.cs:816-825).
  const foes = [
    { entity: {}, mobileType: 1, ai: { feet: [0, 0, 3], height: 1.9, isHostile: false } },
    { entity: {}, mobileType: 2, dead: true, ai: { feet: [0, 0, 4] } },   // a body is the CORPSE family's, not this one
    { entity: {}, mobileType: 3, ai: null },                              // no motor, no feet: nothing to strike
    { entity: {}, mobileType: 4, ai: { feet: [0, 0, 6], isHostile: true } },
  ];
  const t = liveFoeTargets(foes, 'mobileFoe');
  assert.deepEqual(t.map((x) => x.key), ['mobileFoe:0', 'mobileFoe:3'],
    'the living, with something to strike - keyed by INDEX, the dungeon pool\'s own law');
  assert.equal(t[0].distance, RAY_DISTANCE);
  assert.equal(t[0].reach, MOBILE_NPC_ACTIVATION_DISTANCE);
  // ONE volume, so the plaque's sweep and the press's `pickFoeAlong`
  // cannot disagree about what the ray struck.
  assert.deepEqual(t[0].aabb, foeAabb(foes[0]));
  assert.deepEqual(t[0].aabb, { min: [-0.45, 0, 2.55], max: [0.45, 1.9, 3.45] });
  assert.equal(foeAabb(foes[2]), null, 'no feet, no box');
  // ...and the key resolves back to the foe the producer minted it for.
  assert.equal(liveFoeFor(foes, 'mobileFoe:3', 'mobileFoe'), foes[3]);
  assert.equal(liveFoeFor(foes, 'mobileFoe:1', 'mobileFoe'), null, 'a body is not a live foe');
  assert.equal(liveFoeFor(foes, 'corpse:0', 'mobileFoe'), null);
  // AUDIT-WH C1: the namer ladder is handed EVERY key the ray can win,
  // and the exterior door's is a bare NUMBER.
  assert.doesNotThrow(() => liveFoeFor(foes, 17, 'mobileFoe'));
  assert.equal(liveFoeFor(foes, 17, 'mobileFoe'), null);
  // An id law of the pool's own - the stable handle its corpse keys use.
  assert.deepEqual(liveFoeTargets(foes, 'mobileGuard', { idOf: (f) => f.mobileType }).map((x) => x.key),
    ['mobileGuard:1', 'mobileGuard:4']);

  // THE PRECEDENCE. Both new competitors sit at the TAIL, in this
  // order, because both of the press's arms take their subject only
  // when it is STRICTLY nearer than its rival - the foe's rival
  // includes the persons, the person's does not.
  const at = (d) => ({ key: 'x', distance: d });
  const door = { key: '__ground__', distance: 5 }, person = { key: 'mobileNpc:0', distance: 5 }, foe = { key: 'mobileFoe:0', distance: 5 };
  assert.equal(raceWinner({ ground: door, person, foe }), door, 'the list beats both on a tie');
  assert.equal(raceWinner({ person, foe }), person, 'a person beats a foe on a tie');
  assert.equal(raceWinner({ ground: at(6), person, foe }), person, '...and nearest still wins');
  assert.equal(raceWinner({ ground: at(6), person: at(6), foe }), foe, 'a foe takes it only strictly nearer');
  assert.equal(raceWinner({ camp: at(4), ground: door, person, foe })?.distance, 4);

  // AND WHAT IT DRAWS. The mod's band is 6.4, carried as the pick's
  // reach, so a foe down a corridor is raced (the plaque must not name
  // the wall behind it) and then says NOTHING - which is the mod's own
  // silence, not a disagreement with the press.
  const namer = (key) => {
    const f = liveFoeFor(foes, key, 'mobileFoe');
    const t2 = f ? mobileEntityName(['', 'Knight', '', '', 'Rat'][f.mobileType], { hostile: !!f.ai?.isHostile }) : null;
    return t2 ? { title: t2 } : null;
  };
  assert.deepEqual(resolveHover({ key: 'mobileFoe:0', distance: 3, reach: MOBILE_NPC_ACTIVATION_DISTANCE }, { name: namer }),
    { key: 'mobileFoe:0', kind: 'name', title: 'Knight', subs: [], rows: [], rest: 0, empty: false });
  assert.equal(resolveHover({ key: 'mobileFoe:0', distance: 20, reach: MOBILE_NPC_ACTIVATION_DISTANCE }, { name: namer }), null,
    'past the band, the plaque says nothing');
  assert.equal(resolveHover({ key: 'mobileFoe:3', distance: 3, reach: MOBILE_NPC_ACTIVATION_DISTANCE }, { name: namer }), null,
    'and a HOSTILE one says nothing at any range');
});

test('AUDIT-WH H4/L3/L5: the plaque comes DOWN when a branch returns above the frame, and when the gate flips under it', () => {
  // A DOM overlay stays painted unless it is TOLD otherwise (AUDIT 64
  // F37). The hide used to be spoken only by a frame that reached
  // `worldHoverFrame`, and four host branches return above that call -
  // both dungeon hosts on an overlay and both above-ground hosts on a
  // held frame - so a name stayed on screen over every dungeon window,
  // naming a container's PRE-TAKE contents while the window emptied it.
  withPlaque((root) => {
    showWorldPlaque({ key: 'loot:1', kind: 'name', title: 'Iron Chest', subs: [], rows: [], rest: 0, empty: false });
    assert.equal(root().classList.contains('on'), true, 'painted');
    hideWorldPlaque();
    assert.equal(root().classList.contains('on'), false, 'and taken down by the door, with no frame involved');
    assert.equal(_plaqueSignatureForTests(), null,
      'the signature goes too - a hidden plaque must repaint the same name, not guard it away');
    // ...and the SAME frame paints again after a hide, which is the
    // half a naive `classList.remove` would have broken.
    showWorldPlaque({ key: 'loot:1', kind: 'name', title: 'Iron Chest', subs: [], rows: [], rest: 0, empty: false });
    assert.equal(root().classList.contains('on'), true);
    assert.deepEqual(textsOf(root(), 'wplaque-title'), ['Iron Chest']);
  });
  // AUDIT-WH L5: THE GATE REFUSES TO DRAW, NOT TO HIDE. Both of its
  // terms flip under a live plaque - the skin is a setting, and
  // `isTouchDevice` is a media query a tablet-mode flip changes - and
  // a bare `return` above the hide stranded a painted node naming what
  // a tap will not open.
  withPlaque((root) => {
    showWorldPlaque({ key: 'loot:1', kind: 'name', title: 'Iron Chest', subs: [], rows: [], rest: 0, empty: false });
    assert.equal(root().classList.contains('on'), true);
    // the device becomes a touch device under the painted plaque
    const search = '?skin=enhanced&touch=on';
    globalThis.location = { search };
    globalThis.window = { location: { search }, matchMedia: () => ({ matches: false }) };
    assert.equal(worldPlaqueOn(), false, 'the gate is shut now');
    showWorldPlaque(null);
    assert.equal(root().classList.contains('on'), false, 'and the painted node went down with it');
  });
  // ...and a CLASSIC page still never reaches ensure(). AUDIT 39: the
  // hide must not be a back door into injectEnhancedStyle().
  withPlaque((root) => {
    showWorldPlaque({ key: 'loot:1', kind: 'name', title: 'Iron Chest', subs: [], rows: [], rest: 0, empty: false });
    assert.equal(root(), null, 'classic loads nothing');
    hideWorldPlaque();
    assert.equal(root(), null, 'and hiding a node that was never made makes none');
  }, { skin: 'classic' });
});

test('AUDIT-WH M2/M3/M4/M9: the mod\'s own asymmetries, ported as the mod has them', async () => {
  const { actionName, questResourceName, corpseName, houseContainerName, INTERACT_TEXT } =
    await import('../../src/systems/worldTooltips.js');
  const { TRIGGER_FLAGS } = await import('../../src/world/rdbLayout.js');

  // M2. The switch is NOT symmetric (.cs:420-437):
  //   74037 -> "Wheel",         multiTriggerOkay = true
  //   61027/61028 -> "Lever",   multiTriggerOkay = true
  //   74143 -> "The Mantella",  <no flag>
  // so a MULTITRIGGER Mantella falls to .cs:459-461 and is silenced
  // outright, name and all. The port derived the flag as "has a name",
  // which is true of three of the four and promotes the fourth.
  assert.equal(actionName(TRIGGER_FLAGS.Direct, 74143), 'The Mantella', 'Direct still names it');
  assert.equal(actionName(TRIGGER_FLAGS.Direct6, 74143), 'The Mantella');
  assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, 74143), null,
    'a MultiTrigger Mantella is silenced - it names itself and does NOT raise the flag');
  assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, 74037), 'Wheel', 'the wheel does raise it');
  assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, 61027), 'Lever');
  assert.equal(actionName(TRIGGER_FLAGS.MultiTrigger, 61028), 'Lever');

  // M3. `HideDefaultInteractTooltip` guards ONE `<Interact>`: the
  // action arm's. The container default has no guard.
  assert.equal(houseContainerName(41999), INTERACT_TEXT);
  assert.equal(actionName(TRIGGER_FLAGS.Direct, 12345, { hideInteract: true }), null);

  // M4. `ResolveItemLongName(item, FALSE)` (.cs:509) - the second
  // argument is `differentiatePlantIngredients`, which DFU defaults
  // TRUE (ItemHelper.cs:305-312: the first eighteen of each plant group
  // take "(northern)"/"(southern)"). The mod passes false HERE and
  // nowhere else, and the port took the default - so a quest plant
  // stand read a word the mod does not put on it.
  const plant = { group: 'PlantIngredients1', templateIndex: 3, name: 'Yellow Rose', identified: true };
  assert.doesNotMatch(String(questResourceName(plant)), /northern|southern/,
    'the quest stand takes the resolver with the differentiation OFF');
  const { itemLongName } = await import('../../src/systems/item/itemInfo.js');
  assert.match(itemLongName(plant), /\(northern\)/,
    '...while the resolver\'s own default still differentiates, as DFU\'s does');

  // M9. `loot.entityName + " (dead)"`, with no fallback of the port's own.
  assert.equal(corpseName('Rat'), 'Rat (dead)');
  assert.equal(corpseName(''), ' (dead)');
});

test('AUDIT-WH M6: the two families the press has always acted on, driven', async () => {
  const { wagonHoverName, WAGON_HOVER_TEXT, WAGON_INFO_TEXT } = await import('../../src/player/eyeOfTheBeholder/eotbWagon.js');
  const { waterSourceHoverName, WATER_SOURCE_NAME, DRY_SOURCE_TEXT } = await import('../../src/systems/survival/items.js');
  // The cart: the noun out of the Info line the press already says, so
  // the plaque and the button cannot call one thing two things.
  assert.deepEqual(wagonHoverName('eotbWagon'), { title: WAGON_HOVER_TEXT });
  assert.match(WAGON_INFO_TEXT, new RegExp(WAGON_HOVER_TEXT.toLowerCase()));
  assert.equal(wagonHoverName('droppedLoot:3'), null, 'and it answers for nothing else');
  assert.equal(wagonHoverName(7), null, 'AUDIT-WH C1: including the exterior door\'s bare NUMBER');
  // The water source: named, and a DRY one says so BEFORE you press -
  // which is the whole point of a readout in the world, and is the
  // press's own sentence rather than a second wording of it.
  assert.deepEqual(waterSourceHoverName(false), { title: WATER_SOURCE_NAME, subs: [] });
  assert.deepEqual(waterSourceHoverName(true), { title: WATER_SOURCE_NAME, subs: [DRY_SOURCE_TEXT] });
});

test('AUDIT-WH2 L5-F10/F12: the row list survives a holed pack, and two rows never run together', () => {
  // F12: `hoverLines` filters holes out because `entity.items` is a
  // sparse-capable array and `itemNameParts` dereferences what it is
  // handed - a hole would throw inside the seam, be contained, and blank
  // the plaque over a body that plainly holds things. No fixture had ever
  // contained one, so dropping `.filter(Boolean)` survived.
  const holed = [{ name: 'Ruby' }, null, undefined, { name: 'Helm' }];
  const { shown, rest, empty } = hoverLines(holed);
  assert.deepEqual(shown.map((r) => r.name), ['Ruby', 'Helm'], 'the holes are gone, the items are not');
  assert.equal(empty, false);
  assert.equal(rest, 0);
  // F10: the row separator is what makes the signature INJECTIVE across a
  // ROW boundary, and the collision it prevents is a real one - it just
  // needs the field that can be EMPTY to sit at the boundary. A row is
  // `name \u0002 stack \u0002 rarity`, and `rarity` is null (so '') for a
  // common item and a tier word otherwise (LR1's `rarityAttr`), so:
  //
  //   ['Iron' rarity '']      + ['magicHelm']   ->  ...\u0002 magicHelm...
  //   ['Iron' rarity 'magic'] + ['Helm']        ->  ...\u0002magic Helm...
  //
  // are the same string once the rows run together, and a collided
  // signature is a plaque that does not repaint. Driven against
  // `frameSignature` itself with the rows built by hand, because that is
  // the unit whose whole contract is "different frames, different
  // strings" - going through `hoverLines` would only test which rarities
  // the loot table happens to mint today.
  const f = (rows) => frameSignature({ key: 'loot:1', kind: 'items', title: 'Loot Pile', subs: [], rows, rest: 0, empty: false });
  const r = (name, rarity = null) => ({ name, stack: 0, rarity });
  assert.notEqual(
    f([r('Iron'), r('magicHelm')]),
    f([r('Iron', 'magic'), r('Helm')]),
    'two rows never run together - the tier of one row cannot be read as the name of the next',
  );
  // ...and the same one field over, INSIDE a row, where the stack count
  // runs straight into the name: a stack of 12 Irons and a stack of 2
  // "Iron1"s are one string without it.
  assert.notEqual(
    f([{ name: 'Iron', stack: 12, rarity: null }]),
    f([{ name: 'Iron1', stack: 2, rarity: null }]),
    'a row\'s own fields are separated too',
  );
});

test('AUDIT-WH2 L5-F9: the gate memo is asked INSIDE a frame, which is the only place it memoises', async () => {
  // AUDIT-WH P3's whole subject, and nothing drove it: no pin ever called
  // `frameBegin()` before `worldPlaqueOn()`, so the memoised path was
  // never taken in the suite at all and `const mark = frameMark();` ->
  // `const mark = null;` survived. The INVALIDATION half was covered only
  // because `frameMark()` is null out of frame - which is to say, by the
  // memo never being used.
  const { frameBegin, frameEnd, _resetFrameClock } = await import('../../src/systems/frameClock.js');
  _resetFrameClock();
  try {
    withPlaque(() => {
      frameBegin(5000);
      assert.equal(worldPlaqueOn(), true, 'enhanced, not touch');
      // the skin flips UNDER the frame - the memo must not see it
      globalThis.location.search = '?skin=classic&touch=off';
      globalThis.window.location.search = '?skin=classic&touch=off';
      assert.equal(worldPlaqueOn(), true, 'one answer a frame: the mid-frame flip is not seen');
      frameEnd(5010);
      frameBegin(5020);
      assert.equal(worldPlaqueOn(), false, '...and the NEXT frame sees it');
    });
  } finally { _resetFrameClock(); }
});

// ── QUICK-LOOT B3: THE DRAW SHOWS THE HIGHLIGHT ──────────────────
//
// The behaviour of the take lives in test/systems/quickloot.test.js, which
// drives the feature module. These two are about the PLAQUE, and they
// need the fake document above: that a lit row is drawn lit, and that
// moving the highlight actually repaints - which it does not for free,
// because a frame whose rows and title are unchanged is the very case
// the signature guard exists to skip.

// ── QUICK-LOOT-STATS: THE LIT ROW'S NUMBERS, BESIDE THE LIST ─────
//
// These two
// live here rather than in test/systems/quicklootstats.test.js because they
// need the fake document above - that file holds the parts that can be
// driven without one, which is most of it.

test('QUICK-LOOT-STATS: the panel is drawn beside the lit row, and follows the highlight', () => withPlaque((root) => {
  setPref('quickLoot', true);
  resetQuickLoot();
  globalThis.innerWidth = 1280;
  try {
    const items = [
      { name: 'Dagger', group: 'Weapons', templateIndex: 121, material: 3, maxCondition: 200, currentCondition: 150 },
      { name: 'Bread' },
    ];
    const { shown, rest, empty } = hoverLines(items);
    const f = { key: 'pile:stats', kind: 'items', title: 'Loot Pile', subs: [], rows: shown, rest, empty };
    foldQuickLoot(f);
    showWorldPlaque(f, { x: 640, top: 40 });

    const panels = find(root(), 'wplaque-stats');
    assert.equal(panels.length, 1, 'one panel, for the one lit row');
    assert.equal(panels[0].dataset.side, 'right', 'the middle of a desktop has room on the reading side');
    const keys = find(panels[0], 'wplaque-statkey').map((n) => n.textContent);
    assert.ok(keys.includes('Damage'), 'the weapon is lit, so it says what it hits for');
    assert.ok(keys.includes('Weight'));

    // The second row has nothing but a weight - and the panel must
    // FOLLOW the highlight, or a player reads one item's numbers under
    // another item's name, which is worse than no panel at all.
    quickLootWheel(120);
    foldQuickLoot(f);
    showWorldPlaque(f, { x: 640, top: 40 });
    const after = find(root(), 'wplaque-stats');
    assert.equal(after.length, 1, 'still exactly one - the old panel is not left behind');
    assert.ok(!find(after[0], 'wplaque-statkey').map((n) => n.textContent).includes('Damage'),
      'the bread does not hit for anything');

    // Nothing lit, nothing drawn: a door has no rows, so no panel.
    resetQuickLoot();
    const door = { key: 'door:1', kind: 'name', title: 'A Door', subs: [], rows: [], rest: 0, empty: false };
    foldQuickLoot(door);
    showWorldPlaque(door, { x: 640, top: 40 });
    assert.equal(find(root(), 'wplaque-stats').length, 0, 'a door says nothing about stats');
  } finally { resetQuickLoot(); delete globalThis.innerWidth; }
}));

test('QUICK-LOOT-STATS: a narrower window repaints the panel onto the other side', () => withPlaque((root) => {
  // THE CASE THE SIGNATURE GUARD DOES NOT COVER FOR FREE. The panel's
  // side is a function of where the plaque stands and how wide the
  // window is, and NEITHER is in the frame - so a resize with the
  // crosshair held still leaves the frame, the rows and the highlight
  // all identical, and the guard would skip the repaint while the panel
  // hung off the edge it was laid out against.
  setPref('quickLoot', true);
  resetQuickLoot();
  try {
    const items = [{ name: 'Dagger', group: 'Weapons', templateIndex: 121, material: 3, maxCondition: 200, currentCondition: 150 }];
    const { shown, rest, empty } = hoverLines(items);
    const f = { key: 'pile:resize', kind: 'items', title: 'Loot Pile', subs: [], rows: shown, rest, empty };
    foldQuickLoot(f);

    globalThis.innerWidth = 1280;
    showWorldPlaque(f, { x: 700, top: 40 });
    assert.equal(find(root(), 'wplaque-stats')[0]?.dataset.side, 'right', 'room to the right at 1280');

    // The SAME frame, the SAME anchor, the same highlight - only the
    // window narrowed. `frameSignature` and the highlight are both
    // unchanged, so this repaints ONLY because the side is in the guard.
    globalThis.innerWidth = 1000;
    showWorldPlaque(f, { x: 700, top: 40 });
    assert.equal(find(root(), 'wplaque-stats')[0]?.dataset.side, 'left',
      'the window narrowed under a still crosshair, and the panel moved');
  } finally { resetQuickLoot(); delete globalThis.innerWidth; }
}));

test('QUICK-LOOT B3: the lit row is drawn lit, and only one of them', () => withPlaque((root) => {
  setPref('quickLoot', true);
  resetQuickLoot();
  try {
    const items = [{ name: 'Ruby' }, { name: 'Longsword' }, { name: 'Shield' }];
    const { shown, rest, empty } = hoverLines(items);
    const f = { key: 'pile:1', kind: 'items', title: 'Loot Pile', subs: [], rows: shown, rest, empty };
    foldQuickLoot(f);
    quickLootWheel(120);
    foldQuickLoot(f);
    showWorldPlaque(f, { x: 100, top: 40 });
    const rows = find(root(), 'wplaque-row');
    assert.equal(rows.length, 3, 'every row is drawn');
    assert.deepEqual(rows.map((r) => r.classList.contains('sel')), [false, true, false],
      'the second row is lit, and it is the only one');
  } finally { resetQuickLoot(); setPref('quickLoot', PREF_DEFAULTS.quickLoot); }
}));

test('QUICK-LOOT B3: a moved highlight REPAINTS, though the frame is identical', () => withPlaque((root) => {
  setPref('quickLoot', true);
  resetQuickLoot();
  try {
    const items = [{ name: 'Ruby' }, { name: 'Longsword' }];
    const { shown, rest, empty } = hoverLines(items);
    const f = () => ({ key: 'pile:1', kind: 'items', title: 'Loot Pile', subs: [], rows: shown, rest, empty });
    foldQuickLoot(f());
    showWorldPlaque(f(), { x: 100, top: 40 });
    const first = _plaqueSignatureForTests();
    assert.deepEqual(find(root(), 'wplaque-row').map((r) => r.classList.contains('sel')), [true, false]);
    // the same frame again, with the wheel turned between them. Nothing
    // the model says about this pile changed - only which row is lit -
    // so a signature built from the frame ALONE would skip the repaint
    // and leave the highlight painted on the row the player left.
    quickLootWheel(120);
    foldQuickLoot(f());
    showWorldPlaque(f(), { x: 100, top: 40 });
    assert.notEqual(_plaqueSignatureForTests(), first, 'the signature carries the lit row');
    assert.deepEqual(find(root(), 'wplaque-row').map((r) => r.classList.contains('sel')), [false, true],
      'and the paint followed the highlight');
  } finally { resetQuickLoot(); setPref('quickLoot', PREF_DEFAULTS.quickLoot); }
}));

test('FIELD BUGS 2026-10-11g LOOT-SCROLL ("Can\'t scroll loot pile / corpse": "I can\'t scroll the item list with mouse wheel ... I can still take items from list one by one to get to the bottom of it"): the wheel walks a nine-item body past the old sixth row, the plaque\'s six rows follow it with what they leave above and below, the lit row drawn is the lit item, and the take takes it; back up, a notch inside the window moves the light and not the list (mutants: the frame capped again; the window still; the take bounded by the window; the light counted from the pile\'s top)', () => withPlaque((root) => {
  setPref('quickLoot', true);
  resetQuickLoot();
  try {
    const items = Array.from({ length: HOVER_MAX + 3 }, (_, i) => ({ name: `Thing ${i}`, group: 'Weapons', templateIndex: 121, material: 3, maxCondition: 200, currentCondition: 150 }));
    const res = () => resolveHover(hit('corpse:1'), { contents: () => items, name: PILE });
    const step = (d) => { if (d) quickLootWheel(d); const f = res(); foldQuickLoot(f); showWorldPlaque(f); return f; };
    let f = step(0);
    assert.deepEqual(textsOf(root(), 'wplaque-more'), ['and 3 more'], 'the first page: six rows and the tail');
    assert.equal(find(root(), 'wplaque-row').length, HOVER_MAX + 1);
    for (let i = 0; i < 20; i++) f = step(1);
    assert.equal(quickLootRow(f), HOVER_MAX + 2, 'the light reaches the last item, not the sixth');
    assert.deepEqual(textsOf(root(), 'wplaque-more'), ['3 more above'], 'the window moved down with it');
    const lit = find(root(), 'sel');
    assert.equal(lit.length, 1);
    assert.equal(lit[0].textContent, `Thing ${HOVER_MAX + 2}`, 'the lit row drawn is the lit item');
    assert.ok(quickLootStats(f).length > 0, 'and it describes itself');
    const moved = quickLootTake('corpse:1', { items: () => items }, { items: [], goldPieces: 0, stats: { strength: 50 } });
    assert.equal(moved?.name, `Thing ${HOVER_MAX + 2}`, 'the take takes the lit item past the old tail');
    f = step(0);
    assert.equal(quickLootRow(f), HOVER_MAX + 1, 'the shrunk pile pulls the light back to its new last row');
    f = step(-1); f = step(-1);
    assert.equal(quickLootRow(f), HOVER_MAX - 1);
    assert.deepEqual(textsOf(root(), 'wplaque-more'), ['2 more above'], 'the window held while the light moved inside it');
    for (let i = 0; i < 20; i++) f = step(-1);
    assert.equal(quickLootRow(f), 0);
    assert.deepEqual(textsOf(root(), 'wplaque-more'), ['and 2 more'], 'back at the top');
  } finally { resetQuickLoot(); setPref('quickLoot', PREF_DEFAULTS.quickLoot); }
}));
