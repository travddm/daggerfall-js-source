// The relay's door: after a restart, a place's players come back at a set pace, each told its place in line.
//
// A page asks the door over plain HTTP before it opens the first socket into a cell or a world room. The door answers
// a pass or a place and a wait; a page that waits holds no socket, seat or attachment on the relay, only its place
// in the door's line. Each room's line lets DOOR_ROOM_RATE in a second, under one server-wide line of
// DOOR_SERVER_RATE. The hello spends its pass at the door instead of the room's bucket of hellos (helloGate.js).
//
// One Room object, named DOOR_OBJECT, keeps every line in memory: a restart loses them, and every page asks again.
// The door fails open: no answer in time, a bad ask, or a full line lets the page in without a pass, and the
// room's own bucket paces it as before.

import { newLine, lineAsk } from '../../src/net/sign-in-line.js';
import type { Line, LineLaw } from '../../src/net/sign-in-line.js';
import { DOOR_WORD_RE, DOOR_WAIT_MIN_MS, DOOR_WAIT_MAX_MS, doorPaces } from '../../src/net/door-law.ts';
import { roomOf } from '../../src/net/wire.js';

/** The object's name. `roomOf` refuses `#`, so no socket can open into it. */
export const DOOR_OBJECT = '#door';
/** The door object's paths: a page's ask, through the Worker, and a room spending a pass. */
export const DOOR_INTERNAL_ASK = '/internal/door/ask';
export const DOOR_INTERNAL_SPEND = '/internal/door/spend';
/** Sign-ins a room lets in a second: a full room of 200 returns in about 50 s. A Worker var may set it. */
export const DOOR_ROOM_RATE = 4;
/** Sign-ins the whole server lets in a second: the 200-player server back in about 50 s, however its players are
 *  spread. The account service's own line (ADMIT_RATE) must stay at or above it, or it forms a second, slower line. */
export const DOOR_SERVER_RATE = 4;
/** How long a pass opens its room's hello, ms: the socket's open and the token's mint fit well inside it. */
export const DOOR_PASS_MS = 15_000;
/** The most places one room's line holds: a room's sockets (wire.js SOCKETS_MAX). Past it a page goes in unpaced. */
export const DOOR_ROOM_PLACES_MAX = 256;
/** The most places the server-wide line holds. */
export const DOOR_SERVER_PLACES_MAX = 2_048;
/** The most rooms with a line at once. An idle line is forgotten first; past it a page goes in unpaced. */
export const DOOR_LINES_MAX = 512;
/** How long the Worker waits on the door object, and a room waits to spend a pass, before going on without it, ms. */
export const DOOR_ASK_WAIT_MS = 2_000;
export const DOOR_SPEND_WAIT_MS = 1_000;
/** A place nobody asked about this long is let go, ms: well past the longest wait told. */
const DOOR_KEEP_MS = 2 * DOOR_WAIT_MAX_MS;
const DOOR_SWEEP_MS = 10_000;

const CORS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'retry-after' };

type DoorEnv = { ROOMS?: DurableNamespace; DOOR_ROOM_RATE?: unknown; DOOR_SERVER_RATE?: unknown };
type DurableNamespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> } };
type DoorRoom = { env?: DoorEnv };
type Pass = { room: string; id: string; until: number };

/** The door's memory, kept by the door object. */
type DoorState = {
  rooms: Map<string, Line>;
  server: Line;
  passes: Map<string, Pass>;
  passOf: Map<string, string>;
  roomLaw: LineLaw;
  serverLaw: LineLaw;
};

/** One ask's answer, before it is a Response. */
export type DoorReply = { kind: 'pass'; pass: string; until: number } | { kind: 'queue'; position: number; wait: number } | { kind: 'open' };

const rateOr = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const lawOf = (rate: number, placesMax: number): LineLaw => ({
  rate,
  burst: Math.max(1, Math.round(rate)),
  keepMs: DOOR_KEEP_MS,
  passMs: DOOR_PASS_MS,
  waitMinMs: DOOR_WAIT_MIN_MS,
  waitMaxMs: DOOR_WAIT_MAX_MS,
  sweepMs: DOOR_SWEEP_MS,
  placesMax,
});

/** A door with empty lines, at the rates a server owner set (the Worker vars) or the defaults. */
export function newDoor(env: DoorEnv = {}): DoorState {
  return {
    rooms: new Map(),
    server: newLine(),
    passes: new Map(),
    passOf: new Map(),
    roomLaw: lawOf(rateOr(env.DOOR_ROOM_RATE, DOOR_ROOM_RATE), DOOR_ROOM_PLACES_MAX),
    serverLaw: lawOf(rateOr(env.DOOR_SERVER_RATE, DOOR_SERVER_RATE), DOOR_SERVER_PLACES_MAX),
  };
}

/** A random word in DOOR_WORD_RE's shape. */
const newPassWord = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The room's line, made on its first ask. Null when the door holds DOOR_LINES_MAX lines with places in them. */
function lineOf(door: DoorState, room: string, now: number): Line | null {
  const held = door.rooms.get(room);
  if (held) return held;
  if (door.rooms.size >= DOOR_LINES_MAX) {
    for (const [key, line] of door.rooms) if (line.places.size === 0 && now - line.at > DOOR_KEEP_MS) door.rooms.delete(key);
  }
  if (door.rooms.size >= DOOR_LINES_MAX) return null;
  const line = newLine();
  door.rooms.set(room, line);
  return line;
}

