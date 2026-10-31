// PERF-ON2 + PERF-CPU (2026-09-19, Mac: "Online mode needs further
// performance improvements", with a readout: 51 fps, frame 19.7 ms,
// script 23.3 ms, draws 1365, binds 820).
//
// A frame whose SCRIPT outruns its frame time is CPU-bound, and every
// instrument the port had measured the GPU. These pins hold the two
// answers: the peers are culled like everything else is, and the frame
// can now be tiled on the clock it is actually losing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { frustumPlanes, aabbOutside } from '../../src/render/frustum.js';
import { perspective, lookAt, multiply } from '../../src/world/mat4.js';
import { PerfMeter, perfOn, perfZones, perfCpu, perfZoneLine, PERF_EVERY } from '../../src/render/perfMeter.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** The frame's planes, from an eye at the origin looking down -z. */
const planesFor = (eye = [0, 1.7, 0], at = [0, 1.7, -10]) => {
  const proj = perspective(Math.PI / 3, 16 / 9, 0.2, 6000);
  const view = lookAt(eye, at, [0, 1, 0]);
  const out = new Float32Array(24);
  frustumPlanes(multiply(proj, view, new Float32Array(16)), out);
  return out;
};

/** The billboard VS's own extent, as world.js builds it: bottom-anchored,
 *  standing `h` up from the origin and reaching `w / 2` in any horizontal
 *  direction, because the quad turns to face the eye. */
const peerBox = (origin, w, h) =>
  [origin[0] - w / 2, origin[1], origin[2] - w / 2, origin[0] + w / 2, origin[1] + h, origin[2] + w / 2];

test('PERF-ON2: a peer outside the frustum is skipped, and one inside is kept - the same test every world flat already got', () => {
  const planes = planesFor();
  const seen = (origin) => !aabbOutside(planes, peerBox(origin, 1.2, 2.0), 0, 0, 0);
  assert.ok(seen([0, 0, -10]), 'straight ahead');
  assert.ok(seen([3, 0, -12]), 'off to the side, still in view');
  assert.ok(!seen([0, 0, 10]), 'BEHIND the camera - the case that was costing a draw and two binds every frame');
  assert.ok(!seen([600, 0, -10]), 'far off to the side');
  assert.ok(!seen([0, 0, -9000]), 'past the far plane');
  // the box is BOTTOM-ANCHORED: a peer whose feet are below the view but
  // whose head is in it is still drawn, which is what the shader does
  // (`uUp * ((aCorner.y + 0.5) * uSize.y)` runs 0..h from the origin).
  const low = [0, -1.9, -10];
  assert.ok(seen(low), 'feet under the eye line, head in view');
  assert.ok(!aabbOutside(planes, peerBox(low, 1.2, 2.0), 0, 0, 0));
  const noHeight = [0, -1.9, -10];
  assert.ok(aabbOutside(planes, peerBox(noHeight, 0, 0), 0, 0, 0) === aabbOutside(planes, [noHeight[0], noHeight[1], noHeight[2], noHeight[0], noHeight[1], noHeight[2]], 0, 0, 0),
    'a zero-sized batch is its own point');
});

test('PERF-ON2 / PERF-CROWD: the lifted sphere really does contain the sprite, and the unlifted one does not', async () => {
  const { sphereInPlanes, boundsOf } = await import('../../src/render/bounds.js');
  // a person: tall and narrow, which is the shape the unlifted sphere fails on
  const w = 1.0, h = 3.0;
  const bounds = boundsOf([0, 0, 0]); bounds[3] += Math.hypot(w, h) * 0.5;
  assert.ok(bounds[3] < h, `the STORED sphere does not reach the sprite's top (r ${bounds[3].toFixed(2)} < ${h}) - culling by it would clip heads`);
  assert.ok(Math.abs(h - h * 0.5) <= bounds[3] + 1e-9, 'the LIFTED sphere does reach it');
  // a frustum that keeps only y >= h - 0.2: the head is in view, the feet are not
  const planes = new Float32Array(24);
  for (let k = 0; k < 6; k++) { planes[k * 4 + 1] = 1; planes[k * 4 + 3] = -(h - 0.2); }
  assert.equal(sphereInPlanes(planes, 0, 0, 0, bounds[3]), false, 'unlifted: the sprite is culled while its head is in view');
  assert.equal(sphereInPlanes(planes, 0, h * 0.5, 0, bounds[3]), true, 'lifted: it is kept');
});

test('PERF-CPU: `?perf=cpu` is its own door, and it does not turn the zone door on', () => {
  assert.equal(perfCpu('?perf=cpu'), true);
  assert.equal(perfOn('?perf=cpu'), true, 'the meter is built at all');
  assert.equal(perfZones('?perf=cpu'), false, 'but the GPU zone arm stays off');
  assert.equal(perfCpu('?perf'), false);
  assert.equal(perfCpu('?perf=zones'), false);
  assert.equal(perfCpu(''), false);
});

