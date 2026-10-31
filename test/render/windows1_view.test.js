// RW1 (2026-10-09, Mac: "...allowing players to see inside/outside of house windows"): THE VIEW OUT - from inside a
// building, its glass shows the real street: drawn from the interior camera into a target of its own
// (renderer.outsideViewFrame - a bracket that puts back everything it sets), cropped to the screen rectangle the glass
// covered last frame, kept while the camera is still, painted as the interior frame's background inside that
// rectangle (renderer.setGlassView), the glass texels cut to it. An interior's glass is DFU's window table drawn
// indoors, the panes of an interior set's window wall (GLASS-ALL, read off a real ARENA2), a declared mask
// (renderer.uploadGlassMask), or a cutout picture's holes (uploadTexture { cutout: true }) - the caravan's door. Pinned by
// execution over a recording GL; the hosts' wiring by their text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setFrameTarget, frameTarget } from '../../src/render/renderTarget.js';
import { Renderer } from '../../src/render/renderer.js';
import { ShadowPass, DEPTH_BB_FS, DEPTH_FS } from '../../src/render/shadowPass.js';
import { StaticBatchBuilder } from '../../src/render/staticBatch.js';
import { windowEmissionRGB } from '../../src/render/windowEmission.js';
import {
  cropProjection, viewOutProjection, VIEW_NEAR, VIEW_FAR, sphereNdcRect, padRect, GLASS_RECT_MARGIN, viewTargetSize, VIEW_SCALE,
  VIEW_MAX_SIDE, VIEW_BUCKET, viewOutDue, VIEW_MAX_AGE_MS, VIEW_RELEASE_MS, createViewOut, viewOutFrame, viewRays,
  viewSkyFrom,
} from '../../src/render/realWindows.js';
import { interiorGlassMask, interiorWindowOf, isInteriorGlassArchive, GLASS_INDEX, GLASS_RAMP, INTERIOR_WINDOW, glassMaskFromAlpha, glassTexelCount } from '../../src/world/interior/interiorGlass.js';
import { perspective, lookAt, mirrorProjectionX, identity, multiply } from '../../src/world/mat4.js';
import { TextureFile } from '../../src/formats/textureFile.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => hostText(p);
const I = identity();
const px = { width: 1, height: 1, colors: new Uint8ClampedArray([255, 255, 255, 255]) };

function recordingRenderer(log) {
  let id = 0;
  const stub = new Proxy({}, {
    get: (o, k) => {
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (p, name) => ({ name, p });
      if (k === 'getAttribLocation') return () => 0;
      if (typeof k === 'string' && k.startsWith('create')) return () => ({ id: ++id, kind: k });
      if (k === 'getParameter') return () => new Float32Array([0, 0, 0, 0]);
      if (k === 'drawingBufferWidth') return 640;
      if (k === 'drawingBufferHeight') return 400;
      if (typeof k === 'string' && k.toUpperCase() === k) return k;
      return (...args) => { log.push([k, ...args]); };
    },
  });
  const canvas = { getContext: () => stub, clientWidth: 640, clientHeight: 400, width: 640, height: 400 };
  const r = new Renderer(canvas);
  log.length = 0;
  return r;
}
const uploads = (log, name) => log.filter((c) => /^uniform/.test(c[0]) && c[1]?.name === name).map((c) => c.slice(2));
const project = (pv, p) => { const x = pv[0] * p[0] + pv[4] * p[1] + pv[8] * p[2] + pv[12], y = pv[1] * p[0] + pv[5] * p[1] + pv[9] * p[2] + pv[13], z = pv[2] * p[0] + pv[6] * p[1] + pv[10] * p[2] + pv[14], w = pv[3] * p[0] + pv[7] * p[1] + pv[11] * p[2] + pv[15]; return [x / w, y / w, z / w]; };

test('RW1 view V1: the view out\'s lens - the crop makes the glass\'s rectangle the whole clip space (its corners at the edge, its centre the middle), and the street\'s lens lands every direction where the room\'s does, its depth out to the fog (mutants: the crop\'s scale or offset, the far plane, x and y moved)', () => {
  const proj = mirrorProjectionX(perspective(1.1, 1.6, 0.05, 500));
  const view = lookAt([1, 1.6, 2], [-2, 2, -9], [0, 1, 0]);
  const pv = multiply(proj, view);
  const rect = [-0.3, -0.2, 0.5, 0.6];
  const cpv = multiply(cropProjection(proj, rect), view);
  for (const p of [[-3, 2, -10], [0, 0.5, -4], [4, 3, -20], [-1, 1, -2]]) {
    const a = project(pv, p), b = project(cpv, p);
    assert.ok(Math.abs(b[0] - (2 * (a[0] - rect[0]) / (rect[2] - rect[0]) - 1)) < 1e-4, 'x: the rectangle stretched to the edges');
    assert.ok(Math.abs(b[1] - (2 * (a[1] - rect[1]) / (rect[3] - rect[1]) - 1)) < 1e-4, 'y: the same');
    assert.ok(Math.abs(b[2] - a[2]) < 1e-5, 'depth untouched');
  }
  const far = viewOutProjection(proj);
  const fpv = multiply(far, view);
  for (const p of [[-3, 2, -10], [0, 0.5, -4], [4, 3, -200]]) {
    const a = project(pv, p), b = project(fpv, p);
    assert.ok(Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5, 'the same NDC: the crop and the background line up with the room');
  }
  const viewDepth = (d) => project(far, [0, 0, -d])[2];
  assert.ok(Math.abs(viewDepth(VIEW_NEAR) + 1) < 1e-4 && Math.abs(viewDepth(VIEW_FAR) - 1) < 1e-3, 'near and far are the street\'s');
  assert.ok(VIEW_FAR > 500, 'past the interior lens\'s 500 m');
});

