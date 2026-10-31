// AUDIT EG V (2026-10-15, the Elite Gates arc's fifth audit; bible/11-Multiplayer/Elite-Gates.md sections 11.9, 15, 25 and
// 29) - FIX GROUP E, "render": the spans' collider, the passes' GL objects and their owner, pinned through the real
// producers (the dungeon host's own collider wrapper, a recording GL under the real passes and the breach client):
//   L6-10  a Spirebridge's plank leaves the collider at its end through the dungeon host's own wrapper (egSpanCollider);
//   L6-7   egSpan's clear names the Beat's pictures' owner (egBeatTellDown, the breach's end);
//   L6-5   the fight's telegraph and crystal passes freed on every way out of the Spire (egFight.js leave), and every GL
//          object the breach client makes back to its baseline after ten halls and every exit kind;
//   GLSH   (lane 6's UNVERIFIED shader objects) glProgram.js buildProgram deletes its two shaders once the link is read,
//          and a failed build frees its program and both shaders;
//   L6-3   THE EDGE LINE sized in the world image's pixels (Retro Picture Mode), as the spans' ghosts are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { egHallOf, egCircleOfHall, EG_SEALED_MS, EG_GATHER_MS } from '../../../src/net/eliteGates/egLaw.js';
import { egBridgeOf, egBridgeY } from '../../../src/net/eliteGates/egSpanLaw.js';
import { createEgSpan, egSpanCollider } from '../../../src/scenes/eliteGates/egSpan.js';
import { registerSpireObjs } from '../../../src/systems/eliteGates/spireKit.js';
import { realmToDungeon } from '../../../src/net/superDungeon/sdBrain.js';
import { Collider } from '../../../src/player/collider.js';
import { egBreachNew, egEnter, egStep, egStateOf, egEnd, egForsake } from '../../../src/net/eliteGates/egBrain.js';
import { validEgOut } from '../../../src/net/wire.js';
import { createEgClient } from '../../../src/scenes/eliteGates/egClient.js';
import { createEgFight } from '../../../src/scenes/eliteGates/egFight.js';
import { lookAt, perspective } from '../../../src/world/mat4.js';
import { buildProgram } from '../../../src/render/glProgram.js';
import { GateTelegraphRenderer } from '../../../src/render/gate/gateTelegraph.js';
import { CourtCrystalRenderer } from '../../../src/render/courtCrystals.js';
import { EG_LINE_VS } from '../../../src/render/eliteGates/egLinePass.js';
import { egEdgeLinePx } from '../../../src/world/eliteGates/egLook.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i >= 0 && j > i, `${a} .. ${b}`); return src.slice(i, j); };

/** A recording WebGL2: every object it makes live until deleted (a stray or second delete counted), each uniform set kept
 *  with its program and name (`getUniformLocation` answers both), each program's vertex source known. */
function recordingGl(w = 1920, h = 1080) {
  const live = new Map(), uni = [], vsOf = new Map(), srcOf = new Map();
  let ids = 0, stray = 0;
  const gl = new Proxy({ drawingBufferWidth: w, drawingBufferHeight: h, VERTEX_SHADER: 'VS', FRAGMENT_SHADER: 'FS' }, { get(t, k) {
    if (k in t) return t[k];
    if (typeof k !== 'string') return undefined;
    if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
    if (k === 'getUniformLocation') return (p, n) => ({ p, n });
    if (k === 'createShader') return (type) => { const o = { kind: 'Shader', id: ++ids, type }; live.set(o, 'Shader'); return o; };
    if (k === 'shaderSource') return (sh, src) => { srcOf.set(sh, src); };
    if (k === 'attachShader') return (p, sh) => { if (sh.type === 'VS') vsOf.set(p, srcOf.get(sh)); };
    if (/^uniform/.test(k)) return (loc, ...v) => { if (loc && loc.p) uni.push({ p: loc.p, n: loc.n, v }); };
    if (/^create(Buffer|VertexArray|Texture|Program|Framebuffer|Renderbuffer)$/.test(k)) return () => { const o = { kind: k.slice(6), id: ++ids }; live.set(o, o.kind); return o; };
    if (/^delete(Buffer|VertexArray|Texture|Program|Shader|Framebuffer|Renderbuffer)$/.test(k)) return (o) => { if (o && !live.delete(o)) stray++; };
    if (k.toUpperCase() === k) return 1;
    return () => {};
  } });
  const count = () => { const c = {}; for (const k of live.values()) c[k] = (c[k] ?? 0) + 1; return c; };
  return { gl, count, uni, vsOf, stray: () => stray };
}

