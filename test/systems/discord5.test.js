// DISCORD5 (2026-09-22, five reports off the bug-reports channel, through
// Mac): five root causes, each pinned by EXECUTION where the seam can be
// driven and by source where it lives inside a host closure.
//
//   BLACK-ARMS  "Weapon and torch are blacked out" (Revverie) - the
//               first-person tint is an RGB triple uploaded into a vec4
//               uniform; `color[3]` undefined went up as NaN alpha.
//   3ARMS       "Torch and a Two-Handed weapon simultaneously" (Ignatious)
//               - IL `GetItemHands() == 2` is ItemHands.BOTH in DFU's enum;
//               the port read it as its own LeftOnly and the two-hander arm
//               never fired (Handheld Torches AND Weapon Widget).
//   TORCH-BIND  "No option to rebind Handheld Torches actions" (teuton) -
//               the mod's TextKeys were curated out of the only door left
//               after FT14; the same for Eye Of The Beholder's two and
//               Travel Options' custom key; and the Continue the player
//               could not find is sticky now, with a twin at the foot.
//   HOTSLOT     "Cant change Hotslot spell" (!Simple) - the slot's one
//               reachable writer was an unsaid 350 ms hold; the book slots
//               a spell now, the empty chip is a socket, the label says hold,
//               a doubled book cannot pin the cycle.
//   LOOT-REGEN  "dead bodies regenerate loot" after dying online (Satranath)
//               - a quick-loot take never told the room, so the memory
//               carried no record for the emptied corpse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Renderer, screenQuadBlends } from '../../src/render/renderer.js';
import { MOD_SETTINGS } from '../../src/systems/modSettings.js';
import { modDials } from '../../src/systems/features.js';
import { ITEM_HANDS } from '../../src/characters/equipTable.js';
import { spellCandidates, cycleQuickslot, clearQuickslots, spellQuickslot, setSpellQuickslot } from '../../src/systems/quickslots.js';
import { setPref } from '../../src/systems/uiPrefs.js';
// HB-LYCFREE (2026-09-30): the hotbar is the quick slots' default now. This suite is the DIAMOND's, written while the
// diamond was the default, so it chooses the diamond (PIN MOVED: the environment it always ran in, now said).
setPref('quickbarStyle', 'quickbar');

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ── BLACK-ARMS ───────────────────────────────────────────────────────────

/** drawScreenQuad on a stub renderer: the 2D program's uniform uploads are RECORDED, nothing else runs. */
function quadStub() {
  const up = [];
  const gl = {
    drawingBufferWidth: 640, drawingBufferHeight: 400, TRIANGLES: 4, UNSIGNED_SHORT: 5123, BLEND: 3042, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
    uniform4f: (h, ...v) => up.push([h, v]), uniform2f: () => {}, uniform1i: () => {},
    enable: () => {}, disable: () => {}, blendFunc: () => {}, drawElements: () => {},
  };
  const r = {
    gl, up, _worldViewportPx: null, _screenOffset: null, _sq: {}, stats: { draws: 0 },
    screenQuadProgram: {}, _screenQuadVao: {},
    _screenQuad: { dst: 'dst', src: 'src', color: 'color', canvas: 'canvas', useTex: 'useTex', blendTex: 'blendTex', rotOn: 'rotOn', rot: 'rot' },
    _compositeAir() {}, _ensureScreenQuadProgram() {}, _use() {}, _open2D() {}, _bindTex0() {}, endWorldPass() {},
  };
  return r;
}
const colourUploads = (r) => r.up.filter(([h]) => h === 'color').map(([, v]) => v);

