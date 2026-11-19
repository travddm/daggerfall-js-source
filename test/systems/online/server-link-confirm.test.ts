// A `?server=` link to a relay the player has not joined is asked about before anything is fetched or sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path, which tsconfig.node.json does not follow: the door's imports reach src/net modules that
// name the DOM's crypto types, and the node config has no DOM library.
const DOOR_PATH: string = '../../../src/systems/online/profileDoor.ts';
const CONFIRM_PATH: string = '../../../src/systems/online/server-link-confirm.ts';
const ADDRESS_PATH: string = '../../../src/net/account-service-address.ts';
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
const { openProfileDoor } = (await import(DOOR_PATH)) as {
  openProfileDoor: (
    params: URLSearchParams,
    status: (words: string) => void,
    fetchImpl: Fetch,
    storage: Store,
    confirmLink: (relay: string) => Promise<boolean>,
    declineLink?: () => Promise<never>,
  ) => Promise<void>;
};
type PageLocation = { href: string; replace(url: string): void };
const { unconfirmedServerLink, rememberJoinedServer, askServerLink, menuUrlOf, returnToMenu } = (await import(
  CONFIRM_PATH
)) as {
  unconfirmedServerLink: (params: URLSearchParams, storage: Store, saved: unknown) => string | null;
  rememberJoinedServer: (storage: Store, relay: string) => void;
  askServerLink: (relay: string, doc?: unknown) => Promise<boolean>;
  menuUrlOf: (href: string) => string;
  returnToMenu: (location?: PageLocation) => Promise<never>;
};
const { learnedAccountService } = (await import(ADDRESS_PATH)) as {
  learnedAccountService: (storage: Store) => unknown;
};

const memoryStore = (): Store => {
  const map = new Map<string, string>();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) };
};
const EVIL = 'wss://relay.evil.example';

test('declining a link to a relay never joined fetches nothing, remembers nothing and goes back to the menu', async () => {
  const store = memoryStore();
  const asked: string[] = [];
  const said: string[] = [];
  let fetched = 0;
  let declined = 0;
  await assert.rejects(
    openProfileDoor(
      new URLSearchParams(`online&server=${EVIL}`),
      (words) => said.push(words),
      async () => {
        fetched++;
        return { ok: true, json: async () => ({ accounts: 'https://accounts.evil.example' }) };
      },
      store,
      async (relay) => {
        asked.push(relay);
        return false;
      },
      async () => {
        declined++;
        throw new Error('back to the menu');
      },
    ),
    /back to the menu/,
  );
  assert.equal(declined, 1);
  assert.deepEqual(said, ['You did not join that server. Nothing was sent to it.']);
  assert.deepEqual(asked, [EVIL]);
  assert.equal(fetched, 0);
  assert.equal(learnedAccountService(store), null);
  assert.equal(unconfirmedServerLink(new URLSearchParams(`server=${EVIL}`), store, ''), EVIL, 'asked again next time');
});

test('an accepted relay is remembered and not asked again; the saved relay and no link ask nothing', async () => {
  const store = memoryStore();
  const link = new URLSearchParams(`online&server=${EVIL}/`);
  assert.equal(unconfirmedServerLink(link, store, ''), EVIL);
  rememberJoinedServer(store, EVIL);
  assert.equal(unconfirmedServerLink(link, store, ''), null);
  const saved = 'wss://relay.home.example';
  assert.equal(unconfirmedServerLink(new URLSearchParams(`server=${saved}`), memoryStore(), saved), null);
  assert.equal(unconfirmedServerLink(new URLSearchParams('online'), memoryStore(), saved), null);
  assert.equal(unconfirmedServerLink(new URLSearchParams('server=https://not.a.relay'), memoryStore(), ''), null);
});

test('a page with no document cannot ask, so it does not join', async () => {
  assert.equal(await askServerLink(EVIL, undefined), false);
});

test('the menu a declining player goes back to drops the link and every key that boots past the menu', async () => {
  const link = `http://game.example/play/?world&online&server=${EVIL}&region=Daggerfall&loc=Daggerfall&lang=de`;
  assert.equal(menuUrlOf(link), 'http://game.example/play/?lang=de');
  const went: string[] = [];
  const settled = await Promise.race([
    returnToMenu({ href: link, replace: (url) => void went.push(url) }).then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 20)),
  ]);
  assert.deepEqual(went, ['http://game.example/play/?lang=de']);
  assert.equal(settled, 'pending', 'the boot waits for the page to go instead of drawing a failure');
});
