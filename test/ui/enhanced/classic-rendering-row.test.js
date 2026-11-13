// A .js test: it imports the settings screen, which is browser code that the Node type check (tsconfig.node.json) must
// not pull in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../../src/world/landView.js';
import '../../../src/world/outdoors.js';
import '../../../src/systems/featureLanes.js';
import { FEATURES } from '../../../src/systems/features.js';
import {
  getString,
  setValue,
  saveSettings,
  resetToDefaults,
  _resetForTests as resetSettings,
} from '../../../src/systems/settings/settings.js';
import {
  getPref,
  setPref,
  resetPrefs as clearPrefs,
  _resetForTests as resetPrefs,
} from '../../../src/systems/uiPrefs.js';
import { _resetModSettings } from '../../../src/systems/modSettings.js';
import { _resetRenderScaleDoor } from '../../../src/systems/renderScale.js';
import { retroFrameConfig } from '../../../src/systems/retroMode.js';
import { tileStates } from '../../../src/ui/enhanced/enhancedMenu.js';
import { classicRenderingRow } from '../../../src/ui/enhanced/classic-rendering-row.ts';

function fakeNode() {
  const node = {
    className: '',
    textContent: '',
    type: '',
    dataset: {},
    attrs: {},
    children: [],
    onclick: null,
    append: (...nodes) => node.children.push(...nodes),
    setAttribute: (name, value) => {
      node.attrs[name] = value;
    },
  };
  return node;
}

function fresh() {
  resetPrefs();
  resetSettings();
  _resetModSettings();
  _resetRenderScaleDoor();
}

/** The row as drawn, and its Off and On buttons. */
function drawRow() {
  const row = classicRenderingRow(tileStates, () => {});
  const bar = row.children[1].children[0];
  return { row, off: bar.children[0], on: bar.children[1] };
}

const press = (button) => button.onclick({ stopPropagation() {} });
const rowValue = (id) => {
  const states = tileStates(FEATURES.find((row) => row.id === id));
  return states.labels[states.at];
};

test('the Classic rendering row turns on the classic picture through the real stores, and Off puts back the defaults', () => {
  fresh();
  globalThis.document = { createElement: fakeNode };
  globalThis.location = { search: '' };
  try {
    const landViewBefore = rowValue('land-view-distance');
    const outdoorsBefore = rowValue('enhanced-environments');
    const first = drawRow();
    assert.equal(first.off.attrs['aria-pressed'], 'true', 'off on a fresh shelf');
    press(first.on);
    const config = retroFrameConfig();
    assert.deepEqual([config?.width, config?.height, config?.post, config?.mipmaps], [320, 200, 3, false]);
    assert.equal(getString('Video', 'RetroModeAspectCorrection'), '1');
    assert.equal(getPref('groundSharpness'), 'off');
    assert.equal(rowValue('land-view-distance'), 'Classic (3)', 'land view went through its own door');
    assert.equal(getPref('enhancedLighting'), false, 'the flat classic light');
    assert.equal(getPref('enhancedEnvironments'), false, 'the painted sky');
    assert.equal(getString('Video', 'FieldOfView'), '60');
    assert.equal(drawRow().on.attrs['aria-pressed'], 'true', 'a redrawn row reads On');
    press(drawRow().off);
    assert.equal(retroFrameConfig(), null, 'the retro picture is off again');
    assert.equal(getString('Video', 'RetroModeAspectCorrection'), '0');
    assert.equal(getPref('groundSharpness'), 'default');
    assert.equal(rowValue('land-view-distance'), landViewBefore);
    assert.equal(getPref('enhancedLighting'), true);
    assert.equal(getPref('enhancedEnvironments'), true);
    assert.equal(rowValue('enhanced-environments'), outdoorsBefore, 'the same sky as before');
    assert.equal(getString('Video', 'FieldOfView'), '65');
    assert.equal(getPref('graphicsProfiles')?.active, 'standard');
  } finally {
    delete globalThis.document;
    delete globalThis.location;
    fresh();
  }
});

/** The browser's storage, in memory: what a reload reads back. */
function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
  };
}

/** A page reload: both stores forget what they hold and read it back from storage. */
function reload() {
  resetPrefs();
  resetSettings();
}

test('both profiles survive a reload: each comes back with its own changes, and Off puts the standard settings back exactly', () => {
  globalThis.localStorage = memoryStorage();
  fresh();
  clearPrefs();
  resetToDefaults();
  globalThis.document = { createElement: fakeNode };
  globalThis.location = { search: '' };
  try {
    setValue('Effects', 'BloomEnable', 'False');
    saveSettings();
    setPref('anisotropicFiltering', 4);
    const standard = { fov: getString('Video', 'FieldOfView'), landView: rowValue('land-view-distance') };
    press(drawRow().on);
    setValue('Video', 'FieldOfView', '70');
    saveSettings();
    setValue('Effects', 'BloomEnable', 'True');
    saveSettings();
    reload();
    assert.equal(drawRow().on.attrs['aria-pressed'], 'true', 'Classic is still on after the reload');
    assert.deepEqual(
      [getString('Video', 'FieldOfView'), getString('Video', 'RetroRenderingMode')],
      ['70', '1'],
      'its own settings',
    );
    press(drawRow().off);
    reload();
    assert.equal(drawRow().off.attrs['aria-pressed'], 'true');
    assert.equal(getString('Video', 'FieldOfView'), standard.fov, 'the standard field of view');
    assert.equal(
      getString('Effects', 'BloomEnable'),
      'False',
      'the standard bloom, changed under Classic and not here',
    );
    assert.equal(getString('Video', 'RetroRenderingMode'), '0');
    assert.equal(rowValue('land-view-distance'), standard.landView);
    assert.equal(getPref('anisotropicFiltering'), 4);
    press(drawRow().on);
    reload();
    assert.deepEqual(
      [getString('Video', 'FieldOfView'), getString('Effects', 'BloomEnable')],
      ['70', 'True'],
      'Classic comes back as it was left',
    );
    setValue('Video', 'VSync', 'False');
    saveSettings();
    press(drawRow().off);
    assert.equal(
      getString('Video', 'VSync'),
      'False',
      'a display setting is shared: switching Classic leaves it as set',
    );
  } finally {
    delete globalThis.document;
    delete globalThis.location;
    clearPrefs();
    resetToDefaults();
    delete globalThis.localStorage;
    fresh();
  }
});
