// DUEL1: THE RECORD, AND THE SURFACES THE DUEL STANDS ON, DRIVEN. The account service over the real
// migrations (one INSERT is the whole write: the loser's own report, the winner named by the relay's stamp; the gap and
// the pair bound inside it; wins and losses COUNTED off the rows), the worker's two routes behind a session and the
// record on /v1/account, the client's calls, the words and the kept reads; and the Inspect card's Challenge button and
// record line, the challenge prompt, the F-menu's rows, the account card's row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../../server-account/src/index.js';
import { standService } from '../accountDb.mjs';   // INT8: the Worker with the relay's key pair
import { _resetKeyForTests } from '../../server-account/src/signing.js';
import { createGuest, claimDuel, duelRecordOf, DUEL_PAIR_DAY_MAX, DUEL_WINNER_DAY_MAX } from '../../server-account/src/accounts.js';
import { mintDuelReceipt, DUEL_RECEIPT_TTL_S } from '../../src/net/duel/duelReceipt.js';   // INT8: the relay's receipt
import { ROUTES, OPEN_ROUTES, ACCOUNT_VERSION } from '../../server-account/src/service.js';
import { accountDuels, SESSION_KEY, REFUSALS } from '../../src/net/accountClient.js';
import { duelKd, duelRecordText, createDuelRecords, DUEL_RECORD_TTL_MS } from '../../src/net/duel/duelRecord.js';
import { profileView, profileDuelLine, createProfileWindow, DUEL_RECORD_ASKING } from '../../src/ui/profileWindow.js';
import { createDuelPrompt, duelPromptSub } from '../../src/ui/duelPrompt.js';
import { socialMenuRows, socialPlaqueRows } from '../../src/ui/socialMenu.js';
import { DUEL_ASK_TTL_MS } from '../../src/net/duel/duelSession.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole
import { ACCEPTED } from '../../src/net/legalLaw.js';   // TERMS1: a request that makes an account carries the versions ticked

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const { subtle } = globalThis.crypto;
const rand = (b) => globalThis.crypto.getRandomValues(b);
const MIGRATIONS = readdirSync(new URL('../../server-account/migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
/** The schema's own text for one index, table or trigger, as the database holds it. */
const schemaSql = (db, name) => db._raw.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name)?.sql ?? '';
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of MIGRATIONS) db.exec(src(`server-account/migrations/${f}`));
  return {
    _raw: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
      };
      return api;
    },
  };
}
const T0 = 1_800_000_000;
const guest = async (db) => (await createGuest({ db, subtle, rand, nowS: T0 }, { deviceLabel: null })).id;
/** AUDIT DUEL1 A1: a REGISTERED account - a guest with a handle written on its row, as register() writes it. */
let _handles = 0;
const member = async (db) => {
  const id = await guest(db);
  const h = `Duellist${++_handles}`;
  db._raw.prepare('UPDATE players SET handle = ?, handle_lc = ? WHERE id = ?').run(h, h.toLowerCase(), id);
  return { id, handle: h };
};

// a client posted naming the winner, the gap and the pair bound inside its INSERT, a double knockout two reports
// racing. The relay referees the bout now (net/duel/duelRef.js) and hands BOTH fighters its signed receipt naming the winner
// (net/duel/duelReceipt.js `d1`); either carries it, and it is one row counted once by its bout's id. The gap and the draw
// retired with the report; the pair, the winner's day and the registered accounts stand, inside the one INSERT.
const keys = () => subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
let _bout = 0;
const receiptOf = (kp, f, w, nowS = T0) => mintDuelReceipt({ f, w, n: (++_bout).toString(16).padStart(12, '0') }, kp.privateKey, { subtle, nowS });