test('RW1 view V2: a sphere\'s rectangle on the screen is conservative - every point of the sphere lands inside it, a sphere behind the eye is none, one through the eye\'s plane is all of it, one off to the side is none; the rectangle grows by the margin and the target follows its size (mutants: the depth range taken whole, the behind test, the margin, the bucket)', () => {
  const proj = mirrorProjectionX(perspective(1.1, 1.6, 0.05, 500));
  const view = lookAt([0, 1.6, 0], [0, 1.6, -10], [0, 1, 0]);
  const pv = multiply(proj, view);
  for (const [c, r] of [[[0.5, 1.8, -6], 0.8], [[-2, 1, -4], 1.5], [[3, 2.5, -12], 2], [[0, 1.6, -2.5], 2]]) {
    const rect = sphereNdcRect(pv, c[0], c[1], c[2], r);
    assert.ok(rect, `a sphere ahead at ${c} answers a rectangle`);
    for (let i = 0; i < 300; i++) {
      const u = (i * 0.618) % 1, v = (i * 0.414) % 1, th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
      const p = [c[0] + r * Math.sin(ph) * Math.cos(th), c[1] + r * Math.cos(ph), c[2] + r * Math.sin(ph) * Math.sin(th)];
      const q = project(pv, p);
      if (Math.abs(q[0]) > 1 || Math.abs(q[1]) > 1) continue;   // off screen: the rectangle is held to it
      assert.ok(q[0] >= rect[0] - 1e-6 && q[0] <= rect[2] + 1e-6 && q[1] >= rect[1] - 1e-6 && q[1] <= rect[3] + 1e-6, `a point of the sphere (${q}) outside ${rect}`);
    }
  }
  assert.equal(sphereNdcRect(pv, 0, 1.6, 10, 1), null, 'behind the eye');
  assert.deepEqual(sphereNdcRect(pv, 0, 1.6, -0.5, 1), [-1, -1, 1, 1], 'the eye\'s plane through it: all of the screen');
  assert.equal(sphereNdcRect(pv, 60, 1.6, -5, 1), null, 'wholly off to the side');
  assert.deepEqual(padRect([0, 0, 0.2, 0.2]), [-GLASS_RECT_MARGIN, -GLASS_RECT_MARGIN, 0.2 + GLASS_RECT_MARGIN, 0.2 + GLASS_RECT_MARGIN]);
  assert.deepEqual(padRect([-1, 0.9, 1, 1]), [-1, 0.9 - GLASS_RECT_MARGIN, 1, 1], 'held to the screen');
  assert.equal(padRect(null), null);
  const s = viewTargetSize([-1, -1, 1, 1], 1280, 720);
  assert.deepEqual([s.w, s.h], [1280 * VIEW_SCALE, 720 * VIEW_SCALE], 'the whole screen at the scale');
  assert.equal(s.allocW % VIEW_BUCKET, 0); assert.ok(s.allocW >= s.w && s.allocH >= s.h);
  const q = viewTargetSize([0, 0, 0.1, 0.1], 1280, 720);
  assert.deepEqual([q.w, q.h], [Math.round(0.05 * 1280 * VIEW_SCALE), Math.round(0.05 * 720 * VIEW_SCALE)], 'a pane: a pane\'s pixels');
  assert.equal(viewTargetSize([-1, -1, 1, 1], 8000, 8000).w, VIEW_MAX_SIDE, 'held to the cap');
});

