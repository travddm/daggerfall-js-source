import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPose, validFoeRecord } from '../../src/net/wire.js';

test("a pose carries the player's live Stealth and half-speed state, bounded and omitted at 0", () => {
  const base = { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 };
  const sent = validPose({ ...base, sk: 40, hv: 1 });
  assert.equal(sent.sk, 40);
  assert.equal(sent.hv, 1);
  const bare = validPose(base);
  assert.equal('sk' in bare, false, 'a pose without Stealth keeps the bytes it had');
  assert.equal('hv' in bare, false);
  assert.equal(validPose({ ...base, sk: 900 }).sk, 100, 'the wire bounds the skill');
  assert.equal('sk' in validPose({ ...base, sk: -3 }), false);
});

test("a foe record names the minute of its stealth check at a peer, inside the wire's bound", () => {
  assert.equal(validFoeRecord({ i: 3, sc: 77 }).sc, 77);
  // A bad `sc` is dropped and the record stands: the field only times a Stealth tally (net/stealth-wire.ts).
  assert.deepEqual(validFoeRecord({ i: 3, sc: 0x10000 }), { i: 3 });
  assert.deepEqual(validFoeRecord({ i: 3, sc: 1.5 }), { i: 3 });
  assert.equal('sc' in validFoeRecord({ i: 3 }), false);
});
