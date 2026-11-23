// What the renderer is asked to shade, read from the real settings store and preferences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { classicDistanceShading } from '../../src/systems/distance-shading-setting.ts';

function fresh() {
  resetPrefs();
  resetSettings();
}

test('at the defaults nothing is asked, so the renderer opens no image', () => {
  fresh();
  assert.equal(classicDistanceShading(), null);
});

test("the row's To fog colour asks for the fog fade alone", () => {
  fresh();
  setPref('classicDistanceShading', 'fog');
  assert.deepEqual(classicDistanceShading(), { fogColour: true, falloff: 0 });
  fresh();
});

test("Color Boost Falloff asks for DFU's dungeon fade while Color Boost is on, clamped to DFU's 0 to 8", () => {
  fresh();
  setValue('Effects', 'ColorBoostDungeonFalloff', '2.5');
  assert.equal(classicDistanceShading(), null, 'Color Boost off: DFU runs no falloff');
  setValue('Effects', 'ColorBoostEnable', 'True');
  assert.deepEqual(classicDistanceShading(), { fogColour: false, falloff: 2.5 });
  setValue('Effects', 'ColorBoostDungeonFalloff', '12');
  assert.deepEqual(classicDistanceShading(), { fogColour: false, falloff: 8 });
  setPref('classicDistanceShading', 'fog');
  assert.deepEqual(classicDistanceShading(), { fogColour: true, falloff: 8 }, 'both together');
  fresh();
});
