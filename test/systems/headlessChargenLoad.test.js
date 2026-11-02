// A `?class=N&load` boot must not run the headless chargen: it is async and finishes after the save is loaded on a slow
// machine, replacing the loaded pack and adding a start purse (the save probe's flake, tools/probes/06-save.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { headlessChargenWanted } from '../../src/systems/chargenSession.js';

const params = (q) => new URLSearchParams(q);

test('?class=N on a new character runs the headless chargen', () => {
  assert.equal(headlessChargenWanted({ chargenDone: false }, params('class=1')), true);
});

test('?class=N&load leaves the character to the save', () => {
  assert.equal(headlessChargenWanted({ chargenDone: false }, params('class=1&load')), false);
});

test('a made character, or no ?class, runs nothing', () => {
  assert.equal(headlessChargenWanted({ chargenDone: true }, params('class=1')), false);
  assert.equal(headlessChargenWanted({ chargenDone: false }, params('world')), false);
});
