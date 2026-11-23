// LOOT7 - CHAMPION FOES (2026-10-01;  - "Champion foes. Single named foes with visible traits (Fiery, Swift, Vampiric) and a
// guaranteed Rare"). The laws pinned here:
//   - THE TRAITS: five, each a name that is its id's (the HUD's leaf spells it), each what its sentence says.
//   - WHO: about one foe in fifty (one in fifty, twenty per mille) - a dungeon's by a hash of the place and the marker (every client the same), the
//     street's by its owner's roll and carried to every puppet (`cp`), a save's kept; never under level 3, the watch,
//     an ally; off, none.
//   - WHAT: 1.4 times its health and its blows 15% harder (on any elite's), its trait on top; its name everywhere.
//   - ITS LOOT: a stronger source, and a Rare or better always - never its worn kit.

import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import * as CH from '../../src/systems/champions.js';
import { markDungeonPromotions } from '../../src/systems/eliteFoes.js';
import * as LR from '../../src/systems/loot/lootRarity.js';
import { spawnEnemyLoot } from '../../src/scenes/hostCombat.js';
import { equipTableOf } from '../../src/systems/equip.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { validFoeRecord } from '../../src/net/wire.js';
import { KNIGHT_CITY_WATCH } from '../../src/characters/mobile/mobileTypes.js';
import { sayEnemyDied } from '../../src/scenes/corpseMarker.js';
import { markFoeStruck, foeTarget, clearFoeTarget } from '../../src/ui/hud/hudFoeTarget.js';
import { liveEntityName } from '../../src/systems/worldTooltips.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { isAmmunition } from '../../src/systems/item/itemTemplates.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const on = () => { _resetForTests(); setPref('lootRarity', true); CH._resetStreetChampionsForTests(); };
const off = () => { _resetForTests(); setPref('lootRarity', false); };
const lcg = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 8) / 0x800000; };
const foe = (level = 10, extra = {}) => ({ level, health: 40, maxHealth: 40, stats: { speed: 50 }, mobileType: 7, ...extra });
const player = { level: 10, gender: 'male', stats: { luck: 50 }, activeEffects: [] };
const seq = (...v) => () => v.shift();

test('LOOT7: the traits - five, each named as its id reads, the wire\'s order its index', () => {
  assert.deepEqual(CH.CHAMPION_TRAITS.map((t) => t.id), ['mighty', 'stalwart', 'swift', 'vampiric', 'thorned']);
  for (const t of CH.CHAMPION_TRAITS) {
    assert.equal(t.name, t.id.charAt(0).toUpperCase() + t.id.slice(1), `${t.id}: the HUD's leaf title-cases the id`);
    assert.ok(t.text, t.id);
    assert.equal(CH.championIndex(t.id), CH.CHAMPION_TRAITS.indexOf(t));
  }
  assert.equal(CH.CHAMPION_PER_MILLE, 20);
  assert.equal(CH.CHAMPION_MIN_LEVEL, 3);
  assert.equal(CH.CHAMPION_TRAITS.length - 1 <= 15, true, 'the wire has room for every index');
});

test('LOOT7: the dungeon\'s - a hash of the place and the marker, the same every time; one foe in fifty is a champion; never an ally; off none', () => {
  on();
  const layout = (n) => Array.from({ length: n }, (_, i) => ({ mobileType: 7, x: i, y: 0, z: 0 }));
  const seen = new Set();
  let champions = 0, elites = 0, total = 0;
  for (let loc = 1; loc <= 2000; loc++) {
    const a = layout(25), b = layout(25);
    markDungeonPromotions(a, loc * 7919);
    markDungeonPromotions(b, loc * 7919);
    const said = (list) => list.map((e) => [e.champion ?? null, e.eliteFoe ?? null]);
    assert.deepEqual(said(a), said(b), 'every client the same');
    for (const e of a) {
      total++;
      if (e.eliteFoe) { elites++; assert.equal(e.champion, undefined, 'an elite is never a champion'); }
      if (e.champion != null) { champions++; seen.add(e.champion); assert.ok(Number.isInteger(e.champion) && CH.CHAMPION_TRAITS[e.champion]); }
    }
  }
  assert.ok(Math.abs(champions / total - 0.02) < 0.004, `about one in fifty (${champions} of ${total})`);
  assert.ok(Math.abs(elites / total - 0.01) < 0.003, `the elite band beside it, one in a hundred (${elites} of ${total})`);
  assert.equal(seen.size, 5, 'every trait stands somewhere');
  const allies = layout(400).map((e) => ({ ...e, allied: true }));
  assert.equal(markDungeonPromotions(allies, 3), 0, 'never an ally');
  // The hash is the build's word: a client on another build must stand the same foes, so these never move.
  const forty = (loc) => { const a = Array.from({ length: 40 }, () => ({ mobileType: 7 })); markDungeonPromotions(a, loc); return a.flatMap((e, i) => (e.eliteFoe ? [[i, 'elite']] : e.champion != null ? [[i, e.champion]] : [])); };
  assert.deepEqual(forty(2), [[2, 2], [30, 3]]);
  assert.deepEqual(forty(7), [[5, 0], [17, 4]]);
  assert.deepEqual(forty(39), [[0, 'elite'], [13, 2], [25, 1]]);
  const first = [{ mobileType: 7 }];
  markDungeonPromotions(first, 39);
  assert.equal(first[0].eliteFoe, true, 'location 39 marks its first marker an elite');
  const kept = [{ mobileType: 7, champion: 2 }];
  assert.equal(markDungeonPromotions(kept, 39), 0);
  assert.equal(kept[0].champion, 2, 'a mark rides its record - a rebuild keeps it');
  off();
  assert.equal(markDungeonPromotions(layout(500), 5), 0, 'off: none');
});

