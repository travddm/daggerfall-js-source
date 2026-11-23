// The piece frame: a large relay frame sent as several text frames, so the pose batches between them are not held
// behind the whole frame on a slow line. The relay cuts (server/src/bulk-outbox.ts) and the client joins
// (PieceIntake) before it parses.
//
// Layout, one WebSocket text frame a piece, fields in decimal ASCII:
//
// | Field   | Text            | Range                                      |
// | ------- | --------------- | ------------------------------------------ |
// | marker  | `#pc,`          | fixed; no JSON frame starts with `#`       |
// | seq     | digits then `,` | 0 to PIECE_SEQ_MOD - 1, one per cut frame  |
// | index   | digits then `,` | 0 to count - 1, sent in order              |
// | count   | digits then `,` | 2 to PIECES_MAX                            |
// | body    | the rest        | 1 to BULK_PIECE_CHARS UTF-16 units         |
//
// A frame is cut at UTF-16 unit offsets, never between the two halves of a surrogate pair: a lone surrogate would
// reach the wire as U+FFFD and change the frame's text.
import { INBOUND_FRAME_MAX } from './wire.js';

/** The marker every piece starts with. */
export const PIECE_MARK = '#pc,';
/** The largest piece body, in UTF-16 units: 16 KiB of ASCII, about 13 ms of a 10 Mbit/s line. */
export const BULK_PIECE_CHARS = 16 * 1024;
/** The most pieces of one frame: the largest frame a client takes whole, each piece one unit short for a pair. */
export const PIECES_MAX = Math.ceil(INBOUND_FRAME_MAX / (BULK_PIECE_CHARS - 1));
/** Sequence numbers wrap here. The intake only compares them for equality. */
export const PIECE_SEQ_MOD = 2 ** 31;
/** The longest header: the marker and three fields of at most ten digits, each with its comma. */
const HEADER_MAX = PIECE_MARK.length + 3 * 11;

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/**
 * The end offsets of each piece of `text`, cut at most `pieceChars` units apart and never inside a surrogate pair.
 * A text no longer than `pieceChars` is one piece.
 */
export function pieceEnds(text: string, pieceChars: number = BULK_PIECE_CHARS): number[] {
  const ends: number[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + pieceChars, text.length);
    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1)) && end - 1 > start) end -= 1;
    ends.push(end);
    start = end;
  }
  return ends;
}

/** The piece frame for `body`, which is piece `index` of `count` of frame `seq`. */
export function pieceFrame(seq: number, index: number, count: number, body: string): string {
  return `${PIECE_MARK}${seq},${index},${count},${body}`;
}

/** Every piece frame of `text`, in order. The relay sends them one at a time; tests and fakes use the whole list. */
export function cutPieces(text: string, seq: number, pieceChars: number = BULK_PIECE_CHARS): string[] {
  const ends = pieceEnds(text, pieceChars);
  const frames: string[] = [];
  let start = 0;
  for (let index = 0; index < ends.length; index++) {
    frames.push(pieceFrame(seq, index, ends.length, text.slice(start, ends[index])));
    start = ends[index];
  }
  return frames;
}

export type PieceHeader = { seq: number; index: number; count: number; bodyAt: number };

/** Reads one decimal field ending in a comma at `at`, or null. At most ten digits, so the value stays exact. */
function readField(text: string, at: number): { value: number; next: number } | null {
  let value = 0;
  let i = at;
  for (; i < text.length && i - at < 10; i++) {
    const code = text.charCodeAt(i);
    if (code === 44) break;
    if (code < 48 || code > 57) return null;
    value = value * 10 + (code - 48);
  }
  if (i === at || i >= text.length || text.charCodeAt(i) !== 44) return null;
  return { value, next: i + 1 };
}

/** The header of a piece frame, or null when the frame is no piece or its header is out of range. */
export function readPieceHeader(text: string): PieceHeader | null {
  if (!text.startsWith(PIECE_MARK)) return null;
  const seq = readField(text, PIECE_MARK.length);
  if (!seq || seq.value >= PIECE_SEQ_MOD) return null;
  const index = readField(text, seq.next);
  if (!index) return null;
  const count = readField(text, index.next);
  if (!count || count.next > HEADER_MAX) return null;
  if (count.value < 2 || count.value > PIECES_MAX || index.value >= count.value) return null;
  return { seq: seq.value, index: index.value, count: count.value, bodyAt: count.next };
}

type Partial = { seq: number; count: number; next: number; length: number; parts: string[] };

/**
 * The client's side: joins the pieces each socket receives. A relay sends the pieces of one frame in order and
 * finishes it before it starts the next on that socket, so each socket holds at most one partial frame. Anything else
 * (a gap, another sequence, a body past its bound, a whole past `frameMax`) drops the partial frame and is counted.
 */
export class PieceIntake {
  readonly frameMax: number;
  drops = 0;
  private partials = new WeakMap<object, Partial>();

  constructor(frameMax: number = INBOUND_FRAME_MAX) {
    this.frameMax = frameMax;
  }

  /**
   * A frame from `socket`: a frame that is no piece comes back as it is; a piece answers null, or the joined frame
   * when it was the last.
   */
  take(socket: object, data: unknown): unknown {
    if (typeof data !== 'string' || !data.startsWith(PIECE_MARK)) return data;
    const header = readPieceHeader(data);
    const bodyLength = header ? data.length - header.bodyAt : 0;
    if (!header || bodyLength < 1 || bodyLength > BULK_PIECE_CHARS) return this.drop(socket);
    let partial = this.partials.get(socket);
    if (header.index === 0) {
      if (partial) this.drops++;
      partial = { seq: header.seq, count: header.count, next: 0, length: 0, parts: [] };
      this.partials.set(socket, partial);
    }
    if (!partial || partial.seq !== header.seq || partial.count !== header.count || partial.next !== header.index) {
      return this.drop(socket);
    }
    if (partial.length + bodyLength > this.frameMax) return this.drop(socket);
    partial.parts.push(data.slice(header.bodyAt));
    partial.length += bodyLength;
    partial.next++;
    if (partial.next < partial.count) return null;
    this.partials.delete(socket);
    return partial.parts.join('');
  }

  /** Whether `socket` holds a frame not yet whole. */
  holds(socket: object): boolean {
    return this.partials.has(socket);
  }

  private drop(socket: object): null {
    this.partials.delete(socket);
    this.drops++;
    return null;
  }
}
