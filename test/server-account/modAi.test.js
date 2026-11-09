// The shipped configuration sends no chat to Anthropic and no feed or order to another server (decision #118 A5;
// server feature audit, PR 2). Each test reads the [vars] of a wrangler.toml as a deploy reads them and runs the code
// with those values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'smol-toml';

import { modAiModeOf, modAiOn, MESSAGES_URL } from '../../server-account/src/modAi.js';
import { safetyMinute } from '../../server-account/src/safetyClock.js';
import { pushLaw } from '../../server-account/src/sanctions.js';
import { mintStamp } from '../../src/net/safety/chatStamp.js';
import { FEED_SIG_HEADER, sealFeed } from '../../src/net/safety/chatFeed.js';
import { SAFE_LAW_PATH } from '../../src/net/wire.js';
import { standService } from '../accountDb.mjs';

const subtle = globalThis.crypto.subtle;
/** The [vars] of a wrangler.toml, as a deploy reads them. @param {string} path @returns {Record<string, string>} */
const varsOf = (path) =>
  /** @type {any} */ (parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))).vars;
const accountVars = varsOf('server-account/wrangler.toml');
const relayVars = varsOf('server/wrangler.toml');

// The relay's feed doors: each is posted through the ACCOUNTS binding, which reads only the path.
const RELAY_FEEDS = ['MOD_FEED_URL', 'GRANT_FEED_URL', 'HIDDEN_SEEN_URL'];

test('the shipped reviewer is off even when an operator adds an Anthropic key', () => {
  const env = { ...accountVars, ANTHROPIC_API_KEY: 'sk-test' };
  assert.equal(modAiModeOf(env), 'off');
  assert.equal(modAiOn(env), false);
});

test('with the shipped vars and a key, a reported line and the relay feed never reach the Messages API', async () => {
  const s = await standService({ ...accountVars, ANTHROPIC_API_KEY: 'sk-test' });
  const sylvia = await s.registered('Sylvia');
  const troll = await s.registered('Troll');
  const line = { tab: 'world', sub: troll.id, name: 'Troll', at: Date.now(), text: 'a rude line' };
  const stamped = { ...line, sg: await mintStamp(line, s.gatePriv, { subtle }) };
  const filed = await s.call(
    '/v1/safety/report',
    { target: troll.id, reason: 'hate', lines: [stamped] },
    sylvia.secret,
  );
  assert.ok(filed.body.case, 'the report is still kept as a case for the moderators');

  const sealed = await sealFeed({ id: '00112233445566aa', at: Date.now(), lines: [line] }, s.gatePriv, { subtle });
  const fed = await s.fetch('https://accounts.invalid/v1/mod/feed', {
    method: 'POST',
    headers: { [FEED_SIG_HEADER]: sealed.sig },
    body: sealed.body,
  });
  assert.deepEqual(await fed.json(), { ok: true, read: false }, 'the feed is dropped unread');

  /** @type {string[]} */
  const asked = [];
  const fetchFn = async (/** @type {string} */ url) => {
    asked.push(String(url));
    return Response.json({});
  };
  await safetyMinute({ db: s.env.DB, nowS: Math.floor(Date.now() / 1000), rand: () => {} }, s.env, { fetchFn });
  assert.equal(asked.filter((u) => u === MESSAGES_URL).length, 0);
});

test('every shipped feed and law URL names a reserved host that never resolves, and keeps its service path', () => {
  for (const key of RELAY_FEEDS) {
    const url = new URL(relayVars[key]);
    assert.equal(url.hostname, 'accounts.invalid', key);
  }
  assert.equal(new URL(relayVars.MOD_FEED_URL).pathname, '/v1/mod/feed');
  assert.equal(new URL(accountVars.RELAY_LAW_URL).hostname, 'relay.invalid');
});

test('the shipped law URL still carries an order through the RELAY binding, and never to the network', async () => {
  /** @type {string[]} */
  const bound = [];
  const env = {
    ...accountVars,
    RELAY: {
      fetch: async (/** @type {Request} */ req) => {
        bound.push(new URL(req.url).pathname);
        return Response.json({ ok: true });
      },
    },
  };
  const fetchFn = async () => {
    throw new Error('no network fetch is expected');
  };
  assert.equal(await pushLaw(env, fetchFn, 'order'), true);
  assert.deepEqual(bound, [SAFE_LAW_PATH]);
});
