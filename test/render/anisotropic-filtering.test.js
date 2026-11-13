// A .js test: it reads the Features rows, which load browser modules the Node type check has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANISOTROPY_DEFAULT,
  ANISOTROPY_TIERS,
  anisotropyIndex,
  anisotropyOf,
  detailLevelAnisotropy,
  followDetailLevel,
  parseQualityLevel,
} from '../../src/render/anisotropic-filtering.ts';
import { FEATURES, FEATURE_PREF_DEFAULTS } from '../../src/systems/features.js';
import { GRAPHICS_PRESETS } from '../../src/systems/graphicsPresets.js';
import { getPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { setValue, _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';

test('the anisotropy: none under Point or Off; Per texture is DFU 8x on the ground alone; a level within the ceiling', () => {
  for (const setting of ANISOTROPY_TIERS) {
    assert.equal(anisotropyOf(setting, 16, true, true), 1, `${setting} under Point: none (ANGLE)`);
    assert.equal(anisotropyOf(setting, 16, false, true), 1);
  }
  assert.equal(anisotropyOf('off', 16, true, false), 1);
  assert.equal(anisotropyOf('texture', 16, true, false), 8, "DFU's terrain");
  assert.equal(anisotropyOf('texture', 16, false, false), 1, 'DFU sets no level on models or flats');
  for (const level of [2, 4, 8, 16]) assert.equal(anisotropyOf(level, 16, false, false), level);
  assert.equal(anisotropyOf(16, 4, true, false), 4, "the driver's ceiling");
  assert.equal(anisotropyOf(8, 0, true, false), 1, 'no extension');
  assert.equal(anisotropyOf('8', 16, true, false), 8, 'a stored string reads as its number');
  assert.equal(anisotropyOf('nonsense', 16, true, false), ANISOTROPY_DEFAULT, 'anything else is the default');
});

test('the place in the row, read for the per-frame key', () => {
  assert.deepEqual(ANISOTROPY_TIERS.map(anisotropyIndex), [0, 1, 2, 3, 4, 5]);
  assert.equal(anisotropyIndex(undefined), 4, 'no value is the default, 8x');
});

test("Detail Level sets the row as DFU's quality levels set Unity's anisotropy, and the player can change it after", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(detailLevelAnisotropy), ['off', 'off', 'texture', 'texture', 8, 8]);
  assert.equal(parseQualityLevel('3'), 3);
  for (const bad of ['6', '-1', 'Fantastic', '', null])
    assert.equal(parseQualityLevel(bad), 5, `${bad}: DFU's default`);
  resetSettings();
  resetPrefs();
  try {
    followDetailLevel();
    setValue('Video', 'QualityLevel', '1');
    assert.equal(getPref('anisotropicFiltering'), 'off', 'Fast: off');
    setValue('Video', 'QualityLevel', '3');
    assert.equal(getPref('anisotropicFiltering'), 'texture', 'Good: each texture its own');
    setValue('Video', 'QualityLevel', '5');
    assert.equal(getPref('anisotropicFiltering'), 8, 'Fantastic: 8x');
  } finally {
    resetSettings();
    resetPrefs();
  }
});

test('the row: its tiers, 8x by default, beside the filter; the Quality preset sets it', () => {
  const row = FEATURES.find((f) => f.id === 'anisotropic-filtering');
  assert.ok(row);
  assert.deepEqual(
    row.control.tiers.map(([value]) => value),
    [...ANISOTROPY_TIERS],
  );
  assert.deepEqual(
    row.control.tiers.map(([, label]) => label),
    ['Off', 'Per texture', '2x', '4x', '8x', '16x'],
  );
  assert.equal(FEATURE_PREF_DEFAULTS.anisotropicFiltering, 8);
  assert.equal(row.control.online, 'player');
  assert.match(row.note, /No effect with the Point texture filter/);
  const values = Object.fromEntries(GRAPHICS_PRESETS.map((p) => [p.id, p.values['anisotropic-filtering']]));
  assert.deepEqual(values, { low: 'off', medium: 4, high: 8, ultra: 16 }, 'High, how the game ships, is the default');
});