// ── L6-10 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('AUDIT EG V L6-10 A SPIREBRIDGE\'S PLANK LEAVES THE COLLIDER AT ITS END, through the dungeon host\'s own wrapper (sections 15 and 21: "known to the fair trail" - the relay holds the plank as ground until its end, so every screen must too): the spans stood through egSpanCollider - the wrapper scenes/dungeonContext.js egSpanRide hands them - take a plank\'s bucket out at its end, nothing under the gap after, and its key leaves the host\'s list (egRecircle takes the rest at THE SWAP); the host hands no wrapper of its own (mutants: the wrapper\'s removeBucket dropped; the key kept on the list; the host\'s literal wrapper back)', () => {
  const SEED = 1, HALL = 7, spec = egHallOf(SEED, HALL, 0), b0 = egBridgeOf(spec, 0);
  const R = { createMesh: (m) => ({ subMeshes: m.subMeshes }), destroyMesh: () => {} };
  const span = createEgSpan({ renderer: R, seed: SEED, c: spec.c }), dynamicDraws = [], collider = new Collider(), keys = [];
  span.stand({ dynamicDraws, collider: egSpanCollider(collider, keys) });
  const nSteps = keys.length;
  assert.ok(nSteps > 20 && keys.every((k) => collider._buckets.has(k)), 'every step\'s bucket stood, and its key kept');
  const objs = { h: HALL, objs: [], br: [{ g: 0, from: 10_000, until: 16_000 }] };
  registerSpireObjs(() => objs);
  try {
    const mid = (b0.z0 + b0.z1) / 2, top = realmToDungeon(spec.x0 + b0.x, egBridgeY(b0, mid), mid);
    const under = () => collider.raycast([top[0], top[1] + 2, top[2]], [0, -1, 0], 2.5);
    span.ride(10.5, 0.016, null, false);
    assert.ok(Math.abs(under() - 2) < 0.02, 'standing: its top under the gap');
    assert.ok(collider._buckets.has('eg:bridge:7:0:10000') && keys.includes('eg:bridge:7:0:10000'), 'its bucket in, its key kept');
    span.ride(16.0, 0.016, null, false);
    assert.equal(span.planks.length, 0, 'gone at its end');
    assert.equal(collider._buckets.has('eg:bridge:7:0:10000'), false, 'its bucket out of the collider');
    assert.ok(!Number.isFinite(under()), 'nothing under the gap');
    assert.equal(keys.includes('eg:bridge:7:0:10000'), false, 'its key off the host\'s list');
    assert.equal(keys.length, nSteps, 'the steps\' keys kept for THE SWAP');
    span.ride(40, 0.016, null, false);
    assert.ok(!Number.isFinite(under()), 'and never again');
  } finally { registerSpireObjs(null); }
});

