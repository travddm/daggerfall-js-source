// AUDIT PRE-MERGE 0928 (2026-09-28, the Sea Update read before it merges) - lens R, what the branch draws, on both
// lanes. Two findings pinned here, each driving the real modules:
//
// R1: a sail re-baked in place (renderer.updateMeshVertices - Come Sail Away's FixDeformations, every tenth of a
// second) kept its matrix, so the lane's lantern shadow cache (SC1) held it as a STILL caster and kept the old shape
// for as long as nothing else in the lantern's reach changed - on a real GL the floor stayed shadowed under a sail
// that had moved away. A bake that moves a vertex now bumps the mesh's vertex generation and the shadow pass takes it
// as a move; a bake that lands where the last one stood changes nothing, so a still boat's sails stay cached.
//
// R2: outdoors the boats' lanterns reached the renderer through the player-light extras, over a plain array: the
// light lost the prefab's colour (Color32(255, 147, 41) - white on the classic set, the lane's city flame on the lane,
// where a building and a dungeon kept it) and took a lead slot ahead of every nearer street lantern (the classic cap
// of sixteen gave a galleon 42 m off eight of them). They are scene lights now, ranked by distance with the street's
// in the one selection, in their own colour. Pinned by running world.js's own exterior composition - the pool, the
// fills and the selection, and both branches of the frame - out of its source, over the real selection, the real
// composer and a real renderer on a fake GL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE, lanternColor } from '../../src/render/enhancedLighting.js';
import { SHADOW_DYNAMIC_HOLD } from '../../src/render/shadowPass.js';
import { fillLanternPool, nearestLights, rangesFor, capFadeColors, capFadePairs, CITY_LIGHT_COLOR } from '../../src/world/city/cityLights.js';
import { withPlayerLights } from '../../src/scenes/magicCandle.js';
import { wodLightColors } from '../../src/world/worldOfDaggerfall/worldOfDaggerfall.js';
import { createComeSailAwayPool } from '../../src/scenes/comeSailAway/comeSailAwayPool.js';
import { adoptLight } from '../../src/render/lightId.js';
import { Boat, setLights } from '../../src/systems/comeSailAway/comeSailAwayBoat.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** A fake GL that answers as a driver would for the renderer's own bookkeeping (sc1_shadowcache's shape). */
function fakeGl() {
  let ids = 0;
  const consts = { TEXTURE0: 1000, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, FRAMEBUFFER: 36160 };
  const gl = new Proxy({}, {
    get(_, k) {
      if (k in consts) return consts[k];
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, n) => n;
      if (k === 'getAttribLocation') return () => 0;
      if (typeof k === 'string' && k.startsWith('create')) return () => ({ id: ++ids });
      if (k === 'getParameter') return () => new Float32Array(4);
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;
      return () => {};
    },
  });
  return { canvas: { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 } };
}
/** A flat plate at height y over [x0, x1] x [z0, z1], one sub-mesh in TEXTURE.001 record 1. */
const plate = (x0, x1, y, z0, z1) => ({
  positions: new Float32Array([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0]),
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  uvs: new Float32Array(8),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 2 }],
});