test('RW1 view V3: when the street is drawn - no glass on screen draws nothing (and frees the target once unwanted long enough), glass with the row at Full draws it once and keeps it while the camera is still and young, a move or an age draws it again, Rooms only cuts nothing and paints a hole\'s sky alone (mutants: the still camera redrawn, a move kept, the rooms-only street, the release)', () => {
  const calls = [];
  let rect = null, holes = false;
  const fake = {
    takeGlassRect: () => (rect ? { rect: [...rect], holes } : null),
    outsideViewFrame: (r, proj, view, scene) => { calls.push({ r, proj: [...proj], scene }); return true; },
    releaseOutsideView: () => calls.push('released'),
  };
  const st = createViewOut();
  const proj = mirrorProjectionX(perspective(1, 1.6, 0.05, 500)), view = lookAt([0, 1.6, 0], [0, 1.6, -5], [0, 1, 0]);
  const scene = { draw: () => {} };
  assert.equal(viewOutFrame(st, { renderer: fake, mode: 'full', proj, view, now: 0, scene }), null, 'no glass met: nothing');
  assert.equal(calls.length, 0);
  rect = [-0.2, -0.1, 0.3, 0.4];
  const a = viewOutFrame(st, { renderer: fake, mode: 'full', proj, view, now: 10, scene });
  assert.deepEqual(a, { rect: padRect(rect), view: true });
  assert.equal(calls.length, 1, 'drawn');
  assert.deepEqual(calls[0].r, padRect(rect), 'cropped to the glass grown by the margin');
  assert.equal(calls[0].proj[14], viewOutProjection(proj)[14], 'under the street\'s lens');
  assert.equal(calls[0].scene, scene);
  viewOutFrame(st, { renderer: fake, mode: 'full', proj, view, now: 20, scene });
  assert.equal(calls.length, 1, 'a still camera keeps its picture');
  viewOutFrame(st, { renderer: fake, mode: 'full', proj, view, now: 10 + VIEW_MAX_AGE_MS, scene });
  assert.equal(calls.length, 2, 'aged: the street moves on');
  const moved = lookAt([0.01, 1.6, 0], [0.01, 1.6, -5], [0, 1, 0]);
  viewOutFrame(st, { renderer: fake, mode: 'full', proj, view: moved, now: 20 + VIEW_MAX_AGE_MS, scene });
  assert.equal(calls.length, 3, 'a move draws it again');
  assert.equal(viewOutDue({ drawn: false }, view, rect, 0), true, 'never drawn: due');
  // rooms only: no street; the glass is not cut; a cutout's holes still get their sky
  assert.equal(viewOutFrame(st, { renderer: fake, mode: 'rooms', proj, view, now: 1000, scene }), null, 'glass alone, the street off: the room as it was');
  holes = true;
  assert.deepEqual(viewOutFrame(st, { renderer: fake, mode: 'rooms', proj, view, now: 1001, scene }), { rect: padRect(rect), view: false }, 'holes: their sky');
  assert.equal(calls.at(-1), 'released', 'WAGONS2 (FINAL AUDIT): and the street off, its target let go at once - the holes kept it wanted, a Full target held till the player left');
  assert.deepEqual(viewOutFrame(st, { renderer: fake, mode: 'full', proj, view, now: 1002, scene: null }), { rect: padRect(rect), view: false }, 'a host with no street: the sky');
  assert.equal(calls.filter((c) => c !== 'released').length, 3, 'neither drew the street');
  assert.equal(calls.filter((c) => c === 'released').length, 1, 'and nothing let go twice');
  // unwanted long enough, the target is let go
  viewOutFrame(st, { renderer: fake, mode: 'full', proj, view, now: 1003, scene });
  assert.equal(calls.filter((c) => c !== 'released').length, 4, 'the street back: drawn again');
  rect = null;
  viewOutFrame(st, { renderer: fake, mode: 'full', proj, view, now: 1003 + VIEW_RELEASE_MS + 1, scene });
  assert.equal(calls.at(-1), 'released');
});

