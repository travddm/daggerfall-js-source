// UMRandom (src/formats/umRandom.js) is compared with a recording of the implementation it replaced
// (test/fixtures/umRandomParity.json): streams made by createFromIndex and by the constructor over edge and swept
// uint32 values, read with nextFloat, nextFloatRange and nextIntRange, alone and interleaved.
//
// The terrain's beach jitter and nature, the weather, the world clock and the underwater decorations all draw from
// these streams, so every number must match exactly: one value off moves a tree or changes a day's weather.
//
// The recording was made through the module's public API at commit 9b97eb3ff5, with recordUmRandom from
// umRandomSweep.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UMRandom } from '../../src/formats/umRandom.js';
import { recordUmRandom } from './umRandomSweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../fixtures/umRandomParity.json', import.meta.url), 'utf8'),
);
// Through JSON as the recording was, so a zero's sign and the number formatting compare the same way.
const now = JSON.parse(JSON.stringify(recordUmRandom(UMRandom, inputs)));

/** The path to the first value that differs, or null. */
function firstDifference(expected, actual, path = []) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return path.join('.');
    for (let i = 0; i < expected.length; i++) {
      const found = firstDifference(expected[i], actual[i], [...path, i]);
      if (found !== null) return found;
    }
    return null;
  }
  return Object.is(expected, actual) ? null : path.join('.');
}

for (const section of Object.keys(recorded)) {
  test(`UMRANDOM-PARITY: ${section} matches the recording exactly`, () => {
    const at = firstDifference(recorded[section], now[section]);
    assert.equal(at, null, `${section} differs first at ${at}`);
  });
}

test('UMRANDOM-PARITY: the recording covers every section the sweep records', () => {
  assert.deepEqual(Object.keys(now).sort(), Object.keys(recorded).sort());
});
