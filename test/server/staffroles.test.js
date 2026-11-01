// STAFF-ROLES-BY-ACCOUNT - Admin, Owner and Moderator are columns of the ACCOUNT (migration 0002), never a handle: a name the
// previous project's staff held grants nothing to whoever registers it, a role is granted and revoked by the roles above
// it, and every door that used to ask a handle list asks the row. Driven through the real Worker on the node:sqlite
// database every account pin stands on (test/accountDb.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { standService } from '../accountDb.mjs';
import { staffWords, STAFF_SESSION_HEADER } from '../../server-account/src/staff.js';
import { isDeveloper, canModerate, isOwner } from '../../server-account/src/titles.js';
import { isReportReader } from '../../server-account/src/reports.js';
import { poiRolesOf } from '../../server-account/src/poi.js';
import { festivalOpenFor } from '../../server-account/src/festival.js';
import { STAFF_ROUTES } from '../../server-account/src/service.js';
import { verifyToken } from '../../src/net/identityToken.js';
import { ROLE_COLUMNS, statementsFor } from '../../tools/staffRole.mjs';

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const nowS = () => Math.floor(Date.now() / 1000);
const PASSWORD = 'a good long one';
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** The names the previous project's staff held, as the config listed them. */
const FORMER = ['Lattymoy', 'LostMyLeg', 'Tabby', 'RookieG', 'Roderic', 'SirMcMobdon', 'kpblca_1', 'Asynian', 'tabbyvish', 'Starempire42'];

async function extensionKey() {
  const pair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = b64url(new Uint8Array(await subtle.exportKey('raw', pair.publicKey)));
  let last = 0;
  const proof = async (what, handle, ts = Math.max(nowS(), last + 1)) => {
    last = Math.max(last, ts);
    const sig = b64url(new Uint8Array(await subtle.sign({ name: 'Ed25519' }, pair.privateKey, enc.encode(staffWords(what, handle.toLowerCase(), ts)))));
    return { pub, ts, sig };
  };
  return { pub, proof };
}

