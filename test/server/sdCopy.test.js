// The walk of the shared Hours is limited per account, with a high per-address backstop; a missing address is no bypass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sdOpenDoor,
  sdOpenAcctGate,
  sdOpenAddrGate,
  SD_OPEN_ACCT_BURST,
  SD_OPEN_ADDR_BURST,
  SD_OPEN_CLIENTS_MAX,
} from '../../server/src/sdCopy.js';
import { mintToken } from '../../src/net/identityToken.js';

const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const tokenOf = (s) =>
  mintToken({ s, n: 'Walker', k: 'guest' }, kp.privateKey, {
    subtle: crypto.subtle,
    nowS: Math.floor(Date.now() / 1000),
  });
const env = {
  ROOMS: {
    idFromName: (n) => n,
    get: () => ({ fetch: async () => new Response(JSON.stringify({ has: false, open: true })) }),
  },
};
const url = new URL('https://relay.test/sd/open?s=4&o=0123456789abcdef');

test('an account gets a burst of walks, then a slow trickle; another account is unaffected; the map stays bounded', () => {
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < SD_OPEN_ACCT_BURST; i++) assert.equal(sdOpenAcctGate('acct-a', t0), true, `walk ${i + 1}`);
  assert.equal(sdOpenAcctGate('acct-a', t0), false, 'the burst is spent');
  assert.equal(sdOpenAcctGate('acct-b', t0), true, 'another account');
  assert.equal(sdOpenAcctGate('acct-a', t0 + 2100), true, 'two seconds later');
  for (let i = 0; i < SD_OPEN_CLIENTS_MAX + 10; i++) sdOpenAcctGate(`acct-${i}`, t0);
  assert.equal(sdOpenAcctGate('acct-a', t0 + 2200), true, 'an account forgotten by the bound starts fresh');
});

test('players behind one shared address each walk; only a flood from the address is stopped', async () => {
  const ip = '203.0.113.50';
  for (let i = 0; i < 30; i++) {
    const res = await sdOpenDoor(env, url, { ip, tok: await tokenOf(`acct-home-${i}`), key: kp.publicKey });
    assert.equal(res.status, 200, `player ${i + 1} behind the address`);
  }
  const t0 = Date.now();
  for (let i = 0; i < SD_OPEN_ADDR_BURST; i++) sdOpenAddrGate('198.51.100.1', t0);
  const res = await sdOpenDoor(env, url, { ip: '198.51.100.1', tok: await tokenOf('acct-flood'), key: kp.publicKey });
  assert.equal(res.status, 429, 'the flood backstop');
});

test('with no address the account limit still applies', async () => {
  const tok = await tokenOf('acct-noaddr');
  const codes = [];
  for (let i = 0; i < SD_OPEN_ACCT_BURST + 2; i++)
    codes.push((await sdOpenDoor(env, url, { tok, key: kp.publicKey })).status);
  assert.deepEqual([codes[0], codes.at(-1)], [200, 429]);
});
