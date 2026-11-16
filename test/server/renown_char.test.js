// RENOWN-CHAR: RENOWN A CHARACTER'S AGAIN. The service over the real migrations (server-account/src/
// renownTracks.js, raids.js, guilds.js, professions.js, index.js): a track a CHARACTER - two characters of an account
// keep two totals, the hour's bound still the ACCOUNT's across them (RENOWN-ACCOUNT's 15,000 and its three quarters
// stand), the tracks' bound (RENOWN_TRACKS_MAX) back, the token's level the named character's, the card a list of the
// characters' tracks, a raid paid to the character that fought it, a guild founded on the founding character's own
// Renown. A realm character deleted takes its own Renown with it. The client: the card's chip and a row a character,
// the page adopting a raid's credit only for the character that fought it, the delete dialog saying the Renown goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../../server-account/src/index.js';
import { _resetKeyForTests } from '../../server-account/src/signing.js';
import { createGuest } from '../../server-account/src/accounts.js';
import { reportRenownXp, renownTrackOf, renownTracksOf, RENOWN_CARD_TRACKS } from '../../server-account/src/renownTracks.js';
import { claimRaid } from '../../server-account/src/raids.js';
import { createRealm, deleteRealm } from '../../server-account/src/realm.js';
import { ACCOUNT_VERSION } from '../../server-account/src/service.js';
import {
  renownRaidXp, renownForXp, renownXpFor, RENOWN_XP_HOUR_MAX, RENOWN_XP_REPORT_MAX, RENOWN_XP_MAX, RENOWN_MAX, RENOWN_TRACKS_MAX,
} from '../../src/net/renown.js';
import { mintRaidReceipt } from '../../src/net/raid/raidReceipt.js';
import { importReceiptKey } from '../../src/net/gate/gateReceipt.js';
import { importPublicKeyB64, verifyToken } from '../../src/net/identityToken.js';
import { accountCard, renownTracksOfCard } from '../../src/ui/enhanced/enhancedAccount.js';
import { AccountFlow } from '../../src/ui/accountFlow.js';
import { r2, seatRealm, realmJoinAt } from '../realmSeat.mjs';   // AUDIT REALM2 S2: a founder is a realm character; INT16: a report is its seated realm character's, and one account plays one at a time
import { ACCEPTED } from '../../src/net/legalLaw.js';   // TERMS1: a request that makes an account carries the versions ticked

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const { subtle } = globalThis.crypto;
const rand = (b) => globalThis.crypto.getRandomValues(b);
const MIGRATIONS = readdirSync(new URL('../../server-account/migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const migrate = (db, files) => { for (const f of files) db.exec(src(`server-account/migrations/${f}`)); };
/** D1's shape over node:sqlite (auditrealm.test.js's): `batch` as ONE transaction, a write's changes() beside it. */
function wrap(db) {
  return {
    _raw: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      const writes = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
        _result() { const results = stmt.all(...args); return { results, meta: { changes: writes ? Number(db.prepare('SELECT changes() AS c').get().c) : 0 } }; },
      };
      return st;
    },
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((st) => st._result()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
/** The service's database, every migration applied. */
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db, MIGRATIONS);
  return wrap(db);
}
const T0 = 1_800_000_000;   // a clock hour's first second
const DAY = 500;
const player = async (db) => ({ id: (await createGuest({ db, subtle, rand, nowS: T0 }, { deviceLabel: null })).id });
let _handles = 0;
/** A registered account (a raid is counted for one). */
const member = async (db) => {
  const { id } = await player(db);
  const h = `Crier${++_handles}`;
  db._raw.prepare('UPDATE players SET handle = ?, handle_lc = ? WHERE id = ?').run(h, h.toLowerCase(), id);
  return { id, handle: h };
};
/** The relay's pair, as tools/mintGateKeys.mjs mints it (raid4_rewards.test.js's). */
async function relayPair() {
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey))).toString('base64');
  const pub = Buffer.from(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))).toString('base64url');
  return { priv: await importReceiptKey(pkcs8, { subtle }), pubKey: await importPublicKeyB64(pub, { subtle }) };
}
const raidFor = (s, key, priv) => mintRaidReceipt({ w: key, s, c: 777, y: 2 }, priv, { subtle, nowS: T0 });
const seatTrack = (db, id, charId, xp, name = null, at = T0) => db._raw.prepare('INSERT INTO renown_tracks (player, char_id, name, xp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, charId, name, xp, at, at);
const tracksOf = (raw, id) => raw.prepare('SELECT char_id, xp FROM renown_tracks WHERE player = ? ORDER BY char_id').all(id).map((x) => [x.char_id, x.xp]);

// ═══ THE SERVICE ═════════════════════════════════════════════════════════════════════════════════

test('RENOWN-CHAR the track: a CHARACTER\'s again - two characters\' reports keep two totals, each answered as its own; the hour is still the ACCOUNT\'s 15,000 across them; a report naming no character is refused, and a new character past RENOWN_TRACKS_MAX (60); the account\'s old row is never written (mutants: a report onto another character\'s track; the tracks unbounded)', async () => {
  const db = d1();
  const P = await player(db);
  let r = await reportRenownXp({ db, nowS: T0 }, P, { character: 'char-aaaa', xp: 1000, name: 'Mara' });
  assert.deepEqual(r, { character: 'char-aaaa', xp: 1000, level: renownForXp(1000), credited: 1000, rose: true, room: 14000 }, 'the answer names its character');   // SCALE4h (
  r = await reportRenownXp({ db, nowS: T0 + 1 }, P, { character: 'char-bbbb', xp: 500, name: 'Tam' });
  assert.deepEqual([r.character, r.xp, r.credited], ['char-bbbb', 500, 500], 'the second character\'s report starts its OWN total - never onto the first\'s');
  assert.deepEqual(await renownTrackOf({ db }, P.id, 'char-aaaa'), { xp: 1000, level: renownForXp(1000) });
  assert.deepEqual(await renownTrackOf({ db }, P.id, 'char-bbbb'), { xp: 500, level: renownForXp(500) });
  assert.equal(await renownTrackOf({ db }, P.id, 'char-cccc'), null, 'a character that earned nothing has none: Renown 1');
  assert.deepEqual((await renownTracksOf({ db }, P.id)).map((t) => [t.character, t.name, t.xp]), [['char-bbbb', 'Tam', 500], ['char-aaaa', 'Mara', 1000]], 'the card\'s list, the most recently earned first');
  for (const character of [undefined, null, 'x', 42, 'a b c d']) {
    assert.deepEqual(await reportRenownXp({ db, nowS: T0 + 2 }, P, { character, xp: 10 }), { error: 'renown-character' }, `${JSON.stringify(character)}: no character, no track`);
  }
  // THE HOUR is the account's 15,000, whichever characters earn it (the Renown is the character's, the bound is not)
  const Q = await player(db);
  let got = 0;
  for (let i = 0; i < 5; i++) got += (await reportRenownXp({ db, nowS: T0 + 10 + i }, Q, { character: `char-q${i}xx`, xp: RENOWN_XP_REPORT_MAX })).credited;
  assert.equal(got, RENOWN_XP_HOUR_MAX, 'five characters, one hour: 15,000 - a second character is not a second allowance');
  assert.deepEqual((await renownTracksOf({ db }, Q.id, 10)).map((t) => t.xp).sort((a, b) => b - a), [5000, 5000, 5000], 'three characters\' tracks, the other two paid nothing and given none');
  // THE TRACKS' BOUND: sixty an account; a sixty-first character is refused, one it keeps still earns
  const B = await player(db);
  for (let i = 0; i < RENOWN_TRACKS_MAX; i++) seatTrack(db, B.id, `char-${String(i).padStart(4, '0')}`, 0);
  assert.deepEqual(await reportRenownXp({ db, nowS: T0 }, B, { character: 'char-new1', xp: 10 }), { error: 'renown-full' });
  assert.equal((await reportRenownXp({ db, nowS: T0 }, B, { character: 'char-0003', xp: 10 })).credited, 10, 'a character it keeps still earns');
  assert.equal(RENOWN_TRACKS_MAX, 60);
  assert.equal(db._raw.prepare('SELECT COUNT(*) AS n FROM renown_accounts').get().n, 0, 'RENOWN-ACCOUNT\'s table is history: no report writes it');
});

async function stand() {
  _resetKeyForTests();
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey))).toString('base64');
  const env = { DB: d1(), SAVES: r2(), IDENTITY_PRIVATE_KEY: pkcs8, ACCOUNT_VERSION: 'test1', ALLOWED_ORIGIN: '*' };
  const call = async (method, path, body, bearer = null) => {
    const res = await worker.fetch(new Request(`https://accounts.invalid${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { env, call, kp };
}

test('RENOWN-CHAR the worker: the token\'s level is the NAMED character\'s own - another character of the account stands at its own; a mint naming none carries none; a report answers its character\'s track; /v1/account says the characters\' tracks (a list, the most recently earned first); a realm character founds a guild on its OWN Renown - never its account\'s best; acct31 (mutants: the mint reading the account\'s best track; the card sent one track; the founding asking the account\'s best)', async (t) => {
  let clock = T0 * 1000;
  t.mock.method(Date, 'now', () => clock);
  const { env, call, kp } = await stand();
  const me = (await call('POST', '/v1/auth/guest', { ...ACCEPTED })).body;
  assert.deepEqual((await call('GET', '/v1/account', undefined, me.secret)).body.account.renown, [], 'nothing earned: no track');
  // INT16 (Integrity-Arc section 7): a report is asked of the account's SEATED realm character - so the account's two
  // characters are realm characters (MARA, TAM), and the seat moves to each before its reports (one account plays one)
  const MARA = (await seatRealm(env, me.secret, 'Mara')).id, TAM = (await seatRealm(env, me.secret, 'Tam')).id;
  assert.deepEqual(await call('POST', '/v1/renown/xp', { character: MARA, xp: 5000, name: 'Mara' }, me.secret), { status: 403, body: { error: 'progress-seat' } }, 'INT16: a character the account is not playing earns nothing');   // INT16: the last character made holds the seat (Tam) - another of the account's is refused until it is joined
  assert.deepEqual(await call('POST', '/v1/renown/xp', { character: 'char-aaaa', xp: 5000, name: 'Mara' }, me.secret), { status: 403, body: { error: 'progress-seat' } }, 'INT16: an offline id earns nothing');
  await realmJoinAt(env, me.secret, MARA);
  let r = await call('POST', '/v1/renown/xp', { character: MARA, xp: 5000, name: 'Mara' }, me.secret);
  assert.deepEqual([r.status, r.body.character, r.body.xp, r.body.level, typeof r.body.order], [200, MARA, 5000, 9, 'string']);
  r = await call('POST', '/v1/renown/xp', { character: MARA, xp: 510 }, me.secret);
  assert.deepEqual([r.body.xp, r.body.level, r.body.rose], [5510, 10, true]);
  clock += 1000;   // a second on: the card orders by the last earned
  await realmJoinAt(env, me.secret, TAM);
  r = await call('POST', '/v1/renown/xp', { character: TAM, xp: 150, name: 'Tam' }, me.secret);
  assert.deepEqual([r.body.character, r.body.xp, r.body.level], [TAM, 150, 2], 'another character: its own track');
  for (const [character, level, xp] of [[MARA, 10, 5510], [TAM, 2, 150], ['char-never-played', 1, 0]]) {
    const tok = (await call('POST', '/v1/auth/token', { character }, me.secret)).body;
    assert.deepEqual([tok.level, tok.xp], [level, xp], `${character}: its own Renown and total`);
    assert.equal((await verifyToken(tok.token, kp.publicKey, { subtle, nowS: T0 })).claims.lv, level, `${character}: signed in`);
  }
  const none = (await call('POST', '/v1/auth/token', {}, me.secret)).body;
  assert.deepEqual([none.level, none.xp], [null, null], 'a mint naming no character (an older build) carries none');
  const card = (await call('GET', '/v1/account', undefined, me.secret)).body.account.renown;
  assert.deepEqual(card.map((x) => [x.character, x.name, x.xp, x.level]), [[TAM, 'Tam', 150, 2], [MARA, 'Mara', 5510, 10]], 'the card: the characters\' tracks, the most recently earned first');
  assert.equal(RENOWN_CARD_TRACKS, 5);
  assert.deepEqual(await call('POST', '/v1/renown/xp', { xp: 10 }, me.secret), { status: 403, body: { error: 'progress-seat' } }, 'no character: not the seat');
  assert.equal((await call('POST', '/v1/renown/xp', { character: TAM, xp: 0 }, me.secret)).status, 400, 'an amount out of its bound');
  for (let i = 0; i < RENOWN_TRACKS_MAX; i++) env.DB._raw.prepare('INSERT OR IGNORE INTO renown_tracks (player, char_id, xp, created_at, updated_at) VALUES (?, ?, 0, 1, 1)').run(me.id, `char-f${String(i).padStart(3, '0')}`);
  const PAST = (await seatRealm(env, me.secret, 'Past')).id;   // INT16: a new character past the tracks' bound is a seated realm character with no track
  assert.deepEqual(await call('POST', '/v1/renown/xp', { character: PAST, xp: 10 }, me.secret), { status: 409, body: { error: 'renown-full' } }, 'a character past the tracks\' bound: 409');
  // A GUILD is founded on the founding character's OWN Renown (AUDIT REALM2 S2: a realm character, on its record)
  assert.equal((await call('POST', '/v1/auth/register', { handle: 'Aldric', password: 'a good long one', ...ACCEPTED }, me.secret)).status, 200);
  const fresh = await seatRealm(env, me.secret, 'Fresh', { name: 'Fresh', level: 9, goldPieces: 100_000, items: [] });
  assert.deepEqual(await call('POST', '/v1/guilds/found', { character: fresh.id, name: 'The Hound', tag: 'HND', realm: fresh.at() }, me.secret), { status: 403, body: { error: 'guild-renown' } }, 'a character that never earned is Renown 1 - whatever the account\'s best (Mara\'s 10)');
  env.DB._raw.prepare('INSERT INTO renown_tracks (player, char_id, name, xp, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)').run(me.id, fresh.id, 'Fresh', renownXpFor(10));
  assert.equal((await call('POST', '/v1/guilds/found', { character: fresh.id, name: 'The Hound', tag: 'HND', realm: fresh.at() }, me.secret)).status, 200, 'at its own Renown 10, it founds');
  assert.equal(ACCOUNT_VERSION, 'acct208', 'the live version: a deploy that changes the service moves it');
  assert.match(src('server-account/wrangler.toml'), /ACCOUNT_VERSION = "acct208"/);
});

test('RENOWN-CHAR the raid: a town defended is paid to the character that FOUGHT it, at its own Renown - never the account\'s best - another character\'s track untouched; a claim naming no character is refused (mutants: the raid read at the account\'s best track)', async () => {
  const db = d1();
  const A = await member(db);
  const { priv, pubKey } = await relayPair();
  const ctx = { db, nowS: T0 + 60, subtle, rand };
  seatTrack(db, A.id, 'char-best', renownXpFor(20), 'Best');
  const c1 = await claimRaid(ctx, A, { receipt: await raidFor(A.id, `3:7:${DAY}`, priv), character: 'char-newb', name: 'Newb' }, pubKey);
  assert.deepEqual(c1.renown, { character: 'char-newb', xp: renownRaidXp(1), level: renownForXp(renownRaidXp(1)), credited: renownRaidXp(1), rose: true }, 'paid at ITS Renown 1 (585) - never at the account\'s best\'s 20');
  assert.deepEqual(tracksOf(db._raw, A.id), [['char-best', renownXpFor(20)], ['char-newb', renownRaidXp(1)]], 'the best character\'s track untouched');
  const c2 = await claimRaid(ctx, A, { receipt: await raidFor(A.id, `3:8:${DAY}`, priv), character: 'char-best' }, pubKey);
  assert.deepEqual([c2.renown.character, c2.renown.credited, c2.renown.xp], ['char-best', renownRaidXp(20), renownXpFor(20) + renownRaidXp(20)], 'the best one paid at its own 20');
  assert.deepEqual(await claimRaid(ctx, A, { receipt: await raidFor(A.id, `3:9:${DAY}`, priv) }, pubKey), { error: 'renown-character' }, 'no character to pay');
  assert.deepEqual(db._raw.prepare('SELECT char_id FROM raid_cleanses WHERE account = ? ORDER BY raid').all(A.id).map((x) => x.char_id), ['char-newb', 'char-best']);
});

// ═══ THE MIGRATION ═══════════════════════════════════════════════════════════════════════════════

test('RENOWN-CHAR a realm character deleted takes its OWN Renown with it and leaves the others\' be; a new realm character starts at Renown 1 (mutants: the track left behind by a delete)', async () => {
  const db = d1();
  const A = await player(db);
  const made = await createRealm({ db, rand, nowS: T0 }, A.id, { name: 'Nystul' });
  assert.ok(made.id, `made: ${JSON.stringify(made)}`);
  await reportRenownXp({ db, nowS: T0 }, A, { character: made.id, xp: 4000 });
  await reportRenownXp({ db, nowS: T0 + 1 }, A, { character: 'char-keep', xp: 900 });
  assert.deepEqual(await deleteRealm({ db, bucket: null }, A.id, made.id), { ok: true });
  assert.equal(await renownTrackOf({ db }, A.id, made.id), null, 'its Renown went with it');
  assert.deepEqual(await renownTrackOf({ db }, A.id, 'char-keep'), { xp: 900, level: renownForXp(900) }, 'another character\'s stays');
  const next = await createRealm({ db, rand, nowS: T0 + 2 }, A.id, { name: 'Tamsin' });
  assert.equal((await reportRenownXp({ db, nowS: T0 + 3 }, A, { character: next.id, xp: 10 })).xp, 10, 'a new character starts at its own nothing');
});

// ═══ THE CLIENT ══════════════════════════════════════════════════════════════════════════════════

const node = (tag) => {
  const n = {
    tag, className: '', title: '', children: [],
    append: (...kids) => n.children.push(...kids.filter(Boolean)),
    get all() { return [n, ...n.children.flatMap((c) => c.all)]; },
  };
  Object.defineProperty(n, 'textContent', { get() { return n._txt ?? null; }, set(v) { n._txt = v; if (v === '') n.children.length = 0; } });
  return n;
};

test('RENOWN-CHAR the client: the account card draws the characters\' tracks - the level of the one played last left of the name, named in its title, and a row each; RENOWN-ACCOUNT\'s one Renown (a service from its day) draws none; the page adopts a raid\'s credit only for the character that fought it; the delete dialog says the Renown goes with the character (mutants: a track of any shape drawn; another character\'s raid adopted; the dialog\'s old word)', () => {
  const tracks = [{ character: 'char-aaaa', name: 'Mara Venn', xp: 6000, level: 10 }, { character: 'char-bbbb', name: null, xp: 150, level: 2 }];
  assert.deepEqual(renownTracksOfCard(tracks), tracks);
  for (const bad of [null, undefined, { xp: 6000, level: 10 }, 'Renown 10']) assert.deepEqual(renownTracksOfCard(bad), [], `${JSON.stringify(bad)}: no characters' tracks`);
  assert.deepEqual(renownTracksOfCard([{ xp: 1, level: 0 }, { xp: -1, level: 2 }, { xp: 1.5, level: 2 }, { level: 2 }, null, tracks[1]]), [tracks[1]], 'a track out of shape is not drawn');
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const flow = AccountFlow({ io: { fetch: async () => { throw new Error('no network'); } }, storage });
  const card = accountCard({ createElement: node }, flow);
  const base = { id: 'p1', name: 'Lattymoy', kind: 'linked', handle: 'Lattymoy', playedS: 60 };
  flow.stage = 'in';
  flow.account = { ...base, renown: tracks };
  card.paint();
  const h3 = card.root.all.find((n) => n.tag === 'h3');
  assert.deepEqual(h3.children.map((c) => [c.className, c.textContent]), [['acctrenown', '10'], ['acctname', 'Lattymoy']], 'the level of the character played last, left of the name');
  assert.equal(h3.children[0].title, 'Renown 10 - Mara Venn', 'and whose it is');
  const values = () => card.root.all.filter((n) => n.className === 'acctval').map((n) => n.textContent);
  assert.ok(values().includes('Mara Venn - Renown 10, 490 / 2,150 XP to Renown 11'), values().join(' | '));
  assert.ok(values().includes('A character - Renown 2, 50 / 130 XP to Renown 3'), 'a character whose name the service never heard');
  flow.account = { ...base, renown: [{ character: 'char-capp', name: 'Old', xp: RENOWN_XP_MAX, level: RENOWN_MAX }] };
  card.paint();
  assert.ok(values().includes('Old - Renown 50, the highest there is'), 'the level said once at the cap (AUDIT RENOWN1 UI-6)');
  flow.account = { ...base, renown: { xp: 6000, level: 10 } };
  card.paint();
  const plain = card.root.all.find((n) => n.tag === 'h3');
  assert.deepEqual([plain.textContent, plain.children.length], ['Lattymoy', 0], 'RENOWN-ACCOUNT\'s one Renown: no character\'s, none drawn');
});
