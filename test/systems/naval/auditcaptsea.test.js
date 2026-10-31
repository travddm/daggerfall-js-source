// AUDIT CAPTAIN'S SEA (2026-10-11, the owner: "Lets do a comprehensive audit, enaure this is insanely detailed and
// perfection. No exceptions") - the pre-merge audit of the naval update (#781: CAPT-CREW, CAPT-LOG, CAPT-PAY, CAPT-MARQUE,
// CAPT-WATERS, CAPT-BOARD, CAPT-TRADE, CAPT-CHARTS, SPYGLASS and the Eltheric Ocean's ETHER-* slices): nine lenses, each
// finding verified by a probe and pinned here, executed wherever a seam can be stood up. Ids: C the crew, G the Eltheric
// ground, X the crossing and the chart, D traffic, law and legends, L the ledger, the save and online, H the docs' and the
// tests' honesty, S the spyglass, P the isles' places in the world, B the board, the exchange and the charts.
// bible/01-Overview/audits/Audit-Captains-Sea.md; tools/mutants/auditcaptsea.json.
import '../../modsOff.js';
import { byClass } from '../../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KNOW, glassHolds, glassCard, cargoWords, handsWords, hullWord, merchantOfHull, RETICLE_DEG } from '../../../src/systems/naval/shipKnowledge.js';
import { classById, CROWNS, classLine } from '../../../src/systems/naval/navalShips.js';
import { etherShipNames, ISLES_FLAG } from '../../../src/systems/naval/etherShips.js';
import { NIGHT_DARK_SIGHT } from '../../../src/systems/naval/shipWatch.js';
import { DEEP_TIER } from '../../../src/systems/naval/navalDirector.js';
import { GLASS_AIM_LIFT } from '../../../src/scenes/naval/navalHost.js';
import { drawSpyglass, glassFootWords, spyglassTaps, nextGlassZoom } from '../../../src/ui/spyglassView.js';
import { drawNavalHud, destroyNavalHud } from '../../../src/ui/naval/navalHud.js';
import { helmPadPrompts } from '../../../src/ui/enhanced/enhancedHelm.js';
import { createBindings, resetDefaults, setBinding, getBinding, clearBinding, addRemovedPrimaryAction, serializeKeyBinds, loadKeyBinds } from '../../../src/systems/inputActions.js';
import { attachTouch } from '../../../src/ui/touch/touch.js';
import { attachGamepad, GLASS_PAD_ZOOM } from '../../../src/ui/gamepadInput.js';
import { applyPlusPadLayout, registerCrossbar, crossbarApi, setPlusDpad } from '../../../src/ui/plus/plusPad.js';
import { setBindings } from '../../../src/ui/input.js';
import { setPref, _resetForTests as resetPrefs } from '../../../src/systems/uiPrefs.js';
import { _resetForTests as resetSettings } from '../../../src/systems/settings/settings.js';
import { sea, knowAll } from '../../navalSea.mjs';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const spawn = (s, cls, range, bearing = Math.PI / 2, o = {}) => s.host._sea.get(s.host.spawnShip(cls, { range, bearing, ...o }));
const tagOf = (s, e) => s.host.tags().find((t) => t.id === e.id) ?? null;
/** The glass laid on her hull's middle from the harness eye. */
const aimAt = (s, e) => { const o = s.view.look.origin; s.view.look = { origin: o, dir: [e.ship.pos[0] - o[0], e.ship.pos[1] + GLASS_AIM_LIFT - o[1], e.ship.pos[2] - o[2]] }; };
/** The glass up on her for `seconds`, the sea stepped with it (the world's order: the glass, then the frame). */
function hold(s, e, seconds, dt = 0.1, o = {}) {
  let card = null;
  for (let t = 0; t < seconds - 1e-9; t += dt) { if (e) aimAt(s, e); card = s.host.glass(dt, { up: true, ...o }); s.run(dt, dt); }
  return card;
}
/** The first seed whose wary pirate of `cls` flies false colours (and the crown she flies). */
async function deceiver(cls = 'pirateSloop') {
  const { falseFlagOf } = await import('../../../src/systems/naval/shipKnowledge.js');
  for (let seed = 1; ; seed++) { const f = falseFlagOf(classById(cls), seed, 'wary'); if (f) return { seed, flag: f }; }
}

// ── S: the spyglass ─────────────────────────────────────────────────────────────────────────────────────────────────

test('AUDIT CAPTAIN\'S SEA S2: the touch corner\'s Glass and a d-pad\'s Spyglass are the host\'s own door - never K, which is the road\'s follow too (a "Spyglass (aboard)" button followed the road ashore) (mutants: the corner\'s share door, the pad\'s share door, the world\'s answer)', async () => {
  // the finger
  const prev = { d: globalThis.document, w: globalThis.window, k: globalThis.KeyboardEvent };
  const keys = [];
  const stubEl = () => ({
    id: '', textContent: '', children: [], _l: new Map(), attrs: {}, style: { cssText: '' },
    appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { if (!this._l.has(t)) this._l.set(t, []); this._l.get(t).push(f); },
    setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    fire(t, e) { for (const f of [...(this._l.get(t) ?? [])]) f(e); },
  });
  globalThis.KeyboardEvent = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.document = { createElement: () => stubEl(), body: stubEl() };
  globalThis.window = { ontouchstart: null, dispatchEvent: (e) => { keys.push(e); return true; }, prompt: () => null };
  const store = createBindings(); resetDefaults(store); setBindings(store);
  assert.equal(getBinding(store, 'Spyglass'), 'KeyK', 'a share on K');
  setPref('touchButton1', 'Spyglass');
  const asked = [];
  let h = null;
  try {
    h = attachTouch(stubEl(), { look() {}, padAction: (a) => { asked.push(a); return true; } });
    const glass = h.el.children.find((c) => !c.removed && c.textContent === 'Glass');
    assert.ok(glass, 'the corner\'s Glass');
    glass.fire('touchstart', { type: 'touchstart', timeStamp: 0, preventDefault() {}, stopPropagation() {}, changedTouches: [] });
    assert.deepEqual(asked, ['Spyglass'], 'the host\'s door');
    assert.deepEqual(keys.filter((e) => e.type === 'keydown').map((e) => e.code), [], 'and no K');
  } finally { h?.dispose?.(); globalThis.document = prev.d; globalThis.window = prev.w; globalThis.KeyboardEvent = prev.k; resetPrefs(); }
  // the pad's d-pad
  const prevW = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  resetPrefs(); resetSettings();
  setPref('plusPadLayout', 0);
  const ps = createBindings(); resetDefaults(ps); applyPlusPadLayout(ps); setBindings(ps);
  const wasXb = crossbarApi();
  registerCrossbar({ inForce: () => true, press() {}, setActive() {} });
  const events = [], door = [];
  const pad = { connected: true, mapping: 'standard', id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const canvas = { dispatchEvent() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), style: {} };
  const gp = attachGamepad(canvas, { overlayActive: () => false, paused: () => false, attack() {}, look() {}, padAction: (a) => { door.push(a); return true; } },
    { getPads: () => [pad], dispatch: (t, c) => events.push(`${t}:${c}`), makeEvent: (type, init) => ({ type, ...init }) });
  try {
    gp.tick(1 / 60);
    assert.equal(setPlusDpad('up', 'tap', 'Spyglass'), true);
    events.length = 0;
    pad.buttons[12] = { pressed: true, value: 1 }; gp.tick(1 / 60);
    pad.buttons[12] = { pressed: false, value: 0 }; gp.tick(1 / 60); gp.tick(1 / 60);
    assert.deepEqual(door, ['Spyglass'], 'the host\'s door');
    assert.ok(!events.includes('keydown:KeyK'), `and no K: ${events}`);
  } finally { gp.dispose(); registerCrossbar(wasXb); globalThis.window = prevW; resetPrefs(); }
});

test('AUDIT CAPTAIN\'S SEA S3: at a helm the d-pad press the player gave the glass is the glass\'s (the helm\'s own gesture on it yields, its prompts say so); the look stick\'s click turns the glass\'s magnification under a pad, a finger has Magnify and Lower; the foot names the pad\'s presses (mutants: the helm\'s pass, the click\'s zoom, the click kept from its action, the round, the prompts)', () => {
  const prevW = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  resetPrefs(); resetSettings();
  setPref('plusPadLayout', 0);
  const ps = createBindings(); resetDefaults(ps); applyPlusPadLayout(ps); setBindings(ps);
  const wasXb = crossbarApi();
  registerCrossbar({ inForce: () => true, press() {}, setActive() {} });
  const events = [], door = [], gestures = [];
  let zooms = 0, up = false;
  const pad = { connected: true, mapping: 'standard', id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const canvas = { dispatchEvent() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), style: {} };
  const gp = attachGamepad(canvas, {
    overlayActive: () => false, paused: () => false, attack() {}, look() {}, padAction: (a) => { door.push(a); return true; },
    helm: { up: () => true, gesture: (dir, kind) => { gestures.push(`${dir}:${kind}`); return false; }, prompts: () => null },
    glass: { up: () => up, zoom: () => { zooms++; } },
  }, { getPads: () => [pad], dispatch: (t, c) => events.push(`${t}:${c}`), makeEvent: (type, init) => ({ type, ...init }) });
  const tap = (i, frames = 1) => { pad.buttons[i] = { pressed: true, value: 1 }; for (let f = 0; f < frames; f++) gp.tick(1 / 60); pad.buttons[i] = { pressed: false, value: 0 }; gp.tick(1 / 60); gp.tick(1 / 60); };
  try {
    gp.tick(1 / 60);
    setPlusDpad('left', 'tap', 'Spyglass');
    tap(14);   // d-pad left, tapped at the helm
    assert.deepEqual([door, gestures], [['Spyglass'], []], 'the glass\'s - the helm\'s slower yields');
    tap(14, 40);   // held: still the helm's trim
    assert.deepEqual(gestures, ['left:hold'], 'its hold the helm\'s');
    tap(15);
    assert.deepEqual(gestures, ['left:hold', 'right:tap'], 'another direction the helm\'s');
    // the look stick's click: the glass's while it is up, its own action never pressed
    const r3 = 11;   // the standard mapping's right stick click - Unity's JoystickButton9
    events.length = 0;
    tap(r3);
    assert.equal(zooms, 0, 'the glass down: the click is its own');
    assert.ok(events.some((e) => e === `keydown:${GLASS_PAD_ZOOM}` || /^keydown:/.test(e)), `its action pressed: ${events}`);
    up = true; events.length = 0;
    tap(r3);
    assert.equal(zooms, 1, 'up: one turn of the glass');
    assert.deepEqual(events.filter((e) => e.startsWith('keydown')), [], 'and nothing else hears the click');
  } finally { gp.dispose(); registerCrossbar(wasXb); globalThis.window = prevW; resetPrefs(); }
  assert.equal(GLASS_PAD_ZOOM, 'JoystickButton9');
  assert.deepEqual([nextGlassZoom(2), nextGlassZoom(4), nextGlassZoom(8)], [4, 8, 2], 'x2, x4, x8, round');
  // the helm's prompts: its own words, the glass's press in its place
  const h = { hasSails: true, squareToggle: false, manualTrim: false, timeDial: true };
  assert.deepEqual(helmPadPrompts(h, { glass: [] }), helmPadPrompts(h), 'none chosen: as they were');
  // the foot
  assert.equal(glassFootWords({ zoom: 4, pad: true, keys: { glass: 'D-pad left', zoom: 'Right stick click' } }), 'x4 - Right stick click: magnify - D-pad left: lower the glass');
  assert.equal(glassFootWords({ zoom: 2, touch: true, keys: { glass: 'K' } }), 'x2', 'a finger\'s presses are the foot\'s buttons');
});

