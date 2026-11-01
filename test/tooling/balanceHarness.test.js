// The balance harness (tools/balance): the DFU side against hand-worked numbers, the two sides against each other on a
// classic case, and the harness's own promises (determinism, layers that move what they say, the audit's L12 fights).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as dfu from '../../tools/balance/dfu.mjs';
import * as ours from '../../tools/balance/ours.mjs';
import { BUILDS, startSumOf } from '../../tools/balance/builds.mjs';
import { dfuGainForLevel, dfuCeilingLevel, expectedMaxHealth, progressionOf } from '../../tools/balance/progression.mjs';
import { encounterDistribution, representativeFoes, threatScore } from '../../tools/balance/foes.mjs';
import { chooseRandomEnemy } from '../../src/systems/encounters.js';
import { materialAtLevel } from '../../tools/balance/gear.mjs';
import { buildReport, toMarkdown, targetRatio } from '../../tools/balance/report.mjs';
import { ablationMarkdown } from '../../tools/balance/ablate.mjs';
import { parseLayers } from '../../tools/balance/run.mjs';
import { VANILLA_ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';

const near = (actual, expected, tolerance, what) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} vs ${expected}`);
const flat = (value) => ({ strength: value, intelligence: value, willpower: value, agility: value, endurance: value, personality: value, speed: value, luck: value });

test('DFU port: damage modifier, weapon blow and hit chance match worked values', () => {
  assert.equal(dfu.damageModifier(70), 4);
  assert.equal(dfu.damageModifier(49), -1);
  // Longsword 2..16 at Strength 50 and steel (+0): the mean of 2..16 is 9
  assert.equal(dfu.weaponBlow({ template: 120, strength: 50, material: 1 }), 9);
  // Strength 80 adds 6, mithril adds 3: 11..25, mean 18
  assert.equal(dfu.weaponBlow({ template: 120, strength: 80, material: 5 }), 18);
  // 60 to hit, no armour, equal stats, no Dodging, no critical, monster +40 less 50: exactly 50 per cent
  const chance = dfu.hitChance({
    base: 60, armourParts: new Array(7).fill(0), attackerStats: flat(50), targetStats: flat(50), targetDodging: 0, attackerCritical: 0, adjustment: -10,
  });
  assert.equal(chance, 0.5);
});

test('DFU port: a swing at a level-5 monster with 50 skill and a steel longsword hits 27 per cent', () => {
  // 50 + armour 0 + stats 0 - 55/4 (13) + 40 - 50 = 27
  const swing = dfu.playerSwing({
    player: { stats: flat(50), critical: 0 }, weaponSkill: 50, weapon: { template: 120, material: 1 },
    foe: { row: { armorValue: 0, level: 5, minMetalToHit: -1 }, stats: flat(50) },
  });
  assert.equal(swing.chance, 0.27);
  near(swing.perSwing, 0.27 * 9, 1e-12, 'per swing');
});

test('DFU port: a foe that needs a better metal than the weapon\'s takes no damage', () => {
  const swing = dfu.playerSwing({
    player: { stats: flat(50), critical: 100 }, weaponSkill: 100, weapon: { template: 120, material: 1 },
    foe: { row: { armorValue: 0, level: 5, minMetalToHit: 2 }, stats: flat(50) },
  });
  assert.equal(swing.damage, 0);
});

test('DFU port: a monster attack is gated by Reflexes and its critical roll', () => {
  const row = { level: 5, minDamage: 4, maxDamage: 6 };
  const attack = dfu.monsterAttack({ row, foeStats: flat(50), player: { stats: flat(50), armourParts: new Array(7).fill(0), dodging: 0 } });
  // skill 55, no armour, -50: open 5 (10 with a critical, rolled 55 per cent of the time) -> 0.45 x 5 + 0.55 x 10 = 7.75 per cent
  near(attack.chance, 0.0775, 1e-12, 'chance');
  // Average Reflexes lets half the attacks through: 0.5 x 0.0775 x mean damage 5
  near(attack.perAttack, 0.5 * 0.0775 * 5, 1e-12, 'per attack');
});

test('DFU port: swing, shot and monster attack timing', () => {
  near(dfu.meleeSwingSeconds(50), (5 * 3 * 65) / 980, 1e-12, 'swing at Speed 50');
  near(dfu.bowShotSeconds(100), 0.25 + 800 / 980, 1e-12, 'bow at Speed 100');
  near(dfu.monsterAttackSeconds(10), 2250 / 980, 1e-12, 'foe timer at level 10');
  near(dfu.monsterAttackSeconds(20), 1750 / 980, 1e-12, 'foe timer at level 20');
  near(dfu.monsterAttackSeconds(10, 4), 3150 / 980, 1e-12, 'foe timer at slow Reflexes');
});

test('progression: DFU level sums, the 100-skill ceiling and hit points', () => {
  assert.equal(dfuGainForLevel(1), 0);
  assert.equal(dfuGainForLevel(10), 122);
  const warrior = BUILDS.warrior;
  assert.equal(startSumOf(warrior), 156);
  assert.equal(dfuCeilingLevel(warrior), 31);
  assert.equal(expectedMaxHealth(warrior, 1, () => 50), 25 + 14);
  // level 2 at Endurance 60: mean roll (7 + 14) / 2 = 10.5 plus modifier 1
  assert.equal(expectedMaxHealth(warrior, 2, () => 60), Math.floor(39 + 10.5 + 1));
  const capped = progressionOf(warrior, 45, {});
  assert.equal(capped.level, 31);
  assert.equal(capped.ceiling, true);
  const masters = progressionOf(warrior, 45, { masterSkills: true, onlineLevel: true });
  assert.equal(masters.level, 45);
  assert.ok(masters.skills[29] === 200 && masters.effective[29] === 140, 'a mastered weapon skill reads 140 at 200');
});

test('encounters: the exact distribution sums to one and matches chooseRandomEnemy', () => {
  const odds = encounterDistribution(1, 1);
  near([...odds.values()].reduce((a, b) => a + b, 0), 1, 1e-12, 'total');
  // level 1 in table 1 (position 0 is the Rat): 80 rolls over positions 0..5, 15 over 0..2, 5 over 0..3
  near(odds.get(0), 0.8 / 6 + 0.15 / 3 + 0.05 / 4, 1e-12, 'Rat');
  let state = 12345;
  const rolls = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const counts = new Map();
  const draws = 60000;
  for (let i = 0; i < draws; i++) {
    const id = chooseRandomEnemy({ dungeonType: 1, playerLevel: 1 }, rolls);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, probability] of odds) near((counts.get(id) ?? 0) / draws, probability, 0.01, `id ${id}`);
});

test('foes: weak, average and strong are ordered by threat, and no class foe is picked', () => {
  const picks = representativeFoes(10);
  assert.ok(threatScore(picks.weak) <= threatScore(picks.average));
  assert.ok(threatScore(picks.average) <= threatScore(picks.strong));
  assert.ok(Object.values(representativeFoes(45)).every((id) => id < 128));
});

test('gear: the material climbs with level', () => {
  assert.ok(materialAtLevel(1) <= materialAtLevel(20));
  assert.ok(materialAtLevel(20) <= materialAtLevel(45));
  assert.ok(materialAtLevel(45) >= 7, 'level 45 buys ebony or better at the 90th percentile');
});

const audit12 = () => {
  const skills = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [i, 40]));
  Object.assign(skills, { 29: 60, 34: 40, 20: 45 });
  return { material: 1, armourMaterial: 1, skills, stats: { strength: 70, agility: 65, endurance: 65, speed: 60, luck: 55, willpower: 50 } };
};

test('parity: the DFU port and the game\'s stock core agree on a classic fight', () => {
  const layers = new Set();
  ours.applyLayers(layers);
  const character = ours.oursCharacter(BUILDS.warrior, 12, layers, { override: audit12() });
  for (const id of [7, 24]) {
    const foe = ours.oursFoe(id, character, layers);
    const fight = ours.oursFight(character, foe, layers, { swings: 20000, label: 'parity' });
    const row = VANILLA_ENEMY_BASICS[id];
    const swing = dfu.playerSwing({ player: { stats: character.entity.stats, critical: 40 }, weaponSkill: 60, weapon: { template: 120, material: 1 }, foe: { row, stats: flat(50) } });
    near(fight.hitChance, swing.chance, 0.015, `hit chance vs ${id}`);
    near(fight.perSwing, swing.perSwing, 0.25, `per swing vs ${id}`);
    const attack = dfu.monsterAttack({ row, foeStats: flat(50), player: { stats: character.entity.stats, armourParts: character.entity.armorValues, dodging: 45 } });
    near(fight.perAttack, attack.perAttack, 0.2, `taken vs ${id}`);
  }
});

test('ours: the same seed gives the same number, and the overhaul moves a level-12 Orc Warlord as the audit measured', () => {
  const cell = (layerNames) => {
    const layers = new Set(layerNames);
    ours.applyLayers(layers);
    const character = ours.oursCharacter(BUILDS.warrior, 12, layers, { override: audit12() });
    return ours.oursFight(character, ours.oursFoe(24, character, layers), layers, { swings: 4000, label: 'audit' });
  };
  const stock = cell([]);
  assert.deepEqual(cell([]), stock, 'seeded: identical on a second run');
  const overhaul = cell(['pcaao']);
  // audit C1: the Orc Warlord is hit 27 per cent of the time by the stock core and 46 per cent under the overhaul
  near(stock.hitChance, 0.27, 0.03, 'stock hit chance');
  near(overhaul.hitChance, 0.46, 0.03, 'overhaul hit chance');
  assert.ok(overhaul.perSwing > stock.perSwing * 1.3, 'the overhaul lands more damage a swing');
  const meaner = cell(['pcaao', 'meaner']);
  assert.ok(meaner.foeHealth > overhaul.foeHealth, 'Meaner Monsters raises the Warlord');
  assert.equal(meaner.foeLevel, 19, 'Meaner Monsters raises the Warlord to level 19');
});

test('report: layers, the target line, the table and the ablation', () => {
  near(targetRatio(1), 1, 1e-12, 'target at 1');
  near(targetRatio(45), 1.5, 1e-12, 'target at 45');
  assert.deepEqual([...parseLayers('none')], []);
  assert.ok(parseLayers('default').has('pcaao') && !parseLayers('default').has('virtue'));
  assert.ok(!parseLayers('-hero').has('hero') && parseLayers('-hero').has('pcaao'));
  assert.ok(parseLayers('+virtue').has('virtue'));
  assert.throws(() => parseLayers('nonsense'), /unknown layer/);
  const common = { builds: ['warrior'], levels: [10, 45], swings: 300 };
  const report = buildReport({ ...common, layers: parseLayers('default') });
  const averages = report.rows.filter((row) => row.foeKind === 'average');
  assert.equal(averages.length, 2);
  for (const row of averages) {
    assert.ok(row.ratios.power > 0 && row.characterRatios.power > 0);
    assert.ok(row.dfu.dps > 0 && row.ours.ttk > 0);
  }
  assert.equal(averages[1].dfu.ceiling, true, 'level 45 is past the DFU ceiling');
  assert.equal(report.rows.filter((row) => row.foeKind === 'elite').length, 2);
  assert.equal(report.rows.find((row) => row.foeKind === 'boss').dfu, null, 'DFU has no boss row');
  const markdown = toMarkdown(report);
  assert.match(markdown, /## Warrior/);
  assert.match(markdown, /Character \/ target/);
  const ablation = ablationMarkdown({ ...common, swings: 100 }, parseLayers('pcaao,hero'));
  assert.match(ablation, /- hero/);
  assert.match(ablation, /all layers off/);
});

test('layers: with every layer off the two rule sets measure the same character within noise', () => {
  const report = buildReport({ builds: ['warrior', 'archer'], levels: [10, 25], layers: new Set(), swings: 3000 });
  for (const row of report.rows.filter((r) => r.foeKind !== 'elite' && r.foeKind !== 'boss')) {
    near(row.ratios.dps, 1, 0.12, `${row.build} L${row.level} ${row.foeKind} dps`);
  }
});
