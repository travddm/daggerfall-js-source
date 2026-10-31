// RVN-OWNERS-CHOICE (FIELD BUGS 2026-10-16b, bible/01-Overview/bugs/Field-Bugs-2026-10-16b.md; the Discord's "I erased a
// Revenant fro[m]..." thread: "I've been using a 3x disintegrate as my main spell lately ... I believe it bypasses the
// kill/spare on revenants. And it seems it does this to other players' revenants, too ... It probably shouldn't be doable
// to other peoples revs"; the screenshot "Sekrath the Undying (dead)", "Isn't he supposed to give you a choice?").
// A Disintegrate is a WHOLE blow (effects.js: `sinks.hurt(left, { whole: true })`), and both damage doors passed every
// whole blow over a revenant's last stand, its will and its kneel - Revenants.md's "a Disintegrate kills it outright",
// the owner's own rule. But a blow on another player's revenant goes to its owner, a kill as a kill (`z`, AUDIT PSCALE1
// DOORS-1), and the owner's door applied it as whole: anyone's Disintegrate closed anyone's revenant, record and all, and
// its owner never chose. Now a whole blow closes one only as its OWNER's (revenantFate.js ownersWholeKill): the
// player's own, never a peer's; anyone else's - a party member's `z`, a foe's, a round's that names nobody (a stat
// drained to zero) - is a killing blow like any other, and the choice is the owner's (Revenants.md section 15).
// Pinned over the REAL street pools - the striker's (its puppet, the real Disintegrate through the host's sink, the
// divert's word) and the owner's (that word applied at its door, the frame back) - and the dungeon's door mounted from
// its own source over the real law.
import '../../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); }, clear: () => _store.clear(), key: (i) => [..._store.keys()][i] ?? null, get length() { return _store.size; },
};
const N = await import('../../../src/systems/revenant/revenant.js');
const FT = await import('../../../src/systems/revenant/revenantFate.js');
const RC = await import('../../../src/systems/revenant/revenantCompanions.js');
const S = await import('../../../src/systems/companionSlots.js');
const { setPref, _resetForTests } = await import('../../../src/systems/uiPrefs.js');
const { setPlayerDoor } = await import('../../../src/systems/playerDoor.js');
const { setRevenantPresenter } = await import('../../../src/systems/revenant/revenantVoice.js');
const { setTacticsClock, resetTactics } = await import('../../../src/ai/tactics.js');
const { resetBlows } = await import('../../../src/ai/foeBlows.js');
const { setWorldMinutes } = await import('../../../src/systems/worldTick.js');
const { _resetPartyScaleForTests } = await import('../../../src/systems/party/partyScale.js');
const { killIfAnyLiveStatZero } = await import('../../../src/systems/statMods.js');
const { applySpell } = await import('../../../src/systems/effects.js');
const { buildCustomSpell, blankEffectSettings } = await import('../../../src/systems/spell/spellMaker.js');
const { createExteriorFoes } = await import('../../../src/scenes/exteriorFoes.js');
const { Collider } = await import('../../../src/player/collider.js');

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const player = (id, name) => ({
  isPlayer: true, name, characterId: id, level: 10, reflexes: 2, skills: new Array(40).fill(40), skillUses: new Array(40).fill(0), career: {}, items: [],
  activeEffects: [], stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 }, crimeCommitted: 4,
  health: 100, maxHealth: 100,
});
let T = 0;
setTacticsClock(() => T);
beforeEach(() => {
  _resetForTests(); setPref('lootRarity', true); setPref('enhancedAI', false);
  N._resetRevenantForTests(); RC._resetRetinueForTests(); S._resetCompanionSlotsForTests(); _store.clear(); _resetPartyScaleForTests();
  S.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
  setPlayerDoor(null); setWorldMinutes(1440 + 120); T = 0; resetTactics(); resetBlows();
  setRevenantPresenter(() => true);
});