test('AUDIT CAPTAIN\'S SEA S4: the compass marks a ship by what I know - an unknown hull\'s, false colours\' and a ship I have made out\'s true stance (a red mark told friend from foe the card withheld) (mutants: the knowledge gate, the disguise gate)', async () => {
  const s = await sea({ hull: 2 });
  const p = spawn(s, 'pirateSloop', 800, Math.PI / 2, { temper: 'bold' });
  p.plain = true;
  s.run(0.2);
  const mark = () => s.host.compassShips().find((m) => Math.abs(m.x - p.ship.pos[0]) < 1e-6 && Math.abs(m.z - p.ship.pos[2]) < 1e-6)?.kind;
  assert.equal(p.known, KNOW.hull);
  assert.equal(mark(), 'ship', 'an unknown hull: no red');
  p.known = KNOW.colours;
  assert.equal(mark(), 'hostile', 'her colours made out: her stance');
  const { seed } = await deceiver();
  const q = spawn(s, 'pirateSloop', 600, 0, { temper: 'wary' });
  q.plain = false; q.ship.seed = seed; q.known = KNOW.colours;
  s.run(0.1);
  q.ship.provoked.set('local', Number.MAX_SAFE_INTEGER);   // she would take me for an enemy - her colours still a trader's
  const qm = s.host.compassShips().find((m) => Math.abs(m.x - q.ship.pos[0]) < 1e-6 && Math.abs(m.z - q.ship.pos[2]) < 1e-6)?.kind;
  assert.equal(qm, 'ship', 'false colours: a merchantman\'s mark');
  q.blackFlag = true;
  assert.equal(s.host.compassShips().find((m) => Math.abs(m.x - q.ship.pos[0]) < 1e-6 && Math.abs(m.z - q.ship.pos[2]) < 1e-6)?.kind, 'hostile', 'the black flag up: her stance');
});

test('AUDIT CAPTAIN\'S SEA S5/D5: under false colours she passes for the merchant of her own hull - named off her seed as that trader would be, lined as that class, flying the false crown\'s colours; past the Veil the Isles\' colours and an Isles name (a Bay crown\'s colours there, and "A merchantman of X" anywhere, were the tell) (mutants: the trader\'s class, the name, the line, the Veil\'s flag, the Veil\'s names)', async () => {
  const { seed, flag } = await deceiver();
  const s = await sea({ hull: 2 });
  const e = spawn(s, 'pirateSloop', 150, Math.PI / 2, { temper: 'wary' });
  e.plain = false; e.ship.seed = seed;
  s.run(1);
  const trader = merchantOfHull(e.ship.hull);
  assert.equal(trader.id, 'merchantCoaster', 'the sloop\'s trader');
  const t = tagOf(s, e);
  assert.notEqual(t.name, `A merchantman of ${flag}`);
  assert.equal(t.line, classLine(trader));
  const card = s.host.glass(0.1, { up: true });
  void card;
  // past the Veil
  const v = await sea({ hull: 2, where: { ether: { band: 'shallows', depth: 0.1 } } });
  const x = spawn(v, 'pirateSloop', 150, Math.PI / 2, { temper: 'wary' });
  x.plain = false; x.ship.seed = seed;
  v.run(1);
  const xt = tagOf(v, x);
  assert.equal(xt.name, etherShipNames(trader, seed).name, 'an Isles trader\'s name');
  aimAt(v, x);
  const xc = v.host.glass(0.1, { up: true });
  assert.ok(xc.rows.some(([l, w]) => l === 'Colours' && w === `${ISLES_FLAG}' merchant colors`), JSON.stringify(xc.rows));
  assert.ok(!CROWNS.some((c) => xc.rows.some(([, w]) => w.includes(c.name))), 'no Bay crown past the Veil');
});

test('AUDIT CAPTAIN\'S SEA S6: the glass holds only a ship an eye could find - by night within the night\'s sight of her, never one behind the land, never one half faded out of the sea (a dark sloop 1.5 km off at night was swept up, ranged and timed) (mutants: the night gate, the sight test, the fade gate)', async () => {
  const s = await sea({ hull: 2, where: { night: true } });
  const far = spawn(s, 'pirateSloop', 1500, Math.PI / 2, { temper: 'wary' });
  far.plain = true;
  s.run(0.2);
  assert.equal(hold(s, far, 0.3), null, 'a dark ship past NIGHT_DARK_SIGHT: nothing');
  const near = spawn(s, 'merchantCoaster', NIGHT_DARK_SIGHT - 40, 0);
  s.run(0.2);
  assert.ok(hold(s, near, 0.2), 'within it: held');
  // behind the land - the world's sight test
  const d = await sea({ hull: 2 });
  let blocked = true;
  d.deps.sightBlocked = (id) => blocked && id != null;
  const b = spawn(d, 'merchantCoaster', 500, Math.PI / 2);
  d.run(0.2);
  assert.equal(hold(d, b, 0.3), null, 'behind the land: nothing');
  blocked = false;
  assert.ok(hold(d, b, 0.3), 'in sight: held');
  // half faded out of the sea
  b.retiring = true; b.fade = 0.4;
  assert.equal(hold(d, b, 0.1), null, 'the sea has let her go');
});

test('AUDIT CAPTAIN\'S SEA S7: her guns out ON ME tell her colours - never a fight with another ship far off (a pirate at a merchantman 1.2 km away was made out by it) (mutants: the target gate)', async () => {
  const s = await sea({ hull: 2 });
  const m = spawn(s, 'merchantCoaster', 1200, Math.PI / 2);
  const p = spawn(s, 'pirateSloop', 1230, Math.PI / 2, { temper: 'bold' });
  p.plain = true;
  p.ship.target = m.id; p.ship.mode = 'engage'; p.ship.runOut.set('starboard', 1);
  s.run(0.1);
  p.ship.target = m.id; p.ship.mode = 'engage';
  s.host.glass(0.1, { up: false });
  s.run(0.1);
  assert.equal(p.known, KNOW.hull, 'her fight with another: nothing told');
});

test('AUDIT CAPTAIN\'S SEA S10/S17: the glass\'s window is the world\'s strip - its centre the crosshair\'s over the docked bar, every length a share of the strip\'s shorter side; over the world\'s labels and under the HUD (mutants: the strip unread, the measure, the order)', () => {
  drawSpyglass({ card: null, zoom: 4 }, { rect: null });
  const [root] = byClass(globalThis.document.body, 'dfglass');
  const vars = {};
  root.style.setProperty = (k, v) => { vars[k] = v; };
  drawSpyglass({ card: null, zoom: 4 }, { rect: { x: 0, y: 0, w: 1920, h: 804 } });
  assert.deepEqual(['--g-x', '--g-y', '--g-w', '--g-h', '--g-m'].map((k) => vars[k]), ['0px', '0px', '1920px', '804px', '8.04px'], 'the strip over the docked bar');
  drawSpyglass({ card: null, zoom: 4 }, { rect: null });
  assert.equal(vars['--g-h'], '', 'none: the window\'s');
  drawSpyglass(null);
});

test('AUDIT CAPTAIN\'S SEA S11/S18/S22/S20: an unknown hull\'s glass title never red; never "about 1 hands"; the small ship\'s hull a two-master; her hold as it rides - her waters\' tiers, an emptied prize\'s none (mutants: the tone, each word, the hold\'s tiers, the emptied)', async () => {
  assert.equal(glassCard({ hull: 2, hostile: true, distance: 500, speed: 0 }, KNOW.hull).tone, 'unknown');
  assert.deepEqual([0, 1, 2, 3, 7, 12].map(handsWords), ['no hands', 'a hand', 'a hand or two', 'about 5 hands', 'about 5 hands', 'about 10 hands']);
  assert.equal(hullWord(2), 'two-master');
  assert.deepEqual([cargoWords(0), cargoWords(-1), cargoWords(1), cargoWords(9)], ['riding high - hold empty', 'riding high - hold empty', 'riding high, a light hold', 'riding deep, a rich hold']);
  const s = await sea({ hull: 2 });
  const e = spawn(s, 'merchantCoaster', 400, Math.PI / 2);
  s.run(0.2);
  e.known = KNOW.studied;
  aimAt(s, e);
  const holdRow = () => { aimAt(s, e); return s.host.glass(0.1, { up: true }).rows.find(([l]) => l === 'Hold')[1]; };
  assert.equal(holdRow(), cargoWords(e.ship.cls.cargo), 'her class\'s');
  e.deep = true;
  assert.equal(holdRow(), cargoWords(e.ship.cls.cargo + DEEP_TIER), 'the deep\'s tiers');
  e.prize = { hold: [] };
  assert.equal(holdRow(), 'riding high - hold empty', 'an emptied prize');
});

