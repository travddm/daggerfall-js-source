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
import { HEIGHTMAP_DIMENSION } from '../../../src/world/terrain/terrainSampler.js';

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
    const { syntheticWoodsBytes } = await import('../../landformWorld.mjs');
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
