// LINT-RATCHET: the comparison and the update of tools/lintRatchet.mjs, on made-up measurements, and that the
// committed ratchet is readable and in the form the script writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHECKS, RATCHET_PATH, compare, readRatchet, serialize, updated } from '../../tools/lintRatchet.mjs';

const empty = () => Object.fromEntries(CHECKS.map((c) => [c, {}]));
const with_ = (check, entries) => ({ ...empty(), [check]: entries });

test('LINT-RATCHET: a recorded figure that grows, and a new offender, fail; one that falls only shows as fallen', () => {
  const ratchet = with_('max-lines', { 'src/a.js': 2000, 'src/b.js': 1500 });
  const { grown, added, fallen } = compare(
    with_('max-lines', { 'src/a.js': 2001, 'src/b.js': 1400, 'src/c.js': 1001 }),
    ratchet,
  );
  assert.deepEqual(
    grown.map((g) => g.key),
    ['src/a.js'],
  );
  assert.deepEqual(
    added.map((g) => g.key),
    ['src/c.js'],
  );
  assert.deepEqual(
    fallen.map((g) => g.key),
    ['src/b.js'],
  );
});

test('LINT-RATCHET: a file that left the offenders (or was deleted) is fallen to zero', () => {
  const { fallen } = compare(empty(), with_('no-unused-vars', { 'src/a.js': 3 }));
  assert.deepEqual(fallen, [{ check: 'no-unused-vars', key: 'src/a.js', was: 3, now: 0 }]);
});

test('LINT-RATCHET: --update lowers and drops figures and never raises or adds one; --allow-new takes the measurement', () => {
  const ratchet = with_('max-lines', { 'src/a.js': 2000, 'src/b.js': 1500, 'src/gone.js': 1200 });
  const measured = with_('max-lines', { 'src/a.js': 2100, 'src/b.js': 1400, 'src/c.js': 1001 });
  assert.deepEqual(updated(measured, ratchet, false)['max-lines'], { 'src/a.js': 2000, 'src/b.js': 1400 });
  assert.deepEqual(updated(measured, ratchet, true)['max-lines'], measured['max-lines']);
});

test('LINT-RATCHET: the committed ratchet is the form serialize writes, one entry a line and sorted', () => {
  const text = readFileSync(RATCHET_PATH, 'utf8');
  assert.equal(serialize(readRatchet()), text);
  assert.deepEqual(Object.keys(JSON.parse(text)), CHECKS);
});
