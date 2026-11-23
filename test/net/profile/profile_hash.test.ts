// P0 SERVER PROFILE: the profile's hash (`ph`) names the profile as written, whatever order its keys are in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalJson, profileHashOf, PROFILE_HASH_RE } from '../../../src/net/profile/profileHash.ts';
import { OFFICIAL_PROFILE } from '../../../src/net/profile/officialProfile.ts';

test('P0 THE CANONICAL FORM: keys sorted at every depth, arrays in their own order, no whitespace; a value JSON cannot hold is refused (mutants: keys unsorted; arrays sorted; NaN written)', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 1], c: 'x' } }), '{"a":{"c":"x","d":[3,1]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.throws(() => canonicalJson({ a: Number.NaN }));
  assert.throws(() => canonicalJson({ a: () => 1 }));
});

test('P0 THE HASH: SHA-256 of the canonical form as 64 hex digits; key order does not move it, any value does (mutants: the raw JSON hashed; a pin left out)', async () => {
  const ph = await profileHashOf({ schema: 1, rules: {}, pins: { prefs: { a: true } } });
  assert.match(ph, PROFILE_HASH_RE);
  assert.equal(ph, createHash('sha256').update('{"pins":{"prefs":{"a":true}},"rules":{},"schema":1}').digest('hex'));
  assert.equal(ph, await profileHashOf({ pins: { prefs: { a: true } }, rules: {}, schema: 1 }));
  assert.notEqual(ph, await profileHashOf({ schema: 1, rules: {}, pins: { prefs: { a: false } } }));
  assert.notEqual(
    ph,
    await profileHashOf({ schema: 1, rules: { 'repair.allowMagic': true }, pins: { prefs: { a: true } } }),
    'decision 5: the written profile is hashed, so a default written out is another profile',
  );
  assert.match(await profileHashOf(OFFICIAL_PROFILE), PROFILE_HASH_RE);
});

test('P0 THE WIRE SHAPE: 64 lowercase hex digits and nothing else', () => {
  assert.ok(PROFILE_HASH_RE.test('a'.repeat(64)));
  for (const bad of ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), ''])
    assert.equal(PROFILE_HASH_RE.test(bad), false, bad);
});
