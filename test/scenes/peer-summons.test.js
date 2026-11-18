// Two street pools, two players: my summon is my ally on the other player's screen too, and that player's foes fight it,
// each blow landing where the summon is real.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExteriorFoes } from '../../src/scenes/exteriorFoes.js';
import { summonedBody } from '../../src/systems/foeLootCap.js';
import { coopCandidates } from '../../src/scenes/peer-allies.js';

function craftCfg({ hpPerLevel = 4, speed = 90, str = 40, agi = 85, luck = 55, atkFlags = 0x08 } = {}) {
  const bytes = new Uint8Array(74);
  const view = new DataView(bytes.buffer);
  bytes[10] = atkFlags;
  view.setUint16(52, hpPerLevel, true);
  const attrs = [str, 50, 50, agi, 50, 50, speed, luck];
  for (let i = 0; i < 8; i++) view.setUint16(58 + i * 2, attrs[i], true);
  return bytes;
}
function craftMonsterBsa(records) {
  const NAME_FIELD = 14;
  const ENTRY = 18;
  const dataLen = records.reduce((sum, [, b]) => sum + b.length, 0);
  const out = new Uint8Array(4 + dataLen + ENTRY * records.length);
  const view = new DataView(out.buffer);
  view.setInt16(0, records.length, true);
  view.setUint16(2, 0x0100, true);
  let pos = 4;
  for (const [, bytes] of records) {
    out.set(bytes, pos);
    pos += bytes.length;
  }
  for (const [name, bytes] of records) {
    for (let i = 0; i < name.length; i++) out[pos + i] = name.charCodeAt(i);
    view.setInt32(pos + NAME_FIELD, bytes.length, true);
    pos += ENTRY;
  }
  return out;
}
const bsa = craftMonsterBsa([
  ['ENEMY000.CFG', craftCfg()],
  ['ENEMY003.CFG', craftCfg({ speed: 60 })],
]);
const stubTex = {
  getSize: () => ({ width: 64, height: 100 }),
  getScale: () => ({ width: 0, height: 0 }),
  recordCount: 8,
  getFrameCount: () => 1,
};
const poolRig = () => ({
  renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, textures: new Map() },
  collider: {
    raycast: () => Infinity,
    heightAt: () => 0,
    raycastHit: () => ({ dist: Infinity, normal: null }),
    sphereOverlaps: () => false,
  },
  fetchBytes: async (name) => {
    if (name === 'MONSTER.BSA') return bsa;
    throw new Error(`no ${name} in this test`);
  },
  getTexture: async () => stubTex,
  uploadRecordFrame: () => {},
  currentMinute: () => 0,
  currentPixelKey: () => '3,12',
  playerEntity: {
    level: 1,
    reflexes: 2,
    skills: new Array(40).fill(20),
    skillUses: new Array(40).fill(0),
    items: [],
    activeEffects: [],
    stats: { strength: 50, agility: 50, luck: 50, speed: 50 },
  },
  audio: null,
  onPlayerHurt: () => {},
  rolls: () => 0.5,
  rand: () => 0.5,
});
const netAs = (id, hits) => ({
  selfId: () => id,
  room: () => 'world:3,12',
  onPeerHit: (hit, fate) => {
    hits.push(hit);
    fate?.sent?.();
    return true;
  },
  toWire: (f) => [f[0], f[1], f[2]],
  toScene: (p) => [p[0], p[1], p[2]],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Me (mac) with a summon, and bob with an orc, each pool standing the other's frame. */
async function summonAndOrc() {
  const hitsA = [];
  const hitsB = [];
  const A = createExteriorFoes(poolRig());
  const B = createExteriorFoes(poolRig());
  A.setNet(netAs('mac-0001', hitsA));
  B.setNet(netAs('bob-0002', hitsB));
  const summon = summonedBody(await A.spawnFoe(0, [10, 0, 10], { feetGiven: true, allied: true, loose: true }));
  const orc = await B.spawnFoe(3, [12, 0, 12], { feetGiven: true });
  const frame = A.foesFrame(true);
  B.applyFoes('mac-0001', frame);
  A.applyFoes('bob-0002', B.foesFrame(true));
  await settle();
  const summonThere = B.foes.find((f) => f.puppet === 'mac-0001');
  const orcHere = A.foes.find((f) => f.puppet === 'bob-0002');
  assert.ok(summonThere && orcHere, 'each stood on the other client');
  return { A, B, hitsA, hitsB, summon, orc, frame, summonThere, orcHere };
}

test("my summon rides my frame as my ally, and the other player stands it on the player's side, not as a hostile foe", async () => {
  const { A, B, summon, frame, summonThere } = await summonAndOrc();
  assert.deepEqual(frame.cp, [summon.seq], 'my frame names my summon');
  assert.equal(summonThere.entity.team, 'PlayerAlly');
  assert.equal(summonThere.companion, `peer:mac-0001:${summon.seq}`, "a foe of bob's may fight it");
  B.applyFoes('mac-0001', A.foesFrame(true));
  assert.equal(summonThere.entity.team, 'PlayerAlly', 'the next frame keeps it so');
  assert.ok(!summonThere.shipmate, 'it wears no crew bar');
});

test("the other player's foe that strikes my summon sends the blow to me, and it lands on my summon", async () => {
  const { A, hitsB, summon, orc, summonThere, orcHere } = await summonAndOrc();
  summonThere.hurtFromFoe(5, [1, 0, 0], orc);
  const blow = hitsB.find((h) => h.fb === 1);
  assert.ok(blow, "bob sends the foe's blow to me");
  assert.deepEqual([blow.to, blow.i, blow.sf], ['mac-0001', summon.seq, orc.seq]);
  const before = summon.entity.health;
  assert.equal(A.applyHit('bob-0002', blow), true);
  assert.equal(summon.entity.health, before - 5, 'it lands on my summon');
  assert.equal(summon.ai.target, orcHere, 'which turns on the orc');
});

test("my summon hunts the other player's foe, and its blow goes to that player and lands, the foe turning on my summon", async () => {
  const { B, hitsA, summon, orc, summonThere, orcHere } = await summonAndOrc();
  assert.ok(coopCandidates(summon, [orcHere]).includes(orcHere), "the orc is among my summon's candidates");
  orcHere.hurtFromFoe(7, [0, 0, 1], summon);
  const blow = hitsA.find((h) => h.al === 1);
  assert.ok(blow, "I send my summon's blow to bob");
  assert.deepEqual([blow.to, blow.i, blow.ac], ['bob-0002', orc.seq, summon.seq]);
  const before = orc.entity.health;
  assert.equal(B.applyHit('mac-0001', blow), true);
  assert.equal(orc.entity.health, before - 7, 'it lands on his orc');
  assert.equal(orc.ai.target, summonThere, 'which turns on my summon, not on me');
});
