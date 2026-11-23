// FT10 - DFU'S OWN DUNGEON ENHANCEMENTS:
// Enemies Fight Each Other, Varied Dungeon Monsters, Torches Light Your
// Way - three of the Enhancements section's switches, DFU Classic. Each
// is read by the port at its point of use as DFU reads it, and each
// row's note says what DFU ships it as - pinned against the baked
// defaults, so a re-bake cannot make the note lie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, checkFeature, featureForControl } from '../../src/systems/features.js';
import { DEFAULTS, tierOf } from '../../src/systems/settings/settings.js';
import { labelOf } from '../../src/ui/settings/settingsCopy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const ROWS = [
  ['enemy-infighting', 'Enhancements/EnemyInfighting', 'True', 'Takes effect at once.'],
  ['varied-dungeon-monsters', 'Enhancements/AlternateRandomEnemySelection', 'False', 'Takes effect on the next dungeon you enter.'],
  ['torches-from-items', 'Enhancements/PlayerTorchFromItems', 'False', 'Takes effect at once; new characters and shop stock follow it.'],
];

test('FT10: three DFU Classic rows over live DFU keys, titled as the settings pane titles them, sound', () => {
  for (const [id, key, , effect] of ROWS) {
    const f = FEATURES.find((x) => x.id === id);
    assert.ok(f, id);
    assert.deepEqual(f.kinds, ['classic'], `${id}: DFU's own`);
    assert.deepEqual(f.control, { store: 'settings', key });
    assert.equal(tierOf(key), 'live', `${key} is read by the port`);
    assert.equal(f.title, labelOf(key), `${id}: one name here and on the pointer row in Settings`);
    assert.equal(f.effect, effect);
    assert.deepEqual(checkFeature(f), []);
    assert.equal(featureForControl('settings', key), f);
  }
});

test('FT10: each note says what Daggerfall Unity ships it as, and the baked default agrees', () => {
  for (const [id, key, def] of ROWS) {
    const [sec, k] = key.split('/');
    assert.equal(DEFAULTS[sec][k], def, `${key} ships ${def}`);
    const f = FEATURES.find((x) => x.id === id);
    assert.match(f.note, def === 'True' ? /On by default in Daggerfall Unity\.$/ : /Off by default in Daggerfall Unity\.$/, `${id}: the note's last sentence is the default`);
  }
});

