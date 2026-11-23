// PROFESSION-CAPS. A character does at most PROF_DAY_CAP.gathering harvests a track and PROF_DAY_CAP.crafting crafts a
// track in a UTC day (src/net/profCapLaw.js), read by the real Worker over node:sqlite (test/accountDb.mjs); the service's
// PROF_DAY_CAPS "off" lifts them. A Masterwork's Rare passes the level gate: below it, the crafter's piece is a Superior.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROF_DAY_CAP, profCapsOn, gateMasterwork, masterworkGateOn, dfuPricesOn } from '../../src/net/profCapLaw.js';
import { MASTERWORK, RECIPES } from '../../src/net/recipeLaw.js';
import { veins, nodeKey } from '../../src/net/nodeLaw.js';
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { sharedClassicMinutes } from '../../src/net/wire.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { xpForRank } from '../../src/net/professionLaw.js';
import { gatedQuality } from '../../server-account/src/profDayCaps.js';
import { standService, T0 } from '../accountDb.mjs';

const DAY = 86_400;
const WOODS = CLIMATES.Woodlands,
  GLENUMBRA = 59;
const hourAt = (s) => Math.floor((((Math.floor(sharedClassicMinutes(s * 1000)) % 1440) + 1440) % 1440) / 60);
function secondAt(from, want) {
  for (let s = from; s < from + 2 * 7200; s += 30)
    if (hourAt(s) === want && hourAt(s - 60) === want && hourAt(s + 60) === want) return s;
  throw new Error('no such hour');
}
const NOON = secondAt(utcDay(T0) * DAY + 3600, 12);

test('PROFESSION-CAPS the law: the numbers, the switch, and the Masterwork gate (mutants: a number moved; the switch read backwards; the gate unread)', () => {
  assert.deepEqual({ ...PROF_DAY_CAP }, { gathering: 60, crafting: 40 });
  assert.deepEqual(
    [profCapsOn({}), profCapsOn({ PROF_DAY_CAPS: 'on' }), profCapsOn({ PROF_DAY_CAPS: 'off' })],
    [true, true, false],
  );
  assert.deepEqual([masterworkGateOn({}), masterworkGateOn({ PROF_MASTERWORK_GATE: 'off' })], [true, false]);
  assert.deepEqual([dfuPricesOn({}), dfuPricesOn({ PROF_DFU_PRICES: 'off' })], [true, false]);
  assert.equal(
    gateMasterwork(MASTERWORK, 30, () => 0.99),
    MASTERWORK,
    'level 30: the gate is open',
  );
  assert.equal(
    gateMasterwork(MASTERWORK, 1, () => 0.5),
    MASTERWORK - 1,
    "level 1: a Superior in the Rare's place",
  );
  assert.equal(
    gateMasterwork(MASTERWORK, 1, () => 0.01),
    MASTERWORK,
    'level 1 on a lucky roll: the Rare',
  );
  assert.equal(
    gateMasterwork(3, 1, () => 0.99),
    3,
    'a Superior is untouched',
  );
  assert.equal(
    gateMasterwork(MASTERWORK, null, () => {
      throw new Error('asked');
    }),
    MASTERWORK,
    'no level known: not asked',
  );
});

