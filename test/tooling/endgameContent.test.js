// B6: endgame content against the finished power budget. The harness's content layer (tools/balance/content.mjs) runs the
// game's own modules: the gate's reference damage, the foe tiers' factors and the ocean bands' factors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierCell, characterDps, bossFight } from '../../tools/balance/content.mjs';
import { CONTENT_TIERS } from '../../tools/balance/tiers.mjs';
import { dpsRef, BOSS_TTK_S, BUCKET_RATE_X, LV_MAX } from '../../src/net/gate/gateBrain.js';
import { oceanBandDifficulty } from '../../src/systems/sea/oceanBandDifficulty.js';

const SWINGS = 600;

test('dpsRef: 5 plus the level up to 30, a steeper whole-number line past it, never falling', () => {
  assert.equal(dpsRef(1), 6);
  assert.equal(dpsRef(30), 35);
  assert.equal(dpsRef(45), 88);
  for (let lv = 1; lv < LV_MAX; lv++) {
    assert.ok(dpsRef(lv + 1) > dpsRef(lv), `level ${lv}`);
    assert.equal(dpsRef(lv), Math.round(dpsRef(lv)), `level ${lv} is a whole number`);
  }
});

test('the gate keeps its length: a typical melee character at level 45 takes about the 240 s it was made for', () => {
  for (const build of ['warrior', 'thief']) {
    const level = 45;
    const dps = characterDps({ build, gear: 'typical', level, swings: SWINGS });
    const { seconds } = bossFight({ ttkSeconds: BOSS_TTK_S, level, dps });
    assert.ok(seconds >= 180 && seconds <= 330, `${build}: ${seconds.toFixed(0)} s`);
  }
});

test('the gate cannot be shortened past its bucket: even the maxed caster at level 45 needs more than BOSS_TTK_S / BUCKET_RATE_X', () => {
  const level = 45;
  const dps = characterDps({ build: 'mage', gear: 'maxed', level, swings: SWINGS });
  const { seconds } = bossFight({ ttkSeconds: BOSS_TTK_S, level, dps });
  assert.ok(seconds >= BOSS_TTK_S / BUCKET_RATE_X, `${seconds.toFixed(0)} s`);
  assert.ok(seconds >= 120, `${seconds.toFixed(0)} s`);
});

test('a group fights as long as one: each claim brings its own health', () => {
  const one = bossFight({ ttkSeconds: BOSS_TTK_S, level: 40, dps: 70, size: 1 });
  const eight = bossFight({ ttkSeconds: BOSS_TTK_S, level: 40, dps: 70, size: 8 });
  assert.equal(eight.groupSeconds, one.groupSeconds);
});

test('the blows of a tier: no tier lands more than 60% of a typical body in one blow, at level 45 for the frailest build', () => {
  for (const tier of Object.keys(CONTENT_TIERS)) {
    const cell = tierCell({ tier, build: 'mage', gear: 'typical', level: 45, swings: SWINGS });
    assert.ok(cell.mostShare <= 0.62, `${tier}: ${(100 * cell.mostShare).toFixed(0)}% of a ${cell.body.toFixed(0)} body`);
  }
});

test('the Abyss is harder than an Elite dungeon and an elite harder than its dungeon, in health and in blows', () => {
  const { eliteDungeon, eliteDungeonElite, superFoe, superElite, eliteFoe } = CONTENT_TIERS;
  assert.ok(superFoe.health > eliteDungeon.health && superFoe.damage > eliteDungeon.damage);
  assert.ok(eliteDungeonElite.health > eliteDungeon.health && eliteDungeonElite.damage > eliteDungeon.damage);
  assert.ok(superElite.health > superFoe.health && superElite.damage > superFoe.damage);
  assert.ok(superElite.damage >= eliteDungeonElite.damage);
  assert.ok(eliteDungeon.health >= eliteFoe.health && eliteDungeon.damage >= eliteFoe.damage);
});

test('the Abyss wants a group, not a wall: a typical melee character beats one of its foes alone and a frail one needs a few', () => {
  const warrior = tierCell({ tier: 'superFoe', build: 'warrior', gear: 'typical', level: 45, swings: SWINGS });
  assert.ok(warrior.dies / warrior.kill > 2, `warrior K ${(warrior.dies / warrior.kill).toFixed(2)}`);
  const mage = tierCell({ tier: 'superElite', build: 'mage', gear: 'typical', level: 45, swings: SWINGS });
  const K = mage.dies / mage.kill;
  assert.ok(K < 1 && K * 4 >= 1, `mage vs an Abyss elite: K ${K.toFixed(2)} alone, a party of four wins`);
});

test('the ocean bands: deeper is harder, a vault sits like an elite, gold is at most x1.25', () => {
  const v4 = oceanBandDifficulty({ ring: 4, vault: true });
  const v3 = oceanBandDifficulty({ ring: 3, vault: true });
  assert.ok(v4.health >= v3.health && v4.damage >= v3.damage);
  assert.ok(v4.health >= 1.8 && v4.health <= 2.2 && v4.damage >= 1.2 && v4.damage <= 1.4);
  const ruins = [1, 2, 3, 4].map((ring) => oceanBandDifficulty({ ring }));
  for (let i = 1; i < ruins.length; i++) assert.ok(ruins[i].health > ruins[i - 1].health && ruins[i].damage > ruins[i - 1].damage);
  for (const f of [...ruins, v3, v4]) assert.ok(f.gold <= 1.25);
  assert.ok(ruins[3].health < v4.health && ruins[3].damage < v4.damage, 'a plain ruin takes the smaller step');
  assert.equal(CONTENT_TIERS.vault4.health, v4.health);
  assert.equal(CONTENT_TIERS.vault4.damage, v4.damage);
});
