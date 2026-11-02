// B1 (tame player power): the budget the balance harness holds. A character with every stacking source at its cap (the
// harness `ceiling` layer) is measured against Daggerfall Unity's top character at level 45, and a character inside DFU's
// own level range must stay where it was before B1. Seeded, so the same numbers every run; no ARENA2 needed (every foe
// attribute reads 50 in both rule sets, so the figures differ from docs/systems/balance-harness.md's ARENA2 tables).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../../tools/balance/report.mjs';
import { parseLayers } from '../../tools/balance/run.mjs';
import { BLOW_MOST, GUARD_LEAST } from '../../src/systems/powerCeiling.js';
import { SPELL_POWER_MOST, POTENCY_CAP } from '../../src/systems/loot/lootPowers.js';

const SWINGS = 1500;
const averageRows = (report) => report.rows.filter((row) => row.foeKind === 'average');

/** Power at level 45 with every source at its cap, no ARENA2: what B3 reached, rounded up in the third place. B1 left these at
 *  1.38 / 2.42 / 1.86 / 1.79 / 1.40 with the port's flattened swing law; B3 gave the swing DFU's Speed line back (a Speed-100
 *  build swings 2.1 times as often as a Speed-75 one in DFU's own formula), which lifts every build that swings, and took the
 *  x1.5 off the skill and the doubled Strength term off the bow, which lowered the archer. A ceiling later lanes (B4 gear, B5
 *  health and the Firmament tree, the spell magnitudes) lower toward 1.5 and never raise. The owner accepted these higher
 *  values for B3: B4 (loot affixes) and B5 (health) rescale the remaining stacks at their source to bring maxed builds
 *  back near 1.5. */
const MAXED_POWER_MOST = Object.freeze({ warrior: 2.25, archer: 2.31, spellsword: 2.17, mage: 2.02, thief: 2.36 });

test('budget: the nets are the ones B1 set (the blow +75.4%, the hurt keeps 74%) and sit above a normal kit', () => {
  assert.ok(BLOW_MOST < 1.76 && BLOW_MOST > 1.74, `blow ${BLOW_MOST}`);
  assert.ok(GUARD_LEAST < 0.75 && GUARD_LEAST > 0.73, `hurt ${GUARD_LEAST}`);
  assert.ok(
    POTENCY_CAP <= SPELL_POWER_MOST,
    'worn potency lines fit under the loot spell cap, so it cuts nothing a card prints',
  );
});

test('budget: a level-45 character with every stacking source at its cap stays inside the power budget', () => {
  const layers = parseLayers('+ceiling,-hero,-stats');
  const rows = averageRows(buildReport({ levels: [45], layers, swings: SWINGS }));
  assert.equal(rows.length, Object.keys(MAXED_POWER_MOST).length);
  for (const row of rows) {
    assert.ok(
      row.ratios.power <= MAXED_POWER_MOST[row.build],
      `${row.build}: power x${row.ratios.power.toFixed(2)} is over x${MAXED_POWER_MOST[row.build]}`,
    );
  }
});

test("budget: inside DFU's level range the default character, against DFU's own foe, is where B3 left it (within 0.05 of power)", () => {
  const AT_B3 = { warrior: 0.992, mage: 1.188, archer: 1.369 };
  const rows = averageRows(
    buildReport({ builds: Object.keys(AT_B3), levels: [30], swings: SWINGS, layers: parseLayers('default,-hero,-stats') }),
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(
      Math.abs(row.ratios.power - AT_B3[row.build]) <= 0.05,
      `${row.build} L30: power x${row.ratios.power.toFixed(3)} against x${AT_B3[row.build]} at B3`,
    );
  }
});