test('AUDIT CAPTAIN\'S SEA S12: see B5 (the Admiralty survey counts a ship once)', () => {});

test('AUDIT CAPTAIN\'S SEA S14: a key file whose road follow left K (Travel Options\' O) loads with the glass seated on the free K - never on no key; a player\'s own unbinding stands (mutants: the free key\'s seat, the removed gate)', () => {
  const s = createBindings(); resetDefaults(s);
  setBinding(s, 'KeyO', 'FollowPaths');
  // an older build's file: no Spyglass anywhere in it
  const old = JSON.parse(JSON.stringify(serializeKeyBinds(s)));
  for (const d of [old.actionKeyBinds, old.secondaryActionKeyBinds]) for (const [k, v] of Object.entries(d ?? {})) if (v === 'Spyglass') delete d[k];
  if (old.sharedActionKeyBinds) for (const k of Object.keys(old.sharedActionKeyBinds)) old.sharedActionKeyBinds[k] = old.sharedActionKeyBinds[k].filter((x) => x !== 'Spyglass');
  const t = createBindings();
  loadKeyBinds(t, old);
  resetDefaults(t, true);
  assert.equal(getBinding(t, 'FollowPaths'), 'KeyO');
  assert.equal(getBinding(t, 'Spyglass'), 'KeyK', 'the glass on the free K');
  // the player's own unbinding stands
  const u = createBindings(); resetDefaults(u);
  setBinding(u, 'KeyO', 'FollowPaths');
  clearBinding(u, 'Spyglass');
  addRemovedPrimaryAction(u, 'Spyglass');
  resetDefaults(u, true);
  assert.equal(getBinding(u, 'Spyglass'), null, 'unbound by the player: unbound');
  // ...and where its partner still holds K, no share comes back over the player's own unbinding
  const v = createBindings(); resetDefaults(v);
  clearBinding(v, 'Spyglass');
  addRemovedPrimaryAction(v, 'Spyglass');
  resetDefaults(v, true);
  assert.deepEqual([getBinding(v, 'Spyglass'), getBinding(v, 'FollowPaths')], [null, 'KeyK'], 'the road\'s follow alone on K');
});

