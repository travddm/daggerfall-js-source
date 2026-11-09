// PROFESSION-CAPS the client: a refusal `prof-day-cap` closes the character's day on the harvest kind's track in the book
// (and only that track, only that character, only that UTC day), and the service's state read names the tier prices'
// scale that profTemplates.js sets its rows to.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createProfBook } from '../../src/net/profBook.js';
import { DFU_TIER_PRICE, setProfPrices } from '../../src/systems/professions/profTemplates.js';
import { INGOTS, ORES, TIER_VALUES } from '../../src/net/professionLaw.js';
import { templateByIndex } from '../../src/systems/item/itemTemplates.js';

const noWait = () => Promise.resolve();
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};
const DAY_MS = 86_400_000;
const T = 20500 * DAY_MS + 12 * 3600_000;
const okState = (extra = {}) => ({
  ok: true,
  data: { day: 20500, character: 'c1', tracks: [], today: {}, taken: [], stores: [], caps: { stores: 5000 }, ...extra },
});

test("PROFESSION-CAPS client: a refused harvest closes that character's day on its track, not another track or character, and not the next day", async () => {
  let t = T;
  let who = 'c1';
  const door = {
    account: () => 'acct-1',
    state: async () => okState(),
    harvest: async () => ({ ok: false, error: 'prof-day-cap' }),
  };
  const book = createProfBook({ door, storage: memStorage(), character: () => who, now: () => t, sleep: noWait });
  await book.refresh();
  assert.equal(book.closed('day:ore'), false, 'nothing refused yet');
  const r = await book.harvest({ node: 'n1', kind: 'ore', climate: 1, region: 1, act: {}, at: 1 });
  assert.equal(r.error, 'prof-day-cap');
  assert.equal(book.closed('day:ore'), true);
  assert.equal(book.closed('day:stone'), true, 'Mining is one track');
  assert.equal(book.closed('day:logs'), false, 'another track');
  who = 'c2';
  assert.equal(book.closed('day:ore'), false, 'another character');
  who = 'c1';
  t += DAY_MS;
  assert.equal(book.closed('day:ore'), false, 'the next UTC day');
});

test("PROFESSION-CAPS client: the state read's prices set the ores' rows to DFU's scale or the port's earlier one", async () => {
  const ore = ORES.find((m) => m.tier === 4);
  const priceOf = () => templateByIndex(ore.templateIndex).basePrice;
  const door = (prices) => ({
    account: () => 'acct-1',
    state: async () => okState({ caps: { stores: 5000, prices } }),
  });
  try {
    const port = createProfBook({
      door: door('port'),
      storage: memStorage(),
      character: () => 'c1',
      now: () => T,
      sleep: noWait,
    });
    await port.refresh();
    assert.equal(priceOf(), 8 * TIER_VALUES[3], 'the earlier scale');
    const dfu = createProfBook({
      door: door('dfu'),
      storage: memStorage(),
      character: () => 'c1',
      now: () => T,
      sleep: noWait,
    });
    await dfu.refresh();
    assert.equal(priceOf(), DFU_TIER_PRICE[3], "DFU's scale");
    assert.ok(INGOTS.length > 0);
  } finally {
    setProfPrices(true);
  }
});
