// ES1 (2026-09-16, Mac: "lump this in as a new enhanced toggle. Enhanced
// Sounds, add the wind noise to it") + MAC-O6 (Mac's patch: "looting
// gold/items makes no sound"). ONE switch over the port's own sounds:
// the wind loop (WIND3's own row, folded in) and the enhanced
// inventory's transfer cues - DoTransferItem's gold clink and button
// click, which the classic window always played and the enhanced one
// dropped on the floor (`plan.sound`, handed back by planTake/planStore
// and never read).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enhancedSoundsOn, ENHANCED_SOUNDS_KEY } from '../../src/systems/enhancedSounds.js';
import { windSoundOn } from '../../src/systems/wind/windAudio.js';
import { FEATURES } from '../../src/systems/features.js';
import { PREF_DEFAULTS, setPref } from '../../src/systems/uiPrefs.js';
import { ONLINE_PLAYERS_OWN_PREFS } from '../../src/systems/online/onlineLane.js';
import { uiSkin, setUiSkin } from '../../src/systems/uiSkin.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');

test('ES1 the row: Enhanced sounds on the Features home where the wind row stood - enhanced, on by default, the player’s own online, the shelf deriving its default (mutant: the key misspelled on either side)', () => {
  const row = FEATURES.find((f) => f.id === 'enhanced-sounds');
  assert.ok(row, 'the row exists');
  assert.equal(row.control.key, ENHANCED_SOUNDS_KEY);
  assert.equal(ENHANCED_SOUNDS_KEY, 'soundEnhancements');
  assert.deepEqual(row.kinds, ['enhanced']);
  assert.equal(row.control.initial, true); assert.equal(row.control.online, 'player'); assert.equal(row.control.store, 'prefs');
  assert.match(row.note, /wind/); assert.match(row.note, /coin clink/);
  assert.equal(PREF_DEFAULTS.soundEnhancements, true, 'RF4: the shelf derives the default from the row');
  assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes('soundEnhancements'), 'the lane leaves it to the player');
  assert.equal(FEATURES.find((f) => f.id === 'wind-sound'), undefined, 'the wind’s own row is gone - it IS this row');
  assert.equal(FEATURES.findIndex((f) => f.id === 'enhanced-sounds'), FEATURES.findIndex((f) => f.id === 'wind') + 1, 'in the wind row’s place (FT18: the wind seen is one row, `wind`)');
  assert.equal(row.group, 'sound', 'FT18: under Sound, with what else is heard');
});

test('ES1 the switch: the enhanced skin and the pref; the wind rides it and keeps its own kill door (mutant: the skin gate dropped, or the wind reading a pref of its own)', () => {
  const skin = uiSkin();
  try {
    setUiSkin('enhanced'); setPref('soundEnhancements', true);
    assert.equal(enhancedSoundsOn(), true);
    assert.equal(windSoundOn(''), true, 'the wind is on with the switch');
    assert.equal(windSoundOn('?windaudio=off'), false, 'the wind’s kill door still silences the wind alone');
    setPref('soundEnhancements', false);
    assert.equal(enhancedSoundsOn(), false);
    assert.equal(windSoundOn(''), false, 'the switch off: no wind');
    setPref('soundEnhancements', true); setUiSkin('classic');
    assert.equal(enhancedSoundsOn(), false, 'the classic skin plays what DFU plays and nothing more');
    assert.equal(windSoundOn(''), false);
  } finally { setUiSkin(skin); setPref('soundEnhancements', true); }
});

