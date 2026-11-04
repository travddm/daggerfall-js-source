// THE HELLO'S DOORS: a hello is refused before anything is written when its build stands on other rules than this
// relay's (P0 SERVER PROFILE), an older ground (GROUND-GATE), no spawn grant (GRANT-DOOR), less loot (LOOT-DOOR), no
// hub lease (LEASE1) or no cell law at a coarse node (COST-2). The words every build shows, then the close. Moved out
// of server/src/index.js; each door's own test of the hello stays a Room method there.

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
/** P0 SERVER PROFILE: the words of a hello refused for its profile hash (PROFILE_OTHER_REASON). */
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

/**
 * Is this hello refused at a door? The profile first: a build on other rules, or one that names none, is refused in
 * every room. No setting holds that door open (GROUND-GATE's `groundGate` waits for the site's build; the fork has no
 * older build to wait for). Answers whether the hello was refused.
 */
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
  // LOOT-DOOR (AUDIT HORIZONTAL B7): a build that reads less loot while the door is on
  if (await room._lootDoorRefusal(key, m, now)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, LOOT_OLD_REASON);
    return true;
  }
  // LEASE1: a build that hands on no lease while the door is on
  if (await room._leaseDoorRefusal(key, m, now)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, LEASE_OLD_REASON);
    return true;
  }
  // COST-2 part two (cellMoves.js): a coarse node's door - a build that names no `of` would be replaced by its own halo
  if (cellDoorShut(room, ws, m)) {
    room._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, CELL_OLD_REASON);
    return true;
  }
  return false;
}
