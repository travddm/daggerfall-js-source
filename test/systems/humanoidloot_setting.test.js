import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnEnemyLoot, equipEnemy } from '../../src/scenes/hostCombat.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { isGoldPieces } from '../../src/systems/inventory.js';
import { humanoidLootShare, humanoidLootShareFor, HUMANOID_LOOT_PREF } from '../../src/systems/humanoidLootShare.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import { FEATURES } from '../../src/systems/features.js';
import { ONLINE_FORCED_PREFS } from '../../src/systems/online/onlineLane.js';

const ORC = 7;
const ZOMBIE = 2;
const player = () => ({ level: 10, gender: 'male', stats: { luck: 50 }, activeEffects: [] });
const foe = (mobileType) => ({
  mobileType,
  basics: ENEMY_BASICS[mobileType],
  items: [],
  level: 10,
  careerIndex: mobileType,
  isClass: false,
  stats: { strength: 50, speed: 50 },
  skills: 30,
});
afterEach(() => setPref(HUMANOID_LOOT_PREF, 'dfu'));

/** Mean pieces (gold left out) on a body, over many spawns. */
const meanPieces = (mobileType, spawns = 400) => {
  let total = 0;
  for (let i = 0; i < spawns; i++) {
    const e = foe(mobileType);
    spawnEnemyLoot(e, mobileType, ENEMY_BASICS[mobileType], player());
    total += e.items.filter((it) => !isGoldPieces(it)).length;
  }
  return total / spawns;
};

test("HUMANOID-LOOT: DFU's whole loot is the default; the stored choices read as 1 and a quarter, and an unknown value as the default", () => {
  assert.deepEqual(['dfu', 'cut', 'nope', undefined].map(humanoidLootShareFor), [1, 0.25, 1, 1]);
  assert.equal(humanoidLootShare(), 1, 'the shelf starts on the classic share');
  setPref(HUMANOID_LOOT_PREF, 'cut');
  assert.equal(humanoidLootShare(), 0.25, 'the pick is read live');
});

test("HUMANOID-LOOT: an Orc's whole worn kit reaches the body on the classic share, and a quarter of it, by a coin per piece, on Cut", () => {
  const body = (share, coin) => {
    const e = foe(ORC);
    const eq = equipEnemy(e, ORC, 10, () => coin, { humanoidShare: share });
    return { eq, e };
  };
  const whole = body(1, 0.99);
  assert.ok(whole.eq.worn.length > 0, 'the Orc wears a kit');
  assert.equal(whole.e.items.length, whole.eq.worn.length, 'every worn piece is on the body');
  const none = body(0.25, 0.99);
  assert.equal(none.e.items.length, 0, 'Cut: a coin above the share leaves the piece on the foe');
  assert.deepEqual(none.e.armorValues, whole.e.armorValues, 'and the foe fights in the same armour either way');
  const luckyWhole = body(1, 0);
  assert.equal(body(0.25, 0).e.items.length, luckyWhole.eq.worn.length, 'Cut: a coin under the share drops it');
});

test('HUMANOID-LOOT: the live row sets the share spawnEnemyLoot rolls with - Cut carries well under half the pieces, and a Zombie is the same either way', () => {
  const classic = meanPieces(ORC);
  setPref(HUMANOID_LOOT_PREF, 'cut');
  const cut = meanPieces(ORC);
  assert.ok(
    classic > cut * 2,
    `an Orc carries ${classic.toFixed(2)} pieces on the classic share and ${cut.toFixed(2)} on Cut`,
  );
  const zombieCut = meanPieces(ZOMBIE);
  setPref(HUMANOID_LOOT_PREF, 'dfu');
  const zombieClassic = meanPieces(ZOMBIE);
  assert.ok(
    Math.abs(zombieClassic - zombieCut) < 0.35 * Math.max(zombieClassic, 0.5) + 0.15,
    'a foe that is no humanoid never reads the row',
  );
});

test("HUMANOID-LOOT: the row declares the classic default and the room's pin, and the online lane forces it", () => {
  const row = FEATURES.find((f) => f.id === 'humanoid-loot');
  assert.deepEqual([row.control.key, row.control.initial, row.control.online], [HUMANOID_LOOT_PREF, 'dfu', 'dfu']);
  assert.deepEqual(
    row.control.tiers.map((x) => x[0]),
    ['dfu', 'cut'],
  );
  assert.equal(ONLINE_FORCED_PREFS[HUMANOID_LOOT_PREF], 'dfu');
});