test("PROFESSION-CAPS the service: a character's sixty harvests on a track, then the day's cap - another track and the off switch unaffected", async () => {
  const realNow = Date.now;
  Date.now = () => NOON * 1000;
  try {
    const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', SEAT_ADMINS: 'Mac' });
    const raw = s.env.DB._raw;
    const mac = await s.seated('Mac');
    const day = utcDay(NOON);
    const seed = (profession, kind, n) => {
      const ins =
        raw.prepare(`INSERT INTO node_harvests (day, node, kind, player, char_id, profession, material, qty, xp, at, rid, n, tier)
        VALUES (?, ?, ?, ?, ?, ?, 'metal:iron', 1, 1, ?, ?, 'x', 1)`);
      for (let i = 0; i < n; i++)
        ins.run(
          day,
          `${profession}:seed:${i}`,
          kind,
          mac.id,
          mac.character,
          profession,
          NOON,
          `seed-${profession}-${String(i).padStart(4, '0')}`,
        );
    };
    const harvest = (x) => {
      const v = veins({ x, y: 200, day, climate: WOODS, region: GLENUMBRA }).find((q) => q.tier === 1);
      return v
        ? s.call(
            '/v1/prof/harvest',
            {
              character: mac.character,
              at: NOON - 2,
              rid: `profcaps-${String(x).padStart(6, '0')}`,
              node: nodeKey({ kind: 'vein', x, y: 200, day, slot: v.slot }),
              kind: 'ore',
              climate: WOODS,
              region: GLENUMBRA,
              act: { glints: 0, clean: false },
            },
            mac.secret,
          )
        : null;
    };
    seed('mining', 'ore', PROF_DAY_CAP.gathering - 1);
    let last = null,
      x = 300;
    const results = [];
    while (results.length < 2 && x < 900) {
      const r = await harvest(x++);
      if (r) results.push(r);
    }
    last = results[1];
    assert.equal(results[0].status, 200, JSON.stringify(results[0].body));
    assert.deepEqual([last.status, last.body], [409, { error: 'prof-day-cap' }], 'the sixty-first');
    seed('fishing', 'fish', 1);
    assert.equal(
      raw.prepare('SELECT COUNT(*) AS n FROM node_harvests WHERE profession = ?').get('fishing').n,
      1,
      'another track counts apart',
    );
  } finally {
    Date.now = realNow;
  }
});

test("PROFESSION-CAPS the service: a character's forty crafts of a track in a day, then the cap - the off switch lifts it", async () => {
  const realNow = Date.now;
  Date.now = () => NOON * 1000;
  try {
    for (const caps of ['on', 'off']) {
      const s = await standService({
        PROFESSIONS_OPEN: 'on',
        MARKS_OPEN: 'on',
        SEAT_ADMINS: 'Mac',
        PROF_DAY_CAPS: caps,
      });
      const raw = s.env.DB._raw;
      const mac = await s.seated('Mac');
      raw.prepare('UPDATE realm_characters SET level_seen = 30 WHERE player = ?').run(mac.id);
      raw
        .prepare(
          "INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at) VALUES (?, ?, 'smithing', ?, 1)",
        )
        .run(mac.id, mac.character, xpForRank(100));
      const smith = RECIPES.find((r) => r.id === 'dagger:iron');
      for (const { key, n } of smith.inputs)
        raw
          .prepare("INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, 'own', ?)")
          .run(mac.id, mac.character, key, n * 100);
      const ins =
        raw.prepare(`INSERT INTO prof_crafts (player, rid, char_id, recipe, quality, count, provenance, seed, xp, first, at, n)
        VALUES (?, ?, ?, ?, 1, 1, ?, 1, 0, 0, ?, 'x')`);
      for (let i = 0; i < PROF_DAY_CAP.crafting; i++)
        ins.run(mac.id, `seed-${i}`, mac.character, smith.id, String(i).padStart(16, 'a'), NOON - 10);
      const res = await s.call(
        '/v1/prof/craft',
        {
          character: mac.character,
          recipe: smith.id,
          clean: false,
          name: 'Mac',
          rid: `profcaps-${caps === 'on' ? '000900' : '000901'}`,
        },
        mac.secret,
      );
      if (caps === 'on') assert.deepEqual([res.status, res.body], [409, { error: 'prof-day-cap' }], 'the forty-first');
      else assert.equal(res.status, 200, JSON.stringify(res.body));
    }
  } finally {
    Date.now = realNow;
  }
});

