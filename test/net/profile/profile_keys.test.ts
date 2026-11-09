// P0 SERVER PROFILE: every key declares DFU's value and today's online value, and a profile is read against the registry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROFILE_KEYS,
  PROFILE_SCHEMA,
  profileKeyOf,
  profileRuleErrors,
  resolveRules,
  validProfileValue,
  type ProfileKey,
} from '../../../src/net/profile/profileKeys.ts';
import { OFFICIAL_PROFILE } from '../../../src/net/profile/officialProfile.ts';

const rows = Object.entries(PROFILE_KEYS) as [string, ProfileKey][];

test('P0 THE REGISTRY: every key names its census rows, its feature, who reads it and its words, and its DFU and online values fit its own type (mutants: a key without dfu; an online value of the wrong type)', () => {
  assert.ok(rows.length >= 1);
  for (const [name, key] of rows) {
    assert.ok(key.census.length && key.census.every((c) => /^ON\d+$/.test(c)), `${name}: census rows`);
    assert.ok(key.feature, `${name}: feature`);
    assert.ok(key.checkedBy.includes('client'), `${name}: the client reads every key`);
    assert.ok(key.words.startsWith('profile.'), `${name}: an l10n key`);
    assert.ok(validProfileValue(key, key.dfu), `${name}: dfu fits its type`);
    assert.ok(validProfileValue(key, key.online), `${name}: online fits its type`);
    const offline = key.offline;
    if (typeof offline === 'object')
      assert.match(offline.setting, /^\w+\.\w+$/, `${name}: an offline setting is Section.Key`);
    else assert.ok(validProfileValue(key, offline), `${name}: offline fits its type`);
  }
});

test("P0 ON60, THE FIRST KEY: repair.allowMagic is DFU false, online true, the player's own AllowMagicRepairs offline", () => {
  const key = profileKeyOf('repair.allowMagic');
  assert.deepEqual(
    [key?.dfu, key?.online, key?.offline, key?.setting],
    [false, true, { setting: 'Controls.AllowMagicRepairs' }, 'Controls.AllowMagicRepairs'],
  );
  assert.equal(profileKeyOf('no.such.key'), null);
  assert.equal(profileKeyOf('toString'), null, 'a name the object inherits is no key');
});

test('P0 A PROFILE READ AGAINST THE REGISTRY: another schema, an unknown key and a bad value are refused by name; the official profile is clean (mutants: unknown keys let through; values unchecked)', () => {
  assert.deepEqual(profileRuleErrors(OFFICIAL_PROFILE), []);
  assert.deepEqual(profileRuleErrors({ schema: PROFILE_SCHEMA, rules: { 'repair.allowMagic': false } }), []);
  assert.deepEqual(profileRuleErrors({ schema: 2, rules: {} }), ['schema 2']);
  assert.deepEqual(profileRuleErrors({ schema: PROFILE_SCHEMA, rules: { 'rest.anywhere': true } }), [
    'unknown key rest.anywhere',
  ]);
  assert.deepEqual(profileRuleErrors({ schema: PROFILE_SCHEMA, rules: { 'repair.allowMagic': 'True' } }), [
    'bad value for repair.allowMagic',
  ]);
  assert.deepEqual(profileRuleErrors(null), ['not a profile']);
});

test('P0 RESOLVED RULES: a written value wins, every other key reads its online default', () => {
  assert.equal(resolveRules({})['repair.allowMagic'], true);
  assert.equal(resolveRules({ 'repair.allowMagic': false })['repair.allowMagic'], false);
  assert.deepEqual(Object.keys(resolveRules({})).sort(), rows.map(([n]) => n).sort());
});

test('P0 TYPES AND BOUNDS: an int, a number, an enum and a string are each held to their own law', () => {
  const base = {
    census: ['ON0'],
    feature: 'T',
    dfu: 0,
    online: 0,
    offline: 0,
    checkedBy: ['client'],
    words: 'profile.t',
  } as const;
  const int: ProfileKey = { ...base, type: 'int', min: 0, max: 10 };
  assert.deepEqual(
    [3, -1, 11, 1.5, '3'].map((v) => validProfileValue(int, v)),
    [true, false, false, false, false],
  );
  const num: ProfileKey = { ...base, type: 'number', min: 0 };
  assert.deepEqual(
    [0.5, -0.1, Number.NaN, Infinity].map((v) => validProfileValue(num, v)),
    [true, false, false, false],
  );
  const en: ProfileKey = { ...base, type: 'enum', values: ['dfu', 'x4'] };
  assert.deepEqual(
    ['x4', 'x16', 4].map((v) => validProfileValue(en, v)),
    [true, false, false],
  );
  const str: ProfileKey = { ...base, type: 'string' };
  assert.deepEqual(
    ['', 1].map((v) => validProfileValue(str, v)),
    [true, false],
  );
});

test("P9 THE TRADE KEYS: trade.saleCap is DFU's no cap online by default; trade.haggleRange keeps the skills inside 0 to 100 online", () => {
  const cap = profileKeyOf('trade.saleCap');
  assert.deepEqual([cap?.dfu, cap?.online, cap?.offline, cap?.type], [false, false, false, 'bool']);
  const range = profileKeyOf('trade.haggleRange');
  assert.deepEqual([range?.dfu, range?.online, range?.offline, range?.type], [false, true, false, 'bool']);
  assert.deepEqual(profileRuleErrors({ schema: PROFILE_SCHEMA, rules: { 'trade.saleCap': true } }), []);
  assert.deepEqual(profileRuleErrors({ schema: PROFILE_SCHEMA, rules: { 'trade.saleCap': 0.5 } }), [
    'bad value for trade.saleCap',
  ]);
});

test("P10 THE PILE GOLD KEY: loot.pileGold is DFU's level multiple online by default, 'flat' the old online rule", () => {
  const key = profileKeyOf('loot.pileGold');
  assert.deepEqual([key?.dfu, key?.online, key?.offline, key?.values], ['dfu', 'dfu', 'dfu', ['dfu', 'flat']]);
  assert.deepEqual(profileRuleErrors({ schema: PROFILE_SCHEMA, rules: { 'loot.pileGold': 'flat' } }), []);
  assert.deepEqual(profileRuleErrors({ schema: PROFILE_SCHEMA, rules: { 'loot.pileGold': 'half' } }), [
    'bad value for loot.pileGold',
  ]);
});

test("P11 THE REST KEY: rest.fireOnly is DFU's rest window online by default; true is the rest act", () => {
  const key = profileKeyOf('rest.fireOnly');
  assert.deepEqual([key?.dfu, key?.online, key?.offline, key?.type], [false, false, false, 'bool']);
});

test("P12 THE GUILD KEYS: guild.promoteNow and guild.seatRanks are DFU's wait and DFU's ranks online by default", () => {
  for (const name of ['guild.promoteNow', 'guild.seatRanks']) {
    const key = profileKeyOf(name);
    assert.deepEqual([key?.dfu, key?.online, key?.offline, key?.type], [false, false, false, 'bool'], name);
  }
});