test('AUDIT CAPTAIN\'S SEA S16: a finger\'s glass has its own Magnify and Lower at its foot, wherever it is up (off the helm no Glass press stood) - each read once, none kept while it is down (mutants: the buttons unshown, the taps kept, the taps forgotten)', () => {
  drawSpyglass({ card: null, zoom: 4 }, { touch: true });
  const [root] = byClass(globalThis.document.body, 'dfglass');
  assert.equal(root.className, 'dfglass touch');
  const [zoom] = byClass(root, 'zoom');
  const [lower] = byClass(root, 'lower');
  assert.deepEqual([zoom.textContent, lower.textContent], ['Magnify', 'Lower']);
  for (const f of zoom.listeners.touchstart) f({ preventDefault() {}, stopPropagation() {} });
  for (const f of lower.listeners.touchstart) f({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(spyglassTaps(), { zoom: true, lower: true });
  assert.deepEqual(spyglassTaps(), { zoom: false, lower: false }, 'read once');
  for (const f of zoom.listeners.touchstart) f({ preventDefault() {}, stopPropagation() {} });
  drawSpyglass(null);
  assert.deepEqual(spyglassTaps(), { zoom: false, lower: false }, 'a press made as it came down is no press');
  drawSpyglass({ card: null, zoom: 4 }, { touch: false });
  assert.equal(root.className, 'dfglass', 'no finger: no buttons');
  drawSpyglass(null);
});

test('AUDIT CAPTAIN\'S SEA S19: the glass holds her by her extent as she lies to the look - her beam bow-on, her length abeam - and never outside its own circle (a ship close aboard was held 20 degrees off the glass) (mutants: the aspect, the field\'s clamp)', async () => {
  assert.equal(glassHolds(0.3, 50, 30, 4), true, 'unclamped: wide');
  assert.equal(glassHolds(0.3, 50, 30, 4, 0.1), false, 'outside its circle: never');
  assert.equal(glassHolds((RETICLE_DEG * Math.PI / 180) / 4 - 1e-6, 5000, 1, 4, 0.5), true, 'the reticle\'s own reach');
  const s = await sea({ hull: 2 });
  const e = spawn(s, 'merchantGalleon', 60, Math.PI / 2);
  s.run(0.2);
  const o = s.view.look.origin;
  e.ship.yaw = Math.atan2(e.ship.pos[0] - o[0], e.ship.pos[2] - o[2]);   // bow-on to me
  const off = (deg) => { const a = Math.atan2(e.ship.pos[0] - o[0], e.ship.pos[2] - o[2]) + deg * Math.PI / 180; s.view.look = { origin: o, dir: [Math.sin(a), 0, Math.cos(a)] }; return s.host.glass(0.1, { up: true, zoom: 8 }); };
  assert.ok(off(0), 'on her');
  assert.equal(off(12), null, 'bow-on, 12 degrees off her: her beam is not there');
  e.ship.yaw += Math.PI / 2;   // abeam
  assert.ok(off(12), 'abeam: her length is');
  assert.equal(s.host.glass(0.1, { up: true, zoom: 8, field: 0.05 }), null, 'past the glass\'s own circle');
  void knowAll;
});

test('AUDIT CAPTAIN\'S SEA S24: an unknown hull\'s hurts are no more read than her colours - GLASS-SPOT (PIN MOVED): she gives no card at all, where her card carried no bars; made out, her bar as her tag\'s (mutants: the HUD\'s)', async () => {
  const s = await sea({ hull: 2 });
  const e = spawn(s, 'merchantCoaster', 300, Math.PI / 2);
  s.run(0.2);
  e.ship.damage.restore({ hull: e.ship.damage.maxHull * 0.6, sail: e.ship.damage.maxSail, crew: e.ship.damage.maxCrew });
  const look = s.view.look;
  s.view.look = { origin: look.origin, dir: [e.ship.pos[0] - look.origin[0], 0, e.ship.pos[2] - look.origin[2]] };
  e.known = KNOW.hull;
  let card = s.host.hudModel().target;
  assert.equal(card, null, 'not made out: no card');
  e.known = KNOW.colours;
  card = s.host.hudModel().target;
  assert.ok(card.hull > 0 && card.hull < 1, `her bar: ${card.hull}`);
  // the HUD: no bars drawn for a card without them
  destroyNavalHud();
  const model = { ship: { name: 'Small Ship', hull: 1, sail: 1, crew: 1 }, armed: false, aiming: false, aim: null, board: null, boarding: null, batteries: [], notoriety: { crown: 'Wayrest', value: 0, level: 0 },
    target: { id: 'x', name: 'Unknown sloop', classLine: 'Sloop', faction: 'unknown', hull: null, sail: null, state: 'afloat', distance: 300, hostile: false, friendly: false, bound: '' } };
  drawNavalHud(model, {});
  const [card0] = byClass(globalThis.document.body, 'dfnaval-card');
  const [bar] = byClass(card0, 'hull');
  assert.equal(bar.style.display, 'none', 'no hull bar');
  drawNavalHud({ ...model, target: { ...model.target, hull: 0.6, sail: 1 } }, {});
  assert.equal(bar.style.display, '', 'made out: her bar');
  destroyNavalHud();
});

// ── G: the Eltheric ground ───────────────────────────────────────────────────────────────────────────────────────────

test('AUDIT CAPTAIN\'S SEA G1/G10: the law answers its sea ETHER_MARGIN round the box - the far ring\'s whole reach from a ship in the box (its radius, its rebuild\'s drift, a normal\'s neighbour, the cliffs\' fade): built at the Veil over a world of land, the ring is all sea (four pixels drew the Bay\'s clamped row 0 as a ridge on the way home) (mutants: the margin)', async () => {
  const E = await import('../../../src/world/ethericSea.js');
  const { buildFarRingGrid, RING_RADIUS, RING_REBUILD_DRIFT } = await import('../../../src/render/farRing.js');
  const { CLIFF_REACH } = await import('../../../src/world/landforms.js');
  const { WoodsFile } = await import('../../../src/formats/woodsFile.js');
  assert.ok(E.ETHER_MARGIN >= RING_RADIUS + RING_REBUILD_DRIFT + 1 + CLIFF_REACH, `${E.ETHER_MARGIN}`);
  const land = Object.create(WoodsFile.prototype);
  land.getHeightMapValue = () => 62; land.getLargeMapData = () => Array.from({ length: 5 }, () => new Uint8Array(5).fill(5));
  const woods = E.etherWoods(land);
  const { CLIMATES } = await import('../../../src/formats/mapsTables.js');
  for (const [bx, by] of [[E.ETHER_BOX.x1 - 1, E.veilhaven().py], [E.ETHER_BOX.x0, E.ETHER_BOX.y0], [E.ETHER_BOX.x1 - 1, E.ETHER_BOX.y1 - 1]]) {
    const g = buildFarRingGrid({ heightBytes: new Uint8Array(1000 * 500).fill(62), mapWidth: 1000, mapHeight: 500, climateAt: () => CLIMATES.Mountain, baseX: bx, baseY: by, relief: true,
      byteAt: (x, y) => woods.getHeightMapValue(x, y), climatePast: (x, y) => E.etherClimateIndex(() => CLIMATES.Mountain)(x, y), pastOwn: E.inEtherLaw });
    let land62 = 0;
    for (let j = 0; j < g.side; j++) for (let i = 0; i < g.side; i++) { const px = bx - RING_RADIUS + i, py = by - RING_RADIUS + j; if (!E.inEther(px, py) && !g.sea[j * g.side + i]) land62++; }
    assert.equal(land62, 0, `no land past the box on the ring at ${bx},${by}`);
  }
});

test('AUDIT CAPTAIN\'S SEA G2/P7: THE SWITCH SPLIT - the sea stands in every game (a save past the Veil loads under the classic skin and sails home), the crossing out the enhanced skin\'s and online\'s, `?ether=off` neither; a pixel the world does not stream lands at the way home (past the Veil) or the Bay\'s edge, said (mutants: each switch, the landing\'s arms, the way home\'s guard)', async () => {
  const { etherSeaOn, etherCrossOutOn } = await import('../../../src/scenes/shared.js');
  const { setPref, _resetForTests } = await import('../../../src/systems/uiPrefs.js');
  _resetForTests();
  setPref('uiSkin', 'classic');
  assert.equal(etherSeaOn('?skin=classic'), true, 'the classic skin: the sea stands');
  assert.equal(etherCrossOutOn('?skin=classic'), false, '...and its captain is never asked out');
  assert.equal(etherSeaOn('?ether=off'), false); assert.equal(etherCrossOutOn('?ether=off&online=1'), false);
  _resetForTests();
  const { crossingTarget } = await import('../../../src/systems/naval/etherCrossing.js');
  const { HOME_WATERS } = await import('../../../src/world/ethericSea.js');
  assert.deepEqual(crossingTarget('home', { px: 8000, py: -5000 }), { px: HOME_WATERS.px, py: HOME_WATERS.py }, 'never a way out in the sea itself');
  assert.deepEqual(crossingTarget('home', { px: 150, py: 300 }), { px: 150, py: 300 });
});

test('AUDIT CAPTAIN\'S SEA G3: the landforms\' lands past the Bay\'s table answer the Eltheric Ocean\'s own climates - an isle\'s hills never move with the Bay\'s corner pixel (999, 0), and wear its own climate\'s land (mutants: the law\'s arm, the node\'s climate)', async () => {
  const { hillsAt, landformClimates } = await import('../../../src/world/landforms.js');
  const { veilhaven, isleOfCell } = await import('../../../src/world/ethericSea.js');
  const { CLIMATES } = await import('../../../src/formats/mapsTables.js');
  const { HEIGHTMAP_DIMENSION } = await import('../../../src/world/terrain/terrainSampler.js');
  const a = landformClimates(() => CLIMATES.Mountain), b = landformClimates(() => CLIMATES.Mountain);
  b[999] = CLIMATES.Desert;   // the Bay's corner pixel, (999, 0)
  let wild = null; for (let cx = 700; cx < 800 && !wild; cx++) for (let cy = 240; cy < 260 && !wild; cy++) { const i = isleOfCell(cx, cy); if (i?.kind === 'wild' && i.peak >= 30) wild = i; }
  const span = HEIGHTMAP_DIMENSION - 1, swamp = landformClimates(() => CLIMATES.Swamp);
  // a land well over the knee (LANDFORM_KNEE 41.5 kernel units): under it every land's hills are none, and any two tables agree
  const MACRO = 100, LOW = 60;
  for (const isle of [veilhaven(), wild]) {
    let moved = 0, differs = 0, own = 0;
    for (let k = 0; k < 40; k++) {
      const gx = (isle.px + 0.5 + (k % 7) / 10) * span, gy = (500 + 0.5 - isle.py - Math.floor(k / 7) / 10) * span;
      const h = hillsAt(gx, gy, MACRO, LOW, null, a);
      if (h !== hillsAt(gx, gy, MACRO, LOW, null, b)) moved++;
      if (h !== hillsAt(gx, gy, MACRO, LOW, null, swamp)) differs++;
      if (h !== hillsAt(gx, gy, MACRO, LOW, null, null)) own++;
    }
    assert.equal(moved, 0, `${isle.name}: the Bay's corner moves nothing`);
    assert.equal(differs, 0, `${isle.name}: nor the Bay's whole table`);
    assert.equal(own, 40, `${isle.name}: the isle's own climate's land (${isle.climate}) - never the woodlands of no table`);
  }
  assert.ok(hillsAt((veilhaven().px + 0.5) * span, (500 + 0.5 - veilhaven().py) * span, MACRO, LOW, null, a) !== 0, 'hills to compare');
});

// ── H1, P: the isles' places in the world ───────────────────────────────────────────────────────────────────────────

test('AUDIT CAPTAIN\'S SEA P1 (the game\'s rows): Veilhaven\'s havens are the game\'s hamlets of six to twelve blocks - never none (MAPS.BSA\'s villages are 2 or 4 blocks, its cities 30 and more) (mutants: the types, the range)', { skip: !process.env.ARENA2_PATH && 'ARENA2_PATH not set' }, async () => {
  const { join } = await import('node:path');
  const { MapsFile } = await import('../../../src/formats/mapsFile.js');
  const { etherTemplates, TOWN_BLOCKS } = await import('../../../src/world/etherPlaces.js');
  const { LOCATION_TYPES } = await import('../../../src/formats/mapsFile.js');
  const bytes = (f) => new Uint8Array(readFileSync(join(process.env.ARENA2_PATH, f)));
  const maps = new MapsFile();
  maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK'));
  const rows = [];
  for (let r = 0; r < maps.regionCount; r++) { const region = maps.getRegion(r); if (!region) continue; for (let l = 0; l < maps.baseLocationCount(r); l++) { const loc = maps.getLocation(r, l); if (loc?.exterior?.exteriorData) rows.push(loc); } }
  const t = etherTemplates(rows);
  assert.ok(t.havens.length > 100, `${t.havens.length} havens`);
  for (const l of t.havens) {
    const n = l.exterior.exteriorData.width * l.exterior.exteriorData.height;
    assert.ok(n >= 6 && n <= 12 && l.mapTableData.locationType === LOCATION_TYPES.TownHamlet, `${l.name}: a hamlet of ${n}`);
    assert.ok(Math.max(l.exterior.exteriorData.width, l.exterior.exteriorData.height) <= 4 && Math.min(l.exterior.exteriorData.width, l.exterior.exteriorData.height) <= 3, `${l.name}: within the 4x3 an isle was measured dry for (H1)`);
  }
});

test('AUDIT CAPTAIN\'S SEA P3/P12: an isle\'s place is never a spawn\'s template - a session that stood ruins past the Veil first cloned other templates than its party on every Bay pixel; its exterior names the isle\'s place in every id it carries - its record\'s header too (mutants: the filter, the exterior\'s ids)', async () => {
  const { spawnTemplates } = await import('../../../src/world/spawnedDungeons.js');
  const row = (id, o = {}) => ({ hasDungeon: true, dungeon: { blocks: [{}] }, exterior: { exteriorData: { width: 1, height: 1 } }, mapTableData: { mapId: id }, ...o });
  assert.deepEqual(spawnTemplates([row(1), row(2, { ether: '3,4' }), row(3)]).map((l) => l.mapTableData.mapId), [1, 3]);
  // P12: the exterior's every id the isle's place's (its template's named the Bay's town it was cloned from)
  const { synthesizeEtherLocation, etherPlaceId } = await import('../../../src/world/etherPlaces.js');
  const { veilhaven } = await import('../../../src/world/ethericSea.js');
  const tpl = { name: 'T', mapTableData: { mapId: 5 }, exterior: { exteriorData: { width: 2, height: 2, locationId: 5, mapId: 5 }, recordElement: { header: { locationId: 5, x: 1 } } } };
  const loc = synthesizeEtherLocation(tpl, veilhaven()), id = etherPlaceId(veilhaven());
  assert.deepEqual([loc.exterior.exteriorData.locationId, loc.exterior.exteriorData.mapId, loc.exterior.recordElement.header.locationId, loc.exterior.recordElement.header.x], [id, id, id, 1]);
  assert.deepEqual([tpl.exterior.exteriorData.locationId, tpl.exterior.recordElement.header.locationId], [5, 5], 'its template\'s untouched');
});

// ── X: the crossing and the chart ───────────────────────────────────────────────────────────────────────────────────

// ── C: the crew ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('AUDIT CAPTAIN\'S SEA C1: a companion back aboard while I sail works his post - her posts\' worth reads the one ashore set her deck, her card and her answering hand read (the party\'s raw roll left his post worth nothing at sea while he stood it on her deck); ashore with me, it is not worked (mutants: the one set, its sailing gate)', async () => {
  const s = await sea({ hull: 2 });
  s.boat.crewed = true;
  s.run(0.3);
  const st = s.host._myState(s.boat);
  const bosun = st.crew.hands.find((h) => h.role === 'Bosun');
  assert.ok(bosun, 'her Bosun');
  bosun.fights = 40;   // an Old Salt
  assert.ok(s.host.companions.take(42, bosun, 0), 'taken ashore');
  s.run(0.2);
  assert.ok(s.host.postsWay(s.boat) > 1.03, `at the helm he is aboard - her canvas his (${s.host.postsWay(s.boat)})`);
  assert.equal(s.host.awayOf(s.boat).size, 0, 'and none ashore on her Fleet page and card');
  s.runtime.sailing = false;
  s.run(0.2);
  assert.equal(s.host.postsWay(s.boat), 1, 'off her helm, ashore with me: no Bosun aboard');
  assert.ok(s.host.awayOf(s.boat).has(st.crew.hands.indexOf(bosun)), 'and said ashore');
});