test('RW1 view V4: the view out\'s pass is a bracket - it draws into its own target under the cropped lens on the classic set with no shadow recording, the exterior\'s kept light and the host\'s clock over it, no pane clip without a watched frame\'s panes (PANE-CLIP), the hooks run and the skipped mesh left out - and afterwards the frame target, the lights, the fog, the window style, the clear and the camera are as they were (mutants: a restore lost, the skip ignored, the hooks not run)', () => {
  const log = [];
  const r = recordingRenderer(log);
  r.uploadTexture(9, 4, px, { opaque: true });
  const wall = { vao: { id: 'wallvao' }, subMeshes: [{ textureArchive: 9, textureRecord: 4, primitiveCount: 2, startIndex: 0 }] };
  const wagon = { vao: { id: 'wagonvao' }, subMeshes: [{ textureArchive: 9, textureRecord: 4, primitiveCount: 2, startIndex: 0 }] };
  // the street as an exterior frame left it
  r.setLighting(new Float32Array([0.9, 0.9, 0.9]), 0.6, new Float32Array([1, 1, 1]));
  r.setFog('linear', 0, 10, 2400, new Float32Array([0.5, 0.6, 0.7]));
  r.setWindowEmission(windowEmissionRGB('day'));
  r.setPointLights(new Float32Array([1, 2, 3, 18]), new Float32Array([1, 1, 1]));
  r.beginFrame(I, I, new Float32Array([0, 1, 0]));
  r.setWindowRooms('full');
  // the interior's own state before its frame
  const roomAmb = new Float32Array([0.6, 0.55, 0.5]), roomFog = new Float32Array([0, 0, 0]), roomEm = windowEmissionRGB('disabled');
  const roomLights = new Float32Array([0, 2.6, 0, 9]);
  r.setLighting(roomAmb, 0); r.setFog('exp', 0.001, 0, 0, roomFog); r.setWindowEmission(roomEm); r.setPointLights(roomLights, new Float32Array([1, 0.8, 0.6]));
  r.setClearColor([0, 0, 0, 1]);
  const proj = mirrorProjectionX(perspective(1, 1.6, 0.05, 500)), view = lookAt([0, 1.6, 0], [0, 1.6, -5], [0, 1, 0]);
  r.outsideViewSkip.add(wagon);
  const fakeShadows = { recordMesh() {}, reaches: () => false };   // a lane's shadow pass: the pass records nothing into it
  r._shadows = fakeShadows;
  const hooked = [];
  r.outsideViewDraws.add((info) => hooked.push(info.renderer === r));
  let inside = null;
  const laneFbo = { id: 'lanefbo' };   // WAGONS2 (FINAL AUDIT): a lane's frame target standing - the bracket must put THIS back (null was the test's default, so a restore that always bound null passed)
  r._frameFbo = laneFbo; setFrameTarget(laneFbo);
  log.length = 0;
  const ok = r.outsideViewFrame([-0.5, -0.5, 0.5, 0.5], proj, view, {
    setup: (rr) => { rr.setWindowEmission(windowEmissionRGB('night')); return new Float32Array([0, 0.5, 0.86]); },
    draw: (info) => {
      inside = { ambient: [...r._ambient], fogMode: r._fogMode, emission: [...r._windowEmission], lights: [...r._pointLights], shadows: r._shadows, air: r._air, rooms: r._rw.rooms, proj: [...info.proj], light: [...r._lightDir], indirect: r._indirect[3] };
      info.renderer.drawMesh(wall, I);
      info.renderer.drawMesh(wagon, I);
    },
  });
  assert.equal(ok, true, 'a picture made');
  assert.deepEqual(hooked, [true], 'every outsideViewDraws hook ran, once');
  // inside the pass
  assert.deepEqual(inside.ambient.map((v) => Math.round(v * 100) / 100), [0.9, 0.9, 0.9], 'the street\'s kept light');
  assert.equal(inside.fogMode, 1, 'the street\'s fog');
  assert.deepEqual(inside.emission, [...windowEmissionRGB('night')], 'the host\'s clock over the kept style');
  assert.deepEqual(inside.lights, [1, 2, 3, 18], 'the street\'s lanterns, not the room\'s lamp');
  assert.equal(inside.indirect, 0, 'no indirect light from the player indoors');
  assert.deepEqual(inside.light.map((v) => Math.round(v * 100) / 100), [0, 0.5, 0.86], 'the sun where the host\'s clock says');
  assert.equal(inside.shadows, null, 'no shadow recording');
  assert.equal(inside.air, null, 'no air pass');
  assert.equal(inside.rooms, true, 'the neighbours\' windows show their rooms');
  assert.ok(Math.abs(inside.proj[0] - cropProjection(proj, [-0.5, -0.5, 0.5, 0.5])[0]) < 1e-6, 'the cropped lens');
  const t = r._rwTarget;
  const binds = log.filter((c) => c[0] === 'bindFramebuffer');
  assert.equal(binds[0][2], t.fbo, 'its own target bound first');
  assert.equal(binds.at(-1)[2], laneFbo, 'the frame target back after - the lane\'s own');
  assert.equal(frameTarget(), laneFbo); assert.equal(r._frameFbo, laneFbo);
  setFrameTarget(null);
  assert.ok(log.some((c) => c[0] === 'framebufferRenderbuffer' && c[4] === t.rb), 'a depth of its own');
  const draws = log.filter((c) => c[0] === 'bindVertexArray').map((c) => c[1]?.id);
  assert.ok(draws.includes('wallvao') && !draws.includes('wagonvao'), 'the skipped mesh is left out of the pass');
  assert.ok(!uploads(log, 'uPaneOn').some((u) => u[0] === 1), 'no watched frame met glass: no pane clips the street (PANE-CLIP - test/render/fb1012g_paneclip.test.js)');
  // after the pass
  assert.equal(r._ambient, roomAmb, 'the room\'s light back'); assert.equal(r._fogMode, 2, 'its fog');
  assert.equal(r._fogColor, roomFog); assert.equal(r._windowEmission, roomEm, 'its window style');
  assert.deepEqual([...r._pointLights], [...roomLights], 'its lamps');
  assert.deepEqual([...r._clearColor], [0, 0, 0, 1], 'its clear');
  assert.equal(r._rwOutside, null, 'the bracket closed');
  assert.equal(r._shadows, fakeShadows, 'the shadow pass back');
  // outside a pass, the skipped mesh draws as ever
  log.length = 0; r.beginFrame(proj, view, new Float32Array([0, 1, 0])); r.drawMesh(wagon, I);
  assert.ok(log.some((c) => c[0] === 'bindVertexArray' && c[1]?.id === 'wagonvao'), 'the skip is the pass\'s alone');
});