test('INT8 the record: a duel\'s receipt is ONE row naming its winner - the winner\'s win and the loser\'s loss COUNTED off it, carried by either fighter and counted once (its bout\'s id); one pair DUEL_PAIR_DAY_MAX a day; a receipt not the caller\'s, not the relay\'s or past its day lands nothing (mutants: the bout counted twice; the pair bound unread; the loser\'s claim refused; another account\'s receipt counted; an unsigned one believed)', async () => {
  const db = d1();
  const kp = await keys(), other = await keys();
  const A = await member(db), B = await member(db), C = await member(db);
  const rc = await receiptOf(kp, [A.id, B.id], 1);
  const ctx = (nowS = T0) => ({ db, nowS, subtle });
  assert.deepEqual(await claimDuel(ctx(), A, rc, kp.publicKey), { recorded: true, wins: 0, losses: 1 }, 'the loser carries it: its own loss');
  assert.deepEqual(await claimDuel(ctx(), B, rc, kp.publicKey), { recorded: true, wins: 1, losses: 0 }, 'and the winner the same bout - counted once');
  assert.deepEqual(await duelRecordOf({ db }, B.id), { wins: 1, losses: 0 });
  assert.deepEqual(await claimDuel(ctx(), C, rc, kp.publicKey), { error: 'not-yours' }, 'a third account carries nobody\'s bout');
  assert.deepEqual(await claimDuel(ctx(), A, await receiptOf(other, [A.id, B.id], 0), kp.publicKey), { error: 'receipt', why: 'signature' }, 'not the relay\'s');
  const unsigned = await mintDuelReceipt({ f: [A.id, B.id], w: 0, n: 'ffffffffffff' }, null, { subtle, nowS: T0 });
  assert.deepEqual(await claimDuel(ctx(), A, unsigned, kp.publicKey), { error: 'receipt', why: 'unsigned' });
  assert.deepEqual(await claimDuel(ctx(T0 + DUEL_RECEIPT_TTL_S), A, await receiptOf(kp, [A.id, B.id], 0), kp.publicKey), { error: 'receipt', why: 'expired' }, 'a day old');
  assert.deepEqual(await claimDuel(ctx(), A, rc, null), { error: 'no-gate-key' });
  // the pair bound: the same winner over the same loser DUEL_PAIR_DAY_MAX a day
  const D = await member(db), E = await member(db);
  let counted = 0, last = null;
  for (let i = 0; i < DUEL_PAIR_DAY_MAX + 3; i++) { last = await claimDuel(ctx(T0 + i), D, await receiptOf(kp, [D.id, E.id], 1, T0 + i), kp.publicKey); if (last.recorded) counted++; }
  assert.equal(counted, DUEL_PAIR_DAY_MAX, 'one pair counts DUEL_PAIR_DAY_MAX a day');
  assert.equal(last.why, 'pair');
  const next = T0 + 24 * 3600;
  assert.equal((await claimDuel(ctx(next), D, await receiptOf(kp, [D.id, E.id], 1, next), kp.publicKey)).recorded, true, 'and again the next day');
  // an account that is gone takes its duels with it (both ends cascade)
  db._raw.prepare('DELETE FROM players WHERE id = ?').run(E.id);
  assert.deepEqual(await duelRecordOf({ db }, D.id), { wins: 0, losses: 0 });
  assert.match(schemaSql(db, 'idx_duel_rk'), /CREATE UNIQUE INDEX idx_duel_rk ON duel_results \(rk\) WHERE rk IS NOT NULL/, 'once, by the bout\'s id');
});

