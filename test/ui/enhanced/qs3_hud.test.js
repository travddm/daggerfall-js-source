// QS3 - THE QUICKSLOT DIAMOND ON THE ENHANCED HUD.
//
// Mac's reference is the Demon's Souls remake's bottom-left diamond:
// the off hand left, the weapon right, two consumables above and below,
// item art in each cell, a durability strip on the hands, a count on
// the consumables and the key that presses each at the outer point.
//
// Three things are pinned here and the third is the one that keeps the
// other two honest:
//   - the PAD GLYPHS (ui/padGlyphs.js) - our own pixel buttons, pure
//     and renderable in node, so the bitmaps and the SVG they become
//     are checkable rather than looked at;
//   - the TAG LAW (ui/quickslotTags.js) - which of a key name, a pad
//     glyph or NOTHING each corner says;
//   - the DOM and the sheet, driven through the same document fake the
//     AUDIT 64 HUD pins use, so the states (sheathed, ghost, socket,
//     the count, the tag text) are executed rather than described.
//
// The LAYOUT is not measured here - node has no layout engine, and a
// pin that reads a number off a fake box is a pin on the fake. The
// boxes were measured in Chromium (tools/qs3Probe.mjs) and what stands
// in this file is the CSS the measurement was taken over, by source
// regex, so a change to a rule fails here and can be re-measured there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAD_GLYPHS, PAD_FAMILIES, GLYPH_SIZE, GLYPH_AXIS_KEYS, padFamilyOf, padFamily, setPadFamily,
  unityButtonGlyph, glyphSvg, _clearGlyphCache,
} from '../../../src/ui/padGlyphs.js';
import { hdGlyphSvg } from '../../../src/ui/padGlyphsHD.js';   // PLUS-ONLY: the HUD's glyph under the one enhanced dress
import { quickslotTag, quickslotOffTag, tagKey, CELL_ACTIONS, tagText } from '../../../src/ui/quickslotTags.js';
import { createBindings, setBinding } from '../../../src/systems/inputActions.js';
import { setPref } from '../../../src/systems/uiPrefs.js';
// HB-LYCFREE: the hotbar is the quick slots' default now. This suite is the DIAMOND's, written while the
// diamond was the default, so it chooses the diamond (
setPref('quickbarStyle', 'quickbar');

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

const CODES = [...Array.from({ length: 10 }, (_, i) => `JoystickButton${i}`), ...GLYPH_AXIS_KEYS];   // PAD1: the ten buttons and the six axis keys

