// A take from a shared container online leaves the pack while the room's
// authority judges it (roomLootHost.js roomTake; claimLedger.js take), and the carry gate (itemTransfer.js planTake) read
// the pack alone. Fast takes near the limit each passed, and the grants landed past it. DFU refuses a take past
// MaxEncumbrance (DaggerfallInventoryWindow.cs CanCarryAmount), so the claims in flight now weigh at the gate. Driven
// through the real room module (scenes/roomLootHost.js createRoomLoot, rpt1026_items_skew.test.js's harness) and the
// claim ledger the outdoor bodies and interiors use.
import '../modsOff.js';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomLoot } from '../../src/scenes/roomLootHost.js';
import { ROOM_CLAIM_TIMEOUT_MS } from '../../src/systems/roomLoot.js';
import { createClaimLedger } from '../../src/systems/loot/claimLedger.js';
import { planTake } from '../../src/systems/item/itemTransfer.js';
import { pendingCarryKg, setPendingCarry } from '../../src/systems/item/pendingCarry.js';
import { entityMaxEncumbrance } from '../../src/combat/formulas.js';
import { playerEntity } from '../../src/characters/playerEntity.js';

const ROOM = 'dungeon:4243';
const HOST = 'a0a0-0001';
// two 20 kg pieces; a Strength of 20 carries 30 kg: one fits, two do not
const heavy = (name) => ({ name, templateIndex: 138, group: 'Jewellery', value: 120, weightInKg: 20 });
const chain = () => [heavy('Anvil Torc'), heavy('Iron Torc')];
const saved = { strength: playerEntity.stats.strength, items: playerEntity.items, gold: playerEntity.goldPieces };
afterEach(() => {
  playerEntity.stats.strength = saved.strength;
  playerEntity.items = saved.items;
  playerEntity.goldPieces = saved.gold;
  for (const k of ['dungeon-room', 'body-loot', 'interior-loot', 'test-ledger']) setPendingCarry(k, null);
});
const ready = () => {
  playerEntity.stats.strength = 20;
  playerEntity.items = [];
  playerEntity.goldPieces = 0;
  assert.equal(entityMaxEncumbrance(playerEntity), 30);
};

/** A client in the room: the room module over a dungeon of one layout pile, as the dungeon host constructs it. */
function client(id, { authority = false } = {}) {
  const frames = [];
  const host = {
    _deepCleared: new Set(),
    _deepFoeCleared: new Set(),
    _sharedFoe: () => false,
    _wildDungeon: false,
    _wildRing: null,
    eliteLootOpts: () => ({}),
    fightN: () => 1,
    foes: [],
    lootKeyOf: (k) => k,
    lootableBody: () => false,
    respawnDue: () => false,
    rollPileItems: chain,
    roomLootKey: (k) => k,
    searchHeard: () => {},
    searchables: [],
    settleLootFlat: () => {},
    dfLocation: { mapTableData: { dungeonType: 0 } },
    opts: {
      selfId: () => id,
      onActions: (data) => frames.push(JSON.parse(JSON.stringify(data))),
      onLootClaimed: () => {},
      partyLevels: () => [],
      roomHost: () => HOST,
    },
    lootPiles: [{ items: [], pos: [0, 0, 0] }],
    _lootUnreadable: new Set(),
    _lootSeen: new Set(),
    _lootAt: new Map(),
    _lootOpenKey: null,
    _lootTooBig: new Set(),
    _authority: authority,
    _foesFrom: authority ? null : HOST,
    _locationKey: ROOM,
    _layoutFoes: 0,
    _sharedById: new Map(),
    _sharedStamp: `st${id}`,
    _roomClaimN: 0,
    _roomMintHold: 0,
    _roomNowMs: 0,
    _retyping: new Set(),
    lootKey: 'N',
    onlineRoom: () => true,
    _wallNow: () => 1_000_000,
    searchRoom: { ours: () => true, fields: () => ({}), whose: () => null },
  };
  return { id, host, frames, m: createRoomLoot(host) };
}
function hostWord() {
  const a = client(HOST, { authority: true });
  a.m.mintUnbornRoom(0);
  a.m.mintUnbornRoom(10_000);
  return a.frames.flatMap((f) => f.l ?? []).find((r) => r.k === 'loot:0');
}
/** The window's take: the gate asked, then the piece moved from the pile to the pack. */
function windowTake(pile, piece) {
  const plan = planTake(piece, { bag: playerEntity.items, entity: playerEntity });
  if (!plan.ok) return plan;
  pile.splice(pile.indexOf(piece), 1);
  playerEntity.items.push(piece);
  return plan;
}

