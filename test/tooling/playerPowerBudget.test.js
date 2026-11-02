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

/** B5 (the owner's budget: melee about x1.6, casters about x1.75, with ARENA2's attributes; these figures are without it, where
 *  every foe attribute reads 50 and the character looks stronger): the sources were rescaled at their records (sets, loot powers,
 *  sigil, paths, the Firmament tree, mastery), the blow net is the tops summed (+34.5%) and the hurt keeps 86.35%. The maxed
 *  character now wears its online health too (`skyHealth`: Renown none, the tree's Health at its sums). Lowered from B4's
 *  2.08 / 2.13 / 2.0 / 1.96 / 2.2, which had no health and the old nets. B4's note follows.
 *
 *  B4 (tame loot and economy) rescaled the loot affixes toward DFU's enchantment strength, which took the maxed builds from
 *  2.25 / 2.31 / 2.17 / 2.02 / 2.36 (B3's pins, below) to the values pinned here, rounded up in the third place. The rest of
 *  the excess is the nets of the other registries (the Firmament tree, the sets, mastery) and the online health floor, which
 *  B5 takes. B3's note follows. Power at level 45 with every source at its cap, no ARENA2: what B3 reached. B1 left these at
 *  1.38 / 2.42 / 1.86 / 1.79 / 1.40 with the port's flattened swing law; B3 gave the swing DFU's Speed line back (a Speed-100
 *  build swings 2.1 times as often as a Speed-75 one in DFU's own formula), which lifts every build that swings, and took the
 *  x1.5 off the skill and the doubled Strength term off the bow, which lowered the archer. A ceiling later lanes (B4 gear, B5
 *  health and the Firmament tree, the spell magnitudes) lower toward 1.5 and never raise. The owner accepted these higher
 *  values for B3: B4 (loot affixes) and B5 (health) rescale the remaining stacks at their source to bring maxed builds
 *  back near 1.5. */
const MAXED_POWER_MOST = Object.freeze({ warrior: 1.77, archer: 1.82, spellsword: 1.85, mage: 1.84, thief: 1.84 });

test('budget: the nets are the tops summed (B5: the blow +34.5%, the hurt keeps 86.35%) and sit above a normal kit', () => {
  assert.ok(BLOW_MOST < 1.35 && BLOW_MOST > 1.34, `blow ${BLOW_MOST}`);
  assert.ok(GUARD_LEAST < 0.87 && GUARD_LEAST > 0.86, `hurt ${GUARD_LEAST}`);
  assert.ok(
    POTENCY_CAP <= SPELL_POWER_MOST,
    'worn potency lines fit under the loot spell cap, so it cuts nothing a card prints',
  );
});

test('budget: a level-45 character with every stacking source at its cap stays inside the power budget', () => {
  const layers = parseLayers('+ceiling,+skyHealth,-hero,-stats');
  const rows = averageRows(buildReport({ levels: [45], layers, swings: SWINGS }));
  assert.equal(rows.length, Object.keys(MAXED_POWER_MOST).length);
  for (const row of rows) {
    assert.ok(
      row.ratios.power <= MAXED_POWER_MOST[row.build],
      `${row.build}: power x${row.ratios.power.toFixed(2)} is over x${MAXED_POWER_MOST[row.build]}`,
    );
  }
});

test("budget: inside DFU's level range the default character, against DFU's own foe, is where B4 left it (within 0.05 of power)", () => {
  const AT_B4 = { warrior: 0.923, mage: 1.183, archer: 1.268 };
  const rows = averageRows(
    buildReport({ builds: Object.keys(AT_B4), levels: [30], swings: SWINGS, layers: parseLayers('default,-hero,-stats') }),
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(
      Math.abs(row.ratios.power - AT_B4[row.build]) <= 0.05,
      `${row.build} L30: power x${row.ratios.power.toFixed(3)} against x${AT_B4[row.build]} at B4`,
    );
  }
});

test('budget (B5): typical gear at level 45, with no stacking source beyond what it wears, stays at or under x1.55 of DFU', () => {
  const rows = averageRows(buildReport({ levels: [45], swings: SWINGS, layers: parseLayers('default,-hero,-stats') }));
  assert.equal(rows.length, Object.keys(MAXED_POWER_MOST).length);
  for (const row of rows) {
    assert.ok(row.ratios.power <= 1.55, `${row.build}: typical power x${row.ratios.power.toFixed(2)} is over x1.55`);
  }
});
