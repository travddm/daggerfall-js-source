// The page's side of the relay's door (server/src/relay-door.ts). Before a session opens its first socket into a
// place, or opens it again after a drop, it asks the door over plain HTTP. While it waits it holds no socket, and its
// player is shown a place in line. A session that is already in and only changes rooms never asks.
//
// The door fails open: an answer that is neither a pass nor a place, a network error, or a wait past
// DOOR_GIVE_UP_MS lets the session open without a pass, as a page did before the door.

import { doorPaces, readDoorAnswer, busyWaitMs, DOOR_PATH } from './door-law.ts';
import { jittered } from './backoff.js';
import { t } from '../systems/textManager.js';

/** How long one ask may take before the session goes in without a pass, ms. */
export const DOOR_ASK_TIMEOUT_MS = 5_000;
/** How long a session waits in line in all before it goes in without a pass, ms. A line kept long by places that
 *  nobody returns for (relay-door.ts bounds them) costs a player at most this. */
export const DOOR_GIVE_UP_MS = 180_000;
/** How long a pass is used after it came, ms: under the door's own 15 s, so a slow clock or a slow open still
 *  reaches the relay inside it. */
export const DOOR_PASS_USE_MS = 10_000;

/** The fields of a session (net/online.js OnlineSession) the door reads and sets. */
export type DoorSession = {
  url: string | null;
  room: string | null;
  _retryAt: number | null;
  _halo: Map<string, { ws: unknown; retryAt: number | null }>;
};

/** A relay deploy's wave (net/reconnectWave.js), as the door reads it. */
type Wave = { holdUntil(dropAt: number, now: number): number | null };

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ status: number; json(): Promise<unknown> }>;

/** `paces`: whether this session asks the door at all (the session a page's place rides on does; its hub and region
 *  links do not). `fetchImpl` is the page's fetch unless a test hands its own. */
export type DoorClientOptions = { now: () => number; rand: () => number; paces: boolean; fetchImpl?: FetchLike | null };