test('AUDIT CAPTAIN\'S SEA C2: the Fleet page says a hand ashore with me so, and names the post\'s holder among those aboard - never the companion at my side with his post\'s worth (mutants: the ashore flag, the page\'s ashore set)', async () => {
  const { createFleetHost } = await import('../../../src/scenes/fleetHost.js');
  const { titleDeed, _resetFleetForTests } = await import('../../../src/systems/fleet.js');
  const { mintDeed } = await import('../../../src/systems/comeSailAway/comeSailAwayItems.js');
  const { scene, terrain } = await import('../../csaScene.mjs');
  const { drawFleetPage, resetFleetPage } = await import('../../../src/ui/fleetPage.js');
  const { setHoldingsProvider, _setHoldingsIconForTests } = await import('../../../src/ui/holdingsPages.js');
  _resetFleetForTests();
  const s = scene({ terrains: [terrain(10, 20)] });
  s.deps.items = { create: () => null, addToPlayer: () => {}, player: () => [], titles: () => [] };
  const hands = [
    { name: 'Ann Mate', role: 'First Mate', mobile: 144, fights: 0, boardings: 0 },
    { name: 'Old Gil', role: 'Gunner', mobile: 144, fights: 40, boardings: 0 },
    { name: 'Young Tam', role: 'Gunner', mobile: 144, fights: 0, boardings: 0 },
  ];
  const naval = {
    fleetStatus: () => ({ hull: 1, maxHull: 1, sail: 1, maxSail: 1, crew: 60, maxCrew: 60, wants: false, fire: false, stores: 0, inFight: false }),
    hostileNear: () => false, freeBerth: () => null, boatInPlay: () => null, crewHands: () => hands.map((h) => ({ ...h })), awayOf: () => new Set([1]),
  };
  const host = createFleetHost({ csa: () => s.rt, naval: () => naval, pack: () => [], where: () => ({ inside: false, pixel: { X: 10, Y: 20 }, feet: [0, 0, 0] }), nearPort: () => true });
  titleDeed(mintDeed(2, 0, 5, 1));
  assert.deepEqual(host.model().ships[0].hands.map((h) => h.ashore), [false, true, false]);
  _setHoldingsIconForTests(() => ({ src: 'data:x', w: 30, h: 30 }));
  const fake = (tag) => {
    const classes = new Set();
    const n = { tag, children: [], attrs: {}, value: '', title: '', selected: false, isConnected: true,
      classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c) },
      set className(v) { classes.clear(); String(v ?? '').split(/\s+/).filter(Boolean).forEach((x) => classes.add(x)); }, get className() { return [...classes].join(' '); },
      _t: '', get textContent() { return n._t + n.children.map((c) => c.textContent).join(''); }, set textContent(v) { n._t = String(v ?? ''); },
      append(...cs) { n.children.push(...cs); }, setAttribute(k, v) { n.attrs[k] = v; } };
    return n;
  };
  const el = (t, c, x) => { const n = fake(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
  const all = (root, pred) => { const out = []; const walk = (x) => { for (const c of x.children ?? []) { if (pred(c)) out.push(c); walk(c); } }; walk(root); return out; };
  setHoldingsProvider({ fleet: { model: () => host.model(), offer: (u) => host.offer(u), act: (u, v, a) => host.act(u, v, a) } });
  resetFleetPage();
  const draw = () => { const d = el('div'); drawFleetPage(d, () => {}, { el, divider: (t) => el('h4', null, t), meter: () => el('div') }); return d; };
  all(draw(), (c) => c.tag === 'button' && c.textContent === 'Crew')[0].onclick();
  const lines = all(draw(), (c) => c.className === 'hld-sub').map((c) => c.textContent);
  assert.ok(lines.includes('Old Salt - 40 fights won - ashore with you'), `ashore, said so, his post's worth unsaid: ${lines.join(' | ')}`);
  assert.ok(lines.some((l) => /^Green - the guns reload/.test(l)), 'the Green gunner aboard holds the guns');
  setHoldingsProvider(null);
});

test('AUDIT CAPTAIN\'S SEA C7: a hand who joins takes the post held by the fewest - a fallen or reassigned hand\'s post filled first, never a third Bosun while her Cook\'s stands empty; a whole roster dealt as it always was (mutants: the count, the order)', async () => {
  const { createShipCrew, FIRST_MATE } = await import('../../../src/systems/naval/shipCrew.js');
  const roster = (n) => Array.from({ length: n }, () => ({ mobile: 144, gender: 'male' }));
  const c = createShipCrew({ seed: 3 });
  c.sync(roster(14));
  assert.deepEqual(c.hands.map((h) => h.role), [FIRST_MATE, 'Bosun', 'Gunner', 'Carpenter', 'Lookout', 'Cook', 'Deckhand', 'Bosun', 'Gunner', 'Carpenter', 'Lookout', 'Cook', 'Deckhand', 'Bosun']);
  c.hands[5].role = 'Gunner';   // her Cook given the guns on the Fleet page
  c.hands[11].role = 'Gunner';
  c.sync(roster(13));
  const { joined } = c.sync(roster(14));
  assert.equal(joined[0].role, 'Cook', 'her galley\'s empty post');
});

test('AUDIT CAPTAIN\'S SEA C10: a wear that is no number reads none - the sea\'s clock on her spirits never poisoned (NaN stopped it for good) (mutants: the guard)', async () => {
  const { createShipCrew, SEA_DECAY_S, MORALE_START } = await import('../../../src/systems/naval/shipCrew.js');
  const c = createShipCrew({ seed: 4 });
  c.tick(SEA_DECAY_S + 1, { atSea: true, wear: NaN });
  assert.equal(c.morale, MORALE_START - 1);
  c.tick(SEA_DECAY_S, { atSea: true, wear: 2 });
  assert.equal(c.morale, MORALE_START - 1, 'twice the wear: half the clock');
});

// ── D: the Eltheric Ocean's traffic and its strands ─────────────────────────────────────────────────────────────────────

const REACHES = { band: 'reaches', bandName: 'the Reaches', depth: 20, legend: null };
/** A boat of mine at a wild isle's strand past the Veil: the world's sites and gather stood in for. */
async function strandSea(o = {}) {
  const s = await sea({ hull: 2, where: { ether: REACHES }, ...o });
  const site = { id: 'strand:300,200', kind: 'strand', px: 100, py: 101, seed: 99, n: 3 };
  const w = { sites: [site] };
  s.deps.captain = { event() {}, sites: () => w.sites };
  s.deps.ether = { gather: () => ({ items: [{ name: 'starglass' }], text: '3 shards of starglass from the strand of X.' }) };
  const casks = () => s.host._shots.floaters().filter((f) => f.lot === `site:${site.id}`);
  return { s, w, site, casks };
}

test('AUDIT CAPTAIN\'S SEA D1: a strand\'s casks float once - out of its reach and back while they float, none floats again (each return floated three more till the first was hauled: the Eltheric goods without end) (mutants: the floating check\'s stood gate)', async () => {
  const { s, w, site, casks } = await strandSea();
  s.run(1.2);
  assert.equal(casks().length, 3);
  w.sites = []; s.run(1.2);   // sailed out of its reach: the world's list leaves it
  w.sites = [site]; s.run(1.2);
  w.sites = []; s.run(1.2);
  w.sites = [site]; s.run(1.2);
  assert.equal(casks().length, 3, 'the same three afloat');
  assert.equal(s.log.say.filter((t) => /Your boat goes ashore and comes back with its haul/.test(t)).length, 1, 'said once');
  // bare from its FIRST cask hauled - one hauled days after never pushes the strand's day on
  const { createEtherHost, STRAND_SITE } = await import('../../../src/scenes/etherHost.js');
  const { createCaptainLedger } = await import('../../../src/systems/naval/captainLedger.js');
  const ES = await import('../../../src/world/ethericSea.js');
  let day = 10, wild = null;
  for (let cx = 700; cx < 800 && !wild; cx++) for (let cy = 200; cy < 300 && !wild; cy++) { const i = ES.isleOfCell(cx, cy); if (i?.kind === 'wild' && i.good) wild = i; }
  const L = createCaptainLedger();
  const host = createEtherHost({ ledger: L, day: () => day });
  assert.ok(host.gather(`${STRAND_SITE}${wild.key}`).items.length);
  day = 12;
  assert.ok(host.gather(`${STRAND_SITE}${wild.key}`).items.length, 'a cask still afloat hauled later');
  assert.equal(L.gatheredDay(wild.key), 10, 'bare from the first');
});

test('AUDIT CAPTAIN\'S SEA D2: a strand\'s haul floats alongside the boat that pulled in for it - STRAND_ALONGSIDE_M off her on open water, every cask on water (they went 700 m off on no bearing of the isle\'s, some on its beach); a swimmer breaks his open in the water, never "hauls it aboard" (mutants: the alongside point, the open water, the cask on the beach, the swimmer\'s words)', async () => {
  const { STRAND_ALONGSIDE_M, SITE_CASK_SPREAD } = await import('../../../src/scenes/naval/navalHost.js');
  const land = (x) => x > 20;   // the isle's beach to the east of her
  const { s, casks } = await strandSea({ water: (x) => !land(x) });
  s.run(1.2);
  assert.equal(casks().length, 3);
  for (const c of casks()) {
    assert.ok(!land(c.pos[0]), `on open water (${c.pos.map((v) => v.toFixed(1))})`);
    assert.ok(Math.hypot(c.pos[0], c.pos[2]) <= STRAND_ALONGSIDE_M + 6 + SITE_CASK_SPREAD, 'alongside');
  }
  // the swimmer's
  s.runtime.sailing = false;
  s.deps.swimming = () => true;
  const c = casks()[0];
  s.view.feet = [c.pos[0], 0, c.pos[2]];
  s.run(0.3);
  assert.ok(s.log.say.includes('You break open a cask in the water: 3 shards of starglass from the strand of X.'), s.log.say.join(' | '));
  assert.ok(s.log.given.some(([n, b]) => n === 1 && b === null), 'into his pack');
});