test('QS3 glyphs: ten buttons and six axis keys per family, every bitmap square and every pixel on or off', () => {
  // OUR OWN, drawn rather than licensed: every shipped glyph set is
  // somebody's trademark or somebody's font, and this skin has a
  // language of its own. The grid is a law rather than a per-glyph
  // fact, so a typo in one row is caught here and not on a screen.
  assert.deepEqual([...PAD_FAMILIES], ['xbox', 'ps']);
  for (const family of PAD_FAMILIES) {
    const set = PAD_GLYPHS[family];
    assert.deepEqual(Object.keys(set).sort(), [...CODES].sort(), `${family}: the ten standard-mapping buttons and the six axis keys (PAD1)`);
    for (const [code, rows] of Object.entries(set)) {
      assert.equal(rows.length, GLYPH_SIZE, `${family}/${code}: ${rows.length} rows`);
      for (const row of rows) {
        assert.equal(row.length, GLYPH_SIZE, `${family}/${code}: a row of ${row.length}`);
        // '.' off, '#' the shape, 'o' the mark - no third state, and no
        // anti-aliasing anywhere in this language.
        assert.match(row, /^[.#o]+$/, `${family}/${code}: "${row}"`);
      }
      assert.ok(rows.some((r) => r.includes('#')), `${family}/${code} draws a shape`);
      assert.ok(rows.some((r) => r.includes('o')), `${family}/${code} draws a mark inside it`);
    }
    // The two families differ where the hardware does - the face
    // buttons and the bumpers - and agree where it does not.
    assert.notDeepEqual(PAD_GLYPHS.xbox.JoystickButton0, PAD_GLYPHS.ps.JoystickButton0, 'A is not Cross');
    assert.notDeepEqual(PAD_GLYPHS.xbox.JoystickButton4, PAD_GLYPHS.ps.JoystickButton4, 'LB is not L1');
    assert.deepEqual(PAD_GLYPHS.xbox.JoystickButton8, PAD_GLYPHS.ps.JoystickButton8, 'a left stick click is a left stick click');
  }
  // L3 and R3 are mirror images: which stick it is, is the only thing
  // the glyph has to say.
  assert.notDeepEqual(PAD_GLYPHS.xbox.JoystickButton8, PAD_GLYPHS.xbox.JoystickButton9);
});

test('QS3 glyphSvg: crisp rects on the bitmap\'s own grid, cached, and null for what is not a button', () => {
  _clearGlyphCache();
  const url = glyphSvg('xbox', 'JoystickButton0', { size: 12 });
  const svg = decodeURIComponent(url.replace('data:image/svg+xml;utf8,', ''));
  // NO CANVAS: a canvas needs a document, and a test that cannot read
  // what was drawn pins nothing.
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /viewBox="0 0 11 11"/, 'the rects are on the bitmap\'s own integer grid');
  assert.match(svg, /width="12" height="12"/);
  assert.ok(/<rect x="\d+" y="\d+" width="\d+" height="1" fill="#d8cfae"\/>/.test(svg), `rects: ${svg.slice(0, 200)}`);
  // Runs merge: the ring's top row is five lit pixels and ONE rect.
  assert.match(svg, /<rect x="3" y="0" width="5" height="1"/);
  assert.ok((svg.match(/<rect /g) ?? []).length < 11 * 11, 'runs merged, not a rect per pixel');
  // CACHED per family, code, size and colour - the HUD asks for the
  // same four glyphs sixty times a second.
  assert.equal(glyphSvg('xbox', 'JoystickButton0', { size: 12 }), url, 'the same answer, out of the cache');
  assert.notEqual(glyphSvg('xbox', 'JoystickButton0', { size: 24 }), url, 'a different size is a different glyph');
  assert.notEqual(glyphSvg('ps', 'JoystickButton0', { size: 12 }), url, 'and so is a different family');
  // The accent is the mark's colour and defaults to the shape's, so
  // nothing shipped depends on a second hue.
  const accented = glyphSvg('xbox', 'JoystickButton0', { size: 12, accent: '#c08a3e' });
  assert.match(decodeURIComponent(accented), /fill="#c08a3e"/);
  assert.equal(glyphSvg('xbox', 'JoystickButton10'), null);
  assert.equal(glyphSvg('xbox', 'KeyW'), null);
});

test('QS3 padFamilyOf: Sony by id, Xbox by default, and the live family clears with the pad', () => {
  assert.equal(padFamilyOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)'), 'xbox');
  assert.equal(padFamilyOf('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), 'ps',
    'a DualShock 4 reports no name at all, only Sony\'s 054c');
  assert.equal(padFamilyOf('DualSense Wireless Controller'), 'ps');
  assert.equal(padFamilyOf('PlayStation 5 Controller'), 'ps');
  assert.equal(padFamilyOf(''), 'xbox', 'no id at all is the default, not a crash');
  assert.equal(padFamilyOf(null), 'xbox');
  assert.equal(padFamilyOf(undefined), 'xbox');
  // The module-global the HUD reads: written by the poller, cleared
  // when the pad goes, because a glyph for a pad nobody holds is a lie.
  setPadFamily(null);
  assert.equal(padFamily(), null);
  setPadFamily('ps'); assert.equal(padFamily(), 'ps');
  setPadFamily('nonsense'); assert.equal(padFamily(), null, 'only the two families it can draw');
  setPadFamily(null);
});

test('QS3 unityButtonGlyph: the ten, the six axis keys, and nothing else', () => {
  for (const code of CODES) for (const f of PAD_FAMILIES) assert.ok(unityButtonGlyph(f, code), `${f}/${code}`);
  // Unity NAMES twenty (KeyCodeList); the standard mapping reaches ten,
  // which is what STANDARD_TO_UNITY_BUTTON maps onto.
  for (const bad of ['JoystickButton10', 'JoystickButton19', 'JoystickAxis3Button0', 'JoystickAxis9Button1', 'KeyW', 'Mouse0', '', null, undefined, 7]) {
    assert.equal(unityButtonGlyph('xbox', bad), null, String(bad));
  }
  assert.equal(unityButtonGlyph('nonsense', 'JoystickButton0'), PAD_GLYPHS.xbox.JoystickButton0,
    'an unknown family falls back rather than drawing nothing');
});

test('QS3 the tag law: the pad while the pad is live, the key otherwise, and NOTHING when unbound', () => {
  const store = createBindings();
  setBinding(store, 'Digit1', 'QuickUse1');
  setBinding(store, 'JoystickButton2', 'QuickUse1', false);   // the secondary dict
  setBinding(store, 'Digit2', 'QuickUse2');
  setBinding(store, 'JoystickButton3', 'QuickSwap');          // a PAD-ONLY action
  const key = { bindings: store, controller: false, family: 'xbox' };
  const pad = { bindings: store, controller: true, family: 'xbox' };

  // The keyboard arm is `tagText`: the digit row shows its DIGIT (DFU's
  // GetButtonText says "A1", Alpha1, which on a corner chip reads as a
  // grid reference), the numpad its digit with the pad's prefix, and
  // every other key `buttonText` at its SHORT form.
  assert.deepEqual(quickslotTag('QuickUse1', key), { kind: 'key', text: '1' });
  assert.equal(tagText('Digit0'), '0');
  assert.equal(tagText('Numpad7'), 'KP7');
  assert.equal(tagText('KeyZ'), 'Z');
  assert.equal(tagText('ArrowLeft'), 'LEFT');
  // AUDIT QS F6: a combo is each half through the same law, joined tight
  // - never buttonText's '...' - and an action bound only to a pad AXIS
  // key reads as bound.
  assert.equal(tagText('ShiftLeft+Digit1'), 'LSHIFT+1');
  const axis = createBindings();
  setBinding(axis, 'JoystickAxis3+', 'QuickUse1');
  const axisTag = quickslotTag('QuickUse1', { bindings: axis, controller: true, family: 'xbox' });
  assert.equal(axisTag?.kind, 'key');
  assert.ok(axisTag.text.length > 0 && axisTag.text !== '...' && axisTag.text !== 'NONE');
  // ...and the pad's own button while the pad is the live device.
  assert.deepEqual(quickslotTag('QuickUse1', pad), { kind: 'glyph', family: 'xbox', code: 'JoystickButton2' });
  assert.deepEqual(quickslotTag('QuickUse1', { ...pad, family: 'ps' }), { kind: 'glyph', family: 'ps', code: 'JoystickButton2' });
  // A pad in hand and NO pad binding is still the keyboard key: a
  // corner that went blank when someone picked up a controller would
  // be worse than either answer.
  assert.deepEqual(quickslotTag('QuickUse2', pad), { kind: 'key', text: '2' });
  // An action bound ONLY to the pad shows its glyph either way -
  // there is no key to name.
  assert.deepEqual(quickslotTag('QuickSwap', key), { kind: 'glyph', family: 'xbox', code: 'JoystickButton3' });
  // UNBOUND IS NO TAG. `buttonText(null)` answers 'NONE' because
  // KeyCode.None.ToString() does, and a chip reading NONE tells a
  // player to press a key that does not exist.
  assert.equal(quickslotTag('ReadyWeapon', key), null);
  assert.equal(quickslotTag('QuickUse1', { bindings: null }), null, 'no store, no tag');
  assert.equal(quickslotTag(null, key), null);
  for (const t of [quickslotTag('ReadyWeapon', key), quickslotTag('QuickUse1', { bindings: null })]) {
    assert.notEqual(tagKey(t), 'k:NONE');
  }

  // WHICH TAG GOES WHERE. The off hand's is decided by what stands in
  // it: a swap weapon is QuickSwap, and every other state of the off hand
  // is QuickOffHand - QS4, the corner that had no key at all.
  assert.deepEqual(CELL_ACTIONS,
    { main: 'ReadyWeapon', c1: 'QuickUse1', c2: 'QuickUse2', swap: 'QuickSwap', off: 'QuickOffHand' });
  // QS4: EVERY STATE OF THE OFF CELL NAMES A KEY. A swap is the swap's;
  // a lit torch, a shield, an off-hand weapon and an empty socket are the
  // off hand's own press - the cell a player could not reach before.
  setBinding(store, 'Digit4', 'QuickOffHand');
  for (const kind of ['shield', 'empty', 'weapon', 'torch']) {
    assert.deepEqual(quickslotOffTag(kind, key), { kind: 'key', text: '4' }, `the ${kind} cell names its key`);
  }
  assert.deepEqual(quickslotOffTag('swap', key), { kind: 'glyph', family: 'xbox', code: 'JoystickButton3' });
  // KB1: the torch mod's key is the registry's TorchToggleLight action now (it was a KeyCode name in the mod's own
  // store, read by `torchTag` - keyboard only, and read by no caller since QS4). The ONE tag function names it, so
  // it follows a rebind and can wear a pad glyph like every other chip.
  setBinding(store, 'KeyO', 'TorchToggleLight');
  assert.deepEqual(quickslotTag('TorchToggleLight', key), { kind: 'key', text: 'O' });
  setBinding(store, 'Numpad4', 'TorchToggleLight');
  assert.deepEqual(quickslotTag('TorchToggleLight', key), { kind: 'key', text: 'KP4' }, 'a rebind moves the chip');
  // The tag's string, which is what the HUD writes on.
  assert.equal(tagKey({ kind: 'key', text: '1' }), 'k:1');
  assert.equal(tagKey({ kind: 'glyph', family: 'ps', code: 'JoystickButton0' }), 'g:ps:JoystickButton0');
  assert.equal(tagKey(null), '');
});

// ── the states, executed ─────────────────────────────────────────
//
// The same document fake test/ui/hud/audit64_hud.test.js drives the enhanced
// overlay with. It answers layout with nothing, which is why no box is
// asserted on here - only what the module WROTE.
const mkEl = () => ({
  className: '', textContent: '', id: '', rel: '', href: '', src: '', alt: '', children: [], dataset: {},
  style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } },
  classList: {
    _s: new Set(),
    add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); },
    toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); },
  },
  // QS5: the wear gauge is SVG and writes through attributes, so the fake
  // RECORDS them - a setter that swallowed its argument would pin nothing.
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); },
  getAttribute(k) { return this.attrs[k]; },
  removeAttribute(a) { delete this.attrs[a]; this[a] = ''; }, remove() {},
  append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
  replaceChildren(...c) { this.children = c; }, addEventListener(type, fn) { (this._on ??= {})[type] = fn; },
});

