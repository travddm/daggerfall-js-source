// B4: the affix bands sit near Daggerfall's enchantment strength, and Legendary stays a clear step above Rare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFFIX_RANGES, LEGENDARIES, validAffix } from '../../../src/systems/loot/lootRarity.js';

const mid = ([low, high]) => (low + high) / 2;
const TAMED = [
  'damage',
  'armor',
  'stat',
  'resist',
  'skill',
  'elemental',
  'leech',
  'thorns',
  'focus',
  'slayer',
  'castSpeed',
  'potency',
  'wellspring',
];

test('each tamed kind climbs from Magic to Rare to Legendary, and Legendary is a clear step over Rare', () => {
  for (const kind of TAMED) {
    const band = AFFIX_RANGES[kind];
    assert.ok(mid(band.magic) <= mid(band.rare), `${kind}: Magic is no stronger than Rare`);
    assert.ok(
      mid(band.legendary) >= 1.4 * mid(band.rare),
      `${kind}: Legendary mid ${mid(band.legendary)} against Rare mid ${mid(band.rare)}`,
    );
  }
});

test('the damage and armor lines are about half of what the first ladder paid', () => {
  assert.deepEqual(AFFIX_RANGES.damage.legendary, [12, 24]);
  assert.deepEqual(AFFIX_RANGES.armor.legendary, [7, 12]);
  assert.ok(AFFIX_RANGES.damage.rare[1] <= 15 && AFFIX_RANGES.stat.rare[1] <= 6);
});

test('every Legendary record holds its lines inside the Legendary band, so a tooltip prints what applies', () => {
  for (const record of LEGENDARIES) {
    for (const line of record.affixes) {
      assert.ok(validAffix(line), `${record.id}: ${line.id} ${line.value}`);
      const band = AFFIX_RANGES[line.id]?.legendary;
      if (band)
        assert.ok(line.value >= band[0] && line.value <= band[1], `${record.id}: ${line.id} ${line.value} in ${band}`);
    }
  }
});