function issuePass(door: DoorState, room: string, id: string, now: number): DoorReply {
  for (const [word, pass] of door.passes) if (pass.until <= now) door.passes.delete(word);
  const old = door.passOf.get(id);
  if (old) door.passes.delete(old);
  const word = newPassWord();
  const until = now + DOOR_PASS_MS;
  door.passes.set(word, { room, id, until });
  door.passOf.set(id, word);
  for (const [who, held] of door.passOf) if (!door.passes.has(held)) door.passOf.delete(who);
  return { kind: 'pass', pass: word, until };
}

/**
 * One page asking the door for `room`: a pass, a place and a wait, or `open` (no pacing for it). The room's line is
 * asked first; a page it would let in then takes its place in the server-wide line, which may hold it.
 */
export function doorAsk(door: DoorState, room: string, id: string, now: number): DoorReply {
  const line = lineOf(door, room, now);
  if (!line) return { kind: 'open' };
  const serverHold = () => {
    const answer = lineAsk(door.server, id, now, door.serverLaw);
    if (answer.go || 'full' in answer) return null;
    return { position: answer.position, wait: answer.wait };
  };
  const answer = lineAsk(line, id, now, door.roomLaw, serverHold);
  if (answer.go) return issuePass(door, room, id, now);
  if ('full' in answer) return { kind: 'open' };
  return { kind: 'queue', position: answer.position, wait: answer.wait };
}

/** A hello's pass for `room`, spent: true once for a live pass of that room, false after. */
export function doorSpend(door: DoorState, room: string, word: string, now: number): boolean {
  const pass = door.passes.get(word);
  if (!pass || pass.room !== room || pass.until <= now) return false;
  door.passes.delete(word);
  door.passOf.delete(pass.id);
  return true;
}

/** The door's answer to a page, in the account service's sign-in line's shape. */
export function doorResponse(reply: DoorReply): Response {
  if (reply.kind === 'queue') {
    const res = new Response(JSON.stringify({ error: 'queue', position: reply.position, wait: reply.wait }), { status: 503, headers: CORS });
    res.headers.set('retry-after', String(Math.ceil(reply.wait / 1000)));
    return res;
  }
  if (reply.kind === 'pass') return new Response(JSON.stringify({ pass: reply.pass, until: reply.until }), { status: 200, headers: CORS });
  return new Response('{}', { status: 200, headers: CORS });
}

const doors = new WeakMap<object, DoorState>();

/** The door object's own paths, answered for the Room that is the door; null for any other path. */
export async function doorInternal(room: DoorRoom, path: string, request: Request): Promise<Response | null> {
  if (path !== DOOR_INTERNAL_ASK && path !== DOOR_INTERNAL_SPEND) return null;
  let door = doors.get(room);
  if (!door) {
    door = newDoor(room.env);
    doors.set(room, door);
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const key = typeof fields.room === 'string' ? fields.room : '';
  const now = Date.now();
  if (path === DOOR_INTERNAL_SPEND) {
    const word = typeof fields.word === 'string' ? fields.word : '';
    return new Response(JSON.stringify({ spent: doorSpend(door, key, word, now) }));
  }
  const id = typeof fields.id === 'string' ? fields.id : '';
  if (!askable(key) || !DOOR_WORD_RE.test(id)) return doorResponse({ kind: 'open' });
  return doorResponse(doorAsk(door, key, id, now));
}

/** Whether `room` is a key a page may ask the door for. */
const askable = (room: string | null): room is string => room !== null && roomOf(`/room/${room}`) === room && doorPaces(room);

/** A promise that settles to null after `ms`, for a race. */
const lateAfter = (ms: number): Promise<null> => new Promise((resolve) => setTimeout(() => resolve(null), ms));

/** The Worker's route: a page's `GET /door`, asked of the door object. Any failure lets the page in unpaced. */
export async function doorRoute(env: DoorEnv, url: URL): Promise<Response> {
  const room = url.searchParams.get('room');
  const id = url.searchParams.get('id') ?? '';
  if (!askable(room) || !DOOR_WORD_RE.test(id) || !env.ROOMS) return doorResponse({ kind: 'open' });
  try {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(DOOR_OBJECT));
    const asked = stub.fetch(`https://door${DOOR_INTERNAL_ASK}`, { method: 'POST', body: JSON.stringify({ room, id }) });
    const res = await Promise.race([asked, lateAfter(DOOR_ASK_WAIT_MS)]);
    if (!res) return doorResponse({ kind: 'open' });
    const answer = new Response(res.body, { status: res.status, headers: CORS });
    const retry = res.headers.get('retry-after');
    if (retry) answer.headers.set('retry-after', retry);
    return answer;
  } catch {
    return doorResponse({ kind: 'open' });
  }
}

/** A room spending a hello's pass at the door: true when the door spent it, false for any other outcome. */
export async function spendDoorPass(env: DoorEnv | undefined, room: string, word: unknown): Promise<boolean> {
  if (typeof word !== 'string' || !DOOR_WORD_RE.test(word) || !env?.ROOMS) return false;
  try {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(DOOR_OBJECT));
    const asked = stub.fetch(`https://door${DOOR_INTERNAL_SPEND}`, { method: 'POST', body: JSON.stringify({ room, word }) }).then((res) => res.json());
    const answer = await Promise.race([asked, lateAfter(DOOR_SPEND_WAIT_MS)]);
    return typeof answer === 'object' && answer !== null && (answer as { spent?: unknown }).spent === true;
  } catch {
    return false;
  }
}
