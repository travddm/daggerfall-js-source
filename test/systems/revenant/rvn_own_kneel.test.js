// RVN-OWN-KNEEL and RVN-OWNERS-CHOICE, over the real street pool. A killing blow on one of the player's own revenants never
// deletes it: the foe kneels at 1 health with its record open, and the choice (Kill, Spare) is the owner's. That holds for a
// Disintegrate (a whole blow) cast by the owner and for a whole blow that names nobody (a foe or a peer), so no one closes
// a revenant but its owner. The old tests also pinned the last stand and the will, which the core cut removed.
import '../../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => {
    _store.set(k, String(v));
  },
  removeItem: (k) => {
    _store.delete(k);
  },
  clear: () => _store.clear(),
  key: (i) => [..._store.keys()][i] ?? null,
  get length() {
    return _store.size;
  },
};
const N = await import('../../../src/systems/revenant/revenant.js');
const RC = await import('../../../src/systems/revenant/revenantCompanions.js');
const S = await import('../../../src/systems/companionSlots.js');
const { setPref, _resetForTests } = await import('../../../src/systems/uiPrefs.js');
const { setPlayerDoor } = await import('../../../src/systems/playerDoor.js');
const { setRevenantPresenter } = await import('../../../src/systems/revenant/revenantVoice.js');
const { setTacticsClock, resetTactics } = await import('../../../src/ai/tactics.js');
const { resetBlows } = await import('../../../src/ai/foeBlows.js');
const { setWorldMinutes } = await import('../../../src/systems/worldTick.js');
const { _resetPartyScaleForTests } = await import('../../../src/systems/party/partyScale.js');
const { applySpell } = await import('../../../src/systems/effects.js');
const { buildCustomSpell, blankEffectSettings } = await import('../../../src/systems/spell/spellMaker.js');
const { createExteriorFoes } = await import('../../../src/scenes/exteriorFoes.js');
const { Collider } = await import('../../../src/player/collider.js');

const player = () => ({
  isPlayer: true,
  name: 'Ann',
  characterId: 'char-ann',
  level: 10,
  reflexes: 2,
  skills: new Array(40).fill(40),
  skillUses: new Array(40).fill(0),
  career: {},
  items: [],
  activeEffects: [],
  stats: {
    strength: 50,
    intelligence: 50,
    willpower: 50,
    agility: 50,
    endurance: 50,
    personality: 50,
    speed: 50,
    luck: 50,
  },
  crimeCommitted: 4,
  health: 100,
  maxHealth: 100,
});
let T = 0;
setTacticsClock(() => T);
beforeEach(() => {
  _resetForTests();
  setPref('lootRarity', true);
  setPref('enhancedAI', false);
  N._resetRevenantForTests();
  RC._resetRetinueForTests();
  S._resetCompanionSlotsForTests();
  _store.clear();
  _resetPartyScaleForTests();
  S.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
  setPlayerDoor(null);
  setWorldMinutes(1440 + 120);
  T = 0;
  resetTactics();
  resetBlows();
  setRevenantPresenter(() => true);
});

