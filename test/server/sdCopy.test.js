// The anonymous walk of the shared Hours is rate limited per client address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sdOpenGate, SD_OPEN_BURST, SD_OPEN_CLIENTS_MAX } from '../../server/src/sdCopy.js';

test('an address gets a burst of walks, then one a second; another address is unaffected; the map stays bounded', () => {
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < SD_OPEN_BURST; i++) assert.equal(sdOpenGate('203.0.113.1', t0), true, `walk ${i + 1}`);
  assert.equal(sdOpenGate('203.0.113.1', t0), false, 'the burst is spent');
  assert.equal(sdOpenGate('203.0.113.2', t0), true, 'another address');
  assert.equal(sdOpenGate('203.0.113.1', t0 + 1100), true, 'a second later');
  for (let i = 0; i < SD_OPEN_CLIENTS_MAX + 10; i++) sdOpenGate(`198.51.100.${i}`, t0);
  assert.equal(sdOpenGate('203.0.113.1', t0 + 1200), true, 'an address forgotten by the bound starts fresh');
});
