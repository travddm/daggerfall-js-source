// RELIEF-CARETS (bible/03-World/Tamriel.md): the high ground past the Bay is marked by the Bay's own law - every land
// pixel at or over the treeline, on the Bay's grid and steps, in the Bay's pen and shape - off the ground's heights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockCarets, createPastBayCarets, paintPastBayCarets, caretStep, CARET_BLOCK } from '../../../src/ui/ink/pastBayCarets.js';
import { buildInkModel, paintInk, CARET_STEP, PEN } from '../../../src/ui/ink/inkMap.js';
import { TREELINE_BYTE, SNOWLINE_BYTE } from '../../../src/ui/overworldModel.js';
import { CLIMATES } from '../../../src/formats/mapsFile.js';
import { buildTamrielInk } from '../../../src/ui/tamrielInk.js';
import { tamrielHeightByte } from '../../../src/world/tamriel/tamrielGround.js';
import { inBay } from '../../../src/world/tamriel/tamrielFrame.js';

function recordingCtx() {
  const calls = [];
  const state = {};
  return new Proxy({}, {
    get: (_, key) => {
      if (key === 'calls') return calls;
      if (key === 'measureText') return (text) => ({ width: text.length * 6 });
      if (key in state) return state[key];
      return (...args) => { calls.push({ fn: key, args, strokeStyle: state.strokeStyle }); };
    },
    set: (_, key, value) => { state[key] = value; return true; },
  });
}

/** A ground of one law, with the Bay's own rectangle left out. */
function groundOf(heightByte, { climateAt = () => CLIMATES.Woodlands, frame = { x0: -300, y0: -300, w: 1600, h: 1100 } } = {}) {
  const reads = { height: 0 };
  return {
    reads,
    ground: {
      heightByte: (x, y) => { reads.height++; return heightByte(x, y); },
      climateAt,
      frame,
      inBay: (x, y) => x >= 0 && y >= 0 && x < 1000 && y < 500,
    },
  };
}

test('RELIEF-CARETS a caret on every pixel of the step\'s lattice at or over the treeline, and on no other; a peak over the snowline', () => {
  const height = (x, y) => (x + y) % 7 === 0 ? SNOWLINE_BYTE : x % 4 === 0 ? TREELINE_BYTE : TREELINE_BYTE - 1;
  const { ground } = groundOf(height);
  for (const step of Object.values(CARET_STEP)) {
    const carets = blockCarets(ground, step, -2, -2);
    const want = [];
    for (let y = -2 * CARET_BLOCK; y < -CARET_BLOCK; y++) {
      for (let x = -2 * CARET_BLOCK; x < -CARET_BLOCK; x++) if (x % step === 0 && y % step === 0 && height(x, y) >= TREELINE_BYTE) want.push(`${x},${y}`);
    }
    assert.deepEqual(carets.map((c) => `${c.x},${c.y}`), want, `step ${step}`);
    for (const caret of carets) assert.equal(caret.peak, height(caret.x, caret.y) >= SNOWLINE_BYTE);
  }
});

test('RELIEF-CARETS the Bay\'s own ground, water and the land past the continent\'s frame take no caret', () => {
  const frame = { x0: -50, y0: -50, w: 1100, h: 600 };
  const { ground } = groundOf(() => 200, { frame, climateAt: (x) => (x < -20 ? CLIMATES.Ocean : CLIMATES.Woodlands) });
  const carets = createPastBayCarets(ground).inRect(-400, -400, 1400, 900, 2);
  assert.ok(carets.length > 0);
  for (const caret of carets) {
    assert.ok(!ground.inBay(caret.x, caret.y), 'not on the Bay');
    assert.ok(caret.x >= -20, 'not at sea');
    assert.ok(caret.x < frame.x0 + frame.w && caret.y < frame.y0 + frame.h && caret.y >= frame.y0, 'within the frame');
  }
  assert.ok(carets.some((c) => c.x >= 1000), 'east of the Bay');
  assert.ok(carets.some((c) => c.y < 0), 'north of the Bay');
  const cut = createPastBayCarets(ground).inRect(-400, -400, 1400, 900, 3);
  assert.ok(cut.length > 0);
  for (const caret of cut) assert.ok(caret.x % 3 === 0 && caret.y % 3 === 0, 'a frame cut off the lattice keeps the Bay\'s lattice');
});

