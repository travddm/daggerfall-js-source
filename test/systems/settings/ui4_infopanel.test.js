import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setValue, resetToDefaults, LIVE } from '../../../src/systems/settings/settings.js';

// UI4 - THE ITEM INFO PANEL (DaggerfallInventoryWindow :303-307). Setup
// only ADDS the panel when EnableInventoryInfoPanel is on, so with it
// off there is no ITEM00I0 cutout and no text in that rect - the plain
// background shows through. It ships True, which is why the port
// drawing it unconditionally has looked right all along.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('UI4: it ships True, so the default is unchanged, and the key is LIVE', () => {
  resetToDefaults();
  setValue('GUI', 'EnableInventoryInfoPanel', false);
  resetToDefaults();
  assert.equal(LIVE['GUI/EnableInventoryInfoPanel'], 'src/ui/native/nativeInventory.js');
});

