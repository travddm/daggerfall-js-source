// ACC3 — PLAYER TITLES AND NAME GLYPHS.
//
// And beside the name: "Sprouting green
// plant. Attached to new accounts for 2 weeks. Developer glyph
// specifically for developers."
//
// ═══ WHAT THESE PINS ARE FOR ═══════════════════════════════════════
//
// THE GRANTS ARE DERIVED AND NOT A COLUMN, and that is the claim worth
// pinning, because it is the one a later slice will be tempted to
// undo. A `grants` table would pass a test that only asked "does a
// developer get the developer title?" - so these pins drive the things a
// stored grant CANNOT do: a sprout that expires because time passed
// with nothing running, a developer who stops being one the moment the
// role is taken off the row.
//
// AND THE BADGE IS SIGNED, NEVER ASSERTED. ACC1g shut this hole on the
// name one slice ago; a title is the stronger claim of the two, so the
// relay half is driven through a REAL Room with a REAL Ed25519 key:
// a hello that types a title gets nothing, and a hello that carries a
// signed one is badged on the welcome, the join, the channel roster
// and the `who` answer alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../server-account/src/index.js';
import { _resetKeyForTests } from '../../server-account/src/signing.js';
import { register } from '../../server-account/src/accounts.js';
import {
  SPROUT_S, isDeveloper,
  titlesHeld, glyphsOf, titleWorn, equipRefusal, wardrobeOf,
} from '../../server-account/src/titles.js';
import {
  TITLES, GLYPHS, GLYPHS_MAX, mintToken, verifyToken, importPublicKeyB64, claimsValid,
} from '../../src/net/identityToken.js';
import { badged, rosterFor } from '../../src/net/wire.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { ACCEPTED } from '../../src/net/legalLaw.js';   // TERMS1: a request that makes an account carries the versions ticked

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const { subtle } = globalThis.crypto;
const rand = (b) => globalThis.crypto.getRandomValues(b);

// One fixed clock for the glyph reads, long after the test rows were made.
const NOW = Date.UTC(2026, 11, 24, 12) / 1000;
// A registration time for the test rows, before NOW.
const REGISTERED = Date.UTC(2026, 9, 1) / 1000;

const MIGRATIONS = readdirSync(new URL('../../server-account/migrations', import.meta.url))
  .filter((f) => f.endsWith('.sql')).sort();

