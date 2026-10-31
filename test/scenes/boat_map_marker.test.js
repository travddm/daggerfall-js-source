import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createComeSailAwayAboard } from '../../src/scenes/comeSailAway/comeSailAwayAboard.js';
test('Overworld marker follows rendered boat passenger after joining, not old network pose', () => {
  const aboard = createComeSailAwayAboard({ peers: {}, geometry: () => null });
  aboard.applyRider('passenger', ['owner', 0, 2, 3, 4], 0);
  const raw = [{ id: 'passenger', name: 'Passenger', shown: { x: -900, y: 0, z: -800 } }];
  assert.deepEqual(raw[0].shown, { x: -900, y: 0, z: -800 }, 'network state is unchanged');
});
