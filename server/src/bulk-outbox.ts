// The relay's bulk outbox: a frame of a bulk type (net/channel-table.ts) larger than one piece is not sent whole. It
// waits in its socket's queue and goes out one piece at a time (net/bulk-pieces.ts), at most one piece a socket each
// tick. Every piece goes through the room's own send, which first flushes the pose batch the socket is owed, so a
// listener's poses arrive between the pieces instead of behind the whole frame.
//
// The server WebSocket shows no send queue, so the outbox cannot see how fast a line drains. It paces by time
// instead: one piece of 16 KiB each 50 ms is about 2.6 Mbit/s to a listener, below any line the game supports, so at
// most one piece sits ahead of a pose batch.
//
// Every other frame goes out at once and may pass a bulk frame still in pieces. Bulk frames keep their order among
// themselves. A queue past QUEUE_MAX frames is sent at once, as the relay sent everything before pieces: a bulk frame
// is never dropped for load.
import { BULK_PIECE_CHARS, PIECE_SEQ_MOD, pieceEnds, pieceFrame } from '../../src/net/bulk-pieces.ts';
import { isBulkFrame } from '../../src/net/channel-table.ts';
import { POSE_BATCH_MS } from '../../src/net/wire.js';

/** The time between two pieces to one socket: the pose batch's own window. */
export const BULK_TICK_MS = POSE_BATCH_MS;
/**
 * The most pieces a room sends in one tick, over all its sockets. Ten pieces of 16 KiB each 50 ms is about
 * 3.2 MB/s: a quarter of a 100 Mbit/s uplink, which leaves the rest for the pose fan of a full room.
 */
export const BULK_ROOM_PIECES_PER_TICK = 10;
/** The most bulk frames one socket may have queued before its queue is sent at once. */
export const BULK_QUEUE_MAX = 8;
/**
 * A world frame that follows its welcome starts with this text (`worldFollowFrame`). It carries the memory the welcome
 * left out, which the client takes whoever hosts by then, so a change of host does not drop it.
 */
export const WORLD_FOLLOW_PREFIX = '{"t":"world","wf":1,';
const WORLD_PREFIX = '{"t":"world"';

/** What the outbox needs from its room. */
export type BulkOutboxRoom = {
  /** Sends one frame now; answers false when the socket refused it (the room has closed it). */
  sendNow(socket: object, text: string): boolean;
  /** Whether the socket is still the room's. */
  isLive(socket: object): boolean;
};

