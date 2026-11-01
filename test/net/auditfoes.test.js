// AUDIT FOES - "during online play, certain enemies cant be
// damaged", Mac, relaying players. Three adversarial lenses over the foe
// damage path. FOE1 (the comment that ate the hit) is pinned where it broke,
// in test/scenes/audit39_worldmodes.test.js; FOE2 (a refused blow waits) in
// test/net/foe2_hitpend.test.js, driven; FOE3 (the halo is a way out) in
// test/net/world6biiib.test.js, driven. What is left is the dungeon host, which
// is pinned by SOURCE here as every other law of that file is - it cannot be
// mounted in node - with the comments stripped first, because FOE1 was a
// property hiding inside a comment and a raw text match is what missed it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PIXEL_UNITS } from '../../src/net/wire.js';
import { OnlineSession } from '../../src/net/online.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { fakeSocketClass } from '../fakeSocket.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
/** The file's CODE - a law inside a comment is not a law (FOE1). */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

// AUDIT FOES FOE10 - THE BLOW CROSSES, END TO END.
//
// AUDIT WORLD34 A1 drove two real sessions through the real relay Room and
// held that the host's FOES fan to the joiner and the joiner's ACT fans back.
// It never drove the one frame this report is about. A blow is the only thing
// a joiner cannot do for itself - it applies no local damage at all - so the
// hit frame is the single point of failure for "other players can attack
// enemies", and it was the one frame with no end-to-end pin over it.
//
// This drives it: a joiner's blow leaves its socket, is routed by the relay to
// the HOST alone, and arrives at the host's onHit with the striker named and
// the payload whole - and no one else hears it.
const at = (px, pz) => ({ x: px * PIXEL_UNITS + 10, y: 0, z: pz * PIXEL_UNITS + 10, yaw: 0, pitch: 0, mv: 0 });
const quiet = (fn) => { const i = console.info, w = console.warn; console.info = () => {}; console.warn = () => {}; try { return fn(); } finally { console.info = i; console.warn = w; } };

test('AUDIT FOES FOE10: a joiner\'s blow crosses the real relay to the host, and to the host alone', async () => {
  const key = 'dungeon:m187853213';   // Privateer's Hold, the id AUDIT WORLD34 A1 drives the same rig on
  const r = fakeRoom(key);
  await r.signer();   // ACC1g: the keypair before the clock starts - a hello mints a real token now
  const link = (id) => {
    const { FakeWS, sockets } = fakeSocketClass();
    const s = new OnlineSession({ url: 'wss://relay.test', name: id, id, secret: `secret-of-${id}`, WebSocketImpl: FakeWS, now: () => Date.now(), mintToken: () => r.token(id) });   // ACC1g: the relay refuses a hello it cannot verify, so this rig mints for real
    const hits = [];
    s.onHit = (from, data) => hits.push([from, data]);
    quiet(() => s.join(key, at(1, 1)));
    const ws = sockets[0]; const server = r.connect();
    ws.send = (str) => r.raw(server, str); server.send = (str) => ws.receive(str);
    ws.open();
    return { s, hits };
  };
  // Signed hello waits for WebCrypto and relay delivery. Under parallel load,
  // 25 ms can expire before either finishes; await the actual seat, bounded.
  const ready = async (predicate, label) => {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, `Timed out waiting for ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  const host = link('aaaa-0001'); await ready(() => host.s.isHost(), 'host seat');
  const joiner = link('bbbb-0002'); await ready(() => joiner.s.host === 'aaaa-0001', 'joiner hello');
  const bystander = link('cccc-0003'); await ready(() => bystander.s.host === 'aaaa-0001', 'bystander hello');
  assert.equal(host.s.isHost(), true, 'the first socket holds the seat');
  assert.equal(joiner.s.host, 'aaaa-0001', 'and the joiner is told who to strike through');

  const blow = { i: 7, dmg: 12, kind: 'melee', p: [1, 2, 3], d: [0, 0, 1] };
  assert.equal(joiner.s.sendHit(blow), true, 'the blow leaves the joiner');
  await ready(() => host.hits.length > 0, 'routed hit');

  assert.equal(host.hits.length, 1, 'THE WHOLE REPORT: the host hears the blow');
  assert.deepEqual(host.hits[0], ['bbbb-0002', blow], 'with the striker named and the payload whole');
  assert.equal(bystander.hits.length, 0, 'and nobody else does - a hit is routed, never fanned');
  assert.equal(joiner.hits.length, 0, 'least of all its striker');

  // ...and the host's own blows are its own door's, never the wire's
  assert.equal(host.s.sendHit(blow), false, 'the host applies its own');
});