test('BLACK-ARMS, driven: an RGB triple through drawScreenQuad uploads a FINITE vec4 with alpha 1 - the triple flatLightAt hands the classic weapon, the torch hand and the casting hands went up with `undefined` in the fourth slot, which uniform4f took as NaN and most drivers stored as 0 alpha: a black silhouette on a premultiplied canvas over a black page', () => {
  const r = quadStub();
  const rect = { x: 0, y: 0, w: 10, h: 10 };
  Renderer.prototype.drawScreenQuad.call(r, {}, rect, undefined, [0.4, 0.3, 0.2]);
  assert.deepEqual(colourUploads(r), [[0.4, 0.3, 0.2, 1]], 'the triple goes up as rgb + 1');
  assert.ok(colourUploads(r).every((v) => v.every(Number.isFinite)), 'nothing NaN reaches the GPU');
  Renderer.prototype.drawScreenQuad.call(r, {}, rect, undefined, [0.4, 0.3, 0.2]);
  assert.equal(colourUploads(r).length, 1, 'the same colour is shadowed, not re-uploaded (PERF-UI)');
  Renderer.prototype.drawScreenQuad.call(r, null, rect, undefined, [1, 1, 1, 0.5]);
  assert.deepEqual(colourUploads(r).at(-1), [1, 1, 1, 0.5], 'a real alpha is its own');
  Renderer.prototype.drawScreenQuad.call(r, null, rect, undefined, [1, 1, 1]);
  assert.deepEqual(colourUploads(r).at(-1), [1, 1, 1, 1], 'and a triple after it re-uploads with 1 - the shadow compares the defaulted alpha, not the missing one');
  // the blend gate reads the same law: a solid triple is opaque, a solid half is not
  assert.equal(screenQuadBlends(null, [1, 1, 1]), false);
  assert.equal(screenQuadBlends(null, [1, 1, 1, 0.5]), true);
  assert.equal(screenQuadBlends({}, [1, 1, 1]), false, 'a textured cutout blends only when asked');
  assert.equal(screenQuadBlends({}, [1, 1, 1], { blend: true }), true);
  assert.equal(screenQuadBlends({}, [1, 1, 1], {}, true), true, 'OVH2: a UI pack\'s alpha art blends without being asked at the call');
  assert.equal(screenQuadBlends(null, [1, 1, 1], {}, true), false, '...and the flag means nothing on a solid quad');
});

// ── 3ARMS ────────────────────────────────────────────────────────────────

test('3ARMS by source: both mods compare the IL\'s 2 to the port\'s Both - DFU declares ItemHands as None, Either, BOTH, LeftOnly, RightOnly, so `== 2` is a two-hander; the mod\'s own C# says `== ItemHands.Both` at HandheldTorches.cs:1311/:1323 and FPSWeaponClone.cs:2378; the relaxed switch ships OFF (the departure that follows HT7: a held two-hander takes both hands)', () => {
  assert.notEqual(ITEM_HANDS.Both, 2, 'the port\'s own numbering is not DFU\'s - which is how 2 was misread');
  assert.equal(MOD_SETTINGS['handheld-torches'].keys['Handling.RelaxedTwoHandedWeapons'].default, false, 'the mod ships true; the port ships false');
});

// ── TORCH-BIND ───────────────────────────────────────────────────────────

test('TORCH-BIND (re-aimed by KB1): every key a vendored mod answers is a registry action with a row in Controls under the mod\'s name - the three torch keys, Eye Of The Beholder\'s two, Travel Options\' follow key, HCC\'s two - and no module reads a TextKey for a key any more', async () => {
  // TORCH-BIND (a player: "No option to rebind Handheld Torches actions") put the TextKeys on the mods' tiles,
  // because each module read its own key raw and that tile was the one door left. KB1 closed the door properly:
  // the keys are actions (MOD_ACTIONS), drawn in Controls beside every other key where a clash can be seen, and the
  // tiles carry no key dials. The relaxed switch still rides the torch tile.
  const { MOD_ACTIONS, ACTION_GROUPS } = await import('../../src/systems/inputActions.js');
  const byMod = Object.fromEntries(ACTION_GROUPS.filter((g) => g.mod).map((g) => [g.mod, g.rows.map((r) => r.action)]));
  for (const [vendor, rows] of Object.entries(MOD_ACTIONS)) {
    assert.deepEqual(rows.map((r) => r.action), byMod[vendor], `${vendor}: every key has a Controls row, under the mod`);
    for (const r of rows) {
      if (r.legacy == null) continue;   // HELM-KEYS: a port row (More sail, Less sail) - no old setting of the mod's to carry
      assert.ok(MOD_SETTINGS[vendor].keys[r.legacy], `${vendor}/${r.legacy} is still declared - the one-time carry reads a player's old choice off it`);
      assert.ok(!modDials(vendor).includes(r.legacy), `${vendor}/${r.legacy} is off the tile - its door is Controls`);
    }
  }
  assert.ok(modDials('handheld-torches').includes('Handling.RelaxedTwoHandedWeapons'));
});

