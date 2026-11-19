// A mod's whole settings (modSettingsOf) answer what a read of each key answers, after every change they depend on:
// a stored setting, the page going online, a room's base roll and a server profile's install. Each caller gets its
// own copy.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOD_SETTINGS,
  modSetting,
  modSettingsOf,
  setModSetting,
  _resetModSettings,
} from '../../src/systems/modSettings.js';
import { asTheRoom } from '../../src/systems/online/onlineLane.js';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import { installProfile, _resetProfileForTests } from '../../src/systems/online/serverProfile.ts';

const VENDOR = 'roleplay-realism';
const page = globalThis as unknown as { location?: { search: string } };

/** What a read of each key answers now, with no memo between. */
function eachKeyRead(vendor: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(MOD_SETTINGS[vendor].keys)) out[key] = modSetting(vendor, key);
  return out;
}

function assertSameAsEachKey(label: string): void {
  assert.deepEqual(modSettingsOf(VENDOR), eachKeyRead(VENDOR), label);
}

afterEach(() => {
  delete page.location;
  _resetProfileForTests();
  _resetModSettings();
});

test('a stored setting reaches the next read', () => {
  assertSameAsEachKey('defaults');
  setModSetting(VENDOR, 'bedSleeping', false);
  assertSameAsEachKey('after a write');
  assert.equal(modSettingsOf(VENDOR).bedSleeping, false);
});

test('the page going online and back reaches the next read', () => {
  page.location = { search: '' };
  setModSetting(VENDOR, 'bedSleeping', false);
  assert.equal(modSettingsOf(VENDOR).bedSleeping, false);
  page.location.search = '?world&online';
  assertSameAsEachKey('online');
  assert.equal(modSettingsOf(VENDOR).bedSleeping, true, 'online the room holds the mod whole: its shipped default');
  page.location.search = '?world';
  assertSameAsEachKey('offline again');
  assert.equal(modSettingsOf(VENDOR).bedSleeping, false);
});

test('a room base roll reads the shipped defaults, and the player value after it', () => {
  setModSetting(VENDOR, 'bedSleeping', false);
  assert.equal(modSettingsOf(VENDOR).bedSleeping, false);
  const inRoll = asTheRoom(() => modSettingsOf(VENDOR));
  assert.equal(inRoll.bedSleeping, true);
  assert.deepEqual(
    inRoll,
    asTheRoom(() => eachKeyRead(VENDOR)),
  );
  assert.equal(modSettingsOf(VENDOR).bedSleeping, false);
});

test('an installed profile that frees a key reaches the next read', () => {
  page.location = { search: '?world&online' };
  setModSetting(VENDOR, 'bedSleeping', false);
  assert.equal(modSettingsOf(VENDOR).bedSleeping, true);
  const wholeMods = { ...OFFICIAL_PROFILE.pins.wholeMods, [VENDOR]: ['bedSleeping'] };
  installProfile({ ...OFFICIAL_PROFILE, pins: { ...OFFICIAL_PROFILE.pins, wholeMods } }, 'test-profile');
  assertSameAsEachKey('after the install');
  assert.equal(modSettingsOf(VENDOR).bedSleeping, false);
});

test('each caller gets its own copy', () => {
  const first = modSettingsOf(VENDOR);
  first.bedSleeping = 'written by a caller';
  assert.notEqual(modSettingsOf(VENDOR), first);
  assertSameAsEachKey('a caller wrote to its copy');
});
