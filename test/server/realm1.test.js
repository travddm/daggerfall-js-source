// REALM P1: THE REALM'S CHARACTERS, SERVICE SIDE (server-account/src/realm.js,
// `realm_characters`). These pins drive the REAL Worker over the REAL migrations (node:sqlite behind a D1-shaped face and
// R2's three calls, as test/server/cloudsaves.test.js does): a realm character is minted by the service, joined under a lease
// that takes it from any other tab, checkpointed only under that lease at the next sequence, left, deleted and copied
// back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../server-account/src/index.js';
import { ROUTES, realmPathOf, ACCOUNT_VERSION } from '../../server-account/src/service.js';
import {
  REALM_CHARACTERS_MAX, REALM_ID_RE, LEASE_RE, REALM_MAX_BYTES, REALM_PLAYING_S, realmObjectKey, realmPrefix, realmSummaryOf, realmNameOf,
} from '../../server-account/src/realm.js';
import { _resetKeyForTests } from '../../server-account/src/signing.js';
import { freshSave } from '../realmSeat.mjs';   // AUDIT REALM2 S1: a first save is a new character's
import { ONLINE_CHECKPOINT_MS } from '../../src/systems/online/onlineCheckpoint.js';   // AUDIT PLAN-1000 G9: the cadence the windows are sized to
import { DUPE_GRACE_S } from '../../server-account/src/ledger.js';
import { ACCEPTED } from '../../src/net/legalLaw.js';   // TERMS1: a request that makes an account carries the versions ticked

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const { subtle } = globalThis.crypto;
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
    _map: m,
    async put(key, body) { m.set(key, new Uint8Array(body instanceof ArrayBuffer ? body : new TextEncoder().encode(String(body)))); return { key }; },
    async get(key) { const v = m.get(key); return v === undefined ? null : { key, size: v.byteLength, body: v }; },
    async delete(key) { m.delete(key); },
    async list({ prefix = '' } = {}) { return { objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },   // R2's prefix listing
  };
}