test('PERF-CPU: the zones TILE on the main thread’s clock - they sum to the frame, nothing is double-counted, and the line names its clock', () => {
  const gl = new Proxy({}, { get: (o, k) => (k === 'getExtension' ? () => null : () => ({})) });
  const m = new PerfMeter(gl, false, true);
  let t = 0; m._now = () => t;
  let line = null;
  for (let f = 0; f < PERF_EVERY; f++) {
    m.markCpu('online'); t += 2;
    m.markCpu('sim'); t += 5;
    m.mark('grass'); t += 1;       // a GPU mark marks the CPU clock too
    m.mark('world'); t += 8;
    m.stop();
    line = m.frame({ draws: 1365 });
  }
  assert.ok(line, `a line every ${PERF_EVERY} frames`);
  assert.match(line, /^\[perf\] cpu 16\.00ms \| world 8\.00 \| sim 5\.00 \| online 2\.00 \| grass 1\.00 \| draws 1365$/,
    'the zones sum to the 16 ms the frame spent, heaviest first, on a clock the line names');
  assert.equal(m.cpuOpen, null, 'no span is left open to leak into the next frame');
  assert.equal(m.samples.length, 0, 'and the GPU clock never ran, so nothing accumulates in a list the CPU arm never drains');
});

test('PERF-CPU: `frame()` closes the frame whether or not `stop()` was called - a span left open would leak into the next one', () => {
  // The renderer calls stop() then frame(), so in this tree the close in
  // frame() is belt-and-braces - and a mutant that removed it survived
  // the pin above for exactly that reason. It is kept and pinned rather
  // than recorded equivalent, because the contract "frame() ends the
  // frame" is the cheap one to guarantee and the failure it prevents is
  // silent: a zone accumulating across frames reads as a phase that
  // grows the longer you play.
  const gl = new Proxy({}, { get: (o, k) => (k === 'getExtension' ? () => null : () => ({})) });
  const m = new PerfMeter(gl, false, true);
  let t = 0; m._now = () => t;
  let line = null;
  for (let f = 0; f < PERF_EVERY; f++) {
    m.markCpu('online'); t += 2;
    m.markCpu('sim'); t += 5;
    line = m.frame({ draws: 1 });   // NO stop() - the host forgot, or another host never had one
  }
  assert.equal(m.cpuOpen, null, 'the open span is closed by frame() itself');
  assert.match(line, /^\[perf\] cpu 7\.00ms \| sim 5\.00 \| online 2\.00 \| draws 1$/,
    'and every frame is 7 ms - not a `sim` that grows by 5 ms a frame because its span never closed');
});

test('PERF-CPU: markCpu leaves the GPU arm exactly as it was', () => {
  assert.match(perfZoneLine(new Map([['a', 1]]), { draws: 2 }), /^\[perf\] gpu 1\.00ms/, 'by default');
});

test('AUDIT PERF-LIGHTS F2: a per-light range array shorter than the light list gives a real range, not a silent NaN', async () => {
  const { nearestLights, CITY_LIGHT_RANGE } = await import('../../src/world/city/cityLights.js');
  // PRE-EXISTING, found by the audit rather than caused by it: the world
  // host sizes its CityLightAnimator at 4096 lanterns and nothing checks
  // the light list against that. Past the end the range read `undefined`,
  // which lands in a Float32Array as NaN - and a NaN far plane goes on to
  // the point-shadow matrices and the shader's depth reconstruction,
  // where it fails silently and totally. A cliff with no edge marked.
  const lights = []; for (let i = 0; i < 20; i++) lights.push({ x: i, y: 0, z: 0 });
  const short = new Float32Array(5);        // five ranges for twenty lights
  const out = nearestLights(lights, [0, 0, 0], 16, short, null, 0, 20);
  const w = [...out].filter((_, i) => i % 4 === 3);
  assert.equal(w.some(Number.isNaN), false, 'not one NaN far plane');
  assert.ok(w.slice(5).every((v) => v === CITY_LIGHT_RANGE), 'past the end it is the module\u2019s own default range');
  assert.ok(w.slice(0, 5).every((v) => v === 0), 'and inside it, the array\u2019s own values, untouched');
  // a full-length array is unaffected in every entry
  const full = new Float32Array(20); for (let i = 0; i < 20; i++) full[i] = 11 + i;
  const ok = nearestLights(lights, [0, 0, 0], 16, full, null, 0, 20);
  assert.deepEqual([...ok].filter((_, i) => i % 4 === 3), [...Array(16)].map((_, i) => 11 + i), 'the ordinary path is byte for byte what it was');
});