const find = (node, cls) => {
  if (String(node.className ?? '').split(/\s+/).includes(cls)) return node;
  for (const c of node.children ?? []) { const got = find(c, cls); if (got) return got; }
  return null;
};

test('QS3 the states, executed: the socket, the sheathed hand, the ghost\'s 0, and the tag chips', async () => {
  const prev = globalThis.document;
  // QS5: the fake MARKS the namespace, because an SVG node minted by
  // `createElement` is an unknown HTML element that draws nothing - a fake
  // that answered the same object either way could not tell the two apart.
  globalThis.document = {
    createElement: mkEl, createElementNS: (ns, tag) => Object.assign(mkEl(), { ns }),
    getElementById: () => null, head: mkEl(), body: mkEl(),
  };
  const { drawEnhancedHud, destroyEnhancedHud } = await import('../../../src/ui/enhanced/enhancedHud.js');
  const { assignQuickslot, clearQuickslots } = await import('../../../src/systems/quickslots.js');
  const { setBindings } = await import('../../../src/ui/input.js');
  const { EQUIP_SLOTS } = await import('../../../src/characters/paperdoll/paperdoll.js');
  const store = createBindings();
  setBinding(store, 'Digit1', 'QuickUse1');
  setBinding(store, 'Digit2', 'QuickUse2');
  setBinding(store, 'KeyR', 'ReadyWeapon');
  setBindings(store);
  clearQuickslots();
  setPadFamily(null);
  try {
    const weapon = { group: 'Weapons', templateIndex: 121, name: 'Longsword', currentCondition: 12, maxCondition: 40 };
    const heal = { group: 'UselessItems1', templateIndex: 83, name: 'Glass Bottle', potionRecipeKey: 1, stackCount: 3, currentCondition: 1, maxCondition: 1 };
    const gone = { group: 'UselessItems1', templateIndex: 83, name: 'Glass Bottle', potionRecipeKey: 2, stackCount: 1, currentCondition: 1, maxCondition: 1 };
    assignQuickslot('c1', heal);
    assignQuickslot('c2', gone);
    const entity = {
      health: 40, maxHealth: 80, magicka: 0, maxMagicka: 10, fatigue: 100,
      items: [heal], equip: { slots: {} }, lightSource: null,
    };
    // NOTHING IN EITHER HAND, and one slot whose kind has left the pack.
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    const root = document.body.children.find((n) => n.className === 'hud');
    assert.ok(root, 'the overlay was built');
    const quick = find(root, 'hud-quick');
    assert.ok(quick, 'the diamond block hangs off the root itself');
    const cell = (c) => find(quick, `hud-q${c}`);
    const has = (c, s) => cell(c).classList.contains(s);
    // EVERY CORNER IS STILL THERE - the departure this arc records.
    for (const c of ['main', 'off', 'c1', 'c2']) assert.ok(cell(c), `the ${c} cell exists whatever is in it`);
    assert.ok(has('main', 'socket'), 'an empty hand is a socket, not an absence');
    assert.ok(has('off', 'socket'), 'and so is an empty off hand');
    assert.ok(!has('c1', 'socket'), 'a filled slot is not');
    assert.equal(find(cell('c1'), 'hud-qcount').textContent, '3');
    // THE GHOST keeps its place and reads 0 - the whole point of a slot
    // that keeps its KIND when the pack runs out.
    assert.ok(has('c2', 'ghost'));
    assert.equal(find(cell('c2'), 'hud-qcount').textContent, '0');
    // The tags: the two bound keys, and nothing at all where nothing is.
    const tag = (at) => find(quick, `hud-qs${at}`);
    assert.equal(find(tag('top'), 'hud-qstext').textContent, '1');
    assert.equal(find(tag('bottom'), 'hud-qstext').textContent, '2');
    assert.ok(tag('right').classList.contains('on'), 'ReadyWeapon is bound, so the main corner speaks');
    assert.equal(find(tag('right'), 'hud-qstext').textContent, 'R');
    assert.ok(!tag('left').classList.contains('on'), 'an empty off hand has nothing to press');

    // NOW A WEAPON, SHEATHED, AND THE POTION DRUNK.
    heal.stackCount = 1;
    drawEnhancedHud(entity, 0, 0, { weapon, weaponSheathed: true });
    assert.ok(!has('main', 'socket'));
    assert.ok(has('main', 'sheathed'), 'a put-away weapon is half there');
    assert.ok(has('main', 'hasbar'), 'and it carries its durability');
    // QS5: the gauge is the cell's own lower edges, drained from the
    // bottom point outward - the dash hides what is GONE, so 30% of a
    // 62.2-unit half leaves 43.5 hidden at each side corner.
    assert.equal(find(cell('main'), 'hud-qwfill').attrs['stroke-dashoffset'], '43.5', '12 of 40');
    assert.equal(cell('main').children.filter((n) => n.className === 'hud-qwear').length, 1, 'one gauge per cell');
    assert.equal(find(cell('main'), 'hud-qwear').ns, 'http://www.w3.org/2000/svg', 'minted in the SVG namespace, or it draws nothing');
    // BOTH HALVES START AT THE BOTTOM POINT, which is what makes the two
    // drain together and leaves a stub at the point rather than a gap in
    // the middle of the V.
    for (const p of cell('main').children.find((n) => n.className === 'hud-qwear').children.filter((n) => n.className === 'hud-qwfill')) {
      assert.match(p.attrs.d, /^M 50 94 L (?:6|94) 50$/, 'a half runs from the point outward');
    }
    assert.ok(has('main', 'worn'), 'under 40% it takes the health bar\'s red');
    assert.equal(find(cell('c1'), 'hud-qcount').textContent, '1');
    // DRAWN: the same weapon, and only the class changed.
    drawEnhancedHud(entity, 0, 0, { weapon, weaponSheathed: false });
    assert.ok(!has('main', 'sheathed'));
    // THE PAD TAKES THE TAGS OVER. `controllerLook` is GP1's latch;
    // padFamily is what the poller wrote.
    const { setControllerLook } = await import('../../../src/player/lookFilter.js');
    setBinding(store, 'JoystickButton0', 'QuickUse1', false);
    setControllerLook(true);
    setPadFamily('ps');
    drawEnhancedHud(entity, 0, 0, { weapon, weaponSheathed: false });
    assert.equal(find(tag('top'), 'hud-qstext').textContent, '', 'the letter gives way');
    assert.match(find(tag('top'), 'hud-qsglyph').src, /^data:image\/svg\+xml/);
    // PLUS-ONLY (PADPLUS1): the enhanced HUD is Plus's, and Plus draws the pad's buttons as vectors (padGlyphsHD.js)
    assert.equal(find(tag('top'), 'hud-qsglyph').src, hdGlyphSvg('ps', 'JoystickButton0', { size: 32 }));
    // ...and the mouse takes them back.
    setControllerLook(false);
    setPadFamily(null);
    drawEnhancedHud(entity, 0, 0, { weapon, weaponSheathed: false });
    assert.equal(find(tag('top'), 'hud-qstext').textContent, '1');
  } finally {
    destroyEnhancedHud();
    clearQuickslots();
    setBindings(null);
    setPadFamily(null);
    globalThis.document = prev;
  }
});