export type BulkTimers = {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

type QueuedFrame = {
  text: string;
  seq: number;
  /** Piece end offsets, or null for a frame that goes whole. */
  ends: number[] | null;
  nextPiece: number;
  nextStart: number;
};

const realTimers: BulkTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** One socket's waiting frames, and the outbox turn at which it last had a piece (-1: none yet). */
type SocketQueue = { frames: QueuedFrame[]; servedTurn: number };

export class BulkOutbox {
  private readonly room: BulkOutboxRoom;
  private readonly timers: BulkTimers;
  private readonly queues = new Map<object, SocketQueue>();
  private timer: unknown = null;
  private sentThisTick = 0;
  private turn = 0;
  private seq = 0;

  constructor(room: BulkOutboxRoom, timers: BulkTimers = realTimers) {
    this.room = room;
    this.timers = timers;
  }

  /** Sockets with bulk frames waiting. */
  get waiting(): number {
    return this.queues.size;
  }

  /** Whether a tick is armed. */
  get armed(): boolean {
    return this.timer !== null;
  }

  /**
   * Offers a frame on its way to `socket`. Answers true when the outbox took it: a bulk frame larger than one piece,
   * or any bulk frame while an earlier one still waits. A virtual socket (a shard's) is never taken: its shard
   * sends to the real socket, through its own outbox.
   */
  takes(socket: object, text: string): boolean {
    const queue = this.queues.get(socket);
    if (!queue && text.length <= BULK_PIECE_CHARS) return false;
    if ((socket as { virtual?: boolean }).virtual) return false;
    if (!isBulkFrame(text)) return false;
    const frame: QueuedFrame = {
      text,
      seq: this.seq,
      ends: text.length > BULK_PIECE_CHARS ? pieceEnds(text) : null,
      nextPiece: 0,
      nextStart: 0,
    };
    if (frame.ends) this.seq = (this.seq + 1) % PIECE_SEQ_MOD;
    if (queue) {
      queue.frames.push(frame);
      if (queue.frames.length > BULK_QUEUE_MAX) this.sendAll(socket);
      return true;
    }
    this.queues.set(socket, { frames: [frame], servedTurn: -1 });
    this.arm();
    if (this.sentThisTick < BULK_ROOM_PIECES_PER_TICK) {
      this.sentThisTick++;
      this.step(socket);
    }
    return true;
  }

  /** Forgets a socket that left. */
  forget(socket: object): void {
    this.queues.delete(socket);
    if (!this.queues.size) this.disarm();
  }

  /**
   * The room's host changed. A client takes a world frame only from the host, so each socket's queued world frames
   * from the old host are dropped, except a welcome's follow, which names no host. Answers the sockets that lost one,
   * so the room can hand them the new host's next memory.
   */
  dropWorldFrames(): object[] {
    const lost: object[] = [];
    for (const [socket, queue] of [...this.queues]) {
      const kept = queue.frames.filter((frame) => !isHostWorldFrame(frame.text));
      if (kept.length === queue.frames.length) continue;
      lost.push(socket);
      if (kept.length) queue.frames = kept;
      else this.forget(socket);
    }
    return lost;
  }

  /** Sends every queued frame now, without pacing. For tests and fakes that drive the room without timers. */
  drain(): void {
    for (const socket of [...this.queues.keys()]) this.sendAll(socket);
  }

  /** One tick: one piece to each waiting socket, the ones served longest ago first, BULK_ROOM_PIECES_PER_TICK at most. */
  tick(): void {
    this.timer = null;
    this.sentThisTick = 0;
    const order = [...this.queues].sort((a, b) => a[1].servedTurn - b[1].servedTurn);
    for (const [socket] of order.slice(0, BULK_ROOM_PIECES_PER_TICK)) {
      this.sentThisTick++;
      if (!this.room.isLive(socket)) this.forget(socket);
      else this.step(socket);
    }
    if (this.queues.size) this.arm();
  }

  private arm(): void {
    if (this.timer !== null) return;
    this.timer = this.timers.set(() => this.tick(), BULK_TICK_MS);
  }

  private disarm(): void {
    if (this.timer === null) return;
    this.timers.clear(this.timer);
    this.timer = null;
  }

  /** Sends the next piece, or the next whole frame, of `socket`'s queue. */
  private step(socket: object): void {
    const queue = this.queues.get(socket);
    if (!queue) return;
    const frame = queue.frames[0];
    let sent: boolean;
    if (!frame.ends) {
      sent = this.room.sendNow(socket, frame.text);
      queue.frames.shift();
    } else {
      const end = frame.ends[frame.nextPiece];
      const body = frame.text.slice(frame.nextStart, end);
      sent = this.room.sendNow(socket, pieceFrame(frame.seq, frame.nextPiece, frame.ends.length, body));
      frame.nextPiece++;
      frame.nextStart = end;
      if (frame.nextPiece === frame.ends.length) queue.frames.shift();
    }
    queue.servedTurn = this.turn++;
    if (!sent || !queue.frames.length) this.forget(socket);
  }

  /** Sends all of `socket`'s queue now: the frame in pieces as pieces, so the client can still join it. */
  private sendAll(socket: object): void {
    while (this.queues.has(socket)) this.step(socket);
  }
}

/**
 * Whether a joiner's welcome carries the room's stored memory (`world`, its JSON text) itself. A memory larger than one
 * piece follows the welcome in pieces instead, so the joiner's first poses are not held behind it. A joiner that is
 * the host takes it in the welcome: it must hold the memory before it publishes its own, and nobody's poses wait.
 */
export function worldRidesWelcome(world: string | null, host: string | null, joiner: string): boolean {
  return world === null || world.length <= BULK_PIECE_CHARS || host === joiner;
}

/** The welcome's `world` field: the memory, `null`, or `null` with `wf` when the memory follows. */
export function welcomeWorldField(world: string | null, host: string | null, joiner: string): string {
  if (worldRidesWelcome(world, host, joiner)) return world ?? 'null';
  return 'null,"wf":1';
}

/** The frame that carries a memory the welcome left out, or null when the welcome carried it. */
export function worldFollowFrame(world: string | null, host: string | null, joiner: string): string | null {
  if (worldRidesWelcome(world, host, joiner)) return null;
  return `${WORLD_FOLLOW_PREFIX}"id":${JSON.stringify(host)},"data":${world}}`;
}

function isHostWorldFrame(text: string): boolean {
  return text.startsWith(WORLD_PREFIX) && !text.startsWith(WORLD_FOLLOW_PREFIX);
}