/** The Worker with no role listed anywhere. `signIn(handle)` makes the account a panel member as an Owner's invite does. */
async function stand(extra = {}) {
  const ownerKey = await extensionKey();
  const s = await standService({ OWNER_KEYS: `Boss:${ownerKey.pub}`, ...extra });
  const staff = async (path, body = {}, token = null) => {
    const res = await s.fetch(`https://accounts.invalid${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1', ...(token ? { [STAFF_SESSION_HEADER]: token } : {}) }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const raw = s.env.DB._raw;
  const row = (handle) => raw.prepare('SELECT * FROM players WHERE handle_lc = ?').get(handle.toLowerCase());
  const boss = await s.registered('Boss');
  s.setStaff('Boss', 'owner');
  const bossIn = (await staff('/v1/staff/login', { handle: 'Boss', password: PASSWORD, ...(await ownerKey.proof('login', 'Boss')) })).body;
  assert.ok(bossIn.session, JSON.stringify(bossIn));
  /** Register `handle`, give it `role` as the boss would, and enrol a key with the boss's invite: its panel session. */
  const member = async (handle, role) => {
    await s.registered(handle);
    s.setStaff(handle, role);
    const inv = await staff('/v1/staff/invite', { handle }, bossIn.session);
    assert.equal(inv.status, 200, JSON.stringify(inv.body));
    const key = await extensionKey();
    const r = await staff('/v1/staff/enroll', { handle, password: PASSWORD, invite: inv.body.invite, ...(await key.proof('enroll', handle)) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.session;
  };
  return { ...s, raw, row, staff, boss, bossIn, member };
}

test('STAFF-ROLES: registering a name the former staff held grants nothing - no title, no glyph, no panel, no door', async () => {
  const s = await stand();
  assert.deepEqual(s.env.DEVELOPER_HANDLES ?? null, null, 'the stood service carries no list');
  for (const handle of FORMER) {
    const who = await s.registered(handle);
    const row = s.row(handle);
    assert.deepEqual([isDeveloper(row, s.env), canModerate(row, s.env), isOwner(row, s.env), isReportReader(row, s.env), poiRolesOf(row, s.env)],
      [false, false, false, false, { builder: false, approver: false }], `${handle}: no role`);
    const token = await s.call('/v1/auth/token', {}, who.secret);
    assert.equal(token.status, 200);
    const got = await verifyToken(token.body.token, s.identityPublic, { subtle, nowS: nowS() });
    assert.ok(got.ok, got.why);
    assert.deepEqual((got.claims.g ?? []).filter((g) => ['dev', 'mod', 'dm'].includes(g)), [], `${handle}: no staff glyph in the token`);
    const login = await s.staff('/v1/staff/login', { handle, password: PASSWORD, ...(await (await extensionKey()).proof('login', handle)) });
    assert.deepEqual([login.status, login.body], [401, { error: 'staff-login' }], `${handle}: no way into the panel`);
  }
});

test('STAFF-ROLES: each door that asked a handle list is refused without the role and allowed with it', async () => {
  const s = await stand({ FESTIVAL_OPEN: 'dev' });
  const troll = await s.registered('Troll');
  const victim = await s.registered('Victim');
  const plain = await s.registered('Plain');
  const mod = await s.registered('Heron');
  const adm = await s.registered('Kestrel');
  s.setStaff('Heron', 'moderator');
  s.setStaff('Kestrel', 'admin');
  const row = (h) => s.row(h);
  // the glyphs a token signs are the row's: dev for an Admin, mod for a Moderator, neither for a player
  const glyphsOf = async (who) => {
    const got = await verifyToken((await s.call('/v1/auth/token', {}, who.secret)).body.token, s.identityPublic, { subtle, nowS: nowS() });
    return (got.claims.g ?? []).filter((g) => ['dev', 'mod'].includes(g));
  };
  assert.deepEqual([await glyphsOf(plain), await glyphsOf(mod), await glyphsOf(adm)], [[], ['mod'], ['dev']]);
  // the Moderator's doors (sanctions.js canModerate)
  assert.deepEqual((await s.call('/v1/mod/mute', { target: victim.id, minutes: 30 }, plain.secret)).body, { error: 'not-moderator' }, 'a player cannot mute');
  assert.equal((await s.call('/v1/mod/mute', { target: victim.id, minutes: 30 }, mod.secret)).status, 200, 'a Moderator can');
  assert.equal((await s.call('/v1/mod/mute', { target: troll.id, minutes: 30 }, adm.secret)).status, 200, 'an Admin can');
  // the Admin's doors (market pull, the realm review, the realm holds: isDeveloper)
  assert.deepEqual((await s.call('/v1/market/remove', { listing: 'nothing' }, plain.secret)).body, { error: 'not-developer' });
  assert.deepEqual((await s.call('/v1/market/remove', { listing: 'nothing' }, mod.secret)).body, { error: 'not-developer' }, 'a Moderator is no Admin');
  assert.notEqual((await s.call('/v1/market/remove', { listing: 'nothing' }, adm.secret)).body?.error, 'not-developer', 'an Admin passes the gate');
  assert.deepEqual((await s.call('/v1/mod/realm-holds', {}, plain.secret)).body, { error: 'not-developer' });
  assert.notEqual((await s.call('/v1/mod/realm-holds', {}, adm.secret)).body?.error, 'not-developer');
  // the "dev" feature switch opens for Admins alone
  assert.deepEqual([festivalOpenFor(row('Plain'), s.env), festivalOpenFor(row('Heron'), s.env), festivalOpenFor(row('Kestrel'), s.env)], [false, false, true]);
  // the POI editor: an Admin builds, an Owner approves
  assert.deepEqual([poiRolesOf(row('Plain'), s.env), poiRolesOf(row('Kestrel'), s.env), poiRolesOf(row('Boss'), s.env)],
    [{ builder: false, approver: false }, { builder: true, approver: false }, { builder: true, approver: true }]);
  // the private reports: an Owner reads them, an Admin does not
  assert.deepEqual((await s.call('/v1/report/inbox', {}, adm.secret)).body, { error: 'not-report-reader' });
  assert.deepEqual([isReportReader(row('Kestrel'), s.env), isReportReader(row('Boss'), s.env)], [false, true]);
});

test('STAFF-ROLES: an Owner grants and revokes Admin; an Admin grants and revokes Moderator; a Moderator changes no role', async () => {
  const s = await stand();
  const modSession = await s.member('Heron', 'moderator');
  const target = await s.registered('Newcomer');
  // a Moderator: refused every role door, written to the audit log
  for (const [path, error] of [['/v1/staff/mod/add', 'staff-admin'], ['/v1/staff/mod/remove', 'staff-admin'], ['/v1/staff/admin/add', 'staff-owner'], ['/v1/staff/admin/remove', 'staff-owner']]) {
    assert.deepEqual((await s.staff(path, { handle: 'Newcomer' }, modSession)).body, { error }, `${path}: refused to a Moderator`);
  }
  assert.deepEqual([s.row('Newcomer').staff_mod, s.row('Newcomer').staff_admin], [0, 0]);
  // an Owner makes an Admin; the Admin makes and unmakes a Moderator
  assert.deepEqual((await s.staff('/v1/staff/admin/add', { handle: 'Newcomer' }, s.bossIn.session)).body, { ok: true, handle: 'Newcomer' });
  assert.equal(s.row('Newcomer').staff_admin, 1);
  assert.equal(isDeveloper(s.row('Newcomer'), s.env), true, 'the row is the role');
  assert.deepEqual((await s.staff('/v1/staff/admin/add', { handle: 'Newcomer' }, s.bossIn.session)).body, { error: 'staff-already' });
  const adminSession = await s.member('Kestrel', 'admin');
  await s.registered('Helper');
  assert.deepEqual((await s.staff('/v1/staff/mod/add', { handle: 'Helper' }, adminSession)).body, { ok: true, handle: 'Helper' });
  assert.equal(s.row('Helper').staff_mod, 1);
  assert.deepEqual((await s.staff('/v1/staff/mod/remove', { handle: 'Helper' }, adminSession)).body, { ok: true, handle: 'Helper' });
  assert.equal(s.row('Helper').staff_mod, 0);
  // an Admin who is no Owner grants no Admin, removes no Admin, and cannot touch the Owner
  assert.deepEqual((await s.staff('/v1/staff/admin/add', { handle: 'Helper' }, adminSession)).body, { error: 'staff-owner' });
  assert.deepEqual((await s.staff('/v1/staff/admin/remove', { handle: 'Boss' }, adminSession)).body, { error: 'staff-owner' });
  assert.equal(s.row('Boss').staff_admin, 1);
  // an Owner cannot be unmade over HTTP, even by another Owner, nor can it unmake itself
  await s.registered('Second');
  s.setStaff('Second', 'owner');
  assert.deepEqual((await s.staff('/v1/staff/admin/remove', { handle: 'Second' }, s.bossIn.session)).body, { error: 'staff-owner' });
  assert.deepEqual((await s.staff('/v1/staff/admin/remove', { handle: 'Boss' }, s.bossIn.session)).body, { error: 'staff-self' });
  // revoking an Admin ends its panel session and its role at once
  assert.deepEqual((await s.staff('/v1/staff/admin/remove', { handle: 'Kestrel' }, s.bossIn.session)).body, { ok: true, handle: 'Kestrel' });
  assert.equal(s.row('Kestrel').staff_admin, 0);
  assert.deepEqual((await s.staff('/v1/staff/me', {}, adminSession)).body, { error: 'staff-session' });
  void target;
  const log = s.raw.prepare("SELECT act, outcome FROM staff_audit WHERE act IN ('admin-add', 'admin-remove', 'mod-add', 'mod-remove') ORDER BY id").all().map((r) => `${r.act}:${r.outcome}`);
  assert.deepEqual(log, ['admin-add:ok', 'mod-add:ok', 'mod-remove:ok', 'admin-remove:ok']);
});

test('STAFF-ROLES: no HTTP route makes an Owner, and a player\'s own routes set no role', async () => {
  const s = await stand();
  const sneak = await s.registered('Sneak');
  for (const route of STAFF_ROUTES) assert.ok(!/owner/.test(route) || route === '/v1/staff/owner', route);   // no door is named for an Owner's grant
  assert.deepEqual((await s.staff('/v1/staff/admin/add', { handle: 'Sneak', staff_owner: 1 }, s.bossIn.session)).body, { ok: true, handle: 'Sneak' });
  assert.deepEqual([s.row('Sneak').staff_admin, s.row('Sneak').staff_owner], [1, 0], 'an extra field in the body sets nothing');
  // a game route with the role columns in its body changes nothing
  await s.call('/v1/auth/register', { handle: 'Other', password: PASSWORD, staff_admin: 1, staff_owner: 1 }, (await s.guest()).secret);
  const other = s.row('Other');
  assert.deepEqual([other?.staff_admin ?? 0, other?.staff_owner ?? 0], [0, 0]);
  void sneak;
});

test('STAFF-ROLES: Discord presses resolve through an account link, never a name', async () => {
  const s = await stand();
  const mod = await s.registered('DiscordMod');
  const decoy = await s.registered('Lattymoy');
  s.setStaff('DiscordMod', 'moderator');
  const ID = '128705730965536768';
  const press = async () => s.call('/v1/discord/interactions', {});   // not reachable without Discord's signature: the actor resolution is the unit below
  void press;
  const { discordInteraction } = await import('../../server-account/src/discord.js');
  const ctx = { db: s.env.DB, nowS: nowS(), subtle, rand: (b) => crypto.getRandomValues(b) };
  const ask = async () => (await discordInteraction(ctx, s.env, { type: 2, data: { name: 'mod' }, member: { user: { id: ID } } })).data.content;
  const refusal = /Only the game's moderators/;
  assert.match(await ask(), refusal, 'a Discord id nobody linked is refused');
  s.raw.prepare('INSERT INTO staff_discord (discord_id, player_id, created_at) VALUES (?, ?, ?)').run(ID, decoy.id, 1);
  assert.match(await ask(), refusal, 'linked to an account with no role: refused, whatever its name');
  s.raw.prepare('UPDATE staff_discord SET player_id = ? WHERE discord_id = ?').run(mod.id, ID);
  assert.doesNotMatch(await ask(), refusal, 'linked to a Moderator: let in');
  s.setStaff('DiscordMod', 'none');
  assert.match(await ask(), refusal, 'the role taken off takes the presses with it');
});

test('STAFF-ROLES: the operator\'s tool writes the role columns, the Discord link, and nothing else', () => {
  assert.deepEqual(ROLE_COLUMNS.owner, { staff_owner: 1, staff_admin: 1, staff_mod: 0 });
  assert.deepEqual(statementsFor(['set', 'abc12345', 'owner'], 0).sql[0], "UPDATE players SET staff_owner = 1, staff_admin = 1, staff_mod = 0 WHERE id = 'abc12345' AND handle IS NOT NULL");
  assert.ok('error' in statementsFor(['set', "x'; DROP TABLE players; --", 'owner'], 0), 'an id with a quote is refused');
  assert.ok('error' in statementsFor(['set', 'abc12345', 'god'], 0), 'an unknown role is refused');
  assert.ok('error' in statementsFor(['find', "a'b"], 0), 'a handle with a quote is refused');
  assert.ok('error' in statementsFor(['discord', 'abc12345', "1'"], 0));
  const toml = src('server-account/wrangler.toml');
  assert.doesNotMatch(toml, /^(DEVELOPER|MODERATOR|OWNER|BUILDER|APPROVER|REPORT_READER)_HANDLES\s*=/m, 'wrangler.toml lists no role');
  assert.doesNotMatch(toml, /^DISCORD_MODERATORS\s*=/m);
  assert.match(src('docs/operations/staff-roles.md'), /tools\/staffRole\.mjs/, 'the bootstrap is documented');
});