test('RELIEF-CARETS the step is the Bay\'s for the band, the continent\'s out on the continent', () => {
  for (const band of ['far', 'mid', 'near']) assert.equal(caretStep(band, false), CARET_STEP[band]);
  assert.equal(caretStep('far', true), CARET_STEP.continent);
  for (const step of Object.values(CARET_STEP)) assert.equal(CARET_BLOCK % step, 0, 'a block holds whole steps, so blocks tile the lattice');
});

test('RELIEF-CARETS a block is read once a step: a second view over it reads no height', () => {
  const { ground, reads } = groundOf(() => 90);
  const store = createPastBayCarets(ground);
  const first = store.inRect(1000, 0, 1200, 150, 3);
  const after = reads.height;
  assert.ok(after > 0);
  assert.deepEqual(store.inRect(1000, 0, 1200, 150, 3), first);
  assert.equal(reads.height, after);
  store.inRect(1000, 0, 1200, 150, 6);
  assert.ok(reads.height > after, 'another step is its own lattice');
});

test('RELIEF-CARETS the carets are drawn as the Bay draws its own: the same pen, size and shape, at the same scale', () => {
  const view = { ox: 0, oy: 0, scale: 9 };
  const bayModel = buildInkModel({ width: 8, height: 4, heightBytes: new Uint8Array(32).fill(SNOWLINE_BYTE), climateAt: () => CLIMATES.Woodlands });
  const bayCtx = recordingCtx();
  paintInk(bayCtx, bayModel, view, { paperW: 72, paperH: 36, band: 'near' });
  const reliefPath = (calls) => calls.filter((c) => (c.fn === 'moveTo' || c.fn === 'lineTo') && c.strokeStyle === PEN.relief).map((c) => `${c.fn}(${c.args.map((v) => v.toFixed(3))})`);
  const pastCtx = recordingCtx();
  const { ground } = groundOf(() => SNOWLINE_BYTE, { frame: { x0: 0, y0: 0, w: 8, h: 4 } });
  ground.inBay = () => false;
  paintPastBayCarets(pastCtx, view, createPastBayCarets(ground), { paperW: 72, paperH: 36, band: 'near', continent: false });
  const bay = reliefPath(bayCtx.calls);
  assert.ok(bay.length > 0);
  assert.deepEqual(reliefPath(pastCtx.calls), bay);
});

test('RELIEF-CARETS on the continent\'s own ground: every caret stands on a byte over the treeline, and the high ground in a view is marked whole', () => {
  const ink = buildTamrielInk();
  const { x0, y0, w, h } = ink.frame;
  const step = 12;
  const carets = ink.carets.inRect(x0, y0, x0 + w, y0 + h, step);
  assert.ok(carets.length > 50, `${carets.length} carets past the Bay`);
  for (const caret of carets) {
    assert.ok(tamrielHeightByte(caret.x, caret.y) >= TREELINE_BYTE);
    assert.ok(!inBay(caret.x + 0.5, caret.y + 0.5));
  }
  const marked = new Set(carets.map((c) => `${c.x},${c.y}`));
  let high = 0;
  for (let y = Math.ceil(y0 / step) * step; y < y0 + h; y += step * 4) {
    for (let x = Math.ceil(x0 / step) * step; x < x0 + w; x += step * 4) {
      if (inBay(x + 0.5, y + 0.5) || tamrielHeightByte(x, y) < TREELINE_BYTE) continue;
      high++;
      assert.ok(marked.has(`${x},${y}`), `high ground at ${x},${y} has its caret`);
    }
  }
  assert.ok(high > 0, 'the sample met high ground');
});