// AUDIT QS6 F3 + F4, both DRIVEN: two defects a source pin could not see.
//
//   F4  THE CELL'S CYCLING LAMP NEVER WENT OUT. It was written below the
//       block's signature guard, and when a hold ends nothing else about
//       the block changes - so the write was unreachable and the cell
//       stayed lit for the rest of the session.
//   F3  THE FINGER'S TIMERS OUTLIVED THE HUD. A hold still cycling when a
//       host tears the HUD down leaves a `setInterval` running against a
//       node no `pointerup` can ever reach again.
test('AUDIT QS6 F3/F4: the cycling lamp falls with the hold, and a finger mid-cycle does not outlive the HUD', async () => {
  const prev = globalThis.document;
  const prevSI = globalThis.setInterval, prevCI = globalThis.clearInterval;
  const prevST = globalThis.setTimeout, prevCT = globalThis.clearTimeout;
  globalThis.document = {
    createElement: mkEl, createElementNS: (ns, tag) => Object.assign(mkEl(), { ns }),
    getElementById: () => null, head: mkEl(), body: mkEl(),
  };
  // The timers are counted rather than run: what is pinned is that every
  // one this file starts is stopped, which is a balance and not a delay.
  let live = 0; const started = [];
  globalThis.setTimeout = (fn) => { live++; started.push(fn); return { id: live }; };
  globalThis.clearTimeout = (h) => { if (h) live--; };
  globalThis.setInterval = (fn) => { live++; started.push(fn); return { id: live }; };
  globalThis.clearInterval = (h) => { if (h) live--; };
  const { drawEnhancedHud, destroyEnhancedHud } = await import('../../../src/ui/enhanced/enhancedHud.js');
  const q = await import('../../../src/systems/quickslots.js');
  const { setBindings } = await import('../../../src/ui/input.js');
  const store = createBindings();
  setBinding(store, 'Digit1', 'QuickUse1');
  setBinding(store, 'Digit3', 'QuickSpell');
  setBindings(store);
  q.clearQuickslots();
  q.resetQuickslotHolds();
  setPadFamily(null);
  try {
    const heal = { group: 'UselessItems1', templateIndex: 83, name: 'Glass Bottle', potionRecipeKey: 1, stackCount: 3, currentCondition: 1, maxCondition: 1 };
    const cure = { group: 'UselessItems1', templateIndex: 83, name: 'Glass Bottle', potionRecipeKey: 2, stackCount: 2, currentCondition: 1, maxCondition: 1 };
    const spark = { index: 5, name: 'Spark', rangeType: 2 };
    const entity = {
      health: 40, maxHealth: 80, magicka: 10, maxMagicka: 10, fatigue: 100,
      items: [heal, cure], spells: [spark, { index: 9, name: 'Shock', rangeType: 2 }],
      equip: { slots: {} }, lightSource: null,
    };
    q.assignQuickslot('c1', heal);
    const draw = (opts = {}) => drawEnhancedHud(entity, 0, 1 / 60, { weapon: null, weaponSheathed: true, ...opts });
    draw();
    const root = document.body.children.find((n) => n.className === 'hud');
    const quick = find(root, 'hud-quick');
    const c1 = find(quick, 'hud-qc1');
    assert.ok(!c1.classList.contains('cycling'), 'nothing is being cycled yet');

    // ── F4 ──────────────────────────────────────────────────────────
    q.cycleQuickslot('c1', { entity });
    assert.equal(q.quickslotCycling(), 'c1');
    draw();
    assert.ok(c1.classList.contains('cycling'), 'the cell a hold is turning wears the lamp');
    // The hold ends. NOTHING else about the block changes - which is
    // exactly why the write below the signature guard was unreachable.
    for (let t = 0; t <= q.QUICK_CYCLE_LINGER_MS + 40; t += 16) q.tickQuickslotHold(0.016, { isHeld: () => false, entity });
    assert.equal(q.quickslotCycling(), null, 'the model let the lamp fall');
    draw();
    assert.ok(!c1.classList.contains('cycling'), 'AND SO DID THE CELL - a lamp that cannot go out is a cell that lies');

    // ── the spell chip, on the same frames ───────────────────────────
    q.setSpellQuickslot(spark);
    draw({ readied: spark });
    const chip = find(root, 'hud-qspell');
    assert.ok(chip.classList.contains('on'), 'the chip is drawn once a spell is in the slot');
    assert.equal(find(chip, 'hud-qspname').textContent, 'Spark');
    assert.ok(chip.classList.contains('readied'), 'and lights for the spell actually in hand');
    assert.ok(!find(root, 'hud-readied').classList.contains('on'), 'so the generic readied chip stands down');
    // A spell readied from the BOOK is not the slot's: both stand.
    draw({ readied: { index: 9, name: 'Shock' } });
    assert.ok(!chip.classList.contains('readied'));
    assert.ok(find(root, 'hud-readied').classList.contains('on'));
    assert.equal(find(root, 'hud-readyname').textContent, 'Shock');

    // ── F3 ──────────────────────────────────────────────────────────
    const before = live;
    c1._on.pointerdown({ pointerType: 'touch', preventDefault() {} });
    assert.equal(live, before + 1, 'a finger down arms one timer');
    c1._on.pointerup({ pointerType: 'touch' });
    assert.equal(live, before, 'and lifting it stops that timer');
    // ...and the case the node cannot answer: torn down mid-cycle.
    c1._on.pointerdown({ pointerType: 'touch', preventDefault() {} });
    started.at(-1)();   // the arm fires: the hold begins cycling on an interval
    assert.ok(live > before, 'a cycling hold is holding timers');
    destroyEnhancedHud();
    assert.equal(live, 0, 'THE TEARDOWN STOPS THEM - a removed node can never deliver the pointerup that would');
  } finally {
    try { destroyEnhancedHud(); } catch { /* already gone */ }
    globalThis.document = prev;
    globalThis.setTimeout = prevST; globalThis.clearTimeout = prevCT;
    globalThis.setInterval = prevSI; globalThis.clearInterval = prevCI;
    q.clearQuickslots();
    q.resetQuickslotHolds();
  }
});