test('RW1 view V5: the interior frame\'s glass - setGlassView paints the background inside the rectangle (the street, or the sky alone), cuts the glass only with the street in it, and measures the frame\'s glass and holes for the next view out, which takeGlassRect hands over once (mutants: the cut without the street, the watch lost, the rectangle not forgotten, the background outside the rectangle)', () => {
  const log = [];
  const r = recordingRenderer(log);
  r.uploadTexture(9, 3, px, { opaque: true }); r.uploadEmissionTexture(9, 3, px, { window: true });   // DFU's window, drawn indoors
  r.uploadTexture(9, 5, px); r.uploadGlassMask(9, 5, px);                                           // an interior's declared glass
  r.uploadTexture(9, 6, px, { cutout: true });                                                       // a cutout
  r.uploadTexture(9, 4, px, { opaque: true });                                                       // a wall
  const sub = (rec, start, b) => ({ textureArchive: 9, textureRecord: rec, primitiveCount: 2, startIndex: start, _bounds: new Float32Array(b) });
  const room = { vao: {}, subMeshes: [sub(3, 0, [0, 1.5, -4, 0.5]), sub(5, 6, [1, 1.5, -4, 0.5]), sub(6, 12, [-1, 1.5, -4, 0.5]), sub(4, 18, [0, 1.5, -6, 3])] };
  const proj = mirrorProjectionX(perspective(1, 1.6, 0.05, 500)), view = lookAt([0, 1.5, 0], [0, 1.5, -5], [0, 1, 0]);
  // frame 1: nothing seen yet, nothing painted, the glass measured
  r.beginFrame(proj, view, new Float32Array([0, 1, 0]));
  log.length = 0;
  r.setGlassView(null);
  assert.equal(log.filter((c) => c[0] === 'drawArrays').length, 0, 'no glass known: no background');
  r.drawMesh(room, I);
  assert.deepEqual(uploads(log, 'uWinMode'), [[0], [2], [0]], 'the window plain (no view out yet), the declared glass glass (no style), the rest plain');
  assert.deepEqual(uploads(log, 'uCutout'), [[0], [1], [0]], 'the cutout picture cut, alone');
  const seen = r.takeGlassRect();
  assert.ok(seen && seen.holes, 'the glass met, and a hole among it');
  const pv = multiply(proj, view);
  for (const [x, y, z] of [[0, 1.5, -4], [1, 1.5, -4], [-1, 1.5, -4]]) {
    const q = project(pv, [x, y, z]);
    assert.ok(q[0] >= seen.rect[0] && q[0] <= seen.rect[2] && q[1] >= seen.rect[1] && q[1] <= seen.rect[3], `the pane at ${x} inside the rectangle`);
  }
  const wallQ = project(pv, [0, 4.4, -6]);
  assert.ok(wallQ[1] > seen.rect[3], 'the wall (no glass) is not measured');
  assert.equal(r.takeGlassRect(), null, 'handed over once');
  // frame 2: the street in it - the background over the rectangle, the glass cut inside it
  r.beginFrame(proj, view, new Float32Array([0, 1, 0]));
  r._rwEnsureTarget(64, 64);   // a view out already drawn
  log.length = 0;
  r.setGlassView({ rect: [-0.5, -0.25, 0.5, 0.75], view: true });
  const bg = log.findIndex((c) => c[0] === 'drawArrays' && c[1] === 'TRIANGLE_STRIP' && c[3] === 4);
  assert.ok(bg >= 0, 'the background, one strip');
  assert.deepEqual(uploads(log, 'uRect')[0], [-0.5, -0.25, 0.5, 0.75], 'inside the rectangle alone');
  assert.deepEqual(uploads(log, 'uHasView')[0], [1], 'the street in it');
  log.length = 0;
  r.drawMesh(room, I);
  assert.deepEqual(uploads(log, 'uWinMode'), [[3], [0]], 'both glasses cut, the rest plain');
  assert.deepEqual([...uploads(log, 'uGlassRect')[0][0]], [160, 150, 480, 350], 'the rectangle in the frame\'s pixels');
  // frame 3: only the sky (holes with the street off) - the glass is NOT cut
  r.beginFrame(proj, view, new Float32Array([0, 1, 0]));
  log.length = 0;
  r.setGlassView({ rect: [-0.5, -0.25, 0.5, 0.75], view: false });
  assert.deepEqual(uploads(log, 'uHasView')[0], [0], 'the sky alone');
  log.length = 0; r.drawMesh(room, I);
  assert.deepEqual(uploads(log, 'uWinMode'), [[2], [0]], 'the window plain, the declared glass glass - nothing cut');
  // a dungeon frame (no setGlassView): nothing watched
  r.takeGlassRect(); r.beginFrame(proj, view, new Float32Array([0, 1, 0]));
  r.drawMesh(room, I);
  assert.equal(r.takeGlassRect(), null, 'a frame that never armed the watch measures nothing');
});

