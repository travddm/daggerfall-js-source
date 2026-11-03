// PORTENT-FOLD: the omen lines (the chat's rise, wrath and marks lines, the map tip) go through the text core, so a player
// reads them in the language they chose; the relay's herald, which sets none, says them in English as it always did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tm from '../../../src/systems/textManager.js';
import { riseLine, wrathLine, marksLine, gateModsOf } from '../../../src/net/gate/gateLaw.js';
import { gateTip } from '../../../src/systems/gate/gateOmen.js';

const BOSS = { name: 'Valkynaz Ruhn', title: 'the Rime-Wrought' };
const CARD = { t: { day: 7 }, site: { place: 'Copperham' }, phase: 'open' };

test('PORTENT-FOLD: the omen lines in English as they were', () => {
  assert.equal(riseLine({ near: 'Copperham', left: '4:07' }), "Dagon's Breach rises near Copperham. It opens in 4:07.");
  assert.equal(
    wrathLine({ near: 'Copperham', boss: 'Ruhn' }),
    "The Covenant tears Dagon's Breach near Copperham shut. Ruhn is cast back into the Deadlands.",
  );
  const tip = gateTip(CARD, { to: 'seal', ms: 65_000 }, null, BOSS);
  assert.equal(tip.title, "Dagon's Breach");
  assert.equal(tip.lines[0], 'Near Copperham');
  assert.match(tip.lines[1], /^Open\. Seals in /);
  assert.equal(tip.lines[2], 'Valkynaz Ruhn, the Rime-Wrought');
  assert.match(marksLine({ boss: 'Ruhn', md: gateModsOf(7) }), /^Ruhn comes .+ tonight(, .+)?\.$/);
  assert.equal(gateTip(CARD, null, 1234, BOSS).lines.at(-1), 'Valkynaz Ruhn has fallen');
});

test('PORTENT-FOLD: the omen lines are said in the language of the moment, their names and places kept (mutants: a line left raw)', () => {
  const english = {
    rise: riseLine({ near: 'Copperham', left: '4:07' }),
    wrath: wrathLine({ near: 'Copperham', boss: 'Ruhn' }),
    marks: marksLine({ boss: 'Ruhn', md: gateModsOf(7) }),
  };
  const was = tm.currentLocale();
  try {
    tm.setLocale(tm.PSEUDO_LOCALE);
    const rise = riseLine({ near: 'Copperham', left: '4:07' }),
      wrath = wrathLine({ near: 'Copperham', boss: 'Ruhn' });
    const marks = marksLine({ boss: 'Ruhn', md: gateModsOf(7) });
    assert.notEqual(rise, english.rise);
    assert.notEqual(wrath, english.wrath);
    assert.notEqual(marks, english.marks);
    assert.ok(rise.includes('Copperham') && rise.includes('4:07'));
    assert.ok(wrath.includes('Copperham') && wrath.includes('Ruhn'));
    const tip = gateTip(CARD, { to: 'open', ms: 65_000 }, null, BOSS);
    for (const line of [tip.title, ...tip.lines.slice(0, 3)])
      assert.doesNotMatch(line, /^(Near|Opens in|Dagon's Breach)\b/, line);
    assert.ok(tip.lines[0].includes('Copperham'));
  } finally {
    tm.setLocale(was);
  }
});
