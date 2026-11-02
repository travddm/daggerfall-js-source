import '../../modsOff.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIC_STAT_PASS } from '../../../src/systems/enemyExpansion/classic-stat-pass.ts';
import { dexClassicRow } from '../../../src/systems/enemyExpansion/dexInstall.js';
import { VANILLA_ENEMY_BASICS } from '../../../src/characters/enemy/enemyBasics.js';

const BAND = 0.3;
const vanilla = (id: number): Record<string, number> => VANILLA_ENEMY_BASICS[id];
/** A field may move 30% of the base, at least one point (two for armor, whose scale is small). */
const room = (field: string, base: number): number => Math.max(field === 'armorValue' ? 2 : 1, Math.abs(base) * BAND);
const ids = Object.keys(CLASSIC_STAT_PASS).map(Number);

test('every field of a rewritten classic monster is within 30% of Daggerfall Unity', () => {
  assert.ok(ids.length >= 25, 'the mods rewrite about thirty classic monsters');
  for (const id of ids) {
    const base = vanilla(id);
    for (const [field, value] of Object.entries(CLASSIC_STAT_PASS[id])) {
      assert.ok(base[field] !== undefined, `${id} ${field}: the base row has the field`);
      assert.ok(
        Math.abs(value - base[field]) <= room(field, base[field]) + 1e-9,
        `${id} ${field}: ${value} against ${base[field]}`,
      );
    }
  }
});

test('the mean health and damage of each rewritten monster stay near the base row', () => {
  const sum = (r: Record<string, number>): number =>
    ['', '2', '3'].reduce((s, n) => s + (r['maxDamage' + n] ? (r['minDamage' + n] + r['maxDamage' + n]) / 2 : 0), 0);
  for (const id of ids) {
    const base = vanilla(id);
    const row = { ...base, ...CLASSIC_STAT_PASS[id] };
    const health = (row.minHealth + row.maxHealth) / (base.minHealth + base.maxHealth);
    assert.ok(health >= 0.65 && health <= 1.35, `${id} health x${health.toFixed(2)}`);
    const damage = sum(row) / sum(base);
    assert.ok(damage >= 0.65 && damage <= 1.35, `${id} damage x${damage.toFixed(2)}`);
  }
});

test('the outliers the mods made are pulled in', () => {
  const zombie = { ...vanilla(17), ...CLASSIC_STAT_PASS[17] };
  assert.ok(zombie.minDamage + zombie.maxDamage > 10, 'the zombie is not left almost harmless');
  assert.ok(
    CLASSIC_STAT_PASS[16].maxHealth <= Math.round(vanilla(16).maxHealth * 1.3),
    'the giant is not 3 or 4 times DFU health',
  );
  assert.ok(
    CLASSIC_STAT_PASS[37].maxHealth <= Math.round(vanilla(37).maxHealth * 1.3),
    'the flesh atronach is not 2.5 times DFU health',
  );
});

test('the mods rows come out with the pass written over them', () => {
  for (const id of ids) {
    const row = dexClassicRow(id, vanilla(id), { mudex: true }) as Record<string, number>;
    for (const [field, value] of Object.entries(CLASSIC_STAT_PASS[id]))
      assert.equal(row[field], value, `${id} ${field}`);
  }
});
