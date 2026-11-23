// The channel table: each frame type on a room's one socket has a delivery class, a priority (0 first) and the rate
// its gates allow. Both ends import it, as they import net/wire.js. The relay's bulk outbox (server/src/bulk-outbox.ts)
// reads the class to decide which frames it cuts into pieces; the other classes still go out at once.
//
// - control: the session's own frames. Never dropped, never held behind bulk.
// - latest: a newer value replaces an older one (poses, the foes stream). Batched by the relay.
// - events: reliable and in order. Never dropped; may pass a bulk frame still in pieces.
// - bulk: reliable and in order among themselves, cut into pieces that wait for every other class.
//
// Rates are the existing gates in net/wire.js. A row's rate names the gate; the gate itself enforces it.
import {
  HELLO_HZ_MAX,
  HIT_HZ_MAX,
  HIT_ROOM_HZ_MAX,
  POSE_HZ_MAX,
  POSE_BATCH_MS,
  ACT_HZ_MAX,
  ACT_ROOM_HZ_MAX,
  CAST_HZ_MAX,
  FOES_HZ_MAX,
  FOES_ROOM_BYTES_PER_S,
  ROSTER_BATCH_MS,
  TRADE_HZ_MAX,
  DUEL_HZ_MAX,
  CARD_HZ_MAX,
  PAGE_HZ_MAX,
  WED_HZ_MAX,
  WORLD_MIN_MS,
  WORLD_FRAME_MAX,
  QUEST_HZ_MAX,
  QUEST_ROOM_HZ_MAX,
  QUEST_FRAME_MAX,
} from './wire.js';

export type DeliveryClass = 'control' | 'latest' | 'events' | 'bulk';

/** A rate as its gates state it. Every field is optional: a row names only the gates its type has. */
export type ChannelRate = {
  /** Frames a second one socket may send. */
  socketHz?: number;
  /** Frames a second the whole room may send. */
  roomHz?: number;
  /** Bytes a second the whole room may send. */
  roomBytesPerS?: number;
  /** The least time between two frames of this type from one sender. */
  minGapMs?: number;
  /** The relay's batch window for this type. */
  batchMs?: number;
  /** The largest frame of this type. */
  frameMax?: number;
};

export type ChannelRow = {
  type: string;
  deliveryClass: DeliveryClass;
  priority: number;
  rate: ChannelRate;
};

/** The room socket's frame types. Chat, party and guild frames ride the hub's own gates and are not listed. */
export const CHANNEL_TABLE: readonly ChannelRow[] = Object.freeze([
  { type: 'hello', deliveryClass: 'control', priority: 0, rate: { roomHz: HELLO_HZ_MAX } },
  { type: 'welcome', deliveryClass: 'control', priority: 0, rate: {} },
  { type: 'error', deliveryClass: 'control', priority: 0, rate: {} },
  { type: 'ping', deliveryClass: 'control', priority: 0, rate: {} },
  { type: 'pong', deliveryClass: 'control', priority: 0, rate: {} },
  { type: 'host', deliveryClass: 'control', priority: 0, rate: {} },
  { type: 'hit', deliveryClass: 'events', priority: 1, rate: { socketHz: HIT_HZ_MAX, roomHz: HIT_ROOM_HZ_MAX } },
  { type: 'pose', deliveryClass: 'latest', priority: 1, rate: { socketHz: POSE_HZ_MAX, batchMs: POSE_BATCH_MS } },
  { type: 'poses', deliveryClass: 'latest', priority: 1, rate: { batchMs: POSE_BATCH_MS } },
  { type: 'act', deliveryClass: 'events', priority: 2, rate: { socketHz: ACT_HZ_MAX, roomHz: ACT_ROOM_HZ_MAX } },
  { type: 'cast', deliveryClass: 'events', priority: 2, rate: { socketHz: CAST_HZ_MAX } },
  {
    type: 'foes',
    deliveryClass: 'latest',
    priority: 2,
    rate: { socketHz: FOES_HZ_MAX, roomBytesPerS: FOES_ROOM_BYTES_PER_S },
  },
  {
    type: 'own',
    deliveryClass: 'latest',
    priority: 2,
    rate: { socketHz: FOES_HZ_MAX, roomBytesPerS: FOES_ROOM_BYTES_PER_S },
  },
  { type: 'roster', deliveryClass: 'events', priority: 2, rate: { batchMs: ROSTER_BATCH_MS } },
  { type: 'trade', deliveryClass: 'events', priority: 3, rate: { socketHz: TRADE_HZ_MAX } },
  { type: 'duel', deliveryClass: 'events', priority: 3, rate: { socketHz: DUEL_HZ_MAX } },
  { type: 'card', deliveryClass: 'events', priority: 3, rate: { socketHz: CARD_HZ_MAX } },
  { type: 'page', deliveryClass: 'events', priority: 3, rate: { socketHz: PAGE_HZ_MAX } },
  { type: 'wed', deliveryClass: 'events', priority: 3, rate: { socketHz: WED_HZ_MAX } },
  {
    type: 'world',
    deliveryClass: 'bulk',
    priority: 4,
    rate: { minGapMs: WORLD_MIN_MS, frameMax: WORLD_FRAME_MAX },
  },
  {
    type: 'quest',
    deliveryClass: 'bulk',
    priority: 4,
    rate: { socketHz: QUEST_HZ_MAX, roomHz: QUEST_ROOM_HZ_MAX, frameMax: QUEST_FRAME_MAX },
  },
]);

const ROWS = new Map(CHANNEL_TABLE.map((row) => [row.type, row]));

/** The row of a frame type, or undefined for a type the table does not list. */
export function channelOf(type: string): ChannelRow | undefined {
  return ROWS.get(type);
}

/** The text every frame of a bulk type starts with, as the relay builds it (`{"t":"world"` and so on). */
export const BULK_PREFIXES: readonly string[] = Object.freeze(
  CHANNEL_TABLE.filter((row) => row.deliveryClass === 'bulk').map((row) => `{"t":"${row.type}"`),
);

/** Whether a frame's text is of a bulk type. Reads the prefix alone: the relay builds these frames itself. */
export function isBulkFrame(text: string): boolean {
  for (const prefix of BULK_PREFIXES) if (text.startsWith(prefix)) return true;
  return false;
}
