import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deductGold, deductGoldPieces } from '../../src/systems/court.js';
import { StreamingWorldState } from '../../src/world/streamingWorld.js';
import { waitForPartyArrival, PartyArrivalUnavailable, PARTY_ARRIVAL_TEXT, createPartyArrival, besideLeaderLanding } from '../../src/systems/party/partyArrival.js';
import { BESIDE_OFFSETS } from '../../src/systems/party/partyTravelLaw.js';
import { rig, HULL_NAMES } from '../partyBoatTeleportRig.mjs';

const fare = { piecesCost: 5, totalCost: 20, minutes: 100 };

test('RETRY: the cap terminates even with a stalled clock', async () => {
  let polls = 0, waits = 0, notices = 0;
  await assert.rejects(waitForPartyArrival(() => { polls++; return null; }, {
    now: () => 0, wait: async () => { waits++; }, onWait: () => { notices++; },
  }), PartyArrivalUnavailable);
  assert.equal(polls, 41); assert.equal(waits, 40); assert.equal(notices, 1);
});

test('RETENTION: departed guest hull survives room clear and origin shift, then is released', async () => {
  const r = await rig({ hull: HULL_NAMES.indexOf('Small Ship'), mine: false });
  let keep = true;
  r.peers.setKeepAboard((b) => keep && b === r.hers);
  r.peers.clearPeers(); r.peers.frame(0);
  assert.ok(r.pool.peerBoats.includes(r.hers));
  assert.deepEqual(r.peers.placeOf(r.hers), { owner: 'ann', slot: 0 });
  r.peers.rebase([40, 5, 60]); r.peers.frame(0);
  assert.deepEqual(r.hers.GameObject.position, [40, 5, 60]);
  keep = false; r.peers.frame(0);
  assert.ok(!r.pool.peerBoats.includes(r.hers));
});

test('PARTY-FOLLOW RETRY: the probe is told which attempt is its last - on the cap, and on a clock past the wait', async () => {
  const byCap = [];
  await assert.rejects(waitForPartyArrival((last) => { byCap.push(last); return null; }, { now: () => 0, wait: async () => {} }), PartyArrivalUnavailable);
  assert.equal(byCap.length, 41);
  assert.equal(byCap.filter(Boolean).length, 1);
  assert.equal(byCap.at(-1), true);
  let clock = 0;
  const byClock = [];
  const landing = await waitForPartyArrival((last) => { byClock.push(last); return last ? { pos: [0, 0, 0] } : null; }, { now: () => clock, wait: async () => { clock += 3000; } });
  assert.deepEqual(landing, { pos: [0, 0, 0] });
  assert.deepEqual(byClock, [false, false, true], 'the wait spent after two polls: the third is the last');
});

test('PARTY-FOLLOW arrivalLine: beside the leader the pick\'s own line; a party arrival not beside them its "no room" line; anything else the ordinary line (mutants: the missed line dropped)', () => {
  const { arrivalLine } = createPartyArrival({ besideLanding: () => null, supportedLanding: () => null, sync: () => {}, waiting: () => {} });
  const pick = { besideAt: () => null, besideText: 'You join Ann at Wayrest.', besideMissedText: 'There was no room beside Ann. You arrive at Wayrest.' };
  const landing = { pos: [0, 0, 0] };
  assert.equal(arrivalLine(pick, true, landing, 'You arrive at Wayrest.'), 'You join Ann at Wayrest.');
  assert.equal(arrivalLine(pick, true, null, 'You arrive at Wayrest.'), 'There was no room beside Ann. You arrive at Wayrest.');
  assert.equal(arrivalLine(pick, false, null, 'You arrive at Wayrest.'), 'You arrive at Wayrest.', 'not a party arrival: the ordinary line');
  assert.equal(arrivalLine({ besideAt: () => null }, false, null, 'You arrive at Wayrest.'), 'You arrive at Wayrest.', 'an ordinary journey');
});

test('PARTY-FOLLOW besideLeaderLanding: the leader\'s feet into this scene\'s frame, and the follower\'s seat is where the ring search starts (mutants: the seat dropped)', () => {
  const state = new StreamingWorldState();
  state.init(300, 150);
  const wc = state.worldCoords([10, 0, 20]);
  const feet = { x: wc.x, y: 5, z: wc.z };
  // An open, level floor: nothing in the way, and the capsule stands wherever it is put.
  const collider = { raycast: () => Infinity, move: () => ({ grounded: true, hitCeiling: false, groundKey: null }) };
  const first = besideLeaderLanding(feet, 0, state, collider, -100);
  const second = besideLeaderLanding(feet, 1, state, collider, -100);
  const leaderY = 5 + state.compensation[1];
  assert.deepEqual(first.pos.map((v) => Math.round(v * 1000) / 1000), [10 + BESIDE_OFFSETS[0][0], leaderY, 20 + BESIDE_OFFSETS[0][1]].map((v) => Math.round(v * 1000) / 1000));
  assert.deepEqual(second.pos.map((v) => Math.round(v * 1000) / 1000), [10 + BESIDE_OFFSETS[1][0], leaderY, 20 + BESIDE_OFFSETS[1][1]].map((v) => Math.round(v * 1000) / 1000), 'seat 1 starts at the ring\'s second spot');
});

