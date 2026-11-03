// REALM P1.3: THE DOOR AND THE BOOT.
//   The Online door lists the realm's characters; its Play boots ?online&load&realm=<id>, and the boot joins the
//   character and reads its save from the service - never a local slot. Every save of a realm character is the
//   service's checkpoint (the composers' sink), a lost lease takes the player to the door with the reason, and a
//   character born online is made at the service after chargen and booted from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../server-account/src/index.js';
import { _resetKeyForTests } from '../../server-account/src/signing.js';
import { SESSION_KEY } from '../../src/net/accountClient.js';
import {
  realmIo, realmCreate, realmPut, openRealmBoot, realmSummaryOf, realmRowAsSave, realmBootSearch,
  realmRefusalText, setRealmNotice, takeRealmNotice, REALM_NOTICE_KEY, REALM_ID_SHAPE, REALM_SAVED_TEXT, REALM_OFFLINE_TEXT,
} from '../../src/systems/realmSaves.js';
import { BOOT_DOOR_KEYS } from '../../src/systems/online/onlineLane.js';
import { ACCEPTED } from '../../src/net/legalLaw.js';   // TERMS1: a request that makes an account carries the versions ticked
import { hostText } from '../hostText.mjs';   // TESA's merge (HOST-SPLIT): the quest world and the quick save moved out of bootWorld - the host read whole

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const MIGRATIONS = readdirSync(new URL('../../server-account/migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of MIGRATIONS) db.exec(src(`server-account/migrations/${f}`));
  return {
    _raw: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      const writes = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
        _result() { const results = stmt.all(...args); return { results, meta: { changes: writes ? Number(db.prepare('SELECT changes() AS c').get().c) : 0 } }; },
      };
      return api;
    },
    // D1's batch is one transaction (test/net/realm4.test.js's face): all of it, or none - AUDIT REALM's delete rides one
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((st) => st._result()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
function r2() {
  const m = new Map();
  return {
    async put(key, body) { m.set(key, new Uint8Array(body instanceof ArrayBuffer ? body : new TextEncoder().encode(String(body)))); return { key }; },
    async get(key) { const v = m.get(key); return v === undefined ? null : { key, size: v.byteLength, body: v }; },
    async delete(key) { m.delete(key); },
  };
}
function fakeStorage() {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
async function device() {
  _resetKeyForTests();
  const env = { DB: d1(), SAVES: r2(), ACCOUNT_VERSION: 'test1' };
  const g = await (await worker.fetch(new Request('https://accounts.invalid/v1/auth/guest', { method: 'POST', body: JSON.stringify(ACCEPTED) }), env)).json();
  const storage = fakeStorage();
  storage.setItem(SESSION_KEY, JSON.stringify({ id: g.id, secret: g.secret }));
  return { env, g, io: realmIo({ fetch: (u, i) => worker.fetch(new Request(u, i), env), storage }) };
}

test('REALM P1.3: the tile a checkpoint carries and the tile the door draws - the save\'s own fields, "Playing now", no local key', () => {
  assert.deepEqual(realmSummaryOf({ level: 9, career: { name: 'Nightblade' }, race: 'Dark Elf', gender: 'female', faceIndex: 4 }),
    { level: 9, className: 'Nightblade', race: 'Dark Elf', gender: 'female', face: 4 });
  assert.deepEqual(realmSummaryOf({}), { level: null, className: null, race: null, gender: 'male', face: null });
  const row = { id: 'r' + 'a'.repeat(20), name: 'Nystul', summary: { level: 3, className: 'Mage', race: 'Breton', gender: 'male', face: 2 }, playing: true, bytes: 9, updatedAt: 1 };
  const save = realmRowAsSave(row, { dateText: () => 'a day' });
  assert.deepEqual([save.realmId, save.name, save.career, save.level, save.faceIndex, save.when, save.saveName, save.unfinished, 'key' in save], [row.id, 'Nystul', 'Mage', 3, 2, 'Playing now', 'Online', false, false]);
  assert.equal(realmRowAsSave({ ...row, playing: false, bytes: 0 }, { dateText: () => 'a day' }).when, 'a day');
  assert.equal(realmRowAsSave({ ...row, bytes: 0 }).unfinished, true, 'a character never saved');
});

test('REALM P1.3: the boot\'s join reads the save from the service - the realm\'s id on it, the lease and the sequence beside it; a character never saved, one not the account\'s and one of no realm shape are refused', async () => {
  const { io } = await device();
  const never = (await realmCreate(io, 'Unsaved')).data;
  assert.deepEqual(await openRealmBoot({ io, id: never.id }), { ok: false, error: 'no-data' }, 'never saved');
  const made = (await realmCreate(io, 'Nystul')).data;
  await realmPut(io, made.id, { lease: made.lease, seq: 1 }, JSON.stringify({ v: 1, name: 'Nystul', level: 1, characterId: 'c0ffee00-offline' }));   // AUDIT REALM2 S1: a new character's first save
  const boot = await openRealmBoot({ io, id: made.id });
  assert.equal(boot.ok, true);
  assert.deepEqual([boot.snap.name, boot.snap.characterId, boot.seq], ['Nystul', made.id, 1], 'the realm\'s id on the save, whatever it named');
  assert.match(boot.lease, /^[0-9a-f]{32}$/);
  assert.notEqual(boot.lease, made.lease, 'a new lease - the boot took the character');
  assert.deepEqual(await openRealmBoot({ io, id: 'r' + '0'.repeat(20) }), { ok: false, error: 'no-realm-character' });
  assert.deepEqual(await openRealmBoot({ io, id: 'c0ffee00' }), { ok: false, error: 'no-realm-character' }, 'never asked');
  assert.deepEqual(await openRealmBoot({ io: null, id: made.id }), { ok: false, error: 'signed-out' });
  assert.match(made.id, REALM_ID_SHAPE);
});

test('REALM P1.3: a notice crosses the reload once; the boot\'s address carries the online lane, the load door, the id, the classic start and the world host\'s door alone; every word has its sentence', () => {
  const s = fakeStorage();
  setRealmNotice(s, 'Why you are back');
  assert.equal(s.getItem(REALM_NOTICE_KEY), 'Why you are back');
  assert.equal(takeRealmNotice(s), 'Why you are back');
  assert.equal(takeRealmNotice(s), null, 'once');
  assert.equal(takeRealmNotice(null), null);
  const q = new URLSearchParams(realmBootSearch('?online=1&loadkey=4&test=x&classic=1&keep=1', 'r' + 'b'.repeat(20), BOOT_DOOR_KEYS));
  // REALM-BIRTH (FIELD BUGS 2026-09-30
  // `world`, the scene door main.js boots the world host on; without one a born character's reload was the front door's
  assert.deepEqual(Object.fromEntries(q), { keep: '1', online: '1', load: '1', realm: 'r' + 'b'.repeat(20), classic: '1', world: '1' }, 'no stale door key rides in');
  assert.ok(BOOT_DOOR_KEYS.includes('realm') && BOOT_DOOR_KEYS.includes('realmnew'));
  for (const w of ['signed-out', 'no-data', 'lease', 'no-realm-character', 'test-room', 'no-room', 'left']) {
    assert.ok(realmRefusalText(w) && realmRefusalText(w) !== realmRefusalText('utterly-unknown'), w);
  }
  assert.equal(REALM_SAVED_TEXT, 'Saved to the realm.');
  assert.match(REALM_OFFLINE_TEXT, /plays offline/);
});

