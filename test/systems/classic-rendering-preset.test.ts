import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIC_RENDERING_ROWS,
  CLASSIC_RENDERING_VIDEO,
  applyClassicRendering,
  classicRenderingOn,
  removeClassicRendering,
  type ClassicRenderingDoors,
  type GraphicsProfiles,
  type RowValue,
} from '../../src/systems/classic-rendering-preset.ts';

type Stores = {
  rows: Record<string, RowValue>;
  video: Record<string, string>;
  locked: Set<string>;
  profiles: GraphicsProfiles | null;
  writes: string[];
};

function storesDoors(stores: Stores): ClassicRenderingDoors {
  return {
    rowIds: Object.keys(stores.rows),
    videoKeys: Object.keys(stores.video),
    readRow: (id) => (stores.locked.has(id) ? null : stores.rows[id]),
    writeRow: (id, value) => {
      stores.writes.push(id);
      stores.rows[id] = value;
    },
    readVideo: (key) => stores.video[key],
    writeVideo: (key, value) => {
      stores.writes.push(key);
      stores.video[key] = value;
    },
    readProfiles: () => stores.profiles,
    writeProfiles: (profiles) => {
      stores.profiles = structuredClone(profiles);
    },
  };
}

/** A player's graphics: the preset's settings, and two it does not touch (bloom, the anisotropy row). */
function playerStores(): Stores {
  return {
    rows: {
      'land-view-distance': 5,
      'ground-sharpness': 'default',
      'enhanced-lighting': true,
      'enhanced-environments': 'dome',
      'anisotropic-filtering': 8,
    },
    video: {
      'Video/RetroRenderingMode': '0',
      'Video/RetroModeAspectCorrection': '2',
      'Video/PostProcessingInRetroMode': '1',
      'Video/UseMipMapsInRetroMode': 'True',
      'Video/FieldOfView': '90',
      'Video/MainFilterMode': '3',
      'Effects/BloomEnable': 'True',
    },
    locked: new Set(),
    profiles: null,
    writes: [],
  };
}

const settingsOf = (stores: Stores) => structuredClone({ rows: stores.rows, video: stores.video });

test('the first Classic is the standard settings with the preset over them; Off puts the standard ones back exactly', () => {
  const stores = playerStores();
  const standard = settingsOf(stores);
  const doors = storesDoors(stores);
  assert.equal(classicRenderingOn(doors), false);
  assert.equal(applyClassicRendering(doors), true);
  assert.equal(classicRenderingOn(doors), true);
  assert.deepEqual(stores.rows, { ...standard.rows, ...CLASSIC_RENDERING_ROWS });
  assert.deepEqual(stores.video, { ...standard.video, ...CLASSIC_RENDERING_VIDEO });
  assert.equal(removeClassicRendering(doors), true);
  assert.equal(classicRenderingOn(doors), false);
  assert.deepEqual(settingsOf(stores), standard);
});

test('each profile keeps its own changes: one made under Classic comes back with Classic, and never reaches standard', () => {
  const stores = playerStores();
  const doors = storesDoors(stores);
  applyClassicRendering(doors);
  stores.rows['land-view-distance'] = 4;
  stores.video['Effects/BloomEnable'] = 'False';
  removeClassicRendering(doors);
  assert.equal(stores.rows['land-view-distance'], 5, 'standard: its own view distance');
  assert.equal(stores.video['Effects/BloomEnable'], 'True', 'and its own bloom, a setting the preset does not name');
  stores.video['Video/FieldOfView'] = '75';
  applyClassicRendering(doors);
  assert.equal(stores.rows['land-view-distance'], 4, 'Classic: the view distance chosen under it');
  assert.equal(stores.video['Effects/BloomEnable'], 'False');
  assert.equal(stores.video['Video/FieldOfView'], '60', "the preset's field of view, kept by Classic");
  removeClassicRendering(doors);
  assert.equal(stores.video['Video/FieldOfView'], '75', 'the change made under standard');
});

test('a second press stores nothing over the standard profile, and Off when off changes nothing', () => {
  const stores = playerStores();
  const doors = storesDoors(stores);
  assert.equal(removeClassicRendering(doors), false);
  assert.deepEqual(stores.writes, []);
  applyClassicRendering(doors);
  assert.equal(applyClassicRendering(doors), false);
  removeClassicRendering(doors);
  assert.equal(stores.rows['ground-sharpness'], 'default');
  assert.equal(stores.video['Video/RetroRenderingMode'], '0');
});

test('the keys go in before the rows, and only what differs is written', () => {
  const stores = playerStores();
  const doors = storesDoors(stores);
  applyClassicRendering(doors);
  const rowsAt = stores.writes.findIndex((name) => !name.includes('/'));
  assert.ok(
    stores.writes.slice(0, rowsAt).every((name) => name.includes('/')),
    stores.writes.join(' '),
  );
  assert.ok(!stores.writes.includes('Effects/BloomEnable'), 'an unchanged setting is not written');
  assert.ok(!stores.writes.includes('anisotropic-filtering'));
});

test('a row the online room decides is neither stored nor written', () => {
  const stores = playerStores();
  stores.locked.add('land-view-distance');
  const doors = storesDoors(stores);
  applyClassicRendering(doors);
  assert.equal(stores.rows['land-view-distance'], 5);
  assert.equal(Object.hasOwn(stores.profiles?.standard?.rows ?? {}, 'land-view-distance'), false);
  removeClassicRendering(doors);
  assert.equal(stores.rows['land-view-distance'], 5);
});
