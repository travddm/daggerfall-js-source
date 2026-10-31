// REALM P1.3-P1.5 (2026-09-28, Mac: "A true separation while allowing people to still play offline"; decisions 1-3;
// bible/06-Systems/Realm-Arc.md): THE DOOR, THE BOOT AND CUSTOMS.
//   P1.3 - the Online door lists the realm's characters; its Play boots ?online&load&realm=<id>, and the boot joins the
//          character and reads its save from the service - never a local slot. Every save of a realm character is the
//          service's checkpoint (the composers' sink), a lost lease takes the player to the door with the reason, and a
//          character born online is made at the service after chargen and booted from it.
//   P1.4 - "Copy to offline" writes the realm's save as a NEW offline character; nothing played on it comes back.
//   P1.5 - customs brings an offline character in once: loans settled, liquid wealth capped at the level's allowance
//          (OPEN), on a copy; the service carries its Renown, homes and guild to the realm's id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../server-account/src/index.js';
import { _resetKeyForTests } from '../../server-account/src/signing.js';
import { SESSION_KEY } from '../../src/net/accountClient.js';
import {
  realmIo, realmCreate, realmPut, realmCustoms, realmFetch, openRealmBoot, realmSummaryOf, realmRowAsSave, realmBootSearch,
  realmRefusalText, setRealmNotice, takeRealmNotice, REALM_NOTICE_KEY, REALM_ID_SHAPE, REALM_SAVED_TEXT, REALM_OFFLINE_TEXT,
} from '../../src/systems/realmSaves.js';
import { applyCustoms, liquidWealthOf, customsAllowance, customsLines, CUSTOMS_WEALTH_BASE, CUSTOMS_WEALTH_PER_LEVEL } from '../../src/systems/realmCustoms.js';
import { createBankAccounts } from '../../src/systems/banking.js';
import { BOOT_DOOR_KEYS } from '../../src/systems/online/onlineLane.js';
import { LETTER_OF_CREDIT_TEMPLATE, goldStack } from '../../src/systems/inventory.js';
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
    // D1's batch is one transaction (test/net/realm4.test.js's face): all of it, or none - AUDIT REALM's delete and customs ride one
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
const letter = (value) => ({ group: 'MiscItems', templateIndex: LETTER_OF_CREDIT_TEMPLATE, value });

test('REALM P1.5: customs settles every loan - the Empire keeps none for a newcomer - then caps what is left at the level\'s allowance: the fullest account first, the wagon, the letters, the purse', () => {
  assert.equal(customsAllowance(10), CUSTOMS_WEALTH_BASE + 10 * CUSTOMS_WEALTH_PER_LEVEL);
  assert.equal(customsAllowance(0), CUSTOMS_WEALTH_BASE + CUSTOMS_WEALTH_PER_LEVEL, 'level one at the least');
  const bank = createBankAccounts();
  Object.assign(bank[3], { loanTotal: 11_000, accountGold: 1_000, loanDueDate: 5_000 });
  Object.assign(bank[7], { accountGold: 40_000 });
  Object.assign(bank[9], { accountGold: 500_000 });
  const snap = { level: 1, classicMinutes: 100, goldPieces: 5_000, items: [letter(20_000), { group: 'Weapons', templateIndex: 120 }], wagonItems: [goldStack(3_000)], bankAccounts: bank };
  assert.equal(liquidWealthOf(snap), 5_000 + 20_000 + 3_000 + 541_000);
  const r = applyCustoms(snap);
  assert.deepEqual([r.called, r.paid, r.owed], [11_000, 11_000, 0], 'the loan paid: its own account, then the others');
  assert.deepEqual([bank[3].loanTotal, bank[3].accountGold], [0, 0]);
  assert.equal(r.wealth, 569_000 - 11_000, 'measured after the loans');
  assert.equal(r.allowance, 30_000);
  assert.equal(liquidWealthOf(snap), 30_000, 'what is left is the allowance');
  assert.deepEqual([bank[7].accountGold, bank[9].accountGold], [2_000, 0], 'the fullest account first - region 9\'s 500,000, then 28,000 of region 7\'s 30,000 (the loan took 10,000 of its 40,000) ...');
  assert.equal(r.taken, 528_000);
  assert.deepEqual([snap.wagonItems.length, snap.items.length, snap.goldPieces], [1, 2, 5_000], '... and the wagon, the letter and the purse untouched, the allowance reached in the bank');
  assert.ok(customsLines(r).some((l) => /528000 stays behind/.test(l)));
  // a thin one: the letters and the purse too, emptied letters gone from the pack
  const thin = { level: 1, goldPieces: 25_000, items: [letter(20_000)], wagonItems: [goldStack(10_000)], bankAccounts: createBankAccounts() };
  applyCustoms(thin);
  assert.deepEqual([thin.wagonItems.length, thin.items.map((it) => it.value), thin.goldPieces], [0, [5_000], 25_000], 'the wagon\'s gold, then the letter, spent before the purse');
  const bare = { level: 1, goldPieces: 30_000, items: [letter(10_000)], wagonItems: [], bankAccounts: createBankAccounts() };
  applyCustoms(bare);
  assert.deepEqual([bare.items.length, bare.goldPieces], [0, 30_000], 'a letter spent whole leaves the pack');
  const purse = { level: 1, goldPieces: 50_000, items: [], wagonItems: [], bankAccounts: createBankAccounts() };
  applyCustoms(purse);
  assert.equal(purse.goldPieces, 30_000, 'and the purse last');
  // a debt it cannot pay stays owed, due now
  const owing = { level: 1, classicMinutes: 777, goldPieces: 100, items: [], wagonItems: [], bankAccounts: createBankAccounts() };
  Object.assign(owing.bankAccounts[5], { loanTotal: 5_000, loanDueDate: 900_000 });
  const o = applyCustoms(owing);
  assert.deepEqual([o.paid, o.owed, owing.bankAccounts[5].loanTotal, owing.bankAccounts[5].loanDueDate, owing.goldPieces], [100, 4_900, 4_900, 777, 0]);
  assert.match(customsLines(o)[0], /4900 could not be paid and falls due/);
  assert.deepEqual(customsLines({ called: 0, owed: 0, taken: 0 }), ['Customs found nothing to settle.']);
});