async function stand() {
  _resetKeyForTests();
  const env = { DB: d1(), SAVES: r2(), ACCOUNT_VERSION: 'test1', ALLOWED_ORIGIN: 'https://daggerfalljs.dev' };
  const call = async (method, path, body, bearer = null) => {
    const res = await worker.fetch(new Request(`https://accounts.invalid${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  /** A checkpoint: the save raw, the lease, the sequence and the tile in headers. */
  const put = async (id, bytes, bearer, { lease, seq, summary = null }) => {
    const headers = { authorization: `Bearer ${bearer}`, 'x-realm-lease': lease ?? '', 'x-realm-seq': String(seq) };
    if (summary) headers['x-realm-summary'] = JSON.stringify(summary);
    const res = await worker.fetch(new Request(`https://accounts.invalid/v1/realm/${id}/data`, { method: 'PUT', headers, body: bytes }), env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const get = async (id, bearer) => {
    const res = await worker.fetch(new Request(`https://accounts.invalid/v1/realm/${id}/data`, { method: 'GET', headers: { authorization: `Bearer ${bearer}` } }), env);
    const ct = res.headers.get('content-type') ?? '';
    return {
      status: res.status, seq: res.headers.get('x-realm-seq'), expose: res.headers.get('access-control-expose-headers'),
      json: ct.includes('json') ? await res.json().catch(() => null) : null,
      bytes: ct.includes('json') ? null : new Uint8Array(await res.arrayBuffer()),
    };
  };
  const guest = async () => (await call('POST', '/v1/auth/guest', { ...ACCEPTED })).body;
  return { env, call, put, get, guest };
}
const save = (text) => new TextEncoder().encode(text);
/** AUDIT REALM2 S1: a first save the realm takes - a new character's, as chargen makes one - as text. */
const FIRST = JSON.stringify(freshSave({ name: 'Nystul' }));

test('REALM P1: the routes are the service\'s, behind a session and never open - a guest holds realm characters too; acct17 and the toml in step', async () => {
  for (const r of ['/v1/realm', '/v1/realm/create', '/v1/realm/join', '/v1/realm/leave', '/v1/realm/delete']) assert.ok(ROUTES.has(r), r);
  assert.deepEqual(realmPathOf('/v1/realm/r0123456789abcdef0123/data'), { id: 'r0123456789abcdef0123' });
  assert.equal(realmPathOf('/v1/realm/c0ffee00-1111/data'), null, 'a client\'s id is no realm id');
  assert.equal(realmPathOf('/v1/realm/r0123456789abcdef0123/shot'), null);
  assert.equal(ACCOUNT_VERSION, 'acct207');
  assert.match(src('server-account/wrangler.toml'), /ACCOUNT_VERSION = "acct207"/);
  const { call, guest } = await stand();
  assert.equal((await call('GET', '/v1/realm')).status, 401, 'no secret, no characters');
  const g = await guest();
  const listed = await call('GET', '/v1/realm', undefined, g.secret);
  assert.deepEqual([listed.status, listed.body], [200, { characters: [], max: REALM_CHARACTERS_MAX }]);
  assert.equal((await call('GET', '/v1/realm/create', undefined, g.secret)).status, 405);
});

test('REALM P1: a new character is the service\'s - its id and lease minted there, at sequence 0 with no save; six an account, the seventh refused and nothing deleted', async () => {
  const { call, guest } = await stand();
  const g = await guest();
  const made = await call('POST', '/v1/realm/create', { name: '  Nystul  ', summary: { level: 1, className: 'Spellsword', race: 'Breton', gender: 'male', face: 3, secret: 'x' } }, g.secret);
  assert.equal(made.status, 200);
  assert.match(made.body.id, REALM_ID_RE);
  assert.match(made.body.lease, LEASE_RE);
  assert.equal(made.body.seq, 0);
  const [row] = (await call('GET', '/v1/realm', undefined, g.secret)).body.characters;
  assert.equal(row.id, made.body.id);
  assert.equal(row.name, 'Nystul', 'trimmed');
  assert.deepEqual(row.summary, { level: 1, className: 'Spellsword', race: 'Breton', gender: 'male', face: 3, region: null }, 'the tile\'s fields and nothing else');
  assert.deepEqual([row.seq, row.bytes, row.playing], [0, 0, true]);
  assert.equal('lease' in row, false, 'the lease is never listed');
  assert.equal((await call('POST', '/v1/realm/create', { name: '' }, g.secret)).status, 400);
  assert.equal((await call('POST', '/v1/realm/create', { name: 'Bad\u0007' }, g.secret)).status, 400);
  for (let i = 1; i < REALM_CHARACTERS_MAX; i++) assert.equal((await call('POST', '/v1/realm/create', { name: `Alt ${i}` }, g.secret)).status, 200);
  const over = await call('POST', '/v1/realm/create', { name: 'One Too Many' }, g.secret);
  assert.deepEqual([over.status, over.body], [409, { error: 'too-many-characters' }]);
  assert.equal((await call('GET', '/v1/realm', undefined, g.secret)).body.characters.length, REALM_CHARACTERS_MAX);
});

test('REALM P1: a checkpoint lands only under the current lease at the next sequence; each is a new object and the one before survives (REALM P2.1); the tile rides along', async () => {
  const { env, call, put, get, guest } = await stand();
  const g = await guest();
  const { id, lease } = (await call('POST', '/v1/realm/create', { name: 'Nystul' }, g.secret)).body;
  assert.deepEqual((await get(id, g.secret)).json, { error: 'no-data' }, 'no save before the first checkpoint');
  // INT2 (
  // the save's own, as the honest client's always is (the judge holds a summary claiming another - judge.js 'level-claim')
  const one = await put(id, save(FIRST), g.secret, { lease, seq: 1, summary: { level: 1, className: 'Spellsword' } });
  assert.deepEqual([one.status, one.body], [200, { ok: true, seq: 1, tradeHeld: null, locked: [] }]);
  const read = await get(id, g.secret);
  assert.deepEqual([read.status, read.seq, new TextDecoder().decode(read.bytes)], [200, '1', FIRST]);
  assert.equal(read.expose, 'x-realm-seq', 'the browser may read the sequence');
  assert.deepEqual((await put(id, save('again'), g.secret, { lease, seq: 1 })).body, { error: 'seq', seq: 1 }, 'a replay - told the service\'s own');
  assert.deepEqual((await put(id, save('ahead'), g.secret, { lease, seq: 3 })).body, { error: 'seq', seq: 1 }, 'a skip');
  assert.equal((await put(id, save('ahead'), g.secret, { lease, seq: 3 })).status, 409);
  const realPut = env.SAVES.put.bind(env.SAVES);
  let puts = 0;
  env.SAVES.put = (k, b) => { puts++; return realPut(k, b); };
  assert.deepEqual((await put(id, save('forged'), g.secret, { lease: 'f'.repeat(32), seq: 2 })).body, { error: 'lease' });
  assert.equal(puts, 0, 'the stale lease is refused before a byte lands - not written and dropped');
  env.SAVES.put = realPut;
  assert.equal((await put(id, save('shapeless'), g.secret, { lease: 'nope', seq: 2 })).status, 400);
  assert.equal((await put(id, new Uint8Array(0), g.secret, { lease, seq: 2 })).status, 400, 'an empty save');
  assert.equal((await put(id, new Uint8Array(REALM_MAX_BYTES + 1), g.secret, { lease, seq: 2 })).status, 413);
  const first = [...env.SAVES._map.keys()];
  assert.equal(first.length, 1, 'a refused checkpoint writes nothing - the stale lease is refused before a byte lands');
  assert.match(first[0], new RegExp(`^realm/${encodeURIComponent(g.id)}/${id}/1-[0-9a-f]{8}$`), 'the player first, then the character, then the sequence and a tag of its own');
  assert.equal(realmObjectKey(g.id, id, 1, 'abcd0123'), `${realmPrefix(g.id)}${id}/1-abcd0123`);
  // INT2 (
  // last clean one past the two the row rotates, so the rotation is pinned over clean saves (int2_judge.test.js pins the keep)
  const TWO = JSON.stringify(freshSave({ name: 'save two' })), THREE = JSON.stringify(freshSave({ name: 'save three' }));
  assert.equal((await put(id, save(TWO), g.secret, { lease, seq: 2 })).status, 200);
  const keys = [...env.SAVES._map.keys()].sort();
  assert.equal(keys.length, 2, 'the save and the one before it');
  assert.ok(keys.every((k) => k.startsWith(realmPrefix(g.id))), 'under the account\'s prefix');
  assert.equal(new TextDecoder().decode(env.SAVES._map.get(first[0])), FIRST, 'the one before survives');
  assert.equal((await put(id, save(THREE), g.secret, { lease, seq: 3 })).status, 200);
  assert.equal(env.SAVES._map.size, 2, 'two back goes');
  assert.ok(!env.SAVES._map.has(first[0]), 'the first save is gone');
  assert.deepEqual([...env.SAVES._map.values()].map((v) => new TextDecoder().decode(v)).sort(), [THREE, TWO].sort());
  const [row] = (await call('GET', '/v1/realm', undefined, g.secret)).body.characters;
  assert.deepEqual([row.seq, row.bytes, row.summary.level, row.summary.className], [3, THREE.length, 1, 'Spellsword'], 'a checkpoint without a tile keeps the last one');
});

test('REALM P1: a join takes the character from any other tab, and one account plays one character - the tab that lost the lease can never write again', async () => {
  const { call, put, guest } = await stand();
  const g = await guest();
  const a = (await call('POST', '/v1/realm/create', { name: 'Nystul' }, g.secret)).body;
  assert.equal((await put(a.id, save(FIRST), g.secret, { lease: a.lease, seq: 1 })).status, 200);
  const second = await call('POST', '/v1/realm/join', { id: a.id }, g.secret);
  assert.deepEqual([second.status, second.body.seq, second.body.bytes], [200, 1, FIRST.length]);
  assert.notEqual(second.body.lease, a.lease, 'a new lease');
  const out = await put(a.id, save('old tab'), g.secret, { lease: a.lease, seq: 2 });
  assert.deepEqual([out.status, out.body], [409, { error: 'lease' }], 'the old tab is out');
  assert.equal((await put(a.id, save('new tab'), g.secret, { lease: second.body.lease, seq: 2 })).status, 200);
  // a second character of the same account frees the first
  const b = (await call('POST', '/v1/realm/create', { name: 'Alt' }, g.secret)).body;
  assert.deepEqual((await put(a.id, save('a3'), g.secret, { lease: second.body.lease, seq: 3 })).body, { error: 'lease' }, 'one character in play an account');
  const rows = (await call('GET', '/v1/realm', undefined, g.secret)).body.characters;
  assert.deepEqual(rows.map((r) => [r.name, r.playing]).sort(), [['Alt', true], ['Nystul', false]]);
  // and a join frees the account's other character as a creation does
  const back = await call('POST', '/v1/realm/join', { id: a.id }, g.secret);
  assert.equal((await put(b.id, save('b1'), g.secret, { lease: b.lease, seq: 1 })).status, 409, 'the alt is out');
  assert.equal((await put(a.id, save('a3'), g.secret, { lease: back.body.lease, seq: 3 })).status, 200);
  assert.equal((await call('POST', '/v1/realm/join', { id: 'r' + '0'.repeat(20) }, g.secret)).status, 404);
  assert.equal((await call('POST', '/v1/realm/join', { id: 'c0ffee00' }, g.secret)).status, 400);
  assert.ok(b.id);
});

test('REALM P1: a leave gives the lease up - only the tab that holds it; another account can neither read, join, write nor delete my character', async () => {
  const { call, put, get, guest } = await stand();
  const g = await guest();
  const other = await guest();
  const a = (await call('POST', '/v1/realm/create', { name: 'Nystul' }, g.secret)).body;
  assert.equal((await put(a.id, save(FIRST), g.secret, { lease: a.lease, seq: 1 })).status, 200);
  assert.deepEqual((await call('POST', '/v1/realm/leave', { id: a.id, lease: 'e'.repeat(32) }, g.secret)).body, { ok: true, released: false });
  assert.deepEqual((await call('POST', '/v1/realm/leave', { id: a.id, lease: a.lease }, g.secret)).body, { ok: true, released: true });
  assert.deepEqual((await put(a.id, save('after'), g.secret, { lease: a.lease, seq: 2 })).body, { error: 'lease' }, 'a left character takes no checkpoint');
  assert.equal((await get(a.id, other.secret)).status, 404);
  assert.equal((await call('POST', '/v1/realm/join', { id: a.id }, other.secret)).status, 404);
  assert.equal((await put(a.id, save('theirs'), other.secret, { lease: a.lease, seq: 2 })).status, 404);
  assert.equal((await call('POST', '/v1/realm/delete', { id: a.id }, other.secret)).status, 404);
  assert.equal(new TextDecoder().decode((await get(a.id, g.secret)).bytes), FIRST, 'untouched');
});

test('REALM P1: the player\'s own delete takes its objects and the row', async () => {
  const { env, call, put, guest } = await stand();
  const g = await guest();
  const a = (await call('POST', '/v1/realm/create', { name: 'Nystul' }, g.secret)).body;
  await put(a.id, save(FIRST), g.secret, { lease: a.lease, seq: 1 });
  await put(a.id, save('2'), g.secret, { lease: a.lease, seq: 2 });
  assert.equal(env.SAVES._map.size, 2);
  env.SAVES._map.set(`${realmPrefix(g.id)}${a.id}/9-deadbeef`, new Uint8Array(1));   // REALM P2.1: a lost write's object whose drop failed
  assert.deepEqual((await call('POST', '/v1/realm/delete', { id: a.id }, g.secret)).body, { ok: true });
  assert.equal(env.SAVES._map.size, 0, 'the two the row names, and the walk of its prefix');
  assert.deepEqual((await call('GET', '/v1/realm', undefined, g.secret)).body.characters, []);
});

test('REALM P1: the shapes - a summary projected and bounded, a name trimmed and printable, the CORS door open to the realm headers', async () => {
  assert.equal(realmSummaryOf(null), null);
  assert.equal(realmSummaryOf([1]), null);
  assert.deepEqual(JSON.parse(realmSummaryOf({ level: -1, className: 7, race: 'Nord', face: 1.5 })), { level: null, className: null, race: 'Nord', gender: null, face: null, region: null });
  assert.equal(realmNameOf('x'.repeat(50)).length, 32);
  assert.equal(realmNameOf('   '), null);
  assert.equal(REALM_PLAYING_S, 600, 'a tile says "playing" for ten minutes past the last checkpoint (they come every five)');
  assert.ok(REALM_PLAYING_S >= 2 * ONLINE_CHECKPOINT_MS / 1000, 'never a period\'s gap where a playing character reads idle');
  assert.ok(DUPE_GRACE_S >= 2.5 * ONLINE_CHECKPOINT_MS / 1000, 'a claim waits two checkpoints of its holder and one in flight');
  const { env } = await stand();
  const res = await worker.fetch(new Request('https://accounts.invalid/v1/realm', { method: 'OPTIONS' }), env);
  assert.match(res.headers.get('access-control-allow-headers'), /x-realm-lease, x-realm-seq, x-realm-summary/);
});
