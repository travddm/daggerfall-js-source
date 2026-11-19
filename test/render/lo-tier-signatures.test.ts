// The lo tier's lamps (render/shadowPass.js _renderLo) take their static signatures from one walk of the frame's
// records, and each kept map holds the signature a walk for its lamp alone answers. Driven through the real renderer
// on a fake GL: a tavern of twenty lamps, a room mesh that reaches all of them, and a crate that reaches some.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The renderer's modules use browser types that the node type pass does not load, so they are imported by a path the
// type pass does not follow.
const rendererPath = '../../src/render/renderer.js';
const lightingPath = '../../src/render/enhancedLighting.js';
const shadowPath = '../../src/render/shadowPass.js';
const { Renderer, WORLD_FRAME } = await import(rendererPath);
const { EL_LANE } = await import(lightingPath);
const { SHADOW_POINT_CASTERS, SHADOW_TUNING } = await import(shadowPath);

SHADOW_TUNING.override = false;

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** A WebGL2 context that answers every call and draws nothing. */
function fakeCanvas(): unknown {
  let ids = 0;
  const constants: Record<string, number> = {
    TEXTURE0: 1000,
    DEPTH_BUFFER_BIT: 256,
    COLOR_BUFFER_BIT: 16384,
    READ_FRAMEBUFFER: 36008,
    DRAW_FRAMEBUFFER: 36009,
    FRAMEBUFFER: 36160,
  };
  const creators = new Set([
    'createShader',
    'createProgram',
    'createBuffer',
    'createVertexArray',
    'createTexture',
    'createFramebuffer',
    'createRenderbuffer',
  ]);
  const gl = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== 'string') return undefined;
        if (key in constants) return constants[key];
        if (key === 'getProgramParameter' || key === 'getShaderParameter') return () => true;
        if (key === 'getUniformLocation') return (_program: unknown, name: string) => name;
        if (key === 'getAttribLocation') return () => 0;
        if (creators.has(key)) return () => ({ id: ++ids });
        if (key === 'getParameter') return () => new Float32Array(4);
        if (key.toUpperCase() === key) return 1;
        return () => undefined;
      },
    },
  );
  return { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 };
}

function mesh(id: string, sphere: number[]) {
  return {
    vao: { id },
    buffers: [],
    bounds: new Float32Array(sphere),
    subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 2 }],
  };
}

function tavern() {
  const renderer = new Renderer(fakeCanvas());
  renderer.setLightingLane(EL_LANE);
  renderer.textures.set('1_1', { id: 't11' });
  renderer.setLighting(new Float32Array([0.18, 0.18, 0.18]), 0);
  const shadows = renderer.shadows;
  const room = mesh('vao-room', [0, 2, 0, 40]);
  const crate = mesh('vao-crate', [24, 0.5, 3, 0.8]);
  const lamps = new Float32Array(20 * 4);
  for (let k = 0; k < 20; k++) lamps.set([k * 1.5, 2, 3, 15], k * 4);
  const lightDir = new Float32Array([0.45, 0.8, 0.35]);
  let walks = 0;
  const walk = shadows._staticSignatures.bind(shadows);
  shadows._staticSignatures = (...args: unknown[]) => {
    if (args[4] === true) walks++;
    return walk(...args);
  };
  /** One frame; answers the lo tier's walks and stats. */
  const frame = (withCrate: boolean) => {
    renderer.setPointLights(lamps, new Float32Array([1, 1, 1]));
    renderer.everyLightCasts();
    walks = 0;
    renderer.beginFrame(identity, identity, lightDir, WORLD_FRAME);
    const stats = { ...shadows.stats, walks };
    renderer.drawMesh(room, identity, null);
    if (withCrate) renderer.drawMesh(crate, identity, null);
    renderer.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
    return stats;
  };
  return { shadows, frame };
}

/** Every built lo slot's kept signature beside the one a walk for its lamp alone answers now. */
/** The lo tier's state as the shadow pass keeps it: each slot's light, whether its map is built and its signature. */
type LoTier = {
  _loCap: number;
  _loBuilt: Uint8Array;
  _loSlotLight: Float32Array;
  _loSlotSig: Int32Array;
  _staticSignature: (pos: number[], far: number) => Int32Array;
};

function keptAndAlone(shadows: LoTier): { kept: number[]; alone: number[] }[] {
  const out: { kept: number[]; alone: number[] }[] = [];
  for (let j = 0; j < shadows._loCap; j++) {
    if (!shadows._loBuilt[j]) continue;
    const light = shadows._loSlotLight;
    const pos = [light[j * 4], light[j * 4 + 1], light[j * 4 + 2]];
    const kept = [shadows._loSlotSig[j * 2], shadows._loSlotSig[j * 2 + 1]];
    out.push({ kept, alone: [...shadows._staticSignature(pos, light[j * 4 + 3])] });
  }
  return out;
}

test('the lo tier walks the records once a frame, however many lamps it holds', () => {
  const { frame } = tavern();
  frame(false);
  const first = frame(false);
  assert.equal(first.loSlots, 20 - SHADOW_POINT_CASTERS);
  assert.equal(first.walks, 1);
  const kept = frame(false);
  assert.equal(kept.loFaces, 0, 'a still room redraws nothing');
  assert.equal(kept.walks, 1);
});

test('each kept lo map holds the signature its lamp alone would answer, before and after the static set changes', () => {
  const { shadows, frame } = tavern();
  frame(false);
  frame(false);
  // A frame's walk reads the records of the frame before it, so the comparison runs after a frame that drew the same.
  frame(false);
  for (const { kept, alone } of keptAndAlone(shadows)) assert.deepEqual(kept, alone);
  let redrawn = 0;
  for (let i = 0; i < 20; i++) redrawn += frame(true).loFaces;
  assert.ok(redrawn > 0, 'the crate redraws the maps it reaches');
  frame(true);
  for (const { kept, alone } of keptAndAlone(shadows)) assert.deepEqual(kept, alone);
});