test('AUDIT CAPTAIN\'S SEA D3: an Eltheric prize\'s papers answer to no crown - burned, they wash no notoriety of mine in the Bay (the nearest Bay capital\'s waters were read for a ship of the Eltheric Ocean) (mutants: the Veil\'s gate)', async () => {
  const { GRAPPLE_S } = await import('../../../src/systems/naval/navalBoarding.js');
  const s = await sea({ hull: 2, where: { ether: REACHES } });
  const id = s.host.spawnShip('merchantGalleon', { range: 26.8, bearing: Math.PI / 2, yaw: 0 });
  const e = s.host._sea.get(id);
  e.ship.pos = [26.8, 0, 0];
  s.host.frame(0.1);
  assert.equal(e.ether, 'reaches', 'a ship of the Eltheric Ocean');
  s.host.notoriety.add('Wayrest', 40);
  s.host.notoriety.add('Sentinel', 40);
  s.host.notoriety.add('Daggerfall', 40);
  e.ship.damage.apply({ hull: Math.ceil(e.ship.damage.maxHull * 0.8), sail: 0, crew: 0 });
  s.host.frame(0.1);
  assert.equal(s.host.activate(), true, 'the grapples');
  s.run(GRAPPLE_S + 0.3);
  for (const f of s.log.foes.filter((x) => x.side === 'enemy')) f.dead = true;
  s.run(0.2);
  const m = s.log.plunder.at(-1);
  assert.ok(m, 'her window');
  const offer = m.offers().find((o) => o.id === 'papers');
  assert.deepEqual([offer.useful, offer.detail], [false, 'No one hunts you in these waters']);
  assert.equal(m.choose('papers'), true);
  assert.deepEqual(['Wayrest', 'Sentinel', 'Daggerfall'].map((c) => s.host.notoriety.get(c)), [40, 40, 40], 'the Bay\'s notoriety as it was');
  assert.ok(s.log.say.includes('You burn the ship\'s papers. No crown\'s law reaches past the Veil.'));
});

test('AUDIT CAPTAIN\'S SEA D4: a freeport\'s quay past the Veil moors the isles\' traders - never a Bay crown\'s navy; the same day\'s roll in the Bay stands its cutters (mutants: the Veil\'s gate)', async () => {
  const coast = (x, z) => !(z > 200 || (x > 300 && x < 400 && z > -300));
  const PORT = { key: 'port:2', name: 'Wayrest', rect: { minX: -100, maxX: 100, minZ: 220, maxZ: 420 } };
  const roll = async (day, ether) => {
    const h = await sea({ hull: null, water: coast, settings: { ShipsAtSea: 'few' }, where: { day, ...(ether ? { ether: REACHES } : {}) } });
    h.view.feet = [0, 0, 300]; h.deps.harbourNear = () => PORT; h.run(1);
    return [...h.host._sea.values()].filter((e) => e.ship.errand?.kind === 'moored').map((e) => [e.ship.seed, e.ship.cls.faction]);
  };
  let day = 1, bay = await roll(day, false);
  while (!bay.some(([, f]) => f === 'navy') && day < 40) bay = await roll(++day, false);
  assert.ok(bay.some(([, f]) => f === 'navy'), 'a day the Bay\'s roll moors a cutter');
  const past = await roll(day, true);
  assert.deepEqual(past.map(([sd]) => sd), bay.map(([sd]) => sd), 'the same ships by seed');
  assert.ok(past.every(([, f]) => f === 'merchant'), `traders all: ${past.map(([, f]) => f)}`);
});

test('AUDIT CAPTAIN\'S SEA D6: a legend\'s purse is paid only while she sails by this captain\'s own ledger - another\'s copy of her, sunk with a ball of mine in her, pays nothing more and never pushes her rise back (mutants: the ledger\'s gate)', async () => {
  const { createEtherHost } = await import('../../../src/scenes/etherHost.js');
  const { createCaptainLedger } = await import('../../../src/systems/naval/captainLedger.js');
  const { legendById, LEGEND_RISE_DAYS } = await import('../../../src/systems/naval/etherShips.js');
  const L = createCaptainLedger();
  L.endLegend('starless', 100);
  let day = 105, paid = 0;
  const said = [];
  const host = createEtherHost({ ledger: L, day: () => day, credit: (n) => { paid += n; }, mid: (t) => said.push(t) });
  assert.equal(host.legendEnded('starless', 'sink'), 0);
  assert.deepEqual([paid, L.legendDay('starless'), said.length], [0, 100, 0], 'no purse, her end as it was, nothing said');
  day = 100 + LEGEND_RISE_DAYS;
  assert.equal(host.legendEnded('starless', 'sink'), legendById('starless').purse, 'risen again: her purse');
  assert.deepEqual([paid, L.legendDay('starless')], [legendById('starless').purse, day]);
});

test('AUDIT CAPTAIN\'S SEA D11: the Pale Regent\'s guns load LEGEND_RELOAD_K the quicker - a `gunnery` legend\'s alone (the constant had no reader) (mutants: the reload)', async () => {
  const { createSeaShip } = await import('../../../src/systems/naval/navalAI.js');
  const { LEGEND_RELOAD_K } = await import('../../../src/systems/naval/etherShips.js');
  const reload = (classId) => { const sh = createSeaShip({ id: 'x', seed: 1, classId, variant: 0, pos: [0, 0, 0], yaw: 0, names: {} }); sh.guns.fired('starboard'); return sh.guns.left('starboard'); };
  assert.equal(LEGEND_RELOAD_K, 0.7);
  assert.ok(reload('legendQueen') > 0);
  assert.ok(Math.abs(reload('legendRegent') - reload('legendQueen') * LEGEND_RELOAD_K) < 1e-9, 'her carrack\'s reload, the quicker');
});

test('AUDIT CAPTAIN\'S SEA D10: the Ninefold Hunger boards, and boards again - her first wave thrown back, half her hands come over the rail again; the second thrown back, she is beaten as any pirate (her terror was clamped like any flagship\'s) (mutants: the second wave, its once)', async () => {
  const { GRAPPLE_S } = await import('../../../src/systems/naval/navalBoarding.js');
  const WRECKED = { v: 1, boats: { 42: { hull: 0, sail: 0, crew: 24, fire: 0, state: 'wrecked', barrels: 4 } }, notoriety: {}, day: 1, raids: [] };
  const s = await sea({ hull: 2, save: WRECKED, where: { ether: REACHES } });
  const id = s.host.spawnShip('legendHunger', { range: 20, bearing: Math.PI / 2, yaw: 0 });
  const e = s.host._sea.get(id);
  e.ship.pos = [20, 0, 0];
  const throwBack = () => {
    for (let t = 0; t < 30 && s.host.boarding?.kind !== 'repel'; t += 0.5) s.run(0.5);
    assert.equal(s.host.boarding?.kind, 'repel', 'she boards');
    s.run(GRAPPLE_S + 0.2);
    for (const f of s.log.foes.filter((x) => x.side === 'enemy')) f.dead = true;
    s.run(0.2);
  };
  const crew = e.ship.damage.crew;
  throwBack();
  assert.ok(s.log.mid.includes('The boarders are thrown back, but Ninefold Hunger sends more over the rail!'), s.log.mid.join(' | '));
  assert.ok(Math.abs(e.ship.damage.crew - crew / 2) < 1e-6, 'half her hands');
  assert.equal(e.ship.damage.state, 'afloat');
  assert.equal(s.host.boarding?.kind, 'repel', 'the second wave at once, from where she lies');
  throwBack();
  assert.ok(s.log.mid.includes('The boarders are thrown back!'), 'the second wave beaten');
  assert.equal(e.ship.damage.crew, 0, 'her hands gone over my rail');
});

test('AUDIT CAPTAIN\'S SEA D12: every captain whose sea a legend comes into hears her come - a party\'s other captain too, who stands another\'s copy of her - and once while she is in it (mutants: the stander\'s gate, the once)', async () => {
  const { navalWireRecord } = await import('../../../src/systems/naval/navalWire.js');
  const s = await sea({ hull: 2, where: { ether: REACHES } });
  const word = navalWireRecord({ ships: [{ n: 1, classId: 'legendQueen', variant: 0, pos: [0, 0, 900], yaw: 0, speed: 3, sails: 1, hull: 1, sail: 1, crew: 1, state: 'afloat', heel: 0, seed: 5, fire: false, gen: 0, region: 19 }] });
  s.host.applyWord('a', word);
  s.host.applyWord('a', word);
  const heard = () => s.log.mid.filter((t) => t.startsWith('The sea goes still. A sail on the horizon: The Drowned Queen.')).length;
  assert.equal(heard(), 1, 'the other captain hears her, once');
  s.host.spawnShip('legendWake', { range: 900 });
  assert.equal(s.log.mid.filter((t) => t.includes("Sorrow's Wake")).length, 1, 'my own said as ever');
  // her come said once while she is in my sea: another's copy of the one I stand, met (D7's claim), is not said again
  const z = await sea({ hull: 2, where: { ether: REACHES } });
  z.host.spawnShip('legendRegent', { range: 900 });
  z.host.applyWord('a', navalWireRecord({ ships: [{ n: 1, classId: 'legendRegent', variant: 0, pos: [0, 0, 950], yaw: 0, speed: 3, sails: 1, hull: 1, sail: 1, crew: 1, state: 'afloat', heel: 0, seed: 6, fire: false, gen: 0, region: 19 }] }));
  assert.ok(z.host._sea.has('a:1'), 'a\'s copy stood');
  assert.equal(z.log.mid.filter((t) => t.startsWith('The sea goes still. A sail on the horizon: The Pale Regent.')).length, 1, 'once');
});

