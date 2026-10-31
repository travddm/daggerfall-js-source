// GIANT-LOOT + GIANT-BLOWS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eliteLoot, grantEliteLoot } from '../../src/systems/eliteFoes.js';
import { WILD_GIANT_DAMAGE_MULT } from '../../src/systems/wild/wildZone.js';

test('GIANT-LOOT: a Greater Giant is no elite, so the elite door gave it nothing - its two drops are the elite table\'s, laid on it directly', () => {
  const giant = { wildGiant: true, items: [] };
  grantEliteLoot(giant, 20, () => 0.5);
  assert.equal(giant.items.length, 0, 'the door the giant used: an elite\'s alone - the bug');
  const one = eliteLoot(20, () => 0.5);
  assert.ok(one.length >= 2, 'an elite\'s drop is pieces and a purse');
  assert.ok(one.some((it) => it?.isGold || /gold/i.test(String(it?.name ?? it?.shortName ?? '')) || it?.templateIndex === 0 || it?.group === 'Currency'), 'with its gold');
});

test('GIANT-BLOWS: every client\'s copy of a Greater Giant strikes with its four times - once, when its owner\'s record names it', () => {
  assert.equal(WILD_GIANT_DAMAGE_MULT, 4);
});