test('REALM P1.3: the tile a checkpoint carries and the tile the door draws - the save\'s own fields, "Playing now", no local key', () => {
  assert.deepEqual(realmSummaryOf({ level: 9, career: { name: 'Nightblade' }, race: 'Dark Elf', gender: 'female', faceIndex: 4 }),
    { level: 9, className: 'Nightblade', race: 'Dark Elf', gender: 'female', face: 4 });
  assert.deepEqual(realmSummaryOf({}), { level: null, className: null, race: null, gender: 'male', face: null });
  const row = { id: 'r' + 'a'.repeat(20), name: 'Nystul', summary: { level: 3, className: 'Mage', race: 'Breton', gender: 'male', face: 2 }, playing: true, bytes: 9, customs: true, updatedAt: 1 };
  const save = realmRowAsSave(row, { dateText: () => 'a day' });
  assert.deepEqual([save.realmId, save.name, save.career, save.level, save.faceIndex, save.when, save.saveName, save.unfinished, 'key' in save], [row.id, 'Nystul', 'Mage', 3, 2, 'Playing now', 'Brought in', false, false]);
  assert.equal(realmRowAsSave({ ...row, playing: false, customs: false, bytes: 0 }, { dateText: () => 'a day' }).when, 'a day');
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

test('REALM P1.5 end to end: customs on a copy, the realm character made once from an offline one that played online, its first save the copy - and the boot reads it back with the realm\'s id and its Renown carried', async () => {
  const { env, g, io } = await device();
  const origin = 'c0ffee00-1111-2222-3333-444455556666';
  const bank = createBankAccounts();
  Object.assign(bank[2], { accountGold: 900_000 });
  const local = { v: 1, name: 'Nystul', level: 2, characterId: origin, goldPieces: 1_000, items: [], wagonItems: [], bankAccounts: bank };
  const copy = JSON.parse(JSON.stringify(local));
  applyCustoms(copy);
  assert.equal((await realmCustoms(io, origin, copy.name, realmSummaryOf(copy))).error, 'customs-never-online');
  env.DB._raw.prepare('INSERT INTO renown_tracks (player, char_id, name, xp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(g.id, origin, 'Nystul', 1_234, 1, 1);
  env.DB._raw.prepare('INSERT INTO realm_census (player, char_id) VALUES (?, ?)').run(g.id, origin);   // played online before the realm (migration 0020's census)
  const made = await realmCustoms(io, origin, copy.name, realmSummaryOf(copy));
  assert.equal(made.ok, true);
  copy.characterId = made.data.id;
  assert.equal((await realmPut(io, made.data.id, { lease: made.data.lease, seq: 1, summary: realmSummaryOf(copy) }, JSON.stringify(copy))).ok, true);
  const boot = await openRealmBoot({ io, id: made.data.id });
  assert.equal(liquidWealthOf(boot.snap), customsAllowance(2), 'the capped copy is the realm\'s');
  assert.equal(local.bankAccounts[2].accountGold, 900_000, 'the offline character is untouched');
  assert.equal(env.DB._raw.prepare('SELECT xp FROM renown_tracks WHERE char_id = ?').get(made.data.id).xp, 1_234, 'its Renown came in');
  assert.equal((await realmCustoms(io, origin, 'Again')).error, 'customs-already');
  // P1.4: and back out again as a NEW offline character - the realm's save, a new id (the door's copyToOffline)
  const got = await realmFetch(io, made.data.id);
  assert.equal(JSON.parse(got.text).characterId, made.data.id);
});

test('REALM P1.3: a notice crosses the reload once; the boot\'s address carries the online lane, the load door, the id, the classic start and the world host\'s door alone; every word has its sentence', () => {
  const s = fakeStorage();
  setRealmNotice(s, 'Why you are back');
  assert.equal(s.getItem(REALM_NOTICE_KEY), 'Why you are back');
  assert.equal(takeRealmNotice(s), 'Why you are back');
  assert.equal(takeRealmNotice(s), null, 'once');
  assert.equal(takeRealmNotice(null), null);
  const q = new URLSearchParams(realmBootSearch('?online=1&loadkey=4&test=x&classic=1&keep=1', 'r' + 'b'.repeat(20), BOOT_DOOR_KEYS));
  // REALM-BIRTH (FIELD BUGS 2026-09-30, PIN MOVED): the address is the Online door's Play - its classic start set again, and
  // `world`, the scene door main.js boots the world host on; without one a born character's reload was the front door's
  assert.deepEqual(Object.fromEntries(q), { keep: '1', online: '1', load: '1', realm: 'r' + 'b'.repeat(20), classic: '1', world: '1' }, 'no stale door key rides in');
  assert.ok(BOOT_DOOR_KEYS.includes('realm') && BOOT_DOOR_KEYS.includes('realmnew'));
  for (const w of ['signed-out', 'no-data', 'lease', 'no-realm-character', 'customs-never-online', 'customs-already', 'customs-load-once', 'test-room', 'no-room', 'left']) {
    assert.ok(realmRefusalText(w) && realmRefusalText(w) !== realmRefusalText('utterly-unknown'), w);
  }
  assert.equal(REALM_SAVED_TEXT, 'Saved to the realm.');
  assert.match(REALM_OFFLINE_TEXT, /plays offline/);
});

