// A .js test: it draws the settings screen's tile, which is DOM code the Node type check (tsconfig.node.json) has no
// types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_SHARPNESS_ROW } from '../../src/systems/ground-sharpness-row.ts';
import { forgetSamplingDriver, noteSamplingDriver } from '../../src/render/anisotropic-mip-filter.ts';
import { featureTile } from '../../src/ui/enhanced/enhancedMenu.js';
import { setPref, resetPrefs } from '../../src/systems/uiPrefs.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';

const REASON = 'No effect while Anisotropic Filtering is on';
const D3D11 = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)';

/** A context whose unmasked renderer string is `renderer`. */
const contextOf = (renderer) => ({
  RENDERER: 0x1f01,
  getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
  getParameter: (name) => (name === 0x9246 ? renderer : null),
});

function fakeElement(tag) {
  const node = {
    tag,
    children: [],
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    attrs: {},
    append(...children) {
      for (const child of children) node.children.push(child);
    },
    setAttribute(name, value) {
      node.attrs[name] = value;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return node;
}

function findByClass(node, name, out = []) {
  if (typeof node.className === 'string' && node.className.split(/\s+/).includes(name)) out.push(node);
  for (const child of node.children ?? []) findByClass(child, name, out);
  return out;
}

/** The row as the settings screen draws it: whether its segments take a press, and the reason shown on it. */
function drawnRow() {
  globalThis.document = {
    createElement: fakeElement,
    createTextNode: (text) => ({ textContent: text }),
    querySelectorAll: () => [],
  };
  try {
    const tile = featureTile(GROUND_SHARPNESS_ROW);
    return {
      disabled: findByClass(tile, 'ft-segb').map((b) => b.disabled),
      reason: findByClass(tile, 'ft-tile-lock')[0]?.textContent ?? null,
    };
  } finally {
    delete globalThis.document;
  }
}

test('on ANGLE over Direct3D the drawn row is disabled with its reason while anisotropy is above 1, and live again at Off or under Point', () => {
  resetSettings();
  resetPrefs();
  forgetSamplingDriver();
  noteSamplingDriver(contextOf(D3D11), 16);
  try {
    setPref('anisotropicFiltering', 8);
    assert.deepEqual(drawnRow(), { disabled: [true, true], reason: REASON }, '8x under Sharp, the default');
    setPref('anisotropicFiltering', 'off');
    assert.deepEqual(drawnRow(), { disabled: [false, false], reason: null }, 'Anisotropic Filtering Off');
    setPref('anisotropicFiltering', 'texture');
    assert.equal(drawnRow().reason, REASON, "Per texture: the ground's 8x");
    setValue('Video', 'MainFilterMode', '0');
    assert.deepEqual(drawnRow(), { disabled: [false, false], reason: null }, 'Point: the ground takes no anisotropy');
  } finally {
    forgetSamplingDriver();
    resetPrefs();
    resetSettings();
  }
});

test('on a driver not listed the row stays live at any anisotropy', () => {
  resetSettings();
  resetPrefs();
  forgetSamplingDriver();
  noteSamplingDriver(contextOf('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'), 16);
  try {
    setPref('anisotropicFiltering', 16);
    assert.deepEqual(drawnRow(), { disabled: [false, false], reason: null });
  } finally {
    forgetSamplingDriver();
    resetPrefs();
  }
});
