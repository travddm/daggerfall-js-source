import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { HERO_THREAT, heroThreat, heroThreatOf } from '../../src/systems/heroThreat.js';
import { applyHeroThreat } from '../../src/characters/enemy/enemyEntity.js';

const ladder = (on) => {
  _resetForTests();
  setPref('lootRarity', on);
};

test('a hero at or under level 30 meets the foe as its row has it', () => {
  for (const level of [1, 10, 29, 30]) assert.deepEqual(heroThreat(level), { damage: 1, health: 1, steps: 0 });
  for (const bad of [NaN, undefined, null, Infinity, -Infinity, '40']) assert.equal(heroThreat(bad).steps, 0);
});

test('past level 30 each level compounds, and level 45 is the top', () => {
  const top = heroThreat(45);
  assert.equal(top.steps, 15);
  assert.equal(top.damage, HERO_THREAT.damage ** 15);
  assert.equal(top.health, HERO_THREAT.health ** 15);
  assert.deepEqual(heroThreat(1000), top, 'nothing pays past the cap');
  assert.deepEqual(heroThreat(45.9), top);
  assert.ok(heroThreat(36).damage > heroThreat(35).damage && heroThreat(36).health > heroThreat(35).health);
});

test('the top is about one and a half times a foe in the fight power of the balance harness', () => {
  const top = heroThreat(45);
  const fightFactor = Math.sqrt(top.damage * top.health);
  assert.ok(fightFactor > 1.4 && fightFactor < 1.6, `fight factor ${fightFactor}`);
  assert.ok(top.damage > top.health, 'most of the step is in the blow');
});

test('the reader gives nothing under the cap, nothing with the ladder off, and a puppet only its blows', () => {
  ladder(true);
  assert.equal(heroThreatOf({ level: 30 }), null);
  assert.equal(heroThreatOf(null), null);
  const mine = heroThreatOf({ level: 40 });
  assert.equal(mine.steps, 10);
  const puppet = heroThreatOf({ level: 40 }, { puppet: true });
  assert.equal(puppet.health, 1);
  assert.equal(puppet.damage, mine.damage);
  ladder(false);
  assert.equal(heroThreatOf({ level: 45 }), null);
});

test('a built foe takes the threat on its health, its poise and its blows', () => {
  const hero = heroThreat(45);
  const foe = { maxHealth: 100, health: 100, damageScale: 1.5 };
  applyHeroThreat(foe, hero);
  assert.equal(foe.maxHealth, Math.round(100 * hero.health));
  assert.equal(foe.health, foe.maxHealth);
  assert.equal(foe.healthMult, hero.health);
  assert.equal(foe.damageScale, 1.5 * hero.damage);
  const untouched = { maxHealth: 100, health: 60 };
  applyHeroThreat(untouched, null);
  assert.deepEqual(untouched, { maxHealth: 100, health: 60 });
});
