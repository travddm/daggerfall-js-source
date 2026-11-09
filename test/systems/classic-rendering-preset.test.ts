import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIC_RENDERING_ROWS,
  CLASSIC_RENDERING_VIDEO,
  applyClassicRendering,
  classicRenderingOn,
  removeClassicRendering,
  type ClassicRenderingDoors,
  type ClassicRenderingSaved,
  type RowValue,
} from '../../src/systems/classic-rendering-preset.ts';

type Stores = {
  rows: Record<string, RowValue>;
  video: Record<string, string>;
  locked: Set<string>;
  saved: ClassicRenderingSaved | null;
};

function storesDoors(stores: Stores): ClassicRenderingDoors {
  return {
    readRow: (id) => (stores.locked.has(id) ? null : stores.rows[id]),
    writeRow: (id, value) => {
      stores.rows[id] = value;
    },
    readVideo: (key) => stores.video[key],
    writeVideo: (key, value) => {
      stores.video[key] = value;
    },
    readSaved: () => stores.saved,
    writeSaved: (saved) => {
      stores.saved = saved;
    },
  };
}

function playerStores(): Stores {
  return {
    rows: { 'land-view-distance': 5, 'ground-sharpness': 'max', 'classic-distance-shading': 'off' },
    video: {
      'Video/RetroRenderingMode': '0',
      'Video/RetroModeAspectCorrection': '2',
      'Video/PostProcessingInRetroMode': '1',
      'Video/UseMipMapsInRetroMode': 'True',
    },
    locked: new Set(),
    saved: null,
  };
}

test('applying the preset sets every listed value; removing it puts back each value the player had', () => {
  const stores = playerStores();
  const before = structuredClone({ rows: stores.rows, video: stores.video });
  const doors = storesDoors(stores);
  assert.equal(classicRenderingOn(doors), false);
  assert.equal(applyClassicRendering(doors), true);
  assert.equal(classicRenderingOn(doors), true);
  assert.deepEqual(stores.rows, { ...CLASSIC_RENDERING_ROWS });
  assert.deepEqual(stores.video, { ...CLASSIC_RENDERING_VIDEO });
  assert.equal(removeClassicRendering(doors), true);
  assert.equal(classicRenderingOn(doors), false);
  assert.deepEqual({ rows: stores.rows, video: stores.video }, before);
});

test('a second press does not save the preset over what the player had', () => {
  const stores = playerStores();
  const doors = storesDoors(stores);
  applyClassicRendering(doors);
  assert.equal(applyClassicRendering(doors), false);
  removeClassicRendering(doors);
  assert.equal(stores.rows['ground-sharpness'], 'max');
  assert.equal(stores.video['Video/RetroRenderingMode'], '0');
});

test("a setting changed while the preset is on keeps the player's choice when it is switched off", () => {
  const stores = playerStores();
  const doors = storesDoors(stores);
  applyClassicRendering(doors);
  stores.video['Video/RetroModeAspectCorrection'] = '2';
  stores.rows['land-view-distance'] = 4;
  removeClassicRendering(doors);
  assert.equal(stores.video['Video/RetroModeAspectCorrection'], '2');
  assert.equal(stores.rows['land-view-distance'], 4);
  assert.equal(stores.video['Video/RetroRenderingMode'], '0', 'an untouched key is put back');
});

test('a row the online room decides is neither saved nor written', () => {
  const stores = playerStores();
  stores.locked.add('land-view-distance');
  const doors = storesDoors(stores);
  applyClassicRendering(doors);
  assert.equal(stores.rows['land-view-distance'], 5);
  assert.equal(Object.hasOwn(stores.saved?.rows ?? {}, 'land-view-distance'), false);
  removeClassicRendering(doors);
  assert.equal(stores.rows['land-view-distance'], 5);
});

test('switching it off when it is off changes nothing', () => {
  const stores = playerStores();
  const before = structuredClone(stores.video);
  assert.equal(removeClassicRendering(storesDoors(stores)), false);
  assert.deepEqual(stores.video, before);
});
