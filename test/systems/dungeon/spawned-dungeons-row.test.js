// Spawned dungeons get a Features row, off by default and pinned off in the official profile. On, the
// feature stands where it stood before the row (an online page); offline it never stands.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPAWNED_DUNGEONS_PREF,
  SPAWNED_DUNGEONS_ROW,
  spawnedDungeonsStand,
} from '../../../src/systems/dungeon/spawned-dungeons-row.js';
import { FEATURES, FEATURE_PREF_DEFAULTS } from '../../../src/systems/features.js';
import { OFFICIAL_PROFILE } from '../../../src/net/profile/officialProfile.ts';
import { installProfile, _resetProfileForTests } from '../../../src/systems/online/serverProfile.ts';
import { getPref, setPref, _resetForTests as resetPrefs } from '../../../src/systems/uiPrefs.js';
import { onlineForcedPref, roomPinned } from '../../../src/systems/online/onlineLane.js';
import { createSpawnStand } from '../../../src/scenes/spawnStandHost.js';
import { spawnsDungeon, WORLD_SALT } from '../../../src/world/spawnedDungeons.js';

const ONLINE = new URLSearchParams('online');
const OFFLINE = new URLSearchParams('');
const g = /** @type {any} */ (globalThis);
const pageWas = g.location;

afterEach(() => {
  _resetProfileForTests();
  resetPrefs();
  g.location = pageWas;
});

/** A profile like the official one, with the Spawned dungeons pin set to `on`. */
const profileWith = (on) => ({
  ...OFFICIAL_PROFILE,
  pins: { ...OFFICIAL_PROFILE.pins, prefs: { ...OFFICIAL_PROFILE.pins.prefs, spawnedDungeons: on } },
});

/** The first pixel of the Bay whose roll holds a spawn. */
function spawnPixel() {
  for (let y = 100; y < 400; y++) {
    for (let x = 100; x < 900; x++) if (spawnsDungeon(WORLD_SALT, x, y)) return [x, y];
  }
  throw new Error('no spawn pixel in the search square');
}

/** The spawn host over a world where every gate but the row lets the spawn stand. */
function standHost(params) {
  const cloned = [];
  const host = {
    params,
    maps: { getClimateIndex: () => 0 },
    locationIndex: new Map(),
    terrainGen: { roads: () => null },
    _spawnSalt: WORLD_SALT,
    _spawnGround: () => true,
    _spawnLedger: { expired: () => false, forget() {} },
    _spawnUnroaded: new Set(),
    _insideSpawn: () => false,
    _spawnClock: () => 0,
    _locIndexGen: 0,
    _spawnCloneAt: (px, py) => {
      cloned.push([px, py]);
      return { spawned: true, px, py };
    },
    etherSea: false,
  };
  return { stand: createSpawnStand(host), host, cloned };
}

test('the row is off by default, the room holds it online, and it stands in the Features list', () => {
  assert.equal(SPAWNED_DUNGEONS_ROW.control.key, SPAWNED_DUNGEONS_PREF);
  assert.equal(SPAWNED_DUNGEONS_ROW.control.initial, false);
  assert.equal(SPAWNED_DUNGEONS_ROW.control.online, 'room');
  assert.ok(FEATURES.includes(SPAWNED_DUNGEONS_ROW));
  assert.equal(FEATURE_PREF_DEFAULTS[SPAWNED_DUNGEONS_PREF], false);
});

test('the official profile pins the row off, so an online page reads off whatever the player chose', () => {
  assert.equal(OFFICIAL_PROFILE.pins.prefs.spawnedDungeons, false);
  assert.ok(roomPinned(SPAWNED_DUNGEONS_ROW.control));
  assert.equal(onlineForcedPref(SPAWNED_DUNGEONS_PREF, '?online'), false);
  assert.equal(onlineForcedPref(SPAWNED_DUNGEONS_PREF, ''), undefined, "offline the player's own pref is read");
});

test('spawns stand only on an online page whose room has the row on', () => {
  assert.equal(
    spawnedDungeonsStand(ONLINE, () => true),
    true,
  );
  assert.equal(
    spawnedDungeonsStand(ONLINE, () => false),
    false,
  );
  assert.equal(
    spawnedDungeonsStand(ONLINE, () => undefined),
    false,
  );
  assert.equal(
    spawnedDungeonsStand(OFFLINE, () => true),
    false,
    'offline nothing stands, as before the row',
  );
});

test('online on the official profile, the host stands no spawn on a spawn pixel', () => {
  g.location = { search: '?online' };
  const [x, y] = spawnPixel();
  const { stand, host, cloned } = standHost(ONLINE);
  assert.equal(stand._locationToBuild(x, y), null);
  assert.deepEqual(cloned, []);
  assert.equal(host.locationIndex.size, 0);
});

test('online with a profile that pins the row on, the host stands the spawn as it did before the row', () => {
  g.location = { search: '?online' };
  installProfile(profileWith(true), 'c'.repeat(64));
  const [x, y] = spawnPixel();
  const { stand, host, cloned } = standHost(ONLINE);
  const loc = stand._locationToBuild(x, y);
  assert.deepEqual(loc, { spawned: true, px: x, py: y });
  assert.deepEqual(cloned, [[x, y]]);
  assert.equal(host.locationIndex.get(`${x},${y}`), loc);
});

test('offline the host stands no spawn, even with the row on', () => {
  g.location = { search: '' };
  setPref(SPAWNED_DUNGEONS_PREF, true);
  assert.equal(getPref(SPAWNED_DUNGEONS_PREF), true, 'the player turned the row on');
  const [x, y] = spawnPixel();
  const { stand, cloned } = standHost(OFFLINE);
  assert.equal(stand._locationToBuild(x, y), null);
  assert.deepEqual(cloned, []);
});
