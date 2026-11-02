import assert from 'node:assert/strict';
import { test } from 'node:test';
import { killGoldScale, killGoldFromRange, KILL_GOLD_LOG_SLOPE } from '../../../src/systems/loot/kill-gold.ts';
import { unlevelDroppedLoot } from '../../../src/systems/unleveledLoot.js';
import { goldStack } from '../../../src/systems/inventory.js';

test('a body pays its table range once at level 1 and grows with the log of the level', () => {
  assert.equal(killGoldScale(1), 1);
  assert.ok(Math.abs(killGoldScale(10) - (1 + KILL_GOLD_LOG_SLOPE * Math.log(10))) < 1e-9);
  for (let level = 2; level <= 45; level++)
    assert.ok(killGoldScale(level) > killGoldScale(level - 1), `level ${level}`);
});

test('gold grows early and flattens late: the first ten levels add more than the last thirty-five', () => {
  const early = killGoldScale(10) - killGoldScale(1);
  const late = killGoldScale(45) - killGoldScale(10);
  assert.ok(early > late, `early ${early} against late ${late}`);
  assert.ok(killGoldScale(45) < 8, "a level-45 body pays a handful of times a level-1 body, never DFU's forty-five");
});

test('a stack is never under 1 coin and a bad level reads as level 1', () => {
  assert.equal(killGoldFromRange(0, 30), 1);
  assert.equal(killGoldScale(Number.NaN), 1);
  assert.equal(killGoldScale(-4), 1);
});

test('a killed body with Unleveled Loot on pays the table range by the curve, not by the level', () => {
  const level = 30;
  const range = 40;
  const entity = { items: [goldStack(range * level)], basics: {}, mobileType: 0 };
  unlevelDroppedLoot(entity, { rolls: () => 0, luck: 0, level, r: null });
  const gold = entity.items.find((item) => item.group === 'Currency');
  assert.equal(gold.stackCount, killGoldFromRange(range, level));
  assert.ok(gold.stackCount < range * level, "less than DFU's level multiple");
  assert.ok(gold.stackCount > range, 'more than the flat mod');
});
