// The relay's bulk frames end to end, over the fake Durable Object: a joiner's large stored memory leaves its welcome and
// follows in pieces with the owed pose batch between them, and a change of host drops a memory still in pieces.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the relay and the wire name the DOM's crypto types, which tsconfig.node.json does not have.
const FAKE_ROOM_PATH: string = '../fakeRoom.mjs';
const WIRE_PATH: string = '../../src/net/wire.js';
const PIECES_PATH: string = '../../src/net/bulk-pieces.ts';
const { fakeRoom } = await import(FAKE_ROOM_PATH);
const { validPose, PIXEL_UNITS, POSE_HZ_MAX } = await import(WIRE_PATH);
const { BULK_PIECE_CHARS, PIECE_MARK } = await import(PIECES_PATH);

const KEY = 'dungeon:m187853213';

type FakeSocket = {
  sent: { t: string; [k: string]: unknown }[];
  raw: string[];
  closed: unknown;
  send(s: string): void;
};

const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
  const keep = { info: console.info, warn: console.warn, log: console.log };
  console.info = console.warn = console.log = () => {};
  try {
    return await run();
  } finally {
    Object.assign(console, keep);
  }
};

const poseAt = (x: number, ts: number) =>
  validPose({ x: x * PIXEL_UNITS, y: 0, z: 10 * PIXEL_UNITS, yaw: 0, pitch: 0, ts });

/** A dungeon room on a clock of its own; each socket also keeps every text frame it was sent, pieces and all. */
async function dungeon<T>(run: (harness: any) => Promise<T>): Promise<T> {
  const realNow = Date.now;
  let clock = 1_800_000_000_000;
  Date.now = () => clock;
  try {
    return await quiet(async () => {
      const R = fakeRoom(KEY, { now: () => clock });
      const join = async (id: string): Promise<FakeSocket> => {
        const ws = R.connect();
        ws.raw = [];
        const send = ws.send;
        ws.send = function (s: string) {
          this.raw.push(s);
          send.call(this, s);
        };
        clock += 200;
        await R.hello(ws, id, poseAt(10, 0), { w2: 1 });
        assert.equal(ws.closed, null, `${id} taken`);
        return ws;
      };
      const speak = async (ws: FakeSocket, x: number) => {
        clock += Math.ceil(1000 / POSE_HZ_MAX) + 1;
        await R.pose(ws, poseAt(x, clock % 60_000));
      };
      try {
        return await run({ R, join, speak });
      } finally {
        R.room._bulk.drain();
        R.room._flushOwed();
      }
    });
  } finally {
    Date.now = realNow;
  }
}

const memory = (size: number) => ({ locationKey: KEY, stamp: 'big', world: { pad: 'm'.repeat(size) } });

test('a large stored memory follows the welcome in pieces, with the pose batch between them', async () => {
  await dungeon(async ({ R, join, speak }) => {
    const host = await join('host-0001');
    const stored = memory(BULK_PIECE_CHARS * 4);
    await R.world(host, stored);
    const joiner = await join('join-0002');
    const welcome = joiner.sent.find((frame) => frame.t === 'welcome');
    assert.equal(welcome?.world, null, 'the welcome leaves the memory out');
    assert.equal(welcome?.wf, 1, 'and says it follows');
    assert.ok(joiner.raw.at(-1)?.startsWith(PIECE_MARK), 'the first piece follows at once');
    await speak(host, 11);
    R.room._bulk.tick();
    const [batch, piece] = joiner.raw.slice(-2);
    assert.ok(batch.startsWith('{"t":"poses"'), 'the owed poses go first');
    assert.ok(piece.startsWith(`${PIECE_MARK}0,1,`), 'then the next piece');
    R.room._bulk.drain();
    const follow = joiner.sent.find((frame) => frame.t === 'world');
    assert.deepEqual(follow, { t: 'world', wf: 1, id: 'host-0001', data: stored }, 'the memory lands whole');
  });
});

test('a small memory still rides the welcome, and the host takes its own there', async () => {
  await dungeon(async ({ R, join }) => {
    const host = await join('host-0001');
    const stored = memory(100);
    await R.world(host, stored);
    const joiner = await join('join-0002');
    const welcome = joiner.sent.find((frame) => frame.t === 'welcome');
    assert.deepEqual(welcome?.world, stored);
    assert.equal(welcome?.wf, undefined);
  });
});

test('a change of host drops a memory still in pieces and marks the listener as not yet handed one', async () => {
  await dungeon(async ({ R, join }) => {
    const host = await join('host-0001');
    const listener = await join('lsn-0002');
    await R.world(host, memory(BULK_PIECE_CHARS * 4));
    assert.equal(R.room._bulk.waiting, 1, 'the memory is in pieces to the listener');
    await R.drop(host);
    assert.equal(R.room._bulk.waiting, 0, 'dropped on the host change');
    assert.equal(R.room._attach(listener).worldSeen, false, 'so the new memory reaches it');
  });
});
