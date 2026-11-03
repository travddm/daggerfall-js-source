// B5 (balance lane): the online layer's health. Renown adds none, the Firmament's Health is a few per cent of a body and
// its cards print what applies, and the Endurance floor stays. The balance harness's `skyHealth` layer measures the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renownBonus, RENOWN_MAX, RENOWN_MP_PER_LEVEL } from '../../src/net/renown.js';
import { FIRM_NODES } from '../../src/net/firmament/firmamentTree.js';
import { statDef, firmamentHealth } from '../../src/net/firmament/firmamentLaw.js';
import { evenHpFloor } from '../../src/systems/levelEven.js';
import { buildReport } from '../../tools/balance/report.mjs';
import { parseLayers } from '../../tools/balance/run.mjs';

const SWINGS = 200;
const BODY_45 = 700;

test('B5 Renown adds magicka at every level and no health', () => {
  assert.equal(renownBonus(1).hp, 0);
  for (const level of [2, 10, RENOWN_MAX]) {
    assert.equal(renownBonus(level).hp, 0, `Renown ${level} adds no health`);
    assert.equal(renownBonus(level).mp, RENOWN_MP_PER_LEVEL * (level - 1), `Renown ${level} keeps its magicka`);
  }
});

test('B5 the Firmament tree reaches exactly its Health channels, so no card prints more than applies', () => {
  const sum = { hp: 0, hpPct: 0 };
  for (const node of FIRM_NODES.values()) for (const key of Object.keys(sum)) sum[key] += node.stats[key] ?? 0;
  assert.equal(sum.hp, statDef('hp').max, 'the key stars add up to the raw channel');
  assert.equal(sum.hpPct, statDef('hpPct').max, 'the small stars add up to the share channel');
});

test('B5 the whole sky gives a level-45 body about a tenth, and a key walk a few per cent', () => {
  const whole = firmamentHealth({ hp: statDef('hp').max, hpPct: statDef('hpPct').max }, BODY_45);
  assert.ok(whole / BODY_45 <= 0.11, `the whole tree: ${whole} of ${BODY_45}`);
  const raw = firmamentHealth({ hp: 10, hpPct: 0 }, BODY_45);
  assert.equal(raw, 10, 'a key star walk of raw points adds only those');
  assert.ok(firmamentHealth({ hp: 0, hpPct: 5 }, BODY_45) / BODY_45 <= 0.05);
  assert.equal(firmamentHealth({}, BODY_45), 0, 'no tree, no Health');
});

test('B5 the Endurance floor stays: a class at level 45 stands above its stored body by Endurance', () => {
  const entity = { career: { hitPointsPerLevel: 8 }, level: 45 };
  assert.ok(evenHpFloor(entity, 100) > evenHpFloor(entity, 50), 'more Endurance, a higher floor');
  assert.ok(evenHpFloor(entity, 50) >= 25 + 8 + 44, 'the floor never drops under one a level');
});

test('B5 survival: the online layer at its most adds about a tenth at most to a level-45 body, and Renown none', () => {
  const rows = (layers) =>
    buildReport({ builds: ['warrior', 'mage'], levels: [45], swings: SWINGS, layers: parseLayers(layers) }).rows.filter(
      (row) => row.foeKind === 'average',
    );
  const plain = rows('default,-hero,-stats');
  const sky = rows('default,+skyHealth,-hero,-stats');
  for (const [i, row] of sky.entries()) {
    const gain = row.ours.playerHealth / plain[i].ours.playerHealth;
    assert.ok(gain > 1, `${row.build}: the Firmament adds health`);
    assert.ok(gain <= 1.12, `${row.build}: the Firmament and Renown add x${gain.toFixed(3)} to the body`);
  }
});
