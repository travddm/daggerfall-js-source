// THE HELLO'S LAWS: what a build stands on, said in its hello (net/online.js _helloFrame) and read by the relay
// (net/wire.js parseClient) - the ground, the spawn grants, the cell law, the loot, the lease, the staff's boxes and
// (P0 SERVER PROFILE) the server profile's hash. One home for both ends, moved out of the two whole files that held
// them. A door that refuses on one of them is the relay's (server/src/helloDoor.ts).

import {
  GROUND_LAW,
  GROUND_LAW_WIRE_MAX,
  GRANT_HELLO_LAW,
  GRANT_HELLO_LAW_WIRE_MAX,
  CELL_HELLO_LAW,
  CELL_HELLO_LAW_WIRE_MAX,
  LOOT_HELLO_LAW,
  LOOT_HELLO_LAW_WIRE_MAX,
  groundRoom,
  streamsFoes,
  isCellRoom,
  lootRoom,
  isSocialRoom,
} from './wire.js';
import { leaseRoom } from './roomLease.js';
import { PROFILE_HASH_RE } from './profile/profileHash.ts';

/** A hello as it is written or read: its fields by name. */
type Hello = Record<string, unknown>;
/** A hello as the wire handed it, before its laws are read. */
type HelloIn = { gl?: number; gv?: number; cv?: number; ll?: number; ls?: unknown; sm?: unknown; ph?: unknown };

/**
 * Writes onto a hello the laws this build stands on, for the room it says hello to. `ph` is the profile this page
 * installed (systems/online/serverProfile.ts), or null when it installed none.
 */
export function sayHelloLaws(frame: Hello, room: string, ph: string | null): void {
  if (groundRoom(room)) frame.gl = GROUND_LAW; // GROUND-GATE: the ground this build stands on, to a room whose peers stand on it (net/wire.js)
  if (streamsFoes(room)) frame.gv = GRANT_HELLO_LAW; // GRANT-DOOR: the grants this build stands on, to a room whose foes ride (net/wire.js)
  if (isCellRoom(room)) frame.cv = CELL_HELLO_LAW; // COST-2 part two: the cell law this build stands on - a coarse node refuses a cell's hello without it (net/wire.js)
  if (lootRoom(room)) frame.ll = LOOT_HELLO_LAW; // LOOT-DOOR (AUDIT HORIZONTAL B7): the loot this build reads, to a room whose words carry a shared list (net/wire.js)
  if (leaseRoom(room)) frame.ls = 1; // LEASE1: this build hands its hub's lease to the room
  if (isSocialRoom(room)) frame.sm = 1; // STAFF-PANEL5-MESSAGE: this build shows a staff message's box - a hub link without it is "old game, not shown"
  if (ph) frame.ph = ph; // P0 SERVER PROFILE: the rules this page plays by - a relay on others refuses the hello (net/profile/profileHash.ts PROFILE_OTHER_REASON)
}

/** Reads a hello's laws onto the hello the relay keeps: each in its own bound, any other value read as none. */
export function readHelloLaws(m: HelloIn, hello: Hello): void {
  // GROUND-GATE: the ground this build stands on (GROUND_LAW) - any other value read as none, the `w2` law: a ground
  // room's door refuses none while its gate is on, and a later build's number is read as it is
  if (Number.isSafeInteger(m.gl) && m.gl >= 1 && m.gl <= GROUND_LAW_WIRE_MAX) hello.gl = m.gl;
  if (Number.isSafeInteger(m.gv) && m.gv >= 1 && m.gv <= GRANT_HELLO_LAW_WIRE_MAX) hello.gv = m.gv; // GRANT-DOOR: the grants this build stands on - read as GROUND-GATE's `gl` is
  if (Number.isSafeInteger(m.cv) && m.cv >= 1 && m.cv <= CELL_HELLO_LAW_WIRE_MAX) hello.cv = m.cv; // COST-2 part two: the cell law this build stands on - read as GROUND-GATE's `gl` is
  if (Number.isSafeInteger(m.ll) && m.ll >= 1 && m.ll <= LOOT_HELLO_LAW_WIRE_MAX) hello.ll = m.ll; // LOOT-DOOR (AUDIT HORIZONTAL B7): the loot this build reads - read as GROUND-GATE's `gl` is
  if (m.ls === 1) hello.ls = 1; // LEASE1: this build hands its hub's lease to the room (net/roomLease.js) - 1 or nothing, the `w2` law
  if (m.sm === 1) hello.sm = 1; // STAFF-PANEL5-MESSAGE: this build shows a staff message's box (net/staffMessages.js) - 1 or nothing, the `w2` law: a hub socket without it is "old game, not shown"
  if (typeof m.ph === 'string' && PROFILE_HASH_RE.test(m.ph)) hello.ph = m.ph; // P0 SERVER PROFILE: the profile this build installed - any other value read as none, and refused (PROFILE_OTHER_REASON)
}
