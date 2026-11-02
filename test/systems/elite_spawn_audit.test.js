// Regression tests execute the real outdoor spawn/save/restore pool with synthetic art/career fixtures.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExteriorFoes } from '../../src/scenes/exteriorFoes.js';
import { eliteRng, pickDungeonElites, markDungeonPromotions, promoteEliteFoe, grantEliteLoot, ELITE_FOE_OVERWORLD_CHANCE, ELITE_FOE_MIN_LEVEL } from '../../src/systems/eliteFoes.js';
import { promotionTierOf } from '../../src/systems/foe-promotion.ts';
import * as CH from '../../src/systems/champions.js';
// Ported onto ELITE-RARITY/ELITE-FLOOR (#536): an eligible kind (ENEMY002, level >= ELITE_FOE_MIN_LEVEL) and the live odds.
import { setPref } from '../../src/systems/uiPrefs.js';
function craftCfg({ hpPerLevel = 4, speed = 90, str = 40, agi = 85, luck = 55, atkFlags = 0x08 } = {}) {
  const b = new Uint8Array(74); const v = new DataView(b.buffer);
  b[10] = atkFlags; v.setUint16(52, hpPerLevel, true);
  const attrs = [str, 50, 50, agi, 50, 50, speed, luck];
  for (let i = 0; i < 8; i++) v.setUint16(58 + i * 2, attrs[i], true);
  return b;
}
function craftMonsterBsa(records) {
  const NAME_FIELD = 14, ENTRY = 18;
  const dataLen = records.reduce((a, [, b]) => a + b.length, 0);
  const out = new Uint8Array(4 + dataLen + ENTRY * records.length); const v = new DataView(out.buffer);
  v.setInt16(0, records.length, true); v.setUint16(2, 0x0100, true);
  let pos = 4;
  for (const [, bytes] of records) { out.set(bytes, pos); pos += bytes.length; }
  for (const [name, bytes] of records) { for (let i = 0; i < name.length; i++) out[pos + i] = name.charCodeAt(i); v.setInt32(pos + NAME_FIELD, bytes.length, true); pos += ENTRY; }
  return out;
}
const bsa = craftMonsterBsa([['ENEMY002.CFG', craftCfg()]]);
const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8, getFrameCount: () => 1 };
const settle = () => new Promise((r) => setTimeout(r, 0));
const playerEntity = () => ({ level: 1, reflexes: 2, health: 50, maxHealth: 50, skills: new Array(40).fill(20), skillUses: new Array(40).fill(0), items: [], activeEffects: [], stats: { strength: 50, agility: 50, luck: 50, speed: 50, endurance: 50 }, armorValues: new Array(7).fill(60) });
const poolRig = (extra = {}) => ({
  renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, textures: new Map() },
  collider: { raycast: () => Infinity, heightAt: () => 0, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false, capsuleCast: () => ({ dist: Infinity, key: null }), sphereCast: () => ({ dist: Infinity, key: null }), move: (feet, mx, my, mz) => { feet[0] += mx; feet[2] += mz; return { grounded: true, hitCeiling: false, groundKey: 'floor' }; } },   // the pursuit walks on open flat ground
  fetchBytes: async (n) => { if (n === 'MONSTER.BSA') return bsa; throw new Error(`no ${n} in this pin`); },
  getTexture: async () => stubTex,
  uploadRecordFrame: () => {},
  currentMinute: () => 0,
  currentPixelKey: () => '3,12',
  playerEntity: playerEntity(),
  audio: null,
  onPlayerHurt: () => {},
  rolls: () => 0.01,
  rand: () => 0.01,
  ...extra,
});

