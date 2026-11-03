// AUDIT TESA II Z6: A SPAWN GRANT PAST THE BAY.
// The arc put a spawn grant's world pixel on the wire past the Bay (AUDIT TESA-BIOME F2). The client takes a grant
// minted on any world pixel, renews it and hands it on (scenes/grantHost.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldRoom } from '../../src/net/wire.js';
import { GRANT_RENEW_LEAD_MS } from '../../src/net/grantLaw.js';
import { createGrantHost } from '../../src/scenes/grantHost.js';

test('AUDIT TESA II Z6 A GRANT PAST THE BAY: the grant is taken, renewed and handed on; the Bay\'s own grant as ever (mutants: the grant past the Bay refused; its renewal or its handover dropped)', async () => {
  let t = 1_000_000;
  const rig = () => {
    const sent = [];
    const s = { status: 'open', grantMode: 'measure', room: worldRoom(2400, 900), sendGrant: (a) => { sent.push(a); return true; } };
    const host = createGrantHost({ session: () => s, now: () => t, fetchKey: async () => null, wait: 20 });
    return { s, host, sent };
  };
  const grant = (p, g = 7, q = worldRoom(p[0], p[1])) => ({ g, o: 'sock-mac-01', q, a: 'acct-mac', k: 'enc', p, m: 9, l: 12, r: 0, n: 1, s: 77, e: 0, c: [-1], h: -1, x: t + 10 * 60_000, sg: 'A'.repeat(86) });
  const mint = async (h, p) => {
    const got = h.host.memberFor('enc');
    await Promise.resolve(); await Promise.resolve();
    const ask = h.sent.at(-1);
    assert.equal(ask?.k, 'mint');
    h.host.answer({ k: 'ok', id: ask.id, gr: grant(p) });
    return got;
  };
  const bay = rig();
  const onBay = await mint(bay, [402, 151]);
  assert.deepEqual(onBay?.gr?.p, [402, 151], 'the Bay\'s own grant, as ever');
  const ww = rig();
  const past = await mint(ww, [2400, 900]);
  assert.deepEqual(past?.gr?.p, [2400, 900], 'the grant past the Bay, taken');
  const f = {};
  ww.host.stood(past.gr, past.i, f);
  t = past.gr.x - GRANT_RENEW_LEAD_MS + 1;
  const n = ww.sent.length;
  ww.host.tick(); await Promise.resolve();
  assert.equal(ww.sent.slice(n).filter((a) => a.k === 'renew').length, 1, 'renewed');
  const g2 = {};
  ww.host.stood(past.gr, 0, g2);
  const n2 = ww.sent.length;
  ww.host.handed(g2, 'sock-ann-01'); await Promise.resolve(); await Promise.resolve();
  assert.equal(ww.sent.slice(n2).filter((a) => a.k === 'heir').length, 1, 'handed on');
});
