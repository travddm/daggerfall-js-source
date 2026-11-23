// The relay's bulk outbox: a large world or quest frame goes one piece a tick, other frames pass it, the room's pieces
// a tick are capped, and nothing stays armed once the queues are empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the wire's imports name the DOM's crypto types, which tsconfig.node.json does not have.
const OUTBOX_PATH: string = '../../server/src/bulk-outbox.ts';
const PIECES_PATH: string = '../../src/net/bulk-pieces.ts';
const {
  BulkOutbox,
  BULK_ROOM_PIECES_PER_TICK,
  BULK_QUEUE_MAX,
  welcomeWorldField,
  worldFollowFrame,
  WORLD_FOLLOW_PREFIX,
} = await import(OUTBOX_PATH);
const { BULK_PIECE_CHARS, PIECE_MARK, PieceIntake } = await import(PIECES_PATH);

type Sent = { socket: object; text: string };

function harness() {
  const sent: Sent[] = [];
  const live = new Set<object>();
  const pending: (() => void)[] = [];
  const room = {
    sendNow(socket: object, text: string): boolean {
      sent.push({ socket, text });
      return live.has(socket);
    },
    isLive: (socket: object) => live.has(socket),
  };
  const timers = {
    set(run: () => void) {
      pending.push(run);
      return pending.length;
    },
    clear() {
      pending.length = 0;
    },
  };
  const outbox = new BulkOutbox(room, timers);
  const tick = () => {
    const runs = pending.splice(0);
    for (const run of runs) run();
  };
  const socket = () => {
    const s = {};
    live.add(s);
    return s;
  };
  return { outbox, sent, live, tick, socket, pending };
}

const world = (size: number, id = 'host') => `{"t":"world","id":"${id}","data":{"s":"${'w'.repeat(size)}"}}`;

test('a small frame and any frame that is not bulk are left to the room', () => {
  const { outbox, socket } = harness();
  const s = socket();
  assert.equal(outbox.takes(s, world(100)), false);
  assert.equal(outbox.takes(s, `{"t":"foes","pad":"${'f'.repeat(BULK_PIECE_CHARS * 2)}"}`), false);
  assert.equal(outbox.armed, false);
});

test('a large world frame goes one piece a tick and joins back whole', () => {
  const { outbox, sent, tick, socket, pending } = harness();
  const s = socket();
  const text = world(BULK_PIECE_CHARS * 3);
  assert.equal(outbox.takes(s, text), true);
  assert.equal(sent.length, 1, 'the first piece at once');
  tick();
  assert.equal(sent.length, 2);
  tick();
  tick();
  assert.equal(sent.length, 4);
  assert.equal(pending.length, 0, 'nothing armed once the queue is empty');
  const intake = new PieceIntake();
  const joined = sent.map(({ text: piece }) => intake.take(s, piece)).at(-1);
  assert.equal(joined, text);
});

test('a frame that is not bulk passes a frame still in pieces; a later bulk frame waits its turn', () => {
  const { outbox, sent, tick, socket } = harness();
  const s = socket();
  outbox.takes(s, world(BULK_PIECE_CHARS * 2));
  assert.equal(outbox.takes(s, '{"t":"hit","data":{}}'), false, 'the room sends it now');
  const smallQuest = '{"t":"quest","quest":{}}';
  assert.equal(outbox.takes(s, smallQuest), true, 'behind the world frame, even small');
  tick();
  tick();
  tick();
  assert.deepEqual(
    sent.map(({ text }) => (text.startsWith(PIECE_MARK) ? 'piece' : text)),
    ['piece', 'piece', 'piece', smallQuest],
  );
});

test('a room sends at most BULK_ROOM_PIECES_PER_TICK pieces a tick, and serves every socket in turn', () => {
  const { outbox, sent, tick, socket } = harness();
  const sockets = Array.from({ length: BULK_ROOM_PIECES_PER_TICK * 2 }, socket);
  for (const s of sockets) outbox.takes(s, world(BULK_PIECE_CHARS * 2));
  assert.equal(sent.length, BULK_ROOM_PIECES_PER_TICK, 'first pieces up to the cap');
  tick();
  assert.equal(sent.length, BULK_ROOM_PIECES_PER_TICK * 2);
  const served = new Set(sent.map(({ socket: s }) => s));
  assert.equal(served.size, sockets.length, 'every socket had a piece after two ticks');
});

test('a queue past BULK_QUEUE_MAX goes out at once, still in order and still joinable', () => {
  const { outbox, sent, socket } = harness();
  const s = socket();
  const frames = Array.from({ length: BULK_QUEUE_MAX + 1 }, (_, i) => world(BULK_PIECE_CHARS + 1, `h${i}`));
  for (const frame of frames) outbox.takes(s, frame);
  assert.equal(outbox.waiting, 0);
  const intake = new PieceIntake();
  const joined = sent.map(({ text }) => intake.take(s, text)).filter((x) => x !== null);
  assert.deepEqual(joined, frames);
});

test('a socket that refuses a piece, or leaves, is forgotten and the timer stops', () => {
  const { outbox, live, tick, socket, pending } = harness();
  const s = socket();
  outbox.takes(s, world(BULK_PIECE_CHARS * 4));
  live.delete(s);
  tick();
  assert.equal(outbox.waiting, 0);
  assert.equal(pending.length, 0);
  const t = socket();
  outbox.takes(t, world(BULK_PIECE_CHARS * 4));
  outbox.forget(t);
  assert.equal(outbox.armed, false);
});

test('a virtual socket is never taken: its shard pieces the frame', () => {
  const { outbox } = harness();
  assert.equal(outbox.takes({ virtual: true }, world(BULK_PIECE_CHARS * 2)), false);
});

test('a change of host drops queued world frames from the old host but keeps a welcome follow', () => {
  const { outbox, socket } = harness();
  const listener = socket();
  const joiner = socket();
  outbox.takes(listener, world(BULK_PIECE_CHARS * 2));
  const follow = worldFollowFrame(`{"s":"${'m'.repeat(BULK_PIECE_CHARS)}"}`, 'host', 'joiner');
  outbox.takes(joiner, follow);
  assert.deepEqual(outbox.dropWorldFrames(), [listener]);
  assert.equal(outbox.waiting, 1, 'the follow stays');
});

test('the welcome carries a small memory, or the host its own; a large one follows it', () => {
  const small = '{"s":1}';
  const large = `{"s":"${'m'.repeat(BULK_PIECE_CHARS)}"}`;
  assert.equal(welcomeWorldField(null, 'host', 'joiner'), 'null');
  assert.equal(welcomeWorldField(small, 'host', 'joiner'), small);
  assert.equal(welcomeWorldField(large, 'joiner', 'joiner'), large);
  assert.equal(worldFollowFrame(large, 'joiner', 'joiner'), null);
  assert.equal(welcomeWorldField(large, 'host', 'joiner'), 'null,"wf":1');
  const follow = worldFollowFrame(large, 'host', 'joiner');
  assert.ok(follow.startsWith(WORLD_FOLLOW_PREFIX));
  assert.deepEqual(JSON.parse(follow), { t: 'world', wf: 1, id: 'host', data: JSON.parse(large) });
});