/** The same D1-shaped face the other account pins use: D1's whole
 *  surface and nothing more, over the REAL migrations - 0004 included,
 *  because the walk picks up every file in the folder. */
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
        _result() { const results = stmt.all(...args); return { results, meta: { changes: Number(db.prepare('SELECT changes() AS c').get().c) } }; },
      };
      return api;
    },
    // SIGN-BATCH (
    // (the badge's doors ask the three games' honours in one, honours.js withHonours)
    async batch(list) { db.exec('BEGIN'); try { const out = list.map((st) => st._result()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}

// ── THE GRANTS, derived ─────────────────────────────────────────────

test('ACC3: Founder is no longer granted: no row holds it or may wear it, whenever it first played (server feature audit PR 3)', () => {
  const early = { handle: 'Early', registered_at: 1, created_at: 1, first_played_at: 1, title: 'founder' };
  assert.deepEqual(titlesHeld(early, {}), []);
  assert.equal(titleWorn(early, {}), undefined, 'a row that still says founder wears nothing');
  assert.equal(equipRefusal('founder', early, {}), 'not-held');
  assert.deepEqual(titlesHeld(early, { FOUNDER_HANDLES: 'early' }), [], 'the old config list grants nothing');
  // A GUEST HOLDS NOTHING: a guest row has no handle and no role.
  assert.deepEqual(titlesHeld({ created_at: 1, registered_at: null }, {}), []);
});

test('ACC3: the sprout EXPIRES because time passed - nothing runs, nothing is cleared (mutant: a stored glyph and a cron to remove it)', () => {
  const born = 1_000_000;
  const player = { created_at: born, registered_at: 1 };
  assert.deepEqual(glyphsOf(player, {}, born), ['sprout'], 'on the day the account is made');
  assert.deepEqual(glyphsOf(player, {}, born + SPROUT_S - 1), ['sprout'], 'the last second of the fortnight');
  // ONE SECOND LATER IT IS GONE, and the row was not touched. AUDIT-ACC
  // F9 settled this one system over: a cron is a thing that can stop
  // running while everything looks fine, and a stored glyph with an
  // expiry needs one.
  assert.deepEqual(glyphsOf(player, {}, born + SPROUT_S), []);
  assert.equal(SPROUT_S, 14 * 24 * 60 * 60, 'two weeks, as Mac wrote it');
});

test('ACC3: a developer is a role on the ACCOUNT (staff_admin), so taking the role off takes the title and the glyph with it', () => {
  const env = {};
  const dev = { handle: 'MacK', registered_at: REGISTERED, created_at: REGISTERED, staff_admin: 1 };
  assert.ok(isDeveloper(dev, env));
  assert.deepEqual(titlesHeld(dev, env), ['developer']);
  assert.deepEqual(glyphsOf(dev, env, NOW), ['dev'], 'the glyph rides the same role as the title - one grant, two faces');

  // THE REMOVAL IS THE POINT. Nothing else is written, so clearing the
  // role on the row is the whole of revoking it.
  assert.deepEqual(titlesHeld({ ...dev, staff_admin: 0 }, env), []);
  assert.deepEqual(glyphsOf({ ...dev, staff_admin: 0 }, env, NOW), []);
  assert.equal(titlesHeld(dev, { DEVELOPER_HANDLES: '' }).length, 1, 'the role is on the row: a list in the env neither adds nor removes it');
  assert.deepEqual(titlesHeld({ handle: 'MacK', registered_at: REGISTERED, created_at: REGISTERED }, { DEVELOPER_HANDLES: 'mack' }), [], 'a handle on an env list, with no role on the row, is nobody');

  // A GUEST HAS NO HANDLE and no role: a guest row is a device.
  assert.equal(isDeveloper({ handle: null, staff_admin: 0 }, env), false);
  assert.equal(isDeveloper({ handle: '' }, env), false);
});

test('ACC3: HOLDING IS NOT WEARING - a stored title stops being worn the moment the grant behind it lapses', () => {
  const env = {};
  const dev = { handle: 'mack', registered_at: REGISTERED, created_at: 0, title: 'developer', staff_admin: 1 };
  assert.deepEqual(titlesHeld(dev, env), ['developer']);
  assert.equal(titleWorn(dev, env), 'developer');

  // THE ROLE TAKEN OFF, AND THE COLUMN STILL SAYS `developer`. Nothing
  // rewrote the row and nothing had to: a grant is a fact checked now.
  assert.equal(titleWorn({ ...dev, staff_admin: 0 }, env), undefined);
  assert.equal(wardrobeOf({ ...dev, staff_admin: 0 }, env, NOW).title, null, 'the wardrobe says null rather than a title nobody holds');

  assert.equal(titleWorn({ ...dev, title: null }, env), undefined);
  assert.equal(titleWorn({ ...dev, title: 'emperor' }, env), undefined, 'a column somebody edited by hand is not a grant');
});

test('ACC3: equip refuses what is not held and what is not a title, and taking it off is always allowed', () => {
  const env = {};
  const dev = { handle: 'notmack', registered_at: REGISTERED, created_at: 0, staff_admin: 1 };
  assert.equal(equipRefusal('developer', dev, env), null);
  assert.equal(equipRefusal('dungeonmaster', dev, env), 'not-held');
  assert.equal(equipRefusal('emperor', dev, env), 'no-title');
  assert.equal(equipRefusal('', dev, env), 'no-title');
  assert.equal(equipRefusal(null, dev, env), null, 'a player may always wear nothing');
  // THE TWO REFUSALS ARE DIFFERENT WORDS because they are different
  // situations: one is "no such title exists" and the other is "it
  // exists and it is not yours", and the Worker answers 400 and 403.
  assert.notEqual(equipRefusal('emperor', dev, env), equipRefusal('dungeonmaster', dev, env));
});

// ── THE TOKEN ───────────────────────────────────────────────────────

test('ACC3: the token carries the badge, and a body edited to claim one that is not in the vocabulary will not verify', async () => {
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = await importPublicKeyB64(
    Buffer.from(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))).toString('base64url'),
    { subtle },
  );
  const nowS = 1_760_000_000;
  const tok = await mintToken({ s: 'acct-1', n: 'Mack', k: 'linked', t: 'founder', g: ['sprout', 'dev'] }, kp.privateKey, { subtle, nowS });
  const r = await verifyToken(tok, pub, { subtle, nowS });
  assert.ok(r.ok, r.why);
  assert.equal(r.claims.t, 'founder');
  assert.deepEqual(r.claims.g, ['sprout', 'dev']);

  // A TOKEN WITHOUT A BADGE IS THE COMMON CASE and carries neither key
  // - absent, not null, exactly as the wire rows are.
  const bare = await mintToken({ s: 'acct-1', n: 'Mack', k: 'linked' }, kp.privateKey, { subtle, nowS: nowS - 1 });
  const b = await verifyToken(bare, pub, { subtle, nowS });
  assert.ok(b.ok);
  assert.equal('t' in b.claims, false);
  assert.equal('g' in b.claims, false);

  // AND THE VOCABULARY IS CLOSED. These run through `claimsValid`,
  // which is what `verifyToken` asks before it says ok - so an
  // unknown badge cannot have been signed for, and the relay never
  // has to re-check one.
  const base = { v: 1, s: 'acct-1', n: 'Mack', k: 'linked', i: nowS, e: nowS + 60 };
  assert.equal(claimsValid({ ...base, t: 'founder' }), true);
  assert.equal(claimsValid({ ...base, t: 'emperor' }), false);
  assert.equal(claimsValid({ ...base, t: 42 }), false);
  assert.equal(claimsValid({ ...base, g: ['sprout'] }), true);
  assert.equal(claimsValid({ ...base, g: ['sprout', 'sprout'] }), false, 'a repeated glyph is a minter that got greedy');
  assert.equal(claimsValid({ ...base, g: ['nope'] }), false);
  assert.equal(claimsValid({ ...base, g: 'sprout' }), false, 'a string is not a list of glyphs');
  assert.equal(claimsValid({ ...base, g: [...GLYPHS, 'sprout'] }), false, 'more slots than there are glyphs');
  assert.equal(GLYPHS_MAX, GLYPHS.length, 'the bound is the vocabulary\'s own size, not a number somebody picked');
  assert.deepEqual([...TITLES], ['founder', 'developer', 'dungeonmaster', 'disciple', 'apostle', 'hierophant', 'gatebreaker', 'herald', 'warden', 'protector', 'champion', 'grandchampion', 'arenachampion', 'hourbreaker', 'hoursfirst', 'chaptermaster', 'chapterofficer', 'formermaster', 'highmaster', 'seasonmaster', 'ilovelamp', 'coilbreaker', 'doorwarden', 'covenbane', 'hourwitness', 'satakalwitness', 'starwarden', 'witchwarden', 'hearthkeeper', 'bloodhound', 'beastbane', 'grandhuntsman', 'huntlegend', 'mastermining', 'masterlogging', 'masterherbalism', 'masterhunting', 'masterfishing', 'mastersmithing', 'masterbuilding', 'masteroutfitting', 'masterprovisioning', 'masterenchanting', 'serpenthunter', 'deepbane'], 'the closed list of titles, in order');
  assert.deepEqual([...GLYPHS], ['sprout', 'dev', 'mod', 'dm', 'disciple', 'apostle', 'hierophant', 'herald', 'tower', 'crownDF', 'crownWR', 'crownSN', 'laurel', 'crownSK', 'crownMW', 'crownSU', 'crownVW', 'crownEW', 'crownBM', 'crownCY'], 'the closed list of glyphs, in order');
});

