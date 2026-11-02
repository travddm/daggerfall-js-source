// DRAGON-SOUL, reverted by B4. DFU prices the Dragonling every encounter spawns (34) at nothing - the soulless general
// spawn - and only the quest B0B70Y16's (40) at -5000; both print the name "Dragonling". DRAGON-SOUL (FIELD BUGS
// 2026-10-11) bound the general spawn at -5000 too, which handed 5000 points of enchantment budget to a soul that the
// world gives out freely. It binds at DFU's nothing again. Driven on the real road: the service's empty soul trap,
// filled by the soul trap's own kill-time roll with a general-spawn Dragonling, enumerated from the pack, and offered
// by the item maker's picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptySoulTrap } from '../../src/systems/shopStock.js';
import { attemptSoulTrap, enumerateFilledTraps } from '../../src/systems/mysticism.js';
import { primaryPick, enchantmentCost } from '../../src/systems/enchantmentCatalogue.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';

test('B4: a general-spawn Dragonling trapped on the real road binds at nothing, as in DFU; the quest\'s keeps -5000', () => {
  assert.equal(MOBILE_TYPES.Dragonling, 34, 'the one every encounter spawns');
  assert.equal(MOBILE_TYPES.Dragonling_Alternate, 40, 'the quest\'s');
  const pack = [createEmptySoulTrap()];
  const foe = { activeEffects: [{ kind: 'soulTrap', chance: 100, ended: false }] };
  const r = attemptSoulTrap(foe, MOBILE_TYPES.Dragonling, pack, 0);
  assert.equal(r.alert, 'trapSuccess');
  assert.equal(pack[0].trappedSoulType, 34);
  const souls = enumerateFilledTraps(pack);
  assert.deepEqual([...souls], [34]);
  const pick = primaryPick('SoulBound', { souls });
  assert.equal(pick.kind, 'choose');
  assert.deepEqual(pick.options.map((o) => [o.param, o.label, o.settings.enchantCost]), [[34, 'Dragonling', 0]], 'offered at nothing');
  assert.equal(enchantmentCost('SoulBound', 34), 0);
  assert.equal(enchantmentCost('SoulBound', 40), -5000);
});

test('B4: no soul binds for more budget than DFU gives it: the soulless still bind at nothing', () => {
  assert.equal(ENEMY_BASICS[34].soulPts ?? 0, 0, 'no shop price grows off a monster every encounter spawns');
  assert.equal(ENEMY_BASICS[40].soulPts, 500000);
  for (const id of [0, 3, 4, 5, 6, 11, 15, 17, 20, 34, 39]) assert.equal(enchantmentCost('SoulBound', id), 0, `${id} soulless`);
});
