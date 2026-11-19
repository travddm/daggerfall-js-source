// The page's search (systems/page-search.ts) answers what `location.search` answers, after every way a page changes
// its search without a navigation: history.pushState, history.replaceState and a move through the history.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pageSearch } from '../../src/systems/page-search.ts';
import { isOnlinePage } from '../../src/systems/online/onlineLane.js';
import { skinOverride } from '../../src/systems/uiSkin.js';

type Listener = () => void;
const page = globalThis as unknown as Record<string, unknown>;
const names = ['Location', 'location', 'history', 'addEventListener'];
const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
after(() => {
  names.forEach((name, i) => {
    const descriptor = saved[i];
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete page[name];
  });
});

/** A browser's location, history and window events, enough for the module: a getter that counts its reads. */
class FakeLocation {
  current = '';
  reads = 0;
  get search(): string {
    this.reads++;
    return this.current;
  }
}
const location = new FakeLocation();
const listeners: Listener[] = [];
const history = {
  pushState: (_state: unknown, _title: string, url: string) => {
    location.current = url;
  },
  replaceState: (_state: unknown, _title: string, url: string) => {
    location.current = url;
  },
};
for (const [name, value] of Object.entries({
  Location: FakeLocation,
  location,
  history,
  addEventListener: (type: string, listener: Listener) => {
    if (type === 'popstate') listeners.push(listener);
  },
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

test('the search is read from the browser once, and again after each change', () => {
  location.current = '?world';
  assert.equal(pageSearch(), '?world');
  const readsAfterFirst = location.reads;
  for (let i = 0; i < 100; i++) assert.equal(pageSearch(), '?world');
  assert.equal(location.reads, readsAfterFirst, 'no read while the URL stands');

  globalThis.history.replaceState(null, '', '?world&online&skin=classic');
  assert.equal(pageSearch(), '?world&online&skin=classic');
  assert.equal(isOnlinePage(), true);
  assert.equal(skinOverride(), 'classic');

  globalThis.history.pushState(null, '', '?world');
  assert.equal(isOnlinePage(), false);
  assert.equal(skinOverride(), null);

  location.current = '?world&online';
  for (const listener of listeners) listener();
  assert.equal(isOnlinePage(), true, 'a move through the history');
});