test('AUDIT DUEL1 A1 - INT8: a record is between two REGISTERED accounts - a guest\'s bout is fought, not counted; one winner counts DUEL_WINNER_DAY_MAX a day from anyone (mutants: guests counted; the winner bound unread)', async () => {
  const db = d1();
  const kp = await keys();
  const ctx = (nowS = T0) => ({ db, nowS, subtle });
  const M = await member(db), N = await member(db);
  const g = { id: await guest(db), handle: null };
  assert.deepEqual(await claimDuel(ctx(), g, await receiptOf(kp, [g.id, M.id], 1), kp.publicKey), { recorded: false, why: 'guest', wins: 0, losses: 0 }, 'a guest\'s loss is not counted');
  assert.deepEqual(await claimDuel(ctx(), M, await receiptOf(kp, [M.id, g.id], 1), kp.publicKey), { recorded: false, why: 'guest', wins: 0, losses: 0 }, 'nor a loss to a guest');
  // the winner bound: registered losers, each once, all naming N
  let counted = 0, last = null;
  for (let i = 0; i < DUEL_WINNER_DAY_MAX + 3; i++) { const L = await member(db); last = await claimDuel(ctx(T0 + i), N, await receiptOf(kp, [L.id, N.id], 1, T0 + i), kp.publicKey); if (last.recorded) counted++; }
  assert.equal(counted, DUEL_WINNER_DAY_MAX, 'one winner counts DUEL_WINNER_DAY_MAX a day, from anyone');
  assert.equal(last.why, 'winner');
  assert.deepEqual(await duelRecordOf({ db }, N.id), { wins: DUEL_WINNER_DAY_MAX, losses: 0 });
  assert.match(schemaSql(db, 'idx_duel_winner'), /idx_duel_winner ON duel_results \(winner, at\)/, 'the winner bound reads its own index');
});

