// AUDIT 24, wave 28: the twelve-slice sweep's combat/entity findings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateSuccessfulHit } from '../../src/combat/formulas.js';
import { NUMBER_BODY_PARTS } from '../../src/systems/armorMaterials.js';
import { assignStartingGear } from '../../src/systems/startingGear.js';

const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('audit24 wave28: a fresh character is UNARMOURED at 100, not 0', () => {
  assert.equal(NUMBER_BODY_PARTS, 7);

  // and the equip path really does not rebuild it for the starting kit
  const kit = { items: [], equip: null, armorValues: null, stats: { strength: 50, agility: 50, luck: 50 } };
  assignStartingGear(kit, { classIndex: 0 });
  assert.equal(kit.armorValues, null, 'the shirt and pants never reach armorValuesOf - which is why the null was fatal');
});

test('audit24 wave28: the to-hit armour term has NO scalar fallback', () => {
  const A = { skills: 40, stats: { strength: 50, agility: 60, luck: 50 } };
  const base = { skills: 40, stats: { strength: 50, agility: 50, luck: 50 } };
  const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

  // 40 + 100 + 1 - 10 - 50 = 81
  const unarmoured = { ...base, armorValues: new Array(7).fill(100) };
  assert.equal(calculateSuccessfulHit(A, unarmoured, 40, 0, seq(0.99, 0.80)), true);
  assert.equal(calculateSuccessfulHit(A, unarmoured, 40, 0, seq(0.99, 0.81)), false);

  // the same target with only the legacy scalar contributes ZERO -
  // 40 + 0 + 1 - 10 - 50 = -19, clamped to the 3% floor
  const scalarOnly = { ...base, armor: 100 };
  assert.equal(calculateSuccessfulHit(A, scalarOnly, 40, 0, seq(0.99, 0.02)), true);
  assert.equal(calculateSuccessfulHit(A, scalarOnly, 40, 0, seq(0.99, 0.03)), false);
});

