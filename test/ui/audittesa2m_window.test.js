// AUDIT TESA II, lane M - THE HELD MAP'S WINDOW PAST THE BAY, pinned where the audit found it wrong
// (ui/heldMap.js; TESA15, MAP-LINES):
//   M2  the window's "paint it again" (the zones' borders landing, the web face landing) inks the sheet's kept parts too;
//   M8  bare land past the Bay answers with its ore card, off the host's own maps (ARENA2: the producer's shape);
//   M9  a region landing repaints the window and strokes the sheet's ink again nowhere;
//   M11 the kept parts made only while the land past the Bay is in the view; the road ink let go on close;
//   K3  ZOOM-FAST's settle a law of its own, and the frame after a zoom settles paints the tiles it owed.
// A held map on a document whose canvases carry recording 2D contexts, on the authored land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HeldMapWindow, createZoomSettle, ZOOM_SETTLE_MS } from '../../src/ui/heldMap.js';
import { CLIMATES, LOCATION_TYPES } from '../../src/formats/mapsFile.js';
import { setTamrielFit } from '../../src/world/tamriel/tamrielFrame.js';
import { setTamrielTrace } from '../../src/world/tamriel/tamrielLand.js';
import { roadKeptCounts, arenaRoadInkAt } from '../../src/ui/tamrielInk.js';
import { setArenaRoads, beyondKey } from '../../src/world/arenaRoads.js';
import { addPastBayPlaces, resetPastBayPlaces } from '../../src/world/pastBayPlaces.js';
import { DIR } from '../../src/world/road/roadNetwork.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every call on every canvas, in order: [canvas id, fn, args, font, globalAlpha]. */
let log = [];
let ids = 0;
function recCtx(canvas) {
  const st = { globalAlpha: 1 };
  return new Proxy({}, {
    get: (_, k) => {
      if (k === 'canvas') return canvas;
      if (k === 'measureText') return (t) => ({ width: String(t).length * 6 });
      if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w?.width ?? w ?? 1) * (h ?? 1) * 4)), width: w, height: h });
      if (k === 'getLineDash') return () => st._dash ?? [];
      if (k === 'setLineDash') return (d) => { st._dash = d; log.push([canvas.id, 'setLineDash', [d]]); };
      if (k in st) return st[k];
      return (...a) => { log.push([canvas.id, k, a, st.font, st.globalAlpha, st.fillStyle, st.strokeStyle]); };
    },
    set: (_, k, v) => { st[k] = v; return true; },
  });
}
let fontsLanded = null;
function fakeDocument() {
  const node = (tag) => {
    const n = {
      tag, id: '', children: [], style: { setProperty() {} }, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      append(...k) { n.children.push(...k); }, remove() { n.removed = true; }, addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, querySelectorAll: () => [],
      className: '', textContent: '', title: '', attrs: {}, setAttribute(k, v) { n.attrs[k] = v; }, set innerHTML(v) { n.children = []; }, get innerHTML() { return ''; },
    };
    if (tag === 'canvas') { n.id = `c${++ids}`; n.width = 300; n.height = 150; const c = recCtx(n); n.getContext = () => c; }
    return n;
  };
  return {
    createElement: (t) => node(t), createTextNode: (t) => ({ textContent: t }), getElementById: () => null, head: node('head'), body: node('body'), addEventListener() {}, removeEventListener() {},
    fonts: { load: () => ({ then: (f) => { fontsLanded = f; } }) },
  };
}
const texts = (n, out = []) => { if (!n) return out; if (n.textContent) out.push(n.textContent); if (n.title) out.push(n.title); for (const c of n.children ?? []) if (typeof c === 'object') texts(c, out); return out; };
/** A held map on the authored land; `extra` the host's deps. Ticked up, its ink canvas recording. */
function openMap(extra = {}) {
  const win = new HeldMapWindow({
    getPlayerPixel: () => ({ x: 500, y: 250 }), getClimateIndex: () => CLIMATES.Woodlands,
    woods: { heightMapBuffer: new Uint8Array(500000).fill(10) }, mapSize: { width: 1000, height: 500 },
    gold: () => 0, goldPieces: () => 0, hasHorse: false, hasCart: false, hasShip: false, diseaseCount: () => 0, poisonCount: () => 0,
    ...extra,
  });
  for (let i = 0; i < 20; i++) win.tick(0.05);
  win._chrome.ink.id = 'ink';
  win._phase = 'map';
  return { win };
}
/** The window painted again, the zoom settled first (ZOOM_SETTLE_MS) - the calls of that paint. */
async function paintSettled(win, bust = true) {
  win._staticKey = ''; if (bust) win._sheetLayersKey = ''; win._paint();
  await sleep(ZOOM_SETTLE_MS + 30);
  log = [];
  win._staticKey = ''; if (bust) win._sheetLayersKey = ''; win._paint();
  return log;
}
function withMap(fn) {
  return async () => {
    globalThis.document = fakeDocument();
    globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
    globalThis.innerWidth = 1600; globalThis.innerHeight = 900; globalThis.devicePixelRatio = 1;
    setTamrielTrace(null);
    setTamrielFit({ ox: 38 * 15.5, oy: 57 * 15.5, ppu: 15.5 });
    try { await fn(); } finally {
      setTamrielFit(null); setArenaRoads(null); resetPastBayPlaces();
      delete globalThis.document; delete globalThis.ImageData; delete globalThis.innerWidth; delete globalThis.innerHeight; delete globalThis.devicePixelRatio;
    }
  };
}
// M2's half that waited on their landing with them - the face's half stands.
test('AUDIT TESA II M2: the web face landing inks the sheet\'s kept parts again, the view unmoved - not at the next pan (mutants: the face\'s landing the window\'s key alone; the parts kept)', withMap(async () => {
  const { win } = openMap();
  win._setView({ ox: -589, oy: -600, scale: 0.9 });
  await paintSettled(win);
  const over = win._subLayers.over.id, under = win._subLayers.under.id;
  log = []; win._paint();
  assert.equal(log.filter(([c]) => c === under).length, 0, 'a frame with no news strokes no part again');
  fontsLanded?.();
  log = []; win._paint();
  assert.ok(log.some(([c, fn]) => c === under && fn === 'fillText') || log.some(([c, fn]) => c === over && fn === 'fillText'), 'the face landed: the names lettered again');
  assert.ok(log.filter(([c]) => c === under).length > 0, 'the under part too');
}));