test('AUDIT PRE-MERGE 0928 R1: a sail re-baked in place (updateMeshVertices) leaves the lantern\'s static cache when its vertices move - its first bake or any later one - and comes back to it in its new shape; a bake that lands where the last one stood moves nothing, so a still boat\'s sails, a mesh baked before it was first seen and a mesh never rewritten stay cached (mutants: the generation never bumped; bumped by every bake; the shadow pass blind to it; a first sight taken for a move)', () => {
  const { canvas } = fakeGl();
  const r = new Renderer(canvas);
  r.setLightingLane(EL_LANE);
  r.textures.set('1_1', { id: 't11' });
  r.setLighting(new Float32Array([0.12, 0.12, 0.12]), 0);
  const floor = r.createMesh(plate(-10, 10, 0, -10, 10));   // never rewritten
  const sail = r.createMesh(plate(-1, 1, 2, -1, 1));   // drawn before its first bake (probeR2's order on a real GL)
  const jib = plate(5, 6, 3, -1, 1);
  const boom = r.createMesh(jib);
  r.updateMeshVertices(boom, jib.positions, jib.normals);   // the pool's own order: the newest bake over the mesh it just made, before its first draw
  const frame = () => {
    r.setPointLights(new Float32Array([0, 4, 0, 12]), new Float32Array([1, 1, 1]));   // a lantern over the sails
    r.beginFrame(I, I, new Float32Array([0.45, 0.8, 0.35]), WORLD_FRAME);
    const st = { ...r.shadows.stats };
    r.drawMesh(floor, I, null);
    r.drawMesh(sail, I, null);
    r.drawMesh(boom, I, null);
    r.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
    return st;
  };
  const still = (label, frames) => {
    for (let f = 0; f < frames; f++) {
      const st = frame();
      assert.equal(st.staticFaces + st.dynFaces, 0, `${label}, frame ${f}: nothing redrawn - the cache stands`);
      assert.equal(st.cachedSlots, 1);
    }
  };
  const leaves = (label) => {
    frame();   // recorded - a mover now
    const st = frame();
    assert.equal(st.staticFaces, 6, `${label}: the sail LEFT the static set - the cache is drawn again without its old shape`);
    assert.equal(st.dynFaces, 6, `${label}: and the sail in its new shape over it`);
    let rebuilt = 0, last = null;
    for (let f = 0; f < SHADOW_DYNAMIC_HOLD + 2; f++) { last = frame(); rebuilt += last.staticFaces; }
    assert.equal(rebuilt, 6, `${label}: the hold over, it is still again - into the cache once more, in the shape it has now`);
    assert.equal(last.staticFaces + last.dynFaces, 0, `${label}: and served from it`);
  };
  frame();   // recorded
  assert.equal(frame().staticFaces, 6, 'the cache drawn, the sails in it');
  still('three still meshes, one baked before it was first seen', 3);
  // the sail's first bake moves every vertex; the matrix stays
  const out = plate(3, 5, 2, -1, 1);
  r.updateMeshVertices(sail, out.positions, out.normals);
  leaves('its first bake');
  // FixDeformations re-bakes a still sail every tenth of a second: the same vertices
  const again = plate(3, 5, 2, -1, 1);
  r.updateMeshVertices(sail, again.positions, again.normals);
  r.updateMeshVertices(boom, jib.positions, jib.normals);
  still('re-baked where they stood (SC1\'s saving kept)', 4);
  // and stows again
  const back = plate(-1, 1, 2, -1, 1);
  r.updateMeshVertices(sail, back.positions, back.normals);
  leaves('a later bake');
});

/** The galleon from the vendored bundle (test/systems/comeSailAway/csa_pool.test.js's rig), its lanterns lit, standing at `x` along +X. */
async function galleonLights(x, eye) {
  const fileFetch = async (url) => {
    const bytes = readFileSync(fileURLToPath(url));
    return { ok: true, json: async () => JSON.parse(bytes.toString('utf8')), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
  };
  const textureFiles = new Map();
  const pipeline = {
    textureFiles, cpuModels: new Map(), gpuMeshes: new Map(), uploadRecord() {},
    getTexture: async (a) => { if (!textureFiles.has(a)) textureFiles.set(a, { recordCount: 100, getSize: () => ({ width: 40, height: 64 }), getScale: () => ({ width: 0, height: 0 }) }); return textureFiles.get(a); },
    getGpuMesh: async (id) => ({ classic: id }),
  };
  const renderer = { createMesh: (m) => ({ model: m, buffers: [{}, {}], bounds: [0, 0, 0, 0], subMeshes: m.subMeshes.map((s) => ({ ...s, _bounds: [0, 0, 0, 0] })) }), drawMesh() {}, updateMeshVertices() {}, createBillboardBatch: (a, r, size) => ({ archive: a, record: r, size }), destroyBillboardBatch() {}, destroyMesh() {} };
  const pool = createComeSailAwayPool({ renderer, pipeline, fetchFn: fileFetch, log: { warn() {} } });
  const boat = await pool.spawn(new Boat(2), { position: [0, 0, 0], rotation: [0, 0, 0, 1] });
  pool.offsetAll([x, 0, 0]);
  setLights(boat, true);
  pool.frame(0.5, { playerPosition: eye, cityLightsOn: true });
  return pool.lights(eye);
}
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);
const town = Array.from({ length: 20 }, (_, i) => ({ x: Math.cos(i) * (4 + i * 1.4), y: 3, z: Math.sin(i) * (4 + i * 1.4) }));   // 4 to 30.6 m from the eye

