// X9: DISPEL UNDEAD (6,1) and DISPEL DAEDRA (6,2) - the two creature
// dispels. The destroy law has been in mysticism.js since before
// anything could call it; X4 built the scan; this is the join.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySpell, DISPEL_GROUP, isDispelCreature } from '../../src/systems/effects.js';
import { buildCustomSpell, blankEffectSettings } from '../../src/systems/spell/spellMaker.js';
import { effectByKey } from '../../src/systems/spell/spellEffects.js';
import { NEARBY, updateNearbyObjects, getNearbyObjects } from '../../src/systems/nearbyObjects.js';
import { dispelNearby } from '../../src/systems/mysticism.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const caster = () => ({ stats: { luck: 50, willpower: 50 }, skills: [], activeEffects: [], level: 1 });
const cast = (subType, chanceBase = 70) => applySpell(
  buildCustomSpell({ slots: [{ type: 6, subType, settings: { ...blankEffectSettings(), chanceBase, chanceMod: 0 } }], rangeType: 0 }),
  1, caster(), {}, () => 0.99, null, {});

test('X9: the two CREATURE dispels answer a group and a chance; Dispel MAGIC is not one of them', () => {
  assert.deepEqual({ ...DISPEL_GROUP }, { 1: NEARBY.Undead, 2: NEARBY.Daedra });
  assert.equal(isDispelCreature({ type: 6, subType: 1 }), true);
  assert.equal(isDispelCreature({ type: 6, subType: 2 }), true);
  assert.equal(isDispelCreature({ type: 6, subType: 0 }), false, 'Dispel Magic dispels BUNDLES, not creatures');
  assert.equal(effectByKey('6,1').ported, true);
  assert.equal(effectByKey('6,2').ported, true);
  // X10 gave 6,0 its picker, so it is ported too - but it is still not
  // a CREATURE dispel, which is what this predicate is about.
  assert.equal(effectByKey('6,0').ported, true, 'Dispel Magic ships its own arm since X10');
});

test('X9: ChanceFunction.Custom - the cast never fails, the chance travels', () => {
  // The roll happens PER OBJECT inside Start, so the cast-time gate
  // must not run. The cast below rolls 0.99 against 70 - a certain
  // failure for an ordinary chance-gated effect.
  const out = cast(1);
  assert.equal(out.skipped, 0, 'the library honours Dispel Undead now');
  assert.equal(out.chanceFailed, undefined, 'no cast-time gate');
  assert.deepEqual(out.dispel, { group: NEARBY.Undead, chance: 70 });
  assert.deepEqual(cast(2, 40).dispel, { group: NEARBY.Daedra, chance: 40 });
  // self-targeted: nothing is attached to the caster
  const e = caster();
  applySpell(buildCustomSpell({ slots: [{ type: 6, subType: 1, settings: { ...blankEffectSettings() } }], rangeType: 0 }),
    1, e, {}, () => 0.5, null, {});
  assert.deepEqual(e.activeEffects, [], 'no entry, no duration - it acts once and is done');
});

test('X9: the sweep takes only the matching group, and rolls PER OBJECT', () => {
  const skeleton = { id: 'skel' }, lich = { id: 'lich' }, daedra = { id: 'daedra' }, rat = { id: 'rat' };
  const list = updateNearbyObjects([0, 0, 0], {
    entities: [
      { pos: [1, 0, 0], mobileType: 15, ref: skeleton },   // Undead
      { pos: [2, 0, 0], mobileType: 32, ref: lich },       // Undead
      { pos: [3, 0, 0], mobileType: 25, ref: daedra },     // Daedra
      { pos: [4, 0, 0], mobileType: 0, ref: rat },         // Animal
    ],
  });
  const undead = getNearbyObjects(list, NEARBY.Undead).map((no) => no.ref);
  assert.deepEqual(undead, [skeleton, lich], 'the daedra and the rat are not undead');
  // the roll is PER TARGET, not once for the group
  let n = 0;
  assert.deepEqual(dispelNearby(undead, () => (++n % 2 === 1)), [skeleton]);
  assert.deepEqual(dispelNearby(undead, () => true), [skeleton, lich]);
  assert.deepEqual(dispelNearby(undead, () => false), []);
  // Daedra sweeps its own
  assert.deepEqual(getNearbyObjects(list, NEARBY.Daedra).map((no) => no.ref), [daedra]);
});

test('X9: the 14-unit reach is the scan default - the dispel does not aim', () => {
  // TargetFlags_Self: it lands on the caster and sweeps around them,
  // so range is the nearby list's, not a spell setting.
  const near = { id: 'near' }, far = { id: 'far' };
  const list = updateNearbyObjects([0, 0, 0], {
    entities: [{ pos: [13, 0, 0], mobileType: 15, ref: near }, { pos: [15, 0, 0], mobileType: 15, ref: far }],
  });
  assert.deepEqual(getNearbyObjects(list, NEARBY.Undead).map((no) => no.ref), [near]);
});

