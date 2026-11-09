// The hello's doors: a hello is refused, with words then a close, when its build stands on other rules than this
// relay's or on an older ground, grant, loot, lease or cell law. Each door's own test stays a Room method in index.js.

import {
  CLOSE_POLICY,
  GROUND_OLD_REASON,
  GRANT_OLD_REASON,
  LOOT_OLD_REASON,
  CELL_OLD_REASON,
} from '../../src/net/wire.js';
import { LEASE_OLD_REASON } from '../../src/net/roomLease.js';
import { PROFILE_OTHER_REASON } from '../../src/net/profile/profileHash.ts';
import { cellDoorShut } from './cellMoves.js';
import { relayProfileHash } from './relayFacts.ts';

/** The words of a hello refused for its build: older than the world online. */
export const GROUND_OLD_WORDS =
  'This copy of the game is older than the world online. Update it to play online: reload the page, or download the latest desktop release.';
/** The words of a hello refused for its profile hash (PROFILE_OTHER_REASON). */
export const PROFILE_OTHER_WORDS = 'This server plays by different rules from your game. Reload the page.';

type Hello = { ph?: unknown };
/** The Room's half: each door's own test of a hello, and the refusal. */
type DoorRoom = {
  _groundRefusal(key: string, m: Hello, now: number): Promise<boolean>;
  _grantDoorRefusal(key: string, m: Hello, now: number): Promise<boolean>;
  _lootDoorRefusal(key: string, m: Hello, now: number): Promise<boolean>;
  _leaseDoorRefusal(key: string, m: Hello, now: number): Promise<boolean>;
  _refuse(ws: unknown, words: string, code: number, reason: string): void;
};

/** Refuses the hello at the first door it fails and answers whether it did. The profile door has no switch: the fork
 *  has no older build to let in. */
export async function helloDoorRefused(
  room: DoorRoom,
  ws: unknown,
  key: string,
  m: Hello,
  now: number,
): Promise<boolean> {
  if (m.ph !== (await relayProfileHash())) {
    room._refuse(ws, PROFILE_OTHER_WORDS, CLOSE_POLICY, PROFILE_OTHER_REASON);
    return true;
  }
  if (await room._groundRefusal(key, m, now)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, GROUND_OLD_REASON);
    return true;
  }
  if (await room._grantDoorRefusal(key, m, now)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, GRANT_OLD_REASON);
    return true;
  }
  if (await room._lootDoorRefusal(key, m, now)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, LOOT_OLD_REASON);
    return true;
  }
  if (await room._leaseDoorRefusal(key, m, now)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, LEASE_OLD_REASON);
    return true;
  }
  // A coarse node's door: a build that names no `of` would be replaced by its own halo (cellMoves.js).
  if (cellDoorShut(room, ws, m)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, CELL_OLD_REASON);
    return true;
  }
  return false;
}
