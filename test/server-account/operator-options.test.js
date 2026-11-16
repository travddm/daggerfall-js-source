// The operator's options (server-account/src/operator-options.ts): with the OPERATOR_OPTIONS that
// server-account/wrangler.toml ships, every staff tool route answers `option-off`, the relay's staff feeds are dropped,
// no hidden token is minted and a realm checkpoint takes no census; with an option named, its tool answers again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';
import worker from '../../server-account/src/index.js';
import { OPERATOR_OPTIONS, operatorOption } from '../../server-account/src/operator-options.ts';
import { staffWords, STAFF_SESSION_HEADER } from '../../server-account/src/staff.js';
import { CENSUS_ROUTES } from '../../server-account/src/staffCensus.js';
import { ECON_ROUTES } from '../../server-account/src/staffEconomy.js';
import { DESK_ROUTES } from '../../server-account/src/staffDesk.js';
import { STATUS_ROUTES } from '../../server-account/src/staffStatus.js';
import { FOLLOW_ROUTES } from '../../server-account/src/staffFollow.js';
import { NET_ROUTES, NET_FEED_PATH } from '../../server-account/src/staffNet.js';
import { MONSTER_ROUTES } from '../../server-account/src/staffMonsters.js';
import {
  REACTION_ROUTES,
  REACTION_FEED_PATH,
  _resetReactionsForTests,
} from '../../server-account/src/staffReactions.js';
import { HIDDEN_ROUTES, hiddenToken } from '../../server-account/src/staffHidden.js';
import { sealStaffFeed, NET_FEED_V, REACT_FEED_V, STAFF_FEED_SIG_HEADER } from '../../server/src/staffFeedLaw.js';
import { signingKey } from '../../server-account/src/signing.js';
import { standService } from '../accountDb.mjs';
import { seatRealm, freshSave } from '../realmSeat.mjs';

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const nowS = () => Math.floor(Date.now() / 1000);
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

/** The [vars] server-account/wrangler.toml ships. @type {Record<string, string>} */
const shipped = /** @type {any} */ (
  parse(readFileSync(new URL('../../server-account/wrangler.toml', import.meta.url), 'utf8'))
).vars;
/** The relay's [vars]. @type {Record<string, string>} */
const relayShipped = /** @type {any} */ (
  parse(readFileSync(new URL('../../server/wrangler.toml', import.meta.url), 'utf8'))
).vars;

/** One route of each option's tool, and the option it answers to. */
const GATED = [
  ['census', CENSUS_ROUTES[0]],
  ['economy', ECON_ROUTES[0]],
  ['desk', DESK_ROUTES[0]],
  ['status', STATUS_ROUTES[0]],
  ['follow', FOLLOW_ROUTES[0]],
  ['feeds', NET_ROUTES[0]],
  ['feeds', MONSTER_ROUTES[0]],
  ['botcheck', REACTION_ROUTES[0]],
  ['hidden', HIDDEN_ROUTES[0]],
  ['give', '/v1/staff/item/catalogue'],
];