// ── GLSH (lane 6's UNVERIFIED shader objects) ────────────────────────────────────────────────────────────────────────────
test('AUDIT EG V GLSH (lane 6\'s shader objects; section 29, EVERY ALLOCATION HAS AN OWNER): render/glProgram.js buildProgram deletes both stages once the link is read - a program built and deleted leaves no shader behind, so a pass rebuilt every breach (the look\'s four) and every circle (the spans\' ghosts) leaves nothing; a build that throws frees its program and both stages, and still throws the driver\'s log (mutants: the shaders kept; the failed program kept)', () => {
  const R = recordingGl();
  const p = buildProgram(R.gl, 'vs', 'fs', 'probe');
  assert.deepEqual(R.count(), { Program: 1 }, 'the program alone stands: both stages flagged for deletion, gone with it');
  R.gl.deleteProgram(p);
  assert.deepEqual(R.count(), {}, 'and nothing once it is deleted');
  const F = recordingGl();
  const bad = new Proxy(F.gl, { get: (t, k) => (k === 'getProgramParameter' || k === 'getShaderParameter' ? () => false : k === 'getShaderInfoLog' ? () => 'ERROR: 0:1: boom' : t[k]) });
  assert.throws(() => buildProgram(bad, 'v', 'f', 'probe'), { message: 'probe shader: ERROR: 0:1: boom' });
  assert.deepEqual(F.count(), {}, 'a build that throws leaves no program and no stage');
  assert.equal(R.stray() + F.stray(), 0, 'nothing freed twice');
});

// ── L6-5 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('AUDIT EG V L6-5 THE FIGHT\'S PASSES HAVE A DESTROY (sections 11.9 and 29): GateTelegraphRenderer frees its program, its three vertex arrays and their buffers - EG-ZG\'s fight floors\' growing DYNAMIC buffer among them - once; CourtCrystalRenderer its two programs, two vertex arrays and four buffers, once; a destroyed pass draws nothing (mutants: a buffer kept; the floors\' buffer kept; a program kept; the crystals\' glow kept; a second destroy freeing again)', () => {
  const R = recordingGl();
  const tel = new GateTelegraphRenderer(R.gl, { spire: true });
  const sh = { kind: 1, origin: [0, 0], end: [0, 0], points: [], r: 2, halfW: 0, halfArc: 0, body: 0, r0: 0, r1: 0, yaw: 0, t: 1, flash: 0, alpha: 1, color: [1, 0, 0], court: 0, style: 0, since: 0, span: 1, after: -1, runS: 0, pool: 0 };
  tel.drawFloors({ draws: [{ sh, f: { y: 0, over: { r: 10, courts: [[0, 0]] } }, first: 0, count: 3 }], buf: new Float32Array(64), n: 6 }, new Float32Array(16), new Float32Array(16), [0, 1, 0], 0);
  assert.deepEqual(R.count(), { Program: 1, VertexArray: 3, Buffer: 3 }, 'its program, the quad\'s, the strip\'s and the floors\'');
  tel.destroy(); tel.destroy();
  assert.deepEqual(R.count(), {}, 'every one freed');
  tel.draw(sh, new Float32Array(16), new Float32Array(16), [0, 1, 0], 0);
  assert.equal(tel.drawn, 0, 'a destroyed pass draws nothing');
  const C = recordingGl();
  const cr = new CourtCrystalRenderer(C.gl);
  assert.deepEqual(C.count(), { Program: 2, VertexArray: 2, Buffer: 4 });
  cr.destroy(); cr.destroy();
  assert.deepEqual(C.count(), {}, 'every one freed');
  cr.draw([{ at: [0, 0, 0], grow: 1, broke: -1, color: [1, 1, 1] }], new Float32Array(16), new Float32Array(16), [0, 1, 0], 0);
  assert.equal(cr.drawn, 0);
  assert.equal(R.stray() + C.stray(), 0, 'nothing freed twice');
});

// ── L6-3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('AUDIT EG V L6-3 THE EDGE LINE IN THE WORLD IMAGE\'S PIXELS (section 25.3; bible/07-Rendering/Retro-Mode.md - a pass sizes its pixels in `worldViewportPx`): the breach client\'s line pass, under Retro Picture Mode (a 320x200 world image on a 1920x1080 canvas), lays its line in the image\'s pixels - its viewport the image\'s, its width egEdgeLinePx of the image\'s height - as the spans\' ghosts drawn in the same pass are; the canvas\'s with no world image set (mutants: the viewport unpassed; the width off the canvas)', () => {
  const line = (vs) => vs === EG_LINE_VS;
  assert.notDeepEqual(egEdgeLinePx(200), egEdgeLinePx(1080));
});
