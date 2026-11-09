// P0 SERVER PROFILE: the page's profile - installed once at the front door, read by rule() and by the lane's tables -
// and the "no play change" proof: the lane's tables under the official profile are the base commit's, key for key.
// JavaScript, not TypeScript: it runs the browser modules (the lane, the settings, the registry), which the Node type
// check (tsconfig.node.json) cannot read without the DOM's types.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { OFFICIAL_PROFILE } from '../../../src/net/profile/officialProfile.ts';
import { profileHashOf } from '../../../src/net/profile/profileHash.ts';
import { RELAY_VERSION } from '../../../src/net/wire.js';
import {
  activePins,
  installProfile,
  installedProfileHash,
  profileErrors,
  profileMatches,
  rule,
  _resetProfileForTests,
} from '../../../src/systems/online/serverProfile.ts';
import { openProfileDoor, profileUrlOf } from '../../../src/systems/online/profileDoor.ts';
import * as lane from '../../../src/systems/online/onlineLane.js';
import { getBool, _resetForTests as resetSettings } from '../../../src/systems/settings/settings.js';
import { MOD_SETTINGS, onlineModSetting } from '../../../src/systems/modSettings.js';
import { FEATURE_PREF_ONLINE } from '../../../src/systems/features.js';

/** The base commit's lane tables (857275eee9), dumped by running its own onlineLane.js with its registry's answers. */
const BASE = JSON.parse(readFileSync(new URL('./online-lane-base.json', import.meta.url), 'utf8'));
const OFFICIAL_PH = await profileHashOf(OFFICIAL_PROFILE);
const withRules = (rules) => ({ ...OFFICIAL_PROFILE, rules });

afterEach(() => {
  _resetProfileForTests();
  resetSettings();
});

test('P0 NO PLAY CHANGE: under the official profile the lane forces exactly what the base forced - every pref, every DFU setting, every mod key and every whole mod (mutants: a pin dropped in the move; a pin added; a whole mod freed)', () => {
  assert.deepEqual({ ...lane.ONLINE_FORCED_PREFS }, BASE.prefs);
  assert.deepEqual(JSON.parse(JSON.stringify(lane.ONLINE_FORCED_SETTINGS)), BASE.settings);
  assert.deepEqual(JSON.parse(JSON.stringify(lane.ONLINE_ROOM_MOD_KEYS)), BASE.modKeys);
  assert.deepEqual(JSON.parse(JSON.stringify(lane.ONLINE_WHOLE_MODS)), BASE.wholeMods);
  for (const [key, value] of Object.entries(BASE.prefs)) {
    assert.equal(lane.onlineForcedPref(key, '?online'), value, key);
    assert.equal(lane.onlineForcedPref(key, ''), undefined, `${key}: offline the player's`);
  }
  // every mod key reads online what it read on the base: the room's pin, a whole mod's shipped default, or the player's
  for (const [vendor, mod] of Object.entries(MOD_SETTINGS)) {
    for (const [key, def] of Object.entries(mod.keys)) {
      const pinned = BASE.modKeys[vendor] && Object.hasOwn(BASE.modKeys[vendor], key);
      const whole = Object.hasOwn(BASE.wholeMods, vendor) && !BASE.wholeMods[vendor].includes(key);
      const want = pinned ? BASE.modKeys[vendor][key] : whole ? def.default : undefined;
      assert.deepEqual(onlineModSetting(vendor, key, '?online'), want, `${vendor}/${key}`);
    }
  }
});

test("P0 THE ROOM'S ROWS: a Features row that says `room` is pinned in the profile, and every pin is such a row (mutants: a row forced with no pin; a pin with no row)", () => {
  const room = Object.entries(FEATURE_PREF_ONLINE)
    .filter(([, a]) => a === 'room')
    .map(([k]) => k)
    .sort();
  assert.deepEqual(room, Object.keys(OFFICIAL_PROFILE.pins.prefs).sort());
  assert.ok(Object.values(FEATURE_PREF_ONLINE).every((a) => a === 'room' || a === 'player'));
});

test("P0 rule(): single player reads the key's offline value (none where it is the player's own setting); an online page with nothing installed reads the official profile; an installed profile wins; an unknown key throws (mutants: the installed value ignored; offline reading the online default)", () => {
  assert.equal(rule('repair.allowMagic', ''), undefined, "offline: the player's own AllowMagicRepairs");
  assert.equal(rule('repair.allowMagic', '?online'), true);
  installProfile(withRules({ 'repair.allowMagic': false }), 'f'.repeat(64));
  assert.equal(rule('repair.allowMagic', '?online'), false);
  assert.throws(() => rule('no.such.key'), /no profile key/);
});

