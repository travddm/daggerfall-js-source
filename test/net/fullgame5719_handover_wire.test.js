import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OnlineSession } from '../../src/net/online.js';
import { parseClient, validFoeRecord, RELAY_VERSION } from '../../src/net/wire.js';
import { goldStack } from '../../src/systems/inventory.js';

function client(version) {
  const sockets = [];
  class FakeWS {
    constructor() { this.sent = []; sockets.push(this); }
    send(s) { this.sent.push(JSON.parse(s)); }
    close() {}
    receive(o) { this.onmessage?.({ data: JSON.stringify(o) }); }
  }
  const s = new OnlineSession({ id: 'ann-0001', secret: 'secret-of-ann-0001', WebSocketImpl: FakeWS, now: () => 10000 });
  s.join('world:3,12', { x: 1, y: 0, z: 1, yaw: 0, pitch: 0, mv: 0 });
  const ws = sockets[0]; ws.onopen?.();
  ws.receive({ t: 'welcome', id: 'ann-0001', peers: [], v: version });
  return { s, ws };
}

test('FG-03: an inventory handover goes on the foes frame and the relay\'s parse keeps the items', () => {
  const { s, ws } = client(RELAY_VERSION);
  const items = [goldStack(125)];
  const data = { n: 1, k: s.room, full: 0, f: [{ i: 1, t: 0, d: 0, e: 'bob-0002', it: items }] };
  assert.equal(s.sendFoes(data), true);
  assert.equal(ws.sent.some((m) => m.t === 'foes'), true);
  assert.deepEqual(parseClient(JSON.stringify(ws.sent.at(-1)), { hasHello: true }).data.f[0].it, items);
  s.leave();
});

test('FG-03: ordinary frames still send and the foe validator rejects corpse inventories', () => {
  const { s } = client(RELAY_VERSION);
  assert.equal(s.sendFoes({ n: 1, k: s.room, full: 0, f: [] }), true);
  const dead = { t: 'foes', data: { n: 2, k: s.room, full: 0, f: [{ i: 1, t: 0, d: 1, e: 'bob-0002', it: [] }] } };
  assert.equal(validFoeRecord(dead.data.f[0]), null);
  for (const f of [null, {}, 'bad']) assert.equal(s.sendFoes({ n: 3, k: s.room, full: 0, f }), false);
  s.leave();
});
