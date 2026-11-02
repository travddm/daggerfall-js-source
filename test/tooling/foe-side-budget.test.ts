// The foe-side budget (docs/systems/balance-harness.md): this game's foe, against the tamed character, stays within a
// band of what Daggerfall Unity's own foe is to the same character. Seeded, so the same numbers every run; no ARENA2
// (every foe attribute reads 50 in both rule sets), so the figures differ a little from the ARENA2 tables in the docs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport } from '../../tools/balance/report.mjs';
import { parseLayers } from '../../tools/balance/run.mjs';
import { heroThreat } from '../../src/systems/heroThreat.js';
import { PROMOTION } from '../../src/systems/foe-promotion.ts';

type Row = {
  build: string;
  level: number;
  foeKind: string;
  ratios: { power: number };
  characterRatios: { power: number };
};

const LEVELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45];
const report = buildReport({ levels: LEVELS, swings: 1500, layers: parseLayers('default') }) as { rows: Row[] };
/** How much harder the fight is than the character alone says: fight power over character power. Under 1 the foe is
 *  stronger than DFU's own foe would be, over 1 weaker. */
const foeRatio = (row: Row): number => row.ratios.power / row.characterRatios.power;
const averageRows = report.rows.filter((row) => row.foeKind === 'average');

test('at every level a foe is within a band of what DFU gives the same character', () => {
  assert.equal(averageRows.length, 5 * LEVELS.length);
  for (const row of averageRows) {
    const ratio = foeRatio(row);
    assert.ok(ratio >= 0.7 && ratio <= 1.4, `${row.build} L${row.level}: foe ratio x${ratio.toFixed(2)}`);
  }
});

test("at level 45 the hero's threat brings the fight back near DFU's", () => {
  for (const row of averageRows.filter((r) => r.level === 45)) {
    const ratio = foeRatio(row);
    assert.ok(ratio >= 0.85 && ratio <= 1.2, `${row.build} L45: foe ratio x${ratio.toFixed(2)}`);
  }
});

test("an elite stands at its tier's health over its plain kind, which carries the hero's threat and the elite does not", () => {
  for (const row of report.rows.filter((r) => r.foeKind === 'elite' && r.level >= 10)) {
    const plain = report.rows.find(
      (r) => r.foeKind === 'strong' && r.build === row.build && r.level === row.level,
    ) as unknown as {
      ours: { foeHealth: number };
    };
    const elite = row as unknown as { ours: { foeHealth: number } };
    const step = elite.ours.foeHealth / plain.ours.foeHealth;
    const expected = PROMOTION.elite.health / heroThreat(row.level).health;
    assert.ok(
      Math.abs(step - expected) < 0.03,
      `${row.build} L${row.level}: elite health x${step.toFixed(2)}, want x${expected.toFixed(2)}`,
    );
  }
});
