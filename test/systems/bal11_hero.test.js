// The hero's threat at its seams, by execution: the reader (the ladder, the mentor, a puppet), the open world's spawn
// pool and the two doors a foe's harm reaches the player by. The pure law and the writer are in hero-threat.test.js.

import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentorProfile } from '../../src/systems/mentorMode.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { HERO_THREAT, heroThreat, heroThreatOf } from '../../src/systems/heroThreat.js';
import { makeEnemyEntity, applyHeroThreat } from '../../src/characters/enemy/enemyEntity.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { createExteriorFoes } from '../../src/scenes/exteriorFoes.js';
import { lootRarityOn } from '../../src/systems/loot/lootRarity.js';
import { calculateAttackDamage } from '../../src/combat/formulas.js';
import { casterDamageScaled } from '../../src/systems/effects.js';

const ladder = (on) => { _resetForTests(); setPref('lootRarity', on); };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 5e-9, `${msg}: ${a} is not ${b}`);
const stats = (o = {}) => ({ strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50, ...o });
const career = stats({ attackModifierFlags: 0 });
const monster = (id = 24) => makeEnemyEntity(id, ENEMY_BASICS[id], career, 12, () => 0.5);

test('the reader: the level the world is built around; a mentor\'s group level; a puppet\'s blows alone; nothing with the ladder off or nothing to pay', () => {
  try {
    ladder(true);
    assert.equal(heroThreatOf({ level: HERO_THREAT.from }), null, 'level 30: nothing');
    assert.equal(heroThreatOf(null), null);
    close(heroThreatOf({ level: 40 }).damage, HERO_THREAT.damage ** 10, 'the level alone');
    // mentoring: the level the world is built at (mentorMode.js effectiveLevel, the group's level plus one)
    const mentor = (group) => ({ level: 45, _mentor: mentorProfile({ level: 45 }, [group]) });
    assert.deepEqual([mentor(30)._mentor.worldLevel, mentor(29)._mentor.worldLevel], [31, 30], 'the group\'s level, plus one');
    close(heroThreatOf(mentor(30)).damage, HERO_THREAT.damage, 'a mentor: the group\'s level');
    assert.equal(heroThreatOf(mentor(29)), null, 'a mentor of a level-30 world: nothing');
    // a puppet: my threat's blows, its health its owner's word
    const p = heroThreatOf({ level: 40 }, { puppet: true });
    close(p.damage, heroThreat(40).damage, 'a puppet\'s blows at me: mine');
    assert.equal(p.health, 1, 'a puppet\'s health: its owner\'s');
    ladder(false);
    assert.equal(heroThreatOf({ level: 45 }), null, 'the ladder off: DFU\'s own foes');
    assert.equal(lootRarityOn(), false);
  } finally { ladder(true); }
});

// the open world's pool on a crafted MONSTER.BSA: an Orc Warlord at midnight
function craftCfg() {
  const b = new Uint8Array(74); const v = new DataView(b.buffer);
  b[10] = 0x08; v.setUint16(52, 4, true);
  [40, 50, 50, 85, 50, 50, 90, 55].forEach((a, i) => v.setUint16(58 + i * 2, a, true));
  return b;
}
function craftMonsterBsa(records) {
  const NAME_FIELD = 14, ENTRY = 18;
  const out = new Uint8Array(4 + records.reduce((a, [, b]) => a + b.length, 0) + ENTRY * records.length); const v = new DataView(out.buffer);
  v.setInt16(0, records.length, true); v.setUint16(2, 0x0100, true);
  let pos = 4;
  for (const [, bytes] of records) { out.set(bytes, pos); pos += bytes.length; }
  for (const [name, bytes] of records) { for (let i = 0; i < name.length; i++) out[pos + i] = name.charCodeAt(i); v.setInt32(pos + NAME_FIELD, bytes.length, true); pos += ENTRY; }
  return out;
}
const BSA = craftMonsterBsa([['ENEMY024.CFG', craftCfg()]]);
const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8, getFrameCount: () => 1 };
const wildsPool = (level, inLocation = () => false) => createExteriorFoes({
  renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, textures: new Map() },
  collider: { raycast: () => Infinity, heightAt: () => 0, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false, capsuleCast: () => ({ dist: Infinity, key: null }), sphereCast: () => ({ dist: Infinity, key: null }), move: (f) => f },
  fetchBytes: async (n) => { if (n === 'MONSTER.BSA') return BSA; throw new Error(`no ${n} in this pin`); },
  getTexture: async () => stubTex, uploadRecordFrame: () => {},
  currentMinute: () => 0, currentPixelKey: () => '3,12',
  playerEntity: { level, reflexes: 2, health: 50, maxHealth: 50, skills: new Array(40).fill(20), skillUses: new Array(40).fill(0), items: [], activeEffects: [], stats: stats() },
  audio: null, onPlayerHurt: () => {}, rolls: () => 0.01, rand: () => 0.01,
  inLocation,
});
const withRandom = async (v, fn) => { const old = Math.random; Math.random = () => v; try { return await fn(); } finally { Math.random = old; } };