test('AUDIT CAPTAIN\'S SEA D13: a veiled legend is hailed at the veil\'s share of the lookout\'s reach, as every other reach takes her - the Starless at 800 m unhailed, the Regent there hailed (mutants: the veil on the hail)', async () => {
  const { SAIL_HO_RANGE } = await import('../../../src/scenes/naval/navalHost.js');
  const { LEGEND_VEIL_K } = await import('../../../src/systems/naval/etherShips.js');
  const hails = async (classId) => {
    const s = await sea({ hull: 2, where: { ether: REACHES } });
    s.host.spawnShip(classId, { range: 800, bearing: Math.PI / 2 });
    s.run(3);
    return s.log.say.filter((t) => t.startsWith('Sail ho!')).length;
  };
  assert.ok(800 < SAIL_HO_RANGE && 800 > SAIL_HO_RANGE * LEGEND_VEIL_K);
  assert.equal(await hails('legendRegent'), 1, 'the Regent hailed at 800 m');
  assert.equal(await hails('legendStarless'), 0, 'the Starless not - she is veiled');
});

test('AUDIT CAPTAIN\'S SEA D15: a legend\'s hold is the richest at sea - her last LEGEND_STRONGBOXES lots her captain\'s strongboxes (a flagship\'s one beat her hold of plunder); a flagship\'s and a trader\'s as they were (mutants: the count, the tier)', async () => {
  const { holdKeys, drawHold, LEGEND_STRONGBOXES, STRONGBOX_RARITY_TIER, HOLD_RARITY_TIER } = await import('../../../src/systems/naval/navalPlunder.js');
  const tiersOf = (id) => { const got = []; drawHold(classById(id), 7, (k, t) => { got.push(`${k}@${t}`); return []; }); return got; };
  assert.equal(LEGEND_STRONGBOXES, 2);
  assert.deepEqual(holdKeys(classById('legendStarless'), 7).slice(-2), ['J', 'J']);
  assert.deepEqual(tiersOf('legendStarless').slice(-2), [`J@${STRONGBOX_RARITY_TIER}`, `J@${STRONGBOX_RARITY_TIER}`]);
  assert.deepEqual(tiersOf('pirateFlagship'), ['Q@6', 'Q@6', 'E@6', `J@${STRONGBOX_RARITY_TIER}`], 'a flagship\'s one, as it was');
  assert.ok(tiersOf('merchantCarrack').every((t) => t.endsWith(`@${HOLD_RARITY_TIER.merchant}`)), 'a trader\'s J her cargo, never a strongbox');
});

test('AUDIT CAPTAIN\'S SEA D17: the Lantern-Eater is abroad between dusk and dawn alone - day come, she sails out of the world once no fight holds her (she fought on in the sun, and stayed after it) (mutants: the dawn, the fight\'s hold)', async () => {
  const lantern = async (range) => {
    const w = { night: true };
    const s = await sea({ hull: 2, where: { ether: REACHES } });
    const where = s.deps.where;
    s.deps.where = () => ({ ...where(), night: w.night });
    const e = s.host._sea.get(s.host.spawnShip('legendLantern', { range }));
    return { s, w, e };
  };
  const far = await lantern(900);
  far.s.run(1);
  assert.deepEqual([far.e.ship.mode, far.e.retiring], ['cruise', false], 'by night she sails');
  far.w.night = false;
  far.s.host.frame(0.05);
  assert.equal(far.e.retiring, true, 'day come, no fight: she sails out of the world');
  const close = await lantern(200);
  for (let t = 0; t < 20 && close.e.ship.mode !== 'engage'; t += 0.5) close.s.run(0.5);
  assert.equal(close.e.ship.mode, 'engage');
  close.w.night = false;
  close.s.host.frame(0.05);
  assert.equal(close.e.retiring, false, 'a fight holds her');
  // a legend of the day keeps the sea by day
  const s = await sea({ hull: 2, where: { ether: REACHES } });
  const q = s.host._sea.get(s.host.spawnShip('legendQueen', { range: 900 }));
  s.run(1);
  assert.equal(q.retiring, false, 'the Drowned Queen sails by day');
});

test('AUDIT CAPTAIN\'S SEA D19/D20: in the Veil itself the plate says "The Veil" (never "The Shallows, 0 leagues past the Veil"); the Isles\' ship names two words of each trade\'s own, 256 a trade - a harbour\'s ships seldom share one (mutants: the Veil\'s word, the lists)', async () => {
  const { etherWatersWords } = await import('../../../src/ui/naval/navalHud.js');
  const { ETHER_PIRATE_NAMES, ETHER_MERCHANT_NAMES } = await import('../../../src/systems/naval/etherShips.js');
  assert.equal(etherWatersWords({ bandName: 'the Shallows', depth: 0, veil: true }), 'The Veil');
  assert.equal(etherWatersWords({ bandName: 'the Reaches', depth: 23 }), 'The Reaches, 23 leagues past the Veil');
  for (const list of [ETHER_PIRATE_NAMES, ETHER_MERCHANT_NAMES]) {
    assert.equal(list.length, 256);
    assert.equal(new Set(list).size, 256, 'every one its own');
    assert.ok(list.every((n) => /^\S+ \S+$/.test(n)));
  }
  let shared = 0;
  for (let h = 0; h < 200; h++) { const names = [0, 1, 2, 3].map((i) => etherShipNames(classById('merchantGalleon'), (h * 7919 + i * 104729) >>> 0).name); if (new Set(names).size < names.length) shared++; }
  assert.ok(shared <= 10, `a harbour of four sharing a name: ${shared} in 200`);
});

// ── L/B: the ledger, the board, the exchange and the charts ─────────────────────────────────────────────────────────

test('AUDIT CAPTAIN\'S SEA L1: a pirate whose boarders were thrown back is ended then - taken or sunk after, her end is logged and never paid again (the law\'s reward and the crown\'s regard came twice) (mutants: the repel\'s mark, the law\'s skip, the deed\'s crown)', async () => {
  const s = await sea({ hull: 2 });
  const legal = [], deeds = [];
  s.deps.law = { crime() {}, legal: (r, n) => legal.push([r, n]), faction() {} };
  s.deps.captain = { deed: (act, cls, o) => deeds.push([act, o?.crown ?? null]), event() {}, chartFor: () => null, marque: () => null };
  const id = s.host.spawnShip('pirateBrig', { range: 600 });
  s.host._charge('repel', id);
  assert.equal(legal.length, 1, 'the repel paid');
  assert.ok(deeds[0][1], 'her crown\'s regard');
  s.host._charge('board', id);
  assert.equal(legal.length, 1, 'taken after: no second reward');
  assert.deepEqual(deeds[1], ['board', null], 'logged, no crown\'s regard');
  const other = s.host.spawnShip('pirateBrig', { range: 700 });
  s.host._charge('sink', other);
  assert.equal(legal.length, 2, 'a pirate never thrown back paid as ever');
});

test('AUDIT CAPTAIN\'S SEA L2/B1/L8/L11: the day\'s dealing kept for every exchange dealt with (one deal at the next port over filled the first\'s stock again), another day\'s let go, an older save\'s one port read; a hostile record\'s twins, absurd counts and prototype names cleaned; the log one ship "1 pirate" (mutants: the per-port map, the day, the twins, the bounds, the own-name check, the singular)', async () => {
  const { createCaptainLedger, DEALT_PORTS_MAX, SAILED_MAX_M, MARQUE_UNTIL_MAX, logLines, newLog } = await import('../../../src/systems/naval/captainLedger.js');
  const L = createCaptainLedger();
  L.deal('wayrest', 5, 'wine', 30, 'bought');
  L.deal('near', 5, 'wine', 1, 'bought');
  assert.deepEqual(L.dealtAt('wayrest', 5).bought, { wine: 30 }, 'the first port\'s kept');
  assert.deepEqual(L.dealtAt('wayrest', 6).bought, {}, 'another day');
  L.deal('near', 6, 'wine', 2, 'bought');
  assert.deepEqual([L.dealtAt('near', 6).bought, L.dealtAt('wayrest', 5).bought], [{ wine: 2 }, {}], 'a new day\'s dealing its own, the day before let go');
  L.deal('wayrest', 5, 'wine', 30, 'bought');
  for (let i = 0; i < DEALT_PORTS_MAX + 5; i++) L.deal(`p${i}`, 5, 'wine', 1, 'sold');
  assert.equal(Object.keys(L.getSaveData().dealt.at).length, DEALT_PORTS_MAX, 'bounded');
  const M = createCaptainLedger();
  M.restoreSaveData({ dealt: { port: 'old', day: 3, sold: { iron: 4 } } });
  assert.deepEqual(M.dealtAt('old', 3).sold, { iron: 4 }, 'an older save\'s one port');
  // the hostile record
  const c = { id: 'dup', kind: 'hunt', crown: 'Wayrest', until: 9, pay: 300, days: 3, need: 2, standing: 2 };
  M.restoreSaveData({ contracts: [c, c, { ...c, id: 'neg', pay: -9999 }, { ...c, id: 'noneed', need: undefined }], charts: [{ id: 'k', seed: 1, px: 1, py: 1 }, { id: 'k', seed: 1, px: 1, py: 1 }], log: { sailed: 2e296 }, marque: { crown: 'Wayrest', until: 1e300 } });
  assert.deepEqual(M.contracts().map((x) => [x.id, x.pay]), [['dup', 300], ['neg', 0]], 'once each, no negative purse, no needless hunt');
  assert.equal(M.charts().length, 1);
  assert.equal(M.log.sailed, SAILED_MAX_M);
  assert.equal(M.getSaveData().marque.until, MARQUE_UNTIL_MAX);
  assert.equal(M.regard('constructor', 5), null);
  assert.equal(M.standing('constructor'), 0);
  const log = newLog();
  log.sunk.pirate = 1; log.sunk.navy = 2; log.contracts.bounty = 1; log.contracts.delivery = 2;
  const lines = Object.fromEntries(logLines(log));
  assert.equal(lines['Ships sunk'], '3 - 1 pirate, 2 crown\'s ships');
  assert.equal(lines['Contracts done'], '3 - 1 bounty, 2 deliveries');
});

