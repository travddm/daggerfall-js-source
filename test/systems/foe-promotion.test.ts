import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROMOTION,
  promotionHash,
  promotionTierOf,
  promotionTrait,
  scalePromoted,
  markPromotions,
  type PromotionRecord,
} from '../../src/systems/foe-promotion.ts';

const options = (over: Partial<Parameters<typeof markPromotions>[2]> = {}): Parameters<typeof markPromotions>[2] => ({
  eliteOpen: true,
  championOpen: true,
  traits: 5,
  kindLevel: () => 10,
  eliteSeed: (index: number) => index + 1000,
  ...over,
});
const records = (n: number): PromotionRecord[] => Array.from({ length: n }, () => ({ mobileType: 7 }));

test('both tiers are rare and an elite is the stronger step', () => {
  const { elite, champion } = PROMOTION;
  assert.ok(elite.perMille >= 5 && elite.perMille <= 20, 'elites stand at about 1% to 2%');
  assert.ok(champion.perMille >= 5 && champion.perMille <= 20, 'champions stand at about 1% to 2%');
  assert.ok(elite.health > champion.health && elite.damage > champion.damage);
  assert.equal(elite.health, 2);
  assert.equal(elite.damage, 1.3);
});

test('one hash falls into the elite band, the champion band, or neither, in proportion to the bands', () => {
  const counts = { elite: 0, champion: 0, none: 0 };
  const rolls = 200000;
  for (let i = 0; i < rolls; i++) counts[promotionTierOf(promotionHash(i, 7, 0x10071)) ?? 'none']++;
  assert.ok(Math.abs(counts.elite / rolls - PROMOTION.elite.perMille / 1000) < 0.002);
  assert.ok(Math.abs(counts.champion / rolls - PROMOTION.champion.perMille / 1000) < 0.002);
  assert.equal(promotionTierOf(0), 'elite');
  assert.equal(promotionTierOf(PROMOTION.elite.perMille), 'champion');
  assert.equal(promotionTierOf(PROMOTION.elite.perMille + PROMOTION.champion.perMille), null);
});

test('a trait index stays inside the trait count', () => {
  for (let i = 0; i < 500; i++) {
    const trait = promotionTrait(promotionHash(i), 5);
    assert.ok(Number.isInteger(trait) && trait >= 0 && trait < 5);
  }
});

test('marking is the same on every client and never marks one record twice', () => {
  const a = records(4000);
  const b = records(4000);
  const marked = markPromotions(a, 'location 12', options());
  assert.equal(markPromotions(b, 'location 12', options()), marked);
  assert.deepEqual(a, b);
  assert.ok(marked > 0);
  assert.equal(markPromotions(a, 'location 12', options()), 0, 'a marked record is left as it is');
  for (const r of a) assert.ok(!(r.eliteFoe && r.champion != null), 'never both tiers');
  const elites = a.filter((r) => r.eliteFoe);
  const champions = a.filter((r) => r.champion != null);
  assert.ok(elites.length > 0 && champions.length > elites.length, 'champions outnumber elites');
  assert.ok(elites.every((r) => typeof r.eliteSeed === 'number'));
});

test('an ally, a passive foe, and a kind under the level floor are not elites', () => {
  const pool = records(6000);
  pool.forEach((r, i) => {
    if (i % 3 === 0) r.allied = true;
    if (i % 3 === 1) r.reaction = 'passive';
  });
  markPromotions(pool, 5, options());
  assert.ok(pool.filter((r) => r.allied || r.reaction === 'passive').every((r) => !r.eliteFoe && r.champion == null));
  const low = records(6000);
  markPromotions(low, 5, options({ kindLevel: () => PROMOTION.minLevel - 1 }));
  assert.equal(low.filter((r) => r.eliteFoe).length, 0, 'no elite under the level floor');
  assert.ok(low.filter((r) => r.champion != null).length > 0, 'a champion is checked against the level at the build');
});

test('a closed tier marks nothing of its kind', () => {
  const noElites = records(6000);
  markPromotions(noElites, 9, options({ eliteOpen: false }));
  assert.equal(noElites.filter((r) => r.eliteFoe).length, 0);
  const noChampions = records(6000);
  markPromotions(noChampions, 9, options({ championOpen: false }));
  assert.equal(noChampions.filter((r) => r.champion != null).length, 0);
});

test('scaling multiplies health once and the blows, and a puppet keeps its owner health', () => {
  const own = { maxHealth: 50, health: 30, healthMult: 1, damageScale: 1 };
  scalePromoted(own, PROMOTION.elite);
  assert.equal(own.maxHealth, 100);
  assert.equal(own.health, 100);
  assert.equal(own.healthMult, 2);
  assert.equal(own.damageScale, 1.3);
  const puppet: { maxHealth: number; health: number; damageScale?: number } = { maxHealth: 50, health: 50 };
  scalePromoted(puppet, { ...PROMOTION.champion, ownHealth: false });
  assert.equal(puppet.maxHealth, 50);
  assert.equal(puppet.damageScale, PROMOTION.champion.damage);
});