test('PROFESSION-CAPS the service: a smelt, a brew, a disenchant and a reforge count against the same day - forty acts of a track, then the cap; another track is untouched', async () => {
  const realNow = Date.now;
  Date.now = () => NOON * 1000;
  try {
    const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', SEAT_ADMINS: 'Mac', PROF_DAY_CAPS: 'on' });
    const raw = s.env.DB._raw;
    const mac = await s.seated('Mac');
    const insert = (table, cols, vals) =>
      raw
        .prepare(
          `INSERT INTO ${table} (player, char_id, at, n, ${cols.join(', ')}) VALUES (?, ?, ?, 'x', ${cols.map(() => '?').join(', ')})`,
        )
        .run(mac.id, mac.character, NOON - 10, ...vals);
    const call = (path, body, rid) => s.call(path, { character: mac.character, rid, ...body }, mac.secret);
    const capped = (res) => [res.status, res.body.error];
    // Smithing: twenty smelts and twenty crafts are forty acts
    const smith = RECIPES.find((r) => r.id === 'dagger:iron');
    for (let i = 0; i < 20; i++) {
      insert('prof_smelts', ['rid', 'recipe', 'count', 'own', 'bought', 'xp'], [`sm-${i}`, 'ingot:iron', 1, 1, 0, 0]);
      insert(
        'prof_crafts',
        ['rid', 'recipe', 'quality', 'count', 'provenance', 'seed', 'xp', 'first'],
        [`cr-${i}`, smith.id, 1, 1, String(i).padStart(16, 'a'), 1, 0, 0],
      );
    }
    assert.deepEqual(
      capped(await call('/v1/prof/smelt', { recipe: 'ingot:iron', count: 1 }, 'profcaps-sm01')),
      [409, 'prof-day-cap'],
      'the forty-first act on Smithing is a smelt',
    );
    // Alchemy: forty brews
    for (let i = 0; i < 40; i++)
      insert(
        'prof_brews',
        ['rid', 'potion', 'keys', 'count', 'potent', 'xp', 'first'],
        [`br-${i}`, 'p', '[]', 1, 0, 0, 0],
      );
    assert.deepEqual(
      capped(await call('/v1/prof/brew', { potion: 'x', keys: [] }, 'profcaps-br01')),
      [409, 'prof-day-cap'],
      'the forty-first brew',
    );
    // Enchanting: twenty disenchants and twenty reforges are forty acts
    for (let i = 0; i < 20; i++) {
      insert(
        'prof_disenchants',
        ['rid', 'provenance', 'recipe', 'points', 'essence', 'origin', 'xp'],
        [`de-${i}`, String(i).padStart(16, 'b'), 'r', 0, 1, 'own', 0],
      );
      insert('prof_reforges', ['rid', 'tier', 'essence', 'seed'], [`rf-${i}`, 'magic', 1, 1]);
    }
    assert.deepEqual(
      capped(await call('/v1/prof/disenchant', { provenance: 'c'.repeat(16) }, 'profcaps-de01')),
      [409, 'prof-day-cap'],
      'the forty-first disenchant',
    );
    assert.deepEqual(
      capped(await call('/v1/prof/reforge', { tier: 'magic' }, 'profcaps-rf01')),
      [409, 'prof-day-cap'],
      'the forty-first reforge',
    );
    // another track's smelt (Provisioning's charcoal) is not refused by Smithing's day
    const other = await call('/v1/prof/smelt', { recipe: 'wood:charcoal', count: 1 }, 'profcaps-sm02');
    assert.notEqual(other.body.error, 'prof-day-cap', JSON.stringify(other.body));
  } finally {
    Date.now = realNow;
  }
});

test('PROFESSION-CAPS the service: PROF_MASTERWORK_GATE off lifts the gate and PROF_DFU_PRICES off reaches the state read', async () => {
  const realNow = Date.now;
  Date.now = () => NOON * 1000;
  try {
    for (const off of [false, true]) {
      const s = await standService({
        PROFESSIONS_OPEN: 'on',
        MARKS_OPEN: 'on',
        SEAT_ADMINS: 'Mac',
        ...(off ? { PROF_MASTERWORK_GATE: 'off', PROF_DFU_PRICES: 'off' } : {}),
      });
      const mac = await s.seated('Mac');
      const st = await s.call('/v1/prof/state', { character: mac.character }, mac.secret);
      assert.equal(st.body.caps.prices, off ? 'port' : 'dfu');
      const raw = s.env.DB._raw;
      raw.prepare('UPDATE realm_characters SET level_seen = 1 WHERE player = ?').run(mac.id);
      const smith = RECIPES.find((r) => r.id === 'dagger:iron');
      const env = off ? { PROF_MASTERWORK_GATE: 'off' } : {};
      assert.equal(
        await gatedQuality(s.env.DB, env, mac.id, mac.character, smith, MASTERWORK, () => 0.99),
        off ? MASTERWORK : MASTERWORK - 1,
        'level 1, an unlucky roll',
      );
    }
  } finally {
    Date.now = realNow;
  }
});