test('LOOT7: the street\'s - a hash of where it stands, its type and the count, never a draw; elite or champion by band; the record carries it and refuses a forged one', () => {
  on();
  const r = lcg(4);
  const spots = Array.from({ length: 20000 }, () => [r() * 4000 - 2000, 0, r() * 4000 - 2000]);
  const real = Math.random;
  Math.random = () => { throw new Error('a draw'); };
  let first;
  try { first = spots.map((p, i) => CH.rollStreetPromotion(p, i % 40)); } finally { Math.random = real; }
  const champions = first.filter((c) => c?.tier === 'champion');
  const elites = first.filter((c) => c?.tier === 'elite');
  assert.ok(Math.abs(champions.length / 20000 - 0.02) < 0.004, `about one in fifty (${champions.length})`);
  assert.ok(Math.abs(elites.length / 20000 - 0.01) < 0.003, `the elite band, one in a hundred (${elites.length})`);
  assert.equal(new Set(champions.map((c) => c.trait)).size, 5, 'every trait');
  CH._resetStreetChampionsForTests();
  assert.deepEqual(spots.map((p, i) => CH.rollStreetPromotion(p, i % 40)), first, 'the same street stands the same foes - a seeded test\'s too');
  CH._resetStreetChampionsForTests();
  const street = [];
  for (let i = 0; i < 200; i++) { const c = CH.rollStreetPromotion([i * 7.5, 0, i * -3.25], 7); if (c) street.push([i, c.tier, c.trait]); }
  assert.deepEqual(street, [[26, 'champion', 4], [28, 'champion', 1], [37, 'champion', 2], [74, 'elite', 0], [103, 'elite', 3], [159, 'champion', 2], [168, 'elite', 1]], 'golden');
  const pick = (type) => { CH._resetStreetChampionsForTests(); return Array.from({ length: 200 }, (_, i) => CH.rollStreetPromotion([i * 7.5, 0, i * -3.25], type)); };
  assert.notDeepEqual(pick(8), pick(7), 'its type is in the hash');
  off();
  assert.ok(Array.from({ length: 200 }, (_, i) => CH.rollStreetPromotion([i * 7.5, 0, i * -3.25], 7)).every((c) => c === null), 'off: none');
  on();
  assert.deepEqual(validFoeRecord({ i: 3, cp: 4 }), { i: 3, cp: 4 });
  for (const bad of [-1, 16, 1.5, 'x']) assert.equal(validFoeRecord({ i: 3, cp: bad }), null, `cp ${bad}`);
  assert.deepEqual(validFoeRecord({ i: 3 }), { i: 3 }, 'none when none');
});

test('LOOT7: what a champion is - 1.4 times the health, 15% harder on any elite\'s, its trait on top; never the low, the watch, an ally, off', () => {
  on();
  const m = foe();
  assert.equal(CH.applyChampion(m, 0), true);
  assert.deepEqual([m.champion, m.maxHealth, m.health, m.damageScale], ['mighty', 56, 56, 1.15 * 1.2]);
  assert.equal(m.stats.speed, 50, 'only the Swift is quicker');
  const s = foe();
  CH.applyChampion(s, 1);
  assert.equal(s.maxHealth, 67, 'the Stalwart: a fifth more on the champion\'s');
  const elite = foe(10, { damageScale: 2, maxHealth: 80, health: 80 });
  CH.applyChampion(elite, 3);
  assert.equal(elite.damageScale, 2 * 1.15, 'onto the elite\'s scale, never over it');
  assert.equal(elite.maxHealth, 112);
  const w = foe(10, { stats: { speed: 90 } });
  CH.applyChampion(w, 2);
  assert.equal(w.stats.speed, 100, 'the Swift: thirty more, never past a hundred');
  for (const [e, why] of [[foe(2), 'under level 3'], [foe(10, { mobileType: KNIGHT_CITY_WATCH }), 'the watch'], [foe(10, { team: 'PlayerAlly' }), 'an ally']]) {
    assert.equal(CH.applyChampion(e, 0), false, why);
    assert.equal(e.champion, undefined);
  }
  assert.equal(CH.applyChampion(foe(), null), false, 'no trait');
  assert.equal(CH.applyChampion(foe(), 9), false, 'a trait the table does not have');
  off();
  const o = foe();
  assert.equal(CH.applyChampion(o, 0), false, 'off: none');
  assert.equal(o.maxHealth, 40);
});

