// AUDIT EG V (2026-10-15; bible/11-Multiplayer/Elite-Gates.md sections 7, 25.1 and 29, EG-H3 and EG-ZN) - FIX GROUP E,
// "render": THE SWAP'S WORKER BUILDS WHAT THE MAIN THREAD LAID AND PAINTED.
//   L6-8  the worker's build carries its circle's five specs (world/eliteGates/egCircleParts.js egCircleBuild); the page takes them as
//         given (net/eliteGates/egLaw.js egSpecGive), a hall a frame of the Court's rest and the rest at THE SWAP, before anything
//         under the veil reads them - it laid halls 2-5 again there (17-102 ms, lane 6's swap_tick probe);
//   L6-9  the next band's dress is painted in that worker (world/eliteGates/egBandArt.js is pure) and put up a record a frame of the
//         rest - it was painted on the main thread in one plain rest frame (150-270 ms at Redoubts 5, 10 and 15).
// Pinned on the mode machine's own source (scenes/worldModes.js - its stand, prebuild, swap and band dress) over a counting
// renderer, its worker the worker's own handler (world/eliteGates/egCircleWorker.js) run in this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { egCircleSpecs, egBandOfCircle, egSpecGive, egSpecForget, egHallOf, EG_SPEC, EG_TEXT } from '../../../src/net/eliteGates/egLaw.js';
import { createEgSwap } from '../../../src/scenes/eliteGates/egSwap.js';
import { egCircleParts, egCircleBuild, egCirclePartsTransfers } from '../../../src/world/eliteGates/egCircleParts.js';
import { buildEgCircleModel, egCircleColliderTris, egCircleLights, egGateParts } from '../../../src/world/eliteGates/egHall.js';
import { realmArt } from '../../../src/world/superDungeon/sdRealmArt.js';
import { SD_REALM_ARCHIVE } from '../../../src/world/superDungeon/sdRealm.js';
import { identity } from '../../../src/world/mat4.js';
import { egBandArt, egBandArchive, EG_DRESS_RECORDS, EG_BAND_RECORDS } from '../../../src/world/eliteGates/egBandArt.js';
import { createEgOccluders } from '../../../src/scenes/eliteGates/egOcclude.js';
import { buildEgLookModel } from '../../../src/world/eliteGates/egLook.js';
import { Collider } from '../../../src/player/collider.js';
import { egBeatTellDown } from '../../../src/scenes/eliteGates/egSpan.js';
import { createEgGroundLook } from '../../../src/scenes/eliteGates/egGroundLook.js';   // EG-LOOK: the circle's ruin and its band's wreck, stood with it

const SEED = 0x5eed1234, B = '0123456789abcdef';
const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > 0 && j > i, `${a} .. ${b}`); return src.slice(i, j); };

/** The worker's own handler (world/eliteGates/egCircleWorker.js), loaded once in this process; its answers pass through a structured
 *  clone that hands over the buffers it names, as a real worker's postMessage does. */
const HANDLER = await (async () => {
  const was = globalThis.onmessage;
  try { await import('../../../src/world/eliteGates/egCircleWorker.js'); return globalThis.onmessage; } finally { globalThis.onmessage = was; }
})();
/** Workers over that handler, each build asked answered at once. */
async function workerOf() {
  const was = globalThis.postMessage;
  let reply = null;
  globalThis.postMessage = (m, transfer = []) => reply?.(structuredClone(m, { transfer }));
  const restore = () => { globalThis.postMessage = was; };
  const made = [];
  const factory = () => {
    const w = { posted: [], onmessage: null, onerror: null, terminate() {}, postMessage(m) { w.posted.push(m); reply = (data) => w.onmessage?.({ data }); HANDLER({ data: m }); } };
    made.push(w);
    return w;
  };
  return { factory, restore, lastAsk: () => made.at(-1)?.posted.at(-1) };
}

const eh = (c) => ({ b: B, seed: SEED, c, geo: 0 });
const bandUps = (ups, band) => ups.filter((k) => k.startsWith(`${egBandArchive(band)}_`)).length;

test('AUDIT EG V L6-8, L6-9 THE WORKER\'S BUILD (world/eliteGates/egCircleParts.js egCircleBuild, world/eliteGates/egCircleWorker.js): a build asked carries the circle\'s made level as before, its five halls\' specs as the hall law lays them, and - when a band is asked - that band\'s dress painted, every record of it, its pixels handed over with the rest; the worker answers with it (mutants: the specs left out; the dress left out; the dress painted for another band; its pixels copied)', async () => {
  const c = 6, band = egBandOfCircle(c), m = egCircleBuild({ seed: SEED, c, geo: 0, band });
  const plain = egCircleParts(SEED, c, 0);
  assert.equal(m.key, plain.key);
  assert.deepEqual(m.lamps, plain.lamps);
  assert.deepEqual(m.specs.map((s) => JSON.stringify(s)), egCircleSpecs(SEED, c, 0).map((s) => JSON.stringify(s)), 'its five halls, the law\'s own');
  assert.deepEqual(m.art.map(([rec]) => rec), [...EG_BAND_RECORDS], 'every record of the dress');
  assert.deepEqual(m.art.map(([, a]) => [...a.albedo.colors.slice(0, 64)]), egBandArt(band).map(([, a]) => [...a.albedo.colors.slice(0, 64)]), 'the band\'s own');
  assert.equal(egCircleBuild({ seed: SEED, c, geo: 0 }).art, null, 'no band asked: no dress');
  const bufs = new Set(egCirclePartsTransfers(m));
  for (const [, a] of m.art) assert.ok(bufs.has(a.albedo.colors.buffer) && bufs.has(a.emission.colors.buffer), 'its pixels handed over');
  const W = await workerOf();
  try {
    const w = W.factory(), got = [];
    w.onmessage = (ev) => got.push(ev.data);
    w.postMessage({ t: 'build', id: 3, seed: SEED, c, geo: 0, band });
    assert.equal(got.length, 1);
    assert.deepEqual([got[0].t, got[0].id, got[0].parts.specs.length, got[0].parts.art.length], ['built', 3, 5, EG_BAND_RECORDS.length]);
  } finally { W.restore(); }
});