/** The door's HTTP address for a relay's socket address: `wss://` asks `https://`, `ws://` asks `http://`. */
export function doorUrl(relayUrl: string, room: string, id: string): string | null {
  const base = /^wss:\/\//i.test(relayUrl)
    ? `https://${relayUrl.slice(6)}`
    : /^ws:\/\//i.test(relayUrl)
      ? `http://${relayUrl.slice(5)}`
      : null;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}${DOOR_PATH}?room=${encodeURIComponent(room)}&id=${encodeURIComponent(id)}`;
}

/** A random id for this page at the door, in DOOR_WORD_RE's shape. The door keeps the page's place under it. */
function newDoorId(rand: () => number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 22; i++) id += letters[Math.floor(rand() * letters.length) % letters.length];
  return id;
}

/** One session's place at the door. */
export class RelayDoorClient {
  /** Whether the session's next open of a place asks the door: until it is welcomed, and again after a drop. */
  private needed = true;
  private asking = false;
  private pass: { room: string; word: string; usableUntil: number } | null = null;
  private waitingSince: number | null = null;
  /** The door last answered with neither a pass nor a place: no door to wait at, so a deploy's wave spreads instead. */
  private noDoor = false;
  /** The retry time this door last gave the session's halos. */
  private haloHeldTo: number | null = null;
  /** The player's place in line, while the session waits at the door. */
  position: number | null = null;
  /** Asks made, for the load harness. */
  asks = 0;
  private readonly paces: boolean;
  private readonly id: string;
  private readonly now: () => number;
  private readonly rand: () => number;
  private readonly fetchImpl: FetchLike | null;

  constructor({ now, rand, paces, fetchImpl }: DoorClientOptions) {
    this.paces = paces;
    this.now = now;
    this.rand = rand;
    this.fetchImpl =
      fetchImpl ?? (typeof globalThis.fetch === 'function' ? (globalThis.fetch.bind(globalThis) as FetchLike) : null);
    this.id = newDoorId(Math.random);
  }

  /** Whether the session's open must wait for the door. Starts an ask when none is out. */
  holds(session: DoorSession): boolean {
    const room = session.room;
    if (!this.paces || !this.needed || !room || !session.url || !doorPaces(room) || !this.fetchImpl) return false;
    const now = this.now();
    if (this.pass && this.pass.room === room && now < this.pass.usableUntil) return false;
    this.waitingSince ??= now;
    if (now - this.waitingSince > DOOR_GIVE_UP_MS) return false;
    // A retry time while the ask is out, so a lost answer still brings the session back to ask again.
    session._retryAt = now + DOOR_ASK_TIMEOUT_MS + 1_000;
    if (!this.asking) void this.ask(session, room);
    this.holdHalos(session);
    return true;
  }

  /** The pass for a hello into `room`, spent: a hello carries it once. */
  passFor(room: string): string | null {
    const pass = this.pass;
    if (!pass || pass.room !== room || this.now() >= pass.usableUntil) return null;
    this.pass = null;
    return pass.word;
  }

  /** The session's place socket was welcomed: it is in, and a room change asks no door. */
  welcomed(): void {
    this.needed = false;
    this.position = null;
    this.waitingSince = null;
  }

  /** The session's place socket dropped, and it will open again: that open asks the door. */
  dropped(): void {
    this.needed = true;
  }

  /** A relay deploy's hold on a dropped session's retry. Null where the door paces the room: the line spreads the
   *  return, and a wave's hold on top of it would only lengthen it. */
  waveHold(wave: Wave, dropAt: number | null, room: string | null, now: number): number | null {
    if (dropAt == null) return null;
    if (this.paces && room && doorPaces(room) && this.fetchImpl && !this.noDoor) return null;
    return wave.holdUntil(dropAt, now);
  }

  /** After a busy close: the wait its reason names, jittered, as the session's retry time. A reason that names none
   *  leaves the session's own backoff as it was. */
  afterBusy(session: DoorSession, close: { reason?: unknown } | null | undefined): void {
    const wait = busyWaitMs(close?.reason);
    if (wait !== null) session._retryAt = this.now() + jittered(wait, this.rand);
  }

  /** A halo's retry time after a close: the wait a busy close's reason names, jittered, or `fallback`. */
  haloRetryAt(close: { reason?: unknown } | null | undefined, fallback: number | null): number | null {
    const wait = busyWaitMs(close?.reason);
    return wait === null ? fallback : this.now() + jittered(wait, this.rand);
  }

  /** The player's line while the session waits at the door, else the reconnecting line. */
  statusLine(label: string): string {
    if (this.position !== null)
      return t('net.online.inLine', '{label}: number {place} in line to join', { label, place: this.position });
    return t('net.online.reconnecting', '{label}: reconnecting', { label });
  }

  /** A halo waits while its session waits at the door: it follows the session's place socket in. */
  private holdHalos(session: DoorSession): void {
    const at = session._retryAt;
    if (at === null) return;
    for (const halo of session._halo.values()) {
      if (halo.ws || halo.retryAt === null) continue;
      // A time this door set earlier follows the session's new one; a halo's own later time stands.
      halo.retryAt = halo.retryAt === this.haloHeldTo ? at : Math.max(halo.retryAt, at);
    }
    this.haloHeldTo = at;
  }

  private async ask(session: DoorSession, room: string): Promise<void> {
    const url = session.url ? doorUrl(session.url, room, this.id) : null;
    const fetchImpl = this.fetchImpl;
    if (!url || !fetchImpl) return;
    this.asking = true;
    this.asks++;
    let status = 0;
    let body: unknown = null;
    const abort = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => abort?.abort(), DOOR_ASK_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, abort ? { signal: abort.signal } : undefined);
      status = res.status;
      body = await res.json();
    } catch {
      status = 0;
    } finally {
      clearTimeout(timer);
      this.asking = false;
    }
    if (session.room !== room || !this.needed) return;
    const answer = readDoorAnswer(status, body);
    const now = this.now();
    this.noDoor = answer.kind === 'open';
    if (answer.kind === 'queue') {
      this.position = answer.position;
      session._retryAt = now + jittered(answer.wait, this.rand);
      this.holdHalos(session);
      return;
    }
    this.position = null;
    if (answer.kind === 'pass') this.pass = { room, word: answer.pass, usableUntil: now + DOOR_PASS_USE_MS };
    // No door, or a door that let the session in unpaced: it goes in without a pass this time.
    else this.needed = false;
    session._retryAt = now;
  }
}