test('LOOT7: its name everywhere - the hover, the HUD\'s target, the death line, the body', () => {
  on();
  const e = foe(10, { career: { name: 'Orc' } });
  CH.applyChampion(e, 0);
  assert.equal(CH.championName(e, 'Orc'), 'Mighty Orc');
  assert.equal(CH.championName(foe(), 'Orc'), 'Orc', 'anyone else as it was');
  markFoeStruck({ entity: e });
  assert.equal(foeTarget().name, 'Mighty Orc', 'the HUD\'s target frame');
  clearFoeTarget();
  assert.equal(liveEntityName({ entity: e }, 'Orc'), 'Mighty Orc', 'the hover\'s namer - every pool\'s one (HOVER-PLAIN: the plaque asks it only at peace)');
  assert.equal(liveEntityName({ entity: foe() }, 'Orc'), 'Orc');
  assert.equal(sayEnemyDied(() => {}, 7, e), 'Mighty Orc just died.');
  assert.equal(sayEnemyDied(() => {}, 7), 'Orc just died.');
});

test('LOOT7: the traits that answer a blow - the Vampiric drinks its blow, the Thorned hurts my blow back; registered', () => {
  on();
  const v = foe(10);
  CH.applyChampion(v, 3);
  v.health = 30;
  CH.championStruck(v, { isPlayer: true }, 20);
  assert.equal(v.health, 40, 'half of its blow heals it');
  CH.championStruck(v, { isPlayer: true }, 200);
  assert.equal(v.health, v.maxHealth, 'never past its maximum');
  v.health = 30;
  CH.championStruck(v, { health: 50 }, 20);
  assert.equal(v.health, 30, 'only a blow on me');
  const me = { isPlayer: true, health: 100, maxHealth: 100, activeEffects: [] };
  const t = foe(10);
  CH.applyChampion(t, 4);
  CH.championStrike(me, t, 70);
  assert.equal(me.health, 90, 'a seventh of my blow, back through my own damage door');
  CH.championStrike(me, foe(10), 70);
  assert.equal(me.health, 90, 'never a plain foe');
  const peer = { ...me, peer: true, health: 100 };
  CH.championStrike(peer, t, 70);
  assert.equal(peer.health, 100, 'a peer\'s blow is its own client\'s');
  const pet = { health: 50, maxHealth: 50, activeEffects: [] };
  CH.championStrike(pet, t, 70);
  assert.equal(pet.health, 50, 'never an ally\'s blow');
});

test('LOOT7: its loot - its own roll and no Rare forced (CHAMP-LOOT), never its worn kit; its own source; nothing off', () => {
  on();
  let wornSeen = 0, rares = 0, bodies = 0;
  for (let seed = 1; seed <= 200; seed++) {
    for (const mobileType of [7, 0, 26]) {   // an orc (a table and a kit), a rat (no table), a Fire Daedra
      const e = { items: [], level: 10, careerIndex: mobileType, isClass: false, stats: { strength: 50, speed: 50 }, skills: 30, health: 50, maxHealth: 50, mobileType };
      CH.applyChampion(e, seed % 5);
      spawnEnemyLoot(e, mobileType, ENEMY_BASICS[mobileType], player, { rolls: lcg(seed) });
      const worn = new Set(e.equip ? equipTableOf(e).filter(Boolean) : []);
      const carried = e.items.filter((it) => !worn.has(it));
      bodies++; if (carried.some((it) => LR.rarityRank(it) >= LR.RARITIES.rare.rank)) rares++;   // CHAMP-LOOT: a chance, not a promise
      for (const it of worn) assert.equal(it.rarity, undefined, 'its worn kit stays DFU\'s');
      wornSeen += worn.size;
    }
  }
  assert.ok(wornSeen > 100, `worn kit to keep (${wornSeen})`);
  assert.ok(rares < bodies * 0.3, `CHAMP-LOOT: no Rare forced - its own roll's alone (${rares}/${bodies})`);
  // THE CHAMPION'S SOURCE: the champion's corpse door is the plain door through championSource (CHAMP-LOOT: Magic and Rare at half, its Legendary two tiers and a quarter up)
  for (let seed = 1; seed <= 80; seed++) {
    const a = { items: [createWeapon(113, 1), createWeapon(127, 1)], level: 6, mobileType: 7, champion: 'mighty' };
    const b = [createWeapon(113, 1), createWeapon(127, 1)];
    LR.rollCorpseLoot(a, { level: 6 }, { rolls: lcg(seed), luck: 50 });
    const src = LR.corpseSource({ level: 6 }, 6, 7);
    LR.rollLootRarity(b, LR.championSource(src), { rolls: lcg(seed), luck: 50 });
    const said = (list) => list.map((it) => [it.rarity ?? null, it.legendary ?? null, JSON.stringify(it.affixes ?? null)]);
    assert.deepEqual(said(a.items), said(b), `seed ${seed}`);
  }
  assert.deepEqual(LR.CHAMPION_SOURCE, { tier: 2, quality: 1.25, ladder: 0.5 });   // CHAMP-LOOT: half the elite's
  off();
});
