// FT5 - ENHANCED AI, THE ROW MOVES.
//
// The navmesh-driven enemy motor's switch (12-Enhanced-AI) left the
// Enhanced category for the home. The audit found its words still true
// - dungeons only, the crowd and the doors ahead - and one thing to
// say that nothing said: it shares half a name with DFU's own
// Enhancements/EnhancedCombatAI ("Smarter Enemies"), which is a
// different feature: DFU's own setting, which this layer sits on top of
// (decision 117). Not a merge; the DFU key stays in Settings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, checkFeature, featureForControl } from '../../src/systems/features.js';
import { PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';
import { tierOf } from '../../src/systems/settings/settings.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('FT5: the registry row - Enhanced only, over the pref, on by default (BAL4), sound', () => {
  const f = FEATURES.find((x) => x.id === 'enhanced-ai');
  assert.ok(f);
  assert.deepEqual(f.kinds, ['enhanced'], 'the port\'s own; DFU\'s EnhancedCombatAI is a different thing and wears no label here');
  assert.deepEqual(f.control, { store: 'prefs', key: 'enhancedAI', initial: true, online: 'room',   // RF4: the row declares its default and the lane's answer
    also: [{ store: 'prefs', key: 'telegraphContrast', initial: false, online: 'player' }], parts: [{ key: 'telegraphContrast', label: 'Telegraph contrast' }] });
  assert.equal(PREF_DEFAULTS.enhancedAI, true, 'BAL4: on by default - the classic motor one choice away');
  assert.equal(f.effect, 'Takes effect at once; pathfinding from the next dungeon you enter.');   // AUDIT TACT D7: the tactics, cover and blows read the switch live; only the navmesh waits
  assert.deepEqual(checkFeature(f), []);
  assert.equal(featureForControl('prefs', 'enhancedAI'), f);
});

test('FT5: the note says what ships and names what it is not', () => {
  const f = FEATURES.find((x) => x.id === 'enhanced-ai');
  assert.equal(f.note, 'Enemies take turns, back off when hurt, and archers keep their distance. Big attacks are marked on the '
    + 'ground: hit hard to stagger them or dodge. Red, hatched attacks can’t be stopped. Trees, rocks and crates block '
    + 'sight and missiles. Pathfinding works in dungeons only for now; towns, interiors and doors come later. Off keeps '
    + 'the classic behavior.');
  // ...and the DFU key it names is DFU's own setting, live in Settings, not a row on the home
  assert.equal(tierOf('Enhancements/EnhancedCombatAI'), 'live');
  assert.equal(featureForControl('settings', 'Enhancements/EnhancedCombatAI'), null, 'not rowed on the home: it is a DFU setting, not a port feature');
});

