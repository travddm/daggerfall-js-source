// RENOWN4: MY OWN RENOWN ON
// MY OWN HUD. The row's law (ui/hud/hudRenown.js renownHudView): the box, the bar only for a total that is the level's, the
// fill the service's credit, the ghost what is earned and not yet answered - never past the level's end - and the
// words. The service's mint answers the track's total beside the token (acct13 - acct11, then acct12, on its branch; main's WB5b took acct11 first and BASE-HIDE acct12) and the minter hands it on; a report's
// answer carries it through the one pure plan (renownAnswer); the page adopts it only upward, before the level, and
// hands the HUD a getter only online; the HUD draws the row under the vitals, as wide as them, written only on change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../../server-account/src/index.js';
import { _resetKeyForTests } from '../../server-account/src/signing.js';
import { ACCOUNT_VERSION } from '../../server-account/src/service.js';
import { renownXpFor, RENOWN_XP_MAX } from '../../src/net/renown.js';
import { renownAnswer } from '../../src/net/renownTracker.js';
import { accountTokenMinter, SESSION_KEY } from '../../src/net/accountClient.js';
import { renownHudView, setHudRenown, hudRenown } from '../../src/ui/hud/hudRenown.js';
import { ACCEPTED } from '../../src/net/legalLaw.js';   // TERMS1: a request that makes an account carries the versions ticked
import { r2, seatRealm } from '../realmSeat.mjs';   // INT16: a Renown report is a progression claim, asked of the account's seated realm character

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const { subtle } = globalThis.crypto;
const MIGRATIONS = readdirSync(new URL('../../server-account/migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of MIGRATIONS) db.exec(src(`server-account/migrations/${f}`));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
        _rows() { return stmt.all(...args); },
      };
      return api;
    },
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((st) => ({ results: st._rows() })); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const T0 = 1_800_000_000;
async function stand() {
  _resetKeyForTests();
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey))).toString('base64');
  const env = { DB: d1(), SAVES: r2(), IDENTITY_PRIVATE_KEY: pkcs8, ACCOUNT_VERSION: 'test1', ALLOWED_ORIGIN: '*' };   // INT16: SAVES, so the reporter seats a realm character
  const call = async (method, path, body, bearer = null) => {
    const res = await worker.fetch(new Request(`https://accounts.invalid${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  call.env = env;   // INT16: the env a realm character is seated in
  return call;
}

// ── THE ROW'S LAW ───────────────────────────────────────────────────

test('RENOWN4 the row: none without a level; the box alone while the total is unknown or is not that level\'s; the fill the credit into the level, the ghost what is earned and unanswered after it and never past the level\'s end; the cap a full bar; UI3 the words in the bar - the credit into the level over the level\'s span, "Highest" at the cap, none without a bar (mutants: the bar drawn from another level\'s total; the ghost unclamped; the ghost from a negative pending; the words the track\'s total; the words with the pending in them; the cap\'s row with a need of 0 divided)', () => {
  assert.equal(renownHudView(null, 6000), null, 'offline, and online before a token says: no row');
  assert.equal(renownHudView(0, 0), null);
  assert.equal(renownHudView(51, 0), null, 'past the cap is no level');
  assert.equal(renownHudView(10.5, 6000), null);
  // the box alone
  assert.deepEqual(renownHudView(10, null), { level: 10, bar: false, frac: 0, ghost: 0, text: '' }, 'a service before acct13: the level, no total yet');
  assert.equal(renownHudView(10, renownXpFor(10) - 1).bar, false, 'a total a level behind is one the service has moved on from');
  assert.equal(renownHudView(10, renownXpFor(11)).bar, false, 'and one a level ahead is not this level\'s either');
  assert.equal(renownHudView(10, -5).bar, false);
  assert.equal(renownHudView(10, 6000.5).bar, false);
  // Renown 10 spans 5,510 to 7,660: 6,000 is 490 of its 2,150
  const v = renownHudView(10, 6000);
  assert.deepEqual([v.level, v.bar, v.ghost], [10, true, 0]);
  assert.deepEqual(Object.keys(v).sort(), ['bar', 'frac', 'ghost', 'level', 'text']);
  assert.equal(v.text, '490 / 2,150 XP', 'UI3: the words in the bar - the level\'s credit over its span, never the track\'s total');
  assert.equal(renownHudView(10, 6000, 1000).text, '490 / 2,150 XP', 'the credit alone: what is not yet answered is the ghost\'s to say');
  assert.equal(renownHudView(20, renownXpFor(20) + 5420).text, `5,420 / ${(renownXpFor(21) - renownXpFor(20)).toLocaleString('en-US')} XP`, 'thousands marked');
  assert.ok(Math.abs(v.frac - 490 / 2150) < 1e-12);
  assert.ok(Math.abs(renownHudView(10, 6000, 1000).ghost - 1000 / 2150) < 1e-12, 'what is earned and unanswered, after the fill');
  assert.ok(Math.abs(renownHudView(10, 6000, 5000).ghost - (1 - 490 / 2150)) < 1e-12, 'never past the level\'s end');
  assert.equal(renownHudView(10, 6000, -40).ghost, 0, 'nothing earned is nothing drawn');
  assert.equal(renownHudView(10, 6000, Number.NaN).ghost, 0);
  assert.equal(renownHudView(10, renownXpFor(10)).frac, 0, 'the level\'s first unit');
  assert.equal(renownHudView(1, 0, 40).frac, 0);
  assert.ok(Math.abs(renownHudView(1, 0, 40).ghost - 0.4) < 1e-12);
  // the cap
  assert.deepEqual(renownHudView(50, RENOWN_XP_MAX, 900), { level: 50, bar: true, frac: 1, ghost: 0, text: 'Highest' });
  assert.deepEqual(renownHudView(50, RENOWN_XP_MAX), { level: 50, bar: true, frac: 1, ghost: 0, text: 'Highest' }, 'the cap divides nothing: with nothing pending the ghost is 0, never 0 / 0');
  const short = renownHudView(49, renownXpFor(50) - 1);
  assert.ok(short.bar && Math.abs(short.frac - 175749 / 175750) < 1e-12, 'a level short of the cap still counts');
  assert.equal(short.text, '175,749 / 175,750 XP', 'and says so - the longest words the bar ever holds');
});

test('RENOWN4 the source: the page\'s getter read each frame - none set, none drawn; a getter answering null (offline) is no row; one that throws costs its row and never the frame (mutants: a throw carried into the frame; the pending unread)', () => {
  setHudRenown(null);
  assert.equal(hudRenown(), null);
  setHudRenown(() => null);
  assert.equal(hudRenown(), null);
  setHudRenown(() => ({ level: 10, xp: 6000, pending: 1000 }));
  assert.ok(Math.abs(hudRenown().ghost - 1000 / 2150) < 1e-12);
  setHudRenown(() => ({ level: 10, xp: 6000 }));
  assert.equal(hudRenown().ghost, 0, 'no pending, no ghost');
  setHudRenown(() => { throw new Error('boom'); });
  assert.equal(hudRenown(), null);
  setHudRenown('not a function');
  assert.equal(hudRenown(), null);
  setHudRenown(null);
});

// ── WHERE THE TOTAL COMES FROM ──────────────────────────────────────

test('RENOWN4 the service: the mint answers the named character\'s track total beside its level (RENOWN-CHAR: the character\'s again, where RENOWN-ACCOUNT made it the account\'s) - 0 before it earns, the total after - and none for a mint naming no character; the token itself carries no total; acct13 (mutants: the total dropped; a total for no character; a new character\'s total not 0)', async (t) => {
  t.mock.method(Date, 'now', () => T0 * 1000);
  const call = await stand();
  const me = (await call('POST', '/v1/auth/guest', { ...ACCEPTED })).body;
  // INT16 (Integrity-Arc section 7): a report is asked of the account's SEATED realm character - the guest seats one (A)
  const A = (await seatRealm(call.env, me.secret, 'Ann')).id;
  assert.deepEqual(await call('POST', '/v1/renown/xp', { character: 'char-aaaa', xp: 5000 }, me.secret), { status: 403, body: { error: 'progress-seat' } }, 'INT16: an offline id earns nothing');
  let tok = (await call('POST', '/v1/auth/token', { character: A }, me.secret)).body;
  assert.deepEqual([tok.level, tok.xp], [1, 0], 'a character that earned nothing: Renown 1, no XP');
  assert.equal((await call('POST', '/v1/renown/xp', { character: A, xp: 5000 }, me.secret)).status, 200);
  assert.equal((await call('POST', '/v1/renown/xp', { character: A, xp: 1000 }, me.secret)).status, 200);
  tok = (await call('POST', '/v1/auth/token', { character: A }, me.secret)).body;
  assert.deepEqual([tok.level, tok.xp], [10, 6000]);
  const claims = JSON.parse(Buffer.from(tok.token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.lv, 10);
  assert.equal('xp' in claims, false, 'a room needs the level, never the total');
  tok = (await call('POST', '/v1/auth/token', {}, me.secret)).body;
  assert.deepEqual([tok.level, tok.xp], [null, null], 'an older build\'s mint names no character, and has neither');
  tok = (await call('POST', '/v1/auth/token', { character: 'char-bbbb' }, me.secret)).body;
  assert.deepEqual([tok.level, tok.xp], [1, 0], 'another character is its own track (RENOWN-CHAR - RENOWN-ACCOUNT stood it at the account\'s)');
  assert.equal(ACCOUNT_VERSION, 'acct207');
  assert.match(src('server-account/wrangler.toml'), /ACCOUNT_VERSION = "acct207"/);
});

test('RENOWN4 the client: the minter hands the total on beside the level - null for none, a fraction or a negative; a report\'s answer carries it through renownAnswer (mutants: the total dropped by the minter; a bad total taken; the answer\'s total dropped)', async () => {
  let answer = { token: 'v1.t.s', name: 'Mac', kind: 'guest', title: null, glyphs: [], level: 10, xp: 6000 };
  const fetch = async () => ({ ok: true, status: 200, json: async () => answer });
  const m = new Map([[SESSION_KEY, JSON.stringify({ id: 'p_me', name: 'Mac', kind: 'guest', sessionId: 's1', secret: 'SECRETSECRETSECRETSECRET' })]]);
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const issued = [];
  const mint = accountTokenMinter({ fetch, storage, onIssued: (w) => issued.push(w), character: () => 'char-aaaa' });
  assert.equal(await mint(), 'v1.t.s');
  assert.deepEqual([issued[0].level, issued[0].xp], [10, 6000]);
  for (const xp of [undefined, null, -1, 1.5, '6000']) {
    answer = { ...answer, xp };
    await mint();
    assert.equal(issued.at(-1).xp, null, `a total of ${String(xp)} is none`);
  }
  answer = { ...answer, xp: 0 };
  await mint();
  assert.equal(issued.at(-1).xp, 0, 'a character that earned nothing has a total: 0');
  assert.equal(renownAnswer({ level: 10, xp: 6000, credited: 100 }, 100, 10).xp, 6000);
  assert.equal(renownAnswer({ level: 10, credited: 100 }, 100, 10).xp, null);
  assert.equal(renownAnswer({ level: 10, xp: '6000', credited: 100 }, 100, 10).xp, null);
  assert.equal(renownAnswer({ level: 10, xp: -1, credited: 100 }, 100, 10).xp, null);
});

// ── THE HUD ─────────────────────────────────────────────────────────

const mkEl = () => ({
  className: '', textContent: '', id: '', rel: '', href: '', src: '', alt: '', children: [], dataset: {},
  style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } },
  classList: {
    _s: new Set(),
    add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); },
    toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); },
  },
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); },
  getAttribute(k) { return this.attrs[k]; },
  removeAttribute(a) { delete this.attrs[a]; this[a] = ''; }, remove() {},
  append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
  replaceChildren(...c) { this.children = c; }, addEventListener(type, fn) { (this._on ??= {})[type] = fn; },
});
const find = (node, cls) => {
  if (String(node.className ?? '').split(/\s+/).includes(cls)) return node;
  for (const c of node.children ?? []) { const got = find(c, cls); if (got) return got; }
  return null;
};

test('RENOWN4 the HUD, executed: the row hangs under the vitals - the foot\'s last row (UI3) - and is off until the page has a Renown; the box, then the bar - the fill, the ghost from the fill\'s end, the words in it (UI3) - and the box alone while the total is unknown; a getter taken away takes the row (mutants: the row never lit; the ghost from the bar\'s start; the box\'s number stale; nobar never set; the words stale)', async () => {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: mkEl, createElementNS: (ns) => Object.assign(mkEl(), { ns }),
    getElementById: () => null, head: mkEl(), body: mkEl(),
  };
  const { drawEnhancedHud, destroyEnhancedHud } = await import('../../src/ui/enhanced/enhancedHud.js');
  const { clearQuickslots } = await import('../../src/systems/quickslots.js');
  clearQuickslots();
  const entity = { health: 40, maxHealth: 80, magicka: 0, maxMagicka: 10, fatigue: 100, items: [], equip: { slots: {} }, lightSource: null };
  try {
    setHudRenown(null);
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    const root = document.body.children.find((n) => n.className === 'hud');
    const bottom = find(root, 'hud-bottom');
    const row = find(root, 'hud-renown');
    const col = bottom.children.map((n) => n.className);
    assert.deepEqual(col, ['hud-hotdock', 'hud-breath', 'hud-breath hud-grip', 'hud-bars', 'hud-renown'], 'right under the vitals, and the foot ends there (UI3: the status row is the widget\'s tiles; CLIMB2: the grip beside the breath, above the vitals)');
    assert.equal(row.classList.contains('on'), false, 'offline: no row');
    let s = { level: 10, xp: 6000, pending: 1000 };
    setHudRenown(() => s);
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(row.classList.contains('on'), true);
    assert.equal(row.classList.contains('nobar'), false);
    assert.equal(find(row, 'hud-renownbox').textContent, '10');
    assert.equal(find(row, 'hud-fill').style.width, '22.8%');
    assert.equal(find(row, 'hud-renownghost').style.left, '22.8%', 'the ghost starts where the credit ends');
    assert.equal(find(row, 'hud-renownghost').style.width, '46.5%');
    assert.equal(find(row, 'hud-renownnum').textContent, '490 / 2,150 XP', 'UI3: the XP in the bar');
    // the report lands: the ghost turns solid, and the level rises
    s = { level: 11, xp: 7700, pending: 0 };
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(find(row, 'hud-renownbox').textContent, '11');
    assert.equal(find(row, 'hud-renownghost').style.width, '0.0%');
    assert.equal(find(row, 'hud-renownnum').textContent, `${7700 - renownXpFor(11)} / ${(renownXpFor(12) - renownXpFor(11)).toLocaleString('en-US')} XP`, 'and the words follow it');
    // a level without a total: the box alone
    s = { level: 12, xp: 7700 };
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(row.classList.contains('nobar'), true);
    assert.equal(find(row, 'hud-renownbox').textContent, '12');
    s = { level: 12, xp: renownXpFor(12) };
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(row.classList.contains('nobar'), false, 'and the bar again once the total is the level\'s');
    setHudRenown(null);
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(row.classList.contains('on'), false);
  } finally {
    destroyEnhancedHud();
    clearQuickslots();
    setHudRenown(null);
    globalThis.document = prev;
  }
});

