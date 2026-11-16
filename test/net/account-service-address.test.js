// There is no built-in relay or account service. The player enters the relay's address, the relay's
// /profile names its account service, and the client remembers it; a developer's override still wins.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accountServiceOf,
  learnAccountService,
  learnedAccountService,
  needsAccountService,
  rememberAccountService,
  SERVICE_KEY,
} from '../../src/net/account-service-address.ts';
import { DEFAULT_ACCOUNT_SERVICE, serviceBase } from '../../src/net/accountClient.js';
import { DEFAULT_SERVER } from '../../src/net/online.js';
import { accountServiceOfEnv, relayFactsAnswer } from '../../server/src/relayFacts.ts';
import { openProfileDoor } from '../../src/systems/online/profileDoor.ts';
import { _resetProfileForTests } from '../../src/systems/online/serverProfile.ts';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import { profileHashOf } from '../../src/net/profile/profileHash.ts';
import { RELAY_VERSION } from '../../src/net/wire.js';

const RELAY = 'wss://relay.example';
const SERVICE = 'https://accounts.example';

function memoryStore() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), map };
}
const params = (search) => new URLSearchParams(search);

test('the client has no built-in relay or account service', () => {
  assert.equal(DEFAULT_SERVER, '');
  assert.equal(DEFAULT_ACCOUNT_SERVICE, '');
  assert.equal(serviceBase(memoryStore()), '', 'nothing learned, no override: no service');
});

test('the lookup: a developer override, then what the relay said, then nothing; only https is kept', () => {
  const store = memoryStore();
  assert.equal(accountServiceOf(store), '');
  assert.equal(rememberAccountService(store, RELAY, 'http://accounts.example'), false, 'not https: not stored');
  assert.equal(rememberAccountService(store, RELAY, null), false);
  assert.equal(accountServiceOf(store), '');
  assert.equal(rememberAccountService(store, RELAY, SERVICE), true);
  assert.deepEqual(learnedAccountService(store), { relay: RELAY, accounts: SERVICE });
  assert.equal(serviceBase(store), SERVICE);
  store.setItem(SERVICE_KEY, 'https://dev.example');
  assert.equal(serviceBase(store), 'https://dev.example', 'the override wins');
});

test('a relay that names no service clears the one an earlier relay named', () => {
  const store = memoryStore();
  rememberAccountService(store, RELAY, SERVICE);
  assert.equal(rememberAccountService(store, 'wss://other.example', null), false);
  assert.equal(learnedAccountService(store), null);
  assert.equal(serviceBase(store), '', "the earlier relay's service does not serve the new one");
});

test('the menu asks a relay only when nothing was learned from it, and remembers its answer', async () => {
  const store = memoryStore();
  assert.equal(needsAccountService(store, RELAY), true);
  const asked = [];
  const answer =
    (body, ok = true) =>
    async (url) => {
      asked.push(url);
      return { ok, json: async () => body };
    };
  assert.equal(await learnAccountService('http://not-a-relay', store, answer({ accounts: SERVICE })), false);
  assert.equal(asked.length, 0, 'no relay address: nothing asked');
  assert.equal(await learnAccountService(RELAY, store, answer({ accounts: null })), false, 'a relay with no service');
  assert.equal(await learnAccountService(RELAY, store, answer({}, false)), false, 'a relay that refused');
  assert.equal(await learnAccountService(RELAY, store, answer({ accounts: SERVICE })), true);
  assert.equal(asked.at(-1), 'https://relay.example/profile');
  assert.equal(needsAccountService(store, RELAY), false, 'learned from this relay');
  assert.equal(needsAccountService(store, 'wss://other.example'), true, 'another relay is asked again');
  store.setItem(SERVICE_KEY, 'https://dev.example');
  assert.equal(needsAccountService(store, 'wss://other.example'), false, 'an override needs no asking');
});

test('the relay serves its account service beside the profile, from ACCOUNT_SERVICE_URL, and only an https one', async () => {
  assert.equal(accountServiceOfEnv({ ACCOUNT_SERVICE_URL: SERVICE }), SERVICE);
  for (const bad of ['', 'http://accounts.example', 'accounts.example', undefined, 7])
    assert.equal(accountServiceOfEnv({ ACCOUNT_SERVICE_URL: bad }), null, String(bad));
  assert.equal(accountServiceOfEnv(null), null);
  const served = await (await relayFactsAnswer('/profile', { ACCOUNT_SERVICE_URL: SERVICE })).json();
  assert.equal(served.accounts, SERVICE);
  const bare = await (await relayFactsAnswer('/profile')).json();
  assert.equal(bare.accounts, null);
  assert.equal(bare.ph, served.ph, 'the service is not part of the profile hash');
});

test('the profile door: no address stops at the door in words and asks nothing; a relay that names its service is remembered', async () => {
  _resetProfileForTests();
  const said = [];
  let asked = 0;
  const store = memoryStore();
  await assert.rejects(
    openProfileDoor(
      params('online'),
      (w) => said.push(w),
      async () => {
        asked++;
        return { ok: true, json: async () => ({}) };
      },
      store,
    ),
    /No server address is set\. Enter one in Settings, Online, Relay\./,
  );
  assert.equal(asked, 0);
  assert.deepEqual(said, ['No server address is set. Enter one in Settings, Online, Relay.']);
  const ph = await profileHashOf(OFFICIAL_PROFILE);
  await openProfileDoor(
    params(`online&server=${RELAY}`),
    () => {},
    async () => ({
      ok: true,
      json: async () => ({ v: RELAY_VERSION, ph, profile: OFFICIAL_PROFILE, accounts: SERVICE }),
    }),
    store,
  );
  assert.deepEqual(learnedAccountService(store), { relay: RELAY, accounts: SERVICE });
  _resetProfileForTests();
});

test('the account card: no relay says so; a relay not yet asked is asked once; one that named no service says so', async () => {
  const { accountServiceWait, _resetAccountServiceWaitForTests } =
    await import('../../src/ui/enhanced/account-service-wait.ts');
  _resetAccountServiceWaitForTests();
  const store = memoryStore();
  let redraws = 0;
  const redraw = () => redraws++;
  assert.equal(
    accountServiceWait('', store, redraw),
    'No server address is set. Enter one in Settings, Online, Relay.',
  );
  const realFetch = globalThis.fetch;
  let asked = 0;
  globalThis.fetch = async () => {
    asked++;
    return { ok: true, json: async () => ({ accounts: null }) };
  };
  try {
    assert.equal(accountServiceWait(RELAY, store, redraw), 'Asking the server for its account service.');
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(asked, 1);
    assert.equal(redraws, 1, 'the card is drawn again once the relay answered');
    assert.equal(accountServiceWait(RELAY, store, redraw), 'The server did not name an account service.');
    assert.equal(asked, 1, 'asked once a menu');
    rememberAccountService(store, RELAY, SERVICE);
    assert.equal(accountServiceWait(RELAY, store, redraw), null, 'learned: the card signs in');
  } finally {
    globalThis.fetch = realFetch;
    _resetAccountServiceWaitForTests();
  }
});
