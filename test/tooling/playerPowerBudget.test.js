// B1 (tame player power): the budget the balance harness holds. A character with every stacking source at its cap (the
// harness `ceiling` layer) is measured against Daggerfall Unity's top character at level 45, and a character inside DFU's
// own level range must stay where it was before B1. Seeded, so the same numbers every run; no ARENA2 needed (every foe
// attribute reads 50 in both rule sets, so the figures differ from docs/systems/balance-harness.md's ARENA2 tables).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../../tools/balance/report.mjs';
import { parseLayers } from '../../tools/balance/run.mjs';
import { BLOW_MOST, GUARD_LEAST } from '../../src/systems/powerCeiling.js';
import { SPELL_BUDGET_MOST } from '../../src/systems/spell/spellPower.js';

const SWINGS = 1500;
const averageRows = (report) => report.rows.filter((row) => row.foeKind === 'average');

/** Power at level 45 with every source at its cap, no ARENA2: what B1 reached, rounded up in the third place. A ceiling that later lanes
 *  (B3 bow rules, B5 health, the spell magnitudes) lower toward 1.5 and never raise. Before B1 these were x20 to x54. */
const MAXED_POWER_MOST = Object.freeze({ warrior: 1.38, archer: 2.42, spellsword: 1.86, mage: 1.79, thief: 1.42 });

test('budget: the stacking caps are the ones B1 set (the blow x1.75, the hurt keeps 74%, a spell x1.25)', () => {
  assert.ok(BLOW_MOST < 1.76 && BLOW_MOST > 1.74, `blow ${BLOW_MOST}`);
  assert.ok(GUARD_LEAST < 0.75 && GUARD_LEAST > 0.73, `hurt ${GUARD_LEAST}`);
  assert.equal(SPELL_BUDGET_MOST, 1.25);
});

test('budget: a level-45 character with every stacking source at its cap stays inside the power budget', () => {
  const layers = parseLayers('+ceiling,-hero,-meaner,-scaling');
  const rows = averageRows(buildReport({ levels: [45], layers, swings: SWINGS }));
  assert.equal(rows.length, Object.keys(MAXED_POWER_MOST).length);
  for (const row of rows) {
    assert.ok(
      row.ratios.power <= MAXED_POWER_MOST[row.build],
      `${row.build}: power x${row.ratios.power.toFixed(2)} is over x${MAXED_POWER_MOST[row.build]}`,
    );
  }
});

test("budget: inside DFU's level range the default character is where it was before B1 (within 0.05 of power)", () => {
  const BEFORE_B1 = { warrior: 0.851, mage: 0.841, archer: 1.512 };
  const rows = averageRows(
    buildReport({ builds: Object.keys(BEFORE_B1), levels: [30], swings: SWINGS, layers: parseLayers('default') }),
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(
      Math.abs(row.ratios.power - BEFORE_B1[row.build]) <= 0.05,
      `${row.build} L30: power x${row.ratios.power.toFixed(3)} against x${BEFORE_B1[row.build]} before B1`,
    );
  }
});
