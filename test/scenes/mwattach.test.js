// MWFIX - THE ATTACH FLOW'S THREE DEFECTS, each pinned at the shape
// that let it happen. Reported from retail: "in the enhanced settings
// you're unable to upload by pressing the button", and "instead the
// upload appears for a split second when starting a new game and then
// appears after creating your character, and after uploading does not
// work at all". Three separate faults, one report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_PICKER_Z } from '../../src/scenes/dataSource.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Every z-index literal in src/, with where it came from. */
function zIndexLiterals() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/z-index:\s*(\d+)/g)) {
        out.push({ file: full.slice(ROOT.length + 1), z: Number(m[1]) });
      }
    }
  };
  walk(join(ROOT, 'src'));
  return out;
}

test('MWFIX 1: the asset picker OUTRANKS every overlay in src/ - the gate, not an eyeballed number', () => {
  // THE DEFECT: the picker stood at 11 while the enhanced shell that
  // opens it stands at 12, so "Attach data" built a full-screen modal
  // BEHIND an opaque pane. Measured in a real browser before the fix:
  // document.elementFromPoint at the file input's own centre answered
  // a shell element, and the input was not the hit target.
  const all = zIndexLiterals();
  assert.ok(all.length > 5, `the sweep found the landscape (${all.length} literals)`);
  const above = all.filter((x) => x.z >= ASSET_PICKER_Z);
  assert.deepEqual(above, [],
    `nothing may stand at or above the picker (${ASSET_PICKER_Z}); found: ${above.map((x) => `${x.file}=${x.z}`).join(', ')}`);
  // and the shell it is opened from is genuinely below it
  const shell = all.find((x) => x.file === 'src/ui/enhanced/enhancedMenu.js');
  assert.ok(shell && shell.z < ASSET_PICKER_Z, 'the enhanced shell sits below the picker it opens');
});

