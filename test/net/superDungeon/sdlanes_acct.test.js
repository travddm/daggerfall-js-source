// A province's Hollow keeps the hub's one life and one win an account, in its own lane (server/src/sdCopy.js
// sdAcctInternal), and a device keeps one copy a lane (src/scenes/superDungeon/sdCopy.js): a province's never
// overwrites the Bay's.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SD_KEY, SD_LANE_SPAN, sdLaneKey, sdReceiptKey } from '../../../src/net/wire.js';
import { SD_INTERNAL_ACCT, sdAcctInternal } from '../../../server/src/sdCopy.js';
import { createSdCopy, SD_COPY_KEY } from '../../../src/scenes/superDungeon/sdCopy.js';

const BAY = 1;
const PROVINCE = SD_LANE_SPAN + 1;
const LANE = 1;
const O_A = 'a'.repeat(16);
const O_B = 'b'.repeat(16);
const SUB = 'acct-lane-test';

/** A hub with `store` for its storage, holding a Hollow on each given slot's lane. */
function hubWith(...slots) {
  const store = new Map(slots.map((s) => [sdLaneKey(SD_KEY, Math.floor(s / SD_LANE_SPAN)), { s }]));
  return { store, room: { state: { storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, v); } } } } };
}
const ask = async (hub, body) => (await sdAcctInternal(hub.room, new Request(`https://relay.internal${SD_INTERNAL_ACCT}`, { method: 'POST', body: JSON.stringify({ a: SUB, ...body }) }))).json();

test('SD-LANES A PROVINCE HOLLOW KEEPS ONE LIFE AND ONE WIN: its death is kept under its lane, its receipt shuts the other copies, and the Bay\'s record is not touched', async () => {
  const hub = hubWith(BAY, PROVINCE);
  assert.deepEqual(await ask(hub, { s: PROVINCE, op: 'down', o: O_A }), { ok: true });
  assert.deepEqual(hub.store.get(`sdac:${SUB}.${LANE}`), { s: PROVINCE, d: 1, o: O_A }, 'the death is kept on the province\'s lane');
  assert.equal(hub.store.has(`sdac:${SUB}`), false, 'and not on the Bay\'s key');
  assert.deepEqual([await ask(hub, { s: PROVINCE, op: 'may', o: O_A }), await ask(hub, { s: PROVINCE, op: 'may', o: O_B })], [{ ok: true }, { ok: true, w: 'down' }], 'its own copy takes the dead back, no other does');
  assert.deepEqual(await ask(hub, { s: BAY, op: 'may', o: O_B }), { ok: true }, 'the Bay\'s Hollow is a free account');
  hub.store.set(sdReceiptKey(SUB, LANE), { s: PROVINCE });
  assert.deepEqual(await ask(hub, { s: PROVINCE, op: 'may', o: O_B }), { ok: true, w: 'won' }, 'a receipt for the province\'s slot shuts every copy');
  assert.deepEqual(await ask(hub, { s: BAY, op: 'may', o: O_B }), { ok: true }, 'and not the Bay\'s');
});

test('SD-LANES A DEVICE KEEPS ONE COPY A LANE: going into a province\'s Hollow leaves the Bay\'s kept copy as it was', async () => {
  const store = new Map();
  const party = { id: 'pt1', leader: 'acct-lane-me', members: [{ acct: 'acct-lane-me' }, { acct: 'acct-lane-ld' }] };
  const copy = createSdCopy({ social: () => ({ acct: 'acct-lane-me', party }), store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) } });
  const bay = await copy.ownerFor(BAY);
  const province = await copy.ownerFor(PROVINCE);
  assert.ok(bay && province);
  assert.equal(store.get(SD_COPY_KEY)?.s, BAY, 'the Bay\'s kept copy is still the Bay\'s');
  const keptSlots = [...store.values()].map((v) => v.s).sort((x, y) => x - y);
  assert.deepEqual(keptSlots, [BAY, PROVINCE], 'and the province\'s is kept beside it');
});