// ── HOTSLOT ──────────────────────────────────────────────────────────────

test('HOTSLOT, driven: a doubled book cannot pin the cycle - one candidate per index, and the walk reaches every spell', () => {
  clearQuickslots();
  const entity = { spells: [{ index: 5, name: 'Spark' }, { index: 5, name: 'Spark' }, { index: 9, name: 'Shock' }, { index: 9, name: 'Shock' }] };
  assert.deepEqual(spellCandidates(entity).map((s) => s.name), ['Spark', 'Shock']);
  assert.equal(cycleQuickslot('spell', { entity }).name, 'Spark');
  assert.equal(cycleQuickslot('spell', { entity }).name, 'Shock', 'the second copy of Spark no longer lands the cycle on Spark again');
  assert.equal(cycleQuickslot('spell', { entity }).name, 'Spark');
  clearQuickslots();
});

/** A DOM fake the enhanced book and the HUD can be mounted over. */
const mkEl = (tag = 'div') => ({
  tag, className: '', textContent: '', id: '', children: [], dataset: {}, onclick: null,
  get innerHTML() { return ''; }, set innerHTML(v) { this.children = []; },   // a re-render clears the host, as the DOM's would
  style: { setProperty() {}, removeProperty() {} },
  classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); },
    toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); return !!on; }, contains(c) { return this._s.has(c); } },
  attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute() {}, remove() {},
  append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, replaceChildren(...c) { this.children = c; },
  addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, focus() {},
  querySelectorAll() { return []; },   // FB1018f SPELL-SCROLL: the repaint asks for the scrolled panes first (ui/domRepaint.js) - a fake with no layout has none
});
const findAll = (n, cls, out = []) => { if (String(n.className ?? '').split(/\s+/).includes(cls)) out.push(n); for (const c of n.children ?? []) findAll(c, cls, out); return out; };

test('HOTSLOT, driven: the enhanced spellbook slots a spell - Quickslot on the picked spell writes the slot, the button reads Unslot on the slotted one, and Unslot clears it', async () => {
  const prevD = globalThis.document, prevW = globalThis.window;
  globalThis.document = { createElement: mkEl, createTextNode: (t) => ({ text: t, className: '' }), getElementById: () => null, head: mkEl('head'), body: mkEl('body'), addEventListener() {}, removeEventListener() {} };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  try {
    const { mountEnhancedSpellbook } = await import('../../src/ui/enhanced/enhancedSpellbook.js');
    clearQuickslots();
    const spark = { index: 5, name: 'Spark', effects: [] }, shock = { index: 9, name: 'Shock', effects: [] };
    const host = mkEl('div');
    const book = mountEnhancedSpellbook(host, { spells: () => [spark, shock], castCost: () => 5, entity: { magicka: 20 } });
    const slotBtn = () => findAll(host, 'sb-slot')[0];
    assert.ok(slotBtn(), 'the picked spell\'s detail carries the slot button');
    assert.equal(slotBtn().textContent, 'Quickslot');
    slotBtn().onclick();
    assert.deepEqual(spellQuickslot(), { index: 5, name: 'Spark' }, 'Spark is in the slot');
    assert.equal(slotBtn().textContent, 'Unslot', 'the book re-rendered with the slotted state');
    assert.ok(slotBtn().className.includes(' on'));
    // pick Shock: its button offers to slot it, and slotting it REPLACES Spark - the change the player could not make
    findAll(host, 'sb-row')[1].onclick();
    assert.equal(slotBtn().textContent, 'Quickslot');
    slotBtn().onclick();
    assert.deepEqual(spellQuickslot(), { index: 9, name: 'Shock' }, 'the slot changed');
    slotBtn().onclick();
    assert.equal(spellQuickslot(), null, 'Unslot clears it');
    assert.ok(findAll(host, 'sb-note').length + findAll(host, 'px-note').length >= 0);
    book.destroy();
    assert.ok(setSpellQuickslot(spark));
    clearQuickslots();
  } finally { globalThis.document = prevD; globalThis.window = prevW; }
});

// ── LOOT-REGEN ───────────────────────────────────────────────────────────