test('the wilds by execution: my foe stands at the hero\'s threat; an elite, a champion, an ally, a location\'s ground and the ladder off take none; a peer\'s puppet strikes me at my threat, its health its owner\'s', async () => {
  try {
    const spawn = async (level, opts = {}, { on = true, inLocation } = {}) => { ladder(on); return (await withRandom(0.5, () => wildsPool(level, inLocation).spawnFoe(24, [10, 0, 10], { feetGiven: true, eliteFoe: false, champion: null, ...opts }))).entity; };
    const h = heroThreat(40);
    const plain = await spawn(40, {}, { on: false });
    const at40 = await spawn(40);
    assert.equal(at40.maxHealth, Math.max(1, Math.round(plain.maxHealth * h.health)), 'the health');
    close(at40.damageScale, h.damage, 'the blows');
    close(at40.healthMult, h.health, 'the health stood on healthMult, the poise\'s divisor');
    const at30 = await spawn(30);
    assert.equal(at30.maxHealth, plain.maxHealth, 'level 30: the kind as its row has it');
    // a promoted foe has stats of its own and takes no threat: level 40 is level 30 to it
    const elite40 = await spawn(40, { eliteFoe: true });
    const elite30 = await spawn(30, { eliteFoe: true });
    assert.equal(elite40.eliteFoe, true, 'an elite stands');
    assert.equal(elite40.maxHealth, elite30.maxHealth, 'an elite: no threat on its health');
    assert.equal(elite40.damageScale, elite30.damageScale, 'an elite: no threat on its blows');
    const champion40 = await spawn(40, { champion: 0 });
    const champion30 = await spawn(30, { champion: 0 });
    assert.ok(champion40.champion, 'a champion stands');
    assert.equal(champion40.maxHealth, champion30.maxHealth, 'a champion: no threat on its health');
    assert.equal(champion40.damageScale, champion30.damageScale, 'a champion: no threat on its blows');
    // never on a location's ground, never an ally
    const town = await spawn(40, {}, { inLocation: () => true });
    assert.equal(town.maxHealth, plain.maxHealth, 'a location\'s ground: nothing');
    const ally = await spawn(40, { allied: true });
    assert.equal(ally.maxHealth, plain.maxHealth, 'an ally: nothing');
    // a peer's puppet: my threat's blows, its own (its owner's) health
    ladder(true);
    const pup = (await withRandom(0.5, () => wildsPool(40).spawnFoe(24, [10, 0, 10], { feetGiven: true, puppet: 'peer-1', seq: 7, level: 19, champion: null }))).entity;
    assert.equal(pup.maxHealth, plain.maxHealth, 'a puppet\'s maximum is untouched here (its owner\'s `k` lands on it)');
    close(pup.damageScale, h.damage, 'a puppet strikes me at my threat');
    const pup30 = (await withRandom(0.5, () => wildsPool(30).spawnFoe(24, [10, 0, 10], { feetGiven: true, puppet: 'peer-1', seq: 8, level: 19, champion: null }))).entity;
    assert.equal(pup30.damageScale, plain.damageScale, 'a puppet at level 30: nothing');
    const pupTown = (await withRandom(0.5, () => wildsPool(40, () => true).spawnFoe(24, [10, 0, 10], { feetGiven: true, puppet: 'peer-1', seq: 9, level: 19, champion: null }))).entity;
    assert.equal(pupTown.damageScale, plain.damageScale, 'a puppet on a location\'s ground: nothing, as my own foe there');
  } finally { ladder(true); }
});

test('both doors a foe\'s harm reaches me by: its blow at the formula\'s tail and its spell at the spell door land at its damageScale', () => {
  const foe = monster(24);
  applyHeroThreat(foe, heroThreat(40));
  const me = { isPlayer: true, level: 40, stats: stats(), skills: new Array(35).fill(40), career: { weaponArmorShieldsBitfield: 0, abilityFlagsAndSpellPointsBitfield: 0 }, health: 1e6, maxHealth: 1e6, items: [], armorValues: new Array(7).fill(100), reflexes: 2, biographyAvoidHitMod: 0 };
  // the spell door: a 100-point bolt
  assert.equal(casterDamageScaled(100, foe, me), Math.max(1, Math.round(100 * heroThreat(40).damage)), 'a spell at the threat');
  // the blow: the same rolls through a plain twin and the scaled foe
  const twin = monster(24);
  const seq = (s) => { let a = s; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; };
  let landed = 0;
  for (let s = 1; s <= 300; s++) {
    const plain = calculateAttackDamage(twin, me, { rolls: seq(s), dfRand: (() => { const r = seq(s + 9999); return () => Math.floor(r() * 32768); })() });
    const hit = calculateAttackDamage(foe, me, { rolls: seq(s), dfRand: (() => { const r = seq(s + 9999); return () => Math.floor(r() * 32768); })() });
    if (plain > 0) { landed++; assert.equal(hit, Math.max(1, Math.round(plain * foe.damageScale)), `seed ${s}`); } else assert.equal(hit, 0, `seed ${s}: a miss is a miss`);
  }
  assert.ok(landed > 30, `enough blows landed (${landed})`);
});
