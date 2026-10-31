// AUDIT FONT3 (2026-10-02, Mac: "Audit this", of FONT3 - 64369501). Each pin below names its finding
// (bible/01-Overview/audits/Audit-Font3.md) and fails on the unfixed tree for the finding's reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PIXEL_FACE_CSS, PIXEL_FONT_CSS, PIXEL_READ_CSS } from '../../src/ui/pixelifyFive.js';
import { PLUS_CSS } from '../../src/ui/enhanced/enhancedPlusStyle.js';
import { ENHANCED_CSS } from '../../src/ui/enhanced/enhancedStyle.js';
import { drawEnhancedTextLayer, hideEnhancedTextLayer } from '../../src/ui/enhanced/enhancedTextLayer.js';
import { PrisonScreenWindow, ENHANCED_PRISON_DAYS_ID } from '../../src/ui/prisonScreen.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const grab = (src, re, what) => { const m = re.exec(src); assert.ok(m, `${what} not found`); return m[1]; };

test('AUDIT FONT3 F2: the held map\'s toolbar buttons take the face alone - their own 0.12em is not outranked', () => {
  const i = PLUS_CSS.indexOf('.hmroot .hmtools button, .hmroot .hmtools .hmfloor, .hmroot .hmtools .dlg-key {');
  assert.ok(i >= 0);
  const body = PLUS_CSS.slice(i, PLUS_CSS.indexOf('}', i));
  assert.ok(body.includes(PIXEL_FACE_CSS), 'the face');
  assert.doesNotMatch(body, /letter-spacing|font-weight/, 'and no reading pair at (0,2,1) over .hmtool\'s (0,2,0)');
  assert.equal(PIXEL_FONT_CSS, `${PIXEL_FACE_CSS} ${PIXEL_READ_CSS}`, 'the trio is the face and the pair');
});

test('AUDIT FONT3 F3: the readied spell is "doubled" only while the spell chip or the hotbar is naming it', () => {
  // the chip it defers to is hidden with the diamond (the reason the caption must speak then)
  assert.match(ENHANCED_CSS, /\.hud-quick\.nodiamond \.hud-qspell \{ display: none; \}/);
});

function fakeDoc() {
  const doc = { byId: new Map() };
  const node = (tag) => {
    const classes = new Set();
    const n = { tag, children: [], attrs: {}, id: '', textContent: '', removed: false,
      get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) classes.add(c); },
      classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
      style: { _p: {}, display: '', cssText: '', setProperty(k, v) { this._p[k] = v; } },
      append(...cs) { for (const c of cs) { n.children.push(c); if (c.id) doc.byId.set(c.id, c); } },
      remove() { n.removed = true; }, setAttribute(k, v) { n.attrs[k] = String(v); } };
    return n;
  };
  doc.createElement = node;
  doc.head = node('head'); doc.body = node('body');
  doc.getElementById = (id) => doc.byId.get(id) ?? [...doc.head.children, ...doc.body.children].find((c) => c.id === id) ?? null;
  return doc;
}

test('AUDIT FONT3 F4: the prison\'s line rides the native panel in the court window\'s colour, never the HUD scale', () => {
  const doc = fakeDoc();
  const had = globalThis.document;
  globalThis.document = doc;
  try {
    const w = new PrisonScreenWindow({ daysInPrison: 3 });
    const renderer = { drawScreenQuad() {}, uploadTexture: () => ({}) };
    // 1920x1200 CSS at dpr 1: the 320x200 panel at scale 6 - the cell is 7 rows x 6 = 42px, a tenth under it 37.8px
    w.draw(renderer, { width: 1920, height: 1200, clientWidth: 1920 }, { fnt: { fixedHeight: 7 } });
    const label = doc.getElementById(ENHANCED_PRISON_DAYS_ID);
    assert.ok(label.classList.contains('hudprison'));
    assert.equal(label.style._p['--prison-px'], '37.8px');
    // a small panel never goes under the floor
    w.draw(renderer, { width: 640, height: 400, clientWidth: 640 }, { fnt: { fixedHeight: 7 } });
    assert.equal(label.style._p['--prison-px'], '12.6px');
    w.draw(renderer, { width: 320, height: 200, clientWidth: 320 }, { fnt: { fixedHeight: 7 } });
    assert.equal(label.style._p['--prison-px'], '11.0px');
  } finally {
    if (had === undefined) delete globalThis.document; else globalThis.document = had;
  }
  const rule = /\n\.hudmid\.hudprison \{([^}]*)\}/.exec(ENHANCED_CSS)[1];
  assert.match(rule, /transform: translateX\(-50%\);/, 'no scale(var(--hud-scale))');
  assert.match(rule, /font-size: var\(--prison-px, 22px\);/);
  assert.match(rule, /color: rgb\(232,196,76\); text-shadow: 2px 2px 0 rgb\(48,36,20\);/, 'DAYS_LABEL_COLOR and DAYS_LABEL_SHADOW');
});

test('AUDIT FONT3 F5: a text layer belongs to the document it was built in', () => {
  const a = fakeDoc(), b = fakeDoc();
  const canvas = { width: 100, height: 100, clientWidth: 100 };
  const item = { text: 'x', x: 0, y: 0, cell: 21, color: [1, 1, 1, 1], shadow: [0, 0, 0, 1], shadowPos: [0, 0] };
  const ra = drawEnhancedTextLayer('audit-f5', [item], canvas, a);
  const rb = drawEnhancedTextLayer('audit-f5', [item], canvas, b);
  assert.notEqual(ra, rb);
  assert.ok(b.body.children.includes(rb), 'built in the second document');
  assert.ok(ra.removed, 'the first one\'s node taken out');
  hideEnhancedTextLayer('audit-f5');
  assert.equal(rb.style.display, 'none');
});

// ── the layout lens (L) and the record (C): each a rule the measurement found broken, held where it was fixed ──
import { PARTY_CSS } from '../../src/ui/partyPanel.js';
const ruleBody = (css, sel) => { const i = css.indexOf(`${sel} {`); assert.ok(i >= 0, `${sel} not found`); return css.slice(i, css.indexOf('}', i)); };

test('AUDIT FONT3 L2: the party\'s place line keeps a row inside PARTY8\'s 48px', () => {
  assert.match(ruleBody(PARTY_CSS, '.dfparty-where'), /font-size: 11px; line-height: 1; letter-spacing: 0;/);
  assert.match(ruleBody(PARTY_CSS, '.dfparty-name'), /letter-spacing: 0;/);
});

test('AUDIT FONT3 L3/L6/L7: the corners and the narrow labels track none where the floor met a fixed box', () => {
  // the phone override stands AFTER the shelf label's own rule, or it loses on order (the fix's own first cut did)
  const label = PLUS_CSS.indexOf('.pack-shell .shelflabel { max-width: 100%;');
  const phone = PLUS_CSS.indexOf('@media (max-width: 640px) { .pack-shell .shelflabel { letter-spacing: 0; } }');
  assert.ok(label >= 0 && phone > label, 'the phone\'s shelf label after the label');
  assert.match(ENHANCED_CSS, /\.ft-tile-name \{[^}]*letter-spacing: 0; \}/);
  assert.match(PLUS_CSS, /body \.wb-dmg-num \{ font-size: 11px; letter-spacing: 0; \}/);
});

test('AUDIT FONT3 C2/C3: the dim a step under the mid, and the film\'s phone words at the floor', () => {
  assert.match(ENHANCED_CSS, /--dim: #9a9486;/);
});
