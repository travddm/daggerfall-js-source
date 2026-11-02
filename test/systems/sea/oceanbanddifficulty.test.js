// OCEAN BAND DIFFICULTY (systems/sea/oceanBandDifficulty.js): the deeper sea's dungeons are harder, by the band alone.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oceanBandDifficulty, scaleGoldPieces } from '../../../src/systems/sea/oceanBandDifficulty.js';
import { GOLD_TEMPLATE } from '../../../src/systems/inventory.js';
import { ELITE_HEALTH_SCALE, ELITE_DAMAGE_SCALE } from '../../../src/world/spawnedDungeons.js';

test("OCEAN BANDS: the peace and a place that is not the sea's have no factors", () => {
  for (const ring of [0, -1, NaN, undefined]) {
    assert.equal(oceanBandDifficulty({ ring }), null);
    assert.equal(oceanBandDifficulty({ ring, vault: true }), null);
  }
});

test("OCEAN BANDS: a ruin isle grows harder ring by ring, and stays under a vault's step", () => {
  const rings = [1, 2, 3, 4].map((ring) => oceanBandDifficulty({ ring }));
  for (const key of ['health', 'damage', 'loot', 'gold']) {
    for (let i = 1; i < 4; i++) assert.ok(rings[i][key] > rings[i - 1][key], `${key} rises from ring ${i} to ${i + 1}`);
  }
  assert.ok(rings[0].health > 1 && rings[3].health <= 1.4 && rings[3].damage <= 1.15);
  const vault = oceanBandDifficulty({ ring: 4, vault: true });
  assert.ok(
    rings[3].health < vault.health && rings[3].damage < vault.damage,
    'a plain ruin is a smaller step than a vault',
  );
});

test("OCEAN BANDS: the Deep Aether's vault is softer than the Abyss's, about twice the health and under an elite's blows, coin at most 1.25", () => {
  const deep = oceanBandDifficulty({ ring: 3, vault: true }),
    abyss = oceanBandDifficulty({ ring: 4, vault: true });
  for (const key of ['health', 'damage', 'loot', 'gold'])
    assert.ok(deep[key] < abyss[key], `${key}: Deep Aether below the Abyss`);
  assert.ok(abyss.health <= ELITE_HEALTH_SCALE && deep.health >= 1.5, 'about the elite health step');
  assert.ok(abyss.damage > 1 && abyss.damage < ELITE_DAMAGE_SCALE, "blows gentler than an elite dungeon's");
  assert.ok(abyss.gold <= 1.25 && deep.gold <= 1.25);
  assert.deepEqual(
    oceanBandDifficulty({ ring: 1, vault: true }),
    deep,
    "a vault below the Deep Aether is read as the Deep Aether's",
  );
  assert.deepEqual(
    oceanBandDifficulty({ ring: 9 }),
    oceanBandDifficulty({ ring: 4 }),
    'a ring past the Abyss is the Abyss',
  );
});

test('OCEAN BANDS: gold pieces alone are scaled, whole and at least one; a factor of 1 or less changes nothing', () => {
  const gold = { group: 'Currency', templateIndex: GOLD_TEMPLATE, stackCount: 100 };
  const sword = { group: 'Weapons', stackCount: 3 };
  const items = [gold, sword];
  assert.equal(scaleGoldPieces(items, 1.25), items);
  assert.equal(gold.stackCount, 125);
  assert.equal(sword.stackCount, 3);
  scaleGoldPieces(items, 1);
  assert.equal(gold.stackCount, 125);
  assert.equal(scaleGoldPieces(null, 2), null);
});