/** A record as a special foe's flight makes it (revenant_fate.test.js's). */
function revenantOf(p, rank = 1) {
  for (const x of N.livingRevenants().slice(0, Math.max(0, N.livingRevenants().length - N.REVENANT_MAX + 1)))
    N.revenantSlain(p, { revenant: { id: x.id } }); // UNQUIET (Revenants.md section 46): none rises while three hunt me - room made
  const r = N.revenantDeed(
    p,
    { mobileType: 2, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Monster' },
    'fled',
    { mobileType: 2, rolls: () => 0 },
  );
  r.rank = rank;
  return r;
}

// ── the crafted world (fb1016b_rvnownerschoice.test.js's): one monster career, a texture stub ───────────────────────
const careers = (() => {
  const b = new Uint8Array(74);
  const v = new DataView(b.buffer);
  b[10] = 0x08;
  v.setUint16(52, 4, true);
  for (let i = 0; i < 8; i++) v.setUint16(58 + i * 2, 50, true);
  const NAME_FIELD = 14,
    ENTRY = 18,
    out = new Uint8Array(4 + b.length + ENTRY),
    dv = new DataView(out.buffer);
  dv.setInt16(0, 1, true);
  dv.setUint16(2, 0x0100, true);
  out.set(b, 4);
  const name = 'ENEMY002.CFG';
  for (let i = 0; i < name.length; i++) out[4 + b.length + i] = name.charCodeAt(i);
  dv.setInt32(4 + b.length + NAME_FIELD, b.length, true);
  return out;
})();
const stubTex = {
  getSize: () => ({ width: 64, height: 100 }),
  getScale: () => ({ width: 0, height: 0 }),
  recordCount: 20,
  getFrameCount: () => 5,
};
/** The owner's street pool - the streaming world's (`fates` on), or exterior.js's (`fates` off). */
function client(fates = true) {
  const drops = [];
  const me = player();
  const pool = createExteriorFoes({
    renderer: {
      createBillboardBatch: (archive, record, size) => ({
        archive,
        record,
        size,
        conceal: undefined,
        dissolve: undefined,
        origin: null,
      }),
      destroyBillboardBatch: () => {},
      destroyBatch: () => {},
      textures: new Map(),
      uploadTexture: () => ({}),
      uploadEmissionTexture: () => ({}),
    },
    collider: new Collider(() => 0),
    fetchBytes: async (n) => {
      if (n === 'MONSTER.BSA') return careers;
      throw new Error(`no ${n} here`);
    },
    getTexture: async () => stubTex,
    uploadRecordFrame: () => {},
    currentMinute: () => 1000,
    currentPixelKey: () => '3,12',
    inLocation: () => true,
    playerEntity: me,
    audio: null,
    onPlayerHurt: () => {},
    rolls: () => 0.5,
    rand: () => 0.9,
    say: () => {},
    fates,
    dropLoot: (items, feet) => drops.push({ items, feet }),
    shake: () => {},
  });
  return { pool, me, drops };
}
const step = (pool, dt = 0.016) => {
  T += dt;
  pool.update(dt, [0, 0, 3], [0, 1.6, 3]);
};
/** THE DISINTEGRATE - the real spell (5,255, chance 100) through the real cast engine, cast by the owner through the
 *  streaming world's own spell sink (world.js foeSinks' hurt: the player's provenance, `whole` as the engine says). */
function disintegrate(c, g) {
  const spell = buildCustomSpell({
    slots: [{ type: 5, subType: 255, settings: { ...blankEffectSettings(), chanceBase: 100 } }],
    rangeType: 2,
  });
  const sinks = {
    hurt: (n, o) => {
      const fp = o?.fromPlayer ?? true;
      if (n > 0)
        c.pool.damageFoe(g, n, [0, 0, 3], null, {
          fromPlayer: fp,
          kind: 'spell',
          whole: !!o?.whole,
          round: !!o?.round,
          element: o?.element ?? null,
        });
    },
  };
  const out = applySpell(spell, c.me.level, g.entity, sinks, () => 0.5, { level: c.me.level, entity: c.me }, {});
  assert.equal(out.disintegrated, 1, 'the spell landed');
}
async function stand(c, rank, at = [0, 0, 0]) {
  const r = revenantOf(c.me, rank);
  const f = await c.pool.spawnFoe(2, at, { feetGiven: true, level: 6, revenant: r });
  step(c.pool);
  assert.equal(f.entity.revenant?.id, r.id);
  return { r, f };
}

test('RVN-OWN-KNEEL: my own Disintegrate on my revenant kneels it - alive at 1, its record open, the choice offered; Spare swears it to me', async () => {
  const c = client();
  const { r, f } = await stand(c, 1);
  disintegrate(c, f);
  assert.equal(f.dead, false, 'not deleted');
  assert.ok(f.yielded, 'it kneels');
  assert.equal(f.entity.health, 1);
  const rec = N.revenantById(r.id);
  assert.equal(rec.defeated, false, 'its record open');
  assert.equal(rec.history.at(-1).deed, 'yielded');
  assert.deepEqual(
    c.pool.fateFor(f).options.map((o) => o.id),
    ['kill', 'spare'],
    'the choice is offered',
  );
  assert.equal(c.pool.chooseFate(f, 'spare'), true);
  assert.equal(N.revenantById(r.id).sworn, true, 'spared: sworn to me, a companion');
});

test('RVN-OWNERS-CHOICE: a whole blow that is not mine (a foe or a peer) on my revenant is a killing blow like any other - it kneels, its record stays open, and only I choose', async () => {
  const c = client();
  const { r, f } = await stand(c, 1);
  c.pool.damageFoe(f, 9999, [0, 0, 3], null, { fromPlayer: false, kind: 'spell', whole: true });
  assert.equal(f.dead, false, 'not deleted by a whole blow of another');
  assert.ok(f.yielded, 'it kneels');
  assert.equal(N.revenantById(r.id).defeated, false, 'its record open');
  assert.deepEqual(
    c.pool.fateFor(f).options.map((o) => o.id),
    ['kill', 'spare'],
    'the choice is still mine',
  );
});

test('RVN-OWN-KNEEL: Kill then executes it, the record closed as executed', async () => {
  const c = client();
  const { r, f } = await stand(c, 1);
  disintegrate(c, f);
  assert.equal(c.pool.chooseFate(f, 'kill'), true);
  assert.ok(f.executing, 'the execution begun');
  assert.equal(N.revenantById(r.id).defeated, false, 'not closed until the burn ends');
});