/** An Owner signed in to the staff routes, as the panel signs in, on a service with `options`. */
async function stand(options) {
  _resetReactionsForTests();
  const pair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = b64url(new Uint8Array(await subtle.exportKey('raw', pair.publicKey)));
  const s = await standService({
    SEAT_ADMINS: 'Mira',
    SEAT_OWNERS: 'Mira',
    OWNER_KEYS: `Mira:${pub}`,
    OPERATOR_OPTIONS: options,
  });
  const call = async (path, body = {}, headers = {}) => {
    const res = await s.fetch(`https://accounts.invalid${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const mira = await s.registered('Mira');
  const ts = nowS();
  const sig = b64url(
    new Uint8Array(
      await subtle.sign({ name: 'Ed25519' }, pair.privateKey, enc.encode(staffWords('login', 'mira', ts))),
    ),
  );
  const login = await call('/v1/staff/login', { handle: 'Mira', password: 'a good long one', pub, ts, sig });
  assert.ok(login.body?.session, JSON.stringify(login.body));
  const staff = (path, body = {}) => call(path, body, { [STAFF_SESSION_HEADER]: login.body.session });
  /** A batch sealed as the relay seals it, posted to a feed door. */
  const feed = async (path, batch) => {
    const sealed = await sealStaffFeed(batch, s.gatePriv, { subtle });
    const res = await s.fetch(`https://accounts.invalid${path}`, {
      method: 'POST',
      headers: { [STAFF_FEED_SIG_HEADER]: sealed.sig },
      body: sealed.body,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { ...s, staff, feed, mira };
}

/** A batch as the relay's feeds send one, its row for account `a` (staffpanel5feeds.test.js shapes). */
const netBatch = (a) => ({
  v: NET_FEED_V,
  id: '00000000000000a1',
  at: Date.now(),
  from: Date.now() - 600_000,
  q: 'cell:12,40',
  ms: 1,
  net: [
    {
      a,
      n: 500,
      b: 50_000,
      p10: 450,
      pb10: 40_000,
      p60: 480,
      pb60: 45_000,
      k: [500, 0, 0, 0, 0, 0, 0],
      nr: 0,
      j: 0,
      c: 0,
    },
  ],
  foe: [],
});
const reactBatch = (a) => ({
  v: REACT_FEED_V,
  id: '00000000000000b1',
  at: Date.now(),
  q: 'cell:12,40',
  rows: [
    {
      a,
      k: 'enc',
      n: 2,
      t: Date.now() - 70_000,
      ms: 60_000,
      ps: 300,
      w0: 0,
      mv: 50,
      tn: 314,
      p1: 200,
      wd: 500,
      ac: 900,
      hk: 1500,
      hu: 4000,
    },
  ],
});

test('the shipped OPERATOR_OPTIONS turns every option off, and the relay ships its two staff feeds empty', () => {
  assert.equal(shipped.OPERATOR_OPTIONS, '');
  for (const name of OPERATOR_OPTIONS) assert.equal(operatorOption(shipped, name), false, name);
  assert.equal(relayShipped.STAFF_NET_FEED_URL, '');
  assert.equal(relayShipped.REACTION_FEED_URL, '');
  assert.equal(
    operatorOption({ OPERATOR_OPTIONS: ' Census , give' }, 'census'),
    true,
    'names are trimmed and case-folded',
  );
  assert.equal(operatorOption({ OPERATOR_OPTIONS: 'censuses' }, 'census'), false, 'a whole name only');
});

test('with the shipped options, every staff tool route answers option-off and runs nothing', async () => {
  const s = await stand(shipped.OPERATOR_OPTIONS);
  for (const [name, path] of GATED) {
    const r = await s.staff(path, {});
    assert.equal(r.status, 404, `${name}: ${path}`);
    assert.equal(r.body.error, 'option-off', `${name}: ${path}`);
  }
  assert.equal((await s.staff('/v1/staff/cases', {})).body?.error === 'option-off', false, 'moderation stays core');
});

test('with each option named, its route answers again', async () => {
  for (const [name, path] of GATED) {
    const s = await stand(name);
    const r = await s.staff(path, {});
    assert.notEqual(r.body?.error, 'option-off', `${name}: ${path}`);
  }
});

test('with the shipped options, the relay feeds are taken unread, no hidden token is minted, and a checkpoint takes no census', async () => {
  const off = await stand(shipped.OPERATOR_OPTIONS);
  const raw = off.env.DB._raw;
  assert.deepEqual((await off.feed(NET_FEED_PATH, netBatch(off.mira.id))).body, { ok: true, read: false });
  assert.deepEqual((await off.feed(REACTION_FEED_PATH, reactBatch(off.mira.id))).body, { ok: true, read: false });
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM staff_net_batches').get().n, 0);
  /** Mira's hidden token, her account set to hide as Hide me sets it. */
  const hidden = async (s) => {
    s.env.DB._raw.prepare('UPDATE players SET staff_hide_on = 1 WHERE id = ?').run(s.mira.id);
    const row = s.env.DB._raw.prepare('SELECT * FROM players WHERE id = ?').get(s.mira.id);
    return hiddenToken({ db: s.env.DB, subtle, nowS: nowS() }, s.env, row, await signingKey(s.env, subtle));
  };
  assert.equal(await hidden(off), null, 'no hidden token');
  assert.equal((await hidden(await stand('hidden')))?.hidden, 1, 'with the option on, the hidden token is minted');

  const on = await stand('feeds,census');
  assert.deepEqual((await on.feed(NET_FEED_PATH, netBatch(on.mira.id))).body, { ok: true, read: true });
  assert.equal(on.env.DB._raw.prepare('SELECT COUNT(*) AS n FROM staff_net_batches').get().n, 1);

  for (const [s, expect] of [
    [off, 0],
    [on, 1],
  ]) {
    const who = await s.registered('Cai');
    const R = await seatRealm(s.env, who.secret, 'cai');
    const at = R.at();
    const put = await worker.fetch(
      new Request(`https://accounts.invalid/v1/realm/${R.id}/data`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${who.secret}`,
          'x-realm-lease': at.lease,
          'x-realm-seq': String(at.seq + 1),
        },
        body: JSON.stringify(freshSave({ name: 'cai', goldPieces: 250 })),
      }),
      s.env,
    );
    assert.equal(put.status, 200);
    const n = s.env.DB._raw.prepare('SELECT COUNT(*) AS n FROM item_census WHERE char_id = ?').get(R.id).n;
    assert.equal(n, expect, expect ? 'the census tallies the checkpoint' : 'no census tally');
  }
});
