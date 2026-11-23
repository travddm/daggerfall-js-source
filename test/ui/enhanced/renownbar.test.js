// RENOWN-BAR: THE HUD'S
// RENOWN ROW IS THE BOX AND THE THIN BAR, AND THE BAR IS ON THE MIDDLE. RENOWN4 drew box, bar, numbers - the numbers a
// readout beside the bar, so the bar's middle stood 42px left of the vitals' (57px at the widest numbers,
// tools/renownBarProbe.mjs). Now there are no numbers on the HUD - they are the profile menu's (ui/enhanced/enhancedAccount.js,
// its Renown row: "Mara Venn - Renown 10, 490 / 2,150 XP to Renown 11", renown1.test.js drives it) - the bar is
// RENOWN4's own 8px, and the row is a grid of three columns - the box, the bar and an empty column the box's width -
// so the bar's middle is the row's, and the row is as wide as the vitals' and centred under them. The probe measures it
// in Chromium (centre off 0.0px at a desktop, a laptop and a phone both ways up); these hold the markup and the sheet.
// UI3: THE NUMBERS GO BACK IN THE BAR, now that nothing stands under it - the bar the
// vitals' own 20px, the level's credit over its span inside it ("490 / 2,150 XP"), "Highest" at the cap; the row keeps
// its three columns (so the bar stays on the middle) and its 22px (which the quickslot block's lifts count).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renownXpFor, RENOWN_MAX, renownProgressText } from '../../../src/net/renown.js';
import { setHudRenown } from '../../../src/ui/hud/hudRenown.js';
import { PLUS_CSS } from '../../../src/ui/enhanced/enhancedPlusStyle.js';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const rule = (sheet, sel) => {
  const at = sheet.indexOf(`\n${sel} {`);
  assert.ok(at >= 0, `${sel} has a rule`);
  return sheet.slice(at + 1, sheet.indexOf('}', at) + 1);
};

const mkEl = () => ({
  className: '', textContent: '', id: '', rel: '', href: '', src: '', alt: '', children: [], dataset: {},
  style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } },
  classList: {
    _s: new Set(),
    add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); },
    toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); },
  },
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
const classes = (n) => String(n.className ?? '').split(/\s+/);
const words = (n) => `${n.textContent ?? ''}${(n.children ?? []).map(words).join('')}`;

test('RENOWN-BAR the HUD, executed: the row is the box and the bar and nothing else; UI3 the bar holds its fill, its ghost and its words - the level\'s credit over its span part-way, "Highest" at the cap; the box follows the level (mutants: the words gone from the bar; the words stale at the cap)', async () => {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: mkEl, createElementNS: (ns) => Object.assign(mkEl(), { ns }),
    getElementById: () => null, head: mkEl(), body: mkEl(),
  };
  const { drawEnhancedHud, destroyEnhancedHud } = await import('../../../src/ui/enhanced/enhancedHud.js');
  const { clearQuickslots } = await import('../../../src/systems/quickslots.js');
  clearQuickslots();
  const entity = { health: 40, maxHealth: 80, magicka: 0, maxMagicka: 10, fatigue: 100, items: [], equip: { slots: {} }, lightSource: null };
  try {
    let s = { level: 10, xp: 6000, pending: 1000 };
    setHudRenown(() => s);
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    const root = document.body.children.find((n) => n.className === 'hud');
    const row = find(root, 'hud-renown');
    // SKILL-READY / FIRM-STARS: and the two tiles that stand outside its ends (ui/hud/hudAdvance.js), hidden until they count
    assert.deepEqual(row.children.map(classes), [['hud-renownbox'], ['hud-track', 'hud-renowntrack'], ['hst-cell', 'hud-adv', 'hud-adv-skill'], ['hst-cell', 'hud-adv', 'hud-adv-firm']], 'the box and the bar, and the two tiles beside them');
    const track = row.children[1];
    assert.deepEqual(track.children.map(classes), [['hud-fill'], ['hud-renownghost'], ['hud-renownnum']], 'the fill, the ghost and (UI3) the words, over both');
    assert.equal(words(track), '490 / 2,150 XP', 'UI3: the XP in the bar');
    assert.equal(row.children[0].textContent, '10');
    s = { level: 50, xp: renownXpFor(RENOWN_MAX) };
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(words(track), 'Highest', 'and at the cap, the cap');
    assert.equal(find(track, 'hud-fill').style.width, '100.0%', 'the cap a full bar');
    assert.equal(row.children[0].textContent, '50');
  } finally {
    destroyEnhancedHud();
    clearQuickslots();
    setHudRenown(null);
    globalThis.document = prev;
  }
});

test('RENOWN-BAR the sheet: the row lit is a grid of three columns with the outer two equal, so the bar\'s middle is the row\'s; the box fits its column; UI3 the bar the vitals\' own height inside the row\'s 22px, its words centred and dressed as theirs, Plus\'s gold banded as theirs (mutants: the mirror column dropped; the row a flex again; the columns narrower than the box; the bar thin again; the bar taller than its row)', () => {
  assert.match(PLUS_CSS, /\.hud-renownnum \{ color: #fffaf0; text-shadow: 1px 1px 0 #050608, 2px 2px 0 rgba\(0,0,0,0\.7\); \}/, 'Plus dresses them as the vitals\' numbers');
  assert.match(PLUS_CSS, /\.hud-num \{ position: relative; z-index: 1; padding-right: 10px;\n\s*font-size: 12px; font-variant-numeric: tabular-nums; color: #fffaf0;\n\s*text-shadow: 1px 1px 0 #050608, 2px 2px 0 rgba\(0,0,0,0\.7\); \}/, '...which are these');
  assert.match(PLUS_CSS, /\.hud-renown \.hud-fill \{ background: linear-gradient\(180deg, #fff0b8 0 2px, #f2c46b 2px 6px, #d9a441 6px 13px, #a87a2a 13px 17px, #6e4f1a 17px 100%\); \}/, 'Plus\'s gold, banded at the vitals\' own stops');
  assert.match(PLUS_CSS, /\.hud-vital \.hud-fill \{ position: absolute; inset: 0; width: 100%;\n\s*background:\n\s*linear-gradient\(180deg, var\(--v-hi\) 0 2px, var\(--v-lite\) 2px 6px, var\(--v-body\) 6px 13px,\n\s*var\(--v-lo\) 13px 17px, var\(--v-deep\) 17px 100%\); \}/, '...which are these');
});

test('RENOWN-BAR the numbers are the profile menu\'s: its Renown row says how far into the level the character is - "1,453 / 3,460 XP to Renown 13" - and the highest at the cap (mutants: the profile\'s row loses its numbers)', () => {
  assert.equal(renownProgressText(renownXpFor(12) + 1453), '1,453 / 3,460 XP to Renown 13');
  assert.equal(renownProgressText(renownXpFor(RENOWN_MAX)), 'the highest there is');
});
