// TERRAIN-CUT as an option: the slope cut (world/terrain/terrain-quad-cut.ts) is the `terrainSlopeCut` Features row, off
// by default (DFU's fixed diagonal), the room's online and pinned off by the official profile. One switch reaches every
// reader: this thread's through the module, the worker's through its init, so the drawn, walked and water ground agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../../../src/systems/features.js';
import { CATEGORIES } from '../../../src/ui/settings/settingsMap.js';
import { OFFICIAL_PROFILE } from '../../../src/net/profile/officialProfile.ts';
import { ONLINE_FORCED_PREFS } from '../../../src/systems/online/onlineLane.js';
import { getPref, setPref } from '../../../src/systems/uiPrefs.js';
import { uiSkin, setUiSkin } from '../../../src/systems/uiSkin.js';
import { terrainSlopeCutOn, TERRAIN_SLOPE_CUT_PREF } from '../../../src/systems/terrainSlopeCut.js';
import { setSlopeCut, slopeCutIsOn, quadCutsSeNw } from '../../../src/world/terrain/terrain-quad-cut.ts';
import { TerrainGenClient } from '../../../src/world/terrain/terrainGenClient.js';
import { HEIGHTMAP_DIMENSION, generateSamples } from '../../../src/world/terrain/terrainSampler.js';
import { buildTerrainIndices, sharedTerrainIndices } from '../../../src/world/terrain/terrainSurface.js';
import { restrideGrid } from '../../../src/world/terrain/terrainGen.js';
import { WoodsFile } from '../../../src/formats/woodsFile.js';
import { Renderer } from '../../../src/render/renderer.js';
import { syntheticWoodsBytes } from '../../landformWorld.mjs';

const ELEMENT_ARRAY_BUFFER = 34963;

/** A WebGL2 that records every call; each create answers a fresh object. */
function recordingGl() {
  const calls = [];
  let ids = 0;
  const consts = {
    ELEMENT_ARRAY_BUFFER,
    ARRAY_BUFFER: 34962,
    TEXTURE_CUBE_MAP_POSITIVE_X: 100,
    TEXTURE0: 1000,
    DEPTH_BUFFER_BIT: 256,
    COLOR_BUFFER_BIT: 16384,
  };
  const gl = new Proxy(
    {},
    {
      get(_, k) {
        if (k in consts) return consts[k];
        if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
        if (k === 'getUniformLocation') return (_p, n) => n;
        if (k === 'getAttribLocation') return () => 0;
        if (typeof k === 'string' && k.startsWith('create')) return () => ({ id: ++ids });
        if (k === 'getParameter') return () => new Float32Array(4);
        if (typeof k === 'string' && k.toUpperCase() === k) return 1;
        return (...args) => {
          calls.push([k, ...args]);
        };
      },
    },
  );
  return { calls, canvas: { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 } };
}

const H = HEIGHTMAP_DIMENSION;

/** A saddle across the fixed diagonal at quad (10, 10): the slope cut takes the other diagonal there. */
function saddle() {
  const data = new Float32Array(H * H).fill(0.1);
  data[10 * H + 11] += 0.01;
  data[11 * H + 10] += 0.01;
  return data;
}

test('the row: off by default, enhanced, the room online, listed under World > Land', () => {
  const row = FEATURES.find((f) => f.id === 'terrain-slope-cut');
  assert.ok(row, 'a Features row');
  assert.deepEqual(
    [row.control.store, row.control.key, row.control.initial, row.control.online],
    ['prefs', TERRAIN_SLOPE_CUT_PREF, false, 'room'],
  );
  assert.deepEqual(row.kinds, ['enhanced']);
  assert.equal(row.group, 'world');
  assert.equal(typeof row.title, 'string');
  assert.ok(row.note.includes('Off is the original'));
  const land = CATEGORIES.find((c) => c.id === 'world')?.sections?.find((s) => s.id === 'land');
  assert.ok(land?.items.includes('feat:terrain-slope-cut'), 'beside Landforms in the settings');
});

test('the official profile pins it off, and the online lane forces that pin', () => {
  assert.equal(OFFICIAL_PROFILE.pins.prefs.terrainSlopeCut, false);
  assert.equal(ONLINE_FORCED_PREFS.terrainSlopeCut, false);
});

