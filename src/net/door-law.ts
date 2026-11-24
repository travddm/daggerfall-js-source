// The relay's door, as both ends read it: the path a page asks before it opens a place's socket, the shapes of the
// door's answers, the pass a hello carries, and the wait a busy close names. The door itself is
// server/src/relay-door.ts; the page's side is net/relay-door-client.ts.

import { isCellRoom, isWorldRoom, BUSY_TOKEN_UNREAD } from './wire.js';

/** The Worker's path a page asks the door at: `GET /door?room=<key>&id=<the page's own id>`. */
export const DOOR_PATH = '/door';
/** A pass, and a page's id at the door: random words a page or the door makes, never anything a player reads. */
export const DOOR_WORD_RE = /^[A-Za-z0-9_-]{16,32}$/;
/** The longest wait the door or a busy close tells, ms. A longer one in an answer is read as this. */
export const DOOR_WAIT_MAX_MS = 30_000;
/** The shortest wait told, ms. */
export const DOOR_WAIT_MIN_MS = 1_000;
/** The highest place in a line the door names. A line is bounded well under it (relay-door.ts). */
export const DOOR_POSITION_MAX = 100_000;

/** The rooms whose first socket asks the door: a place a player stands in (a cell, or a shared world room). */
export const doorPaces = (room: string): boolean => isCellRoom(room) || isWorldRoom(room);

/** The door's answer as a page reads it. `open` is any answer that is not a place in line or a pass: the page goes in
 *  without a pass, so a door that fails never keeps a player out. */
export type DoorAnswer =
  | { kind: 'pass'; pass: string; until: number }
  | { kind: 'queue'; position: number; wait: number }
  | { kind: 'open' };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finiteIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/**
 * Reads one answer from the door, or from the account service's sign-in line, which answers a place in the same
 * shape: 503 `{ error: 'queue', position, wait }`. Every other answer is `open`.
 */
export function readDoorAnswer(status: number, body: unknown): DoorAnswer {
  if (!isRecord(body)) return { kind: 'open' };
  if (status === 503 && body.error === 'queue') {
    if (!finiteIn(body.position, 1, DOOR_POSITION_MAX) || !finiteIn(body.wait, 0, Number.MAX_SAFE_INTEGER)) return { kind: 'open' };
    const wait = Math.min(DOOR_WAIT_MAX_MS, Math.max(DOOR_WAIT_MIN_MS, Math.round(body.wait)));
    return { kind: 'queue', position: Math.trunc(body.position), wait };
  }
  if (status === 200 && typeof body.pass === 'string' && DOOR_WORD_RE.test(body.pass) && finiteIn(body.until, 0, Number.MAX_SAFE_INTEGER)) {
    return { kind: 'pass', pass: body.pass, until: body.until };
  }
  return { kind: 'open' };
}

/** A busy close's reason with the wait it tells, in whole seconds: `busy, wait 4`, or after `busy, token unread`. */
export function busyReason(base: string, waitMs: number): string {
  const seconds = Math.round(Math.min(DOOR_WAIT_MAX_MS, Math.max(DOOR_WAIT_MIN_MS, waitMs)) / 1000);
  return `${base}, wait ${seconds}`;
}

const BUSY_WAIT_RE = /^busy(?:, token unread)?, wait (\d{1,2})$/;

/** The wait a busy close's reason tells, ms, or null for a reason that tells none. */
export function busyWaitMs(reason: unknown): number | null {
  if (typeof reason !== 'string') return null;
  const match = BUSY_WAIT_RE.exec(reason);
  if (!match) return null;
  return Math.min(DOOR_WAIT_MAX_MS, Math.max(DOOR_WAIT_MIN_MS, Number(match[1]) * 1000));
}

/** Whether a busy close's reason says the relay never read the hello's token, with or without a wait. */
export const busyTokenUnread = (reason: unknown): boolean =>
  reason === BUSY_TOKEN_UNREAD || (typeof reason === 'string' && reason.startsWith(`${BUSY_TOKEN_UNREAD}, wait `));
