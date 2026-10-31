// WATER-D1 - THE DUNGEON WATER WAS DRAWN AFTER THE FRAME HAD BEEN RESOLVED
// (2026-09-21, LostMyLeg on Discord: "Everytime you go into a dungeon you
// can see 2 Watertiles/textures floating around ... the console says 2
// Water in every dungeon"; Mac's AIWATER report before it: "shown well
// below the floor, in patches, reading like a no-clip glitch").
//
// THE LEVEL WAS NEVER WRONG. `-8 * soundIndex` off the first start marker,
// `10000` for none, a plane the size of the block at `-level * GlobalScale`
// - that is DaggerfallDungeon.FindMarkers + Billboard.SetRDBResourceData +
// RDBLayout.AddWater, verbatim, and R7's corpus pins have held it since
// August. THE ORDER WAS. Both dungeon hosts called renderer.drawWater AFTER
// dungeonContext.drawFoes returned, and drawFoes ends with the weapon
// overlay and the HUD - screen quads. On the enhanced-lighting lane a
// screen quad is where the world pass ENDS and the frame target is
// RESOLVED to the canvas (drawScreenQuad -> _compositeAir, EL3/EL4): the
// lane's framebuffer is unbound and `_frameFbo` is null. A water quad
// drawn after that lands on the DEFAULT framebuffer, whose depth buffer
// holds no world (the frame's depth went into the lane's target), so it
// passed the depth test everywhere: a plane through every wall and floor.
// On the classic set there is no lane and no resolve, the default depth
// buffer IS the world's, and the same order was right - which is why the
// plane was correct for months and wrong from EL3 (2026-09-17) on, in
// exactly the dungeons that HAVE water, which are the ones that logged
// "N water".
//
// The draw is a world draw, so it lives INSIDE drawFoes now, after the
// last world billboard and before the first screen quad - the one frame
// function both hosts call - and the hosts name the water tile's archive
// once, at the build. Pinned three ways: the renderer's own contract (a
// world draw after the first screen quad lands on the canvas - the
// mechanism the defect rode), the ORDER inside drawFoes (derived: EVERY
// world draw in that body precedes the overlay), and the two hosts (no
// draw of their own, the archive named at the build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import { perspective, mirrorProjectionX } from '../../src/world/mat4.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** test/render/el3_air.test.js's recording GL: every call logged, every handle a fresh object. */
function recordingGl() {
  const calls = [];
  let ids = 0;
  const consts = { TEXTURE_CUBE_MAP_POSITIVE_X: 100, TEXTURE0: 1000, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, FRAMEBUFFER: 7, TRIANGLE_STRIP: 5, TRIANGLES: 4, drawingBufferWidth: 320, drawingBufferHeight: 200, ONE: 1, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771 };
  const gl = new Proxy({}, {
    get(_, k) {
      if (k in consts) return consts[k];
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, n) => n;
      if (k === 'getAttribLocation') return () => 0;
      if (k === 'createShader' || k === 'createProgram' || k === 'createBuffer' || k === 'createVertexArray'
        || k === 'createTexture' || k === 'createFramebuffer' || k === 'createRenderbuffer') return () => ({ id: ++ids });
      if (k === 'getParameter') return () => new Float32Array(4);
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;
      return (...args) => { calls.push([k, ...args.map((a) => (ArrayBuffer.isView(a) ? Float32Array.from(a) : a))]); };
    },
  });
  const canvas = { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 };
  return { gl, calls, canvas };
}

/** The framebuffer bound when calls[i] ran: the last bindFramebuffer before it (undefined = never bound = the canvas). */
function boundAt(calls, i) {
  for (let k = i - 1; k >= 0; k--) if (calls[k][0] === 'bindFramebuffer') return calls[k][2];
  return null;
}
/** The index of the one draw a bracket of calls made. */
function theDraw(calls, from, to) {
  const draws = [];
  for (let i = from; i < to; i++) if (calls[i][0] === 'drawArrays' || calls[i][0] === 'drawElements') draws.push(i);
  assert.equal(draws.length, 1, 'one draw in the bracket');
  return draws[0];
}

test('WATER-D1: the mechanism - on the lane, a world draw before the first screen quad lands in the frame target; the same draw after it lands on the canvas', () => {
  const { calls, canvas } = recordingGl();
  const r = new Renderer(canvas);
  r.setLightingLane(EL_LANE);
  r.setAir(true);
  assert.ok(r.air, 'the air pass is up: a frame target exists to resolve');
  const P = mirrorProjectionX(perspective(1, 1.6, 0.5, 6000));
  r.beginFrame(P, I, new Float32Array([0.45, 0.8, 0.35]), WORLD_FRAME);
  const frame = r._frameFbo;
  assert.ok(frame, 'a world frame on the lane draws into the frame target');
  const quads = [{ x: 0, z: 0, size: 51.2, y: 1 }];
  const tex = { id: 'water' };

  // BEFORE the first screen quad: the water goes where the walls went.
  const a0 = calls.length;
  r.drawWater(quads, [1, 1, 1, 0.82], tex, 0);
  const a1 = calls.length;
  assert.equal(boundAt(calls, theDraw(calls, a0, a1)), frame, 'drawn into the frame target - depth-tested against the world');

  // The first screen quad (the weapon overlay, the HUD) RESOLVES the frame.
  r.drawScreenQuad(tex, { x: 0, y: 0, w: 10, h: 10 });
  assert.equal(r._frameFbo, null, 'the resolve: the frame target is gone for the rest of this frame');

  // AFTER it: the same call lands on the canvas, whose depth buffer holds no world.
  const b0 = calls.length;
  r.drawWater(quads, [1, 1, 1, 0.82], tex, 0);
  const b1 = calls.length;
  assert.equal(boundAt(calls, theDraw(calls, b0, b1)), null, 'drawn on the canvas - the plane would show through every wall');
});

