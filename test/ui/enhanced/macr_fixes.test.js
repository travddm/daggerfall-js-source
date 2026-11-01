import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { perspective } from '../../../src/world/mat4.js';
import { FP_FIELD_OF_VIEW, frustum, fpFrameWindow } from '../../../src/combat/fpArm.js';
import { offHandQuickslot, quickslotView, assignQuickslot, clearQuickslots, QUICKSLOT_TEXT } from '../../../src/systems/quickslots.js';
import { TEMPLATES } from '../../../src/systems/useItem.js';
import { EQUIP_SLOTS } from '../../../src/characters/paperdoll/paperdoll.js';
import { mountEnhancedInventory } from '../../../src/ui/enhanced/enhancedInventory.js';
import { withDom } from '../../invdrag.mjs';

// ═══ MAC-R: FOUR UNRELATED BUGS, MAC'S LIST ═══════════
//
//   1. "Morrowind weapons that go above the screen show their blade
//      clipped off" - the arm's frame was exactly the screen and the
//      Weapon Widget's bob shifted the COMPOSITE down, so the frame's
//      top edge cut a raised blade. MAC-R1: the frame was padded above
//      the screen while a transform was set (an off-centre frustum over
//      the same lens), and the composite extended up by the same share.
//      DISC13-C found the SIDES had the same cut (a torch in
//      the left hand) and replaced the pad with a frame window (fpArm.js
//      fpFrameWindow): the pass renders the lens's own pixel grid wherever
//      the moved rect shows it on the screen, so no edge can cut, the top
//      included. The pin below is that law's top edge; test/systems/disc13.test.js
//      drives all four through the real arm.
//   2. "The enhanced quickbar sometimes shows double messages" - a held
//      key auto-repeats its keydown, and the two quickslot actions that
//      are not polled (swap, off hand) were routed on every repeat: two
//      lines, a net nothing. MAC-R2: the press edge alone.
//   3. "Tapping the equip hand in the quickbar doesn't switch to your
//      other weapon in hand (still bound to H). Even if a torch isn't
//      equipped a message still shows up that you can't light the
//      torch" - MAC-R3: a hand cell's own act is DFU's SwitchHand; the
//      off cell presses what it SHOWS in full, and the light's refusal
//      is said only where no hand can be switched.
//   4. "Hold to drag in the enhanced inventory sometimes doesn't work
//      properly" - MAC-R4: the implicit touch capture is given back at
//      the press so a repaint's `lostpointercapture` cannot end the
//      session, the long-press menu is refused, and iOS's callout too.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// ── MAC-R1 ───────────────────────────────────────────────────────
const apply = (m, v) => {
  const o = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) o[r] = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3];
  return o;
};
const ndcY = (m, p) => { const c = apply(m, [p[0], p[1], p[2], 1]); return c[1] / c[3]; };

test('MAC-R1: a raised blade is not cut - a rect the bob moved DOWN gets frame rows above the lens\'s own top, laid from the screen\'s top, and a rect at rest is the screen\'s own frame through exactly perspective (DISC13-C\'s frame window, fpFrameWindow)', () => {
  const near = 0.2, far = 400, W = 1600, H = 1000, pw = 400, ph = 250;   // 4 screen px a frame pixel
  const hh = near * Math.tan(FP_FIELD_OF_VIEW / 2), hw = hh * (pw / ph), py = (2 * hh) / ph;
  const sym = perspective(FP_FIELD_OF_VIEW, pw / ph, near, far);
  const same = frustum(-hw, hw, -hh, hh, near, far);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(sym[i] - same[i]) < 1e-9, `frustum's symmetric case is perspective (element ${i})`);
  const rest = fpFrameWindow({ x: 0, y: 0, w: W, h: H }, W, H, pw, ph);
  assert.deepEqual([rest.k0, rest.r0, rest.nx, rest.ny], [0, 0, pw, ph], 'at rest: the screen\'s own frame');
  assert.deepEqual(rest.dst, { x: 0, y: 0, w: W, h: H });
  const dy = 60;   // the bob moved the rect down fifteen frame rows
  const down = fpFrameWindow({ x: 0, y: dy, w: W, h: H }, W, H, pw, ph);
  assert.equal(down.r0, -15, 'fifteen rows above the lens\'s own top are rendered');
  assert.equal(down.ny, ph, 'and fifteen fewer at the bottom, which hangs off the screen');
  assert.ok(down.dst.y <= 0 && down.dst.y + down.dst.h >= H, 'the composite covers the screen');
  const lens = frustum(-hw, hw, hh - (down.r0 + down.ny) * py, hh - down.r0 * py, near, far);
  const k = 7;   // any depth
  const v = ndcY(lens, [0, hh * k, -near * k]);
  assert.ok(Math.abs(down.dst.y + (1 - v) / 2 * down.dst.h - dy) < 1e-3, 'the lens\'s old top edge is composited dy below the screen\'s top: the rows above it are drawn, not cut');
});

