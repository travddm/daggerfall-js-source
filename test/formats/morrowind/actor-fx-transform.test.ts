// The sizing of a spell effect on an actor that is not a person (src/formats/morrowind/mw-actor-fx-size.ts) was
// rewritten as a rule over the person the effect meshes are modelled around, without the engine source it had been
// ported from. These tests run it over the bodies of actor-fx-sweep.mjs and compare every answer with the recording of
// the implementation it replaced (test/fixtures/mw/actor-fx-parity.json, made from mwSpellFx.js at commit dcbd882446),
// and pin the rule on bodies worked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  actorFxTransform,
  PERSON_HEIGHT_UNITS,
  PERSON_REACH_UNITS,
} from '../../../src/formats/morrowind/mw-actor-fx-size.ts';
import { actorBodies, GAME_UNITS_PER_METRE } from './actor-fx-sweep.mjs';

// Loaded by a computed path: mwSpellFx.js reaches modules the Node type pass cannot check.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const spellFx = await load('formats/morrowind/mwSpellFx.js');

const { recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/actor-fx-parity.json', import.meta.url), 'utf8'),
);

test('every body of the sweep is sized as recorded', () => {
  const bodies = actorBodies();
  assert.equal(bodies.length, recorded.bodies);
  assert.equal(bodies.length, recorded.answers.length);
  bodies.forEach(([height, radius, units], index) => {
    const [scale, offset] = recorded.answers[index];
    const now = actorFxTransform(height, radius, units);
    const body = `height ${height}, radius ${radius}, ${units} units to the metre`;
    // The recording is JSON, which keeps no sign on a zero: a body of no height gives a negative zero.
    assert.equal(now.scale, scale, `scale: ${body}`);
    assert.equal(now.offset + 0, offset, `offset: ${body}`);
  });
});

test('mwSpellFx.js answers with the same rule', () => {
  assert.equal(spellFx.actorFxTransform, actorFxTransform);
});

test('the sweep reaches the scaled bodies, the offset bodies and the bodies with neither', () => {
  const answers: [number, number][] = recorded.answers;
  assert.ok(answers.some(([scale]) => scale > 1));
  assert.ok(answers.some(([scale]) => scale === 1));
  assert.ok(answers.some(([, offset]) => offset < 0));
  assert.ok(answers.some(([, offset]) => offset === 0));
});

test('the person the effects are modelled around is 128 units tall, with a reach of 64', () => {
  assert.equal(PERSON_HEIGHT_UNITS, 128);
  assert.equal(PERSON_REACH_UNITS, 64);
});

test('a body no larger than a person is not scaled, and a short one is set down by its shortfall', () => {
  const person = actorFxTransform(1.8, 0.45, GAME_UNITS_PER_METRE);
  assert.equal(person.scale, 1);
  const ratio = (2 * 0.45 * GAME_UNITS_PER_METRE) / 64;
  assert.ok(Math.abs(person.offset - (1.8 * GAME_UNITS_PER_METRE - 128) * ratio) < 1e-9);
  assert.deepEqual(
    actorFxTransform(1, 0.1, 64),
    { scale: 1, offset: -32 },
    'a 64-unit body: its 64 short, times the ratio of a half',
  );
});

test('the reach is the greatest of the width, the depth and half the height, over 64', () => {
  assert.equal(actorFxTransform(4, 0.1, 64).scale, 2, 'half the height: 128 over 64');
  assert.equal(actorFxTransform(1, 3, 64).scale, 6, 'the width: 2 * 3 * 64 = 384 over 64');
});

test('a tall, narrow body has no offset', () => {
  assert.equal(actorFxTransform(4, 0.1, 64).offset, 0);
});

test('a body at least as tall as a person but less than twice as tall as it is wide is set down by its excess', () => {
  const wide = actorFxTransform(2.4, 1.4, GAME_UNITS_PER_METRE);
  assert.equal(wide.offset, (128 - 2.4 * GAME_UNITS_PER_METRE) * wide.scale);
  const narrow = actorFxTransform(2.4, 0.4, GAME_UNITS_PER_METRE);
  assert.equal(narrow.offset, 0);
});
