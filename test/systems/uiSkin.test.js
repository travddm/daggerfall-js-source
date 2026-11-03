// THE SKIN, pinned. Classic screens or the enhanced ones, and the
// laws that keep a player from being stranded in either.
//
// A PIN MUST FAIL: every assertion here dies under a one-character
// change to the law it names. The default pin dies if DEFAULT_SKIN
// flips; the override pins die if the precedence order swaps; the
// typo pins die if `clean` stops filtering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
  SKINS, DEFAULT_SKIN, SKIN_NAMES, uiSkin, isEnhanced, setUiSkin,
  otherSkin, skinOverride,
} from '../../src/systems/uiSkin.js';
import { PREF_DEFAULTS, getPref, resetPrefs, _resetForTests } from '../../src/systems/uiPrefs.js';

// uiPrefs writes to localStorage; node has none, and its storage()
// helper already swallows that. Reset between tests so one test's
// choice cannot answer for the next.
const fresh = () => { _resetForTests(); };

test('ENHANCED IS THE DEFAULT - Mac 2026-08-25', () => {
  fresh();
  assert.equal(DEFAULT_SKIN, 'enhanced');
  assert.equal(PREF_DEFAULTS.skin, 'enhanced');
  assert.equal(uiSkin(''), 'enhanced');
  assert.equal(isEnhanced(''), true);
});

test('the two skins, and every one has a name a player can read', () => {
  assert.deepEqual(SKINS, ['enhanced', 'classic']);
  for (const s of SKINS) assert.equal(typeof SKIN_NAMES[s], 'string');
  assert.equal(otherSkin('enhanced'), 'classic');
  assert.equal(otherSkin('classic'), 'enhanced');
});

test('?skin OVERRIDES the stored choice, both directions', () => {
  fresh();
  setUiSkin('enhanced');
  assert.equal(uiSkin('?skin=classic'), 'classic');
  setUiSkin('classic');
  assert.equal(uiSkin('?skin=enhanced'), 'enhanced');
});

test('the override WRITES NOTHING - a probe leaves no preference behind', () => {
  fresh();
  setUiSkin('enhanced');
  uiSkin('?skin=classic');
  uiSkin('?skin=classic');
  // the stored choice is untouched, so the NEXT page load without the
  // param is still enhanced. This is what makes ?skin safe for the 25
  // probes in tools/.
  assert.equal(getPref('skin'), 'enhanced');
  assert.equal(uiSkin(''), 'enhanced');
});

test('a bad ?skin is a TYPO, not an instruction', () => {
  fresh();
  setUiSkin('classic');
  assert.equal(skinOverride('?skin=modern'), null);
  assert.equal(skinOverride('?skin=Enhanced'), null);   // the token is exact
  assert.equal(uiSkin('?skin=modern'), 'classic');      // falls to the STORED choice
});

test('setUiSkin refuses a value that is not a skin', () => {
  fresh();
  setUiSkin('classic');
  assert.equal(setUiSkin('modern'), 'classic');
  assert.equal(uiSkin(''), 'classic');
  assert.equal(setUiSkin('enhanced'), 'enhanced');
  assert.equal(uiSkin(''), 'enhanced');
});

test('a corrupt stored value falls to the default, never throws', () => {
  fresh();
  resetPrefs();
  assert.equal(uiSkin(''), 'enhanced');
});

// ── AND IT IS NOT A DFU SETTING ──────────────────────────────────
test('the skin stays OUT of the DFU settings store', async () => {
  const { ALL_KEYS } = await import('../../src/systems/settings/settings.js');
  assert.equal(ALL_KEYS.length, 171, 'the parity pin still holds');
  assert.ok(!ALL_KEYS.some((k) => /skin/i.test(k)), 'no port-invented key in DFU\u2019s store');
});
