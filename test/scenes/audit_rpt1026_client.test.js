// AUDIT RPT1026 (lane K, the client): the audit of FIELD BUGS 2026-10-26r's RPT1026-CLIENT, each finding driven through
// the real modules (, RPT1026-CLIENT's AUDIT rows).
//   K2 - the lost graphics context's report, the page's one way back, carried the new Dismiss: dismissed, the dead
//        canvas was left with nothing to say how to reload. Driven through main.js's own three statements.
//   K3 - the pins of PEER-SHAKE did not hold the Motion row's own values: driven through the one cast engine
//        (createPlayerMagic) and the menu's own row (portPool).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import { betterAmbience } from '../../src/systems/betterAmbience.js';
import { getPref, setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { portPool } from '../../src/ui/enhanced/enhancedMenu.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ── K2: the lost graphics context's report keeps its way back ──────────────────────────────────────────────────────

const main = read('src/main.js');
/** The whole statement that starts at `needle` (balanced braces; a listener's call closes after its body). */
function statementAt(src, needle) {
  const at = src.indexOf(needle);
  assert.ok(at >= 0, `main.js still holds ${needle}`);
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, src[i + 1] === ')' ? src.indexOf(';', i) + 1 : i + 1);
  }
  return assert.fail('unbalanced');
}
/** A page whose elements keep a real element's rules: textContent replaces the children, remove() takes an element out
 *  of its parent (or the page). */
function page() {
  const els = new Map();
  class El {
    constructor(tag) { this.tag = tag; this.style = {}; this.children = []; this._text = ''; this.parent = null; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); for (const c of this.children) c.parent = null; this.children = []; }
    appendChild(c) { this.children.push(c); c.parent = this; return c; }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } else if (els.get(this.id) === this) els.delete(this.id); }
  }
  let lost = null, reloads = 0;
  const canvas = { addEventListener: (ev, fn) => { if (ev === 'webglcontextlost') lost = fn; } };
  const document = { getElementById: (id) => (id === 'c' ? canvas : els.get(id) ?? null), createElement: (tag) => new El(tag), body: { appendChild: (el) => els.set(el.id, el) } };
  const code = `${statementAt(main, 'function crashOverlay(msg) {')}\n${statementAt(main, 'function crashDismiss(el) {')}\n`
    + `${statementAt(main, "document.getElementById('c')?.addEventListener('webglcontextlost'")}\nreturn crashOverlay;`;
  const crashOverlay = new Function('document', 'location', 'pageGoing', code)(document, { reload: () => reloads++ }, false);
  return { els, crashOverlay, lose: () => lost({ preventDefault() {} }), reloads: () => reloads };
}
const buttons = (el) => el.children.filter((c) => c.tag === 'button');

// ── K3: the Motion row writes the shares the engine reads ──────────────────

afterEach(() => resetPrefs());

/** The engine with a wall across z = 3, my feet at the origin (test/scenes/rpt1026_client_peershake.test.js's). */
function engine() {
  const raycast = (pos, dir, max) => { const d = dir[2] > 0 ? (3 - pos[2]) / dir[2] : Infinity; return d >= 0 && d <= max ? d : Infinity; };
  const player = { isPlayer: true, level: 1, health: 50, maxHealth: 50, maxMagicka: 500, magicka: 500, skills: new Array(40).fill(50), skillUses: new Array(40).fill(0), stats: { intelligence: 50, willpower: 50, endurance: 50 }, career: {}, activeEffects: [] };
  const magic = createPlayerMagic({
    renderer: { createBillboardBatch: () => ({ origin: null }), destroyBillboardBatch: () => {} },
    audio: { playOneShot() {}, play3d() {}, playOneShotId() {}, play3dId() {} },
    getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }),
    uploadRecord() {}, uploadRecordFrame() {},
    collider: { raycast },
    playerEntity: player,
    playerSinks: { hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {}, say() {} },
    say() {}, surfacePlayer() {},
    foes: () => [],
    foeSinks: () => ({ hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {} }),
    absorbCtx: () => ({ inside: true, day: false }),
    rolls: () => 0.99,
  });
  magic.update(0, [0, 0, 0]);
  const fly = (n = 30) => { for (let i = 0; i < n && magic.missileCount() > 0; i++) magic.update(1 / 30, [0, 0, 0]); };
  return { magic, fly };
}
function kicks(t) {
  const seen = [];
  t.mock.method(betterAmbience, 'weaponKick', (k) => { seen.push(k); });
  return seen;
}
const peerBolt = () => { const E = engine(); E.magic.spellVisual({ from: [0, 1, 0], dir: [0, 0, 1], element: 0, rangeType: 2, casterId: 'peer-1' }); E.fly(); };

/** A document just big enough for the menu's row builders (test/systems/org2_options.test.js's), the Motion row's main
 *  button pressed until the share stands at `want`. */
function portRow(want) {
  const make = (tag) => {
    const n = { tag, children: [], className: '', textContent: '', title: '', type: '', disabled: false, style: {}, dataset: {}, attrs: {},
      append(...cs) { n.children.push(...cs); }, prepend(...cs) { n.children.unshift(...cs); }, setAttribute(k, v) { n.attrs[k] = v; }, addEventListener() {}, querySelectorAll: () => [],
      classList: { add() {}, toggle() {}, contains: () => false } };
    return n;
  };
  globalThis.document = { createElement: make, createTextNode: (s) => ({ textContent: s }), querySelectorAll: () => [], getElementById: () => null };
  globalThis.window = { location: { search: '' }, navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }) };
  try {
    for (let i = 0; i < 3 && Number(getPref('peerSpellShake')) !== want; i++) {
      const row = portPool().get('peerSpellShake');
      assert.ok(row, 'the Motion row is in the port pool');
      row.children.find((c) => c.className === 'row-main').onclick();
    }
  } finally { delete globalThis.document; delete globalThis.window; }
  assert.equal(Number(getPref('peerSpellShake')), want, `the row reaches ${want}`);
}

test('AUDIT RPT1026 K3: the Motion row writes the shares the engine reads - pressed from Half to Off no kick, to Full the whole kick, back to Half half of it', (t) => {
  const seen = kicks(t);
  portRow(0);   // Half -> Off
  peerBolt();
  assert.equal(seen.length, 0, 'Off: none');
  portRow(1);   // Off -> Full
  peerBolt();
  assert.equal(seen.length, 1);
  const E = engine();
  E.magic.setReadied({ name: 'Firebolt', index: 91, element: 0, rangeType: 2, effects: [{ type: 4, subType: 0, magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1, durationBase: 0, durationMod: 0, durationPerLevel: 1, chanceBase: 0, chanceMod: 0, chancePerLevel: 1 }] });
  E.magic.castInput([0, 1, 0], [0, 0, 1]);
  E.fly();
  assert.ok(Math.abs(seen[0] - seen[1]) < 1e-9, 'Full: a peer\'s bolt kicks as my own');
  portRow(0.5);   // Full -> Half
  peerBolt();
  assert.ok(Math.abs(seen[2] - seen[0] / 2) < 1e-9, `Half: half the kick (${seen[2]} against ${seen[0]})`);
});
