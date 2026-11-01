// BROKER-RID (AUDIT FB1024, 2026-10-25) - THE BROKER'S SALES BY THEIR
// REQUEST IDS, on the service's side (server-account/src/brokerSales.js, `broker_sales`): a press with a request id writes
// it beside its sale, in its own batch; the same press asked again answers its sale; /v1/broker/settle answers the sale an
// id wrote - and which ask came first - or fences the id, so the press can never write after. A press without an id (a
// client before this one) sells as it always did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { standService } from '../accountDb.mjs';
import { ROUTES } from '../../server-account/src/service.js';
import { brokerRidOk } from '../../server-account/src/brokerSales.js';
import { INSIGNIA, BROKER_RID_RE, mintBrokerRid } from '../../src/net/insignia.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const AURA = INSIGNIA.find((o) => o.kind === 'aura');

async function stood(embers = 200) {
  const S = await standService({});
  const raw = S.env.DB._raw;
  const me = await S.registered('Seller');
  for (let i = 0; i < embers; i++) raw.prepare('INSERT INTO serpent_kills (day, account, boss, hull, char_id, xp, nonce, at, stones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(5001 + i, me.id, 'sethrakul', 4, me.character, 0, `s${i}`, Math.floor(Date.now() / 1000), 1);
  const spent = () => Number(raw.prepare('SELECT insignia_spent FROM players WHERE id = ?').get(me.id).insignia_spent);
  const rows = () => raw.prepare('SELECT rid, kind, item, settled, asked_by FROM broker_sales WHERE account = ? ORDER BY at, rid').all(me.id).map((r) => ({ ...r }));
  return { S, raw, me, spent, rows, call: (path, body) => S.call(path, body, me.secret) };
}

test('BROKER-RID the request id: `b` and fifteen to thirty-one of base 36, minted from crypto\'s randomness; the service reads it by the client\'s own law (mutants: any string an id)', () => {
  const rid = mintBrokerRid();
  assert.match(rid, /^b[a-z0-9]{15}$/);
  assert.notEqual(mintBrokerRid(), rid);
  for (const ok of [rid, 'b' + 'z'.repeat(31)]) assert.equal(brokerRidOk(ok), true, ok);
  for (const bad of ['', 'x' + 'a'.repeat(15), 'b' + 'a'.repeat(14), 'b' + 'a'.repeat(32), 'b' + 'A'.repeat(15), 'b' + 'a'.repeat(14) + ' ', null, 7]) assert.equal(brokerRidOk(bad), false, String(bad));
  assert.equal(String(BROKER_RID_RE), String(/^b[a-z0-9]{15,31}$/));
});

test('BROKER-RID THE SETTLE: the sale an id wrote answers `held`, its kind, its item and its FIRST ask\'s nonce, every time it is asked; an id with no row is fenced - a press of it landing late writes nothing; a guest and a bad id or nonce refused (mutants: no fence; the latest ask as `by`; a fence answered held)', async () => {
  const W = await stood();
  const rid = mintBrokerRid(), n1 = mintBrokerRid(), n2 = mintBrokerRid();
  await W.call('/v1/account/insignia', { item: AURA.id, rid });
  const first = await W.call('/v1/broker/settle', { rid, nonce: n1 });
  assert.deepEqual([first.status, first.body.held, first.body.kind, first.body.item, first.body.by], [200, true, 'insignia', AURA.id, n1]);
  assert.equal((await W.call('/v1/broker/settle', { rid, nonce: n2 })).body.by, n1, 'the first ask, whoever asks');
  // an id the service never wrote: fenced - and its press, landing late, writes nothing and spends nothing
  const ghost = mintBrokerRid(), ghost2 = mintBrokerRid();
  assert.deepEqual((await W.call('/v1/broker/settle', { rid: ghost, nonce: n1 })).body, { held: false });
  assert.deepEqual((await W.call('/v1/broker/settle', { rid: ghost, nonce: n2 })).body, { held: false }, 'a fence stays a fence');
  const W2 = await stood();
  assert.deepEqual((await W2.call('/v1/broker/settle', { rid: ghost, nonce: n1 })).body, { held: false });
  assert.deepEqual((await W2.call('/v1/broker/settle', { rid: ghost2, nonce: n1 })).body, { held: false });
  const lateIns = await W2.call('/v1/account/insignia', { item: AURA.id, rid: ghost2 });
  assert.deepEqual([lateIns.status, lateIns.body.error, W2.spent()], [409, 'fenced', 0]);
  // refused
  const g = await W.S.guest();
  assert.equal((await W.S.call('/v1/broker/settle', { rid, nonce: n1 }, g.secret)).status, 403);
  for (const body of [{ rid: 'x', nonce: n1 }, { rid, nonce: 'x' }, { rid }, {}]) assert.equal((await W.call('/v1/broker/settle', body)).status, 400, JSON.stringify(body));
  assert.ok(ROUTES.has('/v1/broker/settle'));
});

test('BROKER-RID THE INSIGNIA: a press with an id writes it; asked again, its sale again before `owned` (which its own sale made true); the settle carries the account\'s wardrobe (mutants: asked again refused owned; no wardrobe)', async () => {
  const W = await stood();
  const rid = mintBrokerRid();
  const sold = await W.call('/v1/account/insignia', { item: AURA.id, rid });
  assert.deepEqual([sold.status, sold.body.ok, sold.body.bought], [200, true, AURA.id]);
  const again = await W.call('/v1/account/insignia', { item: AURA.id, rid });
  assert.deepEqual([again.status, again.body.again, again.body.insignia], [200, true, [AURA.id]]);
  assert.equal(W.spent(), AURA.price, 'spent once');
  assert.deepEqual([(await W.call('/v1/account/insignia', { item: AURA.id, rid: mintBrokerRid() })).body.error], ['owned'], 'another press: owned');
  const st = (await W.call('/v1/broker/settle', { rid, nonce: mintBrokerRid() })).body;
  assert.deepEqual([st.held, st.kind, st.item, st.insignia], [true, 'insignia', AURA.id, [AURA.id]]);
  assert.equal((await W.call('/v1/account/insignia', { item: AURA.id, rid: 'nope' })).status, 400);
});

