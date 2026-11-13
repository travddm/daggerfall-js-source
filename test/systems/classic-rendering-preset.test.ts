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
  parts: Record<string, unknown>;
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
    partIds: Object.keys(stores.parts),
    readPart: (id) => (stores.locked.has(id) ? null : { value: stores.parts[id] }),
    writePart: (id, value) => {
      stores.writes.push(id);
      stores.parts[id] = value;
    },
    readProfiles: () => stores.profiles,
    writeProfiles: (profiles) => {
      stores.profiles = structuredClone(profiles);
    },
  };
}

/** A player's graphics: the preset's settings, two it does not touch (bloom, the anisotropy row), and two drawer choices
 *  (the grass style, and a mod dial that is a pair). */
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
    parts: { 'pref:grassStyle': 'meadow', 'mod:snow:Size': [1, 3] },
    locked: new Set(),
    profiles: null,
    writes: [],
  };
}

const settingsOf = (stores: Stores) => structuredClone({ rows: stores.rows, video: stores.video, parts: stores.parts });

test('the first Classic is the standard settings with the preset over them; Off puts the standard ones back exactly', () => {
  const stores = playerStores();
  const standard = settingsOf(stores);
  const doors = storesDoors(stores);
  assert.equal(classicRenderingOn(doors), false);
  assert.equal(applyClassicRendering(doors), true);
  assert.equal(classicRenderingOn(doors), true);
  assert.deepEqual(stores.rows, { ...standard.rows, ...CLASSIC_RENDERING_ROWS });
  assert.deepEqual(stores.video, { ...standard.video, ...CLASSIC_RENDERING_VIDEO });
  assert.deepEqual(stores.parts, standard.parts, 'the first Classic keeps the drawer choices');
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
  stores.parts['pref:grassStyle'] = 'pixel';
  stores.parts['mod:snow:Size'] = [2, 4];
  removeClassicRendering(doors);
  assert.equal(stores.parts['pref:grassStyle'], 'meadow', 'standard: its own grass style');
  assert.deepEqual(stores.parts['mod:snow:Size'], [1, 3], 'and its own pair');
  assert.equal(stores.rows['land-view-distance'], 5, 'standard: its own view distance');
  assert.equal(stores.video['Effects/BloomEnable'], 'True', 'and its own bloom, a setting the preset does not name');
  stores.video['Video/FieldOfView'] = '75';
  applyClassicRendering(doors);
  assert.equal(stores.rows['land-view-distance'], 4, 'Classic: the view distance chosen under it');
  assert.equal(stores.video['Effects/BloomEnable'], 'False');
  assert.equal(stores.parts['pref:grassStyle'], 'pixel');
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
  assert.ok(!stores.writes.includes('mod:snow:Size'), 'an equal pair is not written');
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
