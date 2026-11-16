// GATE-MIX: the peers' sounds COURT_PEER_DB down while I stand in the court - scenes/gate/gateCourt.js
// peersHeard over net/peer/peerFx.js's one scope. Design:
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGateCourt, COURT_PEER_DB, courtPeerGain } from '../../../src/scenes/gate/gateCourt.js';
import { GATE_STATE_EMPTY } from '../../../src/net/gate/gateLink.js';
import { courtToDungeon } from '../../../src/world/gate/gateArena.js';
import { peerHeard, setPeerSoundScope, peerSoundScope } from '../../../src/net/peer/peerFx.js';
import { destroyGateBossBar } from '../../../src/ui/gate/gateBossBar.js';

function court() {
  const scales = [];
  let inside = false;
  const link = { st: { ...GATE_STATE_EMPTY, day: 700, boss: 'ruhn', hp: 900, max: 1000, fighters: 3, wrathAt: 10_000_000 }, state() { return this.st; } };
  const clock = { t: 100 };
  const c = createGateCourt({
    renderer: null, gl: null, link, now: () => clock.t, cam: () => courtToDungeon(0, 1.7, 20),
    audio: { play3d() {}, play3dId() {}, scaled: (g, run) => { scales.push(g); return run(); } },
    feet: () => (inside ? courtToDungeon(1, 0, 1) : null), player: () => ({ health: 500, maxHealth: 500 }), save: () => 0, strike: () => {}, rng: () => 0.5, send: () => true,
  });
  return { c, scales, set: (v) => { inside = v; }, tick: () => { clock.t += 16; c.frame(); } };
}

test('GATE-MIX the peers down in the court: a peer\'s sound plays COURT_PEER_DB under itself while I stand in it, as it was out of it and once the court is left (mutants: the scope never handed in; never taken back; the level not -4 dB)', () => {
  destroyGateBossBar();
  setPeerSoundScope(null);
  const h = court();
  h.tick();
  assert.equal(peerSoundScope(), null, 'out of the court: none');
  assert.equal(peerHeard(() => 'blow'), 'blow');
  assert.deepEqual(h.scales, []);
  h.set(true); h.tick();
  assert.notEqual(peerSoundScope(), null, 'in it: the court\'s');
  assert.equal(peerHeard(() => 'blow'), 'blow', 'the sound still plays');
  assert.deepEqual(h.scales, [courtPeerGain()], 'four decibels down');
  assert.equal(courtPeerGain(), 10 ** (-4 / 20));
  assert.equal(COURT_PEER_DB, -4);
  h.set(false); h.tick();
  assert.equal(peerSoundScope(), null, 'stepped out: as it was');
  h.set(true); h.tick();
  assert.notEqual(peerSoundScope(), null);
  h.c.leave();
  assert.equal(peerSoundScope(), null, 'the court left: as it was');
});

test('GATE-MIX the court never takes a scope another place holds - another\'s stands through the court\'s frames and its leaving (mutants: the scope taken over; another\'s cleared)', () => {
  destroyGateBossBar();
  const other = (run) => run();
  setPeerSoundScope(other);
  const h = court();
  h.set(true); h.tick();
  assert.equal(peerSoundScope(), other, 'not taken over');
  h.set(false); h.tick();
  h.c.leave();
  assert.equal(peerSoundScope(), other, 'not cleared');
  setPeerSoundScope(null);
});
