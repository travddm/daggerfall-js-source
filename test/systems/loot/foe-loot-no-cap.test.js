// A plain foe's body keeps everything its rolls gave it: B4 removed the three-piece cap. A summon's body stays bare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainFoeLootRule, capFoeLoot, summonedBody } from '../../../src/systems/foeLootCap.js';
import * as foeLootCap from '../../../src/systems/foeLootCap.js';

test('the rule marks a plain foe for the plain ladder and carries no cap', () => {
  const rule = plainFoeLootRule({ level: 3, mobileType: 0 }, { team: 'Humanoids' });
  assert.deepEqual(rule, { plainLadder: true });
  assert.equal(plainFoeLootRule({ level: 3, mobileType: 0, elite: true }, { team: 'Humanoids' })?.plainLadder, false, 'an Elite Dungeon foe keeps its own ladder');
  assert.equal(plainFoeLootRule({ level: 3, champion: 'x' }, {}), null, 'a titled foe is left alone');
});

test('a body with many pieces keeps all of them through the death cap', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ group: 'Weapons', templateIndex: i }));
  const entity = { items: [...items], lootCap: 3 };
  assert.deepEqual(capFoeLoot(entity), []);
  assert.equal(entity.items.length, 9);
  assert.equal('capLootList' in foeLootCap, false, 'the count cap is gone');
});

test('a summon\'s body is emptied', () => {
  const foe = summonedBody({ entity: { items: [{ group: 'Weapons' }] } });
  assert.equal(foe.entity.items.length, 0);
  foe.entity.items.push({ group: 'Weapons' });
  assert.equal(capFoeLoot(foe.entity).length, 1);
  assert.equal(foe.entity.items.length, 0);
});