test('AUDIT TESA II M9: a region landing far off the view repaints the window - its tiles compare their words - and strokes the sheet\'s ink, its parts and the marks\' bake again nowhere (mutant: the versions back in the static key)', withMap(async () => {
  const { win } = openMap();
  win._setView({ ox: -589, oy: -600, scale: 0.9 });
  const layer = { roads: new Map(), tracks: new Map(), join: new Map() };
  setArenaRoads(layer);
  await paintSettled(win);
  const under = win._subLayers.under.id, over = win._subLayers.over.id;
  for (let i = 0; i < 4; i++) {
    addPastBayPlaces([{ x: 4000 + i, y: 2500, type: LOCATION_TYPES.HomeFarms }]);
    const add = { roads: new Map([[beyondKey(4000 + i, 2600), DIR.E]]), tracks: new Map() };
    for (const [k, b] of add.roads) layer.roads.set(k, b);
    setArenaRoads(layer, add);
    win._staticKey = 'x';
    win._sheet.tick(0.016);
    assert.equal(win._staticKey, '', 'the landing repaints the window');
    log = []; win._paint();
    assert.equal(log.filter(([c]) => c === under || c === over).length, 0, 'no part stroked again');
  }
}));

test('AUDIT TESA II M11: on the Bay alone the sheet makes no kept parts of its own size; the road ink\'s caches are let go when the window shuts (mutants: the parts always made; the release unwired)', withMap(async () => {
  const { win } = openMap();
  win._subLayers = null; win._sheetLayersKey = '';   // the rest view's (it reaches past the Bay's foot) let go
  win._setView({ ox: 300, oy: 150, scale: 4 });
  await paintSettled(win, false);
  assert.equal(win._subLayers ?? null, null, 'none on the Bay');
  win._setView({ ox: -589, oy: -600, scale: 0.9 });
  await paintSettled(win, false);
  assert.ok(win._subLayers, 'made once the land past the Bay is in the view');
  const layer = { roads: new Map([[beyondKey(-300, -300), DIR.E], [beyondKey(-299, -300), DIR.W]]), tracks: new Map(), join: new Map() };
  setArenaRoads(layer);
  arenaRoadInkAt(-5, -5);
  assert.ok(roadKeptCounts().ink > 0);
  win._close();
  assert.deepEqual(roadKeptCounts(), { steps: 0, dots: 0, ink: 0 });
}));

test('AUDIT TESA II K3: ZOOM-FAST\'s settle - the first scale settles none, a change settles for ZOOM_SETTLE_MS from it, then none; and the frame after a zoom settles paints the road tiles it owed (mutants: settling forever; never)', withMap(async () => {
  const settle = createZoomSettle(150);
  assert.equal(settle(1, 0), false, 'a map opening is no zoom');
  assert.equal(settle(1, 10), false);
  assert.equal(settle(2, 100), true, 'a change settles');
  assert.equal(settle(2, 249), true);
  assert.equal(settle(2, 250), false, 'for ZOOM_SETTLE_MS, then none');
  assert.equal(ZOOM_SETTLE_MS, 150);
  const { win } = openMap();
  const layer = { roads: new Map(), tracks: new Map(), join: new Map() };
  for (let x = -900; x < -100; x++) layer.roads.set(beyondKey(x, -400), (x > -900 ? DIR.W : 0) | (x < -101 ? DIR.E : 0));
  setArenaRoads(layer);
  win._setView({ ox: -900, oy: -600, scale: 0.9 });
  await paintSettled(win, false);
  const kept0 = win._pastBayTiles.kept();
  assert.ok(kept0 > 0, 'painted, settled');
  win._setView({ ox: -900, oy: -600, scale: 1.3 });   // a zoom: the new level's tiles owed
  win._staticKey = ''; win._paint();
  assert.equal(win._pastBayTiles.kept(), kept0, 'while it settles none is painted');
  assert.equal(win._pastBayTiles.takePending(), true, 'and they are owed');
  await sleep(ZOOM_SETTLE_MS + 30);
  for (let i = 0; i < 20; i++) { win._staticKey = ''; win._paint(); if (!win._pastBayTiles.takePending()) break; }
  assert.ok(win._pastBayTiles.kept() > kept0, 'settled: the owed tiles painted');
  assert.equal(win._pastBayTiles.takePending(), false, 'none owed');
}));

// ── M8: THE ORE CARD PAST THE BAY, OFF THE HOST'S MAPS (ARENA2) ──
const A2 = process.env.ARENA2_PATH;
const file = (name) => { for (const n of [name, name.toLowerCase()]) { const p = join(A2, n); if (existsSync(p)) return readFileSync(p); } throw new Error(name); };
