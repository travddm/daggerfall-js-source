// A .js test: it imports the settings screen, which is browser code that the Node type check (tsconfig.node.json) must
// not pull in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../../src/world/landView.js';
import '../../../src/world/outdoors.js';
import '../../../src/systems/featureLanes.js';
import { FEATURES } from '../../../src/systems/features.js';
import { getString, _resetForTests as resetSettings } from '../../../src/systems/settings/settings.js';
import { getPref, _resetForTests as resetPrefs } from '../../../src/systems/uiPrefs.js';
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
    const first = drawRow();
    assert.equal(first.off.attrs['aria-pressed'], 'true', 'off on a fresh shelf');
    press(first.on);
    const config = retroFrameConfig();
    assert.deepEqual([config?.width, config?.height, config?.post, config?.mipmaps], [320, 200, 3, false]);
    assert.equal(getString('Video', 'RetroModeAspectCorrection'), '1');
    assert.equal(getPref('groundSharpness'), 'off');
    assert.equal(getPref('classicDistanceShading'), 'steps');
    assert.equal(rowValue('land-view-distance'), 'Classic (3)', 'land view went through its own door');
    assert.equal(drawRow().on.attrs['aria-pressed'], 'true', 'a redrawn row reads On');
    press(drawRow().off);
    assert.equal(retroFrameConfig(), null, 'the retro picture is off again');
    assert.equal(getString('Video', 'RetroModeAspectCorrection'), '0');
    assert.equal(getPref('groundSharpness'), 'default');
    assert.equal(getPref('classicDistanceShading'), 'off');
    assert.equal(rowValue('land-view-distance'), landViewBefore);
    assert.equal(getPref('classicRenderingSaved'), null);
  } finally {
    delete globalThis.document;
    delete globalThis.location;
    fresh();
  }
});