test('RW1 view V6: the glass door a non-ARENA2 room declares - uploadGlassMask rides the emission unit as glass (never an emission, never a window style), refuses a record with an emission map of its own, and is freed by the emission eviction its `e:` key names (mutants: the glass kept as an emission, the refusal lost, the eviction leaking)', () => {
  const log = [];
  const r = recordingRenderer(log);
  r.uploadTexture(7, 1, px);
  const tex = r.uploadGlassMask(7, 1, px);
  assert.ok(tex, 'declared');
  assert.equal(r.glassMasks.get('7_1'), tex);
  assert.equal(r.emissionTextures.has('7_1'), false, 'not an emission map');
  assert.equal(r.windowMasks.has('7_1'), false, 'not DFU\'s window');
  assert.equal(r.uploadGlassMask(7, 1, px), tex, 'the same key, the same mask');
  r.uploadEmissionTexture(7, 2, px, { window: true });
  assert.equal(r.uploadGlassMask(7, 2, px), null, 'a window of DFU\'s table is glass already');
  assert.ok(r.emissionTextures.has('7_2'), 'and keeps its emission');
  const mesh = { vao: {}, subMeshes: [{ textureArchive: 7, textureRecord: 1, primitiveCount: 2, startIndex: 0 }] };
  r.beginFrame(I, I, new Float32Array([0, 1, 0])); r.setWindowRooms('full'); r.setWindowEmission(windowEmissionRGB('night'));
  log.length = 0; r.drawMesh(mesh, I);
  assert.deepEqual(uploads(log, 'uWinMode'), [[2], [0]], 'from a street frame: glass, no room, no glow');
  assert.equal(mesh.subMeshes[0]._evEmis, tex, 'the mask on the emission unit');
  assert.equal(r.evictEmissionTexture('7_1'), true, 'freed by its e: key');
  assert.equal(r.glassMasks.has('7_1'), false);
  assert.ok(log.some((c) => c[0] === 'deleteTexture' && c[1] === tex));
  const m = glassMaskFromAlpha({ width: 2, height: 1, colors: new Uint8ClampedArray([9, 9, 9, 0, 9, 9, 9, 255]) });
  assert.deepEqual([...m.colors], [255, 255, 255, 255, 0, 0, 0, 0], 'a cutout\'s holes as a mask');
  assert.equal(glassTexelCount(m), 1);
});

test('RW1 view V8 (GLASS-ALL): which interior texels are glass - a building set\'s window wall (record 2, its twin record 1; the castles apart) in a climate an interior is laid out in, its new art against the twin in the glass ramp, the panes kept and the lead, the frame, the wall\'s speckle, a half-repainted wall and a stray blob left; the pipeline asks it after the emissive arm, of a pack\'s picture too (mutants: windows1.json GLASS-ALL-*)', () => {
  // a synthetic window wall, rows top-down as getDFBitmap gives them: a wall of 50, a frame of 75, a 20 x 20 pane of
  // the ramp's 104 with a lead line of 120 every fifth texel, speckle of 104 on the wall, a 2 x 2 blob of 104 in new art
  const W = 64, H = 128;
  const twin = { width: W, height: H, data: new Uint8Array(W * H).fill(50) };
  const win = { width: W, height: H, data: twin.data.slice() };
  const put = (x, y, v) => { win.data[y * W + x] = v; };
  for (let y = 37; y < 63; y++) for (let x = 17; x < 43; x++) put(x, y, 75);
  for (let y = 40; y < 60; y++) for (let x = 20; x < 40; x++) put(x, y, x % 5 === 0 || y % 5 === 0 ? 120 : 104);
  for (const [x, y] of [[5, 5], [60, 10], [5, 100], [50, 120]]) put(x, y, 104);
  for (let y = 90; y < 99; y++) for (let x = 2; x < 11; x++) put(x, y, 75);
  for (const [x, y] of [[5, 93], [6, 93], [5, 94], [6, 94]]) put(x, y, 104);
  for (let y = 100; y < 114; y++) for (let x = 44; x < 58; x++) if ((x + y) % 2 === 0) put(x, y, 104);   // a wall repainted in the ramp, half its texels new (428's panels)
  const of = (r) => (r === 1 ? twin : r === 0 ? twin : null);
  const at = (m, x, y) => m.colors[((H - 1 - y) * W + x) * 4] > 127;   // the mask's rows are bottom-up, getWindowColors32's
  const m = interiorGlassMask(316, 2, win, of);
  assert.equal(glassTexelCount(m), 16 * 16, 'the pane\'s sixteen cells of sixteen, and nothing else');
  assert.ok(at(m, 21, 41) && at(m, 39, 59), 'a cell\'s texels are glass');
  assert.ok(!at(m, 25, 41) && !at(m, 21, 45), 'the lead stays');
  assert.ok(!at(m, 18, 38), 'the frame stays');
  assert.ok(!at(m, 5, 5) && !at(m, 60, 10), 'the wall\'s speckle stays - the art is not dense about it');
  assert.ok(!at(m, 5, 93), 'a stray blob stays - a window holds more glass');
  assert.ok(!at(m, 44, 100) && !at(m, 50, 106), 'a wall half repainted stays - the new art is not dense');
  assert.equal(interiorGlassMask(316, 2, win, () => null), null, 'no twin: no new art to read');
  assert.equal(interiorGlassMask(316, 2, twin, of), null, 'the wall as its twin: no window in it');
  const ff = { width: W, height: H, data: twin.data.slice() };
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) ff.data[y * W + x] = GLASS_INDEX;
  assert.equal(glassTexelCount(interiorGlassMask(363, 2, ff, of)), 100, 'the glass index is glass where it stands - the temple\'s stained glass');
  const grey = { width: W, height: H, data: win.data.map((v) => (v === 104 ? 121 : v)) };
  assert.equal(interiorGlassMask(316, 2, grey, of), null, 'a pane off the ramp is not glass');
  assert.equal(interiorGlassMask(316, 1, win, of), null, 'the twin wall is no window');
  assert.equal(interiorGlassMask(322, 2, win, of), null, 'a dungeon set');
  assert.equal(interiorGlassMask(237, 2, win, of), null, 'TEXTURE.237 is the paperdoll\'s clothing, not a 2xx interior');
  assert.equal(interiorGlassMask(11, 2, win, of), null, 'the desert castle has no window');
  assert.ok(interiorGlassMask(111, 1, win, (r) => (r === 0 ? twin : null)), 'the mountain castle\'s window is record 1 against record 0');
  assert.deepEqual([interiorWindowOf(16), interiorWindowOf(416), interiorWindowOf(11), interiorWindowOf(111)], [INTERIOR_WINDOW, INTERIOR_WINDOW, null, { record: 1, twin: 0 }]);
  assert.deepEqual(INTERIOR_WINDOW, { record: 2, twin: 1 });
  assert.deepEqual(GLASS_RAMP, [96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 86, 216, 222, 223]);
  for (const a of [16, 116, 316, 416, 44, 60, 63, 66, 11, 28, 37, 40]) assert.ok(isInteriorGlassArchive(a), `${a}: a building's interior`);
  for (const a of [19, 22, 23, 24, 25, 45, 47, 48, 68, 41, 12, 14, 9, 504, 1210, -16, 216, 237, 240]) assert.equal(isInteriorGlassArchive(a), false, `${a}: no building's window wall in it`);
});

