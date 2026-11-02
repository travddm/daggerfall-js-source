// MUDEX1 - MUDEX LOADS WITH DAGGERFALL ENEMY EXPANSION. MUDEX is Ralzar's form of the Meaner Monsters stat set for a
// game with that mod in it, two tables in DEX's own format, read by DEX's reader after DEX's own (BestiaryMod.GetDBAssets
// walks the enabled mods in load order, and MUDEX depends on DEX): its monsters edit the rows as DEX left them, its
// tables join or restate DEX's. It has no switch: it loads when DEX does and never without it, and `mudex: false` is the
// test seam that loads DEX alone. Each law with its mutant (tools/mutants/mudex1.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUDEX_TABLE_TEXT } from '../../../src/systems/enemyExpansion/mudexTableText.js';
import { mudexTextSource } from '../../../tools/mudexText.mjs';
import { installEnemyExpansion, _resetEnemyExpansion, dexRead, dexClassicRow, DEX_VENDOR } from '../../../src/systems/enemyExpansion/dexInstall.js';
import { MUDEX_VENDOR, mudexLoaded } from '../../../src/systems/enemyExpansion/dexSwitches.js';
import { ENEMY_BASICS, VANILLA_ENEMY_BASICS } from '../../../src/characters/enemy/enemyBasics.js';
import { clearCustomEnemies } from '../../../src/characters/enemy/customEnemies.js';
import { makeEnemyEntity, _resetMintRowEditors } from '../../../src/characters/enemy/enemyEntity.js';
import { CLASSIC_STAT_PASS } from '../../../src/systems/enemyExpansion/classic-stat-pass.ts';
import { latchModLoaded } from '../../../src/systems/modSettings.js';
import { _resetExtraQuestRows } from '../../../src/systems/quest/tables.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rd = (p) => readFileSync(join(ROOT, p));
const silent = () => {};
const reset = () => { _resetEnemyExpansion(); clearCustomEnemies(); _resetMintRowEditors(); _resetExtraQuestRows(); latchModLoaded(DEX_VENDOR, undefined); };
const STATS = ['level', 'minDamage', 'maxDamage', 'minHealth', 'maxHealth', 'armorValue'];
const stats = (row) => STATS.map((k) => row[k]);

