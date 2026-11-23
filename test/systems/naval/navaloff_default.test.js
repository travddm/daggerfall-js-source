// NAVAL-OFF: the sea fight (the features row `naval-combat`) is off by default and has no online lane; Come Sail Away's own
// switch (a mod's `Enabled`) is not touched, so the boat, rowing and cargo stand with the fight off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../../../src/systems/features.js';
import { getPref, setPref, _resetForTests as _resetPrefs } from '../../../src/systems/uiPrefs.js';
import { modSetting, _resetModSettings } from '../../../src/systems/modSettings.js';
import { onlineForcedPref } from '../../../src/systems/online/onlineLane.js';
import { enableTestSea } from '../../../src/systems/testRoom.js';

const row = () => FEATURES.find((r) => r.id === 'naval-combat');

test('NAVAL-OFF: the fight is off on a fresh shelf, offline', () => {
  _resetPrefs();
  assert.equal(row().control.initial, false);
  assert.equal(getPref('naval'), false);
});

test('NAVAL-OFF: online the fight is off whatever the shelf says (no longer forced on)', () => {
  _resetPrefs();
  setPref('naval', true);
  assert.equal(getPref('naval'), true, 'offline the player may turn it on');
  assert.equal(onlineForcedPref('naval', '?online'), false, 'online the lane answers off');
  _resetPrefs();
});

test('NAVAL-OFF: the fight switch leaves Come Sail Away alone, and the test sea still turns both on', () => {
  _resetModSettings();
  _resetPrefs();
  const csaDefault = modSetting('come-sail-away', 'Enabled');
  assert.equal(getPref('naval'), false);
  assert.equal(modSetting('come-sail-away', 'Enabled'), csaDefault, 'the fight pref does not touch the mod');
  enableTestSea();
  assert.equal(getPref('naval'), true);
  assert.equal(modSetting('come-sail-away', 'Enabled'), true);
  _resetModSettings();
  _resetPrefs();
});