test('GLASS-ALL (ARENA2): every building set\'s window wall in the four climates an interior is laid out in has its glass found - the desert castle none, the paperdoll\'s TEXTURE.237 none (skipped without ARENA2_PATH)', (t) => {
  const A = process.env.ARENA2_PATH;
  if (!A || !existsSync(join(A, 'TEXTURE.016'))) return t.skip('ARENA2_PATH not set');
  const found = {};
  for (const base of [0, 100, 300, 400]) for (const set of [11, 16, 28, 37, 40, 44, 60, 63, 66]) {
    const a = base + set, name = `TEXTURE.${String(a).padStart(3, '0')}`;
    const tf = new TextureFile();
    assert.ok(tf.load(new Uint8Array(readFileSync(join(A, name))), name), name);
    for (let r = 0; r < tf.recordCount; r++) {
      const g = interiorGlassMask(a, r, tf.getDFBitmap(r, 0), (q) => (q < tf.recordCount ? tf.getDFBitmap(q, 0) : null));
      if (g) found[`${a}#${r}`] = glassTexelCount(g);
    }
  }
  assert.deepEqual(found, {
    '16#2': 676, '28#2': 245, '37#2': 912, '40#2': 676, '44#2': 676, '60#2': 1530, '63#2': 739, '66#2': 337,
    '111#1': 1089, '116#2': 901, '128#2': 414, '137#2': 683, '140#2': 393, '144#2': 901, '160#2': 1634, '163#2': 402, '166#2': 774,
    '311#2': 1387, '316#2': 638, '328#2': 643, '337#2': 680, '340#2': 699, '344#2': 699, '360#2': 1419, '363#2': 740, '366#2': 682,
    '411#2': 1042, '416#2': 748, '428#2': 663, '437#2': 680, '440#2': 2025, '444#2': 690, '460#2': 1041, '463#2': 300, '466#2': 710,
  });
  const clothes = new TextureFile();
  clothes.load(new Uint8Array(readFileSync(join(A, 'TEXTURE.237'))), 'TEXTURE.237');
  for (let r = 0; r < clothes.recordCount; r++) assert.equal(interiorGlassMask(237, r, clothes.getDFBitmap(r, 0), (q) => clothes.getDFBitmap(q, 0)), null, `237#${r}`);
});

test('RW1 view V9: the interior\'s merge keeps a sphere a model per sub-mesh, so a window measured on the screen is its own model\'s and not the room\'s, and a pixel\'s merge keeps none (mutants: the pieces off, a piece\'s sphere wrong)', () => {
  const quad = (x) => ({ positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]), normals: new Float32Array(12), uvs: new Float32Array(8), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), subMeshes: [{ textureArchive: 9, textureRecord: 3, startIndex: 0, primitiveCount: 2 }] });
  const key = (a, r) => `${a}_${r}`;
  const sb = new StaticBatchBuilder({ pieces: true });
  sb.add(quad(0), I, key); sb.add(quad(10), I, key);
  const m = sb.finish();
  assert.equal(m.subMeshes.length, 1, 'one sub-mesh for the one picture');
  const p = m.subMeshes[0].pieces;
  assert.equal(p.length, 8, 'two models, two spheres');
  assert.ok(Math.abs(p[0] - 0.5) < 1e-6 && Math.abs(p[4] - 10.5) < 1e-6, 'each at its own model');
  assert.ok(p[3] < 1 && p[7] < 1, 'each a model\'s size, not the batch\'s');
  const plain = new StaticBatchBuilder(); plain.add(quad(0), I, key);
  assert.equal(plain.finish().subMeshes[0].pieces, undefined, 'a pixel\'s merge measures none');
});