/** A record as a special foe's flight makes it (revenant_fate.test.js's). */
function revenantOf(p, rank = 1) {
  for (const x of N.livingRevenants().slice(0, Math.max(0, N.livingRevenants().length - N.REVENANT_MAX + 1))) N.revenantSlain(p, { revenant: { id: x.id } });   // UNQUIET (Revenants.md section 46): none rises while three hunt me - room made
  const r = N.revenantDeed(p, { mobileType: 2, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Monster' }, 'fled', { mobileType: 2, rolls: () => 0 });
  r.rank = rank;
  return r;
}

// ── the crafted world (revenant_fate.test.js's): one monster career, a texture stub ─────────────────────────────────
const careers = (() => {
  const b = new Uint8Array(74); const v = new DataView(b.buffer);
  b[10] = 0x08; v.setUint16(52, 4, true);
  for (let i = 0; i < 8; i++) v.setUint16(58 + i * 2, 50, true);
  const NAME_FIELD = 14, ENTRY = 18, out = new Uint8Array(4 + b.length + ENTRY), dv = new DataView(out.buffer);
  dv.setInt16(0, 1, true); dv.setUint16(2, 0x0100, true); out.set(b, 4);
  const name = 'ENEMY002.CFG';
  for (let i = 0; i < name.length; i++) out[4 + b.length + i] = name.charCodeAt(i);
  dv.setInt32(4 + b.length + NAME_FIELD, b.length, true);
  return out;
})();
const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 20, getFrameCount: () => 5 };
/** One client's street pool (the streaming world's: `fates` on), on the cell's net - `hits` every word it sends. */
function client(me, self) {
  const hits = [];
  const pool = createExteriorFoes({
    renderer: {
      createBillboardBatch: (archive, record, size) => ({ archive, record, size, conceal: undefined, dissolve: undefined, origin: null }),
      destroyBillboardBatch: () => {}, destroyBatch: () => {}, textures: new Map(), uploadTexture: () => ({}), uploadEmissionTexture: () => ({}),
    },
    collider: new Collider(() => 0),   // a real, empty collider (rvn4_stand.test.js's): the foes walk and the brain thinks
    fetchBytes: async (n) => { if (n === 'MONSTER.BSA') return careers; throw new Error(`no ${n} here`); },
    getTexture: async () => stubTex, uploadRecordFrame: () => {},
    currentMinute: () => 1000, currentPixelKey: () => '3,12', inLocation: () => true,
    playerEntity: me, audio: null, onPlayerHurt: () => {}, rolls: () => 0.5, rand: () => 0.9, say: () => {},
    fates: true, dropLoot: () => {}, shake: () => {},
  });
  pool.setNet({ selfId: () => self, room: () => 'world:3,12', inRoom: () => true, peers: () => [], now: () => 0, staleMs: 1e9,
    onPeerHit: (h) => { hits.push(h); return true; }, toWire: (p) => [p[0], p[1], p[2]], toScene: (p) => [p[0], p[1], p[2]] });
  return { pool, hits, me };
}
const settle = () => new Promise((res) => setTimeout(res, 20));
const step = (pool) => { T += 0.016; pool.update(0.016, [0, 0, 3], [0, 1.6, 3]); };

/** THE DISINTEGRATE - the real spell (5,255, chance 100) through the real cast engine, cast by `caster` on `g` through the
 *  streaming world's own spell sink (world.js foeSinks' hurt: the player's provenance, `whole` as the engine says). */
function disintegrate(c, g) {
  const spell = buildCustomSpell({ slots: [{ type: 5, subType: 255, settings: { ...blankEffectSettings(), chanceBase: 100 } }], rangeType: 2 });
  const sinks = { hurt: (n, o) => { const fp = o?.fromPlayer ?? true; if (n > 0) c.pool.damageFoe(g, n, [0, 0, 3], null, { fromPlayer: fp, kind: 'spell', whole: !!o?.whole, round: !!o?.round, element: o?.element ?? null }); } };
  return applySpell(spell, c.me.level, g.entity, sinks, () => 0.5, { level: c.me.level, entity: c.me }, {});
}
/** Ann (the owner) stands her revenant; Bob (a party member) stands its puppet from her frame. */
async function twoClients(rank = 1) {
  const ann = client(player('char-ann', 'Ann'), 'ann-0001');
  const bob = client(player('char-bob', 'Bob'), 'bob-0002');
  const r = revenantOf(ann.me, rank);
  const rev = await ann.pool.spawnFoe(2, [0, 0, 0], { feetGiven: true, level: 6, revenant: r });
  step(ann.pool);
  bob.pool.applyFoes('ann-0001', ann.pool.foesFrame(true));
  await settle();
  const pup = bob.pool.foes.find((f) => f.puppet === 'ann-0001' && f.seq === rev.seq);
  assert.ok(rev.entity.revenant?.id === r.id && pup, 'Ann\'s revenant, and Bob\'s puppet of it');
  return { ann, bob, r, rev, pup };
}
/** Bob's Disintegrate on his puppet of Ann's revenant: the word his divert sends, then applied at Ann's door. */
function bobDisintegrates({ ann, bob, rev, pup }) {
  bob.hits.length = 0;
  const out = disintegrate(bob, pup);
  assert.equal(out.disintegrated, 1, 'the spell landed');
  const hit = bob.hits.find((h) => h.to === 'ann-0001' && h.i === rev.seq);
  assert.ok(hit, 'the blow went to its owner');
  assert.equal(hit.z, 1, 'as a kill (AUDIT PSCALE1 DOORS-1: the striker\'s divert mints `z`)');
  ann.hits.length = 0;
  assert.equal(ann.pool.applyHit('bob-0002', hit), true, 'the owner\'s door takes it');
  return hit;
}

test('RVN-OWNERS-CHOICE THE LAW: a whole blow closes one of my revenants outright only as its owner\'s - the player\'s own; a peer\'s, a foe\'s, a round\'s that names nobody, and any blow that is not whole, do not (mutants: a peer\'s whole kills; a foe\'s whole kills; any whole kills; a blow not whole kills)', () => {
  assert.equal(FT.ownersWholeKill(true, { fromPlayer: true, peer: false }), true, 'my Disintegrate, my Razor');
  assert.equal(FT.ownersWholeKill(true, { fromPlayer: true, peer: true }), false, 'a party member\'s, applied at my door');
  assert.equal(FT.ownersWholeKill(true, { fromPlayer: false, peer: false }), false, 'a foe\'s spell, a companion\'s, a stat drained to zero (nobody\'s tick)');
  assert.equal(FT.ownersWholeKill(true, {}), false, 'a blow that names nobody');
  assert.equal(FT.ownersWholeKill(false, { fromPlayer: true, peer: false }), false, 'my blow, not whole: a killing blow, which kneels it');
});

test('RVN-OWNERS-CHOICE THE REPORT, on the real street pools: a party member\'s Disintegrate on my revenant - the real spell, through his divert, its `z` applied at my door - KNEELS it: alive at 1, its record open, no `slain` back to him; my next frame kneels his puppet; the choice opens on my side alone, and I spare it (mutants: the yield passed over for a peer\'s whole blow; the gate back to any whole)', async () => {
  const two = await twoClients(1);
  const { ann, bob, r, rev, pup } = two;
  bobDisintegrates(two);
  assert.equal(pup.dead, false, 'his copy takes no blow of its own - it went to me');
  assert.equal(rev.dead, false, 'not deleted');
  assert.ok(rev.yielded, 'it kneels');
  assert.equal(rev.entity.health, 1);
  assert.equal(N.revenantById(r.id).defeated, false, 'its record open');
  assert.equal(N.revenantById(r.id).history.at(-1).deed, 'yielded');
  assert.equal(ann.hits.some((h) => h.slain === 1), false, 'no kill said back to the striker');
  // my frame carries the kneel, and his puppet kneels from it
  const rec = ann.pool.foesFrame(true).f.find((x) => x.i === rev.seq);
  assert.equal(rec.yd, 1);
  bob.pool.applyFoes('ann-0001', ann.pool.foesFrame(true));
  await settle();
  assert.equal(pup._pupYield, true, 'his copy kneels');
  assert.equal(bob.pool.fateFor(pup), null, 'the choice is not his');
  const m = ann.pool.fateFor(rev);
  assert.deepEqual(m.options.map((o) => o.id), ['kill', 'spare'], 'the choice is mine');
  assert.equal(ann.pool.chooseFate(rev, 'spare'), true);
  assert.equal(N.revenantById(r.id).sworn, true, 'and what I chose stands');
});

test('RVN-OWNERS-CHOICE RANK 3: a party member\'s Disintegrate brings its LAST STAND, as any killing blow does; the next, its will unbroken, it TEARS AWAY - never closed by his hand (mutants: the stand passed over for a peer\'s whole blow)', async () => {
  const two = await twoClients(3);
  const { ann, r, rev } = two;
  bobDisintegrates(two);
  assert.equal(rev.dead, false);
  assert.ok(rev.roaring, 'its last stand');
  assert.equal(rev.entity.health, Math.round(rev.entity.maxHealth * 0.3));
  assert.equal(N.revenantById(r.id).history.at(-1).deed, 'laststand');
  rev.roaring.until -= 5000;
  step(ann.pool);
  assert.equal(rev.roaring, null, 'the roar spent');
  two.bob.pool.applyFoes('ann-0001', ann.pool.foesFrame(true));
  await settle();
  bobDisintegrates(two);
  assert.equal(rev.dead, false);
  assert.ok(rev.leaving, 'unbroken, it tears away');
  assert.equal(N.revenantById(r.id).defeated, false, 'its record open');
});