test('MUDEX1 the record: the two tables are the vendored files byte for byte, in the manifest\'s order, and the module is what tools/mudexText.mjs writes; the manifest needs DEX 1.3.4', () => {
  const manifest = JSON.parse(rd('vendor/mudex/MUDEX.dfmod.json').toString('utf8'));
  assert.equal(manifest.ModTitle, 'MUDEX'); assert.equal(manifest.ModVersion, '1.0.1'); assert.equal(manifest.ModAuthor, 'Ralzar');
  assert.deepEqual(manifest.Dependencies, [{ Name: 'daggerfall enemy expansion', IsOptional: false, IsPeer: false, Version: '1.3.4' }]);
  assert.deepEqual(Object.keys(MUDEX_TABLE_TEXT), manifest.Files.map((f) => f.split('/').pop()));
  for (const [name, text] of Object.entries(MUDEX_TABLE_TEXT)) assert.ok(Buffer.from(text, 'utf8').equals(rd(`vendor/mudex/${name}`)), `${name}: the game's text is the vendored bytes`);
  assert.match(rd('vendor/mudex/README.md').toString('utf8'), /github\.com\/Ralzar81\/MUDEX` @\n`6b6665569ca97bba15990a3510ad43f116ac1041`/, 'the record names its commit');
});

test('MUDEX1 the switch: MUDEX loads for the game whenever DEX does - never without DEX; the test seam `mudex: false` loads DEX alone; the install answers it and a reset lets it go', (t) => {
  t.after(reset);
  for (const [on, mudex, want] of [[true, undefined, true], [true, true, true], [true, false, false], [false, undefined, false], [false, true, false]]) {
    reset();
    assert.equal(installEnemyExpansion({ on, ...(mudex === undefined ? {} : { mudex }), log: silent }).mudex, want, `DEX ${on}, mudex ${mudex}`);
    assert.equal(mudexLoaded(), want);
  }
  reset();
  installEnemyExpansion({ on: true, log: silent });
  _resetEnemyExpansion();
  assert.equal(mudexLoaded(), false, 'the reset lets MUDEX go with the mod');
  assert.equal(dexRead({ log: silent }), dexRead({ mudex: false, log: silent }), "and the game's read is DEX's alone again");
});

test('MUDEX1 the monsters: its lines edit the rows as DEX\'s left them, field by field - written into the table and at a foe\'s mint - a classic DEX restats (the bear), one it leaves (the rat) and one of DEX\'s own (the Goblin); every field MUDEX names no value for stays DEX\'s', (t) => {
  t.after(reset);
  const dex = dexRead({ mudex: false, log: silent }), mudex = dexRead({ mudex: true, log: silent });
  const bearDex = dexClassicRow(4, VANILLA_ENEMY_BASICS[4]), bear = dexClassicRow(4, VANILLA_ENEMY_BASICS[4], { mudex: true });
  assert.deepEqual(stats(mudex.classic.get(4).row), [4, 1, 20, 50, 100, 7], 'MUDEX\'s Grizzly Bear line, over DEX\'s');
  assert.deepEqual(stats(bear), [4, 1, 10, 16, 44, 7], 'and the stat pass (classic-stat-pass.ts) over it, which a loaded MUDEX carries');
  for (const k of Object.keys(bearDex)) if (!STATS.includes(k)) assert.deepEqual(mudex.classic.get(4).row[k], bearDex[k], `bear.${k}: DEX's`);
  assert.equal(bearDex.maxDamage, 12, '(DEX\'s own bear: 1-12)');
  assert.deepEqual(stats(mudex.classic.get(0).row), [1, 1, 2, 15, 25, 8], 'the rat, which DEX leaves, is MUDEX\'s');
  assert.deepEqual(stats(dexClassicRow(0, VANILLA_ENEMY_BASICS[0], { mudex: true })), [1, 1, 3, 11, 20, 8], 'and the stat pass\'s once it is loaded');
  assert.deepEqual(stats(mudex.enemies.get(256).row), [2, 4, 15, 10, 20, 2], 'the Goblin restated');
  assert.deepEqual(stats(dex.enemies.get(256).row), [2, 1, 6, 11, 20, 2], '(DEX\'s own Goblin)');
  assert.equal(mudex.enemies.get(256).careerName, dex.enemies.get(256).careerName, 'a line with no career keeps the enemy\'s');
  assert.equal(mudex.enemies.size, 50, 'MUDEX adds no enemy');
  installEnemyExpansion({ on: true, log: silent });
  assert.deepEqual(stats(ENEMY_BASICS[4]), stats(bear), 'written into the table while loaded');
  assert.deepEqual(stats(ENEMY_BASICS[256]), [2, 4, 15, 10, 20, 2]);
  const minted = makeEnemyEntity(4, ENEMY_BASICS[4], null, 1, () => 0.5);
  assert.deepEqual(stats(minted.basics), stats(bear), 'and at the mint');
});

test('MUDEX1 the tables: a dungeon type gains MUDEX\'s themed tables beside its default, and the defaults MUDEX restates are its lines (ParseEncounterTables\' replacement arm) - the crypt six tables, a climate\'s night MUDEX\'s own; DEX alone, one', () => {
  const dex = dexRead({ mudex: false, log: silent }).encounters, mudex = dexRead({ mudex: true, log: silent }).encounters;
  assert.deepEqual(dex.byIndex.get(0).map((x) => x.name), ['DefaultCrypt']);
  assert.deepEqual(mudex.byIndex.get(0).map((x) => x.name), ['DefaultCrypt', 'MUDEX_Crypt_Lich', 'MUDEX_Crypt_Vampire', 'MUDEX_Crypt_Mummy', 'MUDEX_Crypt_Necromancer', 'MUDEX_Crypt_Spooky']);
  assert.deepEqual(mudex.tables.get('DefaultCrypt').enemyIds, [15, 19, 18, 24, 15, 32, 18, 24, 30, 19, 15, 23, 32, 19, 18, 23, 15, 19, 18, 23], 'MUDEX\'s crypt, not DEX\'s');
  assert.notDeepEqual(dex.tables.get('DefaultCrypt').enemyIds, mudex.tables.get('DefaultCrypt').enemyIds);
  assert.deepEqual(mudex.byIndex.get(34).map((x) => x.name), ['DefaultWoodlandsNight'], 'a climate keeps one table');
  assert.equal(mudex.byIndex.get(34)[0].enemyIds[0], 0, 'MUDEX\'s woodlands night (a rat first)');
  assert.equal(dex.byIndex.get(34)[0].enemyIds[0], 3, '(DEX\'s: a giant bat first)');
  for (let i = 0; i <= 37; i++) assert.ok(mudex.byIndex.get(i)?.length, `index ${i} has a table`);
});

test("MUDEX1 the stat pass rides MUDEX: with the mod loaded a classic monster stands at CLASSIC_STAT_PASS's numbers in the table and at the mint; DEX alone (`mudex: false`) keeps its own line; without DEX the row is DFU's", (t) => {
  t.after(reset);
  const pass = CLASSIC_STAT_PASS[4];
  const passStats = [pass.level, pass.minDamage, pass.maxDamage, pass.minHealth, pass.maxHealth, pass.armorValue];
  installEnemyExpansion({ on: true, log: silent });
  assert.deepEqual(stats(ENEMY_BASICS[4]), passStats, 'MUDEX loaded: the stat pass in the table');
  assert.deepEqual(stats(makeEnemyEntity(4, ENEMY_BASICS[4], null, 1, () => 0.5).basics), passStats, 'and at the mint');
  reset();
  installEnemyExpansion({ on: true, mudex: false, log: silent });
  assert.deepEqual(stats(ENEMY_BASICS[4]), stats(dexClassicRow(4, VANILLA_ENEMY_BASICS[4])), 'DEX alone: its own line, no stat pass');
  assert.notDeepEqual(stats(ENEMY_BASICS[4]), passStats);
  reset();
  installEnemyExpansion({ on: false, log: silent });
  assert.deepEqual(stats(ENEMY_BASICS[4]), stats(VANILLA_ENEMY_BASICS[4]), "no DEX: DFU's row");
  assert.equal(MUDEX_VENDOR, 'mudex');
});
