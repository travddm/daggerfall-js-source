// A cell's hello gate is spent after the token, by account: tokenless junk hellos never make a real player's hello busy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeRoom } from '../fakeRoom.mjs';
import { HELLO_HZ_MAX, PIXEL_UNITS, validPose } from '../../src/net/wire.js';

const BX = 300,
  BY = 200;
const CELL = `world:${Math.floor(BX / 16)},${Math.floor(BY / 16)}`;
const standing = () =>
  validPose({ x: (BX + 0.5) * PIXEL_UNITS, y: 0, z: (499 - BY + 0.5) * PIXEL_UNITS, yaw: 0, pitch: 0, mv: 1, ts: 0 });

test("tokenless hellos at a cell spend nobody's gate; one account's own reconnect loop is busy", async () => {
  const realNow = Date.now;
  const clock = 1_800_000_000_000;
  Date.now = () => clock;
  try {
    const R = fakeRoom(CELL, { now: () => clock });
    for (let i = 0; i < HELLO_HZ_MAX * 3; i++) {
      const junk = R.connect();
      await R.hello(junk, `junk-${String(i).padStart(4, '0')}`, standing(), { tok: null });
      assert.notEqual(junk.closed?.code, 1013, 'a tokenless hello is refused for its token, never busy');
    }
    const real = R.connect();
    await R.hello(real, 'real-0001', standing());
    assert.ok(
      real.sent.some((m) => m.t === 'welcome'),
      'a real player in the same instant is admitted',
    );
    let last = null;
    for (let i = 0; i < HELLO_HZ_MAX + 1; i++) {
      last = R.connect();
      await R.hello(last, 'loop-0001', standing());
    }
    assert.equal(last.closed?.code, 1013, 'its own loop is busy');
  } finally {
    Date.now = realNow;
  }
});
