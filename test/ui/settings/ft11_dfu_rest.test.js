// FT11 - THE REST OF DFU'S SWITCHES (2026-09-14, the Features arc):
// Combat Voices, Near Death Warning, Bows In Left Hand, Choose Guild
// Jobs, and Dungeon Wall Style - the four booleans left in DFU's
// Enhancements section and the one choice. DFU Classic. The numeric
// tunings of the section (the wait limit, the light scales) are
// settings and stay in Settings: a dial is not a feature.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, checkFeature, featureForControl } from '../../../src/systems/features.js';
import { DEFAULTS, tierOf } from '../../../src/systems/settings/settings.js';
import { ENUM_LAW, widgetFor } from '../../../src/ui/settings/settingsLaw.js';
import { labelOf } from '../../../src/ui/settings/settingsCopy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const BOOLS = [
  ['combat-voices', 'Enhancements/CombatVoices', 'True'],
  ['near-death-warning', 'Enhancements/NearDeathWarning', 'True'],
  ['bows-left-hand', 'Enhancements/BowLeftHandWithSwitching', 'False'],
  ['choose-guild-jobs', 'Enhancements/GuildQuestListBox', 'False'],
];

test('FT11: the four booleans - DFU Classic, live, titled as Settings titles them, each note ending with DFU\'s own default', () => {
  for (const [id, key, def] of BOOLS) {
    const f = FEATURES.find((x) => x.id === id);
    assert.ok(f, id);
    assert.deepEqual(f.kinds, ['classic']); assert.deepEqual(f.control, { store: 'settings', key });
    assert.equal(tierOf(key), 'live', `${key} is read`);
    assert.equal(widgetFor(key), 'switch');
    assert.equal(f.title, labelOf(key));
    const [sec, k] = key.split('/');
    assert.equal(DEFAULTS[sec][k], def);
    assert.match(f.note, def === 'True' ? /On by default in Daggerfall Unity\.$/ : /Off by default in Daggerfall Unity\.$/, id);
    assert.match(f.effect, /^Takes effect /);
    assert.deepEqual(checkFeature(f), []);
    assert.equal(featureForControl('settings', key), f);
  }
});

test('FT11: dungeon wall style - the one choice, its five modes the settings law\'s enum, Classic by default', () => {
  const key = 'Video/RandomDungeonTextures';
  const f = FEATURES.find((x) => x.id === 'dungeon-wall-style');
  assert.ok(f); assert.deepEqual(f.control, { store: 'settings', key, classic: 0 }); assert.equal(f.title, labelOf(key));
  assert.equal(ENUM_LAW[key].values[f.control.classic], 'Classic', 'FT18: what All off sets on a choice with no Off - Daggerfall\'s own table');
  assert.equal(widgetFor(key), 'enum', 'the home draws it as the settings law\'s stepper');
  assert.deepEqual(ENUM_LAW[key].values, ['Classic', 'Climate', 'Climate Only', 'Random', 'Random Only']);
  assert.equal(DEFAULTS.Video.RandomDungeonTextures, '0', 'Classic');
  for (const w of ['Classic', 'Climate', 'Random', 'Climate Only', 'Random Only']) assert.match(f.note, new RegExp(w), `the note names ${w}`);
  assert.match(f.note, /Classic by default in Daggerfall Unity\.$/);
  assert.equal(f.effect, 'Takes effect on the next dungeon you enter.');
  assert.deepEqual(checkFeature(f), []);
});

test('FT11: the port reads each key where DFU reads it', () => {
  // and the dials are NOT rows - a dial is a setting
  for (const key of ['Enhancements/LoiterLimitInHours', 'Enhancements/DungeonAmbientLightScale', 'Enhancements/NightAmbientLightScale', 'Enhancements/PlayerTorchLightScale']) {
    assert.equal(featureForControl('settings', key), null, `${key} stays in Settings`);
  }
});
