// FT13 - THE MOVED ROWS LEAVE THE SETTINGS PANE. FT1 drew a key whose switch lives on the Features
// home as a POINTER row on the settings pane, the Mods page and the
// pause door; Mac read those as the options still being there. A moved
// key draws nothing now: movedRow answers null, every caller appends
// only what it is handed, and every list that draws or counts keys
// filters the moved ones out first (paneKeys). The category map stays
// total - a key LIVES in its category; the pane shows the keys that
// still live on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, featureForControl } from '../../src/systems/features.js';
import { CATEGORY_IDS, keysOf } from '../../src/ui/settings/settingsMap.js';
import { MOD_SETTINGS } from '../../src/systems/modSettings.js';
import '../../src/world/landView.js';
import '../../src/world/outdoors.js';
import '../../src/systems/featureLanes.js';   // FT18: the wind, the quick slots and the blood lanes register themselves too

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('FT13: the moved keys are real, are many, and stay in the total category map', () => {
  const moved = CATEGORY_IDS.flatMap((c) => keysOf(c)).filter((k) => featureForControl('settings', k));
  assert.ok(moved.length >= 10, `the home carries settings keys (${moved.length})`);
  for (const k of ['Experimental/SmallerDungeons', 'Experimental/TerrainDistance', 'Video/RandomDungeonTextures', 'Enhancements/EnemyInfighting', 'Enhancements/GuildQuestListBox']) {
    assert.ok(moved.includes(k), `${k} lives on the home and in its category`);
  }
  const movedMods = Object.keys(MOD_SETTINGS).filter((v) => featureForControl('mods', 'Enabled', v));
  assert.ok(movedMods.length >= 5, `the mods with a switch on the home (${movedMods.length})`);
  assert.ok(FEATURES.some((f) => f.control.store === 'settings'));
});