test('AUDIT CAPTAIN\'S SEA L4: the captain\'s days cross the lanes with the clocks - a legend ended, a strand gathered, the day\'s dealing moved by the days between them, both ways (a copy taken offline found her sunk for months, "gone down today") (mutants: each map, the dealing, the vendor)', async () => {
  const { offlineCopyOf, onlineCopyOf, CAPTAIN_RECORD_VENDOR } = await import('../../../src/systems/offlineCopy.js');
  const { CAPTAIN_SAVE_VENDOR } = await import('../../../src/systems/naval/captainLedger.js');
  assert.equal(CAPTAIN_RECORD_VENDOR, CAPTAIN_SAVE_VENDOR);
  const snap = { classicMinutes: 300 * 1440 + 10, worldMinutes: 4800 * 1440 + 10, modData: { Captain: { ether: { legends: { queen: 4799 }, harvested: { '3,4': 4800 } }, dealt: { day: 4800, at: {} } } } };
  const off = offlineCopyOf(snap).modData.Captain;
  assert.deepEqual([off.ether.legends.queen, off.ether.harvested['3,4'], off.dealt.day], [299, 300, 300], 'onto the character\'s clock');
  const on = onlineCopyOf({ classicMinutes: 300 * 1440 + 10, modData: { Captain: { ether: { legends: { queen: 299 }, harvested: {} }, dealt: null } } }, 5000 * 1440 + 10).modData.Captain;
  assert.equal(on.ether.legends.queen, 4999, 'onto the world\'s');
});

test('AUDIT CAPTAIN\'S SEA L6/B5/B7: the survey counts a ship once by her seed (kept on the contract, through a save); a deed moves one contract - a bounty\'s own quarry hers, else the soonest due (three hunts were done by the same three kills) - a berth every delivery\'s (mutants: the seen seeds, the order, the break)', async () => {
  const { advance, restoreContract } = await import('../../../src/systems/naval/harbourBoard.js');
  const { createCaptainLedger } = await import('../../../src/systems/naval/captainLedger.js');
  const survey = { id: 's', kind: 'survey', crown: 'Wayrest', need: 3, done: 0, until: 100, pay: 10, days: 2, standing: 6 };
  assert.equal(advance(survey, { type: 'study', crown: 'Wayrest', seed: 7 }), null);
  assert.equal(advance(survey, { type: 'study', crown: 'Wayrest', seed: 7 }), null);
  assert.equal(survey.done, 1, 'the same ship once');
  assert.deepEqual(restoreContract(JSON.parse(JSON.stringify(survey))).seen, [7], 'kept through a save');
  const L = createCaptainLedger();
  const hunt = (id, until) => ({ id, kind: 'hunt', crown: 'Wayrest', need: 2, done: 0, until, pay: 100, days: 3, standing: 2 });
  L.holdContract(hunt('late', 900)); L.holdContract(hunt('soon', 300));
  L.holdContract({ id: 'b', kind: 'bounty', crown: 'Wayrest', until: 999, pay: 500, days: 4, standing: 6, target: { px: 1, py: 1 } });
  const end = (bounty = null) => L.contractEvent({ type: 'end', act: 'sink', faction: 'pirate', crown: 'Wayrest', bounty });
  assert.deepEqual(end('b').done.map((c) => c.id), ['b'], 'her quarry the bounty\'s alone');
  end(); end();
  assert.deepEqual(L.contracts().map((c) => [c.id, c.done]), [['late', 0]], 'the soonest done first, by its own two');
});

test('AUDIT CAPTAIN\'S SEA L12: a hold\'s own plunder counted once each, as it leaves her - never the captain\'s own things put in and taken out again (each pass counted them) (mutants: the drawn set, the once)', async () => {
  const { GRAPPLE_S } = await import('../../../src/systems/naval/navalBoarding.js');
  const s = await sea({ hull: 2 });
  const notes = [];
  s.deps.worth = (items) => items.length;
  s.deps.captain = { note: (k, n) => notes.push([k, n]), deed() {}, event() {}, chartFor: () => null, marque: () => null, prize() {} };
  const id = s.host.spawnShip('merchantGalleon', { range: 26.8, bearing: Math.PI / 2, yaw: 0 });
  const e = s.host._sea.get(id);
  e.ship.pos = [26.8, 0, 0];
  s.host.frame(0.1);
  e.ship.damage.apply({ hull: Math.ceil(e.ship.damage.maxHull * 0.8), sail: 0, crew: 0 });
  s.host.frame(0.1);
  assert.equal(s.host.activate(), true);
  s.run(GRAPPLE_S + 0.3);
  for (const f of s.log.foes.filter((x) => x.side === 'enemy')) f.dead = true;
  s.run(0.2);
  const m = s.log.plunder.at(-1);
  const drawn = m.items.length;
  assert.ok(drawn > 0);
  m.takeAll();
  const mine = { name: 'my own sword' };
  m.items.push(mine);
  m.takeAll();
  m.items.push(mine);
  m.takeAll();
  assert.deepEqual(notes.filter(([k]) => k === 'plunder'), [['plunder', drawn]], 'her own, once');
});

test('AUDIT CAPTAIN\'S SEA B4: a bounty\'s quarry gone down by another hand is never stood again - her bounty void, said, no regard lost (she came back whole and her casks floated anew each time) (mutants: the mark, the event, the void)', async () => {
  const s = await sea({ hull: 2 });
  const site = { id: 'bounty:1', kind: 'bounty', px: 100, py: 100, seed: 77, classId: 'pirateBrig', name: 'Nocturnal\'s Mark', captain: null, region: 17 };
  const events = [];
  s.deps.captain = { sites: () => [site], event: (ev) => events.push(ev), deed() {}, chartFor: () => null, marque: () => null };
  s.run(1.2);
  const q = [...s.host._sea.values()].find((e) => e.bounty === site.id);
  assert.ok(q, 'stood');
  q.ship.damage.apply({ hull: 1e6, sail: 0, crew: 0 }, 0);   // no blow of mine
  for (let t = 0; t < 40 && s.host._sea.has(q.id); t += 1) s.run(1);
  assert.ok(!s.host._sea.has(q.id), 'gone down');
  assert.ok(events.some((ev) => ev.type === 'lost' && ev.bounty === site.id), 'her bounty void');
  s.run(3);
  assert.equal([...s.host._sea.values()].filter((e) => e.bounty === site.id).length, 0, 'never stood again');
  const { advance } = await import('../../../src/systems/naval/harbourBoard.js');
  const { createCaptainLedger } = await import('../../../src/systems/naval/captainLedger.js');
  assert.equal(advance({ id: 'x', kind: 'bounty' }, { type: 'lost', bounty: 'x' }), 'void');
  const L = createCaptainLedger();
  L.holdContract({ id: 'x', kind: 'bounty', crown: 'Wayrest', until: 9, pay: 5, days: 4, standing: 3, target: { px: 1, py: 1 } });
  const r = L.contractEvent({ type: 'lost', bounty: 'x' });
  assert.deepEqual([r.voided.length, L.contracts().length, L.standing('Wayrest')], [1, 0, 0], 'off the list, no regard lost');
  // the harbour office says it
  const { createHarbourOffice } = await import('../../../src/scenes/harbourOffice.js');
  const said = [];
  const L2 = createCaptainLedger();
  L2.holdContract({ id: 'y', kind: 'bounty', title: 'The Gull\'s bounty', crown: 'Wayrest', until: 9, pay: 5, days: 4, standing: 3, target: { px: 1, py: 1 } });
  createHarbourOffice({ ledger: L2, mid: (t) => said.push(t) }).event({ type: 'lost', bounty: 'y' });
  assert.deepEqual(said, ['Bounty void - The Gull\'s bounty. Someone else sank it.']);
});

test('AUDIT CAPTAIN\'S SEA C11: the posts\' worth executed at sea, not read off the text - her Gunner\'s quicker reload, her Carpenter\'s quicker mending, her Cook\'s slower wear on the spirits, each against the same crew with the post struck off (mutants: each seam)', async () => {
  const { FIELD_QUIET_S } = await import('../../../src/systems/naval/navalYard.js');
  const { SEA_DECAY_S, MORALE_START } = await import('../../../src/systems/naval/shipCrew.js');
  /** A crewed galleon at sea, her hand of `role` an Old Salt - or that post struck off (`without`). */
  const crewed = async (role, without = false) => {
    const s = await sea({ hull: 2 });
    s.boat.crewed = true;
    s.run(0.3);
    const st = s.host._myState(s.boat);
    for (const h of st.crew.hands) if (h.role === role) { if (without) h.role = 'Deckhand'; else h.fights = 40; }
    if (!without && !st.crew.hands.some((h) => h.role === role)) { st.crew.hands[1].role = role; st.crew.hands[1].fights = 40; }
    s.run(0.2);
    return { s, st };
  };
  // the Gunner on the reload
  const reload = async (without) => { const { st } = await crewed('Gunner', without); st.guns.fired('starboard'); return st.guns.left('starboard'); };
  const [gunner, none] = [await reload(false), await reload(true)];
  assert.ok(gunner < none * 0.9, `the Old Salt's guns quicker (${gunner.toFixed(2)} s against ${none.toFixed(2)} s)`);
  // the Carpenter on the mending, over the same quiet
  const mend = async (without) => {
    const { s, st } = await crewed('Carpenter', without);
    st.damage.apply({ hull: st.damage.maxHull * 0.8, sail: 0, crew: 0 }, -FIELD_QUIET_S);   // under the free mending's cap
    const was = st.damage.hull;
    s.run(10, 0.5);
    return st.damage.hull - was;
  };
  const [carpenter, plain] = [await mend(false), await mend(true)];
  assert.ok(carpenter > plain * 1.3, `the Old Salt's mending quicker (${carpenter.toFixed(1)} against ${plain.toFixed(1)})`);
  // the Cook on the sea's wear
  const wear = async (without) => { const { s, st } = await crewed('Cook', without); s.run(2 * SEA_DECAY_S + 1, 0.5); return MORALE_START - st.crew.morale; };
  const [cook, nocook] = [await wear(false), await wear(true)];
  assert.deepEqual([cook, nocook], [1, 2], 'an Old Salt Cook: the sea\'s clock at half the pace');
});