// ── MAC-R3 ───────────────────────────────────────────────────────
const torch = () => ({ group: 'UselessItems2', templateIndex: TEMPLATES.Torch, currentCondition: 50, maxCondition: 50 });
const shield = () => ({ group: 'Armor', templateIndex: 109 });
const sword = () => ({ group: 'Weapons', templateIndex: 120, currentCondition: 50, maxCondition: 50 });
const hero = () => ({ items: [], equip: { slots: {} }, lightSource: null });
const doors = () => {
  const said = [], calls = [];
  return { said, calls, say: (l) => said.push(l), toggleLight: () => { calls.push('light'); return true; }, switchHand: () => { calls.push('hand'); return true; } };
};

test('MAC-R3: the off-hand press is what the cell SHOWS - a lit light douses, a carried light ignites, the shield, the off-hand weapon and an empty hand with no light SWITCH HANDS, the swap is the caller\'s, and the refusal is said only where no hand can be switched', () => {
  clearQuickslots();
  // an empty off hand and no light anywhere: the other hand, silently
  let e = hero(); let d = doors();
  assert.equal(quickslotView(e).off.kind, 'empty');
  assert.deepEqual(offHandQuickslot({ entity: e, ...d }), { kind: 'hand' });
  assert.deepEqual(d.calls, ['hand']); assert.deepEqual(d.said, [], 'no "You have no light source." over a hand that can switch');
  // ...and the same press with no rig door says the line it always said
  d = doors();
  assert.deepEqual(offHandQuickslot({ entity: e, say: d.say, toggleLight: d.toggleLight }), { kind: 'none' });
  assert.deepEqual(d.said, [QUICKSLOT_TEXT.noLight]);
  // a torch in the pack, hand empty: the mod's ignite
  e = hero(); e.items.push(torch()); d = doors();
  assert.deepEqual(offHandQuickslot({ entity: e, ...d }), { kind: 'light', lit: false });
  assert.deepEqual(d.calls, ['light']);
  // a lit light: the douse
  e = hero(); const lit = torch(); e.items.push(lit); e.lightSource = lit; d = doors();
  assert.equal(quickslotView(e).off.kind, 'torch');
  assert.deepEqual(offHandQuickslot({ entity: e, ...d }), { kind: 'light', lit: true });
  assert.deepEqual(d.calls, ['light']);
  // a shield on the left: the other hand (the rig's own refusal when it is the shield hand)
  e = hero(); e.equip.slots[EQUIP_SLOTS.LeftHand] = shield(); d = doors();
  assert.equal(quickslotView(e).off.kind, 'shield');
  assert.deepEqual(offHandQuickslot({ entity: e, ...d }), { kind: 'hand' });
  assert.deepEqual(d.calls, ['hand']);
  d = doors(); d.switchHand = () => false;
  assert.deepEqual(offHandQuickslot({ entity: e, ...d }), { kind: 'refused' }, 'the rig refused: DFU\'s ToggleHand over a shield, silently');
  // a weapon on the left (a bow): the other hand - even with a torch in the pack, the cell shows the bow
  e = hero(); e.equip.slots[EQUIP_SLOTS.LeftHand] = sword(); e.items.push(torch()); d = doors();
  assert.equal(quickslotView(e).off.kind, 'weapon');
  assert.deepEqual(offHandQuickslot({ entity: e, ...d }), { kind: 'hand' });
  assert.deepEqual(d.calls, ['hand'], 'the bow in hand is what the cell shows, so the press is the hand, not the torch');
  // the swap: answered before this is asked, and untouched here
  e = hero(); const spare = sword(); e.items.push(spare); assignQuickslot('swap', spare); d = doors();
  assert.equal(quickslotView(e).off.kind, 'swap');
  assert.deepEqual(offHandQuickslot({ entity: e, ...d }), { kind: 'swap' });
  assert.deepEqual(d.calls, []);
  clearQuickslots();
});

// ── MAC-R4 ───────────────────────────────────────────────────────
const mkItem = (name, templateIndex, group = 'Weapons') => ({ name, templateIndex, group, stackCount: 1, currentCondition: 50, maxCondition: 50 });
function withPack(fn) {
  return withDom((dom) => {
    const host = dom.mk('div');
    dom.body.append(host);
    const e = { name: 'Aelwyn', career: { name: 'Spellsword' }, stats: { strength: 50, endurance: 48 }, items: [mkItem('Longsword', 120), mkItem('Dagger', 113), mkItem('Broadsword', 121)] };
    const dropped = [];
    mountEnhancedInventory(host, { entity: e, items: () => e.items, onExit: () => {}, dropItem: (it) => dropped.push(it) });
    const rows = () => dom.doc.querySelectorAll('.itemrow');
    const ghost = () => dom.doc.querySelectorAll('.dragghost')[0] ?? null;
    return fn({ dom, e, rows, ghost });
  });
}