test('RW1 view V10: THE FOUR HOSTS, the interior arm - the view out is asked once the room\'s light and air are set (its bracket puts them back), before the room\'s lamps and its beginFrame, and painted right after that beginFrame, never in the dungeon arm; world.js and exterior.js hand a street with the player\'s building in it (PANE-CLIP: the renderer leaves out the room\'s side of the glass); dungeonContext.js draws no view out (FLAGGED there: a dungeon has no window to the street) (mutants: the order swapped, a host without its street, the dungeon arm painting)', () => {
  for (const host of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const s = rd(host);
    assert.match(s, /const outsideView = \(\) => \(\{\n\s+setup: \(r\) => \{/, `${host}: the street, and no box - FIELD BUGS 2026-10-12g PANE-CLIP (it left out the building's own other wing and a neighbour's wall against it)`);
    assert.doesNotMatch(s, /outsideViewClip|VIEW_CLIP_PAD/, `${host}: the building's box is gone`);
    assert.match(s, /return sunDirection\(clockMinute\);/, `${host}: the clock's sun`);
  }
  // the background's ray and sky are the camera's own
  const proj = mirrorProjectionX(perspective(1, 1.6, 0.05, 500)), view = lookAt([0, 1, 0], [0, 1, -5], [0, 1, 0]);
  const rays = viewRays(proj, view);
  assert.deepEqual(rays.z.map((v) => Math.round(v * 1e6) / 1e6 + 0), [0, 0, -1], 'the centre of the screen looks where the camera does');
  const sky = viewSkyFrom([0.5, 0.6, 0.7]);
  assert.deepEqual(sky.horizon, [0.5, 0.6, 0.7], 'the horizon is the fog the street fades into');
});

test('RW1 view V11: an interior\'s declared glass never blooms - the Enhanced Lighting air pass\'s emission replay draws DFU\'s window mask and leaves the glass mask that rides the same unit (mutants: the glass replayed as an emission)', async () => {
  const { AirPass } = await import('../../src/render/airPass.js');
  const calls = [];
  const gl = new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.toUpperCase() === k ? k : (...args) => calls.push([k, ...args])) });
  const fake = { gl, programs: { emitMesh: { p: {}, uProj: 'uProj', uView: 'uView', uModel: 'uModel', uEmissionTex: 'uEmissionTex', uEmissionColor: 'uEmissionColor' } }, targets: {}, _planes: new Float32Array(24), _identityView: I, _emitDepth() {}, _white: [1, 1, 1], stats: { emitDraws: 0 } };
  const mesh = { vao: {}, subMeshes: [
    { _evEmis: 'window-mask', _evWin: 1, primitiveCount: 2, startIndex: 0 },
    { _evEmis: 'glass-mask', _evWin: 2, primitiveCount: 2, startIndex: 6 },
  ] };
  const sp = { count: 1, records: [{ kind: 0, mesh, matrix: I, bounded: false }] };
  AirPass.prototype._replayEmission.call(fake, { blackTex: 'black', windowEmission: [0.8, 0.57, 0.18], bindVao() {} }, sp, I, null);
  const bound = calls.filter((c) => c[0] === 'bindTexture').map((c) => c[2]);
  assert.deepEqual(bound, ['window-mask'], 'the window blooms, the glass does not');
  assert.equal(fake.stats.emitDraws, 1);
});

test('RW1 x WAGONS2 (FINAL AUDIT) THE VIEW OUT AT THE WORLD\'S OWN SIZE: the view out is sized by the pixels the world is drawn at - the retro or render-scale image, a docked HUD\'s shrunk rect - never by the canvas (a retro 320 x 200 world on a 1080p canvas drew one pane at up to 960 x 540, more than the whole frame) (mutant: the canvas\'s size)', () => {
  const r = recordingRenderer([]);
  r.setWindowRooms('full');
  const full = [-1, -1, 1, 1];
  r.outsideViewFrame(full, I, I, { draw() {} });
  assert.deepEqual([r._rwTarget.w, r._rwTarget.h], [320, 200], 'the canvas\'s 640 x 400, at VIEW_SCALE');
  r.releaseOutsideView();
  r._retroFrame = { kind: 'retro', width: 320, height: 200 };
  r.outsideViewFrame(full, I, I, { draw() {} });
  assert.deepEqual([r._rwTarget.w, r._rwTarget.h], [160, 100], 'the retro image\'s 320 x 200, at VIEW_SCALE');
  r.releaseOutsideView();
  r._retroFrame = null;
  r._worldViewportFrame = { x: 0, y: 0.25, w: 1, h: 0.75 };
  r.outsideViewFrame(full, I, I, { draw() {} });
  assert.deepEqual([r._rwTarget.w, r._rwTarget.h], [320, 150], 'a docked HUD\'s rect: the world\'s three quarters');
});
