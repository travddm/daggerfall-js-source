import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPeerCandidates, type PeerReport } from '../../../src/characters/enemy/peer-candidates.ts';

const conceal = (bits: number) => ({ invisible: !!(bits & 1) });

test('the room is read once a frame, and each peer keeps one identity across frames', () => {
  let reads = 0;
  let list: PeerReport[] = [{ id: 'a', feet: [1, 0, 1], height: 2 }];
  const peers = createPeerCandidates({
    read: () => {
      reads++;
      return list;
    },
    concealFlags: conceal,
    capsuleHeight: 1.8,
  });
  const first = peers.all()[0];
  peers.all();
  peers.byId('a');
  assert.equal(reads, 1, 'one read a frame');
  assert.deepEqual(first.feet, [1, 0, 1]);
  assert.equal(first.height, 2);

  list = [{ id: 'a', feet: [4, 0, 4] }];
  assert.equal(peers.nextFrame(), 1);
  assert.equal(peers.byId('a'), first, 'the same object the target machine already holds');
  assert.deepEqual(first.feet, [4, 0, 4], 'moved with the peer');
  assert.equal(first.height, 1.8, 'a peer with no height stands at the capsule height');
  assert.equal(reads, 2);
});

test('a peer gone is dead to the machine and dropped; no room drops every peer', () => {
  let list: PeerReport[] | null = [
    { id: 'a', feet: [0, 0, 0] },
    { id: 'b', feet: [1, 0, 0] },
  ];
  const peers = createPeerCandidates({ read: () => list, concealFlags: conceal, capsuleHeight: 1.8 });
  const [a, b] = peers.all();
  list = [{ id: 'a', feet: [0, 0, 0] }];
  peers.nextFrame();
  assert.deepEqual(
    peers.all().map((c) => c.id),
    ['a'],
  );
  assert.equal(b.health, 0);
  assert.equal(peers.byId('b'), null);
  list = null;
  peers.nextFrame();
  assert.deepEqual(peers.all(), []);
  assert.equal(a.health, 0);
});

test('a malformed report is skipped, and the concealment is read off the latest pose', () => {
  let list: PeerReport[] = [
    { id: 7, feet: [0, 0, 0] },
    { id: 'x', feet: [0, Number.NaN, 0] },
    { id: 'y', feet: [0, 0] },
    { id: 'ghost', feet: [0, 0, 0], cv: 1 },
  ];
  const peers = createPeerCandidates({ read: () => list, concealFlags: conceal, capsuleHeight: 1.8 });
  const all = peers.all();
  assert.deepEqual(
    all.map((c) => c.id),
    ['ghost'],
  );
  assert.deepEqual(all[0].concealment(), { invisible: true });
  list = [{ id: 'ghost', feet: [0, 0, 0] }];
  peers.nextFrame();
  peers.all();
  assert.deepEqual(all[0].concealment(), { invisible: false }, 'the spell ended');
  assert.equal(peers.byId(null), null);
});