test("P0 ON60 END TO END ON THE SETTINGS READ PATH: online, AllowMagicRepairs is the profile key's value in DFU's strings - True by default, False when a profile picks DFU's value; offline the player's own (mutants: the setting read off the old table; the key's value not mapped)", () => {
  const g = globalThis;
  const was = g.location;
  try {
    g.location = { search: '?online' };
    assert.equal(getBool('Controls', 'AllowMagicRepairs'), true);
    installProfile(withRules({ 'repair.allowMagic': false }), 'f'.repeat(64));
    assert.equal(getBool('Controls', 'AllowMagicRepairs'), false);
    assert.deepEqual(JSON.parse(JSON.stringify(lane.ONLINE_FORCED_SETTINGS)), {
      Controls: { AllowMagicRepairs: 'False' },
    });
    g.location = { search: '' };
    assert.equal(lane.onlineForcedSetting('Controls', 'AllowMagicRepairs'), undefined, 'offline the store answers');
  } finally {
    g.location = was;
  }
});

test("P0 INSTALL: a profile this build cannot play is refused whole; an installed one is frozen, named by its hash, and the lane's tables follow it (mutants: install unvalidated; the tables left on the official pins)", () => {
  assert.throws(
    () => installProfile({ schema: 1, rules: { 'no.key': 1 }, pins: OFFICIAL_PROFILE.pins }, 'a'.repeat(64)),
    /unknown key/,
  );
  assert.throws(
    () => installProfile({ schema: 1, rules: {}, pins: { prefs: [], modKeys: {}, wholeMods: {} } }, 'a'.repeat(64)),
    /pins.prefs/,
  );
  assert.equal(installedProfileHash(), null);
  const other = { ...OFFICIAL_PROFILE, pins: { ...OFFICIAL_PROFILE.pins, prefs: { landforms: false } } };
  installProfile(other, 'b'.repeat(64));
  assert.equal(installedProfileHash(), 'b'.repeat(64));
  assert.ok(Object.isFrozen(activePins().prefs));
  assert.deepEqual({ ...lane.ONLINE_FORCED_PREFS }, { landforms: false });
  assert.equal(lane.onlineForcedPref('naval', '?online'), undefined);
});

test("P0 THE WELCOME'S CHECK: a page matches only the hash it installed; with none installed it matches a welcome that names none", () => {
  assert.equal(profileMatches(undefined), true);
  assert.equal(profileMatches(OFFICIAL_PH), false);
  installProfile(OFFICIAL_PROFILE, OFFICIAL_PH);
  assert.equal(profileMatches(OFFICIAL_PH), true);
  assert.equal(profileMatches('c'.repeat(64)), false);
  assert.equal(profileMatches(undefined), false);
});

const params = (search) => new URLSearchParams(search);
const answer =
  (body, ok = true) =>
  async () => ({ ok, json: async () => body });

test("P0 THE FRONT DOOR: an online page fetches /profile from its relay, checks the version and its own hash of what it got, and installs it; anything else is refused in the player's words before the world boots (mutants: the relay's hash trusted; the version unread; a bad profile installed)", async () => {
  assert.equal(profileUrlOf('wss://relay.example/'), 'https://relay.example/profile');
  assert.equal(profileUrlOf('ws://localhost:8787'), 'http://localhost:8787/profile');
  assert.equal(profileUrlOf('http://elsewhere'), null);
  let asked = null;
  await openProfileDoor(
    params('server=wss://relay.example'),
    () => {},
    async () => {
      throw new Error('an offline page asks nothing');
    },
  );
  await openProfileDoor(
    params('online&server=wss://relay.example'),
    () => {},
    async (url) => {
      asked = url;
      return { ok: true, json: async () => ({ v: RELAY_VERSION, ph: OFFICIAL_PH, profile: OFFICIAL_PROFILE }) };
    },
  );
  assert.equal(asked, 'https://relay.example/profile');
  assert.equal(installedProfileHash(), OFFICIAL_PH);
  _resetProfileForTests();
  const said = [];
  const say = (w) => said.push(w);
  const online = params('online&server=wss://relay.example');
  await assert.rejects(
    openProfileDoor(online, say, answer({ v: 'world1', ph: OFFICIAL_PH, profile: OFFICIAL_PROFILE })),
    /different versions/,
  );
  await assert.rejects(
    openProfileDoor(online, say, answer({ v: RELAY_VERSION, ph: 'd'.repeat(64), profile: OFFICIAL_PROFILE })),
    /newer version/,
  );
  await assert.rejects(
    openProfileDoor(online, say, answer({ v: RELAY_VERSION, ph: OFFICIAL_PH, profile: { schema: 9 } })),
    /newer version/,
  );
  await assert.rejects(openProfileDoor(online, say, answer({}, false)), /did not answer/);
  await assert.rejects(
    openProfileDoor(online, say, async () => {
      throw new Error('offline');
    }),
    /did not answer/,
  );
  assert.equal(said.length, 5, "each refusal is said on the boot's status line");
  assert.equal(installedProfileHash(), null, 'nothing installed by a refused door');
  await openProfileDoor(online, say, answer({ v: RELAY_VERSION, ph: OFFICIAL_PH, profile: OFFICIAL_PROFILE }));
  assert.equal(installedProfileHash(), OFFICIAL_PH);
  assert.deepEqual(profileErrors(OFFICIAL_PROFILE), []);
});