async function stand() {
  _resetKeyForTests();
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey))).toString('base64');
  const env = { DB: d1(), IDENTITY_PRIVATE_KEY: pkcs8, ACCOUNT_VERSION: 'test1', ALLOWED_ORIGIN: '*' };
  const call = async (method, path, body, bearer = null) => {
    const res = await worker.fetch(new Request(`https://accounts.invalid${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { env, call };
}

test('DUEL1 the worker - INT8: /v1/duel/claim and /v1/duel/record behind a session, neither open; the claimer is the session, one of the receipt\'s two fighters (403 for any other), never the body; the loser\'s report retired (410); any account\'s record by id, in the body; /v1/account carries the caller\'s own (mutants: a route open to strangers; a third account\'s claim counted; the report still counted; the account view without the record)', async (t) => {
  // record now (net/duel/duelReceipt.js), and the report is answered `retired`.
  t.mock.method(Date, 'now', () => T0 * 1000);
  const S = await standService();
  const me = await S.registered('DuelMe'), them = await S.registered('DuelThem'), other = await S.registered('DuelOther');
  assert.ok(ROUTES.has('/v1/duel/claim') && ROUTES.has('/v1/duel/record') && ROUTES.has('/v1/duel/loss'));
  assert.ok(!OPEN_ROUTES.has('/v1/duel/claim') && !OPEN_ROUTES.has('/v1/duel/record') && !OPEN_ROUTES.has('/v1/duel/loss'));
  assert.equal(ACCOUNT_VERSION, 'acct208');
  assert.match(src('server-account/wrangler.toml'), /ACCOUNT_VERSION = "acct208"/);
  const rc = await mintDuelReceipt({ f: [me.id, them.id], w: 1, n: 'abcdef012345' }, S.gatePriv, { subtle, nowS: T0 });
  assert.equal((await S.call('/v1/duel/claim', { receipt: rc })).status, 401, 'a stranger carries nothing');
  assert.equal((await S.call('/v1/duel/record', { id: them.id })).status, 401);
  assert.deepEqual(await S.call('/v1/duel/claim', { receipt: rc }, other.secret), { status: 403, body: { error: 'not-yours' } }, 'a third account\'s session');
  assert.deepEqual((await S.call('/v1/duel/claim', { receipt: rc, winner: me.id }, me.secret)).body, { recorded: true, wins: 0, losses: 1 }, 'the session carries it; the body says nothing');
  assert.deepEqual((await S.call('/v1/duel/claim', { receipt: rc }, them.secret)).body, { recorded: true, wins: 1, losses: 0 }, 'the winner carries the same bout: counted once');
  assert.deepEqual((await S.call('/v1/duel/record', { id: them.id }, me.secret)).body, { id: them.id, wins: 1, losses: 0, gates: { closed: 0 }, raids: { defended: 0 }, serpents: { slain: 0 }, sds: { broken: 0 }, stars: { held: 0 } }, 'WB5b: the gates closed ride the same answer (STAR7, PIN MOVED: and the fallen stars held; RAID4: and the towns defended; SERPENT1: and the sea serpents slain; SD9b: and the Hours broken)');
  assert.equal((await S.call('/v1/duel/record', { id: 'nobody-here' }, me.secret)).status, 404);
  assert.deepEqual(await S.call('/v1/duel/loss', { winner: them.id }, me.secret), { status: 410, body: { error: 'retired' } }, 'the loser\'s own report counts for nothing now');
  assert.deepEqual(await S.call('/v1/duel/claim', { receipt: 'nope' }, me.secret), { status: 400, body: { error: 'receipt', why: 'shape' } });
  assert.deepEqual((await S.call('/v1/duel/record', { id: me.id }, me.secret)).body.losses, 1);
  const acct = await worker.fetch(new Request('https://accounts.invalid/v1/account', { headers: { authorization: `Bearer ${them.secret}` } }), S.env);
  assert.deepEqual((await acct.json()).account.duels, { wins: 1, losses: 0 }, 'the main menu\'s card reads its own record here');
});

test('DUEL1 the client - INT8: with no session there is no account to claim with - nothing is sent; with one, the receipt and the ask go as POSTs carrying the bearer (mutants: a knock with no session; the secret in the body or the URL)', async () => {
  const sent = [];
  const fetch = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ recorded: true, wins: 0, losses: 1 }) }; };
  const empty = new Map();
  const storage = { getItem: (k) => empty.get(k) ?? null, setItem: (k, v) => empty.set(k, v), removeItem: (k) => empty.delete(k) };
  const none = accountDuels({ fetch, storage });
  assert.deepEqual(await none.claim('d1.x.y'), { ok: false, error: 'no-session' });
  assert.equal(sent.length, 0);
  assert.equal('lost' in none, false, 'no loss is reported');
  empty.set(SESSION_KEY, JSON.stringify({ id: 'p_me', name: 'Me', kind: 'guest', sessionId: 's1', secret: 'SECRETSECRETSECRETSECRET' }));
  const d = accountDuels({ fetch, storage });
  const r = await d.claim('d1.x.y');
  assert.equal(r.ok, true);
  assert.match(sent[0].url, /\/v1\/duel\/claim$/);
  assert.equal(sent[0].init.method, 'POST');
  assert.equal(sent[0].init.headers.authorization, 'Bearer SECRETSECRETSECRETSECRET');
  assert.deepEqual(JSON.parse(sent[0].init.body), { receipt: 'd1.x.y' }, 'the receipt, and nothing of mine');
  await d.record('acct-y');
  assert.match(sent[1].url, /\/v1\/duel\/record$/);
  assert.deepEqual(JSON.parse(sent[1].init.body), { id: 'acct-y' });
});

test('DUEL1 the words and the kept reads: the K/D is wins over losses (no losses reads the wins), two decimals; a record with none says so; the Inspect card asks once and keeps the answer DUEL_RECORD_TTL_MS, says it is asking meanwhile, and forgets on the word (mutants: K/D inverted; a zero-loss K/D of Infinity; a read every frame)', async () => {
  assert.equal(duelKd(6, 3), 2);
  assert.equal(duelKd(4, 0), 4);
  assert.equal(duelKd(0, 5), 0);
  assert.equal(duelRecordText({ wins: 3, losses: 1 }), '3 won, 1 lost (K/D 3.00)');
  assert.equal(duelRecordText({ wins: 0, losses: 0 }), 'No duels yet');
  assert.equal(duelRecordText(null), null);
  let t = 0, reads = 0, told = 0;
  const recs = createDuelRecords({ read: async () => { reads++; return { ok: true, data: { wins: 2, losses: 1 } }; }, now: () => t, onRecord: () => { told++; } });
  assert.equal(recs.get('acct-x'), 'asking');
  assert.equal(recs.get('acct-x'), 'asking', 'one read out at a time');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(recs.get('acct-x'), { wins: 2, losses: 1 });
  assert.equal(told, 1);
  t += DUEL_RECORD_TTL_MS - 1;
  recs.get('acct-x');
  assert.equal(reads, 1, 'kept');
  t += 2;
  assert.deepEqual(recs.get('acct-x'), { wins: 2, losses: 1 }, 'stale: the kept one shown meanwhile...');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reads, 2, '...and asked again');
  recs.forget('acct-x');
  assert.equal(recs.get('acct-x'), 'asking');
  assert.equal(recs.get(''), null);
  const bad = createDuelRecords({ read: async () => ({ ok: false, error: 'offline' }), now: () => t });
  bad.get('acct-z');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(bad.get('acct-z'), null, 'the service could not say: no line, never a zero');
});

// ─── THE SURFACES ───────────────────────────────────────────────────────────────────────────────────────────────

function fakeNode(tag, doc) {
  const n = {
    tag, doc, children: [], attrs: {}, style: {}, dataset: {}, listeners: {}, className: '', textContent: '', id: '', disabled: false,
    append(...cs) { for (const c of cs) if (c) n.children.push(c); },
    replaceChildren(...cs) { n.children = []; n.append(...cs); },
    setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return n.attrs[k] ?? null; },
    addEventListener(t, fn) { (n.listeners[t] ??= []).push(fn); },
    fire(t, ev = {}) { for (const fn of n.listeners[t] ?? []) fn({ stopPropagation() {}, preventDefault() {}, ...ev }); },
    focus() {}, remove() { n.removed = true; },
  };
  return n;
}
function fakeDoc() {
  const doc = {};
  doc.createElement = (t) => fakeNode(t, doc);
  doc.createElementNS = (ns, t) => fakeNode(t, doc);
  doc.head = fakeNode('head', doc); doc.body = fakeNode('body', doc);
  doc.getElementById = (id) => doc.head.children.find((c) => c.id === id) ?? null;
  return doc;
}
const fakeWin = () => ({ addEventListener() {}, removeEventListener() {} });
const all = (n, cls, out = []) => { if (String(n.className).split(/\s+/).includes(cls)) out.push(n); for (const c of n.children ?? []) all(c, cls, out); return out; };
const text = (n) => (n.textContent || '') + (n.children ?? []).map(text).join('');

test('DUEL1 the Inspect card: the Challenge button beside Close as the host\'s law says it - pressed, it asks the host; disabled, its reason under it and the press is nothing; their record\'s line under the name, "asking" while the service is asked (mutants: a disabled button that still challenges; the record line from the card\'s own word)', () => {
  const doc = fakeDoc();
  const asked = [];
  const w = createProfileWindow({ doc, win: fakeWin(), onDuel: (id) => asked.push(id) });
  const look = { race: 'Nord', gender: 'male', faceIndex: 0, items: [] };
  w.show('peer-0002', profileView({ name: 'Bran', look, state: 'asking', duel: { label: 'Challenge to a duel', enabled: true }, record: { wins: 4, losses: 2 } }));
  const card = w.root.children[0];
  const btn = all(card, 'dfprofile-duel')[0];
  assert.equal(btn.textContent, 'Challenge to a duel');
  btn.fire('click');
  assert.deepEqual(asked, ['peer-0002'], 'the press is the host\'s, for the card\'s peer');
  assert.equal(text(all(card, 'dfprofile-duels')[0]), 'Duels: 4 won, 2 lost (K/D 2.00)');
  assert.ok(all(card, 'dfprofile-close').length === 1, 'Close stands beside it');
  w.update('peer-0002', profileView({ name: 'Bran', look, state: 'asking', duel: { label: 'Challenge to a duel', enabled: false, why: 'A duel is fought outdoors.' }, record: 'asking' }));
  const off = all(w.root.children[0], 'dfprofile-duel')[0];
  assert.equal(off.disabled, true);
  off.fire('click');
  assert.equal(asked.length, 1, 'a disabled button challenges nobody');
  assert.equal(text(all(w.root.children[0], 'dfprofile-why')[0]), 'A duel is fought outdoors.');
  assert.equal(text(all(w.root.children[0], 'dfprofile-duels')[0]), DUEL_RECORD_ASKING);
  // no duel word: no button, and the card is what it was
  w.update('peer-0002', profileView({ name: 'Bran', look, state: 'asking' }));
  assert.equal(all(w.root.children[0], 'dfprofile-duel').length, 0);
  assert.equal(profileDuelLine(null), null);
  assert.equal(profileView({ duel: { label: 'x', enabled: false, why: 'y' } }).duel.why, 'y');
});

test('DUEL1 the challenge prompt: the newest standing challenge with its countdown; Accept and Decline answer for THAT peer through the law; gone the moment the law no longer holds it (mutants: an answer for the wrong peer; the strip standing after the challenge lapsed)', () => {
  const doc = fakeDoc();
  let asks = [{ peer: 'peer-0003', at: 5000 }, { peer: 'peer-0002', at: 1000 }];
  const acted = [];
  const p = createDuelPrompt({ asks: () => asks, accept: (id) => acted.push(['yes', id]), decline: (id) => acted.push(['no', id]), name: (id) => ({ 'peer-0002': 'Bran', 'peer-0003': 'Cid' })[id], now: () => 6000, doc });
  p.render();
  assert.equal(p.root.dataset.up, '1');
  assert.equal(p.peer(), 'peer-0003', 'the newest');
  assert.equal(text(p.root), `Cid challenges you to a duel${duelPromptSub(DUEL_ASK_TTL_MS - 1000)}AcceptDecline`);
  const [yes, no] = all(p.root, 'dfduel-btn');
  yes.fire('click');
  assert.deepEqual(acted, [['yes', 'peer-0003']]);
  asks = [{ peer: 'peer-0002', at: 1000 }];
  p.render();
  no.fire('click');
  assert.deepEqual(acted.at(-1), ['no', 'peer-0002']);
  asks = [];
  p.render();
  assert.equal(p.root.dataset.up, '0', 'gone with the challenge');
  assert.equal(duelPromptSub(0), 'Answer within 1s');
  assert.equal(duelPromptSub(29001), 'Answer within 30s');
});

test('DUEL1 the F-menu\'s rows: a waiting challenge reads Accept duel with Decline duel beside it, a live duel Yield the duel - the challenge itself is the Inspect card\'s alone; the plaque lists the same rows; the account card shows the record (mutants: a Challenge row on the F-menu; the decline missing; the account card silent)', () => {
  const rows = (acts) => socialMenuRows({ peerId: 'peer-0002', canInspect: true, ...acts }).map((r) => [r.key, r.label, r.enabled, r.act?.k ?? null]);
  assert.ok(!rows({}).some(([k]) => k.startsWith('duel')), 'nothing to answer: no duel row');
  assert.deepEqual(rows({ duelRow: { label: 'Accept duel', k: 'duel.accept', enabled: true }, canDeclineDuel: true }).filter(([k]) => k.startsWith('duel')), [['duel', 'Accept duel', true, 'duel.accept'], ['duel-decline', 'Decline duel', true, 'duel.decline']]);
  assert.deepEqual(rows({ duelRow: { label: 'Yield the duel', k: 'duel.yield', enabled: true } }).filter(([k]) => k.startsWith('duel')), [['duel', 'Yield the duel', true, 'duel.yield']]);
  const off = socialMenuRows({ peerId: 'peer-0002', duelRow: { label: 'Accept duel', k: 'duel.accept', enabled: false, why: 'a duel is fought outdoors' } }).find((r) => r.key === 'duel');
  assert.equal(off.why, 'a duel is fought outdoors');
  assert.deepEqual(socialPlaqueRows('peer-0002', { duelRow: { label: 'Yield the duel', k: 'duel.yield', enabled: true } }).map((r) => r.id), ['friend', 'invite', 'duel']);
});