test("A joiner's take waiting for the host still weighs - the second 20 kg piece is refused at 30 kg, before and after the first leaves the pack as a claim", () => {
  ready();
  const rec = hostWord();
  const b = client('b0b0-0002');
  assert.equal(b.m.landRoomWord('loot:0', rec, HOST), 1);
  const pile = b.host.lootPiles[0].items;
  const [first, second] = [pile.find((it) => it.name === 'Anvil Torc'), pile.find((it) => it.name === 'Iron Torc')];
  assert.equal(windowTake(pile, first).ok, true, 'the first fits');
  b.m.roomSettle('loot:0');
  assert.equal(b.m._roomMine.size, 1, 'claimed of the host');
  assert.equal(playerEntity.items.length, 0, 'the claimed piece left the pack until the verdict');
  assert.equal(pendingCarryKg(playerEntity), 20, 'and weighs as a claim in flight');
  const refused = windowTake(pile, second);
  assert.equal(refused.ok, false, 'the second is refused: 20 kg in flight and 20 more is past 30');
  assert.equal(refused.refusal.reason, 'cannotCarry');
  assert.equal(pile.includes(second), true, 'and stays in the pile');
});

test("A lapsed claim is back in the pile and weighs nothing; another player's weight never counts", () => {
  ready();
  const rec = hostWord();
  const b = client('b0b0-0002');
  b.m.landRoomWord('loot:0', rec, HOST);
  const pile = b.host.lootPiles[0].items;
  windowTake(
    pile,
    pile.find((it) => it.name === 'Anvil Torc'),
  );
  b.m.roomSettle('loot:0');
  assert.equal(pendingCarryKg({ isPlayer: true }), 0, 'another entity has no claims here');
  b.m.roomClaimTick(ROOM_CLAIM_TIMEOUT_MS);
  assert.equal(pendingCarryKg(playerEntity), 0, 'lapsed: no verdict came, the piece reads as back in the pile');
  assert.equal(
    windowTake(
      pile,
      pile.find((it) => it.name === 'Iron Torc'),
    ).ok,
    true,
    'so the other piece can be taken',
  );
});

test('The claim ledger of outdoor bodies and interiors weighs its claims in flight, answered and lapsed ones not', () => {
  ready();
  const entity = { ...playerEntity, items: [heavy('Anvil Torc')], stats: { ...playerEntity.stats } };
  const ledger = createClaimLedger({
    entity,
    newId: (() => {
      let n = 0;
      return () => `c${++n}`;
    })(),
    lapseMs: 4000,
  });
  setPendingCarry('test-ledger', (e) => (e === entity ? ledger.pendingKg() : 0)); // as bodyLootHost.js and interiorRoomLoot.js register it
  const c = ledger.take('body:1', { p: 0 }, entity.items[0], 1, {}, 0);
  assert.equal(entity.items.length, 0, 'lifted out of the pack');
  assert.equal(ledger.pendingKg(), 20);
  assert.equal(planTake(heavy('Iron Torc'), { bag: entity.items, entity }).ok, false, 'the gate counts it');
  ledger.due(4000);
  assert.equal(ledger.pendingKg(), 0, 'lapsed');
  const c2 = ledger.take('body:1', { p: 1 }, heavy('Iron Torc'), 1, {}, 5000);
  assert.equal(c2.give, 0, 'nothing of it was in the pack to lift');
  assert.equal(ledger.pendingKg(), 0, 'and a claim that lifted nothing lands nothing');
  ledger.resolve(c.id, 1);
  assert.equal(entity.items.length, 1, 'a late grant still lands');
});