test("the switch: off by default; on with the row on the enhanced skin; the classic skin keeps DFU's cut", () => {
  const skin = uiSkin();
  const before = getPref(TERRAIN_SLOPE_CUT_PREF);
  try {
    setUiSkin('enhanced');
    setPref(TERRAIN_SLOPE_CUT_PREF, false);
    assert.equal(terrainSlopeCutOn(''), false);
    setPref(TERRAIN_SLOPE_CUT_PREF, true);
    assert.equal(terrainSlopeCutOn(''), true);
    setUiSkin('classic');
    assert.equal(terrainSlopeCutOn(''), false, 'the classic skin is the 1:1 lane');
  } finally {
    setUiSkin(skin);
    setPref(TERRAIN_SLOPE_CUT_PREF, before);
  }
});

test("the client sets this thread's cut and hands the same one to its worker at init", () => {
  for (const on of [false, true]) {
    const posted = [];
    const fake = { postMessage: (m) => posted.push(m), terminate() {} };
    setSlopeCut(!on);
    new TerrainGenClient({ woods: null, woodsBytes: new Uint8Array(8), workerFactory: () => fake, slopeCut: on });
    assert.equal(slopeCutIsOn(), on, `this thread's readers: ${on}`);
    assert.equal(posted.find((m) => m.t === 'init')?.slopeCut, on, `the worker's init: ${on}`);
    assert.equal(quadCutsSeNw(saddle(), 10, 10), on, 'the saddle quad follows the switch');
  }
  new TerrainGenClient({ woods: null });
  assert.equal(slopeCutIsOn(), false, 'a client made without it is the default, off');
});

test('the real worker shell takes the cut from its init', async () => {
  const prevPost = globalThis.postMessage;
  const prevOn = globalThis.onmessage;
  globalThis.postMessage = () => {};
  try {
    await import('../../../src/world/terrain/terrainGenWorker.js');

    for (const on of [true, false]) {
      setSlopeCut(!on);
      globalThis.onmessage({ data: { t: 'init', woodsBytes: syntheticWoodsBytes(), slopeCut: on } });
      assert.equal(slopeCutIsOn(), on, `init with slopeCut ${on}`);
    }
  } finally {
    globalThis.postMessage = prevPost;
    globalThis.onmessage = prevOn;
    setSlopeCut(false);
  }
});

test('off, the option costs nothing: no pixel builds or uploads indices of its own - every surface of a stride draws one shared upload, as the base did', () => {
  const woods = new WoodsFile();
  assert.equal(woods.load(syntheticWoodsBytes()), true);
  const samples = generateSamples(woods, 300, 180);
  const surfaces = (on) => {
    setSlopeCut(on);
    try {
      const { calls, canvas } = recordingGl();
      const r = new Renderer(canvas);
      const made = [];
      for (const stride of [1, 1, 4, 4]) {
        const grid = restrideGrid({ woods, px: 300, py: 180, stride, samples });
        if (!on) assert.equal(grid.indices, null, 'off, the worker builds no index set');
        const n = calls.length;
        made.push(r.createPixelTerrainSurface(grid.positions, grid.normals, grid.indices, stride));
        made.at(-1).indexUploads = calls
          .slice(n)
          .filter(([k, target]) => k === 'bufferData' && target === ELEMENT_ARRAY_BUFFER).length;
      }
      return made;
    } finally {
      setSlopeCut(false);
    }
  };
  const off = surfaces(false);
  assert.deepEqual(
    off.map((t) => t.indexUploads),
    [1, 0, 1, 0],
    'off: one upload a stride, the rest share it',
  );
  assert.deepEqual(
    off.map((t) => t.buffers.length),
    [2, 2, 2, 2],
    'off: a surface owns its positions and normals only',
  );
  assert.equal(sharedTerrainIndices(1), sharedTerrainIndices(1), 'one array a stride');
  assert.deepEqual(sharedTerrainIndices(4), buildTerrainIndices(4), "the shared set is the fixed cut's");
  const on = surfaces(true);
  assert.deepEqual(
    on.map((t) => t.indexUploads),
    [1, 1, 1, 1],
    'on: each pixel its own cut',
  );
  assert.deepEqual(
    on.map((t) => t.buffers.length),
    [3, 3, 3, 3],
    'on: the index buffer is one of the surface buffers, freed with it',
  );
});