const net = (id = 'audit-player') => ({ selfId: () => id, room: () => 'world:3,12', peers: () => [], toWire: p => [...p], toScene: p => [...p] });
function onlinePool() {
  const player = playerEntity();
  player.level = 30; player.skills.fill(200);
  const pool = createExteriorFoes(poolRig({ inLocation: () => false, playerEntity: player, rolls: eliteRng(19) }));
  pool.setNet(net());
  return pool;
}
async function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try { return await fn(); } finally { Math.random = old; }
}
async function restored(pool, saved) {
  pool.clearLive();
  pool.restoreWorld(saved, (x,z) => [x,z]);
  for (let i = 0; i < 20 && !pool.foes.length; i++) await settle();
  assert.equal(pool.foes.length, 1, 'the actual async spawn completed');
  return pool.foes[0];
}
// A spot whose street roll lands `first` at the pool's first stand and `second` at its second (the reload's), so a test
// can make the reload's dice disagree with what was saved. The roll is a hash of the spot and the pool's count, never a draw.
function spotRolling(first, second, mobileType = 2) {
  for (let i = 0; i < 20000; i++) {
    const feet = [10 + i * 0.5, 0, 10];
    CH._resetStreetChampionsForTests();
    const a = CH.rollStreetPromotion(feet, mobileType)?.tier ?? null;
    const b = CH.rollStreetPromotion(feet, mobileType)?.tier ?? null;
    if (a === first && b === second) { CH._resetStreetChampionsForTests(); return feet; }
  }
  throw new Error(`no spot rolls ${first} then ${second}`);
}
for (const wasElite of [false, true]) {
 test(`elite persistence: ${wasElite ? 'elite stays elite' : 'normal stays normal'} when the reload's roll disagrees`, async () => {
  setPref('lootRarity', true);
  const feet = wasElite ? spotRolling('elite', null) : spotRolling(null, 'elite');
  const pool = onlinePool();
  try {
   const f = await pool.spawnFoe(2, feet, { feetGiven: true });
   assert.equal(!!f.entity.eliteFoe, wasElite);
   f.entity.health = Math.max(1, Math.floor(f.entity.maxHealth / 3));
   const expected = { hp: f.entity.health, max: f.entity.maxHealth, damage: f.entity.damageScale, items: structuredClone(f.entity.items) };
   const saved = pool.snapshotWorld(p => ({ x: p[0], z: p[2] }));
   const after = await restored(pool, saved);
   assert.equal(!!after.entity.eliteFoe, wasElite, 'reload must not reroll classification');
   assert.equal(after.entity.health, expected.hp);
   assert.equal(after.entity.maxHealth, expected.max);
   assert.equal(after.entity.damageScale, expected.damage);
   assert.deepEqual(after.entity.items, expected.items, 'restore preserves the exact saved reward, no fresh elite loot');
  } finally { pool.destroy(); }
 });
}
test('legacy outdoor snapshots do not acquire a new elite on load', async () => {
 setPref('lootRarity', true);
 const feet = spotRolling(null, 'elite');
 const pool = onlinePool();
 try {
  await pool.spawnFoe(2, feet, { feetGiven: true });
  const saved = pool.snapshotWorld(p => ({ x: p[0], z: p[2] })); delete saved[0].eliteFoe;
  const f = await restored(pool, saved);
  assert.equal(!!f.entity.eliteFoe, false);
 } finally { pool.destroy(); }
});
test('outdoor elite odds: the elite band of the street hash, 5 seeded spot streams of 200,000; strict band boundary', () => {
 setPref('lootRarity', true);
 const P = ELITE_FOE_OVERWORLD_CHANCE;
 assert.equal(P, 0.01);
 const band = P * 1000;
 assert.equal(promotionTierOf(0), 'elite');
 assert.equal(promotionTierOf(band - 1), 'elite');
 assert.equal(promotionTierOf(band), 'champion', 'the band is strict: the next hash is a champion\'s');
 let total = 0;
 for (const seed of [1, 42, 523, 524, 20261002]) {
  const r = eliteRng(seed);
  CH._resetStreetChampionsForTests();
  let count = 0;
  for (let i = 0; i < 200000; i++) if (CH.rollStreetPromotion([r() * 4000 - 2000, 0, r() * 4000 - 2000], 7)?.tier === 'elite') count++;
  assert.ok(Math.abs(count / 200000 - P) < 0.002, `${seed}: ${count}`);
  total += count;
 }
 assert.ok(Math.abs(total / 1000000 - P) < 0.001, `${total} of 1000000`);
});
test('dungeon elites: none placed by count in an ordinary dungeon, the per-foe roll marks about one in a hundred; 3-4 in elite locations; stable marks and exclusions', () => {
 setPref('lootRarity', true);
 let normal = 0, three = 0, four = 0, rolled = 0;
 for (let key = 0; key < 10000; key++) {
  const layout = () => Array.from({ length: 40 }, (_, i) => ({ mobileType: 7, allied: i === 0, reaction: i === 1 ? 'passive' : 'hostile', ...(i === 2 ? { champion: 0 } : {}) }));
  const a = layout(), b = layout();
  assert.equal(pickDungeonElites(a, key, { elite: false }), 0, 'an ordinary dungeon places none by count');
  markDungeonPromotions(a, key);
  normal += a.filter((x) => x.eliteFoe).length;
  markDungeonPromotions(b, key); assert.deepEqual(a, b, 'reloading the same dungeon does not reroll marks');
  rolled += 37;   // the layout's 40 records less the ally, the passive foe and the champion
  assert.equal(a.slice(0, 3).some((x) => x.eliteFoe), false, 'the roll leaves an ally, a passive foe and a champion as they were');
  assert.equal(a[2].champion, 0);
  const e = layout(), count = pickDungeonElites(e, key);
  assert.equal(e.slice(0, 3).some((x) => x.eliteFoe), false, 'allies, passive foes and champions are excluded');
  if (count === 3) three++; else if (count === 4) four++; else assert.fail(`elite count ${count}`);
 }
 assert.ok(Math.abs(normal / rolled - ELITE_FOE_OVERWORLD_CHANCE) < 0.002, `${normal} of ${rolled}`);
 assert.ok(three > 0 && four > 0, `elite dungeons: ${three} with 3, ${four} with 4`);
});
test('elite promotion and bonus loot are idempotent on the same entity', () => {
 const e = { level: ELITE_FOE_MIN_LEVEL, health: 10, maxHealth: 10, items: [] };
 promoteEliteFoe(e); promoteEliteFoe(e);
 assert.equal(e.maxHealth, 20); assert.equal(e.damageScale, 1.3);
 grantEliteLoot(e, 30, eliteRng(4)); const items = structuredClone(e.items);
 for (let i = 0; i < 50; i++) grantEliteLoot(e, 30, eliteRng(i));
 assert.deepEqual(e.items, items);
});
