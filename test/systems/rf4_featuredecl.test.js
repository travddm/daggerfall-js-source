// RF4 - ONE FEATURE DECLARATION. A new switch used to touch four places: the pref default on
// the uiPrefs shelf, the online lane's forced or player's-own list, the
// registry row, and the count pins. The row is the one declaration now
// - `initial` and `online` ride it - and the shelf and the lane DERIVE
// theirs. The registry sits UNDER the stores: it imports neither, and
// the condensed rows' lanes register themselves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, FEATURE_PREF_DEFAULTS, FEATURE_PREF_ONLINE, registerFeatureLane, featureLane, resolveControl, checkFeature } from '../../src/systems/features.js';
import { PREF_DEFAULTS, getPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { ONLINE_FORCED_PREFS, ONLINE_PLAYERS_OWN_PREFS, declareOnlinePrefs, onlineForcedPref } from '../../src/systems/online/onlineLane.js';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import '../../src/world/landView.js';
import '../../src/world/outdoors.js';
import '../../src/systems/featureLanes.js';   // FT18: the wind, the quick slots and the blood lanes register themselves too

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('RF4: every prefs row declares its switch, and the shelf and the lane derive theirs from the rows', () => {
  const prefsRows = FEATURES.filter((f) => f.control.store === 'prefs');
  assert.ok(prefsRows.length >= 8);
  // FT18: a condensed row declares the prefs it covers too, on its `also` - the rows those keys had are gone, and the
  // row that covers a key is its one declaration
  const declared = prefsRows.flatMap((f) => [[f, f.control], ...(f.control.also ?? []).filter((a) => a.store === 'prefs').map((a) => [f, a])]);
  assert.ok(declared.length > prefsRows.length, 'the covered prefs are declared');
  for (const [f, c] of declared) {
    assert.ok(c.initial !== undefined, `${f.id} declares ${c.key}'s initial`);
    assert.ok(['room', 'player'].includes(c.online), `${f.id} declares ${c.key}'s online answer`);   // P0 SERVER PROFILE: the room's value is the profile's pin
    assert.equal(PREF_DEFAULTS[c.key], c.initial, `${f.id}: the shelf's default for ${c.key} is the row's`);
    if (c.online === 'player') { assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes(c.key), `${c.key}: the player's online, by name`); assert.ok(!Object.hasOwn(ONLINE_FORCED_PREFS, c.key)); }
    else assert.equal(ONLINE_FORCED_PREFS[c.key], OFFICIAL_PROFILE.pins.prefs[c.key], `${c.key}: forced online at the profile's pin`);
  }
  assert.deepEqual(FEATURE_PREF_DEFAULTS, Object.fromEntries(declared.map(([, c]) => [c.key, c.initial])));
  assert.deepEqual(FEATURE_PREF_ONLINE, Object.fromEntries(declared.map(([, c]) => [c.key, c.online])));
  // the two the registry has no row for stay the lane's own
  assert.equal(Object.hasOwn(ONLINE_FORCED_PREFS, 'skin'), false, 'OVH3: the skin is the player\'s online'); assert.equal(Object.hasOwn(ONLINE_FORCED_PREFS, 'mwArms'), false, 'MWA4: the arms\' switch is retired - the attached files are it');
  // and the shelf reads them live: loot rarity ON offline (LR5) and forced on online
  _resetForTests();
  assert.equal(getPref('lootRarity'), true);
  assert.equal(onlineForcedPref('lootRarity', '?online=1'), true);
  assert.equal(onlineForcedPref('grassDensity', '?online=1'), undefined, 'a dial is the player\'s');
});

test(`RF4: the lane door - 'player' leaves a switch to the player by name, idempotent; any other answer declares nothing, since the room's switches are the server profile's pins (P0 SERVER PROFILE)`, () => {
  const forced = { ...ONLINE_FORCED_PREFS };
  declareOnlinePrefs({ rf4x: 'room', rf4y: 'player', rf4z: true, rf4q: 42 });
  try {
    assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes('rf4y') && !Object.hasOwn(ONLINE_FORCED_PREFS, 'rf4y'));
    declareOnlinePrefs({ rf4y: 'player' });
    assert.equal(ONLINE_PLAYERS_OWN_PREFS.filter((k) => k === 'rf4y').length, 1, 'idempotent');
    for (const k of ['rf4x', 'rf4z', 'rf4q']) assert.ok(!ONLINE_PLAYERS_OWN_PREFS.includes(k), k);
    assert.deepEqual({ ...ONLINE_FORCED_PREFS }, forced, 'the rows force nothing: the profile does');
  } finally {
    const i = ONLINE_PLAYERS_OWN_PREFS.indexOf('rf4y'); if (i >= 0) ONLINE_PLAYERS_OWN_PREFS.splice(i, 1);
  }
});

test('RF4: the registry sits under the stores - it imports neither, the lanes register themselves, and a row resolves its lane at use', () => {
  assert.ok(featureLane('landView') && featureLane('outdoors'));
  assert.equal(featureLane('nope'), null);
  registerFeatureLane('rf4-lane', { tiers: [[1, 'One'], [2, 'Two']], read: () => 2, write: () => {} });
  const row = { id: 'r', title: 'R', note: 'n', group: 'sight', kinds: ['enhanced'], control: { store: 'prefs', key: 'rf4key', initial: 1, online: 'player', lane: 'rf4-lane' } };
  assert.deepEqual(checkFeature(row), []);
  assert.equal(resolveControl(row).read(), 2, 'the lane\'s read, at use');
  assert.equal(resolveControl(row).tiers.length, 2);
  assert.equal(resolveControl({ control: { store: 'prefs', key: 'k' } }).store, 'prefs', 'a row with no lane resolves to itself');
  assert.deepEqual(checkFeature({ ...row, control: { ...row.control, lane: 'missing' } }), ["lane 'missing' is not registered"]);
});