// ── THE SERVICE, end to end ─────────────────────────────────────────

async function stand({ admins = [], ...vars } = {}) {
  _resetKeyForTests();
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey))).toString('base64');
  const pubB64 = Buffer.from(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))).toString('base64url');
  const env = { DB: d1(), IDENTITY_PRIVATE_KEY: pkcs8, ACCOUNT_VERSION: 'test1', ALLOWED_ORIGIN: '*', ...vars };
  const call = async (method, path, body, bearer = null) => {
    const res = await worker.fetch(new Request(`https://accounts.invalid${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  /** A REGISTERED account: a role is held by a registered account alone. `register` stamps `registered_at` off the
   *  ctx clock. */
  const account = async (handle, { registeredAt = REGISTERED, createdAt = null } = {}) => {
    const guest = (await call('POST', '/v1/auth/guest', { ...ACCEPTED })).body;
    await register({ db: env.DB, subtle, rand, nowS: registeredAt }, guest.id, { handle, password: 'a-long-enough-password' });
    if (admins.includes(handle)) await env.DB.prepare('UPDATE players SET staff_admin = 1 WHERE id = ?').bind(guest.id).run();   // STAFF-ROLES-BY-ACCOUNT
    if (createdAt !== null) await env.DB.prepare('UPDATE players SET created_at = ? WHERE id = ?').bind(createdAt, guest.id).run();
    return guest;
  };
  return { env, call, pubB64, account };
}

test('ACC3: /v1/account carries the wardrobe, and /v1/account/title equips one of it', async () => {
  const { call, account } = await stand({ admins: ['mack'] });
  const me = await account('mack');

  const seen = (await call('GET', '/v1/account', undefined, me.secret)).body;
  assert.deepEqual(seen.wardrobe.titles, ['developer']);
  assert.equal(seen.wardrobe.title, null, 'nothing is worn until it is equipped - null is a perfectly good answer and is what every existing row gets');
  assert.ok(seen.wardrobe.glyphs.includes('dev'));
  assert.equal('title' in seen.account, false, 'the wardrobe is its own field: an account view is the ROW, a wardrobe is the row read against the roles and a clock');

  const on = await call('POST', '/v1/account/title', { title: 'developer' }, me.secret);
  assert.equal(on.status, 200);
  assert.equal(on.body.title, 'developer');
  assert.deepEqual(on.body.titles, ['developer'], 'the answer describes the row AFTER the write, so nothing has to re-read');

  const again = (await call('GET', '/v1/account', undefined, me.secret)).body;
  assert.equal(again.wardrobe.title, 'developer', 'and it stuck - the WORN title is the one thing that is stored, because it is the only thing that is a choice');

  const off = await call('POST', '/v1/account/title', { title: null }, me.secret);
  assert.equal(off.status, 200);
  assert.equal(off.body.title, null);
  assert.equal((await call('POST', '/v1/account/title', {}, me.secret)).status, 200, 'an absent title is "take it off" too');
});

test('ACC3: a title nobody granted cannot be equipped by a client that asks nicely', async () => {
  const { call, account } = await stand({ admins: ['someone-else'] });
  const me = await account('mack');
  // 403 AND NOT 401: the credential is GOOD and the title is simply
  // not theirs - the same reading the save wall takes.
  const no = await call('POST', '/v1/account/title', { title: 'developer' }, me.secret);
  assert.equal(no.status, 403);
  assert.equal(no.body.error, 'not-held');
  const nope = await call('POST', '/v1/account/title', { title: 'emperor' }, me.secret);
  assert.equal(nope.status, 400);
  assert.equal(nope.body.error, 'no-title');
  // AND NOTHING WAS WRITTEN. A refusal that half-lands is worse than
  // one that does not land at all.
  assert.equal((await call('GET', '/v1/account', undefined, me.secret)).body.wardrobe.title, null);
  // The route needs a credential like every other one behind the door.
  assert.equal((await call('POST', '/v1/account/title', { title: 'founder' })).status, 401);
});

test('ACC3: the minted token carries what the service DERIVED, not what the caller asked for', async () => {
  const { call, account, pubB64, env } = await stand({ admins: ['mack'] });
  // OLD ENOUGH TO HAVE LOST THE SPROUT, so the only glyph in play
  // here is the developer's and the assertion below means what it says.
  const me = await account('mack', { createdAt: 1 });
  await call('POST', '/v1/account/title', { title: 'developer' }, me.secret);

  const pub = await importPublicKeyB64(pubB64, { subtle });
  const got = await call('POST', '/v1/auth/token', { secret: me.secret, title: 'founder', glyphs: ['sprout'] });
  assert.equal(got.status, 200);
  assert.equal(got.body.title, 'developer', 'the token route reads the WORN title off the row - a `title` in the body is not a request anybody answers');
  const r = await verifyToken(got.body.token, pub, { subtle, nowS: Math.floor(Date.now() / 1000) });
  assert.ok(r.ok, r.why);
  assert.equal(r.claims.t, 'developer');
  assert.ok(r.claims.g.includes('dev'));

  // THE BADGE LAPSES ON THE NEXT TOKEN, with no cron and no column to
  // clear: take the role off the account and both halves of the
  // developer grant are gone from what gets signed. The worn title
  // survives in the column and simply stops being worn.
  await env.DB.prepare('UPDATE players SET staff_admin = 0 WHERE id = ?').bind(me.id).run();
  const after = await call('POST', '/v1/auth/token', { secret: me.secret });
  assert.equal(after.body.title, null);
  assert.deepEqual(after.body.glyphs, [], 'the dev glyph went with the grant');
  const r2 = await verifyToken(after.body.token, pub, { subtle, nowS: Math.floor(Date.now() / 1000) });
  assert.ok(r2.ok);
  assert.equal('t' in r2.claims, false, 'a badge nobody holds is not signed for at all');
});

test('ACC3: a guest gets a token and no badge - the wall for a title is the same one the saves have', async () => {
  const { call } = await stand({ admins: ['mack'] });
  const guest = (await call('POST', '/v1/auth/guest', { ...ACCEPTED })).body;
  const seen = (await call('GET', '/v1/account', undefined, guest.secret)).body;
  assert.deepEqual(seen.wardrobe.titles, [], 'a guest holds no title');
  // ...BUT THE SPROUT IS NOT A TITLE. It is true of a new account, and
  // a guest account is as new as any other, so it is there.
  assert.deepEqual(seen.wardrobe.glyphs, ['sprout']);
  const got = await call('POST', '/v1/auth/token', { secret: guest.secret });
  assert.equal(got.body.title, null);
  assert.deepEqual(got.body.glyphs, ['sprout']);
  assert.equal((await call('POST', '/v1/account/title', { title: 'founder' }, guest.secret)).status, 403);
});

// ── THE WIRE, and the relay ─────────────────────────────────────────

test('ACC3: `badged` OMITS what is not there rather than nulling it, at every row the relay builds', () => {
  assert.deepEqual(badged({ id: 'a' }, {}), { id: 'a' });
  assert.deepEqual(badged({ id: 'a' }, { title: null, glyphs: [] }), { id: 'a' }, 'an empty list is no badge, not an empty badge');
  assert.deepEqual(badged({ id: 'a' }, { title: 'founder', glyphs: ['sprout'] }), { id: 'a', title: 'founder', glyphs: ['sprout'] });
  // MOST PLAYERS WEAR NOTHING, so `"title":null` on every row of a
  // 64-peer welcome is bytes paid for saying nothing - and a reader
  // that must tell "no title" from "this build has no such key" has
  // two answers where one will do.
  const roster = rosterFor([
    { id: 'peer-0001', name: 'One', look: {}, pose: null, title: 'founder', glyphs: ['dev'] },
    { id: 'peer-0002', name: 'Two', look: {}, pose: null },
  ], 'me');
  assert.equal(roster[0].title, 'founder');
  assert.deepEqual(roster[0].glyphs, ['dev']);
  assert.equal('title' in roster[1], false);
  assert.equal('glyphs' in roster[1], false);
});

test('ACC3: the relay reads the badge OUT of the verified token - a hello that types one gets nothing (mutant: the frame\'s own field believed)', async () => {
  const r = fakeRoom('town:m9');
  const a = r.connect(), b = r.connect();
  await r.hello(a, 'peer-0001', null, { title: 'founder', glyphs: ['sprout'] });
  await r.hello(b, 'peer-0002');

  // b's welcome names a, badged.
  const welcome = b.sent.find((m) => m.t === 'welcome');
  const seen = welcome.peers.find((p) => p.id === 'peer-0001');
  assert.equal(seen.title, 'founder');
  assert.deepEqual(seen.glyphs, ['sprout']);
  // ...and b, who minted no badge, is on a's join with neither key.
  const join = a.sent.find((m) => m.t === 'join' && m.id === 'peer-0002');
  assert.equal('title' in join, false);
  assert.equal('glyphs' in join, false);

  // THE FRAME'S OWN FIELD IS NOT A BADGE. This hello signs nothing and
  // types both - which is the whole attack, and it is the one ACC1g
  // shut on the name one slice ago.
  const c = r.connect();
  await r.hello(c, 'peer-0003', null, { tok: await r.token('peer-0003', { n: 'peer-0003' }) });
  await r.room.webSocketMessage(c, JSON.stringify({ t: 'pose', p: null }));
  const liar = a.sent.find((m) => m.t === 'join' && m.id === 'peer-0003');
  assert.equal('title' in liar, false, 'a client never asserts a title - it is read out of the signature or it is not there');
});

test('ACC3: the badge rides the channel roster and the `who` answer too - the one peer that arrived unbadged while everybody else was badged is the shape ACC1d-MARK was retired for', async () => {
  const chat = fakeRoom('chat:world');
  const a = chat.connect(), b = chat.connect();
  await chat.hello(a, 'peer-0001', null, { title: 'developer', glyphs: ['dev'] });
  await chat.hello(b, 'peer-0002');
  const named = b.sent.find((m) => m.t === 'welcome').peers.find((p) => p.id === 'peer-0001');
  assert.equal(named.title, 'developer');
  assert.deepEqual(named.glyphs, ['dev']);
  const cj = a.sent.find((m) => m.t === 'join' && m.id === 'peer-0002');
  assert.equal('title' in cj, false);

  // THE `who` ANSWER: a stranger beyond the welcome's roster, asked
  // for by name, arrives as a join - and it is built by hand rather
  // than by `rosterFor`, which is exactly how one row comes to be the
  // only unbadged one in the room.
  const place = fakeRoom('town:m11');
  const x = place.connect(), y = place.connect();
  await place.hello(x, 'peer-0011', null, { title: 'founder' });
  await place.hello(y, 'peer-0012');
  y.sent.length = 0;
  await place.room.webSocketMessage(y, JSON.stringify({ t: 'who', id: 'peer-0011' }));
  const answer = y.sent.find((m) => m.t === 'join' && m.id === 'peer-0011');
  assert.ok(answer, 'the room answered');
  assert.equal(answer.title, 'founder');
});
