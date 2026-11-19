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

// A mod the room holds whole online, and a switch of it that is on by default, not left to the player and not set by
// the room: online it reads its shipped value whatever the player stored.
const roomKeys = OFFICIAL_PROFILE.pins.modKeys as Record<string, Record<string, unknown>>;
const wholeMods = OFFICIAL_PROFILE.pins.wholeMods as Record<string, readonly string[]>;
const declared = MOD_SETTINGS as Record<string, { keys: Record<string, { default: unknown }> }>;
const VENDOR = Object.keys(wholeMods).find((vendor) => declared[vendor] && switchOf(vendor)) as string;
const KEY = switchOf(VENDOR) as string;

function switchOf(vendor: string): string | undefined {
  return Object.entries(declared[vendor].keys).find(
    ([key, def]) =>
      def.default === true && !wholeMods[vendor].includes(key) && !Object.hasOwn(roomKeys[vendor] ?? {}, key),
  )?.[0];
}
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
  setModSetting(VENDOR, KEY, false);
  assertSameAsEachKey('after a write');
  assert.equal(modSettingsOf(VENDOR)[KEY], false);
});

test('the page going online and back reaches the next read', () => {
  page.location = { search: '' };
  setModSetting(VENDOR, KEY, false);
  assert.equal(modSettingsOf(VENDOR)[KEY], false);
  page.location.search = '?world&online';
  assertSameAsEachKey('online');
  assert.equal(modSettingsOf(VENDOR)[KEY], true, 'online the room holds the mod whole: its shipped default');
  page.location.search = '?world';
  assertSameAsEachKey('offline again');
  assert.equal(modSettingsOf(VENDOR)[KEY], false);
});

test('a room base roll reads the shipped defaults, and the player value after it', () => {
  setModSetting(VENDOR, KEY, false);
  assert.equal(modSettingsOf(VENDOR)[KEY], false);
  const inRoll = asTheRoom(() => modSettingsOf(VENDOR));
  assert.equal(inRoll[KEY], true);
  assert.deepEqual(
    inRoll,
    asTheRoom(() => eachKeyRead(VENDOR)),
  );
  assert.equal(modSettingsOf(VENDOR)[KEY], false);
});

test('an installed profile that frees a key reaches the next read', () => {
  page.location = { search: '?world&online' };
  setModSetting(VENDOR, KEY, false);
  assert.equal(modSettingsOf(VENDOR)[KEY], true);
  const freed = { ...OFFICIAL_PROFILE.pins.wholeMods, [VENDOR]: [KEY] };
  installProfile({ ...OFFICIAL_PROFILE, pins: { ...OFFICIAL_PROFILE.pins, wholeMods: freed } }, 'test-profile');
  assertSameAsEachKey('after the install');
  assert.equal(modSettingsOf(VENDOR)[KEY], false);
});

test('each caller gets its own copy', () => {
  const first = modSettingsOf(VENDOR);
  first[KEY] = 'written by a caller';
  assert.notEqual(modSettingsOf(VENDOR), first);
  assertSameAsEachKey('a caller wrote to its copy');
});
