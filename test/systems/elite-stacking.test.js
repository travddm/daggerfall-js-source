// An elite takes the larger of the elite tier and its dungeon's layer, stat by
// stat; the stacked figures are an option (systems/elite-stacking.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eliteMults, stepOnLayer, ELITE_DUNGEON_LAYER, SUPER_DUNGEON_LAYER } from '../../src/systems/elite-stacking.ts';
import { applyChampion } from '../../src/systems/champions.js';
import { promoteEliteFoe } from '../../src/systems/eliteFoes.js';
import { PROMOTION } from '../../src/systems/foe-promotion.ts';
import { ELITE_HEALTH_SCALE, ELITE_DAMAGE_SCALE } from '../../src/world/spawnedDungeons.js';
import { SUPER_HEALTH_SCALE, SUPER_DAMAGE_SCALE } from '../../src/world/superDungeon/sdDungeon.js';
import { setPref } from '../../src/systems/uiPrefs.js';

const foe = () => ({ level: 20, mobileType: 7, maxHealth: 100, health: 100, damageScale: 1 });

test("the dungeons' layers are the dungeons' own", () => {
  assert.deepEqual({ ...ELITE_DUNGEON_LAYER }, { health: ELITE_HEALTH_SCALE, damage: ELITE_DAMAGE_SCALE });
  assert.deepEqual({ ...SUPER_DUNGEON_LAYER }, { health: SUPER_HEALTH_SCALE, damage: SUPER_DAMAGE_SCALE });
});

test('by default an elite takes the larger layer, stat by stat, with nothing multiplied', () => {
  assert.deepEqual(eliteMults(PROMOTION.elite), PROMOTION.elite, 'in the open, the elite tier');
  assert.deepEqual({ ...eliteMults(PROMOTION.elite, { eliteDungeon: true }) }, { health: 2, damage: 2 });
  assert.deepEqual({ ...eliteMults(PROMOTION.elite, { superDungeon: true }) }, { health: 4, damage: 2.5 });
  const e = foe();
  assert.equal(promoteEliteFoe(e, { superDungeon: true, checkLevel: false }), true);
  assert.equal(e.maxHealth, 400);
  assert.equal(e.damageScale, 2.5);
});

test('with the option on, an elite stacks on its dungeon: x7 and x2.6, x9 and x3', (t) => {
  setPref('eliteStacking', true);
  t.after(() => setPref('eliteStacking', false));
  assert.deepEqual({ ...eliteMults(PROMOTION.elite, { eliteDungeon: true }) }, { health: 7, damage: 2.6 });
  const e = foe();
  promoteEliteFoe(e, { superDungeon: true, checkLevel: false });
  assert.equal(e.maxHealth, 900);
  assert.equal(e.damageScale, 3);
});

test("decision 125: a champion on a dungeon's layer gets only what passes it, stat by stat; with the row on, its whole step", (t) => {
  assert.deepEqual(
    { ...stepOnLayer({ health: 1.68, damage: 1.15 }, 'elite') },
    { health: 1, damage: 1 },
    'under both of the layer: nothing more',
  );
  assert.deepEqual(
    { ...stepOnLayer({ health: 1.4, damage: 1.15 }, null) },
    { health: 1.4, damage: 1.15 },
    'no layer: the whole step',
  );
  const band = { health: 1.2, damage: 1.1 };
  const s = stepOnLayer({ health: 1.4, damage: 1.15 }, band);
  assert.ok(
    Math.abs(s.health - 1.4 / 1.2) < 1e-12 && Math.abs(s.damage - 1.15 / 1.1) < 1e-12,
    'an ocean band: up to the step',
  );
  setPref('eliteStacking', true);
  t.after(() => setPref('eliteStacking', false));
  assert.deepEqual({ ...stepOnLayer({ health: 1.4, damage: 1.15 }, 'super') }, { health: 1.4, damage: 1.15 });
});

test('decision 125, run: a champion in an Elite Dungeon stands at the dungeon layer, not above it', () => {
  const e = { level: 20, mobileType: 7, maxHealth: 200, health: 200, damageScale: 2, healthMult: 2 };
  assert.equal(applyChampion(e, 0, 'elite'), true);
  assert.equal(e.maxHealth, 200);
  assert.equal(e.damageScale, 2);
});
